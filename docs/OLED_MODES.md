# OLED modes — design, frames and firmware

> **Physical target:** required SSD1306 128×32 at 0x3C on RP2040-Zero GP28/GP29. Firmware initializes and flushes the panel; fake-I²C and fake-CDC tests pass, but no actual module/UF2 has been tested. Seven baked modes play locally. Protocol-v3 source streams live PC-rendered runtime frames and syncs physical mode changes; if USB frames stop, the pad draws truthful offline fallbacks. Format-v3 **Save Display to Pad** persists boot mode, contrast, inversion and rotation only after a verified flash transaction with a responding panel. Custom text/measurements are *stored* on the PC, never in pad flash, but appear in volatile runtime pixels while connected.

The target panel is a 0.91″ 128×32 monochrome SSD1306. It has **two** colours and **4096**
pixels, so every screen in this document is designed to those limits rather than
downscaled from something larger.

## Shared baked renderer; local offline fallbacks

```
src/oled/font.ts     5×7 pixel font
src/oled/sprites.ts  1-bit sprites (keycap, badge, buddy, heart, play/pause)
src/oled/frame.ts    128×32 framebuffer, SSD1306 page order, drawing primitives
src/oled/modes.ts    the catalogue: one render(fb, ctx) per screen
        │
        ├── components/OLEDCanvas.tsx  → the deck screen
        ├── components/OLEDCanvas.tsx  → every mode-card preview (same component)
        ├── scripts/export-oled-frames.mjs → firmware baked frame tables
        └── src/oled/streamer.ts → separate 5 Hz runtime producer → USB CDC
firmware/src/core/oled_stream.c → bounded two-chunk CRC-checked volatile canvas
firmware/src/drivers/oled_runtime.c → on-board runtime fallbacks (no PC values)
```

The seven baked loops are byte-for-byte the desktop's exported frames, played
on-device even if the app is open. The five runtime modes use the **same PC
renderer as the preview** when a verified OLED stream is active (clock from the
PC wall clock; measured telemetry/media, or truthful unavailable placeholders;
Deck Status labels). A separate timer sends whole page-order canvases, not the
preview's RAF. Without fresh complete frames, firmware instead draws a local
fallback from `oled_runtime.c` (no invented PC values, uptime instead of an RTC
clock). `scripts/export-oled-font.mjs` generates those offline glyphs from the
same 5×7 font. Source/fake-CDC tests establish a byte path, not physical parity
on an assembled pad. Deck Status and Layer Indicator are streamed only after a
physical layer report; until then the pad's local renderer shows its actual layer.
Changing the layer being edited on the PC does not change that physical layer.

**Bundled firmware limitation:** the user-supplied Full Deck UF2 is unchanged and
its source and OLED protocol are unverified. The refreshed baked frames and local
fallbacks are in this repository's firmware source; they are not installed by
saving display settings. Using them on a pad would require a compatible firmware
build and hardware validation. The Keys & Knob image has no OLED support.

## Rules a mode must follow

| Rule | Why |
| --- | --- |
| 1-bit only, no greys and no antialiasing | the panel has no other colour |
| 5×7 text, 6 px advance, uppercase | 21 characters per line; two lines fit in 32 px |
| Text stays inside the 128×32 panel and avoids neighbouring content | keeps headings, values and artwork legible |
| Loops are `frames` frames at `fps`, and wrap exactly | the firmware steps frames by timestamp, so a non-wrapping loop would jump |
| Motion is linear | a bouncy curve cannot be represented in 12 fixed frames |
| Live-data screens are marked `runtime: true` | they cannot be baked; the host or firmware draws them |

## Catalogue

