import React, { useEffect, useMemo, useState } from 'react';
import type { Cfg, CfgAction } from '../../host/protocol/mpad3-protocol.mjs';
import { ACTION_TYPE } from '../../host/protocol/mpad3-protocol.mjs';
import type { Deck } from '../types';
import { deckToConfig } from '../utils/deckToConfig';
import { describeHidKeycode, MEDIA_CODE } from '../utils/deviceKeymap';
import { hardwareBridge, type ConnectedDeviceInfo, type HardwareConnectionState } from '../utils/hardwareBridge';
import type { PhysicalGesture } from '../utils/physicalActionRouter';

type Event = { id: number; index: number; gesture: PhysicalGesture; channel: number | null; value: number | null };
const actionName = (a: CfgAction) => {
  const name = Object.entries(ACTION_TYPE).find(([, n]) => n === a.type)?.[0] ?? `UNKNOWN ${a.type}`;
  if (a.type === ACTION_TYPE.NONE) return 'NONE';
  const interpretation = a.type === ACTION_TYPE.KEYCODE ? ` · ${describeHidKeycode(a.code)} (US key positions)`
    : a.type === ACTION_TYPE.MEDIA ? ` · ${Object.entries(MEDIA_CODE).find(([, code]) => code === a.code)?.[0] ?? 'unknown media usage'}`
    : a.type === ACTION_TYPE.CHANNEL ? ` · layer ${a.code}` : '';
  return `${name}${interpretation} · code 0x${a.code.toString(16).toUpperCase().padStart(4, '0')} · flags 0x${a.flags.toString(16).toUpperCase().padStart(2, '0')}${a.text ? ` · ${a.text}` : ''}`;
};
const same = (a: CfgAction, b: CfgAction) => a.type === b.type && a.flags === b.flags && a.code === b.code && a.text === b.text;

