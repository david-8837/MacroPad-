/*
 * ViaLightingPanel — the editor for what the nine LEDs can actually do.
 *
 * What this replaced: six invented effect buttons, a hue/saturation pair the
 * firmware does not have, and an Apply button that popped an `alert()` claiming
 * the EEPROM had been written. None of it touched a port.
 *
 * What it does now: the eight modes in `firmware/include/actions.h`, per channel,
 * with the same fields as `cfg_lighting_t` (mode, brightness, speed, base RGB,
 * nine per-key colours). The preview is the firmware's own maths ported to
 * TypeScript and checked against the C by `tests/ledEngine.test.cjs`. Writes go
 * out as real MPAD3 frames: a bench-only, capability-gated PREVIEW_LIGHTING
 * when explicitly clicked, SET_LIGHTING when saving (even on output-disabled
 * firmware), with acknowledgements and readback. The on-screen animation is
 * NOT evidence that an unknown physical strip or supply is safe or active.
 */
import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  RotateCcw,
  Send,
  Zap,
} from 'lucide-react';

import { hardwareBridge } from '../../utils/hardwareBridge';
import { LinkError } from '../../utils/mpad3Link';
import { lightingFromWire, lightingToWire } from '../../utils/lightingWire';
import { LED_COUNT, LED_MODE, type LightingConfig } from '../../lighting/engine';
import {
  LIGHTING_CHANNELS,
  LED_MODE_INFO,
  getChannel,
  resetChannel,
  setChannel as saveChannel,
  setPerKey,
  subscribe,
  type ChannelLighting,
} from '../../lighting/store';
import { useLedFrame } from '../../lighting/useLedFrame';

const SWATCHES: Array<{ name: string; rgb: [number, number, number] }> = [
  { name: 'Ice', rgb: [40, 96, 255] },
  { name: 'Amber', rgb: [255, 150, 20] },
  { name: 'Rose', rgb: [255, 60, 120] },
  { name: 'Mint', rgb: [40, 220, 160] },
  { name: 'Violet', rgb: [150, 80, 255] },
  { name: 'Paper', rgb: [255, 255, 255] },
  { name: 'Ember', rgb: [255, 70, 20] },
  { name: 'Ink', rgb: [12, 18, 40] },
];

const hexOf = ([r, g, b]: [number, number, number]) =>
  '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

interface NumberFieldProps {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}

const NumberField: React.FC<NumberFieldProps> = ({ label, value, max, onChange, suffix }) => (
  <label className="block">
    <span className="eyebrow block mb-1">{label}</span>
    <div className="flex items-stretch border border-[#C7C7C7] bg-[#FFFFFF]">
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          onChange(Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0);
        }}
        className="w-full bg-transparent px-2 py-1 font-mono text-[11px] text-[#141414] outline-none"
      />
      {suffix && (
        <span className="px-2 flex items-center font-mono text-[9px] text-[#646464] border-l border-[#C7C7C7]">
          {suffix}
        </span>
      )}
    </div>
  </label>
);

