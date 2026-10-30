const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { buildSync } = require('esbuild');
const dir = mkdtempSync(join(tmpdir(), 'shortcut-search-'));
try {
  const root = resolve(__dirname, '..');
  const entry = join(dir, 'entry.ts');
  writeFileSync(entry, `export { matchesShortcut } from '${root}/src/utils/shortcutSearch.ts';\nexport { PC_SHORTCUTS } from '${root}/src/data/pcShortcuts.ts';`);
  const out = join(dir, 'bundle.cjs');
  buildSync({ entryPoints: [entry], outfile: out, bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent' });
  const { matchesShortcut, PC_SHORTCUTS } = require(out);
  const taskManager = PC_SHORTCUTS.find(s => s.id === 'sys-taskmgr');
  for (const q of ['', 'task manager', 'CTRL+SHIFT+ESC', ' ctrl + shift + esc ', 'ctrl shift esc', 'system', 'windows system']) {
    assert(matchesShortcut(taskManager, q, 'Windows system'), `match ${q}`);
  }
  assert(!matchesShortcut(taskManager, 'blender', 'Windows system'));
  assert(matchesShortcut(PC_SHORTCUTS.find(s => s.id === 'acc-zoom-in'), 'Win + +'), 'plus key remains searchable');
  assert(matchesShortcut(PC_SHORTCUTS.find(s => s.id === 'blender-render'), 'Blender'));
  assert.equal(new Set(PC_SHORTCUTS.map(s => s.id)).size, PC_SHORTCUTS.length);
  const page = readFileSync(resolve(root, 'src/components/ShortcutsPanel.tsx'), 'utf8');
  assert.match(page, /await navigator\.clipboard\.writeText/);
  assert.match(page, /catch \{[\s\S]*?Could not copy/);
  assert.match(page, /setCopiedId\(shortcut\.id\)/);
  assert.match(page, /aria-pressed=\{selectedCategory === id\}/);
  assert.match(page, /Copy only copies the text/);
  console.log('shortcutSearch: name, category, app, combo and plus-key search; truthful copy feedback');
} finally { rmSync(dir, { recursive: true, force: true }); }
