import { Profile, Layer, KeyBinding } from '../types';

export function createEmptyChannelKeys(channelNum: number): KeyBinding[] {
  const accentColor = channelNum === 1 ? '#FF5E00' : channelNum === 2 ? '#00F0FF' : '#38EF7D';
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

export function createChannel2DefaultKeys(profileId: string): KeyBinding[] {
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
    accentColor: '#00F0FF',
    tapAction: {
      id: `${profileId}-ch2-key-${idx}`,
      category: 'hotkey',
      name: t.label,
      payload: { keys: t.key }
    },
    holdAction: null,
    doubleTapAction: null,
  }));
}

export function normalizeProfileChannels(profile: Profile): Profile {
  const existingLayers = [...profile.layers];

  // Layer 1: Primary
  if (!existingLayers[0]) {
    existingLayers[0] = {
      id: `${profile.id}-layer-1`,
      name: `${profile.name} (Layer 1)`,
      badge: 'Layer 1',
      accentColor: '#FF5E00',
      dial: {
        label: 'Dial Layer 1',
        activeModeName: 'Layer 1: Master Volume',
        availableModes: ['Layer 1: Master Volume', 'Layer 2: Timeline Scrub', 'Layer 3: Focused App Audio'],
        cwAction: { id: `${profile.id}-cw-l1`, category: 'audio_session', name: 'Volume Up (+5%)', payload: { audioDelta: 5 } },
        ccwAction: { id: `${profile.id}-ccw-l1`, category: 'audio_session', name: 'Volume Down (-5%)', payload: { audioDelta: -5 } },
        pressAction: { id: `${profile.id}-press-l1`, category: 'audio_session', name: 'Toggle Mute', payload: { toggleMute: true } },
        accelerationCurve: 'exponential',
        sensitivity: 6,
        channelHoldThresholdMs: 800,
      },
      keys: createEmptyChannelKeys(1),
    };
  } else {
    existingLayers[0].badge = 'Layer 1';
    existingLayers[0].name = existingLayers[0].name.replace(/\(CH 1\)/g, '(Layer 1)');
    if (!existingLayers[0].name.includes('Layer 1')) {
      existingLayers[0].name = `${existingLayers[0].name} (Layer 1)`;
    }
    if (existingLayers[0].dial && !existingLayers[0].dial.channelHoldThresholdMs) {
      existingLayers[0].dial.channelHoldThresholdMs = 800;
    }
  }

  // Layer 2: Tools / Secondary (independent keys!)
  if (!existingLayers[1]) {
    existingLayers[1] = {
      id: `${profile.id}-layer-2`,
      name: `Tools & Navigation (Layer 2)`,
      badge: 'Layer 2',
      accentColor: '#00F0FF',
      dial: {
        label: 'Dial Layer 2',
        activeModeName: 'Layer 2: Timeline Scrub',
        availableModes: ['Layer 1: Master Volume', 'Layer 2: Timeline Scrub', 'Layer 3: Focused App Audio'],
        cwAction: { id: `${profile.id}-cw-l2`, category: 'hotkey', name: 'Scrub Forward', payload: { keys: ['ArrowRight'] } },
        ccwAction: { id: `${profile.id}-ccw-l2`, category: 'hotkey', name: 'Scrub Backward', payload: { keys: ['ArrowLeft'] } },
        pressAction: { id: `${profile.id}-press-l2`, category: 'media', name: 'Play / Pause', payload: { mediaAction: 'play_pause' } },
        accelerationCurve: 'exponential',
        sensitivity: 7,
        channelHoldThresholdMs: 800,
      },
      keys: createChannel2DefaultKeys(profile.id),
    };
  } else {
    existingLayers[1].badge = 'Layer 2';
    existingLayers[1].name = existingLayers[1].name.replace(/\(CH 2\)/g, '(Layer 2)');
    if (!existingLayers[1].name.includes('Layer 2')) {
      existingLayers[1].name = `${existingLayers[1].name} (Layer 2)`;
    }
    if (existingLayers[1].dial && !existingLayers[1].dial.channelHoldThresholdMs) {
      existingLayers[1].dial.channelHoldThresholdMs = 800;
    }
  }

  // Layer 3: Custom / Empty Bank (clean slots ready to add custom keys!)
  if (!existingLayers[2]) {
    existingLayers[2] = {
      id: `${profile.id}-layer-3`,
      name: `Custom Bank (Layer 3)`,
      badge: 'Layer 3',
      accentColor: '#38EF7D',
      dial: {
        label: 'Dial Layer 3',
        activeModeName: 'Layer 3: Focused App Audio',
        availableModes: ['Layer 1: Master Volume', 'Layer 2: Timeline Scrub', 'Layer 3: Focused App Audio'],
        cwAction: { id: `${profile.id}-cw-l3`, category: 'hotkey', name: 'Zoom In', payload: { keys: ['Control', 'Equal'] } },
        ccwAction: { id: `${profile.id}-ccw-l3`, category: 'hotkey', name: 'Zoom Out', payload: { keys: ['Control', 'Minus'] } },
        pressAction: { id: `${profile.id}-press-l3`, category: 'hotkey', name: 'Reset Zoom', payload: { keys: ['Control', 'Digit0'] } },
        accelerationCurve: 'exponential',
        sensitivity: 5,
        channelHoldThresholdMs: 800,
      },
      keys: createEmptyChannelKeys(3),
    };
  } else {
    existingLayers[2].badge = 'Layer 3';
    existingLayers[2].name = existingLayers[2].name.replace(/\(CH 3\)/g, '(Layer 3)');
    if (!existingLayers[2].name.includes('Layer 3')) {
      existingLayers[2].name = `${existingLayers[2].name} (Layer 3)`;
    }
    if (existingLayers[2].dial && !existingLayers[2].dial.channelHoldThresholdMs) {
      existingLayers[2].dial.channelHoldThresholdMs = 800;
    }
  }

  const finalLayers = existingLayers.slice(0, 3);
  const isValidActiveLayer = finalLayers.some(l => l.id === profile.activeLayerId);

  return {
    ...profile,
    layers: finalLayers,
    activeLayerId: isValidActiveLayer ? profile.activeLayerId : finalLayers[0].id,
  };
}
