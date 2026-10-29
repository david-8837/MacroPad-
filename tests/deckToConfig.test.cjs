/**
 * deckToConfig — the deck turned into the pad's own bytes.
 *
 * This is the mapping behind "Upload to deck". It used to be a JSON blob that
 * nothing on the device parsed, so these checks are the difference between an
 * upload that works and an upload that merely reports success:
 *
 *   · a shortcut becomes one cfg_action_t (modifiers in the high byte of code)
 *   · a binding the pad cannot run is refused *and named*, never silently
 *     dropped and never replaced by a guess
 *   · the pad's own settings and lighting survive the upload
 *   · the result encodes to the exact 2272-byte v3 blob the firmware validates
 */
const assert = require('node:assert');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const root = join(__dirname, '..');

async function bundle(entry) {
  const { build } = require('esbuild');
  const tmp = mkdtempSync(join(tmpdir(), 'deckcfg-'));
  const outfile = join(tmp, 'mod.mjs');
  await build({
    entryPoints: [join(root, entry)],
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

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL ${name} — ${err.message}`);
  }
}

/** A deck with exactly one interesting binding on layer 0, switch 1. */
function deckWith(action, extra = {}) {
  return {
    id: 'deck-test',
    name: 'Studio Deck',
    activeLayerId: 'L0',
    layers: [
      {
        id: 'L0',
        name: 'Edit',
        badge: 'LAYER 0',
        accentColor: '#1351AA',
        keys: Array.from({ length: 9 }, (_, i) => ({
          keyIndex: i,
          label: `Switch #${i + 1}`,
          sublabel: 'Empty Slot',
          iconName: 'Square',
          accentColor: '#1351AA',
          tapAction: i === 0 ? action : null,
          holdAction: null,
          doubleTapAction: null,
        })),
        dial: {
          label: 'Dial Layer 0',
          activeModeName: 'Layer 0: Master Volume',
          availableModes: ['Layer 0: Master Volume'],
          cwAction: null,
          ccwAction: null,
          pressAction: null,
          holdAction: null,
          accelerationCurve: 'exponential',
          sensitivity: 6,
          channelHoldThresholdMs: 800,
        },
        ...extra,
      },
    ],
  };
}

const hotkey = (keys, name = keys.join('+')) => ({
  id: 'a1',
  category: 'hotkey',
  name,
  payload: { keys },
});

