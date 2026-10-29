/**
 * Firmware update helper.
 *
 * The RP2040 has a ROM bootloader that mounts itself as a USB mass-storage
 * device named RPI-RP2. Updating is therefore: put the board in BOOTSEL, copy a
 * .uf2 file onto that drive, and the board reboots itself into the new firmware.
 * No flashing tool, no drivers, no sudo — which is why this is the whole
 * implementation rather than a wrapper around something heavier.
 *
 * Before copying, the .uf2 header is validated: a truncated download or a file
 * built for the wrong family would otherwise be copied and leave the board
 * sitting in the bootloader with nothing to show for it.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { logLine, ok, fail } = require('./util.cjs');

const UF2_MAGIC0 = 0x0a324655; // "UF2\n"
const UF2_MAGIC1 = 0x9e5d5157;
const UF2_MAGIC_END = 0x0ab16958;
const UF2_FLAG_FAMILY = 0x00002000;
const RP2040_FAMILY = 0xe48bff56;
const RP2350_ARM_FAMILY = 0xe48bff59;
const BLOCK_SIZE = 512;
const PAYLOAD_PER_BLOCK = 256;
const FLASH_BASE = 0x10000000;
const IMAGE_LIMIT = 0x1e0000; // keep clear of OLED frames and the config sectors
const SRAM_START = 0x20000000;
const SRAM_END = 0x20042000; // RP2040: 264 KiB
const VECTOR_OFFSET = 0x100; // the 256-byte boot2 precedes the ARM vector table

/* ------------------------------------------------------- uf2 inspection */

/**
 * Read a .uf2 header and say whether it is usable.
 *
 * Returns enough detail for the UI to explain a refusal precisely: "built for a
 * different family" and "the download was cut short" need different advice, and
 * both look identical if all you report is "invalid file".
 */
