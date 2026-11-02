const assert = require('node:assert/strict');
const Module = require('node:module');
const { mkdtempSync, writeFileSync, rmSync, readFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');

// These tests run without Electron or Windows; substitute native icon APIs.
const calls = [];
const icon = value => ({ isEmpty: () => false, toDataURL: () => `data:image/png;base64,${value}` });
const fakeApp = { getFileIcon: async target => { calls.push(target); return icon(target.endsWith('.exe') ? 'exe' : 'shortcut'); } };
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'electron') return { app: fakeApp, nativeImage: { createFromPath: target => icon(`logo:${target}`) } };
  return originalLoad.call(this, request, parent, isMain);
};
const { resolveAppIcon, deduplicateAndFinalize } = require('../electron/appDiscovery.cjs');
Module._load = originalLoad;

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'app-icons-'));
  try {
    const exe = join(dir, 'program.exe'); const shortcut = join(dir, 'program.lnk');
    const ico = join(dir, 'custom.ico'); const logo = join(dir, 'store-logo.png');
    for (const p of [exe, shortcut, ico, logo]) writeFileSync(p, 'fixture');
    const finalized = await deduplicateAndFinalize([{ name: 'Program', exePath: exe, iconPath: shortcut, source: 'startmenu', targetType: 'shortcut' }]);
    assert.equal(finalized[0].iconDataUrl, 'data:image/png;base64,exe');
    assert.deepEqual(calls, [exe], 'the real executable precedes a generic shortcut icon');

    calls.length = 0;
    const fallback = await resolveAppIcon({ exePath: exe, iconPath: shortcut }, {
      exists: () => true,
      app: { getFileIcon: async target => { calls.push(target); if (target === exe) throw Error('not accessible'); return icon('fallback'); } },
      nativeImage: null,
    });
    assert.equal(fallback, 'data:image/png;base64,fallback');
    assert.deepEqual(calls, [exe, shortcut]);
    calls.length = 0;
    await resolveAppIcon({ exePath: exe, iconPath: ico }, { exists: () => true, app: fakeApp, nativeImage: null });
    assert.equal(calls[0], ico, 'explicit shortcut ICO is preferred');
    calls.length = 0;
    assert.equal(await resolveAppIcon({ exePath: 'Store!App', logoPath: logo }), `data:image/png;base64,logo:${logo}`);
    assert.equal(calls.length, 0, 'store logo image is read directly, not as a generic file icon');
    assert.equal(await resolveAppIcon({ exePath: 'not-a-file' }, { exists: () => false, app: fakeApp, nativeImage: null }), '');
    const emptyImage = { isEmpty: () => true };
    assert.equal(await resolveAppIcon({ exePath: exe }, { exists: () => true, app: { getFileIcon: async () => emptyImage }, nativeImage: null }), '');
    const script = readFileSync(resolve('electron/native/packaged-app-icons.ps1'), 'utf8');
    assert(script.includes('Get-AppxPackage') && script.includes('Square44x44Logo'));
    assert(script.includes('StartsWith($root'), 'package logo path stays inside the install directory');
    console.log('appIcons: executable, shortcut fallback, custom ICO and packaged logo passed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
