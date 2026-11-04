import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AgentCursor } from './AgentCursor';
import { ENABLE_INTRO, INTRO_DURATION_MS, INTRO_SESSION_KEY, INTRO_REPLAY_EVENT, REGION_SCRIPTS, type RegionScript } from './config';
import { frameFor, revealFor, typingFor, scriptTime, scriptDuration, type Rect, type TimedTarget } from './timeline';
import { measureText, textClip } from './textGeometry';
import './intro.css';

type SavedStyle = { value: string; priority: string };
type Target = TimedTarget & { element: HTMLElement; baseOpacity: number; opacity: SavedStyle; translate: SavedStyle; transition: SavedStyle; clipPath: SavedStyle; lastReveal: number };
type Track = { script: RegionScript; targets: Target[] };

function firstRun(): boolean {
  if (!ENABLE_INTRO) return false;
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return import.meta.env.DEV || sessionStorage.getItem(INTRO_SESSION_KEY) !== '1';
  } catch { return false; }
}
function markSeen() { try { sessionStorage.setItem(INTRO_SESSION_KEY, '1'); } catch { /* optional */ } }
const saved = (element: HTMLElement, property: string): SavedStyle => ({ value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property) });
const restore = (element: HTMLElement, property: string, original: SavedStyle) => {
  if (original.value) element.style.setProperty(property, original.value, original.priority);
  else element.style.removeProperty(property);
};

