# OLED modes — design, frames and firmware

The panel is a 0.91″ 128×32 monochrome SSD1306. It has **two** colours and **4096**
pixels, so every screen in this document is designed to those limits rather than
downscaled from something larger.

## One renderer, three consumers

```
src/oled/font.ts     5×7 pixel font
src/oled/sprites.ts  1-bit sprites (keycap, badge, buddy, heart, play/pause)
src/oled/frame.ts    128×32 framebuffer, SSD1306 page order, drawing primitives
src/oled/modes.ts    the catalogue: one render(fb, ctx) per screen
        │
        ├── components/OLEDCanvas.tsx  → the deck screen
        ├── components/OLEDCanvas.tsx  → every mode-card preview (same component)
        └── scripts/export-oled-frames.mjs → firmware frame tables
```

There is no second implementation anywhere. The miniature preview in the drawer
is the deck screen is the firmware frame; they differ only in the size they are
displayed at.

## Rules a mode must follow

| Rule | Why |
| --- | --- |
| 1-bit only, no greys and no antialiasing | the panel has no other colour |
| 5×7 text, 6 px advance, uppercase | 21 characters per line; two lines fit in 32 px |
| Text rows start at `y = 1, 9, 17, 25` | keeps the 7 px glyph box off the panel edge |
| Loops are `frames` frames at `fps`, and wrap exactly | the firmware steps frames by timestamp, so a non-wrapping loop would jump |
| Motion is linear | a bouncy curve cannot be represented in 12 fixed frames |
| Live-data screens are marked `runtime: true` | they cannot be baked; the host or firmware draws them |

## Catalogue

| id | Title | Kind | Loop | Notes |
| --- | --- | --- | --- | --- |
| `kadowaz` | Deck Status | runtime | — | title, `ONLINE` badge, layer hero line, deck name |
| `system` | System Telemetry | runtime | — | three meters on a common baseline; `--` for anything the machine does not measure |
| `media` | Now Playing | runtime | — | marquee title, artist, progress meter; `NO MEDIA` when the session is empty |
| `channel` | Layer Indicator | runtime | — | keycap silhouettes + rounded badge on the active stop |
| `loader` | Progress Loader | baked | 12 @ 8 fps | `LOADING` at 2× over eight blocks |
| `creature` | Pixel Buddy | baked | 16 @ 6 fps | 16×16 character: blink, look, bob |
| `wave` | Signal Wave | baked | 15 @ 15 fps | sine over a dotted graticule, one cycle per loop |
| `starfield` | Starfield | baked | 24 @ 12 fps | three depth bands, deterministic star table |
| `rain` | Digital Rain | baked | 24 @ 12 fps | 16 columns, 2×2 heads, 1 px tails |
| `clock` | Clock | runtime | — | `HH:MM` at 2×, seconds sweep, day and date |
| `radar` | Radar Sweep | baked | 24 @ 12 fps | dotted scope, rotating sweep, blips |
| `pulse` | Heartbeat | baked | 12 @ 12 fps | scrolling ECG, beating heart, BPM |

The layer track is the only screen with choreography: 120 ms paint, the square
travels 320 ms between stops with the number rolling one step in the direction of
travel, keycaps return, then a 2.0 s hold before the previous screen comes back.

## Frames and flash

- **One frame = 512 bytes.** 128 columns × 4 pages, bit `y & 7` of byte
  `page * 128 + x` is pixel `(x, y)` — the layout the controller wants, so the
  host buffer, the C array and the I2C write are all the same bytes.
- **Baked tables:** 7 loops, 127 frames, **65 024 B (63.5 KiB)** of the frame
  region — 53 % used, 113 frames (56.5 KiB) free.
- All tables are `const`, so they stay in XIP flash and cost no RAM. The only
  mutable buffer is the 512 B canvas.
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

- **RAM.** Frames are `const` in XIP flash, so the cost is one 512 B staging
  buffer plus the 512 B SSD1306 shadow — about 1.1 KiB whatever the mode count.