| id | Title | Kind | Loop | Notes |
| --- | --- | --- | --- | --- |
| `kadowaz` | Deck Status | runtime | — | custom title and badge, large zero-based layer number and four layer marks |
| `system` | System Telemetry | runtime | — | three meters on a common baseline; `--` for anything the machine does not measure |
| `media` | Now Playing | runtime | — | marquee title, artist, progress meter; `NO MEDIA` when the session is empty |
| `channel` | Layer Indicator | runtime | — | keycap silhouettes + rounded badge on the active stop |
| `loader` | Progress Loader | baked | 12 @ 8 fps | decorative loading animation over ten blocks |
| `creature` | Pixel Buddy | baked | 16 @ 6 fps | 16×16 character: blink, look, bob |
| `wave` | Signal Wave | baked | 15 @ 15 fps | decorative sine trace with a dotted axis; not measured voltage |
| `starfield` | Starfield | baked | 24 @ 12 fps | three depth bands, deterministic star table |
| `rain` | Digital Rain | baked | 24 @ 12 fps | 16 wrapping columns with bright heads and dotted tails |
| `clock` | Clock | runtime | — | `HH:MM` at 2×, seconds sweep, day and date |
| `radar` | Radar Sweep | baked | 24 @ 12 fps | dotted scope, rotating sweep, blips |
| `pulse` | Heartbeat | baked | 12 @ 12 fps | decorative scrolling trace and heart; no heart-rate measurement |

The preview's layer track has its own choreography: 120 ms paint, 320 ms
travel and a hold before the previous screen returns. Physical firmware uses a
simpler **1.4 s local layer overlay** during channel changes; this temporarily
takes priority over the streamed runtime image. Do not claim pixel-for-pixel
transition parity from the preview alone.

## Frames and flash

- **One frame = 512 bytes.** 128 columns × 4 pages, bit `y & 7` of byte
  `page * 128 + x` is pixel `(x, y)` — the layout the controller wants, so the
  host buffer, the C array and the I2C write are all the same bytes.
- **Baked tables:** 7 loops, 127 frames, **65 024 B (63.5 KiB)** of the frame
  region — 53 % used, 113 frames (56.5 KiB) free.
- Baked tables are `const` in XIP flash. Runtime RAM also holds one 512 B
  staging canvas and one 512 B validated live canvas in addition to the 512 B
  OLED drawing buffer; the USB TX ring has four bounded slots (~2.1 KiB). No
  streamed pixels touch config sectors.
- **Refresh cost:** a full-frame write is 512 data + 4 control + 8 addressing =
  524 B. At 400 kHz with 10 bit-times per byte the bus carries 40 000 B/s, so the
  hard ceiling is **76 full-frame updates per second**. At 12 fps a loop uses
  6.1 KiB/s (15 % of the bus) and the hottest loop in the catalogue, 15 fps,
  uses 7.7 KiB/s. Anything above 76 fps is a build error in the exporter.

## Where the live values come from

Two of the twelve screens report the machine rather than the deck, and they are
only as good as their source. Neither ever invents a number: a value that was not
measured is `null`, and the panel prints `--`.

| Screen | Value | Source |
| --- | --- | --- |
| System Telemetry | CPU % | `typeperf.exe \Processor(_Total)\% Processor Time`, falling back to an `os.cpus()` tick delta |
| System Telemetry | RAM % | `os.totalmem()` / `os.freemem()` |
| System Telemetry | GPU % | `nvidia-smi`, then `amd-smi`, then the Windows `\GPU Engine(*engtype_3D)` counters |
| System Telemetry | °C | ACPI `MSAcpi_ThermalZoneTemperature`, else the GPU's own sensor |
| Now Playing | title, artist, album, app | Windows media session (SMTC) via `GlobalSystemMediaTransportControlsSessionManager` |
| Now Playing | transport state | `PlaybackInfo.PlaybackStatus` |
| Now Playing | position | `TimelineProperties.Position` at `LastUpdatedTime`, extrapolated by the elapsed time while playing (capped at 5 s, so a stale timeline cannot jump the bar) |

Consequences worth knowing:

- On a laptop with no ACPI thermal zone and no vendor GPU tool, GPU and °C read
  `--`. That is the correct answer; the alternative is a plausible fiction.
- `media` needs an app that talks to SMTC (Spotify, browsers, VLC, iTunes). A
  player that does not will leave the screen on `NO MEDIA`.
- CPU and RAM are real on every platform; GPU and temperature are Windows-only.

## Capacity: how many screens fit

Flash is the only real limit, and it is a byte budget rather than a mode count —
a 12-frame loop is 6 144 B, a 32-frame one is 16 384 B.

