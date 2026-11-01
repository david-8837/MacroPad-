import { Deck, Layer, KeyBinding } from '../types';

/** The deck always carries four layers, numbered 0-3 — the same four pages the
 * firmware stores as channels (CFG_CHANNEL_COUNT). One concept, two names. */
export const LAYER_COUNT = 4;

/** Names this app generated in earlier builds. Renamed on load so a stored deck
 *  picks up the short names without touching a name the user typed. */
const LEGACY_LAYER_NAMES: Record<string, string> = {
  'Edit & Cut Page': 'Edit',
  'Tools & Navigation': 'Tools',
  'Custom Bank': 'Custom',
  'Macro Bank': 'Macros',
};

function shortName(raw: string): string {
  const stripped = raw
    .replace(/\s*\((?:Layer|CH)\s*\d\)\s*$/i, '') /* "… (Layer 1)" */
    .replace(/\s*\(Layer\s*\d\)\s*/i, ' ')
    .trim();
  if (LEGACY_LAYER_NAMES[stripped]) return LEGACY_LAYER_NAMES[stripped];
  /* "Studio Deck (Layer 0)" and friends: the deck name is already on screen. */
  if (/^Studio Deck$/i.test(stripped)) return 'Page';
  return stripped || raw;
}

/**
 * The dial holds one mode per layer — four modes for four layers, numbered from
 * zero like the layers themselves. These are the names the deck ships with; a
 * mode the user renames is left alone.
 */
export const DIAL_MODES = [
  'Layer 0: Master Volume',
  'Layer 1: Timeline Scrub',
  'Layer 2: Focused App Audio',
  'Layer 3: Macro Step',
] as const;

/** Mode lists an earlier build generated, with 1-based numbers and a second,
 *  three-item list on the fourth layer. Translated on load, never written back. */
const LEGACY_DIAL_MODES: Record<string, string> = {
  'Layer 1: Master Volume': DIAL_MODES[0],
  'Layer 2: Timeline Scrub': DIAL_MODES[1],
  'Layer 3: Focused App Audio': DIAL_MODES[2],
  'Layer 4: Macro Step': DIAL_MODES[3],
  'Layer 4: Zoom': DIAL_MODES[3],
  'Layer 4: Scrub': DIAL_MODES[3],
};

/** Point a stored dial at the four shipped modes, keeping the layer it was on. */
function normalizeDialModes(dial: Layer['dial'], layerIdx: number) {
  if (!dial) return;
  const modes = dial.availableModes ?? [];
  const isGenerated = modes.length !== DIAL_MODES.length || modes.some((m) => m in LEGACY_DIAL_MODES);
  if (!isGenerated) return;
  const translated = modes.map((m) => LEGACY_DIAL_MODES[m]).filter(Boolean);
  dial.availableModes = translated.length === DIAL_MODES.length
    ? Array.from(new Set(translated))
    : [...DIAL_MODES];
  const active = LEGACY_DIAL_MODES[dial.activeModeName] ?? dial.activeModeName;
  dial.activeModeName = dial.availableModes.includes(active)
    ? active
    : DIAL_MODES[Math.min(layerIdx, DIAL_MODES.length - 1)];
}

export function createEmptyChannelKeys(channelNum: number): KeyBinding[] {
  const accentColor = channelNum === 1 ? '#1351AA' : channelNum === 2 ? '#1351AA' : '#1351AA';
  return Array.from({ length: 9 }, (_, i) => ({
    keyIndex: i,
    label: `Switch #${i + 1}`,
    sublabel: 'Empty Slot',
    iconName: '',
    accentColor,
    tapAction: null,
    holdAction: null,
    doubleTapAction: null,
  }));
}

/** New or missing layers start with no key bindings. The knob uses pad-native
 * media controls; its hold gesture remains reserved for changing layers. */
