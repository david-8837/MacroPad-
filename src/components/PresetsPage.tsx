import React, { useState } from 'react';
import { ArrowRight, Check, Layers, FileText, Globe, Headphones, Navigation, Plus, Pencil } from 'lucide-react';
import { Layer } from '../types';
import { LAYER_PRESETS, LayerPreset, PresetGroup } from '../data/layerPresets';
import { PRESET_APP_ICONS } from '../data/presetIcons';
import { ActionDefinition } from '../types';
import { allPresets, createPreset, newPresetId, PresetLibrary, readPresetLibrary, removePreset, savePreset, writePresetLibrary } from '../utils/presetLibrary';
import { PresetEditor } from './PresetEditor';

const GENERAL_ICONS: Record<string, React.ElementType> = {
  everyday: FileText, browser: Globe, media: Headphones, navigation: Navigation,
};

/** Decorative: the adjacent preset name supplies the accessible label. */
const PresetIcon: React.FC<{ id: string; iconId?: string; large?: boolean }> = ({ id, iconId, large = false }) => {
  const source = PRESET_APP_ICONS[iconId || id];
  const Symbol = GENERAL_ICONS[id] || Layers;
  return (
    <span data-preset-icon={id} aria-hidden="true" className={`${large ? 'w-12 h-12' : 'w-10 h-10'} flex items-center justify-center shrink-0 border border-[#E3E2DE] bg-white p-1.5`}>
      {source ? <img src={source} alt="" className="w-full h-full object-contain" /> : <Symbol className="w-5 h-5 text-[#1351AA]" />}
    </span>
  );
};

interface Props {
  layers: Layer[];
  activeLayerId: string;
  onApply: (preset: LayerPreset, layerId: string) => void;
  onReviewUpload: () => void;
  onTestAction: (action: ActionDefinition) => void;
}