/** Scripted visual choreography over the real, still-mounted editor. */
export function Intro() {
  const [playing, setPlaying] = useState(firstRun);
  const [tracks, setTracks] = useState<Track[]>([]);
  const overlayRef = useRef<HTMLDivElement>(null);
  const skipRef = useRef<HTMLButtonElement>(null);
  const finishRef = useRef<() => void>(() => {});
  const seedRef = useRef(Math.random() * 10000);
  const startRef = useRef(0);
  const holdRef = useRef<number | null>(null);
  const pointerRef = useRef<number | null>(null);
  const pendingFinishRef = useRef(false);

  useEffect(() => {
    if (!ENABLE_INTRO) return;
    const replay = () => {
      try {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        seedRef.current = Math.random() * 10000; startRef.current = 0; setPlaying(true);
      } catch { /* Motion API unavailable: leave the app alone. */ }
    };
    const shortcut = (event: KeyboardEvent) => {
      if (import.meta.env.DEV && event.ctrlKey && event.altKey && event.code === 'KeyI' && !event.repeat) {
        event.preventDefault(); event.stopImmediatePropagation(); replay();
      }
    };
    window.addEventListener(INTRO_REPLAY_EVENT, replay);
    window.addEventListener('keydown', shortcut, true);
    return () => { window.removeEventListener(INTRO_REPLAY_EVENT, replay); window.removeEventListener('keydown', shortcut, true); };
  }, []);

  useLayoutEffect(() => {
    if (!playing) return;
    const app = document.querySelector<HTMLElement>('.app-shell');
    if (!app || !overlayRef.current) { setPlaying(false); return; }
    const overlay = overlayRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousInert = app.inert;
    const previousAriaHidden = app.getAttribute('aria-hidden');
    const originals = new Map<HTMLElement, Target>();
    let ended = false;
    let watchdog = 0;
    const restoreTargets = () => {
      originals.forEach((target, element) => {
        restore(element, 'opacity', target.opacity);
        restore(element, 'translate', target.translate);
        restore(element, 'transition', target.transition);
        restore(element, 'clip-path', target.clipPath);
      });
      originals.clear();
    };
    const finish = () => { if (!ended) { ended = true; markSeen(); setPlaying(false); } };
    const requestFinish = () => {
      if (pointerRef.current !== null) {
        pendingFinishRef.current = true;
        const hint = overlay.querySelector<HTMLElement>('.intro-hint');
        if (hint) hint.textContent = 'Release to skip';
      } else finish();
    };
    finishRef.current = requestFinish;

    const refresh = () => {
      if (ended) return;
      try {
        restoreTargets();
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        const next: Track[] = [];
        for (const script of REGION_SCRIPTS) {
          const targets: Target[] = [];
          for (const step of script.steps) {
            const matches = Array.from(app.querySelectorAll<HTMLElement>(step.selector));
            // Pick only text-bearing leaves: panel borders, icons, and layout stay intact.
            const elements = step.textLeaves ? matches.flatMap(root => [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]
              .filter(element => Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim())
                && !Array.from(element.children).some(child => !!child.textContent?.trim()))) : matches;
            const groupStart = targets.length;
            let visibleIndex = 0;
            const stepStart = scriptTime(script, step.start);
            let textStart = stepStart;
            for (const element of elements) {
              if (originals.has(element)) continue;
              const r = element.getBoundingClientRect();
              if (r.width < 8 || r.height < 8 || r.right <= 0 || r.bottom <= 0 || r.left >= viewport.width || r.top >= viewport.height) continue;
              // Exclude nodes hidden outside their scrolling panel, even if their
              // document coordinates still intersect the browser viewport.
              let clip = element.parentElement?.closest<HTMLElement>('.intro-quick-keys, .designer-pad, .workspace-rail, .designer-inspector, nav[aria-label="Modules"]') || null;
              let clippedOut = false;
              while (clip) {
                const c = clip.getBoundingClientRect();
                if (r.bottom <= c.top || r.top >= c.bottom || r.right <= c.left || r.left >= c.right) { clippedOut = true; break; }
                clip = clip.parentElement?.closest<HTMLElement>('.intro-quick-keys, .designer-pad, .workspace-rail, .designer-inspector, nav[aria-label="Modules"]') || null;
              }
              if (clippedOut) continue;
              const rect: Rect = { left: r.left, top: r.top, width: r.width, height: r.height };
              const computedOpacity = Number.parseFloat(getComputedStyle(element).opacity);
              const textPoints = step.type ? measureText(element, rect) : undefined;
              if (step.type && !textPoints?.length) continue;
              const duration = scriptDuration(script, step.textLeaves ? Math.max(180, Math.min(800, (textPoints?.length || 1) * 45)) : (step.duration || 360));
              const target: Target = { element, rect, label: step.label, start: step.textLeaves ? textStart : stepStart + visibleIndex++ * scriptDuration(script, step.stagger || 0),
                frame: step.frame, type: step.type, textPoints, characters: textPoints?.length, duration,

                baseOpacity: Number.isFinite(computedOpacity) ? computedOpacity : 1,
                opacity: saved(element, 'opacity'), translate: saved(element, 'translate'), transition: saved(element, 'transition'), clipPath: saved(element, 'clip-path'), lastReveal: -1 };
              originals.set(element, target); targets.push(target);
              if (step.textLeaves) textStart += duration + scriptDuration(script, 80);
            }
            // Tall windows may show more quick keys. Fit every visible element
            // into the sequence instead of dropping the final rows.
            const group = targets.slice(groupStart);
            if (!step.textLeaves && group.length > 1 && group[group.length - 1].start > INTRO_DURATION_MS - 1200) {
              const span = Math.max(0, INTRO_DURATION_MS - 1200 - stepStart);
              group.forEach((target, i) => { target.start = stepStart + span * i / (group.length - 1); });
            }
          }
          if (targets.length) next.push({ script, targets: targets.sort((a, b) => a.start - b.start) });
        }
        if (!next.length) { finish(); return; }
        // All geometry and computed styles are read before any styles are changed.
        const elapsed = performance.now() - startRef.current;
        originals.forEach(target => {
          const progress = revealFor(elapsed, target.start, target.duration);
          target.element.style.setProperty('transition', 'none');
          target.element.style.setProperty('opacity', String((target.type ? Number(elapsed >= target.start) : progress) * target.baseOpacity));
          if (progress < 1 && target.type) target.element.style.setProperty('clip-path', textClip(target.textPoints || [], Math.round(typingFor(elapsed, target.start, target.duration || 360, target.characters || 1) * (target.characters || 1)), target.rect));
          else if (progress < 1 && target.frame) target.element.style.setProperty('clip-path', `inset(0 ${(1 - progress) * 100}% 0 0)`);
          else if (progress < 1) target.element.style.setProperty('translate', `0 ${(1 - progress) * 7}px`);
          target.lastReveal = progress;
        });
        setTracks(next);
      } catch (error) { console.warn('[intro] Could not measure the editor; skipping intro.', error); finish(); }
    };
    const keydown = (event: KeyboardEvent) => {
      if ((event.key === 'Enter' || event.key === ' ') && document.activeElement === skipRef.current) { event.stopImmediatePropagation(); return; }
      if (event.key === 'Escape') requestFinish();
      else if (event.key === 'Tab') skipRef.current?.focus();
      event.preventDefault(); event.stopImmediatePropagation();
    };
    try {
      document.documentElement.classList.add('intro-running');
      app.classList.remove('startup-entrance');
      app.inert = true; app.setAttribute('aria-hidden', 'true');
      startRef.current = performance.now(); refresh();
      window.addEventListener('resize', refresh);
      void document.fonts?.ready.then(() => { if (!ended) refresh(); });
      window.addEventListener('keydown', keydown, true);
      skipRef.current?.focus({ preventScroll: true });
      watchdog = window.setTimeout(requestFinish, INTRO_DURATION_MS + 1800);
    } catch (error) { console.warn('[intro] Could not start; skipping intro.', error); finish(); }
    return () => {
      ended = true; window.clearTimeout(watchdog);
      if (holdRef.current !== null) window.clearTimeout(holdRef.current);
      holdRef.current = null; pointerRef.current = null; pendingFinishRef.current = false;
      window.removeEventListener('resize', refresh); window.removeEventListener('keydown', keydown, true);
      restoreTargets(); app.inert = previousInert;
      if (previousAriaHidden === null) app.removeAttribute('aria-hidden'); else app.setAttribute('aria-hidden', previousAriaHidden);
      document.documentElement.classList.remove('intro-running');
      if (overlay.contains(document.activeElement)) previousFocus?.focus({ preventScroll: true });
      finishRef.current = () => {};
    };
  }, [playing]);

  useLayoutEffect(() => {
    if (!playing || !tracks.length || !overlayRef.current) return;
    const overlay = overlayRef.current;
    const nodes = tracks.map(({ script }) => ({
      cursor: overlay.querySelector<HTMLElement>(`[data-cursor="${script.id}"]`),
      selection: overlay.querySelector<HTMLElement>(`[data-selection="${script.id}"]`),
      selectionLabel: overlay.querySelector<HTMLElement>(`[data-selection-label="${script.id}"]`),
      lastActive: -1,
    }));
    // End once every visible track has completed and its cursor has departed.
    // Narrow screens can omit whole regions, so do not leave a blank overlay
    // waiting for the desktop's longest track.
    const finishAt = Math.min(INTRO_DURATION_MS, Math.max(...tracks.flatMap(track => track.targets.map(target => target.start + (target.duration || 360)))) + 950);
    let raf = 0;
    const tick = (now: number) => {
      try {
        const elapsed = now - startRef.current;
        const viewport = { width: window.innerWidth, height: window.innerHeight };
        tracks.forEach(({ script, targets }, index) => {
          for (const target of targets) {
            const progress = revealFor(elapsed, target.start, target.duration);
            if (progress === target.lastReveal) continue;
            target.lastReveal = progress;
            if (progress >= 1) {
              restore(target.element, 'opacity', target.opacity);
              restore(target.element, 'translate', target.translate);
              restore(target.element, 'transition', target.transition);
              restore(target.element, 'clip-path', target.clipPath);
            } else {
              target.element.style.setProperty('opacity', String((target.type ? Number(elapsed >= target.start) : progress) * target.baseOpacity));
              if (target.type) target.element.style.setProperty('clip-path', textClip(target.textPoints || [], Math.round(typingFor(elapsed, target.start, target.duration || 360, target.characters || 1) * (target.characters || 1)), target.rect));
              else if (target.frame) target.element.style.setProperty('clip-path', `inset(0 ${(1 - progress) * 100}% 0 0)`);
              else target.element.style.setProperty('translate', `0 ${(1 - progress) * 7}px`);
            }
          }
          const frame = frameFor(script, targets, elapsed, seedRef.current, index, viewport);
          const { cursor, selection, selectionLabel } = nodes[index];
          if (!cursor || !selection || !selectionLabel) return;
          cursor.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0)`;
          cursor.style.opacity = String(frame.opacity);
          cursor.classList.toggle('is-clicking', frame.pulse > .2);
          const target = targets[frame.active];
          if (target && nodes[index].lastActive !== frame.active) {
            const { rect } = target;
            selection.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
            selection.style.width = `${rect.width}px`; selection.style.height = `${rect.height}px`;
            selectionLabel.textContent = target.label;
            nodes[index].lastActive = frame.active;
          }
          selection.style.opacity = String(Math.max(0, frame.pulse) * frame.opacity);
        });
        if (elapsed >= finishAt) finishRef.current(); else raf = requestAnimationFrame(tick);
      } catch (error) { console.warn('[intro] Animation failed; opening the editor.', error); finishRef.current(); }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, tracks]);

  if (!playing) return null;
  const stopHolding = () => { if (holdRef.current !== null) window.clearTimeout(holdRef.current); holdRef.current = null; };
  return <div ref={overlayRef} className="intro-overlay" role="dialog" aria-modal="true" aria-label="Scripted introduction" onPointerDown={(event) => {
    if (event.button !== 0 || pointerRef.current !== null) return;
    pointerRef.current = event.pointerId;
    if (event.target === skipRef.current || skipRef.current?.contains(event.target as Node)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    stopHolding(); holdRef.current = window.setTimeout(() => finishRef.current(), 650);
  }} onPointerUp={(event) => {
    if (pointerRef.current !== event.pointerId) return;
    stopHolding(); pointerRef.current = null;
    if (pendingFinishRef.current) { pendingFinishRef.current = false; finishRef.current(); }
  }} onPointerCancel={(event) => {
    if (pointerRef.current !== event.pointerId) return;
    stopHolding(); pointerRef.current = null;
    if (pendingFinishRef.current) { pendingFinishRef.current = false; finishRef.current(); }
  }}>
    <div className="intro-caption"><span className="intro-caption-dot" /> <span>BUILDING THE STUDIO</span><small>Scripted introduction</small></div>
    {tracks.map(({ script }) => <React.Fragment key={script.id}>
      <div className="intro-selection" data-selection={script.id} style={{ color: script.tint }} aria-hidden="true"><span data-selection-label={script.id} /><i /><i /><i /><i /></div>
      <AgentCursor script={script} />
    </React.Fragment>)}
    <button ref={skipRef} className="intro-skip" type="button" onClick={() => finishRef.current()}>Skip intro <span>ESC</span></button>
    <span className="intro-hint">Hold and release to skip</span>
  </div>;
}

export class IntroBoundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.warn('[intro] Disabled after an error.', error); }
  render() { return this.state.failed ? null : this.props.children; }
}
