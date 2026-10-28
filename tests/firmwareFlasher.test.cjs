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
  wrongFamilyBuf.writeUInt32LE(0x0ab16958, 508); // magicEnd
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

  // 8. inspectUf2 with valid synthetic RP2040 2-block UF2 image
  const validPath = path.join(tempDir, 'valid-firmware-v2.1.0.uf2');
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
      // Embed version string banner
      validBuf.write('KADOWAZ 2.1.0 (Build 42)', off + 32, 'utf8');
    }
    validBuf.writeUInt32LE(0x0ab16958, off + 508); // magicEnd
  }
  fs.writeFileSync(validPath, validBuf);

  const validRes = firmware.inspectUf2(validPath);
  assert.strictEqual(validRes.ok, true, 'Validation of valid UF2 should succeed');
  assert.strictEqual(validRes.value.blockCount, 2);
  assert.strictEqual(validRes.value.firmwareBytes, 512);
  assert.strictEqual(validRes.value.fileBytes, 1024);
  assert.strictEqual(validRes.value.family, 'RP2040');
  assert.strictEqual(validRes.value.version, '2.1.0');
  assert.strictEqual(validRes.value.targetAddress, '0x10000000');
  console.log('✓ inspectUf2() successfully validates authentic RP2040 UF2 with version banner');

  // Built-in official firmware check
  const builtin = firmware.getBuiltinFirmware();
  assert.strictEqual(builtin.available, true, 'Official built-in firmware binary should be detected');
  assert.strictEqual(builtin.version, '1.0.0', 'Official built-in firmware version should be 1.0.0');
  console.log('✓ getBuiltinFirmware() resolves authentic official v1.0.0 project firmware');

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

