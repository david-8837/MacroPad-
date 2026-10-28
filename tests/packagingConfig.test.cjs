/**
 * Unit tests verifying Windows electron-builder packaging configuration and assets.
 */

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

function runTests() {
  console.log('[packaging] Starting Packaging & electron-builder Config Tests...');

  const pkgPath = path.join(__dirname, '../package.json');
  assert.ok(fs.existsSync(pkgPath), 'package.json must exist');

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  assert.ok(pkg.build, 'package.json must define a "build" configuration block');
  assert.strictEqual(pkg.build.appId, 'studio.kadowaz.deck');
  assert.strictEqual(pkg.build.productName, 'KADOWAZ Deck Studio');
  console.log('✓ package.json defines valid build metadata & appId');

  // Verify Windows targets
  assert.ok(pkg.build.win, 'build block must define "win" targets');
  assert.ok(Array.isArray(pkg.build.win.target));
  assert.ok(pkg.build.win.target.includes('nsis'), 'win targets must include nsis installer');
  assert.ok(pkg.build.win.target.includes('portable'), 'win targets must include portable exe');
  console.log('✓ Windows targets configured for NSIS installer and portable executable');

  // Verify native asset inclusion and extraResources
  assert.ok(Array.isArray(pkg.build.extraResources), 'extraResources must be an array');
  const hasAudioCs = pkg.build.extraResources.some(
    (r) => r.from.includes('audio.cs') && r.to.includes('audio.cs')
  );
  assert.ok(hasAudioCs, 'extraResources must copy audio.cs outside ASAR for PowerShell C# compilation');
  console.log('✓ Native C# COM interop asset (audio.cs) configured in extraResources');

  // Verify asset files exist on disk
  const audioCsPath = path.join(__dirname, '../electron/native/audio.cs');
  assert.ok(fs.existsSync(audioCsPath), 'electron/native/audio.cs must exist on disk');

  const iconPath = path.join(__dirname, '../b90a1e3c-36e8-45d6-8fec-2b4e8802a836.png');
  assert.ok(fs.existsSync(iconPath), 'Application icon PNG must exist on disk');
  console.log('✓ All referenced packaging assets and icons verified on disk');

  // Verify packaging scripts
  assert.ok(pkg.scripts['build:electron'], 'package.json must define build:electron script');
  assert.ok(pkg.scripts['dist:win'], 'package.json must define dist:win script');
  assert.ok(pkg.scripts['pack'], 'package.json must define pack script');
  console.log('✓ Packaging scripts (build:electron, dist:win, pack) present in package.json');

  console.log('Packaging & electron-builder Config: ALL TESTS PASSED!\n');
}

runTests();

