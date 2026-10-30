// Check the tester stays an honest OS-event visualizer and retains its controls.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { buildSync } = require('esbuild');
const root = resolve(__dirname, '..');
const dir = mkdtempSync(join(tmpdir(), 'tester-ui-'));
try {
  const entry = join(dir, 'entry.tsx');
  writeFileSync(entry, `import React from 'react';\nimport { renderToStaticMarkup } from 'react-dom/server';\nimport { ViaKeyTester } from '${root}/src/components/via/ViaKeyTester.tsx';\nexport const render = () => renderToStaticMarkup(<ViaKeyTester />);`);
  const out = join(dir, 'bundle.cjs');
  buildSync({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', nodePaths: [resolve('node_modules')] });
  const html = require(out).render();
  for (const text of ['Key tester', 'OS keyboard events', 'Cannot identify', 'Codes observed', 'Fresh keydowns', 'Held in window', 'OS auto-repeat', 'Observed key codes', 'Reset events']) {
    assert(html.toLowerCase().includes(text.toLowerCase()), `missing ${text}`);
  }
  for (const code of ['KeyA', 'ArrowUp', 'Numpad1']) assert(html.includes(`data-code="${code}" data-state="idle"`), `visual key ${code}`);
  assert.match(html, /aria-label="Keyboard layout"/);
  assert.match(html, /aria-label="Sound feedback"/);
  assert.match(html, /tester-keyboard-scroll overflow-x-auto/);
  assert.doesNotMatch(html, /1000Hz|switch bounce|USB latency:|scan rate/i);
  const source = readFileSync(resolve(root, 'src/components/via/ViaKeyTester.tsx'), 'utf8');
  assert.match(source, /clearHeldKeys\(prev\)/);
  assert.match(source, /reduceTesterEvent\(prev, \{ type: 'up'/, 'key release clears state even after focus enters a form');
  assert.match(source, /onSurface && !interactive && !e\.ctrlKey && !e\.altKey && !e\.metaKey && !e\.shiftKey/, 'only unmodified scroll keys on the testing surface are suppressed');
  assert.match(html, /tester-readout/);
  const css = readFileSync(resolve(root, 'src/index.css'), 'utf8');
  assert.match(css, /\.tester-readout \{ height: 128px; overflow-y: auto/);
  assert.doesNotMatch(css, /\.tester-key\[data-state='held'\][^{]*\{[^}]*transform:/, 'pressed keys stay in place');
  console.log('testerUi: accessible layouts, honest event feedback, scrollable key map and reset are present');
} finally { rmSync(dir, { recursive: true, force: true }); }
