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
  assert.strictEqual(pkg.engines.node, '>=22.12.0');
  assert.match(fs.readFileSync(path.join(__dirname, '../README.md'), 'utf8'), /Node\.js 22\.12 or newer/);
  assert.ok(pkg.build, 'package.json must define a "build" configuration block');
  assert.strictEqual(pkg.build.appId, 'studio.kadowaz.deck');
  assert.strictEqual(pkg.build.productName, 'ZERO Deck Studio');
  assert.strictEqual(pkg.build.win.artifactName, 'ZERO-Deck-Studio-${version}-${arch}.${ext}');
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
  assert.ok(pkg.build.extraResources.some((r) => r.from === 'electron/firmware' && r.to === 'firmware'),
    'built-in firmware directory must be copied outside ASAR');
  assert.ok(fs.existsSync(path.join(__dirname, '../electron/firmware/README.md')));


  // Verify asset files exist on disk
  const audioCsPath = path.join(__dirname, '../electron/native/audio.cs');
  assert.ok(fs.existsSync(audioCsPath), 'electron/native/audio.cs must exist on disk');

  assert.strictEqual(pkg.build.win.icon, 'electron/assets/zero.ico');
  assert.ok(fs.existsSync(path.join(__dirname, '..', pkg.build.win.icon)), 'Windows icon must exist');
  const iconPath = path.join(__dirname, '../electron/assets/zero.png');
  assert.ok(fs.existsSync(iconPath), 'Application icon PNG must exist on disk');
  const ico = fs.readFileSync(path.join(__dirname, '..', pkg.build.win.icon));
  assert.equal(ico.readUInt16LE(2), 1, 'ICO image type');
  const entries = ico.readUInt16LE(4);
  assert(entries >= 6, 'Windows icon includes sizes for desktop, taskbar and installer');
  const sizes = Array.from({ length: entries }, (_, i) => ico[6 + 16 * i] || 256);
  for (const size of [16, 32, 48, 256]) assert(sizes.includes(size), `icon contains ${size}px`);
  const svg = fs.readFileSync(path.join(__dirname, '../electron/assets/zero.svg'), 'utf8');
  assert.match(svg, /M60 45h136/, 'source icon has the ZERO Z mark');
  const main = fs.readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8');
  const splash = fs.readFileSync(path.join(__dirname, '../electron/splash.html'), 'utf8');
  assert.match(main, /assets\/zero\.png/); assert.match(splash, /assets\/zero\.png/);
  assert.match(splash, /<strong>ZERO<\/strong>/);
  assert.match(main, /title: 'ZERO Deck Studio'/);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const navbar = fs.readFileSync(path.join(__dirname, '../src/components/TopNavbar.tsx'), 'utf8');
  assert.match(html, /<title>ZERO Deck Studio<\/title>/);
  assert.match(html, /id="startup-name">ZERO/);
  assert.match(navbar, /ZERO<span/);
  assert(!/KADOWAZ|Kadowaz/.test(splash + navbar), 'visible brand is ZERO');
  console.log('✓ All referenced packaging assets and icons verified on disk');

  // Verify packaging scripts
  assert.ok(pkg.scripts['build:electron'], 'package.json must define build:electron script');
  assert.ok(pkg.scripts['dist:win'], 'package.json must define dist:win script');
  assert.ok(pkg.scripts['pack'], 'package.json must define pack script');
  console.log('✓ Packaging scripts (build:electron, dist:win, pack) present in package.json');

  console.log('Packaging & electron-builder Config: ALL TESTS PASSED!\n');
}

runTests();