| Derivation | Bytes |
| --- | --- |
| RP2040-Zero flash (W25Q16JV) | 2 097 152 |
| − config sectors A/B (`0x1FE000`/`0x1FF000`) | −8 192 |
| − application image ceiling (`0x000000`–`0x1DFFFF`) | −1 966 080 |
| = **frame region** (`0x1E0000`–`0x1FDFFF`, 4 KiB-aligned, below config) | **122 880** |
| ÷ 512 B per frame | **240 frame slots** |

Not the limit, and worth saying why:

- **RAM.** Baked frames are `const` in XIP flash. Local drawing, the staged
  512 B half-pair and the validated 512 B host image consume ~1.5 KiB, plus
  the bounded USB TX ring (~2.1 KiB) and normal parser state, independent of
  the baked mode count.
- **I²C.** 76 fps ceiling; the catalogue peaks at 15 fps.
- **Config.** A screen is one bit in `cfg_global_t.oled_playlist`, which lives in
  the three padding bytes the 16 B struct already had. No per-mode config bytes.

So: 240 slots. The shipping catalogue uses 127 (7 loops). That leaves 113 frames
— **nine more loops of the smallest size, six of the current average (18 frames),
three at the largest (32 frames)**, and the five live screens (Deck Status,
System Telemetry, Now Playing, Layer Indicator, Clock) cost 0 B because the
firmware renders them locally when offline or blits checked PC frames while connected.

The display drawer shows exactly this: `63.5 KiB / 120.0 KiB · 113 / 240 frames
free · 6 loops headroom`, with a bar. Adding a screen to the rotation that would
overflow is refused with the arithmetic in the message, and the exporter plus
`_Static_assert`s in `oled_playlist.c` stop an over-budget build long before it
reaches a panel.

## Switching: timer, playlist, manual

The panel has no touch layer, so switching is deliberately not a screen gesture:

1. **Timer.** `cfg_global_t.oled_auto_cycle_s` (`0` = off, `3`–`255` s, default
   30). Any input restarts the dwell via `oled_playlist_touch()`.
2. **Gesture.** In MPAD3 Quick Assignments choose **OLED → OLED Next** for a switch, then upload to a pad that reports a responding SSD1306. Firmware action `ACTION_TYPE_OLED_NEXT` (13), `code=0`, steps the physical playlist without the PC app; firmware also understands `code=0xFF` for reverse stepping, but this editor does not currently offer a reverse/knob OLED assignment. A virtual switch click only logs the on-pad behavior, not a physical step.
3. **Host.** `SET_OLED_MODE` (binary v2) selects the current physical screen
   and returns its mode/epoch; it does not commit flash. Legacy diagnostic
   `OLED:NEXT`/`OLED:MODE:<id>` text commands still work. `OLED:AUTO:<s>` and
   `OLED:PL:<mask>` are RAM-only diagnostics; the explicit Save persists them.

The rotation only visits screens in the playlist, in catalogue order — the order
is the bitmask's, not the order cards were clicked. `mask == 0` means "every
screen", because that is what a config saved before the field existed reads as.
`src/oled/playlist.ts` and `firmware/src/core/oled_playlist.c` implement the same
rules; `tests/oledModes.test.cjs` parses `oled_playlist.h` and fails if the two
side's screen order ever diverges.

Regenerate after changing a mode:

```bash
npm run oled:frames         # rewrite firmware/include/oled_frames.h + oled_frames.c
npm run oled:frames:check   # CI: fail when the committed copy is stale
```

## Firmware side

`firmware/src/drivers/oled.c` provides:

- `oled_px/hline/vline/rect/fill_rect/invert_rect/blit_pages` — the same
  primitives as the TypeScript `Frame`, in page order;
- `oled_play(canvas, mode, ms)` — blits one baked frame at the mode's frame rate;
  runtime modes instead use `oled_runtime.c`'s truthful local screens;
- `oled_hw_init()` — configure I²C0 GP28/GP29 at 400 kHz and send the 128×32
  SSD1306 init sequence; CAP_OLED requires an actual ACK, not just a build flag;
