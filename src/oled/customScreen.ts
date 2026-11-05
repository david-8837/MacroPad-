import { FRAME_BYTES, PANEL_H, PANEL_W } from './frame';

export const CUSTOM_SCREEN_FPS = 5;
export const CUSTOM_SCREEN_MAX_FRAMES = 50;
export interface CustomScreen {
  kind: 'drawing' | 'image' | 'video';
  name: string;
  /** 512-byte SSD1306 frames encoded as base64, stored on the PC. */
  frames: string[];
  fps: number;
}

export function isCustomScreen(value: unknown): value is CustomScreen {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return ['drawing', 'image', 'video'].includes(String(item.kind)) && typeof item.name === 'string' && item.name.length <= 180 &&
    item.fps === CUSTOM_SCREEN_FPS && Array.isArray(item.frames) && item.frames.length >= 1 &&
    item.frames.length <= CUSTOM_SCREEN_MAX_FRAMES && item.frames.every(frame =>
      typeof frame === 'string' && /^[A-Za-z0-9+/]{683}=$/.test(frame));
}

export function encodePages(pages: Uint8Array): string {
  if (pages.length !== FRAME_BYTES) throw new Error('Invalid screen frame.');
  let raw = '';
  for (const byte of pages) raw += String.fromCharCode(byte);
  return btoa(raw);
}

export function decodePages(encoded: string): Uint8Array {
  const raw = atob(encoded);
  if (raw.length !== FRAME_BYTES) throw new Error('Invalid screen frame.');
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** Crop rectangle in source pixels, always matching the 4:1 display. */
export function screenCrop(width: number, height: number, zoom: number, x: number, y: number) {
  if (!(width > 0 && height > 0)) throw new Error('Media dimensions are unavailable.');
  const z = Math.max(1, Math.min(4, zoom));
  const w = Math.min(width, height * 4) / z;
  const h = w / 4;
  return { x: (width - w) * Math.max(0, Math.min(1, x)), y: (height - h) * Math.max(0, Math.min(1, y)), w, h };
}

/** Convert composited RGBA pixels to the panel's native page/bit order. */
export function rgbaToPages(rgba: Uint8ClampedArray, threshold: number, invert: boolean): Uint8Array {
  if (rgba.length !== PANEL_W * PANEL_H * 4) throw new Error('Invalid screen pixels.');
  const result = new Uint8Array(FRAME_BYTES);
  for (let y = 0; y < PANEL_H; y++) for (let x = 0; x < PANEL_W; x++) {
    const i = (y * PANEL_W + x) * 4;
    const luminance = (rgba[i] * 0.2126 + rgba[i + 1] * 0.7152 + rgba[i + 2] * 0.0722) * (rgba[i + 3] / 255);
    if ((luminance >= threshold) !== invert) result[(y >> 3) * PANEL_W + x] |= 1 << (y & 7);
  }
  return result;
}
