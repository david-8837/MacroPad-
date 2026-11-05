/**
 * Unit tests for RP2040 UF2 Firmware Flasher & Inspector
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const firmware = require('../electron/native/firmware.cjs');

async function runTests() {
  console.log('[firmware] Starting RP2040 Firmware Flasher Tests...');

  // 1. Status verification
  const stat = firmware.status();
  assert.strictEqual(typeof stat.inBootloader, 'boolean', 'status.inBootloader should be a boolean');
  if (stat.inBootloader) {
    assert.ok(typeof stat.drivePath === 'string' && stat.drivePath.length > 0, 'drivePath should be set');
  } else {
    assert.strictEqual(stat.drivePath, null, 'drivePath should be null when not in bootloader');
  }
  console.log('✓ status() returns well-formed bootloader status structure');

  // 2. inspectUf2 with non-existent file
  const nonExistent = firmware.inspectUf2(path.join(__dirname, 'does_not_exist.uf2'));
  assert.strictEqual(nonExistent.ok, false);
  assert.ok(nonExistent.error.includes('could not be read'));
  console.log('✓ inspectUf2() handles non-existent files gracefully');

  // 3. inspectUf2 with truncated file (< 512 bytes)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uf2-test-'));
  const truncatedPath = path.join(tempDir, 'truncated.uf2');
  fs.writeFileSync(truncatedPath, Buffer.from('too short'));
  const truncatedRes = firmware.inspectUf2(truncatedPath);
  assert.strictEqual(truncatedRes.ok, false);
  assert.ok(truncatedRes.error.includes('is only 9 bytes'));
  console.log('✓ inspectUf2() rejects truncated downloads (< 512 bytes)');

  // 4. inspectUf2 with non-multiple-of-512 size
  const nonBlockPath = path.join(tempDir, 'odd-size.uf2');
  fs.writeFileSync(nonBlockPath, Buffer.alloc(600));
  const nonBlockRes = firmware.inspectUf2(nonBlockPath);
  assert.strictEqual(nonBlockRes.ok, false);
  assert.ok(nonBlockRes.error.includes('not a whole number of 512-byte blocks'));
  console.log('✓ inspectUf2() rejects files with invalid block alignment');

  // 5. inspectUf2 with wrong magic header
  const badMagicPath = path.join(tempDir, 'bad-magic.uf2');
  const badMagicBuf = Buffer.alloc(512);
  badMagicBuf.writeUInt32LE(0x12345678, 0); // wrong magic0
  fs.writeFileSync(badMagicPath, badMagicBuf);
  const badMagicRes = firmware.inspectUf2(badMagicPath);
  assert.strictEqual(badMagicRes.ok, false);
  assert.ok(badMagicRes.error.includes('does not have a UF2 header'));
  console.log('✓ inspectUf2() detects missing/invalid UF2 magic header');

  // 6. inspectUf2 with wrong chip family (e.g. 0x12344321 instead of RP2040)
  const wrongFamilyPath = path.join(tempDir, 'wrong-family.uf2');
  const wrongFamilyBuf = Buffer.alloc(512);
  wrongFamilyBuf.writeUInt32LE(0x0a324655, 0); // magic0
  wrongFamilyBuf.writeUInt32LE(0x9e5d5157, 4); // magic1
  wrongFamilyBuf.writeUInt32LE(0x00002000, 8); // flags (has family)
  wrongFamilyBuf.writeUInt32LE(0x10000000, 12); // targetAddr
  wrongFamilyBuf.writeUInt32LE(256, 16); // payloadSize
  wrongFamilyBuf.writeUInt32LE(0, 20); // seqNo
  wrongFamilyBuf.writeUInt32LE(1, 24); // blockCount
  wrongFamilyBuf.writeUInt32LE(0xdeadbeef, 28); // unknown familyId
  wrongFamilyBuf.writeUInt32LE(0x0ab16f30, 508); // magicEnd
  fs.writeFileSync(wrongFamilyPath, wrongFamilyBuf);
  const wrongFamilyRes = firmware.inspectUf2(wrongFamilyPath);
  assert.strictEqual(wrongFamilyRes.ok, false);
  assert.ok(wrongFamilyRes.error.includes('not an RP2040 or RP2350'));
  console.log('✓ inspectUf2() prevents flashing binaries built for incompatible chip families');

  // 7. inspectUf2 with RP2350 family (valid chip family, but warned against RP2040 pad)
  const rp2350Buf = Buffer.from(wrongFamilyBuf);
  rp2350Buf.writeUInt32LE(0xe48bff59, 28); // RP2350 ARM family
  const rp2350Path = path.join(tempDir, 'rp2350.uf2');
  fs.writeFileSync(rp2350Path, rp2350Buf);
  const rp2350Res = firmware.inspectUf2(rp2350Path);
  assert.strictEqual(rp2350Res.ok, false);
  assert.ok(rp2350Res.error.includes('This pad uses an RP2040'));
  console.log('✓ inspectUf2() warns and blocks RP2350 image on RP2040 target');

  // 8. A syntactically valid UF2 is not necessarily bootable. The old checked-in
  //    file was a banner followed by zeros and passed the header-only inspector.
  const validPath = path.join(tempDir, 'structurally-plausible-v2.1.0.uf2');
  const validBuf = Buffer.alloc(1024);
  for (let i = 0; i < 2; i++) {
    const off = i * 512;
    validBuf.writeUInt32LE(0x0a324655, off); // magic0
    validBuf.writeUInt32LE(0x9e5d5157, off + 4); // magic1
    validBuf.writeUInt32LE(0x00002000, off + 8); // flags (has family)
    validBuf.writeUInt32LE(0x10000000 + i * 256, off + 12); // targetAddr
    validBuf.writeUInt32LE(256, off + 16); // payloadSize
    validBuf.writeUInt32LE(i, off + 20); // seqNo
    validBuf.writeUInt32LE(2, off + 24); // blockCount
    validBuf.writeUInt32LE(0xe48bff56, off + 28); // RP2040_FAMILY
    if (i === 0) {
      // A small nonempty boot2-shaped payload. This fixture tests structural
      // validation only; it is not firmware and MUST NOT be flashed.
      validBuf.fill(0xb5, off + 32, off + 32 + 252);
    } else {
      validBuf.writeUInt32LE(0x20042000, off + 32); // initial SP in RP2040 SRAM
      validBuf.writeUInt32LE(0x10000121, off + 36); // Thumb entry inside the image
    }
    validBuf.writeUInt32LE(0x0ab16f30, off + 508); // magicEnd
  }
  fs.writeFileSync(validPath, validBuf);

  const validRes = firmware.inspectUf2(validPath);
  assert.strictEqual(validRes.ok, true, 'Structural validation should succeed');
  assert.strictEqual(validRes.value.blockCount, 2);
  assert.strictEqual(validRes.value.firmwareBytes, 512);
  assert.strictEqual(validRes.value.fileBytes, 1024);
  assert.strictEqual(validRes.value.family, 'RP2040');
  assert.strictEqual(validRes.value.version, '2.1.0');
  assert.strictEqual(validRes.value.targetAddress, '0x10000000');
  console.log('✓ inspectUf2() accepts a structurally plausible RP2040 UF2 (not a hardware boot test)');

  // UF2 specification uses 0x0AB16F30, not the formerly accepted typo.
  const badTrailer = Buffer.from(validBuf);
  badTrailer.writeUInt32LE(0x0ab16958, 508);
  const badTrailerPath = path.join(tempDir, 'bad-trailer.uf2');
  fs.writeFileSync(badTrailerPath, badTrailer);
  assert.match(firmware.inspectUf2(badTrailerPath).error, /trailer/);

  const bannerOnly = Buffer.from(validBuf);
  bannerOnly.fill(0, 32, 32 + 256);
  bannerOnly.write('KADOWAZ 1.0.0 (Official RP2040 Deck Release)', 32);
  bannerOnly.fill(0, 512 + 32, 512 + 32 + 256);
  const bannerPath = path.join(tempDir, 'banner-only.uf2');
  fs.writeFileSync(bannerPath, bannerOnly);
  assert.match(firmware.inspectUf2(bannerPath).error, /boot2\/vector table/);
  assert.match((await firmware.flash(bannerPath)).error, /boot2\/vector table/);
  console.log('✓ banner-and-zero-vectors UF2 is refused before flashing');

  const noncontiguous = Buffer.from(validBuf);
  noncontiguous.writeUInt32LE(0x10001000, 512 + 12);
  fs.writeFileSync(path.join(tempDir, 'gap.uf2'), noncontiguous);
  assert.match(firmware.inspectUf2(path.join(tempDir, 'gap.uf2')).error, /contiguous/);
  console.log('✓ skipped/overlapping flash blocks are refused');

  // Test the catalog in an isolated directory: the fixture is NOT real firmware.
  const catalogDir = path.join(tempDir, 'catalog');
  fs.mkdirSync(catalogDir);
  let choices = firmware.listBuiltinFirmware(catalogDir);
  assert.deepStrictEqual(choices.map((c) => c.id), ['full', 'essential']);
  assert.ok(choices.every((c) => !c.available));
  assert.match((await firmware.flashBuiltinFirmware('full', true, null, catalogDir)).error, /not included/);
  assert.match((await firmware.flashBuiltinFirmware('../other.uf2', true, null, catalogDir)).error, /Unknown/);

  fs.writeFileSync(path.join(catalogDir, 'full-deck.uf2'), validBuf);
  choices = firmware.listBuiltinFirmware(catalogDir);
  assert.strictEqual(choices[0].available, true);
  assert.strictEqual(choices[0].inspection.family, 'RP2040');
  assert.strictEqual(choices[1].available, false, 'other variant remains independent');
  assert.match((await firmware.flashBuiltinFirmware('full', false, null, catalogDir)).error, /untested firmware warning/);
  assert.match((await firmware.flashBuiltinFirmware('full', 'true', null, catalogDir)).error, /untested firmware warning/);
  fs.writeFileSync(path.join(catalogDir, 'keys-and-knob.uf2'), bannerOnly);
  choices = firmware.listBuiltinFirmware(catalogDir);
  assert.strictEqual(choices[1].available, false);
  assert.match(choices[1].error, /invalid/);
  assert.match((await firmware.flashBuiltinFirmware('essential', true, null, catalogDir)).error, /invalid/);
  // Replace an image after listing: flashing must revalidate, not trust the UI.
  fs.writeFileSync(path.join(catalogDir, 'full-deck.uf2'), bannerOnly);
  assert.match((await firmware.flashBuiltinFirmware('full', true, null, catalogDir)).error, /invalid/);
  console.log('✓ catalog keeps variants separate and refuses missing, invalid, changed and unknown images');

  // Simulate BOOTSEL without a physical device. Never touch a real drive: the
  // drive discovery and destination are fully redirected to this temp fixture.
  {
    const original = { existsSync: fs.existsSync, readdirSync: fs.readdirSync, readFileSync: fs.readFileSync, openSync: fs.openSync };
    const roots = process.platform === 'win32' ? ['A:\\', 'B:\\'] : ['/Volumes/FAKE_A', '/Volumes/FAKE_B'];
    const infoFiles = roots.map(root => path.join(root, 'INFO_UF2.TXT'));
    const output = path.join(tempDir, 'simulated-bootloader-write.uf2');
    let count = 1, opened = false, reads = 0;
    try {
      fs.readdirSync = (dir, ...args) => {
        if (['/Volumes/', '/media/', '/run/media/'].includes(String(dir))) return dir === '/Volumes/' ? ['FAKE_A', ...(count > 1 ? ['FAKE_B'] : [])] : [];
        return original.readdirSync(dir, ...args);
      };
      fs.existsSync = candidate => {
        const name = String(candidate);
        if (infoFiles.includes(name)) return !opened && infoFiles.indexOf(name) < count;
        if (process.platform === 'win32' && /^[A-X]:\\$/i.test(name)) return roots.slice(0, count).includes(name);
        return original.existsSync(candidate);
      };
      fs.readFileSync = (candidate, ...args) => {
        const name = String(candidate);
        if (infoFiles.includes(name)) return 'UF2 Bootloader RP2';
        if (name === validPath) { reads++; return reads === 1 ? Buffer.from(validBuf) : Buffer.from(bannerOnly); }
        return original.readFileSync(candidate, ...args);
      };
      fs.openSync = (candidate, flags, ...args) => {
        if (String(candidate) === path.join(roots[0], path.basename(validPath))) { opened = true; return original.openSync(output, flags, ...args); }
        return original.openSync(candidate, flags, ...args);
      };
      count = 2;
      const ambiguous = firmware.status();
      assert.strictEqual(ambiguous.inBootloader, false);
      assert.match(ambiguous.error, /More than one/);
      const refused = await firmware.flash(validPath);
      assert.match(refused.error, /More than one/);
      assert.strictEqual(opened, false, 'ambiguous drives must never be written');
      count = 1; reads = 0;
      const firstTransfer = firmware.flash(validPath);
      const overlapping = await firmware.flash(validPath);
      assert.match(overlapping.error, /already in progress/, 'concurrent transfers are refused');
      const flashed = await firstTransfer;
      assert.strictEqual(flashed.ok, true);
      assert.strictEqual(reads, 1, 'write must use the same validated file snapshot');
      assert.deepStrictEqual(original.readFileSync(output), validBuf, 'only the inspected bytes are written');
      assert.match(flashed.value.note, /does not confirm the firmware booted/);
    } finally {
      Object.assign(fs, original);
    }
    console.log('✓ ambiguous drives are refused and validated bytes are the bytes written');
  }

  // Linux desktop automounters use a per-user directory one level below /media.
  if (process.platform !== 'win32') {
    const original = { readdirSync: fs.readdirSync, existsSync: fs.existsSync, readFileSync: fs.readFileSync };
    const nested = path.join('/run/media', 'fixture-user', 'RPI-RP2');
    try {
      fs.readdirSync = dir => {
        if (String(dir) === '/run/media/') return ['fixture-user'];
        if (String(dir) === '/run/media/fixture-user') return ['RPI-RP2'];
        return [];
      };
      fs.existsSync = p => String(p) === path.join(nested, 'INFO_UF2.TXT');
      fs.readFileSync = () => 'UF2 Bootloader RP2';
      const detected = firmware.findBootloaderDrive();
      assert.equal(detected.ok, true);
      assert.equal(detected.value.path, nested);
    } finally { Object.assign(fs, original); }
    console.log('✓ nested Linux automount drive is detected');
  }

  // The actual bundled image must pass the same standard UF2 validation.
  const bundled = firmware.listBuiltinFirmware();
  assert.strictEqual(bundled[0].available, true);
  assert.strictEqual(bundled[0].untested, true);
  assert.strictEqual(bundled[0].inspection.family, 'RP2040');
  assert.strictEqual(bundled[1].available, true);
  assert.strictEqual(bundled[1].untested, true);
  assert.strictEqual(bundled[1].inspection.family, 'RP2040');
  console.log('✓ both bundled images pass structural inspection and are labelled untested');

  // Clean up
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch { /* ignore */ }

  console.log('RP2040 Firmware Flasher: ALL TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('Firmware Flasher test failed:', err);
  process.exit(1);
});

