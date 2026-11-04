import type { Deck, Layer } from '../types';

// In-memory editor history. It intentionally excludes macros, presets,
// lighting, OLED preferences, device writes and backup restore.
export interface DeckHistory { deck: Deck; past: Layer[][]; future: Layer[][] }
export type DeckHistoryAction =
  | { type: 'edit'; update: (deck: Deck) => Deck }
  | { type: 'select'; id: string }
  | { type: 'replace'; deck: Deck }
  | { type: 'undo' | 'redo' };
const LIMIT = 50;
export function createDeckHistory(deck: Deck): DeckHistory { return { deck, past: [], future: [] }; }
export function deckHistoryReducer(state: DeckHistory, action: DeckHistoryAction): DeckHistory {
  switch (action.type) {
    case 'replace': return createDeckHistory(action.deck);
    case 'select':
      return state.deck.activeLayerId === action.id || !state.deck.layers.some(layer => layer.id === action.id)
        ? state : { ...state, deck: { ...state.deck, activeLayerId: action.id } };
    case 'edit': {
      const next = action.update(state.deck);
      // A no-op (including reassigning the same key) must not clear redo.
      if (JSON.stringify(next.layers) === JSON.stringify(state.deck.layers)) {
        return next.activeLayerId === state.deck.activeLayerId ? state : { ...state, deck: next };
      }
      return { deck: next, past: [...state.past, state.deck.layers].slice(-LIMIT), future: [] };
    }
    case 'undo': {
      if (!state.past.length) return state;
      return { deck: { ...state.deck, layers: state.past[state.past.length - 1] }, past: state.past.slice(0, -1), future: [state.deck.layers, ...state.future].slice(0, LIMIT) };
    }
    case 'redo': {
      if (!state.future.length) return state;
      return { deck: { ...state.deck, layers: state.future[0] }, past: [...state.past, state.deck.layers].slice(-LIMIT), future: state.future.slice(1) };
    }
  }
}
