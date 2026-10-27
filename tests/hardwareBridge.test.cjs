// Run: node tests/hardwareBridge.test.cjs
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const out = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/utils/hardwareBridge.ts'), 'utf8'),
  { compilerOptions: { module: 'commonjs', target: 'es2020' } }).outputText;
const tmp = path.join(os.tmpdir(), `hb-${process.pid}.cjs`);
fs.writeFileSync(tmp, out);
const { hardwareBridge } = require(tmp);

const events = [];
const states = [];
hardwareBridge.onInputEvent((k, t) => events.push(`in:${k}:${t}`));
hardwareBridge.onChannelSwitch((c) => events.push(`ch:${c}`));
hardwareBridge.onHoldSwitch(() => events.push('hold'));
hardwareBridge.onStateChange((s) => states.push(s));

// Chunks split mid-line, a CRLF line, garbage, and an out-of-range key index
const chunks = ['KEY:0:D', 'OWN\nKEY:0:UP\nENC:', 'CW\r\nENC:CCW\nCHANNEL:', '2\nENC:HOLD_SWITCH\nKEY:99:DOWN\nnoise\nENC:DOWN\nENC:UP\n'];
const enc = new TextEncoder();
const port = { readable: new ReadableStream({ start(c) { chunks.forEach((x) => c.enqueue(enc.encode(x))); c.close(); } }) };
hardwareBridge.serialPort = port;
hardwareBridge.connectionState = 'connected';

hardwareBridge.readSerialStream(port).then(() => {
  assert.deepStrictEqual(events, ['in:0:down', 'in:0:up', 'in:9:dial_cw', 'in:9:dial_ccw', 'ch:1', 'hold', 'in:9:down', 'in:9:up']);
  assert.strictEqual(states[states.length - 1], 'disconnected', 'stream end must report a disconnect');
  fs.unlinkSync(tmp);
  console.log('hardwareBridge: all assertions passed');
});
