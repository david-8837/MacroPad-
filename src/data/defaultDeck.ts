import { Deck } from '../types';

/**
 * The shipped starting deck: one deck, four layers, nine switches.
 *
 * Layer 0 arrives filled with an editing set and is tagged as an example, because
 * an empty deck tells you nothing about what a deck looks like. The other three
 * layers are empty, and the tag disappears the moment you change a key.
 */
export const defaultDeck: Deck = {
  id: 'deck-main',
  name: 'Studio Deck',
  isLocked: false,
  activeLayerId: 'layer-edit',
  layers: [
    {
      id: 'layer-edit',
      name: 'Edit',
      isExample: true,
      badge: 'EDIT',
      accentColor: '#1351AA',
      dial: {
        label: 'Jog-Shuttle Timeline',
        activeModeName: 'Timeline Scrub (Velocity)',
        availableModes: ['Timeline Scrub (Velocity)', 'Zoom Level', 'Track Height'],
        cwAction: {
          id: 'scrub-cw',
          category: 'hotkey',
          name: 'Scrub Forward',
          payload: { keys: ['RightArrow'] }
        },
        ccwAction: {
          id: 'scrub-ccw',
          category: 'hotkey',
          name: 'Scrub Backward',
          payload: { keys: ['LeftArrow'] }
        },
        pressAction: {
          id: 'play-toggle',
          category: 'hotkey',
          name: 'Play / Pause',
          payload: { keys: ['Space'] }
        },
        accelerationCurve: 'exponential',
        sensitivity: 7
      },
      keys: [
        {
          keyIndex: 0,
          label: 'Blade / Cut',
          sublabel: 'Ctrl+B',
          iconName: 'Scissors',
          accentColor: '#1351AA',
          tapAction: { id: 'act-blade', category: 'hotkey', name: 'Razor Blade Tool', payload: { keys: ['Ctrl', 'B'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 1,
          label: 'Ripple Del',
          sublabel: 'Shift+Del',
          iconName: 'Trash2',
          accentColor: '#444343',
          tapAction: { id: 'act-ripple', category: 'hotkey', name: 'Ripple Delete', payload: { keys: ['Shift', 'Delete'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 2,
          label: 'Play / Pause',
          sublabel: 'Space',
          iconName: 'Play',
          accentColor: '#1351AA',
          tapAction: { id: 'act-play', category: 'hotkey', name: 'Play / Pause', payload: { keys: ['Space'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 3,
          label: 'Mark In',
          sublabel: 'I',
          iconName: 'ChevronRight',
          accentColor: '#1351AA',
          tapAction: { id: 'act-in', category: 'hotkey', name: 'Set In Point', payload: { keys: ['I'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 4,
          label: 'Mark Out',
          sublabel: 'O',
          iconName: 'ChevronLeft',
          accentColor: '#1351AA',
          tapAction: { id: 'act-out', category: 'hotkey', name: 'Set Out Point', payload: { keys: ['O'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 5,
          label: 'Add Marker',
          sublabel: 'M',
          iconName: 'Bookmark',
          accentColor: '#1351AA',
          tapAction: { id: 'act-mark', category: 'hotkey', name: 'Drop Marker', payload: { keys: ['M'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 6,
          label: 'Snapping',
          sublabel: 'N',
          iconName: 'Magnet',
          accentColor: '#444343',
          tapAction: { id: 'act-snap', category: 'hotkey', name: 'Toggle Snapping', payload: { keys: ['N'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 7,
          label: 'Fit Screen',
          sublabel: 'Shift+Z',
          iconName: 'Maximize2',
          accentColor: '#1351AA',
          tapAction: { id: 'act-fit', category: 'hotkey', name: 'Zoom to Fit', payload: { keys: ['Shift', 'Z'] } },
          holdAction: null,
          doubleTapAction: null
        },
        {
          keyIndex: 8,
          label: 'Render Out',
          sublabel: 'Hold 1.5s',
          iconName: 'Film',
          accentColor: '#444343',
          isDestructiveSafety: true,
          longPressThresholdMs: 1500,
          tapAction: null,
          holdAction: null,
          doubleTapAction: null,
          safetyConfirmAction: { id: 'act-render', category: 'hotkey', name: 'Export Deliverable', payload: { keys: ['Ctrl', 'Shift', 'R'] } }
        }
      ]
    }
  ]
};
