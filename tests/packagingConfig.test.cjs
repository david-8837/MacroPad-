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
  assert(fs.existsSync(path.join(__dirname, '../electron/resetData.cjs')), 'native reset helper is present');
  assert.match(fs.readFileSync(path.join(__dirname, '../scripts/build-electron.mjs'), 'utf8'), /resetData\.cjs/, 'native reset is included in asset verification');
  assert.match(main, /assets\/zero\.png/); assert.match(splash, /assets\/zero\.png/);
  assert.match(splash, /<strong>ZERO<\/strong>/);
  assert.match(main, /title: 'ZERO Deck Studio'/);
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const navbar = fs.readFileSync(path.join(__dirname, '../src/components/TopNavbar.tsx'), 'utf8');
  assert.match(html, /<title>ZERO Deck Studio<\/title>/);
  assert.match(html, /id="startup-name">ZERO/);
  assert.match(navbar, /ZERO<span/);
  assert(!/KADOWAZ|Kadowaz/.test(splash + navbar), 'visible brand is ZERO');
  // Windows NSIS MUI requires uncompressed 24-bit BMPs at these exact sizes.
  const nsis = pkg.build.nsis;
  assert.equal(nsis.oneClick, false, 'keep the guided installer');
  assert.equal(nsis.allowToChangeInstallationDirectory, true);
  assert.equal(nsis.createDesktopShortcut, true);
  assert.equal(nsis.createStartMenuShortcut, true);
  for (const [key, width, height] of [['installerHeader', 150, 57], ['installerSidebar', 164, 314]]) {
    const bmp = fs.readFileSync(path.join(__dirname, '..', nsis[key]));
    assert.equal(bmp.toString('ascii', 0, 2), 'BM', `${key} is a bitmap`);
    assert.equal(bmp.readInt32LE(18), width, `${key} width`);
    assert.equal(bmp.readInt32LE(22), height, `${key} height`);
    assert.equal(bmp.readUInt16LE(28), 24, `${key} bit depth`);
    assert.equal(bmp.readUInt32LE(30), 0, `${key} must be uncompressed`);
  }
  const setupIcon = fs.readFileSync(path.join(__dirname, '..', nsis.installerIcon));
  assert.equal(setupIcon.readUInt16LE(2), 1, 'setup icon is an ICO');
  const iconCount = setupIcon.readUInt16LE(4);
  const iconSizes = Array.from({length:iconCount}, (_, i) => setupIcon[6 + 16 * i] || 256);
  for (const size of [16, 32, 48, 256]) assert(iconSizes.includes(size), `setup icon contains ${size}px`);
  assert.equal(nsis.uninstallerIcon, pkg.build.win.icon, 'uninstaller keeps the app mark');
  const include = fs.readFileSync(path.join(__dirname, '..', nsis.include), 'utf8');
  assert.match(include, /!macro customWelcomePage/);
  assert.match(include, /!insertmacro skipPageIfUpdated/);
  assert.match(include, /!insertmacro MUI_PAGE_WELCOME/);
  assert.match(include, /!macro customPageAfterChangeDir/);
  assert.match(include, /!define MUI_PAGE_CUSTOMFUNCTION_SHOW zeroProgressShow/);
  assert.match(include, /!insertmacro MUI_HEADER_TEXT "Installing ZERO"/);
  assert.match(include, /SendMessage \$0 0x000C 0 "STR:Installing ZERO Deck Studio/);
  assert.match(include, /!define MUI_FINISHPAGE_TITLE "ZERO is installed"/);
  assert.match(include, /!define MUI_FINISHPAGE_RUN_TEXT "Launch ZERO Deck Studio"/);
  assert.doesNotMatch(include, /!macro customFinishPage/, 'keep electron-builder launch and silent behavior');
  console.log('✓ Branded installer assets, guided flow and update behavior configured');
  console.log('✓ All referenced packaging assets and icons verified on disk');

  // Verify packaging scripts
  assert.ok(pkg.scripts['build:electron'], 'package.json must define build:electron script');
  assert.ok(pkg.scripts['dist:win'], 'package.json must define dist:win script');
  assert.ok(pkg.scripts['pack'], 'package.json must define pack script');
  console.log('✓ Packaging scripts (build:electron, dist:win, pack) present in package.json');

  console.log('Packaging & electron-builder Config: ALL TESTS PASSED!\n');
}

runTests();