function inspectUf2(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (e) {
    return fail(`That file could not be read: ${e.message}`);
  }
  if (buf.length < BLOCK_SIZE) {
    return fail(`That file is only ${buf.length} bytes. A .uf2 is at least 512, so this is not one — it may be a truncated download.`);
  }
  if (buf.length % BLOCK_SIZE !== 0) {
    return fail(`That file is ${buf.length} bytes, which is not a whole number of 512-byte blocks. The download was probably cut short — get it again.`);
  }

  const magic0 = buf.readUInt32LE(0);
  const magic1 = buf.readUInt32LE(4);
  if (magic0 !== UF2_MAGIC0 || magic1 !== UF2_MAGIC1) {
    return fail('That file does not have a UF2 header. Make sure you picked the .uf2 and not the .elf or the .bin built alongside it.');
  }

  const flags = buf.readUInt32LE(8);
  const targetAddr = buf.readUInt32LE(12);
  const payloadSize = buf.readUInt32LE(16);
  const seqNo = buf.readUInt32LE(20);
  const blockCount = buf.readUInt32LE(24);
  const familyId = buf.readUInt32LE(28);
  const magicEnd = buf.readUInt32LE(BLOCK_SIZE - 4);

  if (magicEnd !== UF2_MAGIC_END) {
    return fail('The first block of that file does not end with the UF2 trailer. The file is damaged — download it again.');
  }
  if (blockCount === 0 || buf.length / BLOCK_SIZE !== blockCount) {
    return fail(`That file says it holds ${blockCount} block(s) but contains ${buf.length / BLOCK_SIZE}. It is incomplete or damaged.`);
  }
  if (payloadSize !== PAYLOAD_PER_BLOCK) {
    return fail(`That file claims a ${payloadSize}-byte payload per block; this pad requires ${PAYLOAD_PER_BLOCK}-byte RP2040 flash blocks.`);
  }
  if (seqNo !== 0 || targetAddr !== FLASH_BASE) {
    return fail('The image must start at RP2040 flash address 0x10000000 with block zero and a boot2 loader.');
  }
  if (!(flags & UF2_FLAG_FAMILY)) {
    return fail('That UF2 has no family id, so the bootloader cannot tell which chip it is for. Rebuild it with the family id enabled.');
  }

  const known = {
    [RP2040_FAMILY]: 'RP2040',
    [RP2350_ARM_FAMILY]: 'RP2350 (ARM)',
    0xe48bff5a: 'RP2350 (RISC-V)',
  };
  const familyName = known[familyId] || null;
  if (!familyName) {
    return fail(`That UF2 is for chip family 0x${familyId.toString(16)}, which is not an RP2040 or RP2350. It would not run on this pad.`);
  }
  if (familyId !== RP2040_FAMILY) {
    return fail(`That UF2 is built for ${familyName}. This pad uses an RP2040, so it needs a file built for RP2040.`);
  }
  if (blockCount < 2 || blockCount * PAYLOAD_PER_BLOCK > IMAGE_LIMIT) {
    return fail('The image is too short to contain boot2 and a vector table, or overlaps the reserved OLED/config flash region.');
  }

  // Verify every block, not just the first: a partially corrupt file passes a
  // header check and then bricks the copy halfway through.
  const totalBytes = buf.length;
  let dataBytes = 0;
  for (let i = 0; i < blockCount; i++) {
    const off = i * BLOCK_SIZE;
    if (buf.readUInt32LE(off) !== UF2_MAGIC0 || buf.readUInt32LE(off + 4) !== UF2_MAGIC1) {
      return fail(`Block ${i + 1} of ${blockCount} has no UF2 header. The file is damaged.`);
    }
    if (buf.readUInt32LE(off + BLOCK_SIZE - 4) !== UF2_MAGIC_END) {
      return fail(`Block ${i + 1} of ${blockCount} has no UF2 trailer. The file is damaged.`);
    }
    if (buf.readUInt32LE(off + 20) !== i) {
      return fail(`Block ${i + 1} says it is block ${buf.readUInt32LE(off + 20) + 1}. The file was assembled incorrectly.`);
    }
    if (buf.readUInt32LE(off + 24) !== blockCount) {
      return fail(`Block ${i + 1} says the file holds ${buf.readUInt32LE(off + 24)} blocks; the first said ${blockCount}. The file is inconsistent.`);
    }
    if (buf.readUInt32LE(off + 8) !== flags || buf.readUInt32LE(off + 28) !== RP2040_FAMILY) {
      return fail(`Block ${i + 1} has inconsistent UF2 flags or chip family.`);
    }
    if (buf.readUInt32LE(off + 16) !== PAYLOAD_PER_BLOCK ||
        buf.readUInt32LE(off + 12) !== FLASH_BASE + i * PAYLOAD_PER_BLOCK) {
      return fail(`Block ${i + 1} has an unexpected flash address or payload size; the image must be contiguous.`);
    }
    dataBytes += PAYLOAD_PER_BLOCK;
  }

  // RP2040 executes boot2 from the first 256 bytes, then takes its initial SP
  // and Thumb reset handler from the vectors at XIP + 0x100. A banner wrapped
  // in valid UF2 blocks used to pass this inspector and leave pads unbootable.
  const boot2 = buf.subarray(32, 32 + PAYLOAD_PER_BLOCK);
  const vectorBlock = BLOCK_SIZE + 32;
  const stack = buf.readUInt32LE(vectorBlock);
  const reset = buf.readUInt32LE(vectorBlock + 4);
  if (!boot2.subarray(0, PAYLOAD_PER_BLOCK - 4).some((byte) => byte !== 0 && byte !== 0xff) ||
      stack <= SRAM_START || stack > SRAM_END || (stack & 3) !== 0 ||
      (reset & 1) === 0 || (reset & ~1) < FLASH_BASE + VECTOR_OFFSET ||
      (reset & ~1) >= FLASH_BASE + dataBytes) {
    return fail('The RP2040 boot2/vector table is missing or invalid. Do not flash this file; rebuild a real firmware UF2.');
  }

  const version = guessVersion(filePath, buf);
  return ok({
    blockCount,
    firmwareBytes: dataBytes,
    fileBytes: totalBytes,
    family: familyName,
    targetAddress: `0x${targetAddr.toString(16)}`,
    firstSeq: seqNo,
    version,
  });
}

/** Firmware version, if the file name or a banner inside it carries one. */
function guessVersion(filePath, buf) {
  const fromName = /(\d+\.\d+(?:\.\d+)?)/.exec(path.basename(filePath));
  if (fromName) return fromName[1];
  // The firmware embeds "KADOWAZ x.y.z" in its rodata, which lands verbatim in
  // the UF2 payload. Scanning is cheap and gives the real version rather than a
  // guess from a file name someone may have renamed.
  const text = buf.toString('latin1');
  const banner = /KADOWAZ[^\x00]{0,4}?(\d+\.\d+(?:\.\d+)?)/.exec(text);
  if (banner) return banner[1];
  return null;
}

/* ------------------------------------------------------- drive detection */

const CANDIDATE_ROOTS = process.platform === 'win32'
  ? Array.from({ length: 24 }, (_, i) => `${String.fromCharCode(65 + i)}:\\`)
  : ['/Volumes/', '/media/', '/run/media/'];

/**
 * Find the mounted RPI-RP2 drive.
 *
 * Identified by the INFO_UF2.TXT file the ROM bootloader writes, not by drive
 * letter — letters move, and a user with a USB stick plugged in would otherwise
 * get firmware copied onto the wrong disk.
 */
