#!/usr/bin/env node
// The device's offline runtime screens use the SAME 5x7 glyphs as the desktop
// renderer. Keep a tiny ASCII column table in flash, not an invented second font.
//   node scripts/export-oled-font.mjs [--check]
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmp = join(root, '.tmp', 'oled-font.mjs');
mkdirSync(dirname(tmp), { recursive: true });
await build({ entryPoints: [join(root, 'src/oled/font.ts')], bundle: true,
  platform: 'neutral', format: 'esm', outfile: tmp, logLevel: 'error' });
const { FONT_5X7 } = await import(pathToFileURL(tmp).href);
const glyphs = [];
for (let cp = 32; cp <= 126; cp += 1) {
  const rows = FONT_5X7[String.fromCharCode(cp)] ?? FONT_5X7[String.fromCharCode(cp).toUpperCase()]
    ?? FONT_5X7[' '];
  if (rows.length !== 7 || rows.some((row) => row.length !== 5)) throw new Error('bad glyph');
  glyphs.push(Array.from({ length: 5 }, (_, x) => rows.reduce((bits, row, y) =>
    bits | ((row[x] === '#' ? 1 : 0) << y), 0)));
}
const out = join(root, 'firmware/include/oled_font.h');
const text = [
  '/* GENERATED from src/oled/font.ts by scripts/export-oled-font.mjs. */',
  '#ifndef OLED_FONT_H', '#define OLED_FONT_H', '#include <stdint.h>',
  '/* ASCII 32..126, five columns of 7 low bits per glyph. */',
  'static const uint8_t OLED_FONT_5X7[95][5] = {',
  ...glyphs.map((cols, i) => `    {${cols.map((c) => '0x' + c.toString(16).padStart(2, '0')).join(', ')}}, /* ${i + 32} */`),
  '};', '#endif', '',
].join('\n');
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf8') !== text) {
    console.error('OLED font generated header is stale; run node scripts/export-oled-font.mjs');
    process.exit(1);
  }
  console.log('OLED font generated header matches src/oled/font.ts');
} else {
  writeFileSync(out, text);
  console.log('wrote', out);
}