export const PresetsPage: React.FC<Props> = ({ layers, activeLayerId, onApply, onReviewUpload, onTestAction }) => {
  const [presetId, setPresetId] = useState(LAYER_PRESETS[0].id);
  const [group, setGroup] = useState<PresetGroup | 'All'>('All');
  const [loaded] = useState(() => { try { return readPresetLibrary(window.localStorage); } catch { return { library: { version: 1 as const, overrides: {}, custom: [] }, error: 'Local storage is unavailable. Presets cannot be saved.' }; } });
  const [library, setLibrary] = useState<PresetLibrary>(loaded.library);
  const [storageError, setStorageError] = useState<string | null>(loaded.error);
  const [editor, setEditor] = useState<{ preset: LayerPreset; isNew: boolean } | null>(null);
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [layerId, setLayerId] = useState(activeLayerId);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState('');
  const presets = allPresets(library);
  const preset = presets.find(item => item.id === presetId);
  const filteredPresets = group === 'All' ? presets : presets.filter(item => item.group === group);
  const persist = (next: PresetLibrary) => {
    if (loaded.error) { setStorageError(loaded.error); return false; }
    try { writePresetLibrary(window.localStorage, next); setLibrary(next); setStorageError(null); return true; }
    catch { setStorageError('Could not save presets on this PC. Check available storage and try again.'); return false; }
  };
  const index = layers.findIndex(layer => layer.id === layerId);
  const target = layers[index];
  const occupied = target?.keys.some(key => key.tapAction || key.holdAction || key.doubleTapAction || key.safetyConfirmAction);
  const apply = () => {
    if (!target || !preset) return;
    if (occupied && !confirm) { setConfirm(true); return; }
    onApply(preset, layerId);
    setConfirm(false);
    setSaved(`${preset.name} saved to Layer ${index}`);
  };
  const reset = () => { setConfirm(false); setRemoveConfirm(false); setSaved(''); };
  return (
    <main className="flex-1 overflow-y-auto bg-[#F4F3F0]">
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        <div className="border-b border-[#C7C7C7] pb-5 flex flex-wrap items-start gap-4">
          <div className="w-11 h-11 border border-[#C7C7C7] bg-white flex items-center justify-center shrink-0"><Layers className="w-5 h-5 text-[#1351AA]" /></div>
          <div className="flex-1"><p className="eyebrow">READY-MADE LAYERS</p><h1 className="text-2xl font-bold text-[#141414] mt-1">Layer presets</h1>
            <p className="text-sm text-[#646464] mt-1">Choose a set, pick a layer, and upload when you're ready.</p></div>
          <button type="button" disabled={!!loaded.error} onClick={() => setEditor({ preset: createPreset(newPresetId()), isNew: true })} className="shrink-0 bg-[#1351AA] text-white px-3 py-2 text-xs font-bold flex items-center gap-1.5"><Plus className="w-4 h-4" /> Create preset</button>
        </div>
        <p className="text-xs leading-relaxed text-[#646464]">These send keyboard shortcuts to the focused app. Check the preview: default shortcuts can differ by operating system, version, workspace, keyboard layout or custom keymap.</p>
        {storageError && <p role="alert" className="text-xs text-[#A23333] border border-[#D3A24A] bg-[#FFF5E4] p-3">{storageError}</p>}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <section aria-label="Choose a preset" className="space-y-3">
            <div className="flex flex-wrap gap-1.5" aria-label="Preset categories">
              {(['All', 'General', 'Design', 'Video', 'Audio', 'Coding', 'Office', 'Games', 'Custom'] as const).map(category => (
                <button key={category} type="button" aria-pressed={group === category} onClick={() => {
                  setGroup(category);
                  setPresetId((category === 'All' ? presets[0] : presets.find(item => item.group === category))?.id ?? '');
                  reset();
                }} className={`px-3 py-1.5 border text-[10px] font-bold uppercase tracking-wide ${group === category ? 'bg-[#141414] border-[#141414] text-white' : 'bg-white border-[#C7C7C7] text-[#444343] hover:border-[#141414]'}`}>{category === 'Custom' ? 'My presets' : category}</button>
              ))}
            </div>
            {filteredPresets.length === 0 && <p className="border border-dashed border-[#C7C7C7] p-4 text-xs text-[#646464]">No custom presets yet. Choose “Create preset” to make one.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredPresets.map((item) => <button key={item.id} type="button" onClick={() => { setPresetId(item.id); reset(); }}
              aria-pressed={presetId === item.id} className={`text-left p-4 border min-h-[118px] transition-colors ${presetId === item.id ? 'border-[#1351AA] bg-white' : 'border-[#C7C7C7] bg-[#EDECE8] hover:bg-white'}`}>
              <span className="flex items-start gap-3">
                <PresetIcon id={item.id} iconId={item.iconId} />
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[10px] text-[#1351AA]">{item.group === 'Custom' ? 'MY PRESET' : item.group.toUpperCase()} · {String(presets.findIndex(entry => entry.id === item.id) + 1).padStart(2, '0')} / {String(presets.length).padStart(2, '0')}{library.overrides[item.id] ? ' · EDITED' : ''}</span>
                  <span className="block font-bold text-[#141414] mt-1">{item.name}</span>
                  <span className="block text-xs text-[#646464] mt-1 leading-relaxed">{item.description}</span>
                </span>
              </span>
            </button>)}
            </div>
          </section>
          {preset && <section className="border border-[#C7C7C7] bg-white p-5 space-y-4 lg:sticky lg:top-4" aria-label="Preset preview">
            <div className="flex items-start gap-3"><PresetIcon id={preset.id} iconId={preset.iconId} large /><div className="min-w-0"><p className="eyebrow">PREVIEW · 9 KEYS</p><h2 className="font-bold text-[#141414] mt-1">{preset.name}</h2><p className="text-[11px] text-[#646464] mt-1">{preset.note}</p></div></div>
            {preset.group === 'Games' && <p className="text-[11px] text-[#8A4B00] leading-relaxed bg-[#FFF5E4] border border-[#E6C894] p-2">Held keys require updated firmware. Older firmware may only send taps; Full Deck hold support is unverified. Check the game’s controls and test safely.</p>}
            <div className="flex flex-wrap gap-2"><button type="button" disabled={!!loaded.error} onClick={() => { reset(); setEditor({ preset, isNew: false }); }} className="border border-[#C7C7C7] px-2 py-1.5 text-[11px] font-bold flex items-center gap-1"><Pencil className="w-3 h-3" /> Edit preset</button>
              <button type="button" disabled={!!loaded.error} onClick={() => { reset(); setEditor({ preset: { ...JSON.parse(JSON.stringify(preset)), id: newPresetId(), name: `${preset.name.slice(0, 70)} copy`, group: 'Custom', iconId: preset.iconId || (PRESET_APP_ICONS[preset.id] ? preset.id : undefined) }, isNew: true }); }} className="border border-[#C7C7C7] px-2 py-1.5 text-[11px] font-bold">Duplicate</button>
              {(preset.group === 'Custom' || library.overrides[preset.id]) && <button type="button" disabled={!!loaded.error} onClick={() => setRemoveConfirm(true)} className="border border-[#C7C7C7] px-2 py-1.5 text-[11px] font-bold">{preset.group === 'Custom' ? 'Delete' : 'Restore default'}</button>}</div>
            {removeConfirm && <div role="alert" className="text-xs text-[#8A4B00] bg-[#FFF5E4] border border-[#E6C894] p-2 space-y-2"><p>{preset.group === 'Custom' ? 'Delete this custom preset? Existing layers will not change.' : 'Restore this preset’s original shortcuts? Existing layers will not change.'}</p><div className="flex gap-3"><button type="button" className="font-bold underline" onClick={() => { const custom = preset.group === 'Custom'; if (persist(removePreset(library, preset.id))) { if (custom) { setGroup('All'); setPresetId(LAYER_PRESETS[0].id); } reset(); } }}>{preset.group === 'Custom' ? 'Confirm delete' : 'Confirm restore'}</button><button type="button" className="font-bold underline" onClick={() => setRemoveConfirm(false)}>Cancel</button></div></div>}
            <div className="grid grid-cols-3 gap-1.5">{preset.keys.map((key, i) => <div key={i} className="min-h-[62px] bg-[#EDECE8] border border-[#E3E2DE] p-1.5 flex flex-col justify-between"><span className="font-mono text-[9px] text-[#646464]">0{i + 1}</span><span className="text-[10px] font-bold leading-tight text-[#141414]">{key.label}</span><span className="text-[9px] text-[#646464] leading-tight">{key.detail}</span></div>)}</div>
            <div><label htmlFor="preset-layer" className="text-[10px] font-bold uppercase tracking-wider text-[#444343]">Save to layer</label>
              <select id="preset-layer" value={layerId} onChange={e => { setLayerId(e.target.value); reset(); }} className="mt-1.5 w-full border border-[#C7C7C7] bg-white p-2 text-sm text-[#141414]">{layers.map((layer, i) => <option key={layer.id} value={layer.id}>Layer {i}</option>)}</select></div>
            <p className="text-[11px] text-[#646464] leading-relaxed">Replaces all nine keys and their gestures on this layer. Its knob and other layers stay unchanged. Saved on this PC until you upload.</p>
            {confirm && <p role="alert" className="text-xs text-[#8A4B00] bg-[#FFF5E4] border border-[#E6C894] p-2">Layer {index} already has assignments. Apply again to replace them.</p>}
            {saved && <p role="status" className="text-xs text-[#1351AA] flex items-center gap-1"><Check className="w-4 h-4" />{saved}</p>}
            <button type="button" onClick={apply} disabled={!target} className="w-full bg-[#1351AA] text-white px-3 py-2.5 text-xs font-bold disabled:opacity-50">{confirm ? 'Replace layer keys' : 'Save preset to layer'}</button>
            <button type="button" onClick={onReviewUpload} className="w-full border border-[#C7C7C7] text-[#141414] px-3 py-2 text-xs font-bold flex justify-center items-center gap-2 hover:border-[#141414]">Review &amp; upload all layers <ArrowRight className="w-3.5 h-3.5" /></button>
          </section>}
        </div>
      </div>
      {editor && <PresetEditor initial={editor.preset} isNew={editor.isNew} onCancel={() => setEditor(null)} onTestAction={onTestAction} onSave={(updated) => {
        if (!persist(savePreset(library, updated))) return false;
        setPresetId(updated.id); if (updated.group === 'Custom') setGroup('Custom');
        reset(); setEditor(null); return true;
      }} />}
    </main>
  );
};
