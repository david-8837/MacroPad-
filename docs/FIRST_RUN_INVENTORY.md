# What is already on the app the first time you open it

Everything below was read out of the source, not from memory or from a screenshot.
The point of the list is to separate three things that look the same on screen:

| Mark | Meaning |
| --- | --- |
| **REAL** | Measured from your PC or the hardware. Different on every machine, and blank/`--` when nothing can be read. |
| **SHIPPED** | Written into the build. Identical on every machine, present before you do anything. |
| **PRESET** | Offered in a list, but nothing is applied until you click it. |

---

## 1. The deck and its four layers — SHIPPED

Opening the app gives you a deck called **Studio Deck**, four layers numbered 0–3, layer 0 active, switch 1 selected.

### Layer 0 — "Edit" — 9 keys, all assigned, tagged **EXAMPLE**

| # | Label | Fires |
| --- | --- | --- |
| 1 | Blade / Cut | `Ctrl+B` |
| 2 | Ripple Del | `Shift+Del` |
| 3 | Play / Pause | `Space` |
| 4 | Mark In | `I` |
| 5 | Mark Out | `O` |
| 6 | Add Marker | `M` |
| 7 | Snapping | `N` |
| 8 | Fit Screen | `Shift+Z` |
| 9 | Render Out | nothing on tap — hold 1.5 s, then `Ctrl+Shift+R` |

### Layer 1 — "Tools" — 9 keys, all assigned

Copy `Ctrl+C`, Paste `Ctrl+V`, Cut `Ctrl+X`, Undo `Ctrl+Z`, Redo `Ctrl+Y`, Select All `Ctrl+A`, Find `Ctrl+F`, Save `Ctrl+S`, Lock PC `Win+L`.

### Layers 2 and 3 — 18 keys, all empty

"Custom" and "Macros" ship as nine empty slots each (`Switch #1 … #9` / "Empty Slot").

Layer 0 carries an **EXAMPLE** tag in the layer list. It is there to show what a
finished layer looks like; editing any key, dial or name in that layer removes the
tag, because at that point the layer is yours.

**So 18 of the 36 key slots are pre-assigned.** Worth knowing: the *pad itself* ships with **all nine key slots empty** (`firmware/src/storage/config_defaults.c`). The app therefore arrives knowing more bindings than the device does — if you never open the app, nothing is assigned on the hardware. Layer 0 is tagged as an example for exactly this reason.

