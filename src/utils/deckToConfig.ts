/*
 * deckToConfig.ts — the deck, expressed as the pad's own configuration.
 *
 * "Upload to deck" used to write a JSON blob that nothing on the device parse.
 * This is the honest version: it produces a `cfg_blob_t` — the same 2272-byte
 * v3 structure the firmware reads out of flash — and the transport streams it as
 * SET_CONFIG chunks followed by COMMIT.
 *
 * Two rules keep it trustworthy:
 *   1. Nothing is invented. A binding the pad cannot express returns a reason,
 *      is counted, and is named in the result; it is never replaced by a guess.
 *   2. The device's own settings are kept. The caller passes the config it read
 *      off the pad, and only the key and knob slots are replaced, so an upload
 *      does not quietly reset gesture timings or the OLED playlist.
 *
 * The four layers are the four channels, in order. Layer 0 is channel 0.
 */
import { ACTION_TYPE, CHANNEL_COUNT, KEY_COUNT } from '../../host/protocol/mpad3-protocol.mjs';
import type { Cfg, CfgAction, CfgChannel } from '../../host/protocol/mpad3-protocol.mjs';
import type { ActionDefinition, Deck, DialBinding } from '../types';
import { MEDIA_CODE, chordToAction } from './deviceKeymap';
import { isPcMacroBinding, pcMacroId } from './macroStorage';

/** A binding that stays on the PC and cannot be pushed to the pad. */
export interface UnsupportedBinding {
  layer: number;
  /** Human-readable slot: "Switch #3 tap", "Knob CW", … */
  where: string;
  name: string;
  reason: string;
  /** A desktop action can run from KEY_EVENT; unavailable codes work nowhere. */
  route: 'desktop' | 'unavailable';
}

export interface DeckUpload {
  config: Cfg;
  /** How many slots now do their job on the pad itself. */
  mapped: number;
  unsupported: UnsupportedBinding[];
}

/** An OLED gesture only works when INFO says a physical panel answered I²C. */
export function hasOledNextAction(config: Cfg): boolean {
  return config.channels.some(ch => [
    ...ch.keys, ch.knobCw, ch.knobCcw, ch.knobTap, ch.knobHold,
  ].some(action => action.type === ACTION_TYPE.OLED_NEXT));
}

function empty(): CfgAction {
  return { type: ACTION_TYPE.NONE, flags: 0, code: 0, text: '' };
}

type Mapped = { ok: CfgAction } | { reason: string; route: UnsupportedBinding['route'] };

function cfg(type: number, code = 0, text = ''): Mapped {
  return { ok: { type, flags: 0, code, text } };
}

const unavailable = (reason: string): Mapped => ({ reason, route: 'unavailable' });
const desktop = (reason: string): Mapped => ({ reason, route: 'desktop' });

/** "Switch to Layer 2" / "Layer 3" → 2 / 3. Anything else → null. */
function layerFromName(name: string): number | null {
  const m = /\blayer\s*([0-3])\b/i.exec(name) ?? /\bch(?:annel)?\s*([0-3])\b/i.exec(name);
  if (!m) return null;
  return Number(m[1]);
}

const PRINTABLE_ASCII = /^[\x20-\x7e]+$/;

/**
 * One deck action → one cfg_action_t. Everything the firmware can do itself is
 * mapped here; everything that needs the desktop app is refused with a reason.
 */
