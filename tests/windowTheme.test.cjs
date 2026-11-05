const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { readWindowTheme, saveWindowTheme } = require('../electron/windowTheme.cjs');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-window-theme-'));
try {
  assert.equal(readWindowTheme(dir), 'light');
  assert.equal(saveWindowTheme(dir, 'dark'), true); assert.equal(readWindowTheme(dir), 'dark');
  assert.equal(saveWindowTheme(dir, 'invalid'), false); assert.equal(readWindowTheme(dir), 'dark');
  assert.equal(saveWindowTheme(dir, 'light'), true); assert.equal(readWindowTheme(dir), 'light');
  fs.writeFileSync(path.join(dir, 'zero-window-theme.txt'), 'invalid'); assert.equal(readWindowTheme(dir), 'light');
  const oldWarn = console.warn; console.warn = () => {};
  try { assert.equal(saveWindowTheme(path.join(dir, 'zero-window-theme.txt'), 'dark'), false, 'write failures are reported'); }
  finally { console.warn = oldWarn; }
  assert.equal(fs.readFileSync(path.join(dir, 'zero-window-theme.txt'), 'utf8'), 'invalid', 'failed save never replaces existing data');

  const html = fs.readFileSync('electron/splash.html', 'utf8');
  const themeScript = fs.readFileSync('electron/splash-theme.js', 'utf8');
  for (const [input, expected, color] of [['dark', 'dark', 'rgb(23, 27, 34)'], ['light', 'light', 'rgb(255, 255, 255)'], ['bad', 'light', 'rgb(255, 255, 255)']]) {
    const dom = new JSDOM(html, { url: `file:///splash.html?theme=${input}`, runScripts: 'outside-only' });
    vm.runInContext(themeScript, dom.getInternalVMContext());
    assert.equal(dom.window.document.documentElement.dataset.theme, expected);
    assert.equal(dom.window.getComputedStyle(dom.window.document.body).backgroundColor, color);
    dom.window.close();
  }
  assert.match(html, /<script src="splash-theme\.js"><\/script>[\s\S]*<style>/, 'theme is set before the splash can render');
  console.log('window theme: persisted choice, failures and early splash colors passed');
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
