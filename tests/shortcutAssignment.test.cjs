const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'shortcut-assignment-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  global.window = dom.window; global.document = dom.window.document; global.navigator = dom.window.navigator;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const originalMessageChannel = global.MessageChannel;
  global.MessageChannel = class { constructor() { this.port1 = { onmessage: null }; this.port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.(), 0) }; } };
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  try {
    const entry = join(dir, 'entry.tsx');
    writeFileSync(entry, `import React, {act, useState} from ${JSON.stringify(resolve('node_modules/react/index.js'))};
import {createRoot} from ${JSON.stringify(resolve('node_modules/react-dom/client.js'))};
import {renderToStaticMarkup} from ${JSON.stringify(resolve('node_modules/react-dom/server.node.js'))};
import {ShortcutsPanel} from ${JSON.stringify(resolve('src/components/ShortcutsPanel.tsx'))};
import {KeyMatrix} from ${JSON.stringify(resolve('src/components/KeyMatrix.tsx'))};
import {assignShortcutToBinding, keyDisplayText} from ${JSON.stringify(resolve('src/utils/shortcutBindings.ts'))};
import {defaultDeck} from ${JSON.stringify(resolve('src/data/defaultDeck.ts'))};
import {PC_SHORTCUTS} from ${JSON.stringify(resolve('src/data/pcShortcuts.ts'))};
export {act, assignShortcutToBinding, keyDisplayText, defaultDeck, PC_SHORTCUTS};
export function renderSavedKey(binding) { return renderToStaticMarkup(<KeyMatrix keys={[binding]} selectedKeyIndex={null} onSelectKey={()=>{}} onTriggerAction={()=>{}} />); }
export function create(container, initial, trigger) {
 const root = createRoot(container);
 function Harness() {
  const [layers,setLayers] = useState(initial.layers);
  return <><ShortcutsPanel layers={layers} activeLayerId={layers[0].id} onAssign={(shortcut, layer, index) => setLayers(current => current.map((item, i) => i !== layer ? item : {...item, keys:item.keys.map(k => k.keyIndex !== index ? k : assignShortcutToBinding(k, shortcut))}))}/>
  {layers.map((layer, index) => <div key={layer.id} id={"keys-layer-" + index}><KeyMatrix keys={layer.keys} selectedKeyIndex={null} onSelectKey={()=>{}} onTriggerAction={trigger}/></div>)}</>;
 }
 return {render: () => root.render(<Harness/>), unmount: () => root.unmount()};
}`);
    const out = join(dir, 'bundle.cjs');
    buildSync({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', nodePaths: [resolve('node_modules')] });
    const { act, assignShortcutToBinding, keyDisplayText, defaultDeck, PC_SHORTCUTS, create, renderSavedKey } = require(out);
    const clipboard = PC_SHORTCUTS.find(s => s.id === 'sys-clipboard');
    const taskManager = PC_SHORTCUTS.find(s => s.id === 'sys-taskmgr');
    const original = structuredClone(defaultDeck.layers[3].keys[0]);
    const assigned = assignShortcutToBinding(original, clipboard);
    assert.equal(assigned.label, 'Clipboard History');
    assert.equal(assigned.sublabel, 'Win + V');
    assert.deepEqual(assigned.tapAction.payload.keys, ['Win', 'V']);
    assert.equal(original.tapAction, null, 'assignment does not mutate previous state');
    const changed = assignShortcutToBinding(assigned, taskManager);
    assert.equal(changed.label, 'Open Task Manager', 'reassignment updates an automatic label');
    assert.equal(changed.sublabel, 'Ctrl + Shift + Esc');
    const custom = { ...original, label: 'My key', iconName: 'Heart', holdAction: { id: 'hold', name: 'Hold', category: 'hotkey', payload: {keys:['A']} } };
    const customAssigned = assignShortcutToBinding(custom, clipboard);
    assert.equal(customAssigned.label, 'My key');
    assert.equal(customAssigned.sublabel, 'Clipboard History');
    assert.equal(customAssigned.iconName, 'Heart');
    assert.deepEqual(customAssigned.holdAction, custom.holdAction);
    for (const [layerIndex, layer] of defaultDeck.layers.entries()) {
      for (const binding of layer.keys) {
        const newBinding = assignShortcutToBinding(binding, clipboard);
        assert.equal(newBinding.label, 'Clipboard History', `new assignment on layer ${layerIndex}, key ${binding.keyIndex + 1}`);
        const saved = JSON.parse(JSON.stringify({ ...binding, tapAction: newBinding.tapAction }));
        assert.equal(keyDisplayText(saved).label, 'Clipboard History', `legacy assignment on layer ${layerIndex}, key ${binding.keyIndex + 1}`);
        assert.match(renderSavedKey(saved), /Clipboard History/);
      }
    }
    const legacy = { ...original, tapAction: assigned.tapAction };
    assert.deepEqual(keyDisplayText(JSON.parse(JSON.stringify(legacy))), { label: 'Clipboard History', sublabel: 'Win + V' }, 'previously saved assignments no longer appear empty');
    assert.match(renderSavedKey(JSON.parse(JSON.stringify(legacy))), /Clipboard History/, 'Home renders the name from an old saved assignment');
    assert(!renderSavedKey(legacy).includes('Empty Slot'));
    assert.equal(legacy.sublabel, 'Empty Slot', 'display fallback leaves saved configuration unchanged');
    assert.equal(keyDisplayText(original).sublabel, 'Empty Slot', 'an actually empty key remains empty');
    assert.deepEqual(keyDisplayText({ ...legacy, label: 'Custom' }), { label: 'Custom', sublabel: 'Clipboard History' });

    const container = document.getElementById('root'); const events = [];
    const ui = create(container, structuredClone(defaultDeck), (...args) => events.push(args));
    const click = async el => { assert(el, 'control exists'); await act(async () => el.click()); };
    const setSelect = async (el, value) => { await act(async () => { el.value = String(value); el.dispatchEvent(new window.Event('change', { bubbles: true })); }); };
    await act(async () => ui.render());
    async function assign(name, index, layer = 3) {
      await click(container.querySelector(`[aria-label="Assign ${name} shortcut"]`));
      const box = container.querySelector('[aria-label="Confirm shortcut assignment"]');
      assert(box, 'assignment confirmation is visible');
      const selects = box.querySelectorAll('select');
      await setSelect(selects[0], layer); await setSelect(selects[1], index);
      await click([...box.querySelectorAll('button')].find(b => b.textContent === 'Confirm assignment'));
    }
    await assign('Clipboard History', 0); await assign('Open Task Manager', 1);
    const keys = container.querySelectorAll('#keys-layer-3 button');
    assert.match(keys[0].textContent, /Clipboard History/);
    assert.match(keys[1].textContent, /Open Task Manager/);
    assert(!keys[0].textContent.includes('Empty Slot'));
    assert.match(keys[1].title, /Ctrl \+ Shift \+ Esc/);
    // The same switch number can have a different shortcut on every layer.
    for (const layer of [0, 1, 2]) {
      await assign(layer === 1 ? 'Open Task Manager' : 'Clipboard History', 0, layer);
      const layerKey = container.querySelector(`#keys-layer-${layer} button`);
      assert.match(layerKey.textContent, layer === 1 ? /Open Task Manager/ : /Clipboard History/);
      assert(!layerKey.textContent.includes('Empty Slot'));
      assert.match(container.querySelector('#keys-layer-3 button').textContent, /Clipboard History/, 'other layers are untouched');
    }
    await act(async () => {
      keys[0].dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true }));
      keys[0].dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 260));
    });
    assert.equal(events[0][1], 'Clipboard History', 'the key still triggers the assigned action');
    await act(async () => ui.unmount());
    console.log('shortcut assignment: all 4 layers and 36 keys, legacy saves, layer isolation and activation passed');
  } finally {
    dom.window.close(); global.MessageChannel = originalMessageChannel;
    delete global.window; delete global.document; delete global.navigator; delete global.IS_REACT_ACT_ENVIRONMENT;
    rmSync(dir, { recursive: true, force: true });
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
