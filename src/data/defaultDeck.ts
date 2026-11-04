import { Deck } from '../types';
import { normalizeDeckLayers } from '../utils/channelLayers';

/** New installations start with four independent layers and no key bindings. */
export const defaultDeck: Deck = normalizeDeckLayers({
  id: 'deck-main', name: 'Macropad', activeLayerId: 'deck-main-layer-1', layers: [],
});
