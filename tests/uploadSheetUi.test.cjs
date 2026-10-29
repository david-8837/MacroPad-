// Guard the explicit review-first upload route and the slide-up presentation.
// Behavioral checks (focus, bottom anchoring, offline disabled CTA) run in Chromium.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

function source(path) {
  return readFileSync(join(__dirname, '..', path), 'utf8');
}
function componentTag(text, tag) {
  const match = text.match(new RegExp(`<${tag}\\b[\\s\\S]*?\\/>`));
  assert.ok(match, `<${tag}> must be mounted`);
  return match[0];
}

const app = source('src/App.tsx');
const navbar = source('src/components/TopNavbar.tsx');
const pad = source('src/components/DigitalTwin.tsx');
const palette = source('src/components/CommandPalette.tsx');
const sheet = source('src/components/UploadSheet.tsx');

assert.doesNotMatch(navbar, /\bonSyncEEPROM\b|\bonOpenUploadSheet\b|>\s*Upload\s*</,
  'top navbar must not offer an upload shortcut');
assert.match(componentTag(app, 'DigitalTwin'), /onOpenUploadSheet=\{\(\) => setIsUploadSheetOpen\(true\)\}/,
  'the Configure column must open the sheet');
assert.match(pad, /onClick=\{onOpenUploadSheet\}[\s\S]*?Upload to deck/,
  'the Studio upload button must remain available');
assert.match(componentTag(app, 'UploadSheet'), /isOpen=\{isUploadSheetOpen\}/);
assert.match(componentTag(app, 'CommandPalette'), /onOpenUploadSheet=\{\(\) => setIsUploadSheetOpen\(true\)\}/,
  'the command palette must open the same review sheet');
assert.match(palette, /id: 'hw-sync'[\s\S]*?run: onOpenUploadSheet/,
  'the palette upload action must never skip review and write directly');
assert.doesNotMatch(palette, /\bonSyncEEPROM\b/);
assert.match(app, /if \(!isUploadSheetOpen\) setIsCommandPaletteOpen/,
  'a second panel must not obscure an in-progress upload or readback');

assert.match(sheet, /justify-end/);
assert.match(sheet, /transition-transform duration-300/);
assert.match(sheet, /visible \? 'translate-y-0' : 'translate-y-full'/);
assert.match(sheet, /if \(!isFlashing\) onClose\(\)/,
  'an in-flight upload and readback cannot be dismissed');
assert.ok((sheet.match(/disabled=\{isFlashing\}/g) || []).length >= 2,
  'both close and cancel controls must be disabled while writing');
assert.match(sheet, /await onSyncEEPROM\(/, 'upload only starts after explicit confirmation');
assert.match(sheet, /tabIndex=\{-1\}/);
assert.match(sheet, /handleDetachedFocus/, 'Escape and Tab must still work after clicking non-focusable content');

const knobPreview = sheet.slice(sheet.indexOf('data-testid="upload-knob-preview"'),
  sheet.indexOf('{/* Connection Status Box */}'));
assert.ok(knobPreview.includes('role="img"'), 'show a physical knob, not just a dial label');
assert.ok(knobPreview.includes('knobBindings.map'), 'show all knob gestures for the selected layer');
assert.doesNotMatch(knobPreview, /onClick=|onWheel=|onMouseDown=/,
  'the knob in the upload review must remain read-only');
for (const [slot, where] of [['CW', 'Knob CW'], ['CCW', 'Knob CCW'],
  ['PRESS', 'Knob press'], ['HOLD', 'Knob hold']]) {
  assert.ok(sheet.includes(`{ slot: '${slot}', where: '${where}', action: currentLayer.dial?.`),
    `${slot} must follow the selected layer's actual dial binding`);
}

console.log('uploadSheetUi: navbar, slide-up safety, and read-only 4-gesture knob preview passed');
