const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'macro-win-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  global.window = dom.window; global.document = dom.window.document;
  global.navigator = dom.window.navigator; global.localStorage = dom.window.localStorage;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const oldChannel = global.MessageChannel;
  global.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.(), 0) }; } };
  try {
    const entry = join(dir, 'entry.tsx');
    writeFileSync(entry, `import React, {act} from ${JSON.stringify(resolve('node_modules/react/index.js'))};
import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client.js'))};
import {ViaMacroEditor} from ${JSON.stringify(resolve('src/components/via/ViaMacroEditor.tsx'))};
export {act}; export function mount(el) { const root = createRoot(el); root.render(<ViaMacroEditor/>); return root; }`);
    const out = join(dir, 'entry.cjs');
    buildSync({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', nodePaths: [resolve('node_modules')] });
    const { act, mount } = require(out);
    const rootEl = document.getElementById('root'); let root;
    await act(async () => { root = mount(rootEl); });
    const button = text => [...rootEl.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    const click = async text => { const el = button(text); assert(el, `button ${text}`); await act(async () => el.click()); };
    const storage = () => JSON.parse(localStorage.getItem('kadowaz_macros_v2'));
    const capture = rootEl.querySelector('[aria-label="Type the keys you want to log"]');
    const type = async (key, extras = {}) => { capture.focus(); await act(async () => capture.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true, ...extras }))); };

    await click('Add Win key');
    assert.deepEqual(storage()[0].actions[0].keys, ['Win'], 'standalone Win is recorded as one tap');
    assert.equal(button('Win + next key').getAttribute('aria-pressed'), 'false');
    await click('Win + next key');
    assert.equal(button('Win + next key').getAttribute('aria-pressed'), 'true');
    await type('r');
    assert.deepEqual(storage()[0].actions[1].keys, ['Win', 'R'], 'Win+R can be composed without the OS intercepting the physical Win key');
    assert.equal(button('Win + next key').getAttribute('aria-pressed'), 'false', 'modifier applies to one step only');
    await type('x');
    assert.deepEqual(storage()[0].actions[2].keys, ['X'], 'later steps do not inherit Win');
    await click('Win + next key');
    await type('s', { shiftKey: true });
    assert.deepEqual(storage()[0].actions[3].keys, ['Shift', 'Win', 'S'], 'physical and staged modifiers combine');
    await click('Win + next key');
    await type('Escape');
    assert.equal(button('Win + next key').getAttribute('aria-pressed'), 'false', 'escape cancels staged Win');
    await click('Win + next key');
    const slot = [...rootEl.querySelectorAll('button')].find(b => /M1/.test(b.textContent) && b.textContent.includes('Empty slot'));
    assert(slot); await act(async () => slot.click());
    assert.equal(button('Win + next key').getAttribute('aria-pressed'), 'false', 'changing slots clears staged modifier');
    await type('a');
    assert.deepEqual(storage()[1].actions[0].keys, ['A']);
    assert.equal(storage()[0].actions.length, 4, 'other slot stays unchanged');
    // Edit an existing combination instead of appending a new one.
    const originalId = storage()[1].actions[0].id;
    await act(async () => rootEl.querySelector('[aria-label="Edit step 1"]').click());
    assert(rootEl.querySelector('[aria-label="Edit macro step"]'));
    await type('b', { ctrlKey: true });
    assert.equal(storage()[1].actions.length, 1);
    assert.equal(storage()[1].actions[0].id, originalId);
    assert.deepEqual(storage()[1].actions[0].keys, ['Ctrl', 'B']);
    await act(async () => rootEl.querySelector('[aria-label="Edit step 1"]').click());
    await click('Cancel edit');
    assert.deepEqual(storage()[1].actions[0].keys, ['Ctrl', 'B']);

    const setValue = async (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set;
      await act(async () => { setter.call(el, value); el.dispatchEvent(new window.Event('input', { bubbles: true })); });
    };
    await click('Text String');
    const checkbox = rootEl.querySelector('#appendEnterCheck');
    await act(async () => checkbox.click());
    await setValue(rootEl.querySelector('input[placeholder^="e.g. git status"]'), 'hello');
    await click('Insert Text');
    await act(async () => rootEl.querySelector('[aria-label="Edit step 2"]').click());
    await setValue(rootEl.querySelector('#macro-edit-value'), 'updated text');
    await click('Save step');
    assert.equal(storage()[1].actions[1].value, 'updated text');
    await click('Delay (ms)');
    await setValue(rootEl.querySelector('input[type="number"]'), '250');
    await click('Insert Delay');
    await act(async () => rootEl.querySelector('[aria-label="Edit step 3"]').click());
    await setValue(rootEl.querySelector('#macro-edit-value'), '6000');
    await click('Save step');
    assert(rootEl.textContent.includes('10 to 5000'));
    assert.equal(storage()[1].actions[2].delayMs, 250, 'invalid edit must not change stored action');
    await setValue(rootEl.querySelector('#macro-edit-value'), '350');
    await click('Save step');
    assert.equal(storage()[1].actions[2].delayMs, 350);
    await act(async () => root.unmount());
    console.log('macroWinKey: standalone, Win combos, slot isolation and step editing passed');
  } finally {
    global.MessageChannel = oldChannel; dom.window.close(); rmSync(dir, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
