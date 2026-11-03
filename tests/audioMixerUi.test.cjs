const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'audio-mixer-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const oldChannel = global.MessageChannel;
  global.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.(), 0) }; } };
  let calls = [], finishFirst;
  window.electronAPI = {
    getMasterVolume: async () => ({ ok: true, value: 50 }),
    getMasterMute: async () => ({ ok: true, value: false }),
    getMic: async () => ({ ok: true, value: { level: 70, muted: false } }),
    setMasterVolume: value => { calls.push(['master', value]); return calls.length === 1
      ? new Promise(resolve => { finishFirst = resolve; }) : Promise.resolve({ ok: true, value }); },
    setMic: async opts => { calls.push(['mic', opts]); return { ok: false, error: 'microphone disconnected' }; },
    toggleMasterMute: async () => ({ ok: false, error: 'mute failed' }),
  };
  try {
    const entry = join(dir, 'entry.tsx');
    writeFileSync(entry, `import React, { act } from ${JSON.stringify(resolve('node_modules/react/index.js'))};
import { createRoot } from ${JSON.stringify(resolve('node_modules/react-dom/client.js'))};
import { AudioMixerPanel } from ${JSON.stringify(resolve('src/components/AudioMixerPanel.tsx'))};
export { act }; export function create(container) { const root = createRoot(container); return { render: (active = true) => root.render(<AudioMixerPanel active={active}/>), unmount: () => root.unmount() }; }`);
    const out = join(dir, 'bundle.cjs');
    buildSync({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', nodePaths: [resolve('node_modules')] });
    const { act, create } = require(out); const container = document.getElementById('root'); const ui = create(container);
    await act(async () => ui.render());
    const master = container.querySelector('input[aria-label="Master Output volume"]');
    const mic = container.querySelector('input[aria-label="Microphone volume"]');
    assert(master && mic, 'both sliders have unique accessible names');
    assert.equal(master.value, '50'); assert.equal(mic.value, '70');
    assert.match(master.className, /audio-volume-slider/);
    assert.equal(master.getAttribute('aria-valuetext'), '50%');
    const setRange = async (el, value) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      await act(async () => { setter.call(el, String(value)); el.dispatchEvent(new window.Event('input', { bubbles: true })); el.dispatchEvent(new window.Event('change', { bubbles: true })); });
    };
    await setRange(master, 25);
    assert.deepEqual(calls, [['master', 25]]);
    await setRange(master, 30); await setRange(master, 35);
    assert.deepEqual(calls, [['master', 25]], 'drag positions do not race Windows requests');
    await act(async () => finishFirst({ ok: true, value: 25 }));
    assert.deepEqual(calls, [['master', 25], ['master', 35]], 'latest drag position is applied after the first');
    assert.equal(master.value, '35');
    await setRange(mic, 20);
    assert.equal(mic.value, '70', 'failed change restores the last confirmed value');
    assert.match(container.querySelector('[role="alert"]').textContent, /microphone disconnected/i);
    await act(async () => container.querySelector('button[aria-label="Mute Master Output"]').click());
    assert.match(container.querySelector('[role="alert"]').textContent, /mute failed/i);
    assert(container.querySelector('button[aria-label="Mute Master Output"]'), 'failed mute is not shown as successful');
    await act(async () => ui.render(false));
    window.electronAPI.getMasterVolume = async () => ({ ok: true, value: 80 });
    window.electronAPI.getMic = async () => ({ ok: false, error: 'not connected' });
    await act(async () => ui.render(true));
    assert.equal(master.value, '80', 'reopening reads the latest Windows volume');
    assert(mic.disabled, 'a disconnected microphone is not left enabled');
    await act(async () => ui.render(false));
    let finishRead;
    window.electronAPI.getMasterVolume = () => new Promise(resolve => { finishRead = resolve; });
    await act(async () => ui.render(true));
    await setRange(master, 42);
    await act(async () => finishRead({ ok: true, value: 80 }));
    assert.equal(master.value, '42', 'a stale read cannot overwrite a newer slider change');
    await act(async () => ui.unmount());
    console.log('audioMixerUi: accessible sliders, queued changes, refresh and failed audio feedback passed');
  } finally { global.MessageChannel = oldChannel; dom.window.close(); rmSync(dir, { recursive: true, force: true }); }
})().catch(err => { console.error(err); process.exitCode = 1; });
