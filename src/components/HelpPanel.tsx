import { useEffect, useRef, useState } from 'react';
import { ENABLE_INTRO } from '../intro/config';
import { version } from '../../package.json';

const LINKS = {
  project: 'https://github.com/david-8837/MacroPad-',
  guide: 'https://github.com/david-8837/MacroPad-/blob/main/docs/USER_GUIDE.md',
  credits: 'https://github.com/david-8837/MacroPad-/blob/main/src/assets/preset-icons/README.md',
} as const;

type LinkId = keyof typeof LINKS;
function openLink(id: LinkId) {
  if (window.electronAPI?.openHelpLink) {
    void window.electronAPI.openHelpLink(id).catch(() => {
      window.alert('Could not open your browser. Please try again.');
    });
  } else {
    window.open(LINKS[id], '_blank', 'noopener,noreferrer');
  }
}

export function HelpPanel({ onClose, onReplayIntro }: { onClose: () => void; onReplayIntro: () => void }) {
  const [motionBlocked, setMotionBlocked] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab' || !dialog) return;
      const buttons = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (!event.shiftKey && (index === -1 || index === buttons.length - 1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('keydown', keydown); previous?.focus(); };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="help-title" tabIndex={-1} className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[#f5f4f0] border border-[#141414] shadow-2xl outline-none">
        <div className="bg-[#141414] text-white px-6 py-5 flex items-start justify-between gap-4">
          <div><p className="font-mono text-[10px] tracking-[.18em] text-[#a8a8a8]">ZERO / DECK STUDIO</p><h2 id="help-title" className="text-xl font-bold mt-1">Help &amp; About</h2><p className="font-mono text-xs text-[#bbb] mt-1">Version {version}</p></div>
          <button type="button" onClick={onClose} aria-label="Close help" className="border border-[#777] px-3 py-1 text-sm hover:bg-white hover:text-black">Close</button>
        </div>
        <div className="p-6 space-y-5 text-sm text-[#343434]">
          <section><h3 className="font-bold text-[#141414]">Get started</h3>
            <ol className="mt-2 space-y-2 list-decimal pl-5 leading-relaxed">
              <li>On <strong>Keys</strong>, choose Layer 0–3. Select a virtual key, open <strong>Configure → Keys</strong> and assign a shortcut, text or app. New layers start empty.</li>
              <li>Turn on <strong>Safe preview</strong> beside the virtual macropad to see what keys and the knob would do without sending their actions. It resets when the app restarts and does not affect the physical pad or other test buttons.</li>
              <li>Use <strong>Undo</strong> and <strong>Redo</strong> beside the virtual macropad for recent layer layout edits. History is session-only and does not include macros, screen settings, lighting or device uploads.</li>
              <li>Try an assigned key on the virtual macropad. Desktop actions need the ZERO app; the feedback below the keys tells you whether a request was sent or failed. The active application still decides what it does.</li>
              <li>Try a ready-made layout on <strong>Presets</strong>, or build a sequence on <strong>Macros</strong>. Save a backup from the left rail whenever you want a copy.</li>
              <li>When your real pad is ready, connect it and use <strong>Upload to deck</strong> after reviewing the bindings. Virtual tests do not prove physical hardware works.</li>
            </ol>
          </section>
          {ENABLE_INTRO && <section className="border-t border-[#c7c7c7] pt-4"><h3 className="font-bold text-[#141414]">Intro animation</h3><p className="mt-1 leading-relaxed">Replay the scripted introduction without changing your settings.</p>
            <button type="button" onClick={() => {
              if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setMotionBlocked(true); return; }
              onReplayIntro();
            }} className="border border-[#999] px-3 py-2 mt-3 text-xs font-bold hover:bg-[#141414] hover:text-white">Replay intro</button>
            {motionBlocked && <p role="status" className="mt-2 text-xs">The intro is off because Reduce Motion is enabled in your device settings.</p>}
          </section>}
          <section className="border-t border-[#c7c7c7] pt-4"><h3 className="font-bold text-[#141414]">Windows Snap layouts</h3><p className="mt-1 leading-relaxed">On Windows 11, hover over the maximize button to choose a Snap layout. Available layouts depend on Windows settings, screen size and scaling.</p></section>
          <section className="border-t border-[#c7c7c7] pt-4"><h3 className="font-bold text-[#141414]">Pad or PC?</h3><p className="mt-1 leading-relaxed">Pad-native bindings run on compatible firmware after upload. Desktop-only actions need this app running and a compatible serial connection; the upload review identifies them and any unsupported bindings.</p></section>
          <section className="border-t border-[#c7c7c7] pt-4"><h3 className="font-bold text-[#141414]">Your data</h3><p className="mt-1 leading-relaxed">Assignments, settings and cached application details are stored on this computer. Backups you export can contain private paths and settings. The desktop app also runs a token-protected webhook on localhost for local automation. Project links open in your browser.</p></section>
          <section className="border-t border-[#c7c7c7] pt-4"><h3 className="font-bold text-[#141414]">Project &amp; credits</h3><p className="mt-1 leading-relaxed">ZERO Deck Studio and its contributors. See the project and asset credits for third-party icon attribution.</p>
            <div className="flex flex-wrap gap-2 mt-3">{([['guide', 'User guide'], ['project', 'Project on GitHub'], ['credits', 'Icon credits']] as const).map(([id, label]) => <button key={id} type="button" onClick={() => openLink(id)} className="border border-[#999] px-3 py-2 text-xs font-bold hover:bg-[#141414] hover:text-white">{label} ↗</button>)}</div>
          </section>
        </div>
      </div>
    </div>
  );
}
