# DESIGN.md — Reality-First UI System (Deck Studio)

**Version** 1.0 · **Applies to** `src/**` (Kadowaz Deck Studio renderer) · **Primitive layer** `src/index.css`
**Status** Implemented. The renderer no longer contains a dark theme, an orange accent, a gradient, a shadow, or a rounded corner.

> Poster-modernist, "reality-first": a strict grid, a cream paper surface, one cobalt accent,
> flat colour blocks and 1px rules. Depth is never faked with shadow. This document is the
> contract for any UI work in this repo — desktop app shell, panels, drawers, modals and the
> hardware simulation all follow the same rules.

---

## 1. Principles

1. **No decoration.** No gradients, no box shadows, no glass/blur, no radii. Depth = 1px rules + flat blocks.
2. **One accent.** Cobalt marks the single primary action, the active state, and the one number that matters. It never fills a large area except the primary button.
3. **Labels are metadata.** Small, uppercase, tracked, grey. They live in a fixed left rail — never compete with content.
4. **Hardware reads as a drawing.** The deck simulator is an ink slab with cream keycaps and hairline divisions, like a technical elevation — not a glossy 3D render.
5. **Motion is functional.** Colour/border changes only, `0.3s linear`. No springs, no glows, no scale-on-hover.

### Non-negotiables

| Rule | Value |
| --- | --- |
| Border radius | `0px` — global reset + `[style*="border-radius"]` guard |
| Box shadow | none — `[style*="box-shadow"]` guard kills inline ones |
| Gradients | none |
| Easing / duration | `linear` / `0.3s` for colour; `0.08s linear` for key travel |
| Border weight | exactly `1px` (2px only for a selected keycap) |
| Accent budget | one blue per view, plus its hairlines and active text |

---

## 2. Colour

```css
--cream:#E3E2DE   /* app surface + page */
--ink:#141414     /* text, chassis, selected/active block, primary inverse button */
--blue:#1351AA    /* the accent */
--gray:#444343    /* body copy, secondary */
--muted:#7A7A7A   /* labels, indexes, mono meta */
--line:#C7C7C7    /* every divider, panel border, input border */
--surface:#FFFFFF /* panel fill (raised above cream) */
--well:#EDECE8    /* inset rows, hover fill, neutral chips */
```

Contrast: ink/cream **14.2:1**, gray/cream **7.6:1**, blue/cream **5.8:1**, muted/cream **3.3:1**
(⚠️ labels only — 10–12px uppercase tracked; swap to `#5F5F5F` (4.9:1) if strict AA is required).

**Semantics without hue.** The old five-colour status language is gone:

| Meaning | Old | Now |
| --- | --- | --- |
| Live / connected | green dot | blue **square** `.mark--on` |
| Idle / disconnected | grey dot | grey square `.mark--off` |
| Destructive / safety | red | **ink block** with cream type (`bg-[#141414]`) |
| Informational | cyan | muted mono text |
| Selected | orange | ink fill or 2px cobalt border |

Layer differentiation stays monochrome: Layer 1 = cobalt, Layer 2 = ink, Layer 3 = gray.

---

## 3. Typography

Self-hosted in `src/assets/fonts` and declared in `src/index.css` — **no network fonts**.

| Token | Family | Weights |
| --- | --- | --- |
| `font-sans` | General Sans | 400 / 500 / 600 / 700 |
| `font-display` | Switzer | 900 (headline numerals / hero text only) |
| `font-mono` | JetBrains Mono | variable 400–800 |

> General Sans has no 900; Switzer 900 is the display substitute. Aileron is not bundled (no free webfont licence).

### App scale (desktop density)

| Role | Class | Size / weight / tracking |
| --- | --- | --- |
| Panel title | `.headline` | 700, `-0.03em`, `0.95` leading |
| Row title | — | 11px / 700 / uppercase / `0.1em` |
| Body / value | — | 12–13px / 400–600 |
| Label | `.eyebrow` | 10px / 700 / `0.2em` / uppercase / `--muted` |
| Index, readout, meta | `.idx` | 11px mono / 500 / `0.1em` / `--muted` |
| Micro-meta, chips | `.chip` | 9px mono / `0.12em` / uppercase |
| Button | `.btn` | 11px / 700 / `0.14em` / uppercase |

Rules: uppercase only for labels, buttons, row titles and mono meta. Negative tracking only on ≥12px humanist text. Never set a label in `--ink` — labels are muted.

---

## 4. Layout

```
┌──────────────────────────────────────────────────────────────┐
│ NAV  64px · cream · 1px bottom rule                          │
│  identity · deck    │ modules (scroll) │ hardware · tools · CTA │
├────────────┬─────────────────────────────────┬───────────────┤
│ LABEL RAIL │ CANVAS                          │ INSPECTOR      │
│ 228px      │ flex-1, scrolls                 │ 560–680px      │
│ deck       │ deck simulator + quick tray     │ switch spec,   │
│ layers     │                                 │ OBS, audio,    │
│ hardware   │                                 │ webhook, log   │
│ diagnostics│                                 │                │
│ build info │                                 │                │
└────────────┴─────────────────────────────────┴───────────────┘
```

- **Nav** — `h-16`, three flex regions, tab strip scrolls horizontally at narrow widths. Active tab: 2px cobalt bottom border + cobalt text. No pill backgrounds.
- **Label rail** — the system's sidebar register. Metadata only: deck block, layer list, hardware state, diagnostics entry, build stamp. Never content, never a CTA.
- **Canvas** — the deck simulator: ink chassis, cream keycaps, OLED readout, encoder, then the keycode tray below.
- **Inspector** — a spec sheet: label/value rows separated by hairlines, collapsible sections (`<details>`) with `eyebrow` summaries.
- Responsive: 1280px+ three columns; below that the canvas wraps its dock beneath the chassis and the inspector narrows to 560px. No horizontal overflow at 1280 / 1366 / 1440 / 1600.

