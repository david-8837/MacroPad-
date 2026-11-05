import React, { useRef, useState } from 'react';
import type { Deck } from '../types';
import { BACKUP_MAX_BYTES, makeBackup, parseBackup, restoreBackup, type ParsedBackup } from '../utils/backup';

export const BackupPanel: React.FC<{ deck: Deck; onRestored: (backup: ParsedBackup) => void; exportBlocked?: boolean }> = ({ deck, onRestored, exportBlocked = false }) => {
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
    try { restoreBackup(localStorage, pending); onRestored(pending); setPending(null); setMessage('Restored in the app. Settings were not saved to the pad; connected previews may update. Review before uploading.'); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Restore failed.'); }
  };
  return <section id="backup-restore" aria-labelledby="backup-heading" className="border border-[#c7c7c7] bg-[#e9e8e4] p-5 sm:p-6">
    <p className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#555]">04 / YOUR DATA</p>
    <h2 id="backup-heading" className="mt-1 text-lg font-bold">Backup &amp; restore</h2>
    <div className="mt-3 text-xs space-y-3 text-[#444343]">
      <p><strong>Save a copy:</strong> Download a backup file to keep your layers, knob settings, presets, macros, screen and lighting settings.  <strong>Restore:</strong> Choose that file, review what it replaces, then confirm. Files can contain private paths and actions that type text, open apps or run macro sequences. Only restore backups you trust; unsupported legacy scripts cannot be exported.</p>
      <button onClick={download} disabled={exportBlocked} title={exportBlocked ? 'Some settings could not be read or saved; resolve the storage problem before backing up.' : undefined} className="border border-[#777] px-2 py-1 hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">Download backup</button>{' '}
      <button onClick={() => input.current?.click()} className="border border-[#777] px-2 py-1 hover:bg-white">Choose backup</button>
      <input ref={input} aria-label="Choose a backup file" type="file" accept=".json,application/json" className="sr-only" onChange={e => void choose(e.target.files?.[0])} />
      {pending && <div className="border border-[#1351AA] p-2 space-y-2" role="group" aria-label="Confirm backup restore">
        <p>Replace all four editor layers{pending.presetLibrary ? ' and saved presets' : ''}{pending.extras ? ', macros, screen and lighting settings' : ''}? {pending.extras ? 'Macro sequences and assigned actions may control this computer. Only restore a backup you trust.' : 'This older backup leaves macros, screen and lighting settings unchanged.'} {!pending.presetLibrary && 'This deck-only backup also leaves presets unchanged.'} This does not save settings to the pad; connected previews may update. Back up current data first.</p>
        <button onClick={restore} className="bg-[#1351AA] text-white px-2 py-1">Confirm restore</button>{' '}
        <button onClick={() => setPending(null)} className="border border-[#777] px-2 py-1">Cancel</button>
      </div>}
      {message && <p role="status">{message}</p>}
    </div>
  </section>;
};
