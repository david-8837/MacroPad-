// Keep the cosmetic interaction layer attached to the existing, accessible controls.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const read = path => readFileSync(join(__dirname, '..', path), 'utf8');
const css = read('src/index.css');
const nav = read('src/components/TopNavbar.tsx');
const deck = read('src/components/DigitalTwin.tsx');
const presets = read('src/components/PresetsPage.tsx');
const sheet = read('src/components/UploadSheet.tsx');
assert.match(nav, /premium-nav-link[\s\S]*?border-b-2/);
assert.match(nav, /aria-current=\{on \? 'true' : undefined\}/);
assert.match(deck, /workspace-arrival/);
assert.match(css, /\.macropad-key:active,\s*\.macropad-key\.active-down/);
assert.match(css, /\.preset-card\[aria-pressed='true'\]/);
assert.match(presets, /aria-pressed=\{presetId === item\.id\} className=\{`preset-card/);
assert.match(sheet, /premium-sheet/);
assert.match(sheet, /backdrop-blur-\[6px\]/);
assert.match(css, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\.workspace-arrival/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.workspace-arrival \{ animation: none/);
assert.match(css, /:not\(:disabled\):hover/);
assert.match(css, /:focus-visible/);
console.log('premiumEffects: scoped visual feedback, selection and reduced motion are present');
for (const component of ['KeyConfigDrawer', 'KnobConfigDrawer', 'DisplayConfigDrawer']) {
  assert.match(read(`src/components/${component}.tsx`), /editor-slide-in/,
    `${component} should slide into its existing column`);
}
assert.match(read('src/components/PresetEditor.tsx'), /premium-dialog preset-slide-in/);
assert.match(css, /@keyframes editor-slide-in[\s\S]*?translateX\(100%\)/);
assert.match(css, /@keyframes preset-slide-in[\s\S]*?translateY\(64px\)/);
assert.match(css, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\.editor-slide-in[\s\S]*?\.preset-slide-in/);