function createDefaultDial(index: number): Layer['dial'] {
  const media = (name: string, action: 'volume_up' | 'volume_down' | 'mute') => ({
    id: `default-dial-${index}-${action}`, category: 'media' as const, name,
    payload: { mediaAction: action },
  });
  const modes = Array.from({ length: LAYER_COUNT }, (_, i) => `Layer ${i}: Volume`);
  return {
    label: `Volume · Layer ${index}`, activeModeName: modes[index], availableModes: modes,
    cwAction: media('Volume Up', 'volume_up'), ccwAction: media('Volume Down', 'volume_down'),
    pressAction: media('Mute', 'mute'), accelerationCurve: 'linear', sensitivity: 5, channelHoldThresholdMs: 800,
  };
}

export function normalizeDeckLayers(deck: Deck): Deck {
  const existingLayers = [...deck.layers];

  // Layer 1: Primary
  if (!existingLayers[0]) {
    existingLayers[0] = {
      id: `${deck.id}-layer-1`,
      name: 'Layer 0',
      badge: 'LAYER 0',
      accentColor: '#1351AA',
      dial: createDefaultDial(0),
      keys: createEmptyChannelKeys(1),
    };
  } else {
    existingLayers[0].badge = 'LAYER 0';
    existingLayers[0].name = shortName(existingLayers[0].name);
    normalizeDialModes(existingLayers[0].dial, 0);
    if (existingLayers[0].dial && !existingLayers[0].dial.channelHoldThresholdMs) {
      existingLayers[0].dial.channelHoldThresholdMs = 800;
    }
  }

  // Layer 2: Tools / Secondary (independent keys!)
  if (!existingLayers[1]) {
    existingLayers[1] = {
      id: `${deck.id}-layer-2`,
      name: 'Layer 1',
      badge: 'LAYER 1',
      accentColor: '#1351AA',
      dial: createDefaultDial(1),
      keys: createEmptyChannelKeys(2),
    };
  } else {
    existingLayers[1].badge = 'LAYER 1';
    existingLayers[1].name = shortName(existingLayers[1].name);
    normalizeDialModes(existingLayers[1].dial, 1);
    if (existingLayers[1].dial && !existingLayers[1].dial.channelHoldThresholdMs) {
      existingLayers[1].dial.channelHoldThresholdMs = 800;
    }
  }

  // Layer 3: Custom / Empty Bank (clean slots ready to add custom keys!)
  if (!existingLayers[2]) {
    existingLayers[2] = {
      id: `${deck.id}-layer-3`,
      name: 'Layer 2',
      badge: 'LAYER 2',
      accentColor: '#1351AA',
      dial: createDefaultDial(2),
      keys: createEmptyChannelKeys(3),
    };
  } else {
    existingLayers[2].badge = 'LAYER 2';
    existingLayers[2].name = shortName(existingLayers[2].name);
    normalizeDialModes(existingLayers[2].dial, 2);
    if (existingLayers[2].dial && !existingLayers[2].dial.channelHoldThresholdMs) {
      existingLayers[2].dial.channelHoldThresholdMs = 800;
    }
  }

  // Layer 3: fourth bank — clean slots
  if (!existingLayers[3]) {
    existingLayers[3] = {
      id: `${deck.id}-layer-4`,
      name: 'Layer 3',
      badge: 'LAYER 3',
      accentColor: '#1351AA',
      dial: createDefaultDial(3),
      keys: createEmptyChannelKeys(4),
    };
  } else {
    existingLayers[3].badge = 'LAYER 3';
    existingLayers[3].name = shortName(existingLayers[3].name);
    normalizeDialModes(existingLayers[3].dial, 3);
    if (existingLayers[3].dial && !existingLayers[3].dial.channelHoldThresholdMs) {
      existingLayers[3].dial.channelHoldThresholdMs = 800;
    }
  }

  const finalLayers = existingLayers.slice(0, LAYER_COUNT);
  const isValidActiveLayer = finalLayers.some(l => l.id === deck.activeLayerId);

  return {
    ...deck,
    layers: finalLayers,
    activeLayerId: isValidActiveLayer ? deck.activeLayerId : finalLayers[0].id,
  };
}
