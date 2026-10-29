import type { Deck } from '../types';

/** Local UI guard. This flag is not a password, device lock or security boundary. */
export function deckIsLocked(deck: Pick<Deck, 'isLocked'>): boolean {
  return deck.isLocked === true;
}

/** All key/knob edits go through this guard, including functional state updates
 * scheduled just before the lock changes. Navigation (the selected preview
 * layer) is intentionally allowed because it does not change bindings. */
export function editDeckWhenUnlocked(deck: Deck, edit: (current: Deck) => Deck): Deck {
  return deckIsLocked(deck) ? deck : edit(deck);
}