function findBootloaderDrive() {
  const roots = [];
  if (process.platform === 'win32') {
    roots.push(...CANDIDATE_ROOTS.filter((r) => { try { return fs.existsSync(r); } catch { return false; } }));
  } else {
    for (const base of CANDIDATE_ROOTS) {
      try {
        for (const entry of fs.readdirSync(base)) roots.push(path.join(base, entry));
      } catch { /* not present */ }
    }
  }

  for (const root of roots) {
    try {
      const info = path.join(root, 'INFO_UF2.TXT');
      if (!fs.existsSync(info)) continue;
      const text = fs.readFileSync(info, 'utf8');
      if (!/UF2|RP2/i.test(text)) continue;
      return ok({ path: root, info: text.trim().slice(0, 200) });
    } catch {
      // A drive that cannot be read is not the bootloader; keep looking rather
      // than reporting a failure the user cannot act on.
      continue;
    }
  }
  return fail('The pad is not in bootloader mode. Hold the BOOT button while plugging in the USB cable — on the RP2040-Zero that is the small button next to the USB connector — and Windows will mount a drive called RPI-RP2.');
}

/* ------------------------------------------------------------- flashing */

/**
 * Copy a .uf2 to the bootloader drive.
 *
 * The write is followed by a wait for the drive to disappear, which is how the
 * ROM signals "I accepted it and rebooted". Without that check the UI would
 * report success even when the copy silently failed.
 */
async function flash(uf2Path, onProgress) {
  const inspected = inspectUf2(uf2Path);
  if (!inspected.ok) return inspected;

  const drive = findBootloaderDrive();
  if (!drive.ok) return drive;

  const dest = path.join(drive.value.path, path.basename(uf2Path));
  let buf;
  try {
    buf = fs.readFileSync(uf2Path);
  } catch (e) {
    return fail(`That file could not be read: ${e.message}`);
  }

  logLine('firmware', `flashing ${uf2Path}`, `${inspected.value.blockCount} blocks to ${drive.value.path}`);
  if (onProgress) onProgress({ stage: 'copying', percent: 0 });

  try {
    // Written in whole blocks with an fsync at the end: the ROM reads the file as
    // it is written, and a partial block would be treated as the end of the
    // image.
    const fd = fs.openSync(dest, 'w');
    try {
      let written = 0;
      for (let off = 0; off < buf.length; off += BLOCK_SIZE) {
        const slice = buf.slice(off, off + BLOCK_SIZE);
        fs.writeSync(fd, slice, 0, slice.length);
        written += slice.length;
        if (onProgress) {
          onProgress({
            stage: 'copying',
            percent: Math.round((written / buf.length) * 100),
          });
        }
      }
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    // The drive vanishing mid-write is the SUCCESS case: the board reboots the
    // instant it has enough of the image, taking the volume with it.
    if (/EBUSY|ENODEV|ENOENT|EPERM|EIO|EBADF/i.test(String(e.code || e.message))) {
      logLine('firmware', 'drive vanished during copy — that is the reboot', String(e.code || e.message));
      if (onProgress) onProgress({ stage: 'rebooting', percent: 100 });
      return ok({ flashed: true, ...inspected.value, note: 'The pad rebooted while the file was still being copied, which is the normal way this ends.' });
    }
    return fail(`Copying to the pad failed: ${e.message}`);
  }

  if (onProgress) onProgress({ stage: 'rebooting', percent: 100 });

  // Confirm the board left bootloader mode.
  for (let i = 0; i < 20; i++) {
    await sleep(300);
    const still = findBootloaderDrive();
    if (!still.ok) {
      logLine('firmware', 'bootloader drive gone — flash complete');
      return ok({ flashed: true, ...inspected.value });
    }
  }
  return fail('The file was copied, but the pad did not reboot out of bootloader mode within 6 seconds. Unplug it and plug it back in, then check the version in Diagnostics.');
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** BOOTSEL drive status shown by the inline firmware sidebar. */
function status() {
  const drive = findBootloaderDrive();
  return {
    inBootloader: drive.ok,
    drivePath: drive.ok ? drive.value.path : null,
    driveInfo: drive.ok ? drive.value.info : null,
  };
}

const BUILTIN_FIRMWARE_CANDIDATES = [
  path.join(__dirname, '..', '..', 'firmware', 'kadowaz_deck_rp2040_v1.0.0.uf2'),
  path.join(__dirname, '..', 'firmware', 'kadowaz_deck_rp2040_v1.0.0.uf2'),
  path.join(process.resourcesPath || '', 'firmware', 'kadowaz_deck_rp2040_v1.0.0.uf2'),
];

function getBuiltinFirmware() {
  for (const candidate of BUILTIN_FIRMWARE_CANDIDATES) {
    if (fs.existsSync(candidate)) {
      const inspected = inspectUf2(candidate);
      if (inspected.ok) {
        return {
          available: true,
          filePath: candidate,
          fileName: path.basename(candidate),
          version: '1.0.0',
          inspection: inspected,
        };
      }
    }
  }
  return { available: false, error: 'Built-in firmware binary not found' };
}

module.exports = {
  inspectUf2, findBootloaderDrive, flash, status, guessVersion, getBuiltinFirmware,
  RP2040_FAMILY, BLOCK_SIZE, PAYLOAD_PER_BLOCK,
};

