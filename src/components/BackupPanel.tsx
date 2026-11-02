import React, { useRef, useState } from 'react';
import type { Deck } from '../types';
import { BACKUP_MAX_BYTES, makeBackup, parseBackup, restoreBackup, type ParsedBackup } from '../utils/backup';
import { AnimatedDetails } from './AnimatedDetails';

export const BackupPanel: React.FC<{ deck: Deck; onRestored: (deck: Deck) => void }> = ({ deck, onRestored }) => {
  const [pending, setPending] = useState<ParsedBackup | null>(null);
  const [message, setMessage] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const download = () => {
    try {
      const backup = makeBackup(deck, localStorage);
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'macropad-backup.json'; link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Backup downloaded. Store it somewhere safe.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not create backup.'); }
  };
  const choose = async (file?: File) => {
    setPending(null); setMessage('');
    if (!file) return;
    try {
      if (file.size > BACKUP_MAX_BYTES) throw new Error('Backup is too large (maximum 8 MiB).');
      setPending(parseBackup(await file.text()));
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Could not read backup.'); }
    if (input.current) input.current.value = '';
  };
  const restore = () => {
    if (!pending) return;
    try { restoreBackup(localStorage, pending); onRestored(pending.deck); setPending(null); setMessage('Restored in the app. The pad was not changed; review before uploading.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Restore failed.'); }
  };
  return <AnimatedDetails className="border-b border-[#C7C7C7] shrink-0" summaryClassName="cursor-pointer px-4 py-3 hover:bg-[#EDECE8]" summary={<span className="eyebrow">Backup &amp; restore</span>}>
    <div className="px-4 pb-4 text-xs space-y-3 text-[#444343]">
      <p>Back up all four layers, knob settings and saved presets. Macros, screen and lighting settings are not included. Files can contain private paths, text and executable actions; use trusted backups only.</p>
      <button onClick={download} className="border border-[#777] px-2 py-1 hover:bg-white">Download backup</button>{' '}
      <button onClick={() => input.current?.click()} className="border border-[#777] px-2 py-1 hover:bg-white">Choose backup</button>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" onChange={e => void choose(e.target.files?.[0])} />
      {pending && <div className="border border-[#1351AA] p-2 space-y-2" role="group" aria-label="Confirm backup restore">
        <p>Replace all four editor layers{pending.presetLibrary ? ' and saved presets' : ''}? {pending.presetLibrary ? 'Existing saved presets will be replaced.' : 'This older deck-only backup leaves presets unchanged.'} This does not upload to the pad. Back up current data first.</p>
        <button onClick={restore} className="bg-[#1351AA] text-white px-2 py-1">Confirm restore</button>{' '}
        <button onClick={() => setPending(null)} className="border border-[#777] px-2 py-1">Cancel</button>
      </div>}
      {message && <p role="status">{message}</p>}
    </div>
  </AnimatedDetails>;
};
