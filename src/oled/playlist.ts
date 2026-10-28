// Which screens the panel walks through, and in what order.
//
// The panel has no touchscreen, so "switch mode" is not an event the screen can
// produce. On the device the playlist is advanced by a timer
// (`oled_auto_cycle_s` in cfg_global_t) and by `OLED:NEXT` over USB CDC; the
// desktop simulator uses this exact module for the same walk, so the preview
// cannot invent an order the hardware would not use.
//
// `firmware/src/core/oled_playlist.c` is the C mirror of this file. Both are
// tested against the same rule table in tests/oledModes.test.cjs and
// firmware/tests/test_oled_playlist.c.

import { OLED_MODE_IDS, type OLEDMode } from './modes';

/** Every mode, in catalogue order. */
export const DEFAULT_PLAYLIST: OLEDMode[] = [...OLED_MODE_IDS];

/**
 * Clean a stored playlist: drop unknown ids, drop duplicates, keep catalogue
 * order (the panel walks the playlist, not the order the user clicked), and
 * never return an empty list — an empty playlist would leave the panel stuck.
 *
 * Order is normalised on purpose: `cfg_global_t.oled_playlist` is a bitmask, and
 * a bitmask has no order. Device and host must agree, so the order is the
 * catalogue's.
 */
export function normalizePlaylist(ids: readonly string[] | undefined): OLEDMode[] {
  const wanted = new Set(ids ?? []);
  const kept = OLED_MODE_IDS.filter((id) => wanted.has(id));
  return kept.length > 0 ? kept : [...DEFAULT_PLAYLIST];
}

/** The next playlist entry after `current`. Wraps. */
export function nextInPlaylist(current: OLEDMode, playlist: readonly OLEDMode[]): OLEDMode {
  const list = playlist.length > 0 ? playlist : DEFAULT_PLAYLIST;
  const at = list.indexOf(current);
  if (at === -1) {
    // Current mode is not in the playlist (it was just switched off). Walk into
    // the playlist at the first entry that would have followed it in the
    // catalogue, so the transition still moves forward on screen.
    const cat = OLED_MODE_IDS.indexOf(current);
    return cat === -1 ? list[0] : list.find((id) => OLED_MODE_IDS.indexOf(id) > cat) ?? list[0];
  }
  return list[(at + 1) % list.length];
}

/** The playlist entry before `current`. Used for a counter-clockwise knob turn. */
export function prevInPlaylist(current: OLEDMode, playlist: readonly OLEDMode[]): OLEDMode {
  const list = playlist.length > 0 ? playlist : DEFAULT_PLAYLIST;
  const at = list.indexOf(current);
  if (at === -1) return list[list.length - 1];
  return list[(at - 1 + list.length) % list.length];
}

/** Bit i of the mask means "OLED_MODES[i] is in the playlist". */
export function playlistToMask(playlist: readonly OLEDMode[]): number {
  return playlist.reduce((mask, id) => {
    const i = OLED_MODE_IDS.indexOf(id);
    return i === -1 ? mask : mask | (1 << i);
  }, 0);
}

/**
 * Mask back to ids. `0` means "every mode": that is what a config written by
 * older firmware reads as, since the bytes were padding before this field
 * existed, and it must not black out the panel.
 */
export function maskToPlaylist(mask: number): OLEDMode[] {
  if (mask === 0) return [...DEFAULT_PLAYLIST];
  const kept = OLED_MODE_IDS.filter((_, i) => mask & (1 << i));
  return kept.length > 0 ? kept : [...DEFAULT_PLAYLIST];
}

/** `0` disables automatic switching; anything else is clamped into range. */
export function clampAutoCycleS(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const s = Math.round(seconds);
  if (s <= 0) return 0;
  return Math.min(255, Math.max(3, s));
}
