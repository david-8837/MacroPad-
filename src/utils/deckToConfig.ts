/*
 * deckToConfig.ts — the deck, expressed as the pad's own configuration.
 *
 * "Upload to deck" used to write a JSON blob that nothing on the device parse.
 * This is the honest version: it produces a `cfg_blob_t` — the same 2268-byte
 * structure the firmware reads out of flash — and the transport streams it as
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

/** A binding that stays on the PC and cannot be pushed to the pad. */
export interface UnsupportedBinding {
  layer: number;
  /** Human-readable slot: "Switch #3 tap", "Knob CW", … */
  where: string;
  name: string;
  reason: string;
}

export interface DeckUpload {
  config: Cfg;
  /** How many slots now do their job on the pad itself. */
  mapped: number;
  unsupported: UnsupportedBinding[];
}

function empty(): CfgAction {
  return { type: ACTION_TYPE.NONE, flags: 0, code: 0, text: '' };
}

type Mapped = { ok: CfgAction } | { reason: string };

function cfg(type: number, code = 0, text = ''): Mapped {
  return { ok: { type, flags: 0, code, text } };
}

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

  /* A raw VIA keycode (MO(1), KC_NO) is a code the pad sends to itself. The
   * host cannot type it, and the pad's action set has no momentary-layer slot,
   * so it stays an editor-only binding rather than being written as nonsense. */
  if (payload.keycode) {
    return { reason: `${payload.keycode} is a keycode, not an action the pad can store` };
  }

  switch (action.category) {
    case 'hotkey': {
      const keys = Array.isArray(payload.keys) ? payload.keys.filter(Boolean) : [];
      if (keys.length === 0) return { reason: 'no keys set' };
      const chord = chordToAction(keys);
      if (chord.kind === 'keycode') return cfg(ACTION_TYPE.KEYCODE, chord.code);
      if (chord.kind === 'mods') return cfg(ACTION_TYPE.MODS, chord.mask);
      return { reason: chord.reason };
    }

    case 'media': {
      const code = MEDIA_CODE[payload.mediaAction ?? ''];
      if (code === undefined) return { reason: `unknown media action "${payload.mediaAction}"` };
      return cfg(ACTION_TYPE.MEDIA, code);
    }

    case 'navigation': {
      const named = action.name ? layerFromName(action.name) : null;
      if (named !== null) return cfg(ACTION_TYPE.CHANNEL, named);
      if (/next\s+layer|cycle/i.test(action.name ?? '')) return cfg(ACTION_TYPE.CHANNEL_NEXT);
      return { reason: 'this navigation action only works in the app' };
    }

    case 'script': {
      /*
       * A `script` action on the PC does one of two things (see
       * electron/actionExecutor.cjs): if the string is an executable path it runs
       * it, otherwise it *types* it. Typing is something the pad can do on its
       * own — the characters live in the config and the firmware sends them — so
       * that half is uploaded and the other half is refused.
       */
      const command = (payload.command ?? '').trim();
      if (!command) return { reason: 'empty command' };
      /* Same rule the PC uses (electron/actionExecutor.cjs, looksLikeExecutable):
       * the first token, quote-aware, ending in an executable extension. If the
       * PC would run it, the pad cannot; if the PC would type it, the pad can. */
      const firstToken = command.match(/"[^"]+"|\S+/)?.[0] ?? '';
      if (/\.(exe|cmd|bat|lnk)$/i.test(firstToken.replace(/^"+|"+$/g, ''))) {
        return { reason: 'launching an executable happens on the PC' };
      }
      if (!PRINTABLE_ASCII.test(command)) {
        return { reason: 'the pad types US-ASCII only, so this text stays on the PC' };
      }
      if (command.length > 31) return { reason: `text is ${command.length} chars, the pad holds 31` };
      return cfg(ACTION_TYPE.TEXT, 0, command);
    }

    case 'app_launch':
      return { reason: `launching ${payload.appName || 'an app'} happens on the PC` };
    case 'audio_session':
      return { reason: 'per-app volume needs the Windows audio session, i.e. the PC' };
    case 'midi':
      return { reason: 'MIDI is not part of the pad’s action set yet' };
    default:
      return { reason: `"${action.category}" is handled by the app` };
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
    unsupported.push({ layer, where, name: action.name, reason: r.reason });
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
          reason: 'the pad has no hold-to-confirm slot, so this stays in the app',
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
              reason: 'the pad fires one action per key; the tap is the one that was uploaded',
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
