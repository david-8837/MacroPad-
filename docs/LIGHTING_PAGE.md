# Lighting page — original audit and current safety state

> **Current state (protocol v3):** The strip and 5 V LED budget are not chosen.
> Physical LED data is gated OFF in the default firmware, while the screen
> preview and saving settings still work. `Preview on pad` needs the explicit
> bench build's `CAP_LED_OUTPUT`; it is disabled otherwise. `LED_TEST` is
> bench-only, requires an ACK and auto-expires after 300 ms. The misleading
> `Clear pad LEDs` button was removed. The cited Normand SK6812MINI-E is a
> timing **reference**, not a purchased part or USB-current approval.
> See [`HARDWARE.md`](./HARDWARE.md#led-power--this-is-the-one-to-get-right).
>
> Sections 1–6 below record the **historical pre-rebuild audit**, not the
> present behavior. "Resolved" records the later app transport work.

An audit of the former `src/components/via/ViaLightingPanel.tsx` (171 lines,
7.1 KB), the `04 LIGHTING` tab, and the gap between the two. The original audit
made no code changes.

---

## 1. What the page does today

Six effect buttons, four sliders, a colour swatch, one Apply button.

| Control | Effect today |
| --- | --- |
| 6 effect cards | `useState` only. Nothing reads the value. |
| Brightness / Speed / Hue / Saturation | `useState` only, seeded at 85 / 60 / 24 / 100. |
| Colour swatch | `hsl(hue, saturation%, brightness/2%)` — a CSS preview, plus a `box-shadow` glow. For Rainbow it is a hard-coded blue gradient, not the current colour. |
| **Apply to Hardware** | `alert('RGB configuration pushed to microcontroller EEPROM.')`. No bridge call, no serial write, no state, no persistence. |

The page talks to nothing. It does not read the deck, does not write the deck, and
does not touch `hardwareBridge`. Reload the app and every value is back to its
seed. This is the same class of fiction as the removed OBS panel and the removed
audio session rows — except that here the *hardware feature underneath it is
completely real*.

Three further problems in the file:

- **"VIA QMK Lighting"** in the title. The firmware is not QMK and implements no
  VIA raw-HID protocol; `grep -ri "via\|qmk" firmware/include firmware/src` returns
  four false positives ("via the backend"). The name is wrong.
- **Hue/saturation are not things the firmware has.** `cfg_lighting_t` stores
  `r,g,b` plus per-key `r,g,b`. Hue/sat/value would have to be converted to RGB
  before sending, which the page never does — so the sliders describe a colour that
  does not exist anywhere.
- **Design spec violations**: the swatch uses `box-shadow` and a `linear-gradient`
  (both barred by `DESIGN.md`; the OLED is the only sanctioned exception), and the
  page is centred in a `max-w-4xl` card instead of the 12-column grid.

---

## 2. What the hardware and firmware actually do

This is the part that is real, tested, and currently unreachable from the app.

**Electrical (reference design, not selected strip).** Intended 5 V chain:
nine *independently addressable* RGB pixels, one per key,
`GP10 → 74AHCT1G125 A/Y (non-inverting, /OE to GND) → 330 Ω → LED0 DIN →
LED0 DOUT → … → LED8`. The **bench-only** PIO/DMA path
(`firmware/src/lighting/ws2812minie.pio`, `leds.c`) packs 24 MSB-first GRB
bits and simulates the **reference** Normand SK6812MINI-E Rev.02 timing. The
purchased cuttable strip, 5 V source and current budget are still unknown.
**Default firmware does not clock LED data.** The 540 mA full-white figure
assumes 20 mA per colour across nine pixels and is only an illustration, not
an approved current limit. See `docs/HARDWARE.md` before powering a chain.

**Eight modes** (`firmware/include/actions.h:166`), selected per channel:

| ID | Name | Behaviour |
| --- | --- | --- |
| 0 | `OFF` | all pixels dark |
| 1 | `STATIC` | channel base colour on every key |
| 2 | `PER_KEY` | `per_key[n]` where `per_key_mask` bit *n* is set, else base colour |
| 3 | `BREATH` | sine on the base colour |
| 4 | `RAINBOW` | hue cycles, same hue on every key |
| 5 | `SPECTRUM` | hue cycles **with a spatial offset per key** — the real rainbow |
| 6 | `REACTIVE` | keys flash on press and decay, time-based not frame-based |
| 7 | `CHANNEL_TINT` | base colour hue-shifted per channel (0/1/2 tint) |

**Per-channel config**, 40 bytes on the wire (`cfg_lighting_t`): `mode`,
`brightness` 0–255, `speed` 1–255, base `r,g,b`, `per_key_mask` (u16), `per_key[9][3]`.
A master brightness and an `idle_override` are applied on top by the engine.

**Rendering.** 2.2 gamma table (256 bytes of flash) so a linear ramp does not look
like "off, off, off, ON"; a reactive decay engine shared across keys.

**Test coverage.** 16 cases in `firmware/tests/test_leds.c` — gamma monotonicity,
GRB offsets, per-key mask selection, breath not stalling at the bottom, rainbow
uniformity vs spectrum per-key offset, reactive decay being time- not frame-based,
channel tint distinctness, unknown mode rendering dark rather than garbage. It is
one of the best-tested parts of the firmware, alongside the OLED modes.

**Wire commands that already exist** (`firmware/include/magic.h`):

| Command | Purpose |
| --- | --- |
| `CMD_GET_LIGHTING 0x08` | read one channel's `cfg_lighting_t` |
| `CMD_SET_LIGHTING 0x09` | write it (persists on commit) |
| `CMD_PREVIEW_LIGHTING 0x0A` | same, without saving — built for exactly this page |
| `CMD_LED_TEST 0x0B` | 9 × 3 raw RGB bytes, bypasses the engine (wiring test) |
| `CMD_LIGHTING 0x88` | device → host reply |

`PREVIEW_LIGHTING` exists *specifically* so a UI can push a live preview while you
drag a slider, and only commit when you press save. The page has no idea it is there.

---

## 3. The real blocker: the app has never spoken the firmware's protocol

This is bigger than lighting, and it explains several other "does nothing" buttons.

- **The firmware is binary only.** `usb_proto.c:326` feeds every CDC byte into
  `protocol_parser_push()`. There is no ASCII command parser anywhere in
  `firmware/` — no `OLED:MODE`, no `OLED:NEXT`, no `SYNC_KEYMAP`.
- **The app speaks ASCII and JSON.** `hardwareBridge.sendSerialCommand()` writes
  newline-terminated text (`OLED:MODE:3`, `OLED:NEXT`, `CH:1`); the sync path sends
  a **JSON** blob named `SYNC_KEYMAP` via WebHID `sendReport(0x00, …)`
  (`App.tsx:606`). Neither is a valid MPAD3 frame, so the firmware discards them
  during resync.
- **Where the ASCII came from.** The deleted Arduino sketch
  (`firmware/kadowaz_macropad/kadowaz_macropad.ino`, removed in `7db03f8`) parsed
  `incoming.startsWith("OLED:")` at line 211. The desktop app was written against
  that prototype; the C firmware replaced it and nothing re-pointed the app.
- **The pieces to fix it already exist.** `host/protocol/mpad3-protocol.mjs` is
  dependency-free and browser-ready by design (its own header says so), with
  `encodeFrame`, `encodeLighting`, `encodeLedTest`, `defaultConfig`, `decodeStream`,
  and it is already verified byte-for-byte against the compiled C by
  `host/tests/run.mjs`. The app imports none of it:
  `grep -rn "encodeLighting\|SET_LIGHTING" src/` → 0 hits.

So: wiring the lighting page to the device is **~150 lines of transport first**, not
a page rewrite. The same transport is what the OLED screen settings and the keymap
sync need, so it is one job paying for three.

---

## 4. Gap table

| Firmware has | Page shows | Verdict |
| --- | --- | --- |
| `STATIC` | Solid Color | maps |
| `BREATH` | Breathing | maps |
| `RAINBOW` (uniform hue) | Rainbow Swirl | maps, but "swirl" is `SPECTRUM`, which the page does not offer |
| `REACTIVE` | Reactive Tap | maps |
| `SPECTRUM` (spatial rainbow) | — | missing |
| `PER_KEY` + 9 per-key colours | — | missing: the most interesting mode has no UI |
| `CHANNEL_TINT` | — | missing |
| `OFF` | — | missing |
| — | Color Cycle | invented |
| — | Strobe Beat | invented |
| brightness as 0–255 scale + master ramp | brightness welded to HSL lightness | wrong model |
| speed 1–255, mode-dependent | 10–100 % | wrong scale |
| base RGB | hue + saturation | wrong model |
| per-key colours, mask | — | missing |

---

## 5. Options

| | What it means | Cost | What it buys |
| --- | --- | --- | --- |
| **A** | Delete the page and its tab (as done with OBS) | 171 lines, 5 min | Honest. But the eight firmware modes stay unreachable forever, and this is a real hardware feature — unlike OBS, the thing behind the panel exists |
| **B** | Make it real: transport → deck model → rebuilt page | ~3 commits, 600–900 lines | A page that changes the LEDs on the pad, previews without saving, and shows per-key colours. Also fixes keymap sync and OLED commands, which are broken the same way |
| **C** | Honest stub: drop the `alert()`, show "NO BRIDGE — these values are not on the device", label invented effects as unavailable | 30 min | Honest, still useless |
| **D** | Cheap real win: bind LED controls to keys instead of a page | 1 commit, ~120 lines | `ACTION_TYPE_LED_MODE` exists in firmware; a key can switch mode / raise brightness with no UI at all. The pad does the work, the app just assigns it |

## 6. What I recommend

**B, in this order, starting with the transport.** Reasons:

1. **The transport is the actual defect.** Three features (lighting, OLED
   push, keymap sync) are silently broken by it. Fixing the page first would mean
   writing a beautiful UI on top of a pipe that does not carry bytes.
2. **Then D**, because it is the smallest thing that makes the pad better with no
   page at all: `LED mode next`, `brightness +/−`, `LED off` as bindable actions,
   dispatched from the firmware. If you never open a lighting page again, this is
   the 80 % case.
3. **Then B2/B3** — the rebuilt page against the real eight modes, with
   `PREVIEW_LIGHTING` on drag and `SET_LIGHTING` on save, per-key colours included,
   and a JS port of `led_compute_frame` so the on-screen preview and the pad agree
   (verified against the existing C test vectors, the same way the protocol is).

If the transport work is unwanted, **C is not worth it and A is the honest move** —
but A throws away the one part of this app's feature set that the firmware already
implements properly.

**Say which of A / B / C / D and I start.** My default if you just say "go": B1
(transport) + D, one commit each, leaving the page rebuild for its own commit.

---

## Resolved — what shipped

The page was rebuilt against the real thing, in three commits, plus one thing this
document did not anticipate: **the transport problem had two halves.**

1. **The device could not hear the app at all.** The app sends `OLED:MODE:<id>`,
   `OLED:AUTO:<s>`, `OLED:PL:<mask>` and `OLED:CH:<n>` over CDC; nothing in
   `firmware/` parsed a single one of them, because the C firmware speaks MPAD3
   frames and the only parser that ever understood those lines was the Arduino
   sketch deleted in `7db03f8`. Fixed in `firmware/src/core/ascii_cmd.c`: while the
   frame parser is hunting for a start byte, printable bytes go to a line parser;
   a frame can never begin with a printable byte, so the two protocols share one
   port without ambiguity. 11 host tests plus a parser-state test.
2. **The app could not write lighting.** `src/utils/mpad3Link.ts` now speaks the
   frame protocol over the serial port the app already opens, using
   `host/protocol/mpad3-protocol.mjs` (the module the Node suite verifies against
   the compiled C) rather than a copy of the wire format. Bench-only
   `PREVIEW_LIGHTING` is sent only from an explicit Preview click while
   `CAP_LED_OUTPUT` is present; `SET_LIGHTING` on Save checks ACK, commits and
   verifies readback even when output is gated. `GET_LIGHTING` reads it back.
   Raw `LED_TEST` is no longer a UI "clear" action: the transport waits for ACK
   and the firmware bounds it to 300 ms. A pad that does not answer a compatible
   PING/INFO is `NO PROTOCOL DEVICE` and no write claims to have happened.
3. **The engine is shared.** `src/lighting/engine.ts` is a port of
   `led_compute_frame` / `hsv_to_rgb` / `led_gamma_scale` and the gamma table;
   `tests/ledEngine.test.cjs` builds the C for the host, dumps 21 scenarios from
   `firmware/tests/dump_leds.c` and asserts the TypeScript matches all 207 pixels.
   It caught a real 2/255 error in the port (integer vs float sextant division in
   `hsv_to_rgb`).
4. **The deck twin uses the engine.** Each keycap carries a flat 3 px bar in the
   colour computed for the selected channel, but this is a **simulation**, not a
   claim that the unselected physical strip is illuminated.

What the page shows now: the eight firmware modes (nothing invented, nothing
missing), brightness and speed on the device's own scales, base RGB with numeric
fields, nine per-key colours with a derived mask, and a live 9-pixel preview you
can poke to see Reactive flare. The lie is gone: there is no `alert()`, and the
result line distinguishes "editor only" from "the pad acknowledged this write".

Closed since: **the deck has four layers and the device now has four channels.**
`CFG_CHANNEL_COUNT` went 3 → 4 in v2 (2268 bytes); v3 adds OLED settings
(2272 bytes). A CRC-valid v2 A/B slot is now migrated into the other flash
sector without dropping bindings or lighting; a version-1 config is still
rejected by length and re-seeded rather than read with the wrong channel stride.
One lighting config per layer, no clamping, and `hsv_to_rgb` spreads the tint across
`CFG_CHANNEL_COUNT` rather than a literal 3 — the LED parity test caught that
literal when the C changed and the TypeScript did not.

Two smaller things found on the way: `tools/gen_protocol.py` emitted
`export type CommandId = 0, 1, 2, …` (comma-separated, which is not valid
TypeScript — nothing imported the file before, so nobody noticed), and the header
of `App.tsx`'s sync path still sent a JSON `SYNC_KEYMAP` blob over WebHID, which
the firmware does not parse.

**Then the sync path was rebuilt.** "Upload to deck" now reads the pad's config
with `GET_CONFIG`, replaces the key and knob slots (`src/utils/deckToConfig.ts`),
streams nine `SET_CONFIG` chunks and waits for `COMMIT_ACK` — and the uploading
modal reports phases and the pad's own answer instead of animating a fake progress
bar and declaring success unconditionally, which is what it used to do. Alongside
it, physical key presses finally reach the editor: the firmware's unsolicited
`KEY_EVENT` frames (0xC0) are decoded in `Mpad3Link` and turned into the same
notifications the simulator raises, and an `ERROR` frame with nobody waiting is
reported instead of being dropped. See "Which paths the app actually uses" in
docs/ARCHITECTURE.md.
