import React, { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react';

interface AnimatedDetailsProps {
  id?: string;
  className?: string;
  summaryClassName?: string;
  summary: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode | ((renderedOpen: boolean) => React.ReactNode);
}

/** Native disclosure semantics, with a clipped content row that can animate both ways. */
export const AnimatedDetails = forwardRef<HTMLDetailsElement, AnimatedDetailsProps>(function AnimatedDetails({
  id, className, summaryClassName, summary, open: controlledOpen, onOpenChange, children,
}, ref) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  // Keep <details> open during its closing transition, so native layout doesn't
  // hide the body before it has had a chance to collapse.
  const [renderedOpen, setRenderedOpen] = useState(open);
  const [visible, setVisible] = useState(open);
  const bodyRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (bodyRef.current) bodyRef.current.inert = !open;
  }, [open]);

  useEffect(() => {
    let firstFrame = 0;
    let secondFrame = 0;
    let timer = 0;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (open) {
      setRenderedOpen(true);
      if (reducedMotion) setVisible(true);
      else {
        firstFrame = window.requestAnimationFrame(() => {
          secondFrame = window.requestAnimationFrame(() => setVisible(true));
        });
      }
    } else {
      setVisible(false);
      if (reducedMotion) setRenderedOpen(false);
      else timer = window.setTimeout(() => setRenderedOpen(false), 340);
    }
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(timer);
    };
  }, [open]);

  const toggle = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    if (controlledOpen === undefined) setInternalOpen(!open);
    onOpenChange?.(!open);
  };

  return (
    <details ref={ref} id={id} open={renderedOpen} className={className}>
      <summary className={summaryClassName} aria-expanded={open} onClick={toggle}>{summary}</summary>
      <div ref={bodyRef} className={`disclosure-body ${visible ? 'disclosure-body--open' : ''}`} aria-hidden={!open}>
        <div className="disclosure-body-inner">
          {typeof children === 'function' ? children(renderedOpen) : children}
        </div>
      </div>
    </details>
  );
});