/** Separate from the OS keyboard test; it observes existing bridge events only. */
export const PadInspector: React.FC<{ deck: Deck; state: HardwareConnectionState; info: ConnectedDeviceInfo | null }> = ({ deck, state, info }) => {
  const [snapshot, setSnapshot] = useState<Cfg | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [held, setHeld] = useState<number[]>([]);
  const [tested, setTested] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = state === 'connected' && !!info?.protocolReady && !!info.hasFlash;
  useEffect(() => {
    setSnapshot(null); setEvents([]); setHeld([]); setTested([]); setError('');
  }, [state, info]);
  useEffect(() => hardwareBridge.onInputEvent((index, gesture, meta) => {
    // Serial event metadata distinguishes physical reports from simulations/legacy messages.
    if (!meta || index < 0 || index > 9) return;
    setTested(old => old.includes(index) ? old : [...old, index]);
    setEvents(previous => [{ id: (previous[0]?.id ?? 0) + 1, index, gesture, channel: meta.channel, value: meta.value }, ...previous].slice(0, 20));
    if (gesture === 'down') setHeld(old => old.includes(index) ? old : [...old, index]);
    if (gesture === 'up') setHeld(old => old.filter(i => i !== index));
  }), []);
  const comparison = useMemo(() => snapshot ? deckToConfig(deck, snapshot) : null, [deck, snapshot]);
  const read = async () => {
    setBusy(true); setError(''); setSnapshot(null);
    try { setSnapshot(await hardwareBridge.readDeviceConfig()); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not read pad configuration.'); }
    finally { setBusy(false); }
  };
  return <section className="mt-6 border border-[#C7C7C7] bg-white p-4 sm:p-5 space-y-4" aria-label="Physical pad inspector">
    <div><p className="eyebrow">PHYSICAL PAD · SERIAL EVENTS</p><h2 className="font-bold mt-1">Pad inspector</h2></div>
    <p className="text-xs text-[#444343] leading-relaxed">This is separate from the OS keyboard test above. Physical pad actions still run while testing; close apps or choose safe bindings first. Event support is a firmware capability, not proof that streaming is enabled. No events do not prove a fault or measure chatter or latency.</p>
    <p className="text-xs font-mono">{state !== 'connected' || !info?.protocolReady ? 'Connect a compatible pad to inspect it.' : info.hasEvents ? 'Firmware reports event capability. Read config to check its setting.' : 'Firmware does not report event capability.'}</p>
    <div className="grid grid-cols-5 sm:grid-cols-10 gap-1" aria-label="Physical key and knob states">
      {Array.from({length: 10}, (_, i) => <div key={i} aria-label={`${i === 9 ? 'Knob' : `K${i}`}: ${held.includes(i) ? 'held' : tested.includes(i) ? 'observed' : 'not observed'}`} className={`border text-center py-2 text-xs font-mono ${held.includes(i) ? 'bg-[#1351AA] text-white border-[#1351AA]' : tested.includes(i) ? 'bg-[#EDF3FC] text-[#1351AA] border-[#1351AA]' : 'bg-[#F4F3F0] border-[#C7C7C7]'}`}>{i === 9 ? 'Knob' : `K${i}`}</div>)}
    </div>
    <p className="text-[11px] text-[#646464]">Dark blue: held · light blue: observed since reset</p>
    <div className="h-24 overflow-auto border border-[#E3E2DE] p-2 font-mono text-[11px]" aria-label="Recent physical events">
      {events.length ? events.map(e => <div key={e.id}>{e.index === 9 ? 'Knob' : `K${e.index}`} · {e.gesture} · layer {e.channel ?? '?'}{e.value ? ` · value ${e.value}` : ''}</div>) : <span className="text-[#646464]">No physical events observed.</span>}
    </div>
    <button onClick={() => { setEvents([]); setHeld([]); setTested([]); }} className="border border-[#C7C7C7] px-2 py-1 text-xs">Clear physical events</button>
    <div className="border-t border-[#E3E2DE] pt-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3"><button disabled={!ready || busy} onClick={() => void read()} className="bg-[#1351AA] text-white px-3 py-2 text-xs disabled:opacity-50">{busy ? 'Reading…' : 'Read pad configuration'}</button><span className="text-xs text-[#646464]">Read only · does not change the editor or pad</span></div>
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      {snapshot && comparison && <>
        <p className="text-xs leading-relaxed">Snapshot at time of read. USB event reporting setting: <strong>{snapshot.global.usbReportEvents === 1 ? 'on' : snapshot.global.usbReportEvents === 0 ? 'off' : `unknown (${snapshot.global.usbReportEvents})`}</strong>. This can change after an upload or outside the app; read again to refresh.</p>
        <p className="text-xs leading-relaxed">Comparison shows encoded pad slots only. Labels, icons, presets, PC-only actions and other app details cannot be reconstructed from the pad. A matching empty slot does not mean a PC action is configured or works. This view does not import bindings.</p>
        {comparison.unsupported.length > 0 && <p className="text-xs text-[#8A4B00]">{comparison.unsupported.length} editor binding(s) need desktop routing or are unavailable. Review Upload to Deck for details.</p>}
        <div className="space-y-2">{snapshot.channels.map((ch, layer) => {
          const projected = comparison.config.channels[layer];
          const slots: [string, CfgAction, CfgAction][] = [
            ...ch.keys.map((a, i): [string, CfgAction, CfgAction] => [`K${i}`, a, projected.keys[i]]),
            ['Knob clockwise', ch.knobCw, projected.knobCw], ['Knob counterclockwise', ch.knobCcw, projected.knobCcw],
            ['Knob tap', ch.knobTap, projected.knobTap], ['Knob hold', ch.knobHold, projected.knobHold],
          ];
          const different = slots.filter(([, a, b]) => !same(a, b)).length;
          return <details key={layer} className="border border-[#C7C7C7] p-2"><summary className="cursor-pointer text-xs font-bold">Layer {layer} · {different} encoded slot{different === 1 ? '' : 's'} differ</summary>
            <div className="mt-2 space-y-1 text-[11px] font-mono break-all">{slots.map(([name, a, b]) => <div key={name}><strong>{name}</strong>: {actionName(a)} {same(a, b) ? '(matches)' : `| Editor upload: ${actionName(b)}`}</div>)}</div>
          </details>;
        })}</div>
      </>}
    </div>
  </section>;
};
