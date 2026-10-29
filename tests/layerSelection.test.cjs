// Run: node tests/layerSelection.test.cjs
// Static safety invariant for the React handlers. Browser smoke checks the UI;
// this CI guard prevents an unacknowledged ASCII send from sneaking back in.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const app = read('src/App.tsx');
const ast = ts.createSourceFile('App.tsx', app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function initializer(name) {
  let found;
  const walk = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node.initializer?.getText(ast);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  assert.ok(found, `React handler ${name} disappeared; revisit layer-selection invariant`);
  return found;
}
const editor = initializer('handleSelectLayer');
const twin = initializer('handleCycleDialMode');
const trigger = initializer('handleTriggerAction');
for (const [name, body] of [['sidebar/palette', editor], ['digital twin', twin], ['simulated key', trigger]]) {
  assert.doesNotMatch(body, /sendSerialCommand|\.setChannel\s*\(/,
    `${name} may select an editor layer but not claim an unverified pad switch`);
}
assert.match(twin, /if \(fromPad\) setPadChannelIndex\(nextIdx\)/,
  'only a pad event may update the device-reported channel');
assert.match(app, /onChannelSwitch\(\(channelIdx\)[\s\S]*?handleCycleDialMode\(channelIdx, true\)/,
  'physical channel event must drive both device readout and editor follow');
assert.doesNotMatch(app, /sendSerialCommand\(`OLED:CH:/,
  'OLED:CH ASCII is unacknowledged; do not use it to claim a pad switch');
assert.match(editor, /setActiveLayerId\(id\)/);
const quickAssign = initializer('handleAssignViaKeycode');
assert.match(quickAssign, /setEditingKeyBinding\(current => current\?\.keyIndex === keyIndex \? binding : current\)/,
  'quick assignments refresh an open drawer so Save cannot revert them');
assert.doesNotMatch(app, /OSDFlyout|triggerOSDFlyout|osdVisible/,
  'changing layers must not show the mini layer preview popup');
assert.match(twin, /setActiveLayerId\(targetLayer\.id\)/);
const palette = read('src/components/CommandPalette.tsx');
const digital = read('src/components/DigitalTwin.tsx');
const launcher = read('src/components/AppLauncherPanel.tsx');
assert.match(palette, /label: `Edit \/ preview Layer \$\{idx\}`/);
assert.doesNotMatch(palette, /label: `Switch to \$\{l\.name\}`/);
assert.match(digital, /Edit Layer/);
assert.match(app, /layers\.map\(\(_, i\) => `Layer \${i}`\)/);
assert.doesNotMatch(digital, /'EDIT', 'TOOLS', 'CUSTOM', 'MACROS'/);
assert.match(digital, /padChannelIndex === null \? 'layer unconfirmed'/);
assert.match(launcher, /\[0, 1, 2, 3\]\.map/);
assert.match(launcher, /Edit Layer:/);
console.log('layerSelection: editor selectors never send an unverified pad switch; physical reports stay distinct');
