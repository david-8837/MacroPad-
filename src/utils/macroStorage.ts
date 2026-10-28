/* One name for one thing. The macro editor writes this key and the deck's macro
 * execution path reads it; when the two drifted apart, pressing a macro key ran a
 * macro that was not the one on screen.
 *
 * Bumped from 'kadowaz_macros': that key still holds the sixteen invented presets
 * seeded by older builds ("Copy & Paste Helper" in M0 and friends), so leaving it
 * in place would keep showing content the user never wrote. */
export const MACRO_STORAGE_KEY = 'kadowaz_macros_v2';

export interface StoredMacroStep {
  type: 'down' | 'up' | 'combo' | 'text' | 'delay';
  value: string;
  keys?: string[];
  delayMs?: number;
}

export interface StoredMacro {
  id: number;
  name: string;
  actions: StoredMacroStep[];
}
