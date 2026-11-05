import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, Command, Keyboard, Layers, MousePointer2, Play, X, Zap } from 'lucide-react';
import { startWelcomeParticles } from './welcomeParticles';

type WelcomeTourProps = { onClose: () => void };

/** An informational tour: it never changes a layout or sends pad actions. */
export function WelcomeTour({ onClose }: WelcomeTourProps) {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);
  const particleRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const app = document.querySelector<HTMLElement>('.app-shell');
    const wasInert = app?.inert;
    const previousAriaHidden = app?.getAttribute('aria-hidden');
    if (app) { app.inert = true; app.setAttribute('aria-hidden', 'true'); }
    const keydown = (event: KeyboardEvent) => {
      if (exitingRef.current) { if (event.key === 'Escape' || event.key === 'Tab') event.preventDefault(); return; }
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const buttons = Array.from(dialogRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || []);
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && current <= 0) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (!event.shiftKey && (current === -1 || current === buttons.length - 1)) { event.preventDefault(); buttons[0].focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (app) {
        app.inert = Boolean(wasInert);
        if (previousAriaHidden == null) app.removeAttribute('aria-hidden');
        else app.setAttribute('aria-hidden', previousAriaHidden);
      }
      if (previous?.isConnected && !previous.closest('[inert]')) previous.focus({ preventScroll: true });
      else document.querySelector<HTMLButtonElement>('button[aria-label="Help & About"]')?.focus({ preventScroll: true });
    };
  }, []);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [step]);

  useEffect(() => {
    if (!exiting) return;
    const card = dialogRef.current, canvas = particleRef.current;
    if (!card || !canvas) { closeRef.current(); return; }
    card.focus({ preventScroll: true });
    let finished = false;
    const finish = () => { if (!finished) { finished = true; closeRef.current(); } };
    // Always finish if animation frames are suspended or the canvas is unavailable.
    const fallback = window.setTimeout(finish, 1400);
    let stop = () => {};
    try { stop = startWelcomeParticles(canvas, card, finish); } catch { finish(); }
    return () => { window.clearTimeout(fallback); stop(); };
  }, [exiting]);
  const getStarted = () => {
    if (exitingRef.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { onClose(); return; }
    exitingRef.current = true;
    setExiting(true);
  };

  const heading = step === 0 ? 'Welcome to ZERO' : step === 1 ? 'Make it yours' : 'Try it, then upload';
  return createPortal(
    <div className={`welcome-overlay ${exiting ? 'welcome-overlay--exiting' : ''}`}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="welcome-title" aria-describedby="welcome-description" tabIndex={-1} className={`welcome-dialog ${exiting ? 'welcome-dialog--exiting' : ''}`}>
        <button type="button" className="welcome-close" aria-label="Close welcome" disabled={exiting} onClick={onClose}><X size={17} aria-hidden="true" /></button>
        <div className="welcome-art" aria-hidden="true">
          <div className="welcome-art-label"><span>ZERO</span><span>DECK STUDIO / GET STARTED</span></div>
          <div className="welcome-illustration" key={`art-${step}`}>
            <div className="welcome-pad-top"><span className="welcome-screen"><i /><i /><i /></span><span className="welcome-dial" /></div>
            <div className="welcome-pad-grid">
              {[Keyboard, Command, Layers, MousePointer2, Zap, Play, Keyboard, Layers, Command].map((Icon, index) =>
                <span key={index} className={`welcome-key ${index === (step === 2 ? 5 : 1) ? 'welcome-key--active' : ''}`}><Icon size={15} strokeWidth={1.6} /></span>)}
            </div>
          </div>
          <div className="welcome-art-footer"><span>YOUR SETUP, YOUR FLOW</span><span>{`0${step + 1} — 03`}</span></div>
        </div>
        <div className="welcome-content" key={`content-${step}`}>
          <p className="welcome-eyebrow">{step === 0 ? 'A LITTLE GETTING STARTED' : `QUICK TOUR  /  0${step} OF 02`}</p>
          <h2 id="welcome-title" ref={headingRef} tabIndex={-1}>{heading}</h2>
          <p id="welcome-description" className="welcome-description">
            {step === 0 ? 'Create a setup that works for you. Start exploring with the virtual macropad—no device needed.'
              : step === 1 ? 'Choose a layer, select a key and use Configure → Keys to assign an action. Your edits are saved on this computer.'
                : 'Use Safe preview to explore without sending actions. When your compatible pad is ready, connect it and review your bindings before uploading.'}
          </p>
          <div className="welcome-note"><Check size={14} aria-hidden="true" /><span>{step === 2 ? 'Virtual testing does not verify physical hardware.' : 'You can explore without a physical macropad.'}</span></div>
          <div className="welcome-actions">
            {step === 0 ? <><button type="button" className="welcome-secondary" disabled={exiting} onClick={onClose}>Skip</button><button type="button" className="welcome-primary" disabled={exiting} onClick={() => setStep(1)}>Take a 2-step tour <ArrowRight size={15} aria-hidden="true" /></button></>
              : <><button type="button" className="welcome-secondary" disabled={exiting} onClick={() => setStep(step === 1 ? 0 : 1)}>Back</button><button type="button" className="welcome-primary" disabled={exiting} onClick={() => step === 1 ? setStep(2) : getStarted()}>{step === 1 ? 'Next' : 'Get started'} <ArrowRight size={15} aria-hidden="true" /></button></>}
          </div>
          {step > 0 && <button type="button" className="welcome-skip" disabled={exiting} onClick={onClose}>Skip tour</button>}
        </div>
      </div>
      {exiting && <canvas ref={particleRef} className="welcome-particles" aria-hidden="true" />}
    </div>, document.body,
  );
}
