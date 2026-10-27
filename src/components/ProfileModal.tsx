import React, { useState } from 'react';
import { Profile } from '../types';
import { defaultProfiles } from '../data/defaultProfiles';
import { X, Plus, Sparkles, FolderPlus, Trash2, Check } from 'lucide-react';
import * as LucideIcons from 'lucide-react';

interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProfile: (newProfile: Profile) => void;
  onDeleteProfile: (profileId: string) => void;
  currentProfiles: Profile[];
}

const PROFILE_ICONS = ['Sliders', 'Video', 'Radio', 'Music', 'Terminal', 'Gamepad2', 'Palette', 'Cpu'];

export const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  onCreateProfile,
  onDeleteProfile,
  currentProfiles,
}) => {
  const [profileName, setProfileName] = useState('');
  const [targetProcess, setTargetProcess] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Sliders');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (!profileName.trim()) {
      alert('Please enter a profile name.');
      return;
    }

    let layers = [];
    if (selectedTemplate !== 'blank') {
      const template = defaultProfiles.find(p => p.id === selectedTemplate);
      if (template) {
        layers = JSON.parse(JSON.stringify(template.layers));
      }
    }

    if (layers.length === 0) {
      // Create clean empty 9-key blank layer
      layers = [{
        id: `layer-${Date.now()}`,
        name: 'Default Layer',
        badge: 'L1',
        accentColor: '#FF5E00',
        dial: {
          label: 'Rotary Dial',
          activeModeName: 'Channel 1: Master Volume',
          availableModes: ['Channel 1: Master Volume', 'Channel 2: Scrubbing', 'Channel 3: Active App'],
          cwAction: { id: 'cw-1', category: 'hotkey' as const, name: 'Volume Up', payload: { keys: ['VolumeUp'] } },
          ccwAction: { id: 'ccw-1', category: 'hotkey' as const, name: 'Volume Down', payload: { keys: ['VolumeDown'] } },
          pressAction: { id: 'pr-1', category: 'hotkey' as const, name: 'Mute', payload: { keys: ['VolumeMute'] } },
          accelerationCurve: 'linear' as const,
          sensitivity: 5
        },
        keys: Array.from({ length: 9 }, (_, i) => ({
          keyIndex: i,
          label: `Key ${i + 1}`,
          sublabel: 'Empty',
          iconName: 'Square',
          accentColor: '#FF5E00',
          tapAction: null,
          holdAction: null,
          doubleTapAction: null
        }))
      }];
    }

    const newProfile: Profile = {
      id: `profile-${Date.now()}`,
      name: profileName.trim(),
      icon: selectedIcon,
      targetProcess: targetProcess.trim() || undefined,
      isLocked: false,
      layers,
      activeLayerId: layers[0].id
    };

    onCreateProfile(newProfile);
    setProfileName('');
    setTargetProcess('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-[#141722] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between bg-[#191D2A]">
          <div className="flex items-center gap-2.5">
            <FolderPlus className="w-5 h-5 text-[#FF5E00]" />
            <div>
              <h3 className="font-semibold text-white text-base">Application Profiles Manager</h3>
              <p className="text-xs text-white/50">Create your own custom profile or choose a starter template</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-mono uppercase text-white/60 block mb-1.5">
              Profile Name *
            </label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="e.g. My Game, Photoshop, Blender 3D, Ableton Live"
              className="w-full px-3 py-2 bg-[#0C0E14] border border-white/10 rounded-xl text-sm text-white focus:border-[#FF5E00] focus:outline-hidden"
            />
          </div>

          <div>
            <label className="text-xs font-mono uppercase text-white/60 block mb-1.5">
              Target Application (Auto-Switching)
            </label>
            <input
              type="text"
              value={targetProcess}
              onChange={(e) => setTargetProcess(e.target.value)}
              placeholder="e.g. photoshop.exe, blender.exe (optional)"
              className="w-full px-3 py-2 bg-[#0C0E14] border border-white/10 rounded-xl text-sm text-white font-mono focus:border-[#FF5E00] focus:outline-hidden"
            />
            <p className="text-[10px] text-white/40 mt-1">
              When this app gains window focus, the macropad will automatically switch to this profile.
            </p>
          </div>

          {/* Template Choice */}
          <div>
            <label className="text-xs font-mono uppercase text-white/60 block mb-1.5">
              Starting Layout Template
            </label>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedTemplate('blank')}
                className={`p-2.5 rounded-xl border text-left transition-colors ${
                  selectedTemplate === 'blank'
                    ? 'border-[#FF5E00] bg-[#FF5E00]/10 text-[#FF5E00] font-bold'
                    : 'border-white/10 hover:border-white/20 text-white/70'
                }`}
              >
                <div className="font-semibold">Blank Canvas</div>
                <div className="text-[10px] text-white/40 font-normal">Fresh clean slate with 9 blank keys</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('profile-davinci')}
                className={`p-2.5 rounded-xl border text-left transition-colors ${
                  selectedTemplate === 'profile-davinci'
                    ? 'border-[#FF5E00] bg-[#FF5E00]/10 text-[#FF5E00] font-bold'
                    : 'border-white/10 hover:border-white/20 text-white/70'
                }`}
              >
                <div className="font-semibold">Video Editor (NLE)</div>
                <div className="text-[10px] text-white/40 font-normal">Cut, Ripple, In/Out, Jog Scrub</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('profile-obs')}
                className={`p-2.5 rounded-xl border text-left transition-colors ${
                  selectedTemplate === 'profile-obs'
                    ? 'border-[#FF5E00] bg-[#FF5E00]/10 text-[#FF5E00] font-bold'
                    : 'border-white/10 hover:border-white/20 text-white/70'
                }`}
              >
                <div className="font-semibold">Stream Deck (OBS)</div>
                <div className="text-[10px] text-white/40 font-normal">Scenes, Mute, Record, Stream</div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedTemplate('profile-spotify-dj')}
                className={`p-2.5 rounded-xl border text-left transition-colors ${
                  selectedTemplate === 'profile-spotify-dj'
                    ? 'border-[#FF5E00] bg-[#FF5E00]/10 text-[#FF5E00] font-bold'
                    : 'border-white/10 hover:border-white/20 text-white/70'
                }`}
              >
                <div className="font-semibold">Audio & Discord DJ</div>
                <div className="text-[10px] text-white/40 font-normal">Volume mix, Spotify, Discord</div>
              </button>
            </div>
          </div>

          {/* Existing Profiles & Deletion */}
          {currentProfiles.length > 1 && (
            <div className="pt-2">
              <label className="text-xs font-mono uppercase text-white/50 block mb-1">
                Existing Custom Profiles
              </label>
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {currentProfiles.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 rounded-lg bg-black/40 border border-white/5 text-xs">
                    <span className="font-medium text-white">{p.name}</span>
                    <button
                      onClick={() => onDeleteProfile(p.id)}
                      title="Delete Profile"
                      className="text-red-400 hover:text-red-300 p-1 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-end gap-2 bg-[#191D2A]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-white/10 text-xs text-white/60 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-1.5 rounded-xl bg-[#FF5E00] text-black font-bold text-xs hover:bg-[#FF6A00] flex items-center gap-1.5 shadow-md transition-transform active:scale-95"
          >
            <Check className="w-3.5 h-3.5" /> Create Profile
          </button>
        </div>
      </div>
    </div>
  );
};
