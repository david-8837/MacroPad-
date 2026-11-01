import type { Deck } from '../types';
import { normalizeDeckLayers } from './channelLayers';

/** Restore the one local keymap, including older saved/locked configurations.
 * The removed UI lock must never strand an existing user's assignments. */
export function restoreMacropadConfig(saved: Deck): Deck {
  const normalized = normalizeDeckLayers(saved);
  const { isLocked: _oldLock, ...config } = normalized as Deck & { isLocked?: boolean };
  return { ...config, name: config.name === 'Studio Deck' ? 'Macropad' : config.name };
}
