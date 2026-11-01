/*
 * store.ts — the lighting the user has set up, and where it is kept.
 *
 * Three channels, matching `cfg_global_t`'s channel count on the device, each
 * with the same fields as `cfg_lighting_t` so what is saved here can be pushed
 * without translation. Stored in localStorage next to the deck, because the deck
 * itself lives there too: the pad renders its own LEDs from flash, this is the
 * editor's copy until you press Save to hardware.
 *
 * Nothing in here pretends to know what the device is doing. `pushState` records
 * whether the last write actually reached a port, and the panel says so.
 */
import { createLighting, LED_MODE, type LightingConfig, LED_COUNT } from './engine';
import { CHANNEL_COUNT } from '../../host/protocol/mpad3-protocol.mjs';

/* One lighting config per device channel. The deck's four layers are these four
 * channels: same number, same order, one concept with two names. */
export const LIGHTING_CHANNELS = CHANNEL_COUNT;
const STORAGE_KEY = 'kadowaz_lighting';

export type ChannelLighting = LightingConfig;

interface PersistedLighting {
  version: 1;
  channels: LightingConfig[];
}

/** Names the panel shows. These are the firmware's names, not invented ones. */
export const LED_MODE_INFO: Array<{ id: number; name: string; note: string }> = [
  { id: LED_MODE.OFF, name: 'Off', note: 'all nine pixels dark' },
  { id: LED_MODE.STATIC, name: 'Static', note: 'channel colour on every key' },
  { id: LED_MODE.PER_KEY, name: 'Per key', note: 'nine individual colours' },
  { id: LED_MODE.BREATH, name: 'Breath', note: 'triangle ramp on the channel colour' },
  { id: LED_MODE.RAINBOW, name: 'Rainbow', note: 'same hue on every key, cycling' },
  { id: LED_MODE.SPECTRUM, name: 'Spectrum', note: 'hue offset per key, travels across the pad' },
  { id: LED_MODE.CHANNEL_TINT, name: 'Channel tint', note: 'hue shifted per channel' },
  { id: LED_MODE.REACTIVE, name: 'Reactive', note: 'keys flare on press and decay' },
];

/* Editor defaults, not device defaults. The factory config ships REACTIVE at
 * brightness 90, which is deliberately dim (nine white LEDs is ~540 mA), and it
 * idles at a third of the base colour — correct on the pad, but it reads as a
 * black preview on a screen. These three show the channel doing something while
 * staying inside the same current budget. */
const DEFAULTS: LightingConfig[] = [
  createLighting({ mode: LED_MODE.STATIC, brightness: 200, speed: 128, r: 40, g: 96, b: 255 }),
  createLighting({ mode: LED_MODE.BREATH, brightness: 180, speed: 128, r: 255, g: 60, b: 120 }),
  createLighting({ mode: LED_MODE.SPECTRUM, brightness: 180, speed: 96, r: 0, g: 0, b: 0 }),
  createLighting({ mode: LED_MODE.REACTIVE, brightness: 180, speed: 128, r: 32, g: 224, b: 96 }),
];

let channels: LightingConfig[] = load();
const listeners = new Set<() => void>();

function clone(c: LightingConfig): LightingConfig {
  return { ...c, perKey: c.perKey.map((p) => [p[0], p[1], p[2]] as [number, number, number]) };
}

function sanitise(c: Partial<LightingConfig> | undefined, fallback: LightingConfig): LightingConfig {
  const out = clone(fallback);
  if (!c) return out;
  const num = (v: unknown, max: number, def: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : def;
  out.mode = num(c.mode, 255, fallback.mode);
  out.brightness = num(c.brightness, 255, fallback.brightness);
  out.speed = num(c.speed, 255, fallback.speed);
  out.r = num(c.r, 255, fallback.r);
  out.g = num(c.g, 255, fallback.g);
  out.b = num(c.b, 255, fallback.b);
  if (Array.isArray(c.perKey)) {
    for (let i = 0; i < LED_COUNT; i++) {
      const p = c.perKey[i];
      if (Array.isArray(p) && p.length === 3) {
        out.perKey[i] = [num(p[0], 255, 0), num(p[1], 255, 0), num(p[2], 255, 0)];
      }
    }
  }
  // The mask is derived, exactly like putLighting() in the protocol module: a key
  // is in per-key mode when its colour is not black.
  out.perKeyMask = 0;
  for (let i = 0; i < LED_COUNT; i++) {
    const [r, g, b] = out.perKey[i];
    if (r || g || b) out.perKeyMask |= 1 << i;
  }
  return out;
}

function load(): LightingConfig[] {
  const fresh = DEFAULTS.map(clone);
  if (typeof localStorage === 'undefined') return fresh;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as PersistedLighting;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.channels)) return fresh;
    return fresh.map((f, i) => sanitise(parsed.channels[i], f));
  } catch {
    return fresh;
  }
}

function persist() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 1, channels: channels.map(clone) } satisfies PersistedLighting),
    );
  } catch {
    /* private mode / quota: the session keeps working, the value just is not kept */
  }
}

export function getChannel(channel: number): LightingConfig {
  return channels[channel] ?? channels[0];
}

export function setChannel(channel: number, patch: Partial<LightingConfig>): LightingConfig {
  const current = channels[channel] ?? channels[0];
  const next = sanitise({ ...current, ...patch }, current);
  channels[channel] = next;
  persist();
  listeners.forEach((fn) => fn());
  return next;
}

export function setPerKey(channel: number, key: number, rgb: [number, number, number]): LightingConfig {
  const current = channels[channel] ?? channels[0];
  const perKey = current.perKey.map((p) => [...p] as [number, number, number]);
  perKey[key] = rgb;
  return setChannel(channel, { perKey });
}

export function resetChannel(channel: number): LightingConfig {
  channels[channel] = clone(DEFAULTS[channel] ?? DEFAULTS[0]);
  persist();
  listeners.forEach((fn) => fn());
  return channels[channel];
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
