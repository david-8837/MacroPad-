// Keep the UI honest about event origin and verified OLED frame availability.
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const source = file => readFileSync(join(__dirname, '..', file), 'utf8');
const tester = source('src/components/via/ViaKeyTester.tsx');
const display = source('src/components/DisplayConfigDrawer.tsx');
const app = source('src/App.tsx');
const palette = source('src/components/CommandPalette.tsx');
assert.doesNotMatch(tester, /LIVE 1000Hz|>Switch Chatter<|Clean \(0 Bounces\)|latencyMs|performance\.now\(/);
assert.match(tester, /OS keyboard events/i);
assert.match(tester, /not.*scan.*(latency|chatter)|cannot.*(measure|verify).*hardware/i);
assert.doesNotMatch(display, /until checked frame streaming is implemented/i);
assert.match(display, /hasOledStream/);
assert.doesNotMatch(app, /device text streaming is not available yet/i);
assert.match(app, /hasOledStream/);
assert.doesNotMatch(palette, /interactive matrix validator/i);
console.log('step6UiCopy: Key Tester and OLED status do not claim unavailable measurements/streaming');