async function run() {
  console.log('[deckToConfig] Starting upload mapping tests...');
  const { deckToConfig, hasOledNextAction } = await bundle('src/utils/deckToConfig.ts');
  const { defaultConfig, encodeConfig, decodeConfig, ACTION_TYPE, SIZES } =
    await bundle('host/protocol/mpad3-protocol.mjs');

  const base = defaultConfig();

  await check('the shipped four-layer example has no inert key or knob action on upload', async () => {
    const { defaultDeck } = await bundle('src/data/defaultDeck.ts');
    const { normalizeDeckLayers } = await bundle('src/utils/channelLayers.ts');
    const { unsupported } = deckToConfig(normalizeDeckLayers(defaultDeck), base);
    assert.deepStrictEqual(unsupported.filter(u => u.route === 'unavailable'), [],
      'the initial deck must not advertise example actions with no firmware or PC route');
  });

  await check('Ctrl+C becomes one KEYCODE with the modifier in the high byte', () => {
    const { config, mapped, unsupported } = deckToConfig(deckWith(hotkey(['Ctrl', 'C'])), base);
    const a = config.channels[0].keys[0];
    assert.strictEqual(a.type, ACTION_TYPE.KEYCODE);
    assert.strictEqual(a.code, (0x01 << 8) | 0x06, `code 0x${a.code.toString(16)}`);
    assert.strictEqual(mapped, 1);
    assert.deepStrictEqual(unsupported, []);
  });

  await check('Shift+Ctrl+S carries both modifiers', () => {
    const { config } = deckToConfig(deckWith(hotkey(['Shift', 'Ctrl', 'S'])), base);
    assert.strictEqual(config.channels[0].keys[0].code, ((0x02 | 0x01) << 8) | 0x16);
  });

  await check('a bare modifier is a MODS action, not a keycode', () => {
    const { config } = deckToConfig(deckWith(hotkey(['Shift'], 'Shift')), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.MODS);
    assert.strictEqual(config.channels[0].keys[0].code, 0x02);
  });

  await check('media keys use the consumer usage', () => {
    const action = { id: 'm', category: 'media', name: 'Play / Pause', payload: { mediaAction: 'play_pause' } };
    const { config } = deckToConfig(deckWith(action), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.MEDIA);
    assert.strictEqual(config.channels[0].keys[0].code, 0xcd);
  });

  await check('short printable text becomes a TEXT macro on the pad', () => {
    const action = { id: 's', category: 'script', name: 'Type', payload: { command: 'hello there' } };
    const { config } = deckToConfig(deckWith(action), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.TEXT);
    assert.strictEqual(config.channels[0].keys[0].text, 'hello there');
  });

  await check('OLED NEXT is an on-pad manual playlist action, not desktop text', () => {
    const action = { id: 'oled-next', category: 'oled', name: 'OLED Next', payload: { oledStep: 'next' } };
    const { config, mapped, unsupported } = deckToConfig(deckWith(action), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.OLED_NEXT);
    assert.strictEqual(config.channels[0].keys[0].code, 0);
    assert.strictEqual(config.channels[0].keys[0].text, '');
    assert.strictEqual(mapped, 1);
    assert.deepStrictEqual(unsupported, []);
    assert.strictEqual(hasOledNextAction(config), true);
    const bad = deckToConfig(deckWith({ ...action, payload: { oledStep: 'reset' } }), base);
    assert.strictEqual(hasOledNextAction(bad.config), false);
    assert.strictEqual(bad.config.channels[0].keys[0].type, ACTION_TYPE.NONE);
    assert.strictEqual(bad.unsupported[0].route, 'unavailable');
  });

  await check('a saved legacy VIA M0 macro is NEVER uploaded as the text macro:0', () => {
    const action = { id: 'M0-0', category: 'script', name: 'Macro M0', payload: { command: 'macro:0' } };
    const { config, mapped, unsupported } = deckToConfig(deckWith(action), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.NONE);
    assert.strictEqual(config.channels[0].keys[0].text, '');
    assert.strictEqual(mapped, 0);
    assert.match(unsupported[0].reason, /desktop|PC/i);
  });

  await check('launching a program is refused, and the slot is named', () => {
    const action = {
      id: 's',
      category: 'script',
      name: 'Blender',
      payload: { command: '"C:\\Program Files\\Blender\\blender.exe" -c' },
    };
    const { config, mapped, unsupported } = deckToConfig(deckWith(action), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.NONE);
    assert.strictEqual(mapped, 0);
    assert.strictEqual(unsupported.length, 1);
    assert.match(unsupported[0].reason, /executable/);
    assert.strictEqual(unsupported[0].where, 'Switch #1 tap');
    assert.strictEqual(unsupported[0].layer, 0);
  });

  await check('text longer than one slot is refused with the real limit', () => {
    const action = { id: 's', category: 'script', name: 'Long', payload: { command: 'x'.repeat(40) } };
    const { unsupported } = deckToConfig(deckWith(action), base);
    assert.match(unsupported[0].reason, /40 chars, the pad holds 31/);
  });

  await check('non-ASCII text stays on the PC', () => {
    const action = { id: 's', category: 'script', name: 'Accented', payload: { command: 'café' } };
    const { unsupported } = deckToConfig(deckWith(action), base);
    assert.match(unsupported[0].reason, /US-ASCII/);
  });

  await check('an app launcher stays on the PC and is named', () => {
    const action = { id: 'app', category: 'app_launch', name: 'Blender', payload: { appName: 'Blender', exePath: 'blender.exe' } };
    const { config, unsupported } = deckToConfig(deckWith(action), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.NONE);
    assert.strictEqual(unsupported.length, 1);
    assert.match(unsupported[0].reason, /Blender|PC/);
  });

  await check('a VIA keycode the pad cannot store is refused with its name', () => {
    const action = { id: 'k', category: 'hotkey', name: 'MO(1)', payload: { keycode: 'MO(1)' } };
    const { unsupported, mapped } = deckToConfig(deckWith(action), base);
    assert.strictEqual(mapped, 0);
    assert.match(unsupported[0].reason, /MO\(1\)/);
  });

  await check('two keys in one slot is refused rather than halved', () => {
    const { unsupported } = deckToConfig(deckWith(hotkey(['Ctrl', 'C', 'V'])), base);
    assert.match(unsupported[0].reason, /one key per slot/);
  });

  await check('a layer switch becomes a CHANNEL action', () => {
    const action = { id: 'n', category: 'navigation', name: 'Switch to Layer 2', payload: {} };
    const { config } = deckToConfig(deckWith(action), base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.CHANNEL);
    assert.strictEqual(config.channels[0].keys[0].code, 2);
  });

  await check('knob hold defaults to the reserved layer switcher', () => {
    const { config } = deckToConfig(deckWith(hotkey(['Ctrl', 'C'])), base);
    assert.strictEqual(config.channels[0].knobHold.type, ACTION_TYPE.CHANNEL_NEXT);
  });

  await check('the pad keeps its own settings and lighting', () => {
    const mine = defaultConfig();
    mine.global.holdMs = 222;
    mine.global.oledPlaylist = 0b101;
    mine.channels[1].lighting = { ...mine.channels[1].lighting, r: 1, g: 2, b: 3, mode: 7 };
    const { config } = deckToConfig(deckWith(hotkey(['Ctrl', 'C'])), mine);
    assert.strictEqual(config.global.holdMs, 222);
    assert.strictEqual(config.global.oledPlaylist, 0b101);
    assert.deepStrictEqual(
      [config.channels[1].lighting.r, config.channels[1].lighting.g, config.channels[1].lighting.b],
      [1, 2, 3],
    );
    assert.strictEqual(config.channels[1].lighting.mode, 7);
  });

  await check('empty slots stay empty', () => {
    const { config } = deckToConfig(deckWith(hotkey(['Ctrl', 'C'])), base);
    for (let i = 1; i < 9; i++) assert.strictEqual(config.channels[0].keys[i].type, ACTION_TYPE.NONE);
  });

  await check('a hold-to-confirm safety key is named, not uploaded as empty', () => {
    const deck = deckWith(null);
    deck.layers[0].keys[0] = {
      ...deck.layers[0].keys[0],
      label: 'Render Out',
      isDestructiveSafety: true,
      longPressThresholdMs: 1500,
      safetyConfirmAction: { id: 'r', category: 'hotkey', name: 'Export Deliverable', payload: { keys: ['Ctrl', 'Shift', 'R'] } },
    };
    const { config, mapped, unsupported } = deckToConfig(deck, base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.NONE);
    assert.strictEqual(mapped, 0);
    assert.match(unsupported[0].reason, /hold-to-confirm/);
    assert.strictEqual(unsupported[0].name, 'Export Deliverable');
  });

  await check('a key with a different hold action uploads the tap and says so', () => {
    const deck = deckWith(hotkey(['Ctrl', 'C'], 'Copy'));
    deck.layers[0].keys[0].holdAction = { id: 'h', category: 'hotkey', name: 'Paste Special', payload: { keys: ['Ctrl', 'Shift', 'V'] } };
    const { config, unsupported } = deckToConfig(deck, base);
    assert.strictEqual(config.channels[0].keys[0].type, ACTION_TYPE.KEYCODE);
    assert.strictEqual(unsupported.length, 1);
    assert.match(unsupported[0].where, /hold\/double-tap/);
  });

  await check('the result encodes to a blob the firmware accepts', () => {
    const { config } = deckToConfig(deckWith(hotkey(['Ctrl', 'C'])), base);
    const blob = encodeConfig(config);
    assert.strictEqual(blob.length, SIZES.config);
    assert.strictEqual(blob.length, 2272);
    const back = decodeConfig(blob); // validates magic, version, length and CRC
    assert.strictEqual(back.channels[0].keys[0].code, (0x01 << 8) | 0x06);
    assert.strictEqual(back.channels.length, 4);
  });

  console.log(`\n=== deckToConfig: ${passed} checks, ${failed} failures ===`);
  if (failed > 0) {
    console.log('UPLOAD MAPPING TESTS FAILED');
    process.exit(1);
  }
  console.log('UPLOAD MAPPING TESTS PASSED');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
