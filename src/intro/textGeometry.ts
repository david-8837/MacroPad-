import type { Rect } from './timeline';

/** Measure the visible characters without replacing or modifying React's text nodes. */
export function measureText(element: HTMLElement, bounds: Rect): { x: number; y: number; bottom: number }[] {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  const points: { x: number; y: number; bottom: number }[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.data.trim()) continue;
    let offset = 0;
    for (const character of Array.from(node.data)) {
      range.setStart(node, offset); offset += character.length; range.setEnd(node, offset);
      const r = range.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && r.left < bounds.left + bounds.width && r.top < bounds.top + bounds.height) {
        points.push({
          x: Math.max(0, Math.min(bounds.width, r.right - bounds.left)),
          y: Math.max(0, r.top - bounds.top),
          bottom: Math.min(bounds.height, r.bottom - bounds.top),
        });
      }
    }
  }
  range.detach();
  return points;
}

/** A stepped mask leaves earlier wrapped lines visible and reveals the current one. */
export function textClip(points: { x: number; y: number; bottom: number }[], count: number, bounds: Rect): string {
  if (!count || !points.length) return 'inset(0 100% 0 0)';
  const point = points[Math.min(points.length, count) - 1];
  const x = Math.max(0, Math.min(bounds.width, point.x));
  const top = Math.max(0, point.y - 1);
  const bottom = Math.min(bounds.height, point.bottom + 1);
  return `polygon(0 0, 100% 0, 100% ${top}px, ${x}px ${top}px, ${x}px ${bottom}px, 0 ${bottom}px)`;
}
