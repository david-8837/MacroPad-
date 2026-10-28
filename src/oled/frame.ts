// A 128x32 1-bit framebuffer, stored in the SSD1306 page layout the panel
// actually wants: 4 pages x 128 columns, bit `y & 7` of byte `page * 128 + x`
// is the pixel at (x, y).
//
// Keeping the buffer in hardware order means `toPages()` is a copy, not a
// transpose, and the firmware exporter can write it out verbatim.

import { GLYPH_ADVANCE, GLYPH_H, glyphFor } from './font';

export const PANEL_W = 128;
export const PANEL_H = 32;
export const PANEL_PAGES = PANEL_H / 8;
export const FRAME_BYTES = PANEL_W * PANEL_PAGES; // 512

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const INK = '#E8E9E4';
export const PAPER = '#08090A';

export class Frame {
  readonly w = PANEL_W;
  readonly h = PANEL_H;
  readonly pages = new Uint8Array(FRAME_BYTES);

  private clipX = 0;
  private clipY = 0;
  private clipW = PANEL_W;
  private clipH = PANEL_H;

  clear(): this {
    this.pages.fill(0);
    return this;
  }

  fill(on = true): this {
    this.pages.fill(on ? 0xff : 0x00);
    return this;
  }

  /** Restrict drawing to a rectangle until `noClip()`. */
  clip(rect: Rect): this {
    this.clipX = Math.max(0, rect.x);
    this.clipY = Math.max(0, rect.y);
    this.clipW = Math.max(0, Math.min(PANEL_W - this.clipX, rect.w));
    this.clipH = Math.max(0, Math.min(PANEL_H - this.clipY, rect.h));
    return this;
  }

  noClip(): this {
    this.clipX = 0;
    this.clipY = 0;
    this.clipW = PANEL_W;
    this.clipH = PANEL_H;
    return this;
  }

  pixel(x: number, y: number, on = true): this {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < this.clipX || iy < this.clipY) return this;
    if (ix >= this.clipX + this.clipW || iy >= this.clipY + this.clipH) return this;
    if (ix < 0 || iy < 0 || ix >= PANEL_W || iy >= PANEL_H) return this;
    const idx = (iy >> 3) * PANEL_W + ix;
    const bit = 1 << (iy & 7);
    if (on) this.pages[idx] |= bit;
    else this.pages[idx] &= ~bit;
    return this;
  }

  get(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= PANEL_W || y >= PANEL_H) return false;
    return (this.pages[(y >> 3) * PANEL_W + x] & (1 << (y & 7))) !== 0;
  }

  /** Invert a single pixel — used for XOR trails and cursor blocks. */
  toggle(x: number, y: number): this {
    return this.pixel(x, y, !this.get(x, y));
  }

  hline(x: number, y: number, w: number, on = true): this {
    for (let i = 0; i < w; i += 1) this.pixel(x + i, y, on);
    return this;
  }

  vline(x: number, y: number, h: number, on = true): this {
    for (let i = 0; i < h; i += 1) this.pixel(x, y + i, on);
    return this;
  }

  rect(x: number, y: number, w: number, h: number, on = true): this {
    this.hline(x, y, w, on);
    this.hline(x, y + h - 1, w, on);
    this.vline(x, y, h, on);
    this.vline(x + w - 1, y, h, on);
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number, on = true): this {
    for (let j = 0; j < h; j += 1) this.hline(x, y + j, w, on);
    return this;
  }

  /** Fill with the inverse of what is already there. */
  invertRect(x: number, y: number, w: number, h: number): this {
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) this.toggle(x + i, y + j);
    }
    return this;
  }

  /** XOR a pixel — leaves existing ink alone, useful for intersection effects. */
  xorRect(x: number, y: number, w: number, h: number): this {
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        if (this.get(x + i, y + j)) this.pixel(x + i, y + j, false);
      }
    }
    return this;
  }

  /** Draw text in the 5x7 face. `invert` knocks the glyphs out of a lit block. */
  text(
    x: number,
    y: number,
    value: string,
    options: { scale?: number; invert?: boolean } = {},
  ): this {
    const scale = options.scale ?? 1;
    const ink = options.invert ? false : true;
    let cx = x;
    for (const ch of value) {
      const glyph = glyphFor(ch);
      if (!glyph) {
        cx += GLYPH_ADVANCE * scale;
        continue;
      }
      for (let gy = 0; gy < GLYPH_H; gy += 1) {
        const row = glyph[gy];
        for (let gx = 0; gx < row.length; gx += 1) {
          if (row[gx] !== '#') continue;
          if (scale === 1) {
            this.pixel(cx + gx, y + gy, ink);
          } else {
            this.fillRect(cx + gx * scale, y + gy * scale, scale, scale, ink);
          }
        }
      }
      cx += GLYPH_ADVANCE * scale;
    }
    return this;
  }

  /** Draw a sprite. `invert` paints the sprite's silhouette as paper. */
  sprite(bitmap: string[], x: number, y: number, invert = false): this {
    for (let row = 0; row < bitmap.length; row += 1) {
      const line = bitmap[row];
      for (let col = 0; col < line.length; col += 1) {
        // Sprites are authored as '1' (bitmap literals) or '#' (ASCII art).
        const ch = line[col];
        if (ch !== '1' && ch !== '#') continue;
        this.pixel(x + col, y + row, !invert);
      }
    }
    return this;
  }

  /** Copy a page-ordered buffer in (e.g. a frame pushed over the wire). */
  blitPages(src: Uint8Array): this {
    this.pages.set(src.subarray(0, FRAME_BYTES));
    return this;
  }

  /** Hardware-ready copy: 512 bytes, SSD1306 page layout. */
  toPages(): Uint8Array {
    return this.pages.slice();
  }

  /** Same bits as `toPages()`, as one hex string (used by the frame exporter). */
  toHex(): string {
    let out = '';
    for (let i = 0; i < FRAME_BYTES; i += 1) out += this.pages[i].toString(16).padStart(2, '0');
    return out;
  }

  /** Number of lit pixels — handy for “is this frame blank?” checks. */
  inkCount(): number {
    let n = 0;
    for (let i = 0; i < FRAME_BYTES; i += 1) {
      let b = this.pages[i];
      while (b) {
        n += b & 1;
        b >>= 1;
      }
    }
    return n;
  }

  /** RGBA pixels for a canvas — 1 bit in, two colours out, no antialiasing. */
  toRGBA(ink: string = INK, paper: string = PAPER): Uint8ClampedArray {
    return this.writeRGBA(new Uint8ClampedArray(PANEL_W * PANEL_H * 4), ink, paper);
  }

  /** Same, but into a caller-owned buffer so the render loop allocates nothing. */
  writeRGBA(out: Uint8ClampedArray, ink: string = INK, paper: string = PAPER): Uint8ClampedArray {
    const [ir, ig, ib] = hexToRgb(ink);
    const [pr, pg, pb] = hexToRgb(paper);
    for (let y = 0; y < PANEL_H; y += 1) {
      const page = (y >> 3) * PANEL_W;
      const bit = 1 << (y & 7);
      for (let x = 0; x < PANEL_W; x += 1) {
        const on = (this.pages[page + x] & bit) !== 0;
        const o = (y * PANEL_W + x) * 4;
        out[o] = on ? ir : pr;
        out[o + 1] = on ? ig : pg;
        out[o + 2] = on ? ib : pb;
        out[o + 3] = 255;
      }
    }
    return out;
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