export const ViaLightingPanel: React.FC = () => {
  const [channel, setChannel] = useState(0);
  const [cfg, setCfg] = useState<ChannelLighting>(() => getChannel(0));
  const [status, setStatus] = useState<string>('');
  /* Where the numbers on screen came from. Editor defaults until the pad answers
   * a read; the header says which, so the two never get confused again. */
  const [source, setSource] = useState<'editor' | 'pad'>('editor');
  const [busy, setBusy] = useState(false);
  const { hex, hit } = useLedFrame(channel);

  /* The store is the source of truth; the panel mirrors it so a change from
   * anywhere else (or a read back from the pad) shows up here. */
  useEffect(() => {
    setCfg(getChannel(channel));
    const off = subscribe(() => setCfg(getChannel(channel)));
    return off;
  }, [channel]);

  const protocol = hardwareBridge.protocol;
  const hasDevice = protocol !== null;
  const canDrive = protocol?.hasLedOutput === true; /* bench build, not current-certified */

  /* The bridge notifies on connection and on probe, but this panel has no props,
   * so it has to listen for itself or it would keep saying "no device" at a pad
   * that is right there. */
  const [protocolReady, setProtocolReady] = useState<boolean>(hasDevice);
  useEffect(
    () => hardwareBridge.onStateChange(() => setProtocolReady(hardwareBridge.protocol !== null)),
    [],
  );

  /* Read the pad's own config when it answers, and again on channel change: the
   * first thing you should see is what the pad is doing, not what the editor
   * assumes. */
  useEffect(() => {
    if (!protocolReady) {
      setSource('editor');
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const L = await hardwareBridge.readLighting(channel);
        if (cancelled) return;
        setCfg(saveChannel(channel, lightingFromWire(L)));
        setSource('pad');
      } catch {
        /* It answered a PING but not GET_LIGHTING: keep the editor copy and say
         * so rather than showing values we never received. */
        if (!cancelled) setSource('editor');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [protocolReady, channel]);

  const patch = (p: Partial<LightingConfig>) => setCfg(saveChannel(channel, p));

  const write = async (save: boolean) => {
    if (!hasDevice) {
      setStatus('No device answered: nothing was sent. This is the editor only.');
      return;
    }
    if (!save && !canDrive) {
      setStatus('Physical LED data output is disabled in this firmware. Preview is unavailable; Save can store settings without lighting the strip.');
      return;
    }
    setBusy(true);
    setStatus(save ? 'Saving to the pad…' : 'Previewing on the pad…');
    try {
      await hardwareBridge.writeLighting(channel, lightingToWire(cfg), save);
      setStatus(
        save
          ? canDrive
            ? `Saved. Channel ${channel} written to flash and acknowledged by the pad. LED output is bench-enabled only.`
            : `Saved. Channel ${channel} written to flash and acknowledged; physical LED output remains disabled.`
          : `Previewing on the bench-enabled pad (not saved). Press Save to keep it.`,
      );
    } catch (err) {
      const msg = err instanceof LinkError ? err.message : (err as Error)?.message ?? 'unknown error';
      setStatus(`Write failed: ${msg}`);
    } finally {
      setBusy(false);
    }
  };

  const readBack = async () => {
    if (!hasDevice) {
      setStatus('No device answered: there is nothing to read.');
      return;
    }
    setBusy(true);
    try {
      const L = await hardwareBridge.readLighting(channel);
      setCfg(saveChannel(channel, lightingFromWire(L)));
      setSource('pad');
      setStatus(`Read channel ${channel} from the pad.`);
    } catch (err) {
      setStatus(`Read failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      {/* ── header: title, device state, what this page edits ───────────── */}
      <div className="grid grid-cols-12 border border-[#C7C7C7] bg-[#FFFFFF]">
        <div className="col-span-3 border-r border-[#C7C7C7] p-3">
          <div className="eyebrow">Lighting</div>
          <div className="mt-1 text-[13px] font-bold leading-none text-[#141414]">LED STUDIO</div>
          <div className="mt-2 font-mono text-[9px] leading-relaxed text-[#646464]">
            9 × LED positions · strip not yet selected
            <br />
            {LED_MODE_INFO.length} firmware modes
            <br />
            {protocolReady && protocol
              ? `${protocol.leds} LED · ${protocol.channels} CH · FW ${protocol.firmwareBuild}`
              : 'no device attached'}
            <br />
            {source === 'pad' ? 'VALUES FROM THE PAD' : 'EDITOR DEFAULTS, NOT THE PAD’S'}
          </div>
        </div>

        <div className="col-span-6 border-r border-[#C7C7C7] p-3">
          <div className="eyebrow mb-2">Channel</div>
          <div className="flex items-stretch border border-[#C7C7C7]">
            {Array.from({ length: LIGHTING_CHANNELS }, (_, ch) => (
              <button
                key={ch}
                type="button"
                onClick={() => setChannel(ch)}
                className={`flex-1 py-1.5 font-mono text-[10px] font-bold tracking-[0.12em] border-r border-[#C7C7C7] last:border-r-0 ${
                  ch === channel ? 'bg-[#141414] text-[#E3E2DE]' : 'bg-[#FFFFFF] text-[#444343] hover:bg-[#EDECE8]'
                }`}
              >
                {String(ch).padStart(2, '0')}
              </button>
            ))}
          </div>
          <p className="mt-2 font-mono text-[9px] leading-relaxed text-[#646464]">
            Lighting is stored per channel on the device. There is one per layer — channel 0 is Layer 0 —
            so each page of the deck can look different.
          </p>
        </div>

        <div className="col-span-3 p-3">
          <div className="eyebrow mb-2">Device</div>
          <div className="flex items-start gap-1.5">
            <span
              className="mt-1 w-1.5 h-1.5 shrink-0"
              style={{ backgroundColor: hasDevice ? '#1351AA' : '#C7C7C7' }}
            />
            <p className="font-mono text-[9px] leading-relaxed text-[#444343]">
              {hasDevice ? 'MPAD3 answered a PING' : 'NO PROTOCOL DEVICE'}
            </p>
          </div>
          <p className="mt-1 font-mono text-[9px] leading-relaxed text-[#646464]">
            {hasDevice
              ? canDrive
                ? 'BENCH LED DATA ENABLED. This does not verify strip type, power supply, or current budget; use a current-limited setup.'
                : 'LED DATA OUTPUT DISABLED. Saving settings works; physical preview and raw tests do not. This does not disconnect LED power.'
              : 'Connect the pad by USB serial. Without it this page edits the desktop copy only.'}
          </p>
        </div>
      </div>

      {/* ── mode list + preview ────────────────────────────────────────── */}
      <div className="grid grid-cols-12 mt-3 gap-3">
        <div className="col-span-3 border border-[#C7C7C7] bg-[#FFFFFF]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#C7C7C7]">
            <span className="eyebrow">Mode</span>
            <span className="idx text-[#1351AA]">{String(cfg.mode).padStart(2, '0')}</span>
          </div>
          {LED_MODE_INFO.map((m) => {
            const active = cfg.mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => patch({ mode: m.id })}
                className={`w-full text-left px-3 py-2 border-b border-[#EDECE8] last:border-b-0 ${
                  active ? 'bg-[#141414] text-[#E3E2DE]' : 'text-[#444343] hover:bg-[#EDECE8]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em]">{m.name}</span>
                  <span className="font-mono text-[9px] opacity-60">{String(m.id).padStart(2, '0')}</span>
                </div>
                <div className={`mt-0.5 text-[9px] leading-snug ${active ? 'text-[#C7C7C7]' : 'text-[#646464]'}`}>
                  {m.note}
                </div>
              </button>
            );
          })}
        </div>

        <div className="col-span-5 border border-[#C7C7C7] bg-[#FFFFFF]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#C7C7C7]">
            <span className="eyebrow">Preview · 9 pixels</span>
            <span className="font-mono text-[9px] text-[#646464]">on-screen simulation</span>
          </div>

          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {hex.map((c, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => hit(i)}
                  title={`Simulate a press on key ${i + 1}`}
                  className="h-12 border border-[#C7C7C7] relative"
                  style={{ backgroundColor: c }}
                >
                  {/* The swatch is an arbitrary LED colour, so the label needs its
                      own paper chip — grey-on-whatever was unreadable the moment
                      the colour went dark. */}
                  <span className="absolute bottom-0.5 right-1 font-mono text-[8px] px-1 bg-[#E3E2DE] text-[#141414]">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-[#646464]">
              Click a pixel to fake a key hit — that is the only way to see Reactive without the pad.
            </p>
          </div>

          <div className="border-t border-[#C7C7C7] p-3">
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Brightness" value={cfg.brightness} max={255} suffix="0-255" onChange={(v) => patch({ brightness: v })} />
              <NumberField label="Speed" value={cfg.speed} max={255} suffix="1-255" onChange={(v) => patch({ speed: Math.max(1, v) })} />
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <NumberField label="Red" value={cfg.r} max={255} suffix="R" onChange={(v) => patch({ r: v })} />
              <NumberField label="Green" value={cfg.g} max={255} suffix="G" onChange={(v) => patch({ g: v })} />
              <NumberField label="Blue" value={cfg.b} max={255} suffix="B" onChange={(v) => patch({ b: v })} />
            </div>
            <div className="mt-2">
              <span className="eyebrow block mb-1">Base colour</span>
              <div className="flex items-stretch gap-1">
                <div className="w-10 border border-[#C7C7C7]" style={{ backgroundColor: hexOf([cfg.r, cfg.g, cfg.b]) }} />
                {SWATCHES.map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    title={s.name}
                    onClick={() => patch({ r: s.rgb[0], g: s.rgb[1], b: s.rgb[2] })}
                    className="flex-1 h-6 border border-[#C7C7C7]"
                    style={{ backgroundColor: hexOf(s.rgb) }}
                  />
                ))}
              </div>
            </div>
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-[#646464]">
              Brightness is a visual 0–255 scale after gamma, NOT a current limit. The strip model and
              available 5 V LED current are unknown; do not enable physical output without a current-limited bench setup.
            </p>
          </div>
        </div>

        <div className="col-span-4 border border-[#C7C7C7] bg-[#FFFFFF] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#C7C7C7]">
            <span className="eyebrow">Per key</span>
            <span className="font-mono text-[9px] text-[#646464]">
              {cfg.perKeyMask.toString(2).padStart(LED_COUNT, '0')}
            </span>
          </div>
          <div className="p-3">
            <div className="grid grid-cols-3 gap-2">
              {cfg.perKey.map((c, i) => {
                const on = (cfg.perKeyMask & (1 << i)) !== 0;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (on) {
                        setPerKey(channel, i, [0, 0, 0]);
                      } else {
                        setPerKey(channel, i, [cfg.r, cfg.g, cfg.b]);
                        if (cfg.mode !== LED_MODE.PER_KEY) patch({ mode: LED_MODE.PER_KEY });
                      }
                    }}
                    className="h-9 border border-[#C7C7C7] relative"
                    style={{ backgroundColor: on ? hexOf(c) : '#FFFFFF' }}
                  >
                    <span
                      className={`absolute bottom-0.5 right-1 font-mono text-[8px] px-1 ${
                        on ? 'bg-[#E3E2DE] text-[#141414]' : 'bg-[#FFFFFF] text-[#646464]'
                      }`}
                    >
                      {on ? 'ON' : '—'}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 font-mono text-[9px] leading-relaxed text-[#646464]">
              A key with a colour is in per-key mode. Clearing all nine makes the mask empty;
              the lighting engine then uses the base colour. This does not imply physical LED output.
            </p>
          </div>

          <div className="mt-auto border-t border-[#C7C7C7] p-3 space-y-2">
            <button
              type="button"
              disabled={busy || !canDrive}
              title={canDrive ? 'Bench-only physical preview; check current-limited LED supply first' : 'Physical LED output is disabled in this firmware'}
              onClick={() => write(false)}
              className="w-full flex items-center justify-between px-3 py-2 border border-[#C7C7C7] bg-[#FFFFFF] hover:border-[#141414] disabled:opacity-40"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]">Preview on pad</span>
              <Zap className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => write(true)}
              className="w-full flex items-center justify-between px-3 py-2 bg-[#1351AA] text-[#E3E2DE] hover:opacity-90 disabled:opacity-40"
            >
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em]">Save to pad</span>
              <Send className="w-3.5 h-3.5" />
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={readBack}
                className="flex items-center justify-center gap-1 px-2 py-1.5 border border-[#C7C7C7] bg-[#FFFFFF] hover:border-[#141414] disabled:opacity-40"
              >
                <ArrowDownToLine className="w-3 h-3" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em]">Read pad</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCfg(resetChannel(channel));
                  setStatus(`Channel ${channel} reset to the editor defaults (nothing sent).`);
                }}
                className="flex items-center justify-center gap-1 px-2 py-1.5 border border-[#C7C7C7] bg-[#FFFFFF] hover:border-[#141414]"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.1em]">Reset</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── result line: never a claim, always the outcome ─────────────── */}
      <div className="mt-3 border border-[#C7C7C7] bg-[#FFFFFF] px-3 py-2 flex items-start gap-2">
        {status.startsWith('Write failed') || status.startsWith('Read failed') ? (
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#B3261E]" />
        ) : status ? (
          <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#1351AA]" />
        ) : (
          <span className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        )}
        <p className="font-mono text-[10px] leading-relaxed text-[#444343]">
          {status ||
            (hasDevice
              ? canDrive
                ? 'Bench-enabled output: preview can reach the pad. Verify strip and power with current limiting first.'
                : 'LED data output disabled: Save can store settings, but physical LEDs cannot be previewed.'
              : 'Editor only: no pad is answering. The on-screen preview does not represent physical LEDs.')}
        </p>
      </div>
    </div>
  );
};