Assignment is real now: a key you set from the VIA Quick Keycode Tray or the key
drawer is written into `kadowaz_deck` and survives a reload. (It used to only flip
the deck's lock flag and write a log line — see the note at the end of this file.)

### The knob — 4 different behaviours, one per layer — SHIPPED

| Layer | Turn left / right | Press |
| --- | --- | --- |
| 0 | Scrub backward / forward (`Left`/`Right`) | Play / Pause (`Space`) |
| 1 | Volume down / up (audio session, ±5 %) | Mute |
| 2 | Zoom out / in (`Ctrl+Minus` / `Ctrl+Equal`) | Reset zoom (`Ctrl+0`) |
| 3 | Previous / next macro (`Ctrl+Shift+Tab` / `Ctrl+Tab`) | Run macro (`Enter`) |

Knob long-press switches layer, hold threshold 800 ms, sensitivity 5–7 per layer, exponential acceleration.

---

## 2. Reference libraries — SHIPPED, and they touch nothing

### PC & Windows Shortcuts Vault — 184 shortcuts in 14 categories

Blender 24 · DaVinci Resolve 20 · Figma 18 · Canva 18 · Autodesk Fusion 16 · Windows System 14 · Web Browser 13 · Links & Web 11 · Text & Editing 11 · Creative 11 · Window Snapping 10 · Media & Audio 7 · Developer & CLI 7 · Accessibility 4.

The page is read-only since this task: each card copies its combo, nothing is assigned from here.

### VIA Quick Keycode Tray — 118 codes

67 basic · 12 media · 16 macro (`M0`–`M15`) · 12 layer · 11 special, plus the custom raw-keycode entry.

### Macro presets — 49 sequences in 6 categories

Windows 10 · Editing 12 · Browser 7 · Coding 8 · Media 9 · Text 3. Applying one replaces the steps in the selected slot; **no slot is pre-filled**. All 16 slots (`M0`–`M15`) start empty and the macro library is stored under `kadowaz_macros_v2`.

### Command palette (`Ctrl+K`) — 22 commands

Pages 7 · Actions 3 · Hardware 4 · Layer 1 · Key 2 · Audio 4 · Shortcut 1.

---

## 3. OLED screens — SHIPPED

- **12 screens**: Kadowaz (deck status), System, Now Playing, Layer Indicator, Loader, Creature, Wave, Starfield, Rain, Clock, Radar, Pulse.
- **Opens on** "Kadowaz" with title `KADOWAZ IND.` and subtitle `ONLINE`.
- **Auto-cycle on, 30 s per screen** (firmware factory default is the same value).
- **Playlist = all 12**, i.e. nothing disabled — firmware stores this as `oled_playlist = 0` ("nothing turned off yet").
- Brightness 100 %, not inverted.

---

## 4. Lighting — SHIPPED, and the app disagrees with the pad

| | App editor default | Firmware factory default |
| --- | --- | --- |
| Channel 0 | Static, blue `40,96,255`, brightness 200 | Reactive, blue `32,96,255`, brightness 90 |
| Channel 1 | Breath, pink `255,60,120`, brightness 180 | Reactive, magenta `192,32,255`, brightness 90 |
| Channel 2 | Spectrum, brightness 180, speed 96 | Reactive, amber `255,144,16`, brightness 90 |
| Channel 3 | Reactive, green `32,224,96`, brightness 180 | Reactive, green `32,224,96`, brightness 90 |

Four channels, one per layer: channel 0 is Layer 0.

Both sets are deliberate: the firmware picks REACTIVE at 90 because nine LEDs at
full white is about 540 mA, and idles at a third of the base colour so a press
visibly answers. The editor picks brighter looks so the preview shows something on
a monitor. **They are different — and the panel now says so.** With a pad
connected it reads `GET_LIGHTING` the moment the pad answers and prints "VALUES
FROM THE PAD"; without one it prints "EDITOR DEFAULTS, NOT THE PAD'S".

---

## 5. Applications — REAL, nothing pre-loaded

There is no bundled app list. Opening the app library runs discovery on your machine (Start Menu, registry, known install paths), classifies each hit into 9 filter categories, and caches the result under `kadowaz_app_library`. On a machine where discovery finds nothing, the page is empty.

---

## 6. Live data — REAL, never invented

Listed because these are the numbers on screen that are *not* pre-filled, and because they can legitimately read nothing:

| Value | Source | When it cannot be read |
| --- | --- | --- |
| CPU load | Windows performance counters (`typeperf`) | `--`, bar empty |
| RAM usage | Windows performance counters | `--` |
| GPU load | `nvidia-smi` / AMD ADL, else "GPU Engine" counters | `--` |
| Temperature | ACPI thermal zone, else the GPU sensor | `--` |
| Now playing | Windows SMTC (app, title, artist, play state, position) | `NO MEDIA` |
| Key actuations, debounce, connection | the hardware itself | zero / "no device" |

In the browser preview and on non-Windows hosts all of these are `--` / `NO MEDIA`. There is no simulated fallback and no `SIM` badge: the screen says it does not know.

---

## 7. Where all of it is stored — on this PC

`kadowaz_deck` (deck + layers + keys) · `kadowaz_session` (active layer) · `kadowaz_oled` (OLED preferences only) · `kadowaz_lighting` (4 channels) · `kadowaz_macros_v2` (16 slots) · `kadowaz_app_library` + `kadowaz_app_library_ts` (discovery cache).

Clearing these seven keys returns the app to the state described above.

---

## 8. Bundled files

Five font files (General Sans 400/500/600/700 and JetBrains Mono 400). No images, no sample documents, no demo user data.

---

## What I would change about this list

All four are done:

1. **Lighting now reads from the pad.** `GET_LIGHTING` on connect and on channel
   change; the header states where the numbers came from.
2. **Layer 0 is labelled as an example**, and the tag clears on the first edit.
3. **Layer names are Edit / Tools / Custom / Macros** — four layers, numbered 0–3,
   which is also what the device stores now that `CFG_CHANNEL_COUNT` is 4.
4. **Everything else is kept**: shortcut vault, keycode tray, 49 macro presets,
   the OLED playlist and the 22 palette commands.

One more thing this exercise turned up, fixed in the same change: **the save
handlers did not save.** `handleSaveKey`, `handleSaveDial`,
`handleAssignViaKeycode`, `handleAssignCustomCode` and `handleAssignApp` only
toggled `deck.isLocked` and wrote a log line, so a key you assigned was never
stored and the deck always showed what it shipped with. Every one of them now
writes through `putKey` / `writeActiveLayer`, and a browser test assigns a keycode,
reloads the app, and checks it is still there.