- `oled_flush(canvas)` — a bounded six-command address window and four 128-byte
  page writes, with error detection and a retry from the main loop;
- `oled_set_contrast(level)` and `oled_set_inverted(on)` — applied from saved
  v3 settings on OLED init and after verified configuration updates.

### Source behavior, streaming and limits

The required display is enabled by `BOARD_OLED_PRESENT 1`, initialised at boot,
and flushed in `main.c` at 6–15 fps for baked loops or 5 fps for runtime
screens. Layer changes temporarily override host pixels with a local overlay.
A missing/NACKing module leaves the keyboard usable, withdraws CAP_OLED and
CAP_OLED_STREAM on the next INFO, and retries I²C every 2 s.

MPAD3 **protocol v3**, **saved config format v3**: after a verified PING/INFO
with a responding OLED, the app reads GET_OLED_STATE (physical mode + epoch)
and subscribes to unsolicited OLED_MODE_EVENT. A pad-originated rotation/gesture
updates the app without sending the mode back and resetting the timer. A UI mode
click sends SET_OLED_MODE and waits for OLED_STATE confirmation; if a flash save
owns the link, the latest click is retried instead of silently lost. The pad
remains autonomous when the app is closed.

Only runtime screens receive host pixels. `src/oled/streamer.ts` draws one 512 B
page-order image from the current deck/layer and latest real metrics/media/clock
at **at most 5 Hz**, independent of `OLEDCanvas` preview RAF. It sends two
265-byte USB payloads (256 pixel bytes apiece) with common mode, sequence and
full-frame CRC-32, in addition to each packet's MPAD3 CRC-16. Firmware stages
the first half for up to 350 ms, rejects mixed/replayed/baked frames, then
atomically publishes a checked image and acknowledges the sequence. It writes
**no pixels to flash**. After 1,200 ms without a complete frame (plus the next
200 ms runtime redraw), firmware shows its truthful local fallback. Browser
background throttling can stop the stream; falling back is expected, not a
fabricated live reading. See [`PROTOCOL.md`](./PROTOCOL.md) for exact bytes.

A format-v3 config stores `oled_boot_mode` (0–11), `oled_contrast` (0–255),
`oled_inverted` (0/1), `oled_auto_cycle_s` (0 or 3–255) and `oled_playlist`
(12-bit mask, 0 meaning all). The verified **Save Display to Pad** preserves
bindings/lighting and requires SET_ACK, COMMIT_ACK and a matching full readback.
A v3 firmware boot migrates CRC-valid v2 A/B flash sectors safely; a failed
write retains the original sector. Custom labels and measured PC data stay
**stored on the PC**, not in pad flash, but their rendered pixels can appear on
runtime screens while USB is active. Without a verified pad/panel, settings
remain PC-only and firmware uses local fallbacks.

Legacy text commands still exist for diagnostics; they share the serial writer
with binary protocol traffic and never interleave an exclusive flash save:

| Text command | Effect |
| --- | --- |
| `OLED:MODE:<id>` | select a catalogue mode without an ACK (the app uses confirmed binary SET_OLED_MODE instead) |
| `OLED:NEXT` | step to the next screen in the rotation |
| `OLED:AUTO:<s>` | RAM-only dwell seconds; `0` = off |
| `OLED:PL:<mask>` | RAM-only rotation bitmask, bit *i* = screen *i* |
| `OLED:CH:<n>` | switch physical layer `n` |
| `OLED:<text>` | **Not implemented**; custom labels are rendered by the PC and sent as volatile pixels when streaming |

The fake-I²C driver, compiled-C assembler/USB handler, host codec/link and
fake-CDC browser tests verify these source paths. They do **not** measure a
soldered SSD1306, USB/key latency under a physical stream or a bootable UF2.

`firmware/tests/test_oled.c` asserts pixel packing, page order, baked table
integrity, offline runtime frames and playback wraparound. The separate
`firmware/tests/test_oled_hw.c` compiles the production I²C driver against a
fake Pico SDK and checks init bytes, pin selection, full-frame order, NACK and
retry. Neither suite measures a real display.
