/* One name for one thing. The macro editor writes this key and the deck's macro
 * execution path reads it; when the two drifted apart, pressing a macro key ran a
 * macro that was not the one on screen.
 *
 * Bumped from 'kadowaz_macros': that key still holds the sixteen invented presets
 * seeded by older builds ("Copy & Paste Helper" in M0 and friends), so leaving it
 * in place would keep showing content the user never wrote. */
import type { ActionDefinition, Deck } from '../types';

export const MACRO_STORAGE_KEY = 'kadowaz_macros_v2';

/** Both native execution and upload must agree on the reserved PC macro form. */
export function isPcMacroBinding(action: ActionDefinition): boolean {
  return action.category === 'macro' ||
    (action.category === 'script' && /^macro:/i.test(action.payload?.command ?? ''));
}

export function pcMacroId(action: ActionDefinition): number | null {
  if (action.category === 'macro') {
    const id = action.payload?.macroId;
    return Number.isInteger(id) && id !== undefined && id >= 0 && id <= 15 ? id : null;
  }
  if (action.category !== 'script') return null;
  const match = /^macro:(?:M)?(0|[1-9]|1[0-5])$/i.exec(action.payload?.command ?? '');
  return match ? Number(match[1]) : null;
}

/** Macro IDs that can actually be reached from this deck. A mapped key tap
 * suppresses separate PC hold/double events; knob hold is pad-owned. */
export function requiredPcMacroIds(deck: Deck): number[] {
  const required = new Set<number>();
  for (const layer of deck.layers) {
    for (const key of layer.keys) {
      const action = key.isDestructiveSafety ? key.safetyConfirmAction : key.tapAction;
      if (action) {
        const id = pcMacroId(action);
        if (id !== null) required.add(id);
      }
    }
    for (const action of [layer.dial?.cwAction, layer.dial?.ccwAction, layer.dial?.pressAction]) {
      if (action) {
        const id = pcMacroId(action);
        if (id !== null) required.add(id);
      }
    }
  }
  return [...required].sort((a, b) => a - b);
}

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

/** A stored M-slot is assignable only when every step has an actual route.
 * The native shell still validates the individual key names at execution. */
export function isMacroReady(macro: Partial<StoredMacro> | null | undefined): boolean {
  return !!macro && Array.isArray(macro.actions) && macro.actions.length > 0 &&
    macro.actions.every(step => step && (
      step.type === 'delay' ||
      (step.type === 'text' && typeof step.value === 'string' && step.value.length > 0) ||
      (step.type === 'combo' && Array.isArray(step.keys) && step.keys.length > 0)
    ));
}
