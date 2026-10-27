import React, { useState, useEffect } from 'react';
import { Profile, Layer, KeyBinding, DialBinding, OLEDState, ActionDefinition, DiscoveredApp } from './types';
import { defaultProfiles } from './data/defaultProfiles';
import { TopNavbar } from './components/TopNavbar';
import { DigitalTwin } from './components/DigitalTwin';
import { KeyConfigDrawer } from './components/KeyConfigDrawer';
import { KnobConfigDrawer } from './components/KnobConfigDrawer';
import { DisplayConfigDrawer } from './components/DisplayConfigDrawer';
import { ShortcutsPanel } from './components/ShortcutsPanel';
import { AppLauncherPanel } from './components/AppLauncherPanel';
import { PCShortcut } from './data/pcShortcuts';
import { normalizeProfileChannels } from './utils/channelLayers';
import { ProfileModal } from './components/ProfileModal';

import { OSDFlyout } from './components/OSDFlyout';
import { ViaKeyTester } from './components/via/ViaKeyTester';
import { ViaLightingPanel } from './components/via/ViaLightingPanel';
import { ViaMacroEditor } from './components/via/ViaMacroEditor';
import { ViaKeycodePicker } from './components/via/ViaKeycodePicker';
import { ViaKeycodeItem } from './data/viaKeycodes';
import { hardwareBridge, HardwareConnectionState, ConnectedDeviceInfo } from './utils/hardwareBridge';
import { executeDeckAction } from './utils/executeDeckAction';
import { WebhookDocPanel } from './components/WebhookDocPanel';
import {
  Terminal,
  Trash2,
} from 'lucide-react';

const SESSION_KEY = 'kadowaz_session';
const OLED_KEY = 'kadowaz_oled';

