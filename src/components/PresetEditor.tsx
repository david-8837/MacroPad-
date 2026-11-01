import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, Layers } from 'lucide-react';
import { ActionDefinition, KeyBinding } from '../types';
import { LAYER_PRESETS, LayerPreset } from '../data/layerPresets';
import { PRESET_APP_ICONS } from '../data/presetIcons';
import { bindingToKey, keyToBinding } from '../utils/presetLibrary';
import { KeyConfigDrawer } from './KeyConfigDrawer';

interface Props {
  initial: LayerPreset;
  isNew: boolean;
  onSave: (preset: LayerPreset) => boolean;
  onCancel: () => void;
  onTestAction: (action: ActionDefinition) => void;
}

/** Edits a separate draft; opening the key drawer never changes a layer or stored preset. */
export const PresetEditor: React.FC<Props> = ({ initial, isNew, onSave, onCancel, onTestAction }) => {
  const [draft, setDraft] = useState<LayerPreset>(() => JSON.parse(JSON.stringify(initial)) as LayerPreset);
  const [selected, setSelected] = useState<number | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const selectedKey = selected === null ? undefined : draft.keys[selected];
  const binding = useMemo(() => selectedKey && selected !== null ? keyToBinding(selectedKey, selected) : null, [selectedKey, selected]);
  const updateKey = (updated: KeyBinding) => setDraft(current => ({ ...current,
    keys: current.keys.map((key, index) => index === updated.keyIndex ? bindingToKey(updated) : key),
  }));
  const cancel = () => { if (dirty || selected !== null) setDiscardConfirm(true); else onCancel(); };
  const save = () => {
    if (!draft.name.trim()) { setError('Enter a preset name.'); return; }
    setError('');
    const normalized = { ...draft, name: draft.name.trim(), description: draft.description.trim(), note: draft.note.trim() };
    if (!onSave(normalized)) setError('Could not save the preset on this PC. Check storage availability and try again.');
  };
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="preset-editor-title" className="fixed inset-0 z-[80] bg-[#141414]/50 flex items-center justify-center p-3 md:p-6">
      <div className="premium-dialog preset-slide-in w-full max-w-[1200px] h-full max-h-[850px] bg-[#F4F3F0] border border-[#C7C7C7] shadow-xl flex flex-col overflow-hidden">
        <header className="px-5 py-4 border-b border-[#C7C7C7] flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
          <div><p className="eyebrow">YOUR PRESET · DRAFT</p><h2 id="preset-editor-title" className="font-bold text-lg">{isNew ? 'Create preset' : 'Edit preset'}</h2></div>
          <div className="flex gap-2"><button type="button" onClick={cancel} className="border border-[#C7C7C7] px-3 py-2 text-xs font-bold flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" /> Cancel</button>
            <button type="button" onClick={save} disabled={selected !== null} title={selected !== null ? 'Finish editing the selected key first' : undefined} className="premium-action bg-[#1351AA] text-white px-4 py-2 text-xs font-bold flex items-center gap-1 disabled:opacity-50"><Check className="w-3.5 h-3.5" /> Save preset</button></div>
        </header>
        {discardConfirm && <div role="alert" className="px-5 py-2 bg-[#FFF5E4] border-b border-[#E6C894] flex flex-wrap items-center gap-3 text-xs"><span>Discard your unsaved preset changes?</span><button type="button" onClick={onCancel} className="font-bold underline">Discard changes</button><button type="button" onClick={() => setDiscardConfirm(false)} className="font-bold underline">Keep editing</button></div>}
        {error && <p role="alert" className="px-5 py-2 text-xs text-[#A23333] bg-[#FFF0F0]">{error}</p>}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
          <section className="flex-1 min-w-0 p-5 space-y-4 lg:overflow-y-auto" aria-label="Preset details">
            <div><label htmlFor="preset-name" className="block text-[10px] font-bold uppercase tracking-wider mb-1">Preset name</label><input id="preset-name" autoFocus maxLength={80} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. My shortcuts" className="w-full border border-[#C7C7C7] bg-white p-2 text-sm" /></div>
            <div><label htmlFor="preset-description" className="block text-[10px] font-bold uppercase tracking-wider mb-1">Description <span className="font-normal normal-case text-[#646464]">(optional)</span></label><input id="preset-description" maxLength={200} value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} placeholder="What is this preset for?" className="w-full border border-[#C7C7C7] bg-white p-2 text-sm" /></div>
            <div><label htmlFor="preset-note" className="block text-[10px] font-bold uppercase tracking-wider mb-1">Shortcut note <span className="font-normal normal-case text-[#646464]">(optional)</span></label><input id="preset-note" maxLength={200} value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} placeholder="e.g. Windows · application focused" className="w-full border border-[#C7C7C7] bg-white p-2 text-sm" /></div>
            {draft.group === 'Custom' && <div><label htmlFor="preset-icon" className="block text-[10px] font-bold uppercase tracking-wider mb-1">Preset icon</label><select id="preset-icon" value={draft.iconId || ''} onChange={e => setDraft({ ...draft, iconId: e.target.value || undefined })} className="w-full border border-[#C7C7C7] bg-white p-2 text-sm"><option value="">Generic preset icon</option>{LAYER_PRESETS.filter(p => PRESET_APP_ICONS[p.id]).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>}
            <div className="flex items-center gap-2"><Layers className="w-4 h-4 text-[#1351AA]" /><h3 className="text-xs font-bold uppercase tracking-wide">Keys · select one to edit</h3></div>
            <div className="grid grid-cols-3 gap-2" aria-label="Preset keys">{draft.keys.map((key, index) => <button type="button" key={index} onClick={() => setSelected(index)} disabled={selected !== null && selected !== index} aria-label={`Edit key ${index + 1}: ${key.label}`} aria-pressed={selected === index} className={`min-h-[76px] text-left p-2 border ${selected === index ? 'border-[#1351AA] bg-white' : 'border-[#C7C7C7] bg-[#EDECE8] hover:bg-white'} disabled:opacity-60`}><span className="block font-mono text-[9px] text-[#646464]">{String(index + 1).padStart(2,'0')}</span><span className="block text-xs font-bold break-words mt-1">{key.label}</span><span className="block text-[10px] text-[#646464] break-words mt-1">{key.detail}</span></button>)}</div>
            {binding && <div><label htmlFor="preset-key-label" className="block text-[10px] font-bold uppercase tracking-wider mb-1">Key {binding.keyIndex + 1} label</label><input id="preset-key-label" maxLength={80} value={binding.label} onChange={e => updateKey({ ...binding, label: e.target.value })} className="w-full border border-[#C7C7C7] bg-white p-2 text-sm" /></div>}
            <p className="text-[11px] leading-relaxed text-[#646464]">When editing a key, use its “Save Changes” button before switching keys or saving the preset. Click the shortcut field to type physical keystrokes, or use the virtual keyboard. Save the preset here, then choose a layer and use “Save preset to layer”. Nothing is uploaded until you review and upload. Some actions require the desktop app or are not supported by the pad; upload review will identify them.</p>
          </section>
          <aside aria-label="Edit preset key" className="lg:w-[560px] shrink-0 bg-white border-t lg:border-t-0 lg:border-l border-[#C7C7C7] min-h-[520px] lg:min-h-0 overflow-hidden">
            {binding ? <KeyConfigDrawer keyBinding={binding} totalKeys={9} onSave={updateKey} onClose={() => setSelected(null)} onTestAction={onTestAction} captureOnlyWhenFocused hideCloseButton /> : <div className="h-full flex items-center justify-center p-8 text-center text-sm text-[#646464]">Select a key to assign a shortcut, text or another action.</div>}
          </aside>
        </div>
      </div>
    </div>
  );
};