function mapAction(action: ActionDefinition | null | undefined): Mapped {
  if (!action) return { ok: empty() };

  const payload = action.payload ?? {};

  /* Legacy QMK codes were offered by the old quick tray, but this firmware is
   * not QMK. Refuse them rather than claiming they run on the desktop. */
  if (payload.keycode) {
    return unavailable(`${payload.keycode} works on neither this pad nor this desktop app; reassign the switch`);
  }

  if (isPcMacroBinding(action)) {
    const id = pcMacroId(action);
    if (id === null) return unavailable('invalid legacy/desktop macro ID; choose M0–M15');
    return desktop(`M${id} requires the desktop app, a saved macro and USB key events; the pad slot stays empty`);
  }

  switch (action.category) {
    case 'hotkey': {
      const keys = Array.isArray(payload.keys) ? payload.keys.filter(Boolean) : [];
      if (keys.length === 0) return unavailable('no keys set');
      const chord = chordToAction(keys);
      if (chord.kind === 'keycode') return cfg(ACTION_TYPE.KEYCODE, chord.code);
      if (chord.kind === 'mods') return cfg(ACTION_TYPE.MODS, chord.mask);
      return unavailable(chord.reason);
    }

    case 'media': {
      const code = MEDIA_CODE[payload.mediaAction ?? ''];
      if (code === undefined) return unavailable(`unknown media action "${payload.mediaAction}"`);
      return cfg(ACTION_TYPE.MEDIA, code);
    }

    case 'oled':
      return payload.oledStep === 'next'
        ? cfg(ACTION_TYPE.OLED_NEXT, 0)
        : unavailable('unknown OLED gesture; choose OLED NEXT in quick assignments');

    case 'navigation': {
      /* New quick-tray layer keys state the intended channel explicitly.
       * Legacy navigation actions still support their old name-based mapping. */
      if (payload.targetChannel !== undefined) {
        return Number.isInteger(payload.targetChannel) && payload.targetChannel >= 0 &&
          payload.targetChannel < CHANNEL_COUNT
          ? cfg(ACTION_TYPE.CHANNEL, payload.targetChannel)
          : unavailable('channel must be Layer 0–3');
      }
      const named = action.name ? layerFromName(action.name) : null;
      if (named !== null) return cfg(ACTION_TYPE.CHANNEL, named);
      if (/next\s+layer|cycle/i.test(action.name ?? '')) return cfg(ACTION_TYPE.CHANNEL_NEXT);
      return unavailable('this navigation action has no device or desktop route');
    }

    case 'script': {
      /* The reserved macro: prefix was handled before the printable-ASCII
       * branch. Literal text "macro:0" must be a text action, not a script. */
      /*
       * A `script` action on the PC does one of two things (see
       * electron/actionExecutor.cjs): if the string is an executable path it runs
       * it, otherwise it *types* it. Typing is something the pad can do on its
       * own — the characters live in the config and the firmware sends them — so
       * that half is uploaded and the other half is refused.
       */
      const command = (payload.command ?? '').trim();
      if (!command) return unavailable('empty command');
      /* Same rule the PC uses (electron/actionExecutor.cjs, looksLikeExecutable):
       * the first token, quote-aware, ending in an executable extension. If the
       * PC would run it, the pad cannot; if the PC would type it, the pad can. */
      const firstToken = command.match(/"[^"]+"|\S+/)?.[0] ?? '';
      if (/\.(exe|cmd|bat|lnk)$/i.test(firstToken.replace(/^"+|"+$/g, ''))) {
        return desktop('launching an executable happens on the PC');
      }
      if (!PRINTABLE_ASCII.test(command)) {
        return desktop('the pad types US-ASCII only, so this text stays on the PC');
      }
      if (command.length > 31) return desktop(`text is ${command.length} chars, the pad holds 31`);
      return cfg(ACTION_TYPE.TEXT, 0, command);
    }

    case 'app_launch':
      return desktop(`launching ${payload.appName || 'an app'} happens on the PC`);
    case 'audio_session':
      return desktop('per-app volume needs the Windows audio session, i.e. the PC');
    case 'text':
      return payload.text ? desktop('this text action is handled by the desktop app')
        : unavailable('empty text action');
    case 'midi':
      return unavailable('MIDI output is not connected on the pad or desktop');
    default:
      return unavailable(`"${action.category}" has no supported route`);
  }
}