function loadSession(): { activeProfileId?: string; activeLayerId?: string } {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function loadOledState(fallback: OLEDState): OLEDState {
  try {
    const raw = localStorage.getItem(OLED_KEY);
    if (!raw) return fallback;
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

interface ActionLogItem {
  id: string;
  timestamp: string;
  name: string;
  category: string;
  type: 'success' | 'safety' | 'info';
}

export const App: React.FC = () => {
  // Profiles initialized with 3 independent channels (CH 1, CH 2, CH 3)
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const saved = localStorage.getItem('kadowaz_profiles');
    if (saved) {
      try {
        const parsed: Profile[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(normalizeProfileChannels);
        }
      } catch { /* ignore */ }
    }
    return defaultProfiles.map(normalizeProfileChannels);
  });

  const [activeProfileId, setActiveProfileId] = useState<string>(() => {
    const session = loadSession();
    if (session.activeProfileId && profiles.some((p) => p.id === session.activeProfileId)) {
      return session.activeProfileId;
    }
    return profiles[0]?.id || 'profile-davinci';
  });
  const [activeLayerId, setActiveLayerId] = useState<string>(() => {
    const session = loadSession();
    const profile = profiles.find((p) => p.id === (session.activeProfileId || profiles[0]?.id)) || profiles[0];
    if (session.activeLayerId && profile?.layers.some((l) => l.id === session.activeLayerId)) {
      return session.activeLayerId;
    }
    return profile?.activeLayerId || profile?.layers[0]?.id || 'layer-edit';
  });
  const [selectedKeyIndex, setSelectedKeyIndex] = useState<number | null>(0);
  const [editingKeyBinding, setEditingKeyBinding] = useState<KeyBinding | null>(null);
  const [isEditingKnob, setIsEditingKnob] = useState<boolean>(false);
  const [isEditingDisplay, setIsEditingDisplay] = useState<boolean>(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'designer' | 'tester' | 'shortcuts' | 'apps' | 'lighting' | 'macros'>('designer');
  
  // Hardware Connection State
  const [hardwareState, setHardwareState] = useState<HardwareConnectionState>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<ConnectedDeviceInfo | null>(null);

  // VIA Keycode Assignment Handlers
  const handleAssignViaKeycode = (keyIndex: number, item: ViaKeycodeItem) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfile.id) return p;
      return {
        ...p,
        layers: p.layers.map(l => {
          if (l.id !== activeLayer.id) return l;
          return {
            ...l,
            keys: l.keys.map(k => {
              if (k.keyIndex !== keyIndex) return k;
              return {
                ...k,
                label: item.label,
                sublabel: item.code,
                tapAction: {
                  id: `via-${item.code}-${Date.now()}`,
                  category: item.category === 'media' ? 'media' : 'hotkey',
                  name: item.tooltip,
                  payload: { keys: [item.code] }
                }
              };
            })
          };
        })
      };
    }));
    handleTriggerAction('via-assign', `Assigned ${item.code} to Switch #${keyIndex + 1}`, 'info');
  };

  const handleAssignCustomCode = (keyIndex: number, rawCode: string) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfile.id) return p;
      return {
        ...p,
        layers: p.layers.map(l => {
          if (l.id !== activeLayer.id) return l;
          return {
            ...l,
            keys: l.keys.map(k => {
              if (k.keyIndex !== keyIndex) return k;
              return {
                ...k,
                label: rawCode.slice(0, 6),
                sublabel: rawCode,
                tapAction: {
                  id: `custom-${Date.now()}`,
                  category: 'hotkey',
                  name: `Custom: ${rawCode}`,
                  payload: { keys: [rawCode] }
                }
              };
            })
          };
        })
      };
    }));
    handleTriggerAction('via-custom', `Assigned Custom Keycode ${rawCode} to Switch #${keyIndex + 1}`, 'info');
  };

  const handleAssignPCShortcut = (keyIndex: number, shortcut: PCShortcut) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfile.id) return p;
      return {
        ...p,
        layers: p.layers.map(l => {
          if (l.id !== activeLayer.id) return l;
          return {
            ...l,
            keys: l.keys.map(k => {
              if (k.keyIndex !== keyIndex) return k;
              return {
                ...k,
                label: shortcut.name.slice(0, 8),
                sublabel: shortcut.keys.join('+'),
                tapAction: {
                  id: `pc-${shortcut.id}-${Date.now()}`,
                  category: shortcut.category === 'media' ? 'media' : 'hotkey',
                  name: shortcut.name,
                  payload: { keys: shortcut.keys }
                }
              };
            })
          };
        })
      };
    }));
    handleTriggerAction('shortcut-assign', `Assigned ${shortcut.name} (${shortcut.keys.join('+')}) to Switch #${keyIndex + 1}`, 'info');
  };

  const handleAssignMacro = (keyIndex: number, macroId: number, macroName: string) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfile.id) return p;
      return {
        ...p,
        layers: p.layers.map(l => {
          if (l.id !== activeLayer.id) return l;
          return {
            ...l,
            keys: l.keys.map(k => {
              if (k.keyIndex !== keyIndex) return k;
              return {
                ...k,
                label: `M${macroId}`,
                sublabel: macroName || `Macro ${macroId}`,
                tapAction: {
                  id: `via-macro-${macroId}-${Date.now()}`,
                  category: 'script',
                  name: `Macro M${macroId}: ${macroName}`,
                  payload: { command: `macro:M${macroId}` }
                }
              };
            })
          };
        })
      };
    }));
    handleTriggerAction('macro-assign', `Assigned Macro M${macroId} (${macroName}) to Switch #${keyIndex + 1}`, 'info');
  };

  const [osdVisible, setOsdVisible] = useState(false);
  const [actionLogs, setActionLogs] = useState<ActionLogItem[]>([]);

  // Live OLED state
  const [oledState, setOledState] = useState<OLEDState>(() => loadOledState({
    mode: 'kadowaz',
    cpuLoad: 24,
    gpuLoad: 42,
    ramUsage: 58,
    cpuTemp: 48,
    nowPlayingTrack: 'Starboy',
    nowPlayingArtist: 'The Weeknd',
    isPlaying: true,
    trackProgress: 35,
    audioVULeft: 70,
    audioVURight: 65,
  }));

  // Active Profile & Layer getters
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const activeLayer = activeProfile.layers.find(l => l.id === activeLayerId) || activeProfile.layers[0];
  const activeChannelIdx = Math.max(0, activeProfile.layers.findIndex(l => l.id === activeLayer.id));

  // Keep key editor drawer in sync when switching channels
  useEffect(() => {
    if (editingKeyBinding) {
      const k = activeLayer.keys.find(item => item.keyIndex === editingKeyBinding.keyIndex);
      if (k) setEditingKeyBinding(k);
    }
  }, [activeLayerId]);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('kadowaz_profiles', JSON.stringify(profiles));
  }, [profiles]);

  useEffect(() => {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ activeProfileId, activeLayerId }));
  }, [activeProfileId, activeLayerId]);

  useEffect(() => {
    localStorage.setItem(OLED_KEY, JSON.stringify(oledState));
  }, [oledState]);

  useEffect(() => {
    window.electronAPI?.reportProfiles?.(
      profiles.map((p) => ({ id: p.id, name: p.name })),
      activeProfileId
    );
  }, [profiles, activeProfileId]);

  // App Assignment Handler for Application Library & Launcher
  const handleAssignApp = (
    keyIndex: number,
    app: DiscoveredApp,
    options?: {
      customLabel?: string;
      launchArgs?: string;
      focusExisting?: boolean;
      launchMinimized?: boolean;
      channelIndex?: number;
    }
  ) => {
    const targetChannel = options?.channelIndex !== undefined ? options.channelIndex : activeChannelIdx;
    
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfile.id) return p;
      return {
        ...p,
        layers: p.layers.map((l, lIdx) => {
          if (lIdx !== targetChannel) return l;
          return {
            ...l,
            keys: l.keys.map(k => {
              if (k.keyIndex !== keyIndex) return k;
              return {
                ...k,
                label: options?.customLabel?.trim() || app.name.slice(0, 8),
                sublabel: app.category.toUpperCase(),
                iconName: 'Sparkles',
                tapAction: {
                  id: `app-launch-${Date.now()}`,
                  category: 'app_launch' as const,
                  name: `Launch ${app.name}`,
                  payload: {
                    appId: app.appId || '',
                    appName: app.name,
                    exePath: app.exePath,
                    launchArgs: options?.launchArgs || app.launchArgs || '',
                    focusExisting: options?.focusExisting || false,
                    launchMinimized: options?.launchMinimized || false,
                    iconDataUrl: app.iconDataUrl,
                    targetType: app.targetType,
                    source: app.source,
                  }
                }
              };
            })
          };
        })
      };
    }));

    handleTriggerAction(
      `assign-app-${app.id}`,
      `Assigned ${app.name} to Switch #${keyIndex + 1} (CH ${targetChannel + 1})`,
      'info'
    );
  };

  const pushLog = (name: string, category: string, type: ActionLogItem['type'] = 'success') => {
    setActionLogs(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      name,
      category,
      type,
    }, ...prev.slice(0, 40)]);
  };

  // Action Dispatcher & Native Application Launcher
  const handleTriggerAction = (actionId: string, actionName: string, category: string, payload?: any) => {
    const isSafety = actionName.includes('[SAFETY UNLOCKED]') || actionName.includes('Hold cancelled');
    pushLog(actionName, category, isSafety ? 'safety' : 'success');

    if (category === 'navigation' || category === 'info' || category === 'via-assign') {
      return;
    }

    const action: ActionDefinition = {
      id: actionId,
      category: (category as ActionDefinition['category']) || 'hotkey',
      name: actionName,
      payload: payload || {},
    };

    if (category === 'obs') {
      pushLog('OBS WebSocket is not configured. Assign a hotkey if you control OBS from the deck.', 'obs', 'info');
      return;
    }

    if (category === 'midi') {
      pushLog('MIDI output is not connected in this build. The action was logged only.', 'midi', 'info');
      return;
    }

    void executeDeckAction(action).then((res) => {
      if (!res.success && res.error) {
        if (res.error.includes('Native desktop shell')) {
          pushLog(`[PREVIEW] ${actionName} — native OS injection requires Electron`, category, 'info');
          return;
        }
        pushLog(`[ACTION FAILED] ${res.error}`, category, 'safety');
      }
    });
  };

  // Switch or Cycle Channel across the 3 Channels (CH 1, CH 2, CH 3)
  // This switches the active layer so ALL 9 KEYS switch with the channel!
  const handleCycleDialMode = (explicitChannelIdx?: number) => {
    let nextIdx = 0;
    if (explicitChannelIdx !== undefined && explicitChannelIdx >= 0 && explicitChannelIdx < 3) {
      nextIdx = explicitChannelIdx;
    } else {
      nextIdx = (activeChannelIdx + 1) % 3;
    }

    const targetLayer = activeProfile.layers[nextIdx] || activeProfile.layers[0];
    if (targetLayer) {
      setActiveLayerId(targetLayer.id);

      // If drawer is open, smoothly switch drawer to inspect the same switch on the new channel!
      if (editingKeyBinding) {
        const k = targetLayer.keys.find(item => item.keyIndex === (selectedKeyIndex ?? 0));
        if (k) setEditingKeyBinding(k);
      }
    }

    // Send visual channel stepper update to physical OLED display (e.g. OLED:CH:2)
    hardwareBridge.sendSerialCommand(`OLED:CH:${nextIdx + 1}`);

    handleTriggerAction('channel-switch', `Switched Macropad to Channel ${nextIdx + 1} (${targetLayer?.name || `CH ${nextIdx + 1}`})`, 'navigation');
  };

  // Subscribe to hardware bridge status & input reports from physical microcontroller
  useEffect(() => {
    let hwDialTimer: ReturnType<typeof setTimeout> | null = null;
    let hwDialHoldTriggered = false;

    const unsubState = hardwareBridge.onStateChange((state, info) => {
      setHardwareState(state);
      setDeviceInfo(info);
      if (state === 'connected') {
        handleTriggerAction('mcu-conn', `Connected: ${info?.name || 'Microcontroller'}`, 'info');
      }
    });

    const unsubInput = hardwareBridge.onInputEvent((keyIdx, actionType) => {
      if (keyIdx >= 0 && keyIdx < 9) {
        const k = activeLayer.keys[keyIdx];
        if (!k) return;
        if (actionType === 'down') {
          if (k.isDestructiveSafety && k.safetyConfirmAction) {
            if (hwDialTimer) clearTimeout(hwDialTimer);
            const threshold = k.longPressThresholdMs || 1500;
            hwDialTimer = setTimeout(() => {
              hwDialHoldTriggered = true;
              handleTriggerAction(
                k.safetyConfirmAction!.id,
                `[SAFETY UNLOCKED] ${k.safetyConfirmAction!.name}`,
                k.safetyConfirmAction!.category,
                k.safetyConfirmAction!.payload
              );
            }, threshold);
            return;
          }
          if (k.tapAction) {
            handleTriggerAction(k.tapAction.id, `[HARDWARE] ${k.tapAction.name}`, k.tapAction.category, k.tapAction.payload);
          }
        } else if (actionType === 'up' && k.isDestructiveSafety) {
          if (hwDialTimer) {
            clearTimeout(hwDialTimer);
            hwDialTimer = null;
          }
          if (!hwDialHoldTriggered) {
            handleTriggerAction('safety-aborted', 'Hold cancelled (Threshold not met)', 'hotkey');
          }
          hwDialHoldTriggered = false;
        }
      } else if (keyIdx === 9) { // Rotary dial
        if (actionType === 'dial_cw') {
          handleTriggerAction(activeLayer.dial.cwAction.id, `[HARDWARE] ${activeLayer.dial.cwAction.name}`, activeLayer.dial.cwAction.category, activeLayer.dial.cwAction.payload);
        } else if (actionType === 'dial_ccw') {
          handleTriggerAction(activeLayer.dial.ccwAction.id, `[HARDWARE] ${activeLayer.dial.ccwAction.name}`, activeLayer.dial.ccwAction.category, activeLayer.dial.ccwAction.payload);
        } else if (actionType === 'down') {
          // Hardware switch pressed down -> Start hold detection timer
          hwDialHoldTriggered = false;
          if (hwDialTimer) clearTimeout(hwDialTimer);
          const threshold = activeLayer.dial.channelHoldThresholdMs || 800;
          hwDialTimer = setTimeout(() => {
            hwDialHoldTriggered = true;
            handleCycleDialMode();
            handleTriggerAction('hw-hold-ch', `[HARDWARE HOLD] Channel Switched (${threshold}ms)`, 'navigation');
          }, threshold);
        } else if (actionType === 'up') {
          // Hardware switch released
          if (hwDialTimer) {
            clearTimeout(hwDialTimer);
            hwDialTimer = null;
          }
          if (!hwDialHoldTriggered) {
            // Released early -> Instant Tap Action!
            handleTriggerAction(
              activeLayer.dial.pressAction.id,
              `[HARDWARE TAP] ${activeLayer.dial.pressAction.name}`,
              activeLayer.dial.pressAction.category,
              activeLayer.dial.pressAction.payload
            );
          }
          hwDialHoldTriggered = false;
        }
      }
    });

    const unsubChannel = hardwareBridge.onChannelSwitch((channelIdx) => {
      handleCycleDialMode(channelIdx);
    });

    return () => {
      unsubState();
      unsubInput();
      unsubChannel();
      if (hwDialTimer) clearTimeout(hwDialTimer);
    };
  }, [activeLayer, activeChannelIdx, activeProfile]);

  // Telemetry ticker simulation for CPU/RAM/Track
  useEffect(() => {
    const interval = setInterval(() => {
      setOledState(prev => ({
        ...prev,
        cpuLoad: Math.floor(18 + Math.random() * 25),
        gpuLoad: Math.floor(30 + Math.random() * 35),
        ramUsage: 58 + Math.floor(Math.random() * 4),
        trackProgress: (prev.trackProgress + 0.5) % 100,
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Show transient OSD helper
  const triggerOSDFlyout = () => {
    setOsdVisible(true);
    setTimeout(() => {
      setOsdVisible(false);
    }, 2200);
  };

  // Cycle OLED display mode
  const handleCycleOLEDMode = () => {
    const modes: OLEDState['mode'][] = ['kadowaz', 'system', 'visualizer', 'media', 'channel'];
    const current = modes.includes(oledState.mode) ? oledState.mode : 'kadowaz';
    const nextIdx = (modes.indexOf(current) + 1) % modes.length;
    setOledState(prev => ({ ...prev, mode: modes[nextIdx] }));
    handleTriggerAction('oled-cycle', `OLED Mode: ${modes[nextIdx].toUpperCase()}`, 'navigation');
  };

  // Profile creation
  const handleCreateProfile = (newProfile: Profile) => {
    const normalized = normalizeProfileChannels(newProfile);
    setProfiles(prev => [...prev, normalized]);
    setActiveProfileId(normalized.id);
    setActiveLayerId(normalized.layers[0].id);
    handleTriggerAction('profile-create', `Created Profile: "${normalized.name}"`, 'info');
  };

  // Profile deletion
  const handleDeleteProfile = (profileId: string) => {
    if (profiles.length <= 1) {
      alert('You must have at least one profile.');
      return;
    }
    const filtered = profiles.filter(p => p.id !== profileId);
    setProfiles(filtered);
    if (activeProfileId === profileId) {
      setActiveProfileId(filtered[0].id);
      setActiveLayerId(filtered[0].layers[0].id);
    }
    handleTriggerAction('profile-delete', `Deleted Profile`, 'info');
  };

  // Profile selection
  const handleSelectProfile = (id: string) => {
    setActiveProfileId(id);
    const prof = profiles.find(p => p.id === id);
    if (prof) {
      const layerId = prof.layers.some(l => l.id === prof.activeLayerId)
        ? prof.activeLayerId
        : (prof.layers[0]?.id || '');
      setActiveLayerId(layerId);
    }
    triggerOSDFlyout();
  };

  // Layer selection
  const handleSelectLayer = (id: string) => {
    setActiveLayerId(id);
    triggerOSDFlyout();
  };

  // Export profiles to JSON
  const handleExportProfiles = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(profiles, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `kadowaz_profiles_backup_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    handleTriggerAction('export', 'Exported profile configuration to JSON', 'info');
  };

  // Import profiles from JSON
  const handleImportProfiles = (json: string) => {
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const normalized = parsed.map(normalizeProfileChannels);
        setProfiles(normalized);
        setActiveProfileId(normalized[0].id);
        setActiveLayerId(normalized[0].layers[0].id);
        handleTriggerAction('import', 'Successfully imported profile configuration!', 'info');
      }
    } catch {
      alert('Invalid profile JSON file format.');
    }
  };

  // Key save handler
  const handleSaveKey = (updated: KeyBinding) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfile.id) return p;
      return {
        ...p,
        layers: p.layers.map(l => {
          if (l.id !== activeLayer.id) return l;
          return {
            ...l,
            keys: l.keys.map(k => k.keyIndex === updated.keyIndex ? updated : k)
          };
        })
      };
    }));
    handleTriggerAction('key-save', `Saved Switch #${updated.keyIndex + 1} (${updated.label})`, 'info');
  };

  // Dial / Rotary Encoder Save handler
  const handleSaveDial = (updatedDial: DialBinding) => {
    setProfiles(prev => prev.map(p => {
      if (p.id !== activeProfile.id) return p;
      return {
        ...p,
        layers: p.layers.map(l => {
          if (l.id !== activeLayer.id) return l;
          return {
            ...l,
            dial: updatedDial
          };
        })
      };
    }));
    handleTriggerAction('dial-save', `Saved Dial Configuration (${updatedDial.activeModeName})`, 'info');
  };

  // Sync Keymap to Microcontroller Flash
  // Sync Keymap to Microcontroller Flash (Send to Micro Pad)
  const handleSyncEEPROM = async () => {
    // 1. Validate all 3 channel configurations
    if (!activeProfile.layers || activeProfile.layers.length < 3) {
      handleTriggerAction('sync-fail', 'Profile must contain all 3 independent channels (CH 1, CH 2, CH 3)', 'safety');
      return;
    }

    let totalAppLaunchers = 0;
    const channelSummary = activeProfile.layers.map((layer, chIdx) => {
      const appCount = layer.keys.filter(k => k.tapAction?.category === 'app_launch').length;
      totalAppLaunchers += appCount;
      return `CH ${chIdx + 1}: ${layer.keys.length} keys (${appCount} apps)`;
    });

    handleTriggerAction('sync-validating', `Validating 3 channels: ${channelSummary.join(' • ')}`, 'info');

    // 2. Format protocol packet with all 3 channels
    const encoder = new TextEncoder();
    const packet = encoder.encode(JSON.stringify({
      cmd: 'SYNC_KEYMAP',
      profile: activeProfile.name,
      channels: activeProfile.layers.map((layer, chIdx) => ({
        channel: chIdx + 1,
        name: layer.name,
        keys: layer.keys.map(k => ({
          idx: k.keyIndex,
          label: k.label,
          category: k.tapAction?.category || 'hotkey',
          keys: k.tapAction?.payload?.keys || [],
          appId: k.tapAction?.payload?.appId || (k.tapAction?.category === 'app_launch' ? k.tapAction.payload?.appName : undefined)
        }))
      }))
    }));

    // 3. Attempt transfer over active hardware bridge
    const success = await hardwareBridge.syncKeymapToHardware(packet);
    if (success) {
      handleTriggerAction(
        'sync-eeprom',
        `Synchronized to Micro Pad! (3 Channels, ${totalAppLaunchers} App Launchers bridged with Desktop Companion)`,
        'info'
      );
    } else {
      handleTriggerAction(
        'sync-fail',
        'Device bridge not connected. Connect via USB HID or USB Serial above to send configuration to physical Micro Pad.',
        'safety'
      );
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0C0E14] text-white overflow-hidden">
      {/* Top Application Navbar */}
      <TopNavbar
        profiles={profiles}
        activeProfile={activeProfile}
        activeLayer={activeLayer}
        onSelectProfile={handleSelectProfile}
        onSelectLayer={handleSelectLayer}
        onToggleLock={() => {
          setProfiles(prev => prev.map(p => 
            p.id === activeProfile.id ? { ...p, isLocked: !p.isLocked } : p
          ));
        }}
        onTriggerOSD={triggerOSDFlyout}
        onExportProfiles={handleExportProfiles}
        onImportProfiles={handleImportProfiles}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onOpenProfileModal={() => setIsProfileModalOpen(true)}
        hardwareState={hardwareState}
        deviceInfo={deviceInfo}
        onConnectHID={() => hardwareBridge.connectHID()}
        onConnectSerial={() => hardwareBridge.connectSerial()}
        onDisconnectHardware={() => hardwareBridge.disconnect()}
        onSyncEEPROM={handleSyncEEPROM}
      />

      {/* Main Workspace Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* TAB 1: DECK STUDIO */}
        {activeTab === 'designer' && (
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Digital Twin & Hardware Simulator + VIA Quick Tray */}
            <div className="flex-1 flex flex-col items-center justify-start p-6 border-r border-white/10 overflow-y-auto space-y-4">
              <DigitalTwin
                layer={activeLayer}
                channelIndex={activeChannelIdx}
                oledState={oledState}
                activeProfileName={activeProfile.name}
                selectedKeyIndex={selectedKeyIndex}
                isDrawerKeyOpen={Boolean(editingKeyBinding)}
                isDrawerKnobOpen={isEditingKnob}
                isDrawerDisplayOpen={isEditingDisplay}
                onSelectKey={(idx) => {
                  setSelectedKeyIndex(idx);
                  const k = activeLayer.keys.find(item => item.keyIndex === idx);
                  // If drawer is already open, tapping any key on macropad switches drawer to edit that key!
                  if (editingKeyBinding && k) {
                    setEditingKeyBinding(k);
                  }
                }}
                onOpenDrawer={(idx) => {
                  setIsEditingKnob(false);
                  setIsEditingDisplay(false);
                  const targetIdx = idx ?? selectedKeyIndex ?? 0;
                  setSelectedKeyIndex(targetIdx);
                  const k = activeLayer.keys.find(item => item.keyIndex === targetIdx);
                  if (k) setEditingKeyBinding(k);
                }}
                onOpenKnobDrawer={() => {
                  setEditingKeyBinding(null);
                  setIsEditingDisplay(false);
                  setIsEditingKnob(true);
                }}
                onOpenDisplayDrawer={() => {
                  setEditingKeyBinding(null);
                  setIsEditingKnob(false);
                  setIsEditingDisplay(true);
                }}
                onTriggerAction={handleTriggerAction}
                onCycleOLEDMode={handleCycleOLEDMode}
                onCycleDialMode={handleCycleDialMode}
                connectionStatus={hardwareState === 'connected' ? 'usb_connected' : 'simulator'}
                onToggleConnection={() => {
                  if (hardwareState === 'connected') {
                    hardwareBridge.disconnect();
                  } else {
                    hardwareBridge.connectHID();
                  }
                }}
              />

              {/* VIA Quick Keycode Tray for Instant Switch Remapping */}
              <div className="w-full max-w-[440px]">
                <ViaKeycodePicker
                  selectedKeyIndex={selectedKeyIndex}
                  onAssignKeycode={handleAssignViaKeycode}
                  onAssignCustomCode={handleAssignCustomCode}
                />
              </div>
            </div>

            {/* Right Column: Key Config Drawer OR Knob Config Drawer OR Display Config Drawer OR Switch Inspector + Telemetry */}
            <div className={`w-[620px] xl:w-[660px] shrink-0 flex flex-col bg-[#10131B] overflow-hidden border-l border-white/10 ${
              editingKeyBinding || isEditingKnob || isEditingDisplay ? '' : 'p-4'
            }`}>
              {editingKeyBinding ? (
                <KeyConfigDrawer
                  keyBinding={editingKeyBinding}
                  totalKeys={activeLayer.keys.length}
                  onSelectKeyIndex={(idx) => {
                    setSelectedKeyIndex(idx);
                    const k = activeLayer.keys.find(item => item.keyIndex === idx);
                    if (k) setEditingKeyBinding(k);
                  }}
                  onSave={handleSaveKey}
                  onClose={() => setEditingKeyBinding(null)}
                  onTestAction={(act) => handleTriggerAction(act.id, act.name, act.category, act.payload)}
                />
              ) : isEditingKnob ? (
                <KnobConfigDrawer
                  dial={activeLayer.dial}
                  onSave={handleSaveDial}
                  onClose={() => setIsEditingKnob(false)}
                  onTriggerAction={handleTriggerAction}
                  onSelectChannel={(idx) => handleCycleDialMode(idx)}
                />
              ) : isEditingDisplay ? (
                <DisplayConfigDrawer
                  oledState={oledState}
                  onUpdateOLEDState={(updated) => setOledState(updated)}
                  onClose={() => setIsEditingDisplay(false)}
                  activeProfileName={activeProfile.name}
                  activeLayerName={activeLayer.name}
                  onTriggerAction={handleTriggerAction}
                />
              ) : (
                <>
                  {/* Selected Key Quick Card */}
                  <div className="glass-panel p-4 rounded-2xl border border-white/10 mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-[#FF5E00]">
                          SWITCH INSPECTOR
                        </span>
                        <span className="text-[10px] text-white/40">
                          {selectedKeyIndex !== null ? `#${selectedKeyIndex + 1}` : 'No Switch Selected'}
                        </span>
                      </div>
                      {selectedKeyIndex !== null && (
                        <button
                          onClick={() => {
                            setIsEditingKnob(false);
                            const k = activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex);
                            if (k) setEditingKeyBinding(k);
                          }}
                          className="text-xs font-semibold text-[#FF5E00] hover:underline"
                        >
                          Remap & Record
                        </button>
                      )}
                    </div>

                    {selectedKeyIndex !== null ? (
                      (() => {
                        const k = activeLayer.keys.find(item => item.keyIndex === selectedKeyIndex);
                        if (!k) return null;
                        return (
                          <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between bg-black/40 p-2 rounded-lg">
                              <span className="text-white/60">Legend:</span>
                              <span className="font-semibold text-white">{k.label}</span>
                            </div>
                            <div className="flex items-center justify-between bg-black/40 p-2 rounded-lg">
                              <span className="text-white/60">Assigned Shortcut:</span>
                              <span className="text-[#38EF7D] font-mono font-bold">
                                {k.tapAction?.name || 'Unassigned (Click Remap)'}
                              </span>
                            </div>
                            {k.isDestructiveSafety && (
                              <div className="flex items-center justify-between bg-red-950/40 p-2 rounded-lg border border-red-500/20">
                                <span className="text-red-300 font-semibold">Safety Isolation:</span>
                                <span className="text-red-400 font-mono font-bold">
                                  {((k.longPressThresholdMs || 1500) / 1000).toFixed(1)}s Hold Required
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <p className="text-xs text-white/40 italic">
                        Click any switch on the deck to inspect its shortcut, record new keys, or configure safety.
                      </p>
                    )}
                  </div>

                  {/* Real-time Telemetry & Action Execution Log */}
                  <div className="flex-1 glass-panel p-4 rounded-2xl border border-white/10 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between pb-2 border-b border-white/10 mb-2">
                      <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-[#00F0FF]" />
                        <span className="text-xs font-mono font-bold text-white">
                          ACTION TELEMETRY STREAM
                        </span>
                      </div>
                      <button
                        onClick={() => setActionLogs([])}
                        title="Clear Logs"
                        className="text-white/40 hover:text-white transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Logs Stream */}
                    <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px] pr-1">
                      {actionLogs.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-white/30 text-xs italic">
                          Waiting for hardware input / keystrokes...
                        </div>
                      ) : (
                        actionLogs.map(log => (
                          <div
                            key={log.id}
                            className={`p-2 rounded-lg border flex items-center justify-between animate-in fade-in duration-100 ${
                              log.type === 'safety'
                                ? 'bg-red-950/30 border-red-500/40 text-red-300'
                                : 'bg-[#0E1118] border-white/5 text-white/90'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="text-[9px] text-white/40">{log.timestamp}</span>
                              <span className="font-semibold truncate">{log.name}</span>
                            </div>
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                              {log.category}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: VIA KEY MATRIX TESTER */}
        {activeTab === 'tester' && (
          <div className="flex-1 p-6 overflow-y-auto flex justify-center">
            <div className="w-full max-w-4xl">
              <ViaKeyTester />
            </div>
          </div>
        )}



        {/* TAB 3: PC SHORTCUTS VAULT */}
        {activeTab === 'shortcuts' && (
          <div className="flex-1 overflow-y-auto">
            <ShortcutsPanel
              selectedKeyIndex={selectedKeyIndex}
              onAssignToKey={handleAssignPCShortcut}
              onTriggerAction={handleTriggerAction}
            />
          </div>
        )}

        {/* TAB 4: APPLICATION LIBRARY & SMART LAUNCHER */}
        {activeTab === 'apps' && (
          <div className="flex-1 overflow-hidden">
            <AppLauncherPanel
              selectedKeyIndex={selectedKeyIndex}
              onAssignApp={handleAssignApp}
              onTriggerAction={handleTriggerAction}
              activeChannelIndex={activeChannelIdx}
              onSelectChannel={handleCycleDialMode}
            />
          </div>
        )}

        {/* TAB 5: VIA LIGHTING STUDIO */}
        {activeTab === 'lighting' && (
          <div className="flex-1 p-6 overflow-y-auto flex justify-center">
            <div className="w-full max-w-4xl">
              <ViaLightingPanel />
            </div>
          </div>
        )}

        {/* TAB 5: VIA MACRO STUDIO */}
        {activeTab === 'macros' && (
          <div className="flex-1 p-6 overflow-y-auto flex justify-center">
            <ViaMacroEditor
              selectedKeyIndex={selectedKeyIndex}
              onAssignToKey={handleAssignMacro}
              onTriggerAction={handleTriggerAction}
            />
          </div>
        )}

      </div>



      {/* Profile Creation & Management Modal */}
      <ProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        onCreateProfile={handleCreateProfile}
        onDeleteProfile={handleDeleteProfile}
        currentProfiles={profiles}
      />

      {/* Transient OSD Overlay */}
      <OSDFlyout
        layer={activeLayer}
        profileName={activeProfile.name}
        isVisible={osdVisible}
        onClose={() => setOsdVisible(false)}
      />
    </div>
  );
};
