import { Profile, Layer } from '../types';

export const defaultProfiles: Profile[] = [
  {
    id: 'profile-davinci',
    name: 'DaVinci / Premiere NLE',
    icon: 'Video',
    targetProcess: 'resolve.exe',
    windowTitleRegex: 'DaVinci Resolve.*',
    isLocked: false,
    activeLayerId: 'layer-edit',
    layers: [
      {
        id: 'layer-edit',
        name: 'Edit & Cut Page',
        badge: 'EDIT',
        accentColor: '#FF5E00',
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
            accentColor: '#FF5E00',
            tapAction: { id: 'act-blade', category: 'hotkey', name: 'Razor Blade Tool', payload: { keys: ['Ctrl', 'B'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 1,
            label: 'Ripple Del',
            sublabel: 'Shift+Del',
            iconName: 'Trash2',
            accentColor: '#FF3366',
            tapAction: { id: 'act-ripple', category: 'hotkey', name: 'Ripple Delete', payload: { keys: ['Shift', 'Delete'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 2,
            label: 'Play / Pause',
            sublabel: 'Space',
            iconName: 'Play',
            accentColor: '#00F0FF',
            tapAction: { id: 'act-play', category: 'hotkey', name: 'Play / Pause', payload: { keys: ['Space'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 3,
            label: 'Mark In',
            sublabel: 'I',
            iconName: 'ChevronRight',
            accentColor: '#38EF7D',
            tapAction: { id: 'act-in', category: 'hotkey', name: 'Set In Point', payload: { keys: ['I'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 4,
            label: 'Mark Out',
            sublabel: 'O',
            iconName: 'ChevronLeft',
            accentColor: '#38EF7D',
            tapAction: { id: 'act-out', category: 'hotkey', name: 'Set Out Point', payload: { keys: ['O'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 5,
            label: 'Add Marker',
            sublabel: 'M',
            iconName: 'Bookmark',
            accentColor: '#FFB800',
            tapAction: { id: 'act-mark', category: 'hotkey', name: 'Drop Marker', payload: { keys: ['M'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 6,
            label: 'Snapping',
            sublabel: 'N',
            iconName: 'Magnet',
            accentColor: '#A855F7',
            tapAction: { id: 'act-snap', category: 'hotkey', name: 'Toggle Snapping', payload: { keys: ['N'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 7,
            label: 'Fit Screen',
            sublabel: 'Shift+Z',
            iconName: 'Maximize2',
            accentColor: '#06B6D4',
            tapAction: { id: 'act-fit', category: 'hotkey', name: 'Zoom to Fit', payload: { keys: ['Shift', 'Z'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 8,
            label: 'Render Out',
            sublabel: 'Hold 1.5s',
            iconName: 'Film',
            accentColor: '#EC4899',
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
  },
  {
    id: 'profile-obs',
    name: 'OBS Broadcast Deck',
    icon: 'Radio',
    targetProcess: 'obs64.exe',
    windowTitleRegex: 'OBS.*',
    isLocked: false,
    activeLayerId: 'layer-stream',
    layers: [
      {
        id: 'layer-stream',
        name: 'Stream Control',
        badge: 'ON AIR',
        accentColor: '#FF2A2A',
        dial: {
          label: 'Broadcast Audio',
          activeModeName: 'Desktop Audio Mix',
          availableModes: ['Desktop Audio Mix', 'Mic Gain', 'Alert Volume'],
          cwAction: {
            id: 'obs-vol-up',
            category: 'audio_session',
            name: 'Master Vol Up',
            payload: { processName: 'master', audioDelta: 5 }
          },
          ccwAction: {
            id: 'obs-vol-down',
            category: 'audio_session',
            name: 'Master Vol Down',
            payload: { processName: 'master', audioDelta: -5 }
          },
          pressAction: {
            id: 'mic-mute',
            category: 'audio_session',
            name: 'Mute / Unmute Mic',
            payload: { processName: 'focus', toggleMute: true }
          },
          accelerationCurve: 'linear',
          sensitivity: 5
        },
        keys: [
          {
            keyIndex: 0,
            label: 'Scene: Cam',
            sublabel: 'Live 1',
            iconName: 'Camera',
            accentColor: '#00F0FF',
            tapAction: { id: 'sc-cam', category: 'obs', name: 'Switch Scene: Camera', payload: { obsAction: 'switch_scene', obsTarget: 'Full Camera' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 1,
            label: 'Scene: Game',
            sublabel: 'Live 2',
            iconName: 'Gamepad2',
            accentColor: '#38EF7D',
            tapAction: { id: 'sc-game', category: 'obs', name: 'Switch Scene: Gameplay', payload: { obsAction: 'switch_scene', obsTarget: 'Gameplay + Facecam' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 2,
            label: 'Be Right Back',
            sublabel: 'BRB',
            iconName: 'Coffee',
            accentColor: '#FFB800',
            tapAction: { id: 'sc-brb', category: 'obs', name: 'Switch Scene: BRB Screen', payload: { obsAction: 'switch_scene', obsTarget: 'BRB Intermission' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 3,
            label: 'Mute Mic',
            sublabel: 'Hardware',
            iconName: 'MicOff',
            accentColor: '#FF3366',
            tapAction: { id: 'obs-mute-mic', category: 'obs', name: 'Mute Mic Source', payload: { obsAction: 'mute_source', obsTarget: 'Microphone/Aux' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 4,
            label: 'Discord Deafen',
            sublabel: 'Ctrl+Shift+D',
            iconName: 'Headphones',
            accentColor: '#818CF8',
            tapAction: { id: 'disc-deafen', category: 'hotkey', name: 'Toggle Deafen', payload: { keys: ['Ctrl', 'Shift', 'D'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 5,
            label: 'Instant Replay',
            sublabel: 'Save Clip',
            iconName: 'FastForward',
            accentColor: '#F472B6',
            tapAction: { id: 'obs-replay', category: 'hotkey', name: 'Trigger Replay Buffer', payload: { keys: ['F10'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 6,
            label: 'Record Toggle',
            sublabel: 'Local MP4',
            iconName: 'Disc',
            accentColor: '#A855F7',
            tapAction: { id: 'obs-rec', category: 'obs', name: 'Toggle Recording', payload: { obsAction: 'toggle_record' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 7,
            label: 'SFX: Airhorn',
            sublabel: 'Soundboard',
            iconName: 'Volume2',
            accentColor: '#F59E0B',
            tapAction: { id: 'sfx-airhorn', category: 'media', name: 'Play Soundboard SFX', payload: { mediaAction: 'play_pause' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 8,
            label: 'STOP STREAM',
            sublabel: 'Hold 2.0s',
            iconName: 'RadioTower',
            accentColor: '#EF4444',
            isDestructiveSafety: true,
            longPressThresholdMs: 2000,
            tapAction: null,
            holdAction: null,
            doubleTapAction: null,
            safetyConfirmAction: { id: 'obs-end-stream', category: 'obs', name: 'Terminate Stream', payload: { obsAction: 'toggle_stream' } }
          }
        ]
      }
    ]
  },
  {
    id: 'profile-spotify-dj',
    name: 'Spotify & Discord DJ',
    icon: 'Music',
    targetProcess: 'spotify.exe',
    isLocked: false,
    activeLayerId: 'layer-audio',
    layers: [
      {
        id: 'layer-audio',
        name: 'Music & Audio Mixing',
        badge: 'AUDIO',
        accentColor: '#10B981',
        dial: {
          label: 'Rotary Volume',
          activeModeName: 'Spotify Volume',
          availableModes: ['Spotify Volume', 'Discord Chat Vol', 'Master Output'],
          cwAction: {
            id: 'dj-vol-up',
            category: 'audio_session',
            name: 'Spotify Vol Up',
            payload: { processName: 'spotify.exe', audioDelta: 5 }
          },
          ccwAction: {
            id: 'dj-vol-down',
            category: 'audio_session',
            name: 'Spotify Vol Down',
            payload: { processName: 'spotify.exe', audioDelta: -5 }
          },
          pressAction: {
            id: 'dj-press-cycle',
            category: 'navigation',
            name: 'Cycle Audio Mode',
            payload: {}
          },
          accelerationCurve: 'linear',
          sensitivity: 5
        },
        keys: [
          {
            keyIndex: 0,
            label: 'Prev Track',
            sublabel: 'Skip Back',
            iconName: 'SkipBack',
            accentColor: '#10B981',
            tapAction: { id: 'sp-prev', category: 'media', name: 'Previous Song', payload: { mediaAction: 'prev' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 1,
            label: 'Play / Pause',
            sublabel: 'Spotify',
            iconName: 'PlayCircle',
            accentColor: '#10B981',
            tapAction: { id: 'sp-play', category: 'media', name: 'Toggle Playback', payload: { mediaAction: 'play_pause' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 2,
            label: 'Next Track',
            sublabel: 'Skip Next',
            iconName: 'SkipForward',
            accentColor: '#10B981',
            tapAction: { id: 'sp-next', category: 'media', name: 'Next Song', payload: { mediaAction: 'next' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 3,
            label: 'Like Song',
            sublabel: 'Save',
            iconName: 'Heart',
            accentColor: '#F43F5E',
            tapAction: { id: 'sp-like', category: 'hotkey', name: 'Save to Favorites', payload: { keys: ['Alt', 'Shift', 'B'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 4,
            label: 'Shuffle',
            sublabel: 'Toggle',
            iconName: 'Shuffle',
            accentColor: '#8B5CF6',
            tapAction: { id: 'sp-shuffle', category: 'hotkey', name: 'Toggle Shuffle', payload: { keys: ['Ctrl', 'S'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 5,
            label: 'Discord Mute',
            sublabel: 'Ctrl+Shift+M',
            iconName: 'Mic',
            accentColor: '#06B6D4',
            tapAction: { id: 'disc-mute', category: 'hotkey', name: 'Toggle Discord Mic', payload: { keys: ['Ctrl', 'Shift', 'M'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 6,
            label: 'Output Device',
            sublabel: 'Cycle Audio',
            iconName: 'Speaker',
            accentColor: '#3B82F6',
            tapAction: { id: 'dev-cycle', category: 'audio_session', name: 'Cycle Speakers / Headphones', payload: { processName: 'master' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 7,
            label: 'Bass Boost EQ',
            sublabel: 'DSP Toggle',
            iconName: 'Sliders',
            accentColor: '#F59E0B',
            tapAction: { id: 'bass-boost', category: 'media', name: 'Bass Boost Profile', payload: {} },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 8,
            label: 'MUTE ALL',
            sublabel: 'Panic Button',
            iconName: 'VolumeX',
            accentColor: '#EF4444',
            isDestructiveSafety: true,
            longPressThresholdMs: 1200,
            tapAction: null,
            holdAction: null,
            doubleTapAction: null,
            safetyConfirmAction: { id: 'panic-mute', category: 'media', name: 'Mute Master System Audio', payload: { mediaAction: 'mute' } }
          }
        ]
      }
    ]
  },
  {
    id: 'profile-dev',
    name: 'Developer & Terminal',
    icon: 'Terminal',
    targetProcess: 'code.exe',
    windowTitleRegex: '.*Visual Studio Code.*',
    isLocked: false,
    activeLayerId: 'layer-dev',
    layers: [
      {
        id: 'layer-dev',
        name: 'Coding & Git Deck',
        badge: 'DEV',
        accentColor: '#3B82F6',
        dial: {
          label: 'Tab & Editor Scroll',
          activeModeName: 'Tab Switcher',
          availableModes: ['Tab Switcher', 'Font Size', 'Terminal Scroll'],
          cwAction: {
            id: 'tab-next',
            category: 'hotkey',
            name: 'Next Tab',
            payload: { keys: ['Ctrl', 'PageDown'] }
          },
          ccwAction: {
            id: 'tab-prev',
            category: 'hotkey',
            name: 'Previous Tab',
            payload: { keys: ['Ctrl', 'PageUp'] }
          },
          pressAction: {
            id: 'format-doc',
            category: 'hotkey',
            name: 'Format Document',
            payload: { keys: ['Shift', 'Alt', 'F'] }
          },
          accelerationCurve: 'precision_nudge',
          sensitivity: 6
        },
        keys: [
          {
            keyIndex: 0,
            label: 'Git Commit',
            sublabel: 'Quick Stash',
            iconName: 'GitCommit',
            accentColor: '#10B981',
            tapAction: { id: 'git-com', category: 'script', name: 'Git Commit -m "Update"', payload: { shellType: 'powershell', command: 'git add . ; git commit -m "update"' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 1,
            label: 'Run Tests',
            sublabel: 'npm test',
            iconName: 'Play',
            accentColor: '#38EF7D',
            tapAction: { id: 'run-test', category: 'script', name: 'Run Test Runner', payload: { shellType: 'powershell', command: 'npm test' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 2,
            label: 'New Terminal',
            sublabel: 'Ctrl+`',
            iconName: 'TerminalSquare',
            accentColor: '#00F0FF',
            tapAction: { id: 'new-term', category: 'hotkey', name: 'Toggle Terminal', payload: { keys: ['Ctrl', '`'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 3,
            label: 'Format Code',
            sublabel: 'Prettier',
            iconName: 'Code2',
            accentColor: '#F59E0B',
            tapAction: { id: 'fmt-code', category: 'hotkey', name: 'Format Code', payload: { keys: ['Shift', 'Alt', 'F'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 4,
            label: 'Search File',
            sublabel: 'Ctrl+P',
            iconName: 'Search',
            accentColor: '#818CF8',
            tapAction: { id: 'quick-open', category: 'hotkey', name: 'Quick Open', payload: { keys: ['Ctrl', 'P'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 5,
            label: 'Command Pal',
            sublabel: 'Ctrl+Shift+P',
            iconName: 'Command',
            accentColor: '#A855F7',
            tapAction: { id: 'cmd-pal', category: 'hotkey', name: 'Command Palette', payload: { keys: ['Ctrl', 'Shift', 'P'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 6,
            label: 'Docker Up',
            sublabel: 'Compose',
            iconName: 'Box',
            accentColor: '#0284C7',
            tapAction: { id: 'docker-up', category: 'script', name: 'Docker Compose Up', payload: { shellType: 'powershell', command: 'docker compose up -d' } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 7,
            label: 'Snap Screen',
            sublabel: 'Left / Right',
            iconName: 'LayoutGrid',
            accentColor: '#EC4899',
            tapAction: { id: 'win-snap', category: 'hotkey', name: 'Snap Window Left', payload: { keys: ['Win', 'Left'] } },
            holdAction: null,
            doubleTapAction: null
          },
          {
            keyIndex: 8,
            label: 'GIT PUSH',
            sublabel: 'Hold 1.5s',
            iconName: 'GitPullRequest',
            accentColor: '#EF4444',
            isDestructiveSafety: true,
            longPressThresholdMs: 1500,
            tapAction: null,
            holdAction: null,
            doubleTapAction: null,
            safetyConfirmAction: { id: 'git-push', category: 'script', name: 'Git Push Origin', payload: { shellType: 'powershell', command: 'git push' } }
          }
        ]
      }
    ]
  }
];
