import { useEffect, useRef, useState } from 'react';
import { App } from '../App';
import { Intro, IntroBoundary } from '../intro/Intro';
import { clearAppStorage } from '../utils/resetApp';
import { hardwareBridge } from '../utils/hardwareBridge';

/** Unmount the editor and stop its autosave/listeners before deleting data. */
export function ResetRoot() {
  const [mode, setMode] = useState<'app' | 'resetting' | 'error' | 'partial'>('app');
  const [message, setMessage] = useState('');
  const started = useRef(false);
  useEffect(() => {
    if (mode !== 'resetting' || started.current) return;
    started.current = true;
    void (async () => {
      let rollback: (() => void) | undefined;
      let nativePrepared = false;
      try {
        // Stop live pad traffic before clearing anything; never upload or erase the pad.
        await hardwareBridge.disconnect();
        rollback = clearAppStorage(localStorage, sessionStorage);
        const api = window.electronAPI;
        if (api) {
          if (!api.prepareReset || !api.finishReset) throw new Error('The desktop reset service is unavailable.');
          if (!await api.prepareReset()) throw new Error('The desktop reset service did not complete.');
          nativePrepared = true;
          if (!await api.finishReset()) throw new Error('ZERO could not close after reset.');
        } else {
          // Browser preview owns only its scoped browser storage, not native files.
          window.location.reload();
        }
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        if (nativePrepared) {
          setMessage(`Some data was removed, but ZERO could not finish closing. ${text} Quit ZERO from the system tray and open it again.`);
          setMode('partial');
          return;
        }
        try { rollback?.(); setMessage(text); }
        catch { setMessage(`Reset failed and some saved data could not be restored. ${text} Check your backup before continuing.`); }
        setMode('error');
      }
    })();
  }, [mode]);

  if (mode === 'app') return <><App onReset={() => { started.current = false; setMode('resetting'); }} /><IntroBoundary><Intro /></IntroBoundary></>;
  return <main className="min-h-screen bg-[#F4F3F0] p-8 text-[#141414]" aria-live="polite">
    <div className="mx-auto max-w-xl border border-[#C7C7C7] bg-white p-6">
      <p className="font-mono text-xs font-bold text-[#1351AA]">ZERO / RESET</p>
      {mode === 'resetting' ? <><h1 className="mt-3 text-2xl font-bold">Resetting saved data…</h1><p className="mt-3 text-sm">Please keep ZERO open. It will close when the reset is complete.</p></> : <>
        <h1 className="mt-3 text-2xl font-bold">Reset did not finish</h1><p role="alert" className="mt-3 text-sm leading-relaxed">{message}</p>
        {mode === 'error' && <button type="button" onClick={() => { started.current = false; setMode('app'); }} className="mt-4 border border-[#1351AA] bg-[#1351AA] px-4 py-2 text-sm font-bold text-white">Return to ZERO</button>}
      </>}
    </div>
  </main>;
}
