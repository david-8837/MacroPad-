import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, RotateCcw, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { version } from '../../package.json';
import { ENABLE_INTRO } from '../intro/config';
import type { AppTheme } from '../utils/appPreferences';

const scales = [80, 90, 100, 110, 125, 150, 175, 200];
const actionClass = 'inline-flex min-h-9 items-center justify-center gap-2 border border-[#a6a6a2] bg-white px-3 py-2 text-xs font-bold text-[#141414] transition-colors hover:border-[#141414] hover:bg-[#141414] hover:text-white disabled:cursor-not-allowed disabled:opacity-50';

type Props = {
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  openingAnimation: boolean;
  onOpeningAnimationChange: (enabled: boolean) => void;
  preferenceNotice: string;
  safePreview: boolean;
  onSafePreviewChange: (enabled: boolean) => void;
  backupPanel: ReactNode;
  onReset: () => void;
  onOpenWelcome: () => void;
  onReplayIntro: () => void;
  onOpenHelp: () => void;
};

export function SettingsPage({ theme, onThemeChange, openingAnimation, onOpeningAnimationChange, preferenceNotice, safePreview, onSafePreviewChange, backupPanel, onReset, onOpenWelcome, onReplayIntro, onOpenHelp }: Props) {
  const [scale, setScale] = useState<number | null>(null);
  const [scaleBusy, setScaleBusy] = useState(false);
  const readSequence = useRef(0);
  const [scaleMessage, setScaleMessage] = useState('');
  const [motionMessage, setMotionMessage] = useState('');
  const scaleAvailable = !!window.electronAPI?.getViewScale && !!window.electronAPI?.setViewScale;
  useEffect(() => {
    let mounted = true;
    let timer = 0;
    const refresh = () => {
      if (!scaleAvailable) return;
      const sequence = ++readSequence.current;
      window.electronAPI!.getViewScale!().then(value => {
        if (!mounted || sequence !== readSequence.current) return;
        if (Number.isFinite(value) && value > 0) setScale(Math.round(value * 100));
        else setScaleMessage('Could not read the current view size.');
      }).catch(() => { if (mounted && sequence === readSequence.current) setScaleMessage('Could not read the current view size.'); });
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && ['0', '-', '=', '+'].includes(event.key)) {
        window.clearTimeout(timer); timer = window.setTimeout(refresh, 100);
      }
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('keyup', onKeyUp);
    return () => { mounted = false; readSequence.current++; window.clearTimeout(timer); window.removeEventListener('focus', refresh); window.removeEventListener('keyup', onKeyUp); };
  }, [scaleAvailable]);

  const changeScale = async (percent: number) => {
    if (!window.electronAPI?.setViewScale || scaleBusy) return;
    readSequence.current++; setScaleBusy(true); setScaleMessage('');
    try {
      const applied = await window.electronAPI.setViewScale(percent / 100);
      readSequence.current++;
      setScale(Math.round(applied * 100));
      setScaleMessage(`View size set to ${Math.round(applied * 100)}%.`);
    } catch { setScaleMessage('Could not change the view size. Please try again.'); }
    finally { setScaleBusy(false); }
  };

  return (
    <main className="settings-page flex-1 min-w-0 overflow-y-auto bg-[#F4F3F0]" aria-labelledby="settings-title">
      <div className="mx-auto w-full max-w-5xl px-4 py-7 sm:px-7 sm:py-10 lg:px-10">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#c7c7c7] pb-6">
          <div>
            <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-[#1351AA]">ZERO / YOUR WORKSPACE</p>
            <h1 id="settings-title" className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Settings<span className="text-[#1351AA]">.</span></h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#555]">Make ZERO comfortable to use and manage your workspace.</p>
          </div>
          <span className="border border-[#c7c7c7] px-2 py-1 font-mono text-[10px] text-[#555]">VERSION {version}</span>
        </div>

        {preferenceNotice && <p role="alert" className="mt-4 border border-[#e6c894] bg-[#fff5e4] p-3 text-xs font-bold text-[#8a4b00]">{preferenceNotice}</p>}

        <div className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.8fr)]">
          <div className="space-y-5">
            <section aria-labelledby="appearance-heading" className="border border-[#c7c7c7] bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#b8cbe6] bg-[#edf3fb] text-[#1351AA]"><SlidersHorizontal className="h-4 w-4" /></span>
                <div><p className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#555]">01 / APPEARANCE</p><h2 id="appearance-heading" className="mt-1 text-lg font-bold">Appearance</h2><p className="mt-1 text-sm leading-relaxed text-[#555]">Choose a theme and make ZERO comfortable to use.</p></div>
              </div>
              <fieldset className="mt-5 border-t border-[#e5e5e2] pt-4">
                <legend className="sr-only">Theme</legend>
                <p className="mb-2 text-xs font-bold">Theme</p>
                <div className="flex flex-wrap gap-2">
                  {(['light', 'dark'] as const).map(choice => <label key={choice} className={`inline-flex min-h-9 cursor-pointer items-center gap-2 border px-3 py-2 text-xs font-bold ${theme === choice ? 'border-[#1351AA] bg-[#1351AA] text-white' : 'border-[#a6a6a2] bg-white text-[#141414]'}`}>
                    <input type="radio" name="theme" value={choice} checked={theme === choice} onChange={() => onThemeChange(choice)} /> {choice === 'light' ? 'Light' : 'Dark'}
                  </label>)}
                </div>
              </fieldset>
              <p className="mt-4 text-xs leading-relaxed text-[#555]">View size changes ZERO’s interface, not Windows display scaling or your assignments.</p>
              <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-[#e5e5e2] pt-4">
                <div className="min-w-[140px] flex-1 sm:flex-none"><label htmlFor="settings-view-size" className="mb-1.5 block text-xs font-bold">Interface size</label>
                  <select id="settings-view-size" value={scale ?? ''} disabled={!scaleAvailable || scale === null || scaleBusy} onChange={e => void changeScale(Number(e.target.value))} className="min-h-9 w-full border border-[#a6a6a2] bg-white px-3 text-sm disabled:opacity-50">
                    {scale === null && <option value="">{scaleAvailable ? 'Reading…' : 'Desktop app only'}</option>}
                    {scale !== null && !scales.includes(scale) && <option value={scale}>{scale}% (current)</option>}
                    {scales.map(value => <option key={value} value={value}>{value}%{value === 100 ? ' · Default' : ''}</option>)}
                  </select>
                </div>
                <button type="button" className={actionClass} disabled={!scaleAvailable || scaleBusy} onClick={() => void changeScale(100)}><RotateCcw className="h-3.5 w-3.5" /> Reset to 100%</button>
              </div>
              {!scaleAvailable && <p className="mt-3 text-xs text-[#555]">View size controls are available in the ZERO desktop app.</p>}
              <p className="mt-3 text-xs leading-relaxed text-[#555]">Quick reset: <strong>Ctrl + 0</strong> on Windows or <strong>⌘ + 0</strong> on Mac.</p>
              {scaleMessage && <p role="status" className="mt-2 text-xs font-bold text-[#1351AA]">{scaleMessage}</p>}
            </section>

            <section aria-labelledby="animation-heading" className="border border-[#c7c7c7] bg-white p-5 sm:p-6">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#555]">02 / STARTUP</p>
              <div className="mt-1 flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-md"><h2 id="animation-heading" className="text-lg font-bold">Opening animation</h2>
                  <p className="mt-1 text-sm leading-relaxed text-[#555]">Play the cursor introduction when ZERO starts. Turn this off to open the workspace without it.</p>
                  <p className="mt-2 text-xs leading-relaxed text-[#555]">Applies on the next launch. You can still replay it manually. Device Reduce Motion settings take priority.</p></div>
                <button type="button" role="switch" aria-checked={openingAnimation} aria-label="Opening animation" onClick={() => onOpeningAnimationChange(!openingAnimation)} className={`inline-flex min-h-9 items-center gap-2 border px-3 py-2 text-xs font-bold ${openingAnimation ? 'border-[#1351AA] bg-[#1351AA] text-white' : 'border-[#a6a6a2] bg-white text-[#141414] hover:border-[#141414]'}`}>
                  {openingAnimation && <Check className="h-3.5 w-3.5" />} {openingAnimation ? 'On' : 'Off'}
                </button>
              </div>
            </section>

            <section aria-labelledby="preview-heading" className="border border-[#c7c7c7] bg-white p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-[#b8cbe6] bg-[#edf3fb] text-[#1351AA]"><ShieldCheck className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#555]">03 / TESTING</p><h2 id="preview-heading" className="mt-1 text-lg font-bold">Safe preview</h2><p className="mt-1 text-sm leading-relaxed text-[#555]">See what virtual keys and the knob would do without sending their actions to your computer.</p></div>
              </div>
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#e5e5e2] pt-4">
                <p className="max-w-sm text-xs leading-relaxed text-[#555]">Session only · turns off when ZERO restarts. It does not affect the physical pad or other test buttons, or stop actions already started.</p>
                <button type="button" role="switch" aria-checked={safePreview} aria-label="Safe preview" onClick={() => onSafePreviewChange(!safePreview)} className={`inline-flex min-h-9 items-center gap-2 border px-3 py-2 text-xs font-bold ${safePreview ? 'border-[#1351AA] bg-[#1351AA] text-white' : 'border-[#a6a6a2] bg-white text-[#141414] hover:border-[#141414]'}`}>
                  {safePreview && <Check className="h-3.5 w-3.5" />} {safePreview ? 'On' : 'Off'}
                </button>
              </div>
            </section>
          </div>

          <div className="space-y-5">
            {backupPanel}
            <ResetSection onReset={onReset} />
            <section aria-labelledby="getting-started-heading" className="border border-[#c7c7c7] bg-white p-5 sm:p-6">
              <p className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#555]">06 / GETTING STARTED</p>
              <h2 id="getting-started-heading" className="mt-1 text-lg font-bold">Need a hand?</h2>
              <p className="mt-2 text-sm leading-relaxed text-[#555]">Revisit the welcome tour, or find the guide and project information.</p>
              <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={onOpenWelcome} className={actionClass}>Welcome &amp; tour</button><button type="button" onClick={onOpenHelp} className={actionClass}>Help &amp; about</button>
                {ENABLE_INTRO && <button type="button" onClick={() => {
                  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setMotionMessage('Intro is off because Reduce Motion is enabled in your device settings.'); return; }
                  onReplayIntro();
                }} className={actionClass}>Replay intro</button>}
              </div>
              {motionMessage && <p role="status" className="mt-3 text-xs text-[#555]">{motionMessage}</p>}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function ResetSection({ onReset }: { onReset: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  return <section aria-labelledby="reset-heading" className="border border-[#c7c7c7] bg-white p-5 sm:p-6">
    <p className="font-mono text-[9px] font-bold uppercase tracking-[.16em] text-[#555]">05 / RESET</p>
    <h2 id="reset-heading" className="mt-1 text-lg font-bold">Reset ZERO</h2>
    <p className="mt-2 text-sm leading-relaxed text-[#555]">Remove saved layouts, macros, presets, screen and lighting settings, app preferences and cached apps from this computer.</p>
    <p className="mt-2 text-xs leading-relaxed text-[#555]">Your exported backup files and the physical pad are not changed. The pad will disconnect; already-running actions may continue. {window.electronAPI ? 'Local webhook credentials are removed, so existing webhook automations will need the new token. ZERO will close when finished; open it again to start fresh.' : 'In this browser preview, only browser data is reset and the page will reload.'}</p>
    {!confirming ? <button type="button" onClick={() => setConfirming(true)} className={`${actionClass} mt-4`}>Reset saved data</button> :
      <div role="group" aria-label="Confirm reset" className="mt-4 space-y-3 border border-[#aa6200] bg-[#fff5e4] p-3 text-sm text-[#663900]">
        <p><strong>This cannot be undone.</strong> Export a backup first if you want to keep your layout. Type <strong>RESET</strong> to confirm.</p>
        <label htmlFor="reset-confirmation" className="block text-xs font-bold">Type RESET</label>
        <input id="reset-confirmation" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="w-full border border-[#a6a6a2] bg-white px-3 py-2 text-[#141414]" />
        <div className="flex flex-wrap gap-2"><button type="button" disabled={confirmation !== 'RESET'} onClick={onReset} className="min-h-9 border border-[#a23333] bg-[#a23333] px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Delete saved data</button>
        <button type="button" onClick={() => { setConfirming(false); setConfirmation(''); }} className={actionClass}>Cancel</button></div>
      </div>}
  </section>;
}
