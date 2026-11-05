import React, { useState, useEffect, useRef } from 'react';
import { playKeyClick } from '../../utils/soundEffects';
import { clearHeldKeys, createTesterState, ignoreKeyTesterTarget, reduceTesterEvent } from '../../utils/keyTesterModel';
import { 
  Keyboard as KeyboardIcon, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Activity,
  ArrowUp, ArrowDown, ArrowLeft, ArrowRight
} from 'lucide-react';

import {
  KeyboardKeyDef as KeyDef,
  MAIN_ROW_0,
  MAIN_ROW_1,
  MAIN_ROW_2,
  MAIN_ROW_3,
  MAIN_ROW_4,
  MAIN_ROW_5,
  NAV_ROW_0,
  NAV_ROW_1,
  NAV_ROW_2,
  ARROW_ROW_4,
  ARROW_ROW_5,
  NUMPAD_ROW_0,
  NUMPAD_GRID_KEYS,
} from '../../data/keyboardLayouts';
export type { KeyDef };

export const ViaKeyTester: React.FC = () => {
  const [layoutMode, setLayoutMode] = useState<'full' | 'tkl' | '60'>('full');
  const [tester, setTester] = useState(createTesterState);
  const testerRef = useRef<HTMLElement>(null);
  const [soundProfile, setSoundProfile] = useState<'thock' | 'click' | 'silent'>('thock');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const { activeKeys, testedKeys, keydownEvents, pressEvents, repeatEvents, lastKey } = tester;
  const testedCount = Object.keys(testedKeys).length;

  useEffect(() => {
    // Start with the tester surface focused so Space and arrow keys can be
    // observed without scrolling the page. Controls remain keyboard usable.
    testerRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (ignoreKeyTesterTarget(e.target)) return;
      // Only suppress unmodified scrolling keys on the non-interactive testing
      // surface. Never cancel shortcuts, buttons, links or form controls.
      const target = e.target instanceof Element ? e.target : null;
      const interactive = target?.closest('button, a, input, select, textarea, [contenteditable], [role="button"], [role="link"], [data-tester-scroll]');
      const onSurface = target === document.body || Boolean(target && testerRef.current?.contains(target));
      if (onSurface && !interactive && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey &&
          ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.code)) {
        e.preventDefault();
      }
      // Observe OS-delivered events; no pad scan or USB timing is inferred.
      setTester(prev => reduceTesterEvent(prev, { type: 'down', code: e.code, key: e.key, repeat: e.repeat }));
      if (!e.repeat && soundEnabled) {
        if (soundProfile === 'thock') playKeyClick('heavy');
        else if (soundProfile === 'click') playKeyClick('down');
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // A key may be released after focus moves into a form control. Clear it
      // without counting form input or playing a sound for that release.
      const ignoredTarget = ignoreKeyTesterTarget(e.target);
      setTester(prev => reduceTesterEvent(prev, { type: 'up', code: e.code, key: e.key, repeat: e.repeat }));
      if (!ignoredTarget && soundEnabled && soundProfile !== 'silent') playKeyClick('up');
    };
    const handleBlur = () => setTester(prev => clearHeldKeys(prev));

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [soundEnabled, soundProfile]);

  const focusTesterAfterPointer = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) testerRef.current?.focus({ preventScroll: true });
  };
  const resetTester = (event: React.MouseEvent<HTMLButtonElement>) => {
    setTester(createTesterState());
    focusTesterAfterPointer(event);
  };

  // A visual reference, not clickable controls or evidence of a device scan.
  const renderKey = (k: KeyDef, gridArea?: string) => {
    if (k.code.startsWith('spacer-')) {
      return <div key={k.code} style={{ width: `${(k.width || 1) * 32}px` }} className="pointer-events-none shrink-0" />;
    }
    const isDown = activeKeys.has(k.code);
    const info = testedKeys[k.code];
    const state = isDown ? 'held' : info ? 'tested' : 'idle';
    const ArrowIcon = ({ ArrowUp, ArrowDown, ArrowLeft, ArrowRight } as Record<string, React.ElementType>)[k.code];
    return <div key={k.code} data-code={k.code} data-state={state} title={k.code}
      style={gridArea ? { gridArea } : { width: `${(k.width || 1) * 32}px`, height: '32px' }}
      className="tester-key shrink-0 flex flex-col justify-between p-1 font-mono text-[10px] font-bold border relative select-none">
      <div className="flex items-center justify-between gap-0.5 w-full leading-none px-0.5 min-w-0">
        <span className="truncate">{ArrowIcon ? <ArrowIcon className="w-3 h-3" /> : k.label}</span>
        {k.subLabel && <span className="tester-sublabel text-[8px]">{k.subLabel}</span>}
      </div>
      {info && <span className="tester-count text-[7px] font-mono leading-none font-normal">{info.pressCount}x</span>}
    </div>;
  };

  const observed = Object.values(testedKeys);
  return (
    <main ref={testerRef} tabIndex={-1} className="w-full max-w-6xl mx-auto space-y-6 outline-none">
      <header className="border-b border-[#C7C7C7] pb-5 flex items-start gap-4">
        <div className="w-11 h-11 border border-[#C7C7C7] bg-white flex items-center justify-center shrink-0 tester-header-icon"><KeyboardIcon className="w-5 h-5 text-[#1351AA]" /></div>
        <div className="min-w-0 flex-1">
          <p className="eyebrow">WINDOW KEY EVENTS</p>
          <h1 className="text-2xl font-bold text-[#141414] mt-1">Key tester</h1>
          <p className="text-sm text-[#646464] mt-1">Press and hold keys to see what this window receives.</p>
        </div>
        <button type="button" onClick={resetTester} className="tester-reset shrink-0 flex items-center gap-1.5 px-3 py-2 border border-[#C7C7C7] bg-white text-xs font-bold text-[#444343] hover:border-[#141414]">
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /><span>Reset events</span>
        </button>
      </header>

      <div className="tester-guide border border-[#C7C7C7] bg-white p-4 flex items-start gap-3">
        <Activity className="w-4 h-4 text-[#1351AA] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-[#444343]"><strong className="text-[#141414]">What this shows:</strong> OS keyboard events delivered to this focused window, from any keyboard. It cannot identify the source device or measure hardware scan/USB latency or switch chatter. Some system shortcuts may be captured by the OS instead.</p>
      </div>

      <section aria-label="Event summary" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[{ label: 'Codes observed', value: testedCount, detail: 'unique codes' },
          { label: 'Fresh keydowns', value: pressEvents, detail: 'excluding repeats' },
          { label: 'Held in window', value: activeKeys.size, detail: 'keys currently down' },
          { label: 'OS auto-repeat', value: repeatEvents, detail: 'repeat events' }].map(item =>
          <div key={item.label} className="tester-stat border border-[#C7C7C7] bg-white p-4 min-w-0">
            <p className="eyebrow">{item.label}</p><p className="font-mono text-xl font-bold text-[#1351AA] mt-2">{item.value}</p><p className="text-[10px] text-[#646464] mt-1">{item.detail}</p>
          </div>)}
      </section>

      <section className="tester-panel border border-[#C7C7C7] bg-white" aria-label="Keyboard event visualizer">
        <div className="p-4 sm:p-5 border-b border-[#E3E2DE] flex flex-wrap items-start justify-between gap-4">
          <div><p className="eyebrow">ANSI REFERENCE LAYOUT</p><h2 className="font-bold text-[#141414] mt-1">Keyboard visualizer</h2><p className="text-xs text-[#646464] mt-1">The layout is illustrative, not your device's physical layout.</p></div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex border border-[#C7C7C7] bg-[#F4F3F0] p-1 gap-0.5" role="group" aria-label="Keyboard layout">
              {([['full', 'Full size'], ['tkl', 'TKL'], ['60', '60%']] as const).map(([mode, label]) => <button key={mode} type="button" aria-pressed={layoutMode === mode} onClick={event => { setLayoutMode(mode); focusTesterAfterPointer(event); }} className={`tester-option px-2.5 py-1.5 text-[11px] font-bold ${layoutMode === mode ? 'bg-[#1351AA] text-white' : 'text-[#444343] hover:bg-white'}`}>{label}</button>)}
            </div>
            <div className="flex border border-[#C7C7C7] bg-[#F4F3F0] p-1 gap-0.5" role="group" aria-label="Sound feedback">
              {([['thock', 'Thock'], ['click', 'Clicky']] as const).map(([profile, label]) => <button key={profile} type="button" aria-pressed={soundProfile === profile} onClick={event => { setSoundProfile(profile); focusTesterAfterPointer(event); }} className={`tester-option px-2.5 py-1.5 text-[11px] font-bold ${soundProfile === profile ? 'bg-[#1351AA] text-white' : 'text-[#444343] hover:bg-white'}`}>{label}</button>)}
              <button type="button" onClick={event => { setSoundEnabled(!soundEnabled); focusTesterAfterPointer(event); }} aria-label="Sound feedback" aria-pressed={soundEnabled} title="Toggle Audio Feedback" className={`tester-option px-2 ${soundEnabled ? 'text-[#1351AA]' : 'text-[#646464]'}`}>{soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}</button>
            </div>
          </div>
        </div>
        <div className="px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#646464]">
          <div className="flex flex-wrap items-center gap-4" aria-label="Key status legend"><span className="flex items-center gap-1.5"><span className="tester-legend tester-legend--idle" />Not observed</span><span className="flex items-center gap-1.5"><span className="tester-legend tester-legend--tested" />Observed</span><span className="flex items-center gap-1.5"><span className="tester-legend tester-legend--held" />Held</span></div>
          <span>Scroll sideways to see the full layout</span>
        </div>
        <div className="px-4 sm:px-5 pb-5">
          <div className="tester-keyboard-scroll overflow-x-auto" role="region" tabIndex={0} data-tester-scroll aria-label="Illustrative keyboard layout">
            <div className="tester-keyboard flex gap-4 w-max mx-auto" aria-hidden="true">
              <div className="space-y-[3px]">
                <div className="flex gap-[3px] mb-2">{MAIN_ROW_0.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{MAIN_ROW_1.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{MAIN_ROW_2.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{MAIN_ROW_3.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{MAIN_ROW_4.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{MAIN_ROW_5.map(k => renderKey(k))}</div>
              </div>
              {layoutMode !== '60' && <div className="space-y-[3px] flex flex-col justify-between">
                <div className="flex gap-[3px] mb-2">{NAV_ROW_0.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{NAV_ROW_1.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{NAV_ROW_2.map(k => renderKey(k))}</div>
                <div className="h-[32px]" />
                <div className="flex gap-[3px]">{ARROW_ROW_4.map(k => renderKey(k))}</div>
                <div className="flex gap-[3px]">{ARROW_ROW_5.map(k => renderKey(k))}</div>
              </div>}
              {layoutMode === 'full' && <div className="space-y-[3px]">
                <div className="flex gap-[3px] mb-2">{NUMPAD_ROW_0.map(k => renderKey(k))}</div>
                <div className="grid gap-[3px]" style={{ gridTemplateColumns: 'repeat(4, 32px)', gridTemplateRows: 'repeat(5, 32px)' }}>
                  {NUMPAD_GRID_KEYS.map(k => renderKey(k, k.gridArea))}
                </div>
              </div>}
            </div>
          </div>
        </div>
      </section>

      <section className="tester-panel border border-[#C7C7C7] bg-white" aria-label="Observed key codes">
        <div className="p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 gap-3 border-b border-[#E3E2DE]">
          <div><p className="eyebrow">EVENT READOUT</p><h2 className="font-bold text-[#141414] mt-1">Observed key codes</h2></div>
          <div className="min-w-0 text-xs font-mono text-[#646464] sm:text-right"><div className="truncate" title={`Last OS key code: ${lastKey}`}>Last OS key code: <strong className="text-[#1351AA]">{lastKey}</strong></div><span className="block truncate text-[10px]">{keydownEvents} DOM keydowns · includes {repeatEvents} OS repeats</span></div>
        </div>
        <div className="tester-readout p-4 sm:p-5" tabIndex={0} data-tester-scroll aria-label="Observed key code list">
          {observed.length === 0 ? <p className="text-xs text-[#646464]">No key events yet. Focus this window and press a key to start.</p> : <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">{observed.map(info => <div key={info.code} aria-label={`${info.code}, ${info.pressCount} ${info.pressCount === 1 ? 'press' : 'presses'}${activeKeys.has(info.code) ? ', held' : ''}`} className={`tester-code-chip min-w-0 flex items-center justify-between gap-2 border px-2.5 py-1.5 text-xs font-mono ${activeKeys.has(info.code) ? 'border-[#1351AA] bg-[#EDF3FC] text-[#1351AA]' : 'border-[#E3E2DE] bg-[#F4F3F0] text-[#444343]'}`}><span className="font-bold truncate" title={info.code}>{info.code}</span><span className="text-[10px] shrink-0">{info.pressCount}×</span></div>)}</div>}
        </div>
      </section>
    </main>
  );
};
