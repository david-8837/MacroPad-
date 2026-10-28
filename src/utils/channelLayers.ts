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
    iconName: 'Square',
    accentColor,
    tapAction: null,
    holdAction: null,
    doubleTapAction: null,
  }));
}

export function createChannel2DefaultKeys(deckId: string): KeyBinding[] {
  // Diverse pre-configured tools for Channel 2
  const tools = [
    { label: 'Copy', sub: 'Ctrl+C', key: ['Ctrl', 'C'], icon: 'Copy' },
    { label: 'Paste', sub: 'Ctrl+V', key: ['Ctrl', 'V'], icon: 'Clipboard' },
    { label: 'Cut', sub: 'Ctrl+X', key: ['Ctrl', 'X'], icon: 'Scissors' },
    { label: 'Undo', sub: 'Ctrl+Z', key: ['Ctrl', 'Z'], icon: 'RotateCcw' },
    { label: 'Redo', sub: 'Ctrl+Y', key: ['Ctrl', 'Y'], icon: 'RotateCw' },
    { label: 'Select All', sub: 'Ctrl+A', key: ['Ctrl', 'A'], icon: 'CheckSquare' },
    { label: 'Find', sub: 'Ctrl+F', key: ['Ctrl', 'F'], icon: 'Search' },
    { label: 'Save', sub: 'Ctrl+S', key: ['Ctrl', 'S'], icon: 'Save' },
    { label: 'Lock PC', sub: 'Win+L', key: ['Win', 'L'], icon: 'Lock' },
  ];

  return tools.map((t, idx) => ({
    keyIndex: idx,
    label: t.label,
    sublabel: t.sub,
    iconName: t.icon,
    accentColor: '#1351AA',
    tapAction: {
      id: `${deckId}-ch2-key-${idx}`,
      category: 'hotkey',
      name: t.label,
      payload: { keys: t.key }
    },
    holdAction: null,
    doubleTapAction: null,
  }));
}

export function normalizeDeckLayers(deck: Deck): Deck {
  const existingLayers = [...deck.layers];

  // Layer 1: Primary
  if (!existingLayers[0]) {
    existingLayers[0] = {
      id: `${deck.id}-layer-1`,
      name: 'Edit',
      badge: 'LAYER 0',
      accentColor: '#1351AA',
      dial: {
        label: 'Dial Layer 0',
        activeModeName: DIAL_MODES[0],
        availableModes: [...DIAL_MODES],
        cwAction: { id: `${deck.id}-cw-l1`, category: 'audio_session', name: 'Volume Up (+5%)', payload: { audioDelta: 5 } },
        ccwAction: { id: `${deck.id}-ccw-l1`, category: 'audio_session', name: 'Volume Down (-5%)', payload: { audioDelta: -5 } },
        pressAction: { id: `${deck.id}-press-l1`, category: 'audio_session', name: 'Toggle Mute', payload: { toggleMute: true } },
        accelerationCurve: 'exponential',
        sensitivity: 6,
        channelHoldThresholdMs: 800,
      },
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
      name: 'Tools',
      badge: 'LAYER 1',
      accentColor: '#1351AA',
      dial: {
        label: 'Dial Layer 1',
        activeModeName: DIAL_MODES[1],
        availableModes: [...DIAL_MODES],
        cwAction: { id: `${deck.id}-cw-l2`, category: 'hotkey', name: 'Scrub Forward', payload: { keys: ['ArrowRight'] } },
        ccwAction: { id: `${deck.id}-ccw-l2`, category: 'hotkey', name: 'Scrub Backward', payload: { keys: ['ArrowLeft'] } },
        pressAction: { id: `${deck.id}-press-l2`, category: 'media', name: 'Play / Pause', payload: { mediaAction: 'play_pause' } },
        accelerationCurve: 'exponential',
        sensitivity: 7,
        channelHoldThresholdMs: 800,
      },
      keys: createChannel2DefaultKeys(deck.id),
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
      name: 'Custom',
      badge: 'LAYER 2',
      accentColor: '#1351AA',
      dial: {
        label: 'Dial Layer 2',
        activeModeName: DIAL_MODES[2],
        availableModes: [...DIAL_MODES],
        cwAction: { id: `${deck.id}-cw-l3`, category: 'hotkey', name: 'Zoom In', payload: { keys: ['Control', 'Equal'] } },
        ccwAction: { id: `${deck.id}-ccw-l3`, category: 'hotkey', name: 'Zoom Out', payload: { keys: ['Control', 'Minus'] } },
        pressAction: { id: `${deck.id}-press-l3`, category: 'hotkey', name: 'Reset Zoom', payload: { keys: ['Control', 'Digit0'] } },
        accelerationCurve: 'exponential',
        sensitivity: 5,
        channelHoldThresholdMs: 800,
      },
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
      name: 'Macros',
      badge: 'LAYER 3',
      accentColor: '#1351AA',
      dial: {
        label: 'Dial Layer 3',
        activeModeName: DIAL_MODES[3],
        availableModes: [...DIAL_MODES],
        cwAction: { id: `${deck.id}-cw-l4`, category: 'hotkey', name: 'Next Macro', payload: { keys: ['Control', 'Tab'] } },
        ccwAction: { id: `${deck.id}-ccw-l4`, category: 'hotkey', name: 'Previous Macro', payload: { keys: ['Control', 'Shift', 'Tab'] } },
        pressAction: { id: `${deck.id}-press-l4`, category: 'hotkey', name: 'Run Macro', payload: { keys: ['Enter'] } },
        accelerationCurve: 'exponential',
        sensitivity: 6,
        channelHoldThresholdMs: 800,
      },
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
