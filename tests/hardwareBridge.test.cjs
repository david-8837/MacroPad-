// Run: node tests/hardwareBridge.test.cjs
const assert = require('assert');
const { mkdtempSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

/*
 * The text-line half of the bridge.
 *
 * The firmware speaks binary frames, but it still answers the `OLED:` command
 * family as text (firmware/src/core/ascii_cmd.c), so the line parser is live
 * code, not legacy. This exercises it through one fake serial stream: chunks
 * split mid-line, CRLF, garbage, an out-of-range key index.
 *
 * The module is bundled rather than type-stripped on the fly — it imports the
 * binary link and the protocol module, and hand-stubbing those was one refactor
 * away from testing nothing at all.
 */
async function bundle(entry) {
  const { build } = require('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'hb-'));
  const outfile = join(tmp, 'mod.mjs');
  await build({
    entryPoints: [join(__dirname, '..', entry)],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    outfile,
    logLevel: 'silent',
  });
  const mod = await import(`file://${outfile}`);
  rmSync(tmp, { recursive: true, force: true });
  return mod;
}

async function run() {
  const { hardwareBridge } = await bundle('src/utils/hardwareBridge.ts');
  // The firmware exposes keyboard/consumer HID reports, not a raw pad-input
  // report. Never treat arbitrary HID keyboard bytes as key/encoder events.
  assert.strictEqual(hardwareBridge.connectHID, undefined, 'no phantom WebHID connection');

  const events = [];
  const states = [];
  hardwareBridge.onInputEvent((k, t) => events.push(`in:${k}:${t}`));
  hardwareBridge.onChannelSwitch((c) => events.push(`ch:${c}`));
  hardwareBridge.onHoldSwitch(() => events.push('hold'));
  hardwareBridge.onStateChange((s) => states.push(s));

  // Chunks split mid-line, a CRLF line, garbage, and an out-of-range key index.
  // CHANNEL:3 is the fourth page — the parser used to reject anything past 2.
  const chunks = [
    'KEY:0:D',
    'OWN\nKEY:0:UP\nENC:',
    'CW\r\nENC:CCW\nCHANNEL:',
    '3\nCHANNEL:4\nENC:HOLD_SWITCH\nKEY:99:DOWN\nnoise\nENC:DOWN\nENC:UP\n',
  ];
  const enc = new TextEncoder();
  const port = {
    readable: new ReadableStream({
      start(c) {
        chunks.forEach((x) => c.enqueue(enc.encode(x)));
        c.close();
      },
    }),
  };
  hardwareBridge.serialPort = port;
  hardwareBridge.connectionState = 'connected';

  await hardwareBridge.readSerialStream(port);

  assert.deepStrictEqual(events, [
    'in:0:down',
    'in:0:up',
    'in:9:dial_cw',
    'in:9:dial_ccw',
    'ch:2',
    'ch:3',
    'hold',
    'in:9:down',
    'in:9:up',
  ]);
  assert.strictEqual(states[states.length - 1], 'disconnected', 'stream end must report a disconnect');
  hardwareBridge.protocolInfo = { hasFlash: true };
  const before = events.length;
  hardwareBridge.handleSerialLine('KEY:0:DOWN');
  assert.strictEqual(events.length, before, 'MPAD3 binary payload fragments cannot masquerade as legacy key lines');
  hardwareBridge.link = { readConfig() { assert.fail('unverified serial ports must not be read'); } };
  hardwareBridge.protocolInfo = null;
  const unprobed = await hardwareBridge.uploadDeck({ layers: [] });
  assert.strictEqual(unprobed.ok, false);
  assert.match(unprobed.message, /No compatible MPAD3 pad/);
  hardwareBridge.protocolInfo = { hasFlash: false };
  assert.strictEqual((await hardwareBridge.uploadDeck({ layers: [] })).ok, false,
    'a device without flash capability is not an upload destination');
  // PC-owned macros need a verified KEY_EVENT stream. Preflight MUST refuse
  // upload before a fake write when the pad disabled events, unless the user
  // explicitly opted in to changing that global setting. A missing capability
  // cannot be fixed by that checkbox.
  const { defaultConfig, ACTION_TYPE } = await import('../host/protocol/mpad3-protocol.mjs');
  const macroDeck = { layers: [{ keys: [{ keyIndex: 0, tapAction: {
    id: 'M4-0', category: 'macro', name: 'Macro M4', payload: { macroId: 4 },
  }}], dial: {} }] };
  let writes = 0;
  let lastConfig = null;
  let baseEvents = 0;
  hardwareBridge.link = {
    async updateConfig(convert) {
      const base = defaultConfig();
      base.global.usbReportEvents = baseEvents;
      const { config, result } = convert(base);
      writes++;
      lastConfig = config;
      return result;
    },
  };
  hardwareBridge.protocolInfo = { hasFlash: true, hasEvents: true };
  const lockedDeck = { ...macroDeck, isLocked: true };
  const lockedUpload = await hardwareBridge.uploadDeck(lockedDeck, undefined, { enablePcEvents: true });
  assert.strictEqual(lockedUpload.ok, false);
  assert.match(lockedUpload.message, /deck.*locked|unlock.*deck/i);
  assert.strictEqual(writes, 0, 'a locked deck cannot reach the config transaction');
  const refused = await hardwareBridge.uploadDeck(macroDeck);
  assert.strictEqual(refused.ok, false, 'no silent upload of PC macros with pad key events off');
  assert.match(refused.message, /key events|usbReportEvents/i);
  assert.strictEqual(writes, 0, 'preflight must not write incomplete bindings');
  const emptyMacro = await hardwareBridge.uploadDeck(macroDeck, undefined, { enablePcEvents: true });
  assert.strictEqual(emptyMacro.ok, false, 'an M-slot with no saved steps must not be uploaded');
  assert.match(emptyMacro.message, /M4.*no saved executable steps/i);
  assert.strictEqual(writes, 0);
  const storage = new Map([['kadowaz_macros_v2', JSON.stringify([{ id: 4, name: 'Ready', actions: [
    { type: 'combo', value: 'Ctrl+C', keys: ['Ctrl', 'C'] },
  ] }])]]);
  global.localStorage = { getItem: k => storage.get(k) ?? null };
  global.window = {}; // Browser Web Serial alone has no native key executor.
  const browserOnly = await hardwareBridge.uploadDeck(macroDeck, undefined, { enablePcEvents: true });
  assert.strictEqual(browserOnly.ok, false);
  assert.match(browserOnly.message, /desktop app|native executor/i);
  assert.strictEqual(writes, 0);
  global.window = { electronAPI: { execAction: async () => ({ success: true }) } };
  const consented = await hardwareBridge.uploadDeck(macroDeck, undefined, { enablePcEvents: true });
  assert.strictEqual(consented.ok, true);
  assert.strictEqual(writes, 1);
  assert.strictEqual(lastConfig.global.usbReportEvents, 1);
  assert.strictEqual(lastConfig.channels[0].keys[0].type, ACTION_TYPE.NONE);
  baseEvents = 1;
  assert.strictEqual((await hardwareBridge.uploadDeck(macroDeck)).ok, true,
    'an already-enabled event stream needs no setting change or separate opt-in');
  assert.strictEqual(lastConfig.global.usbReportEvents, 1);
  baseEvents = 0;
  const deviceOnlyDeck = { layers: [{ keys: [{ keyIndex: 0, tapAction: {
    id: 'A', category: 'hotkey', name: 'A', payload: { keys: ['A'] },
  }}], dial: {} }] };
  assert.strictEqual((await hardwareBridge.uploadDeck(deviceOnlyDeck, undefined, { enablePcEvents: true })).ok, true);
  assert.strictEqual(lastConfig.global.usbReportEvents, 0,
    'a device-only deck never silently changes the event setting');
  const oledDeck = { layers: [{ keys: [{ keyIndex: 0, tapAction: {
    id: 'oled', category: 'oled', name: 'OLED Next', payload: { oledStep: 'next' },
  }}], dial: {} }] };
  const beforeOled = writes;
  const noPanel = await hardwareBridge.uploadDeck(oledDeck);
  assert.strictEqual(noPanel.ok, false, 'OLED NEXT is inert without a detected panel');
  assert.match(noPanel.message, /SSD1306|OLED.*detect/i);
  assert.strictEqual(writes, beforeOled, 'OLED preflight must reject before writing');
  hardwareBridge.protocolInfo = { hasFlash: true, hasEvents: true, hasOled: true };
  assert.strictEqual((await hardwareBridge.uploadDeck(oledDeck)).ok, true);
  assert.strictEqual(lastConfig.channels[0].keys[0].type, ACTION_TYPE.OLED_NEXT);
  assert.strictEqual(lastConfig.channels[0].keys[0].code, 0);
  const beforeCapability = writes;
  hardwareBridge.protocolInfo = { hasFlash: true, hasEvents: false };
  const noCapability = await hardwareBridge.uploadDeck(macroDeck, undefined, { enablePcEvents: true });
  assert.strictEqual(noCapability.ok, false, 'opt-in cannot invent firmware event capability');
  assert.strictEqual(writes, beforeCapability);
  delete global.window;
  delete global.localStorage;

  // A text command on the shared CDC port must use the binary link's writer,
  // not steal a second WritableStream lock during a flash transaction.
  const written = [];
  hardwareBridge.serialPort = { writable: new WritableStream({
    write(bytes) { written.push(new TextDecoder().decode(bytes)); },
  }) };
  hardwareBridge.link = {
    async sendAscii(command) { written.push(`link:${command}`); },
  };
  assert.strictEqual(await hardwareBridge.sendSerialCommand('OLED:MODE:9'), true);
  assert.deepStrictEqual(written, ['link:OLED:MODE:9']);
  hardwareBridge.link = { async sendAscii() { throw new Error('save is active'); } };
  assert.strictEqual(await hardwareBridge.sendSerialCommand('OLED:MODE:9'), false);
  assert.deepStrictEqual(written, ['link:OLED:MODE:9']);
  hardwareBridge.link = null;
  assert.strictEqual(await hardwareBridge.sendSerialCommand('OLED:CH:2'), true);
  assert.deepStrictEqual(written, ['link:OLED:MODE:9', 'OLED:CH:2\n']);
  hardwareBridge.serialPort = null;
  hardwareBridge.protocolInfo = null;
  console.log('hardwareBridge: all assertions passed');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
