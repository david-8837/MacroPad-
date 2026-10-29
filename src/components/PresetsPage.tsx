import React, { useState } from 'react';
import { ArrowRight, Check, Layers } from 'lucide-react';
import { Layer } from '../types';
import { LAYER_PRESETS, LayerPreset, PresetGroup } from '../data/layerPresets';

interface Props {
  layers: Layer[];
  activeLayerId: string;
  onApply: (preset: LayerPreset, layerId: string) => void;
  onReviewUpload: () => void;
}

export const PresetsPage: React.FC<Props> = ({ layers, activeLayerId, onApply, onReviewUpload }) => {
  const [presetId, setPresetId] = useState(LAYER_PRESETS[0].id);
  const [group, setGroup] = useState<PresetGroup | 'All'>('All');
  const [layerId, setLayerId] = useState(activeLayerId);
  const [confirm, setConfirm] = useState(false);
  const [saved, setSaved] = useState('');
  const preset = LAYER_PRESETS.find(item => item.id === presetId)!;
  const filteredPresets = group === 'All' ? LAYER_PRESETS : LAYER_PRESETS.filter(item => item.group === group);
  const index = layers.findIndex(layer => layer.id === layerId);
  const target = layers[index];
  const occupied = target?.keys.some(key => key.tapAction || key.holdAction || key.doubleTapAction || key.safetyConfirmAction);
  const apply = () => {
    if (!target) return;
    if (occupied && !confirm) { setConfirm(true); return; }
    onApply(preset, layerId);
    setConfirm(false);
    setSaved(`${preset.name} saved to Layer ${index}`);
  };
  const reset = () => { setConfirm(false); setSaved(''); };
  return (
    <main className="flex-1 overflow-y-auto bg-[#F4F3F0]">
      <div className="max-w-6xl mx-auto p-6 md:p-8 space-y-6">
        <div className="border-b border-[#C7C7C7] pb-5 flex items-start gap-4">
          <div className="w-11 h-11 border border-[#C7C7C7] bg-white flex items-center justify-center shrink-0"><Layers className="w-5 h-5 text-[#1351AA]" /></div>
          <div><p className="eyebrow">READY-MADE LAYERS</p><h1 className="text-2xl font-bold text-[#141414] mt-1">Layer presets</h1>
            <p className="text-sm text-[#646464] mt-1">Choose a set, pick a layer, and upload when you're ready.</p></div>
        </div>
        <p className="text-xs leading-relaxed text-[#646464]">These send keyboard shortcuts to the focused app. Check the preview: default shortcuts can differ by operating system, version, workspace, keyboard layout or custom keymap.</p>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
          <section aria-label="Choose a preset" className="space-y-3">
            <div className="flex flex-wrap gap-1.5" aria-label="Preset categories">
              {(['All', 'General', 'Design', 'Video', 'Coding', 'Office'] as const).map(category => (
                <button key={category} type="button" aria-pressed={group === category} onClick={() => {
                  setGroup(category);
                  setPresetId((category === 'All' ? LAYER_PRESETS[0] : LAYER_PRESETS.find(item => item.group === category)!).id);
                  reset();
                }} className={`px-3 py-1.5 border text-[10px] font-bold uppercase tracking-wide ${group === category ? 'bg-[#141414] border-[#141414] text-white' : 'bg-white border-[#C7C7C7] text-[#444343] hover:border-[#141414]'}`}>{category}</button>
              ))}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredPresets.map((item) => <button key={item.id} type="button" onClick={() => { setPresetId(item.id); reset(); }}
              aria-pressed={presetId === item.id} className={`text-left p-4 border min-h-[118px] transition-colors ${presetId === item.id ? 'border-[#1351AA] bg-white' : 'border-[#C7C7C7] bg-[#EDECE8] hover:bg-white'}`}>
              <span className="font-mono text-[10px] text-[#1351AA]">{item.group.toUpperCase()} · {String(LAYER_PRESETS.findIndex(entry => entry.id === item.id) + 1).padStart(2, '0')} / {String(LAYER_PRESETS.length).padStart(2, '0')}</span>
              <span className="block font-bold text-[#141414] mt-2">{item.name}</span>
              <span className="block text-xs text-[#646464] mt-1 leading-relaxed">{item.description}</span>
            </button>)}
            </div>
          </section>
          <section className="border border-[#C7C7C7] bg-white p-5 space-y-4 lg:sticky lg:top-4" aria-label="Preset preview">
            <div><p className="eyebrow">PREVIEW · 9 KEYS</p><h2 className="font-bold text-[#141414] mt-1">{preset.name}</h2><p className="text-[11px] text-[#646464] mt-1">{preset.note}</p></div>
            <div className="grid grid-cols-3 gap-1.5">{preset.keys.map((key, i) => <div key={i} className="min-h-[62px] bg-[#EDECE8] border border-[#E3E2DE] p-1.5 flex flex-col justify-between"><span className="font-mono text-[9px] text-[#646464]">0{i + 1}</span><span className="text-[10px] font-bold leading-tight text-[#141414]">{key.label}</span><span className="text-[9px] text-[#646464] leading-tight">{key.detail}</span></div>)}</div>
            <div><label htmlFor="preset-layer" className="text-[10px] font-bold uppercase tracking-wider text-[#444343]">Save to layer</label>
              <select id="preset-layer" value={layerId} onChange={e => { setLayerId(e.target.value); reset(); }} className="mt-1.5 w-full border border-[#C7C7C7] bg-white p-2 text-sm text-[#141414]">{layers.map((layer, i) => <option key={layer.id} value={layer.id}>Layer {i}</option>)}</select></div>
            <p className="text-[11px] text-[#646464] leading-relaxed">Replaces all nine keys and their gestures on this layer. Its knob and other layers stay unchanged. Saved on this PC until you upload.</p>
            {confirm && <p role="alert" className="text-xs text-[#8A4B00] bg-[#FFF5E4] border border-[#E6C894] p-2">Layer {index} already has assignments. Apply again to replace them.</p>}
            {saved && <p role="status" className="text-xs text-[#1351AA] flex items-center gap-1"><Check className="w-4 h-4" />{saved}</p>}
            <button type="button" onClick={apply} disabled={!target} className="w-full bg-[#1351AA] text-white px-3 py-2.5 text-xs font-bold disabled:opacity-50">{confirm ? 'Replace layer keys' : 'Save preset to layer'}</button>
            <button type="button" onClick={onReviewUpload} className="w-full border border-[#C7C7C7] text-[#141414] px-3 py-2 text-xs font-bold flex justify-center items-center gap-2 hover:border-[#141414]">Review &amp; upload all layers <ArrowRight className="w-3.5 h-3.5" /></button>
          </section>
        </div>
      </div>
    </main>
  );
};
