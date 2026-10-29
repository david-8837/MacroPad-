// Run: node tests/viaIntegration.test.cjs
// Quick assignment -> flash mapping -> real 0xC0 frame decoder -> bridge ->
// physical router -> saved PC macro -> native IPC, with negative ownership cases.
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function bundle(entry) {
  const { build } = require('esbuild');
  const dir = mkdtempSync(join(tmpdir(), 'mpad3-via-'));
  const outfile = join(dir, 'mod.mjs');
  try {
    await build({ entryPoints: [join(__dirname, '..', entry)], bundle: true,
      format: 'esm', platform: 'neutral', outfile, logLevel: 'silent' });
    return await import(`file://${outfile}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

function makeDeck() {
  return { id: 'quick-tray', name: 'Route test', activeLayerId: 'L0',
    layers: Array.from({ length: 4 }, (_, ch) => ({
      id: `L${ch}`, name: `Layer ${ch}`,
      keys: Array.from({ length: 9 }, (_, i) => ({ keyIndex: i, tapAction: null,
        holdAction: null, doubleTapAction: null })),
      dial: { cwAction: null, ccwAction: null, pressAction: null, holdAction: null },
    })) };
}

function frame(proto, { index = 0, event = 3, channel = 0, action = 0, value = 0, source = 0 } = {}) {
  const p = new Uint8Array(8);
  p[0] = source; p[1] = index; p[2] = event; p[3] = channel;
  const v = new DataView(p.buffer); v.setInt16(4, value, true); v.setUint16(6, action, true);
  return proto.encodeFrame(proto.CMD.KEY_EVENT, p);
}

(async () => {
  const catalogue = await bundle('src/data/viaKeycodes.ts');
  const { viaItemToBinding } = await bundle('src/utils/viaBindings.ts');
  const { deckToConfig } = await bundle('src/utils/deckToConfig.ts');
  const { routePhysicalAction } = await bundle('src/utils/physicalActionRouter.ts');
  const { Mpad3Link } = await bundle('src/utils/mpad3Link.ts');
  const { hardwareBridge } = await bundle('src/utils/hardwareBridge.ts');
  const { executeDeckAction } = await bundle('src/utils/executeDeckAction.ts');
  const { MACRO_STORAGE_KEY } = await bundle('src/utils/macroStorage.ts');
  const proto = await import('../host/protocol/mpad3-protocol.mjs');
  const { ACTION_TYPE, defaultConfig } = proto;

  const groups = [catalogue.VIA_BASIC_KEYS, catalogue.VIA_MEDIA_KEYS, catalogue.VIA_MACRO_KEYS,
    catalogue.VIA_LAYER_KEYS, catalogue.VIA_OLED_KEYS, catalogue.VIA_SPECIAL_KEYS];
  const all = groups.flat();
  assert.equal(new Set(all.map(x => x.code)).size, all.length, 'no duplicate quick assignments');
  assert.deepEqual(catalogue.VIA_LAYER_KEYS.map(x => x.code), ['CH(0)', 'CH(1)', 'CH(2)', 'CH(3)']);
  assert.deepEqual(catalogue.VIA_OLED_KEYS.map(x => x.code), ['OLED_NEXT'], 'the claimed manual step is assignable');
  for (const code of ['MO(1)', 'TG(1)', 'TO(0)', 'TT(1)', 'DF(1)', 'RESET', 'EE_CLR',
    'KC_TRNS', 'LCTL_T(KC_Z)', 'KC_LCTL', 'MS_BTN1', 'KC_CALC', 'KC_BRIU']) {
    assert.ok(!all.some(x => x.code === code), `${code} falsely advertised by MPAD3 quick tray`);
    assert.match(viaItemToBinding(0, { code, category: 'layers', label: code }).error, /not a supported/i);
  }
  assert.match(viaItemToBinding(9, all[0]).error, /nine switches/i);

  const expectedMedia = { KC_MPLY: 0xcd, KC_MSTP: 0xb7, KC_MNXT: 0xb5, KC_MPRV: 0xb6,
    KC_VOLU: 0xe9, KC_VOLD: 0xea, KC_MUTE: 0xe2 };
  const { resolveVk, mediaKeys } = require('../electron/actionExecutor.cjs');
  for (const item of all) {
    const assigned = viaItemToBinding(0, item);
    assert.ok(!('error' in assigned), `${item.code}: ${assigned.error}`);
    const deck = makeDeck();
    deck.layers[0].keys[0] = assigned.binding;
    const { config, mapped, unsupported } = deckToConfig(deck, defaultConfig());
    const slot = config.channels[0].keys[0];
    switch (item.category) {
      case 'basic':
        assert.equal(assigned.ownership, 'device');
        assert.equal(slot.type, ACTION_TYPE.KEYCODE, item.code);
        assert.ok(slot.code > 0, item.code); assert.equal(mapped, 1); assert.equal(unsupported.length, 0);
        assert.notEqual(resolveVk(assigned.binding.tapAction.payload.keys[0]), null,
          `${item.code} cannot be tested in Windows desktop preview`);
        break;
      case 'media':
        assert.equal(assigned.ownership, 'device');
        assert.equal(slot.type, ACTION_TYPE.MEDIA, item.code);
        assert.equal(slot.code, expectedMedia[item.code], item.code);
        assert.equal(unsupported.length, 0);
        assert.ok(mediaKeys(assigned.binding.tapAction.payload.mediaAction)?.every(k => resolveVk(k) !== null),
          `${item.code} has no Windows native preview route`);
        break;
      case 'layers':
        assert.equal(assigned.ownership, 'device');
        assert.equal(slot.type, ACTION_TYPE.CHANNEL, item.code);
        assert.equal(slot.code, Number(item.code[3]));
        assert.equal(unsupported.length, 0);
        break;
      case 'oled':
        assert.equal(assigned.ownership, 'device');
        assert.equal(assigned.binding.tapAction.category, 'oled');
        assert.equal(assigned.binding.tapAction.payload.oledStep, 'next');
        assert.equal(slot.type, ACTION_TYPE.OLED_NEXT, item.code);
        assert.equal(slot.code, 0, item.code);
        assert.equal(mapped, 1);
        assert.equal(unsupported.length, 0);
        break;
      case 'macro':
        assert.equal(assigned.ownership, 'desktop');
        assert.equal(assigned.binding.tapAction.category, 'macro');
        assert.equal(assigned.binding.tapAction.payload.macroId, Number(item.code.slice(1)));
        assert.equal(slot.type, ACTION_TYPE.NONE, item.code);
        assert.equal(slot.text, '', item.code);
        assert.equal(mapped, 0); assert.equal(unsupported.length, 1);
        assert.equal(unsupported[0].route, 'desktop');
        break;
      case 'special':
        assert.equal(assigned.ownership, 'clear');
        assert.equal(assigned.binding.tapAction, null);
        assert.equal(slot.type, ACTION_TYPE.NONE);
        assert.equal(unsupported.length, 0);
        break;
      default: assert.fail(`unhandled tray category ${item.category}`);
    }
  }
  console.log(`viaIntegration: ${all.length} advertised assignments each have an honest upload route`);

  // Legacy saved QMK codes work on neither side; legacy M0 still uses PC.
  const legacy = makeDeck();
  legacy.layers[0].keys[0].tapAction = { id: 'old', category: 'hotkey', name: 'MO(1)',
    payload: { keycode: 'MO(1)' } };
  let converted = deckToConfig(legacy, defaultConfig());
  assert.equal(converted.config.channels[0].keys[0].type, ACTION_TYPE.NONE);
  assert.equal(converted.unsupported[0].route, 'unavailable');
  legacy.layers[0].keys[0].tapAction = { id: 'old-m0', category: 'script', name: 'Macro M0',
    payload: { command: 'macro:0' } };
  converted = deckToConfig(legacy, defaultConfig());
  assert.equal(converted.config.channels[0].keys[0].type, ACTION_TYPE.NONE);
  assert.equal(converted.unsupported[0].route, 'desktop');
  assert.match((await executeDeckAction({ id: 'bad', category: 'script',
    payload: { command: 'macro:0.exe' } })).error, /invalid legacy or desktop macro/i);

  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const native = [];
  globalThis.window = { electronAPI: { execAction: async action => {
    native.push(action); return { success: true };
  } } };
  store.set(MACRO_STORAGE_KEY, JSON.stringify([{ id: 7, name: 'Safe macro', actions: [
    { id: 't', type: 'text', value: 'hello world' },
    { id: 'c', type: 'combo', value: 'Ctrl+C', keys: ['Ctrl', 'C'] },
  ] }]));

  // Editor is on L0; pad event explicitly says L1. M7 is on L1 and must run;
  // a different macro (empty/undefined M8) on L0 must not run by mistake.
  const deck = makeDeck();
  deck.layers[0].keys[0] = viaItemToBinding(0, catalogue.VIA_MACRO_KEYS[8]).binding;
  deck.layers[1].keys[0] = viaItemToBinding(0, catalogue.VIA_MACRO_KEYS[7]).binding;
  const cfg = deckToConfig(deck, defaultConfig());
  assert.equal(cfg.config.channels[1].keys[0].type, ACTION_TYPE.NONE);

  const link = new Mpad3Link({ writable: new WritableStream() });
  const completed = [];
  const deliveries = [];
  const onEvent = hardwareBridge.onInputEvent((key, gesture, meta) => {
    const routed = routePhysicalAction(deck.layers, key, gesture, meta);
    deliveries.push({ key, gesture, channel: meta.channel, firmwareAction: meta.firmwareAction,
      action: routed.action?.id ?? null });
    if (routed.action) completed.push(executeDeckAction(routed.action));
  });
  const onFrame = link.onFrame(e => hardwareBridge.handleLinkEvent(e));
  link.feed(frame(proto, { index: 0, event: 1, channel: 1 })); // down alone is not macro playback
  link.feed(frame(proto, { index: 0, event: 2, channel: 1 })); // up alone is not macro playback
  assert.equal(completed.length, 0);
  link.feed(frame(proto, { index: 0, event: 3, channel: 1, action: ACTION_TYPE.NONE }));
  assert.equal(completed.length, 1);
  assert.equal(deliveries[2].channel, 1);
  assert.equal(deliveries[2].action, 'M7-0');
  assert.equal((await completed.pop()).success, true);
  assert.deepEqual(native.map(x => [x.category, x.payload]), [
    ['text', { text: 'hello world' }], ['hotkey', { keys: ['Ctrl', 'C'] }],
  ]);
  assert.ok(!native.some(x => /macro:/.test(JSON.stringify(x))), 'macro:7 is never typed or passed to the shell');

  // A device-owned HID action is not replayed by the desktop, even if its
  // editor binding happens to be a PC macro; CRC failures are ignored too.
  const before = native.length;
  link.feed(frame(proto, { index: 0, event: 3, channel: 1, action: ACTION_TYPE.KEYCODE }));
  link.feed(frame(proto, { index: 0, event: 3, channel: 1, action: ACTION_TYPE.OLED_NEXT }));
  assert.equal(completed.length, 0);
  const broken = frame(proto, { index: 0, event: 3, channel: 1 });
  broken[broken.length - 1] ^= 0xff;
  link.feed(broken);
  assert.equal(native.length, before);

  link.feed(frame(proto, { index: 0, event: 3, channel: 0 }));
  assert.equal((await completed.pop()).success, false, 'M8 was never defined in PC storage');
  assert.equal(native.length, before);
  onFrame(); onEvent();
  console.log('viaIntegration: physical 0xC0 frame routed to saved PC macro exactly once');
})().catch(e => { console.error(e); process.exitCode = 1; });
