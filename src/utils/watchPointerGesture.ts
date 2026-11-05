/** Watch a press even when pointer capture is unavailable or gets lost.
 * Leaving the control cancels immediately; releasing inside completes it.
 * Listeners are also cleaned up on layer changes and unmount by the caller. */
export function watchPointerGesture(
  element: HTMLElement,
  pointerId: number,
  finish: (cancelled: boolean) => void,
): () => void {
  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    window.removeEventListener('pointermove', move, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    window.removeEventListener('blur', blur);
  };
  const end = (cancelled: boolean) => { if (active) { cleanup(); finish(cancelled); } };
  const outside = (event: PointerEvent) => {
    const rect = element.getBoundingClientRect();
    return !element.isConnected || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  const move = (event: PointerEvent) => { if (event.pointerId === pointerId && outside(event)) end(true); };
  const up = (event: PointerEvent) => { if (event.pointerId === pointerId) end(outside(event)); };
  const cancel = (event: PointerEvent) => { if (event.pointerId === pointerId) end(true); };
  const blur = () => end(true);
  window.addEventListener('pointermove', move, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
  window.addEventListener('blur', blur);
  return cleanup;
}