- **I²C.** 76 fps ceiling; the catalogue peaks at 15 fps.
- **Config.** A screen is one bit in `cfg_global_t.oled_playlist`, which lives in
  the three padding bytes the 16 B struct already had. No per-mode config bytes.

So: 240 slots. The shipping catalogue uses 127 (7 loops). That leaves 113 frames
— **nine more loops of the smallest size, six of the current average (18 frames),
three at the largest (32 frames)**, and the five live screens (Deck Status,
System Telemetry, Now Playing, Layer Indicator, Clock) cost 0 B because the
firmware renders them from live values instead of frames.

The display drawer shows exactly this: `63.5 KiB / 120.0 KiB · 113 / 240 frames
free · 6 loops headroom`, with a bar. Adding a screen to the rotation that would
overflow is refused with the arithmetic in the message, and the exporter plus
`_Static_assert`s in `oled_playlist.c` stop an over-budget build long before it
reaches a panel.

## Switching: timer, playlist, manual

The panel has no touch layer, so switching is deliberately not a screen gesture:

1. **Timer.** `cfg_global_t.oled_auto_cycle_s` (`0` = off, `3`–`255` s, default
   30). Any input restarts the dwell via `oled_playlist_touch()`.
2. **Gesture.** Bind a key or the knob to `ACTION_TYPE_OLED_NEXT` (13); `code`
   `0xFF` steps backwards. This is the manual switch for people who would rather
   not wait.
3. **Host.** `OLED:NEXT` over CDC, plus `OLED:MODE:<id>` to pin one screen and
   `OLED:AUTO:<s>` / `OLED:PL:<mask>` to push the rotation settings.

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
- `oled_play(canvas, mode, ms)` — blits the frame that a baked loop should be
  showing at `ms`, wrapping automatically. Returns 0 for runtime modes, which the
  firmware draws itself (or which arrive from the host as a pushed frame);
- `oled_flush(canvas)` — SSD1306 init + a 512-byte data burst, compiled only when
  `BOARD_OLED_PRESENT` is set in `board.h`;
- `oled_set_contrast(level)` — the brightness slider's hardware end.

### What is live today, and what is pending

Compiled and covered by the host suite: the config fields, the rotation state
machine (`oled_playlist_*`), `ACTION_TYPE_OLED_NEXT` in the dispatcher, the baked
frame tables, and the capacity assertions. The SSD1306 driver itself is still
behind `BOARD_OLED_PRESENT 0` in `board.h` — the panel is declared but not driven,
because the reference board ships without one fitted.

The ASCII commands below are the host contract, and they are implemented on the
device by `firmware/src/core/ascii_cmd.c`: `OLED:` lines resolve to
`oled_playlist_select()` / `oled_playlist_advance()` / the `cfg_global_t` fields,
with `OLED:AUTO` and `OLED:PL` written into the live config and marked dirty (the
app's Save Display commits it). Text and binary share one CDC port without
ambiguity: a frame starts with `0xA5`, which is not printable, so while the frame
parser is hunting for a start byte any printable byte belongs to a command line.
`firmware/tests/test_ascii_cmd.c` covers split lines, CRLF, junk, over-long input
and out-of-range numbers.

The host talks to it with the existing serial command channel:

| Command | Effect |
| --- | --- |
| `OLED:MODE:<id>` | pin a catalogue mode (sent whenever the mode changes) |
| `OLED:NEXT` | step to the next screen in the rotation |
| `OLED:AUTO:<s>` | seconds per screen, `0` = off |
| `OLED:PL:<mask>` | rotation bitmask, bit *i* = screen *i* |
| `OLED:CH:<n>` | layer-change animation for layer `n` |
| `OLED:<text>` | the two-line text screen used by the localhost webhook |

`firmware/tests/test_oled.c` (host build, no hardware) asserts pixel packing,
page order, the integrity of every baked table (non-blank frames, sane rates,
flash budget) and the playback wraparound.
