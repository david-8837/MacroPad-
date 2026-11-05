import type { RegionScript } from './config';

export interface Rect { left: number; top: number; width: number; height: number }
export interface TimedTarget { rect: Rect; start: number; label: string; frame?: boolean; type?: boolean; characters?: number; textPoints?: { x: number; y: number; bottom: number }[]; duration?: number }
export interface AgentFrame { x: number; y: number; opacity: number; active: number; pulse: number }
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const x = clamp(n); return x * x * (3 - 2 * x); };
const lerp = (a: number, b: number, p: number) => a + (b - a) * smooth(p);

/** Scale one agent's timing without changing any other agent's schedule. */
export function scriptTime(script: RegionScript, time: number): number {
  const origin = script.timeOrigin ?? 0;
  return origin + (time - origin) * (script.timeScale ?? 1);
}
export function scriptDuration(script: RegionScript, duration: number): number {
  return duration * (script.timeScale ?? 1);
}

/** Reveal text in discrete character-sized increments, without changing it. */
export function typingFor(elapsed: number, start: number, duration: number, characters: number): number {
  const count = Math.max(1, characters);
  return Math.floor(clamp((elapsed - start) / duration) * count) / count;
}

/** The real node appears in place as the cursor places it. */
export function revealFor(elapsed: number, start: number, duration = 360): number { return smooth((elapsed - start) / duration); }
export function seededJitter(seed: number, index: number): number {
  const n = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return ((n - Math.floor(n)) - .5) * 60;
}

export function frameFor(script: RegionScript, targets: TimedTarget[], elapsed: number, seed: number, index: number, viewport: {width: number; height: number}): AgentFrame {
  const center = { x: viewport.width / 2, y: viewport.height / 2 };
  if (!targets.length) return { ...center, opacity: 0, active: -1, pulse: 0 };
  const offset = seededJitter(seed, index);
  const local = elapsed - offset;
  let active = targets.findIndex(t => local < t.start + (t.duration || 360) * (t.type || t.frame ? 1 : .78));
  if (active < 0) active = targets.length - 1;
  const item = targets[active];
  const previous = active ? targets[active - 1].rect : null;
  const point = (r: Rect) => ({ x: Math.max(8, Math.min(viewport.width - 25, r.left + r.width * .55)), y: Math.max(8, Math.min(viewport.height - 30, r.top + r.height * .52)) });
  const from = previous ? point(previous) : center;
  const to = item.type ? { x: Math.max(8, item.rect.left), y: Math.max(8, Math.min(viewport.height - 30, item.rect.top + item.rect.height * .5)) } : point(item.rect);
  const approach = (local - (item.start - 380)) / 420;
  let x = lerp(from.x, to.x, approach);
  let y = lerp(from.y, to.y, approach);
  if (item.frame && local >= item.start && local < item.start + (item.duration || 360)) {
    const drawing = (local - item.start) / (item.duration || 360);
    x = lerp(Math.max(8, item.rect.left + 4), Math.min(viewport.width - 25, item.rect.left + item.rect.width - 4), drawing);
    y = lerp(Math.max(8, item.rect.top + 4), Math.min(viewport.height - 30, item.rect.top + item.rect.height - 4), drawing);
  }
  if (item.type && local >= item.start && local < item.start + (item.duration || 360)) {
    const typed = typingFor(local, item.start, item.duration || 360, item.characters || 1);
    const textPoint = item.textPoints?.[Math.max(0, Math.floor(typed * item.textPoints.length) - 1)];
    x = Math.max(8, Math.min(viewport.width - 25, item.rect.left + (textPoint?.x ?? item.rect.width * typed)));
    y = textPoint ? Math.max(8, Math.min(viewport.height - 30, item.rect.top + (textPoint.y + textPoint.bottom) / 2)) : to.y;
  }
  const micro = Math.sin(local * .012 + index + script.steps.length * .2) * 1.3;
  x += micro; y += Math.cos(local * .009 + index) * .8;
  // Leave as soon as this agent's own final element is placed. Do not park a
  // completed cursor over the UI while other agents are still working.
  const finishedAt = targets.reduce((latest, target) => Math.max(latest, target.start + (target.duration || 360)), 0);
  const exit = smooth((local - finishedAt - 140) / 650);
  x = lerp(x, center.x, exit); y = lerp(y, center.y, exit);
  const enter = smooth((elapsed - 150) / 350);
  const opacity = enter * (1 - smooth((local - finishedAt - 200) / 450));
  const age = local - item.start;
  const duration = item.duration || 360;
  return { x, y, opacity, active, pulse: age >= -80 && age < duration ? clamp(1 - Math.abs(age - duration * .32) / (duration * .68)) : 0 };
}