---

## 5. Component dictionary (all in `src/index.css`)

| Class | Purpose |
| --- | --- |
| `.panel` | White surface, 1px `--line` border, 0 radius. The only container. |
| `.panel--flush` | Borderless panel with a bottom rule (for stacked regions). |
| `.well` | Inset cream block |
| `.eyebrow` | 10px tracked uppercase muted label (+ `--ink`, `--blue`, `--cream` variants) |
| `.idx` | Mono index / readout |
| `.headline` | Panel-level heading |
| `.btn` | Primary poster button: cobalt → ink on hover. `.btn--ink` (inverse), `.btn--ghost`, `.btn--sm` |
| `.field` | Input: white, 1px rule, cobalt border on focus, no radius |
| `.chip` | 9px mono uppercase tag; `.chip--on` = cobalt border/text |
| `.mark` | 7px square status marker (replaces every dot) |
| `.chassis` | Ink hardware slab |
| `.macropad-key` | Cream keycap; press = ink fill, `translateY(1px)`, no shadow |
| `.oled-screen` | True-black emissive panel — the one surface allowed to emit light |
| `.knob-metal` | Ink encoder disc (circular — it is a physical object) |
| `.oled-px` / `.oled-px--dim` | Emissive pixel type (lit / unlit) |
| `.oled-canvas` | The panel itself: a 128×32 canvas, `image-rendering: pixelated`, one tight drop-shadow |
| `.oled-screen--active` | Mode card whose screen is the selected one |
| `src/oled/frame.ts` | 128×32 1-bit framebuffer in SSD1306 page order, plus the drawing primitives |
| `src/oled/font.ts` | 5×7 pixel font (uppercase + digits + punctuation), 6 px advance |
| `src/oled/sprites.ts` | 1-bit sprites: keycap `18×8`, rounded badge `16×13`, pixel buddy, heart, play/pause |
| `src/oled/modes.ts` | The mode catalogue: one `render(fb, ctx)` per screen, plus the registry and cycler |

Patterns:
- **Inspector row** — `flex items-center justify-between px-3 py-[7px] border-b border-[#E3E2DE]` with an `.eyebrow` label and a right-aligned mono/value.
- **Section header** — `flex items-center justify-between px-3 py-2 border-b border-[#C7C7C7]` with `.eyebrow` + `.idx`.
- **Hover** — `hover:bg-[#EDECE8]` for rows, `hover:bg-[#141414] hover:text-[#E3E2DE]` for icon buttons.
- **Selected** — ink block (`bg-[#141414] text-[#E3E2DE]`) or a 2px cobalt border on the keycap. Never a tint.

---

## 6. Hardware simulation rules

- Chassis = ink slab, 1px keyline, registration squares in the corners (cream at 40%).
- Keycaps = cream blocks on a 2px grid gap; the selected cap is white with a 2px cobalt border; a pressed cap inverts to ink.
- No under-glow, no blur, no bevels, no gradients, no drop shadows, no `font-black` (700 max).
- The OLED is the only emissive surface, and the only surface that changes **without** being touched: the panel has no touch layer, so its controls live in the drawer (auto switch interval, rotation toggles) and on bound hardware, never as a click target on the screen itself.
- The OLED is the only emissive surface in the system: `#08090A` panel, `#E8E9E4` pixels, and a tight bloom (`text-shadow` / `box-shadow`) on pixels, chip and bars. That bloom is the physics of the display, not decoration — it must not leak outside `.oled-screen`, and no other component may use shadow or glow.
- Layer chips are inverted blocks (`#E8E9E4` fill, ink digits) with a small radius, because that is how the panel draws them. This is the only rounded corner allowed in the product, alongside the circular encoder.
- Hold-to-confirm draws a flat cobalt fill bar instead of a pulsing red ring.

---

## 7. Migration tooling

`scripts/retheme.py` is the deterministic migration used to convert the old dark/orange theme:

```bash
python3 scripts/retheme.py     # idempotent; rewrites src/**/*.{tsx,ts,css}
```

It (1) remaps every colour hex into the palette, (2) deletes radius/shadow/blur/gradient utilities,
(3) converts `white/black` alpha overlays to explicit tones, (4) maps Tailwind palette utilities
(`red-500`, `amber-400`, …) to semantic monochrome roles, (5) renames `glass-panel` → `panel`.
It only touches **`className` attribute values** — prose in data files is never rewritten.

Modals already in the tree (`UploadModal`, `FirmwareModal`, `CommandPalette`,
`DiagnosticLogDrawer`, VA drawers) inherit the system through this pass; new components should use
the primitives directly rather than new colours.

---

## 8. Do / Don't

| ✅ Do | ❌ Don't |
| --- | --- |
| Divide regions with a 1px `--line` rule | Add a shadow, radius or glass panel |
| Use ink blocks for emphasis | Introduce a second accent or a tint |
| Status as a square + label | Colour-coded dots and glow |
| `hover:bg-[#EDECE8]` on rows | Scale, glow or lift on hover |
| Mono for readouts, indexes, keycodes | Mono for prose |
| One primary `.btn` per region | Competing filled buttons |
| Labels 10px / 0.2em / muted | Labels at 14px in ink |

---

## 9. Verification

- `npm run build` — passes (fonts emitted as hashed assets, no CDN).
- `npm test` — all renderer/host suites pass; `audioControl` fails only in the Linux sandbox (`powershell.exe` missing), unrelated to UI.
- Rendered checks at 1280 / 1366 / 1440 / 1600: no horizontal overflow, no console errors,
  `document.fonts` reports General Sans + JetBrains Mono loaded.
