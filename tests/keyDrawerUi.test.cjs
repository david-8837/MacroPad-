const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'key-drawer-ui-'));
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // React's bundled act helper otherwise leaves Node MessagePorts referenced.
  const originalMessageChannel = global.MessageChannel;
  global.MessageChannel = class {
    constructor() {
      this.port1 = { onmessage: null };
      this.port2 = { postMessage: () => setTimeout(() => this.port1.onmessage?.(), 0) };
    }
  };
  try {
    const apps = [
      { id: 'editor', name: 'Code Editor', category: 'development', source: 'startmenu', exePath: 'C:\\Editor.exe', isValid: true, targetType: 'executable', appId: 'editor-id', launchArgs: '--new-window' },
      { id: 'paint', name: 'Paint', category: 'utility', source: 'startmenu', exePath: 'C:\\Paint.exe', isValid: true, targetType: 'executable' },
    ];
    localStorage.setItem('kadowaz_app_library', JSON.stringify(apps));
    const entry = join(dir, 'entry.tsx');
    writeFileSync(entry, `import React, { act } from ${JSON.stringify(resolve('node_modules/react/index.js'))};
import { renderToStaticMarkup } from ${JSON.stringify(resolve('node_modules/react-dom/server.node.js'))};
import { createRoot } from ${JSON.stringify(resolve('node_modules/react-dom/client.js'))};
import { KeyConfigDrawer } from ${JSON.stringify(resolve('src/components/KeyConfigDrawer.tsx'))};
export function render(binding, preset) { return renderToStaticMarkup(<KeyConfigDrawer keyBinding={binding} onSave={() => {}} onClose={() => {}} onTestAction={() => {}} captureOnlyWhenFocused={preset} hideCloseButton={preset} />); }
export { act };
export function create(container) { const root = createRoot(container); return { render: (binding, callbacks, preset = false) => root.render(<KeyConfigDrawer key={binding.keyIndex} keyBinding={binding} totalKeys={9} onSelectKeyIndex={callbacks.select} onSave={callbacks.save} onClose={callbacks.close} onTestAction={callbacks.test} captureOnlyWhenFocused={preset} hideCloseButton={preset} />), unmount: () => root.unmount() }; }`);
    const out = join(dir, 'bundle.cjs');
    buildSync({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', nodePaths: [resolve('node_modules')] });
    const { render, create, act } = require(out);
    const key = { keyIndex: 0, label: 'Empty', sublabel: 'Unassigned', iconName: '', tapAction: null, holdAction: null, doubleTapAction: null };
    const assertDrawer = html => {
      for (const text of ['Keyboard &amp; Combos', 'Text Macro', 'Open App', 'Assign', 'Virtual Keyboard']) assert(html.includes(text), `missing ${text}`);
      for (const text of ['Save Changes', 'Recorder', 'Safety Hold', 'Media Hotkeys', '6. Media', 'Long-Press Safety Isolation']) assert(!html.includes(text), `unexpected ${text}`);
    };
    const appSource = readFileSync(resolve('src/App.tsx'), 'utf8');
    assert(!appSource.includes("label: 'Legend'"));
    assert(appSource.includes("label: 'Shortcut'") && appSource.includes("label: 'Category'"));
    assert(appSource.includes('key={`${activeLayerId}-${editingKeyBinding.keyIndex}`}'), 'switching layers or keys resets the selection');
    const css = readFileSync(resolve('src/index.css'), 'utf8');
    assert(!/zoom\s*:\s*0\.9/.test(css), 'the app must fill the viewport instead of shrinking it');
    assertDrawer(render(key, false));
    const preset = render(key, true); assertDrawer(preset);
    assert(preset.includes('aria-label="Type shortcut"'));
    assert(!preset.includes('title="Close Drawer"'));
    const saved = { ...key, label: 'Volume', tapAction: { id:'media', category:'media', name:'Volume', payload:{mediaAction:'volume_up'} }, isDestructiveSafety: true, safetyConfirmAction: {id:'safe',category:'hotkey',name:'Safe',payload:{keys:['S']}} };
    const before = JSON.stringify(saved); assertDrawer(render(saved, false)); assert.equal(JSON.stringify(saved), before);

    const container = document.getElementById('root');
    const ui = create(container);
    const savedBindings = []; const testedActions = []; let closes = 0;
    const callbacks = { save: value => savedBindings.push(value), close: () => closes++, test: value => testedActions.push(value), select: () => {} };
    const button = text => [...container.querySelectorAll('button')].find(b => b.textContent.trim() === text);
    const click = async element => { assert(element, 'button exists'); await act(async () => element.click()); };
    const setValue = async (element, value) => {
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set;
      await act(async () => { setter.call(element, value); element.dispatchEvent(new window.Event('input', { bubbles: true })); });
    };
    await act(async () => ui.render(key, callbacks));
    assert(button('Assign').disabled, 'empty keyboard cannot be assigned');
    await click(button('3. Open App'));
    assert(button('Assign').disabled, 'app selection required');
    await click([...container.querySelectorAll('button')].find(b => b.textContent.includes('Code Editor') && b.hasAttribute('aria-pressed')));
    assert(!button('Assign').disabled, 'selecting an app enables the footer');
    assert.equal(savedBindings.length, 0, 'selection alone does not assign');
    assert(container.textContent.includes('Selected: Code Editor'));
    assert(!container.textContent.includes('Assign to Switch #1'), 'no second assign button in the scroll area');
    await click(container.querySelector('[aria-label="Clear selected application"]'));
    assert(button('Assign').disabled, 'clearing the selection disables assignment again');
    await click([...container.querySelectorAll('button')].find(b => b.textContent.includes('Code Editor') && b.hasAttribute('aria-pressed')));
    const options = container.querySelector('details'); options.open = true;
    await setValue(container.querySelector('input[placeholder="e.g. --new-window"]'), '--safe');
    await click(button('Test selected app'));
    assert.equal(testedActions[0].payload.launchArgs, '--safe');
    await click(button('Assign'));
    assert.equal(savedBindings.at(-1).tapAction.category, 'app_launch');
    assert.equal(savedBindings.at(-1).tapAction.payload.exePath, 'C:\\Editor.exe');
    assert.equal(savedBindings.at(-1).tapAction.payload.launchArgs, '--safe');
    assert.equal(savedBindings.at(-1).keyIndex, 0);
    assert.equal(closes, 1);

    // A new key must not inherit a selection or launch options from the old one.
    await act(async () => ui.render({ ...key, keyIndex: 1 }, callbacks));
    await click(button('3. Open App'));
    assert(button('Assign').disabled);
    await click([...container.querySelectorAll('button')].find(b => b.textContent.includes('Paint') && b.hasAttribute('aria-pressed')));
    await click(button('Assign'));
    assert.equal(savedBindings.at(-1).keyIndex, 1);
    assert.equal(savedBindings.at(-1).tapAction.payload.exePath, 'C:\\Paint.exe');
    assert.equal(savedBindings.at(-1).tapAction.payload.launchArgs, '');

    window.electronAPI = { browseForApp: async () => ({ id: 'browsed', name: 'Custom App', category: 'utility', source: 'manual', exePath: 'C:\\Custom.exe', targetType: 'executable' }) };
    await act(async () => ui.render({ ...key, keyIndex: 4 }, callbacks));
    await click(button('3. Open App'));
    await click(button('Browse .exe'));
    assert(!button('Assign').disabled, 'browsing for an app selects it');
    await click(button('Assign'));
    assert.equal(savedBindings.at(-1).tapAction.payload.appName, 'Custom App');
    delete window.electronAPI;

    await act(async () => ui.render({ ...key, keyIndex: 2 }, callbacks));
    await click(button('2. Text Macro'));
    assert(button('Assign').disabled);
    await setValue(container.querySelector('textarea'), 'hello');
    assert(!button('Assign').disabled);
    await click(button('Assign'));
    assert.equal(savedBindings.at(-1).tapAction.payload.command, 'hello');

    await act(async () => ui.render({ ...key, keyIndex: 3 }, callbacks, true));
    assert(button('Assign').disabled);
    assert(button('Done'), 'preset editor can be closed even with no selection');
    await click([...container.querySelectorAll('button')].find(b => b.textContent.includes('Copy') && b.textContent.includes('Ctrl+C')));
    assert(!button('Assign').disabled);
    await click(button('Assign'));
    assert.deepEqual(savedBindings.at(-1).tapAction.payload.keys, ['Ctrl', 'C']);

    // Older saved lists are shown immediately, then refreshed once with icons.
    const custom = { id: 'manual', name: 'Manual App', category: 'utility', source: 'custom', exePath: 'C:\\Manual.exe', iconDataUrl: '', isValid: true, launchArgs: '' };
    localStorage.setItem('kadowaz_app_library', JSON.stringify([...apps, custom]));
    localStorage.removeItem('kadowaz_app_library_icon_version');
    let finishScan; let scans = 0;
    window.electronAPI = { discoverApps: () => { scans++; return new Promise(resolve => { finishScan = resolve; }); } };
    await act(async () => ui.render({ ...key, keyIndex: 5 }, callbacks));
    await click(button('3. Open App'));
    assert.equal(scans, 1, 'an old cache triggers a background icon refresh');
    const appButton = () => [...container.querySelectorAll('button')].find(b => b.textContent.includes('Code Editor') && b.hasAttribute('aria-pressed'));
    await click(appButton());
    assert(!button('Assign').disabled, 'the old list remains usable while scanning');
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
    await act(async () => finishScan([{ ...apps[0], iconDataUrl: pixel }]));
    assert.equal(appButton().querySelector('img').getAttribute('src'), pixel, 'refreshed icon appears in the list');
    await act(async () => appButton().querySelector('img').dispatchEvent(new window.Event('error')));
    assert.equal(appButton().querySelector('img'), null, 'broken image uses the fallback');
    assert(container.textContent.includes('Manual App'), 'manual entries survive refresh');
    await click(button('Assign'));
    assert.equal(savedBindings.at(-1).tapAction.payload.iconDataUrl, pixel, 'selected app receives its refreshed icon');
    assert.equal(localStorage.getItem('kadowaz_app_library_icon_version'), '2');

    // A failed or empty refresh must not replace an existing list with nothing.
    localStorage.removeItem('kadowaz_app_library_icon_version');
    window.electronAPI = { discoverApps: async () => [] };
    await act(async () => ui.render({ ...key, keyIndex: 6 }, callbacks));
    await click(button('3. Open App'));
    assert(container.textContent.includes('Manual App'), 'manual entry survives an empty scan');
    assert(container.textContent.includes('Your saved list was kept'));
    assert.equal(localStorage.getItem('kadowaz_app_library_icon_version'), null, 'failed migration remains retryable');
    delete window.electronAPI;
    await act(async () => ui.unmount());
    console.log('keyDrawerUi: app, text and keyboard assignments, selection gating and key resets passed');
  } finally {
    global.MessageChannel = originalMessageChannel;
    dom.window.close();
    rmSync(dir, { recursive:true, force:true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