function mapDial(
  dial: DialBinding | undefined,
  layer: number,
  unsupported: UnsupportedBinding[],
  count: { n: number },
): {
  knobCw: CfgAction;
  knobCcw: CfgAction;
  knobTap: CfgAction;
  knobHold: CfgAction;
} {
  const at = (where: string, action: ActionDefinition | null | undefined, fallback: CfgAction) => {
    /* Nothing bound at all: use the fallback (an empty slot, or the reserved
     * layer switcher on the hold gesture) rather than reporting a problem. */
    if (!action) return fallback;
    const r = mapAction(action);
    if ('ok' in r) {
      count.n++;
      return r.ok;
    }
    unsupported.push({
      layer, where, name: action.name,
      reason: where === 'Knob hold'
        ? 'Knob hold is reserved for the pad’s layer switch; a PC action cannot also run from it'
        : r.reason,
      route: where === 'Knob hold' ? 'unavailable' : r.route,
    });
    return fallback;
  };

  /* Knob hold stays the reserved layer switcher: the firmware's own default is
   * CHANNEL_NEXT, and the app never writes anything else into that slot. */
  const holdDefault: CfgAction = { type: ACTION_TYPE.CHANNEL_NEXT, flags: 0, code: 0, text: '' };

  return {
    knobCw: at('Knob CW', dial?.cwAction, empty()),
    knobCcw: at('Knob CCW', dial?.ccwAction, empty()),
    knobTap: at('Knob press', dial?.pressAction, empty()),
    knobHold: at('Knob hold', dial?.holdAction, holdDefault),
  };
}

/**
 * Build the config to upload. `base` is what the pad reported, so its global
 * settings and lighting survive; only key and knob slots are rewritten.
 */
export function deckToConfig(deck: Deck, base: Cfg): DeckUpload {
  const unsupported: UnsupportedBinding[] = [];
  /* Counts the user's own bindings that now live on the pad. Slots that fall back
   * to a default (an empty key, the reserved knob-hold layer switch) are not
   * content and are not counted. */
  const count = { n: 0 };

  const channels: CfgChannel[] = Array.from({ length: CHANNEL_COUNT }, (_, layer) => {
    const deckLayer = deck.layers[layer];
    const fromBase = base.channels[layer];

    const keys: CfgAction[] = Array.from({ length: KEY_COUNT }, (_, i) => {
      const binding = deckLayer?.keys.find((k) => k.keyIndex === i);

      /* A safety key has no tap action at all: holding it for a threshold fires
       * safetyConfirmAction. The pad has one action slot per key and no
       * hold-to-confirm state, so this is named rather than uploaded as empty. */
      if (binding?.isDestructiveSafety) {
        unsupported.push({
          layer,
          where: `Switch #${i + 1} hold-to-confirm`,
          name: binding.safetyConfirmAction?.name ?? binding.label,
          reason: 'the pad has no hold-to-confirm slot; requires desktop app and reported hold duration',
          route: 'desktop',
        });
        return empty();
      }

      const r = mapAction(binding?.tapAction);
      if ('ok' in r) {
        if (binding?.tapAction && r.ok.type !== ACTION_TYPE.NONE) {
          count.n++;
          /* One slot per key on the pad: if the deck also has a hold or
           * double-tap action, say which one travelled. */
          if (binding.holdAction || binding.doubleTapAction) {
            unsupported.push({
              layer,
              where: `Switch #${i + 1} hold/double-tap`,
              name: (binding.holdAction ?? binding.doubleTapAction)?.name ?? binding.label,
              reason: 'the pad fires one action per key; the uploaded tap suppresses separate PC hold/double actions',
              route: 'unavailable',
            });
          }
        }
        return r.ok;
      }
      unsupported.push({
        layer,
        where: `Switch #${i + 1} tap`,
        name: binding?.tapAction?.name ?? `Switch #${i + 1}`,
        reason: r.reason,
        route: r.route,
      });
      return empty();
    });

    const knob = mapDial(deckLayer?.dial, layer, unsupported, count);

    return {
      keys,
      ...knob,
      /* Lighting keeps whatever the pad already has. It has its own page and its
       * own SET_LIGHTING path; an upload of keys should not repaint the deck. */
      lighting: fromBase.lighting,
    };
  });

  return { config: { global: { ...base.global }, channels }, mapped: count.n, unsupported };
}
