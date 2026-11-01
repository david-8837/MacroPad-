const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { buildSync } = require('esbuild');
const dir = mkdtempSync(join(tmpdir(), 'key-drawer-ui-'));
try {
  const entry = join(dir, 'entry.tsx');
  writeFileSync(entry, `import React from ${JSON.stringify(resolve('node_modules/react/index.js'))};
import { renderToStaticMarkup } from ${JSON.stringify(resolve('node_modules/react-dom/server.node.js'))};
import { KeyConfigDrawer } from ${JSON.stringify(resolve('src/components/KeyConfigDrawer.tsx'))};
export function render(binding, preset) { return renderToStaticMarkup(<KeyConfigDrawer keyBinding={binding} onSave={() => {}} onClose={() => {}} onTestAction={() => {}} captureOnlyWhenFocused={preset} hideCloseButton={preset} />); }`);
  const out = join(dir, 'bundle.cjs');
  buildSync({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', nodePaths: [resolve('node_modules')] });
  const { render } = require(out);
  const key = { keyIndex: 0, label: 'Empty', sublabel: 'Unassigned', iconName: '', tapAction: null, holdAction: null, doubleTapAction: null };
  const assertDrawer = html => {
    for (const text of ['Keyboard &amp; Combos', 'Text Macro', 'Open App', 'Save Changes', 'Virtual Keyboard']) assert(html.includes(text), `missing ${text}`);
    for (const text of ['Recorder', 'Safety Hold', 'Media Hotkeys', '6. Media', 'Long-Press Safety Isolation']) assert(!html.includes(text), `unexpected ${text}`);
  };
  const app = readFileSync(resolve('src/App.tsx'), 'utf8');
  assert(!app.includes("label: 'Legend'"), 'selected switch inspector should not show the legend row');
  assert(app.includes("label: 'Shortcut'") && app.includes("label: 'Category'"));
  assertDrawer(render(key, false));
  const preset = render(key, true); assertDrawer(preset);
  assert(preset.includes('aria-label="Type shortcut"'));
  assert(!preset.includes('title="Close Drawer"'));
  const saved = { ...key, label: 'Volume', tapAction: { id:'media', category:'media', name:'Volume', payload:{mediaAction:'volume_up'} }, isDestructiveSafety: true, safetyConfirmAction: {id:'safe',category:'hotkey',name:'Safe',payload:{keys:['S']}} };
  const before = JSON.stringify(saved); assertDrawer(render(saved, false)); assert.equal(JSON.stringify(saved), before, 'rendering must not change saved assignments');
  console.log('keyDrawerUi: unwanted controls removed, keyboard/text/app remain and saved assignments preserved');
} finally { rmSync(dir, { recursive:true, force:true }); }
