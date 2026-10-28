# CONTINUE HERE

You are picking up **mpad3 / Deck Studio** cold. This file is the first thing to
read: it tells you how to get the project running, how to check you have not
broken it, and exactly where the work currently stands. Every command below was
run in this repository and passed — nothing here is aspirational.

If you only have ten minutes: read [§1](#1-get-it-running-10-minutes),
[§4](#4-where-the-work-actually-stands) and [§6](#6-house-rules-that-are-not-negotiable).

---

## 0. What this project is

A **desktop application** (Electron + React + TypeScript + Vite) for configuring a
custom 12-key macropad — "mpad3" — with an **RP2040/Pico** firmware on the other
end of a USB serial link. Plus the firmware itself (C, Pico SDK) and a host-side
protocol library used by both the tests and the app.

This is **not** a website. Saving is local save into the desktop app. There is no
server, no account, no cloud.

Three codebases live side by side and must never disagree:

| Part | Path | Language | Truth it owns |
|---|---|---|---|
| Desktop app (UI) | `src/` | React + TS | what the user sees and configures |
| Desktop shell | `electron/` | CommonJS | windows, serial port, OS integration, packaging |
| Firmware | `firmware/` | C (Pico SDK) | what the hardware actually does |
| Shared protocol | `host/protocol/` + `docs/PROTOCOL.md` | JS + doc | the byte contract between the two |

The single most important rule in this repo: **the app and the firmware must not
disagree.** If the UI can display a layer number the firmware cannot store, that
is a bug, not a cosmetic issue.

---

## 1. Get it running (10 minutes)

### Prerequisites

- **Node.js 18+** and npm (the lockfile is committed; use `npm ci`, not `npm install`)
- **Python 3** — only for the browser check scripts in `checks/`
- **make + gcc** — only for building the firmware's host-side artifacts and
  running the C test suite. Not needed to run the app.
- **Pico SDK** — only if you intend to build a `.uf2`. See `docs/HARDWARE.md`.
  You do not need it for any of the app work.

### Steps

```bash
cd macropad

# 1. Dependencies. ~460 packages, about 15 seconds.
npm ci

# 2. Firmware host artifacts. The app loads two generated files —
#    firmware/build-host/layout.json and firmware/build-host/defaults.bin —
#    and several tests read them too. `npm test` builds them for you, but if
#    you are only running the UI, do it once up front:
npm run host:artifacts        # needs make + gcc

# 3. Start the UI.
npm run dev                   # http://localhost:5173

# 4. Or start it inside Electron (real serial port, real window):
npm run electron:dev          # runs Vite, then launches Electron at :5173
```

### Verify you have a clean baseline

Run all of these. They are the definition of "green" in this repo.

```bash
npm test                  # 17 node suites + the host protocol suite. Should exit 0.
make test                 # firmware C suite: 1444 assertions, 0 failures.
npm run build             # production Vite build. Should succeed.
npm run oled:frames:check # OLED frames are up to date (7 loops, 65024 B, 53%).
npx tsc --noEmit          # type check. Prints NOTHING when it passes.
```

`tsc` is silent on success. A silent run is a pass — do not go looking for a
"success" line.

Console errors in the browser should be **zero**. `checks/uicheck.py` asserts this.

---

## 2. The browser check suite (`checks/`)

These are Playwright + Chromium scripts that drive the real app and assert on the
rendered result. They exist because "it compiles" has repeatedly not meant "the
user can read it" or "the button works".

Scripts: `uicheck.py`, `uicheck2.py`, `layercheck.py`, `macrocheck.py`,
`shortcutcheck.py`, `apptabcheck.py`, `uploadcheck.py`, `audiocheck.py`,
`contrastcheck.py`. Screenshots land in `checks/artifacts/`.

### Environment traps (read before your first run)

1. **Chromium is not installed by default.** One-time, ~120 MiB:
   ```bash
   python3 -m playwright install chromium
   ```
2. **Playwright needs a library path** in this sandbox:
   ```bash
   export LD_LIBRARY_PATH=/tmp/libs/usr/lib/x86_64-linux-gnu:/tmp/libs/lib/x86_64-linux-gnu
   ```
3. **The dev server must already be running on :5173.** The scripts navigate to
   `http://localhost:5173` and start with `localStorage.clear()`.
4. **A report of zero can be a lie.** An early `contrastcheck.py` run returned
   "0 failures" because Vite had returned a 500 and the page was blank. The script
   now asserts non-empty body text, but keep the instinct: if a check that should
   find something finds nothing, confirm the page actually rendered.

Run one:

```bash
export LD_LIBRARY_PATH=/tmp/libs/usr/lib/x86_64-linux-gnu:/tmp/libs/lib/x86_64-linux-gnu
python3 checks/contrastcheck.py     # or: npm run check:contrast
```

Expected today: **`=== 0 low-contrast text nodes, 0 distinct ===`**

---

## 3. Known environment traps generally

- **`node_modules` may be missing.** If you see `sh: 1: vite: not found`, run
  `npm ci`. Same for `.cache`, which is where Chromium lives —
  `python3 -m playwright install chromium`.
- **A stale dev server can serve a bundle containing code that no longer exists.**
  If the user describes a feature you cannot find with `grep`, hard-reload the
  page and check the dev server is serving current source before hunting.
- **Host artifacts go stale after struct changes.** If you touch a serialised
  struct in `firmware/include/`, rebuild: `npm run host:artifacts` (or just
  `make layout defaults`). A stale `layout.json` has caused real, confusing test
  failures.
- **`node tests/*.test.cjs` are plain CommonJS**, run directly by node — no test
  framework. They may bundle their subject with `esbuild` first; do not try to
  stub module imports with regexes (that approach broke repeatedly). Bundling
  works; stubbing does not.
- **Protocol doc generation**: `make docs` regenerates `docs/PROTOCOL.md` and the
  TypeScript types from the same source. Never hand-edit both sides.

---

## 4. Where the work actually stands

### Done and verified

| Area | State |
|---|---|
| Four config layers (layers 0–3) everywhere, saves are real | done |
| Upload pipeline: `link.readConfig()` → `deckToConfig` → `link.writeConfig` → 9× `SET_CONFIG` (256-byte chunks) → `COMMIT` → requires `COMMIT_ACK` | done |
| Pad's key events reach the app (`mpad3Link`, `deckToConfig`, `hardwareBridge`) | done |
| Macro page accepts typing on the laptop keyboard | done |
| Shortcuts page is read-only reference (copy only) | done |
| OLED mode simulator, 1-bit frames, budget checked | done |
| OBS integration removed entirely | done, do not restore |
| Legibility pass (see §5) | done, mechanically checked |

### Open, in priority order

1. **Macro "Test Run" animates without executing.** The button shows a run
   animation but no key event is ever dispatched to the OS. Either wire it to
   `electron/native`'s input path or remove the button. A false success is a
   defect in this project — see the house rules.
2. **Cosmetic**: `src/components/WebhookDocPanel.tsx:22` hardcodes `{ layer: 2 }`
   in a documented example payload. It is illustrative, but it is also the only
   place a layer number is hardcoded in a doc panel.
3. **Apps page honesty** (`src/components/AppLauncherPanel.tsx`,
   `localStorage` key `kadowaz_app_library`): the panel's own code is real, but
   review whether everything it claims is derived from a real discovery pass.
4. **`docs/REMOVAL_CANDIDATES.md` tiers 4 and 5** and the items in
   `docs/TIER4_PLAN.md` — deliberately deferred cleanup. Read those docs before
   starting; they record why each was deferred.

Nothing in `src/` or `firmware/` is knowingly broken. The open items above are
honesty gaps and cleanup, not crashes.

---

## 5. The legibility pass, specifically

The user's complaint was **"TEXT ARE NOT SEEING PROPERLY"** — text too faint to
read at rendered size. This was treated as a bug and fixed mechanically, not by
arguing about design intent.

What was wrong and what fixed it:

- `text-[#7A7A7A]` (258 occurrences) rendered at **3.31:1** on the paper
  background and **4.29:1** on white — below WCAG AA (4.5:1) at 8–13 px.
  Replaced repo-wide with `#646464`; `src/index.css:42 --muted` follows it.
  **Do not reintroduce `#7A7A7A` as a text colour.** It is still fine as a border.
- Macro builder tabs had their active state inverted — `text-[#141414]` on the
  blue `#1351AA` active pill (2.44:1) and `text-[#E3E2DE]` on `#EDECE8`
  (1.1:1). Active tabs are now white-on-blue, always.
- The shortcuts category count badge had a `1:1` state (white on white) on the
  active row.
- Lighting swatches put grey labels directly on arbitrary LED colours; labels now
  sit on their own chip.
- The Configure-button row in the digital twin rendered a paper-on-paper label
  when closed.

`checks/contrastcheck.py` walks every visible text node across 5 views, 4 macro
tabs and 3 drawers and asserts nothing is under 4.5:1 (3:1 for large text). **Run
it after any styling change.** It is fast (about 18 s) and it is the regression
guard for this whole class of bug.

---

## 6. House rules that are not negotiable

These came from the user directly and several were corrections after being done
the wrong way. Violating one is a defect even if the code is clean.

- **No fake success.** Nothing may report success without reaching the device or
  the OS. No simulated telemetry, no `SIM` placeholders, no progress bars that lie.
  Upload is only complete on `COMMIT_ACK`.
- **No EXAMPLE/placeholder tags in the UI.**
- **Layers are 0–3.** App and firmware must agree on the count; say the migration
  cost plainly rather than papering over it.
- **Macro page must accept typing on the laptop keyboard.** An on-screen grid as
  the only input was explicitly rejected. No click-to-pick keyboard fallback.
- **No Live Record tab.** No seeded macro content; presets are browse-and-apply.
- **No "Assign to Switch" button** on the macro page — assigning happens in the
  VIA Quick Keycode Tray.
- **Shortcuts page is reference only** — copy, never assign.
- **OBS is removed for good.**
- **The OLED is not a touchscreen.** The simulator must behave like the device.
  Frames are monochrome, 1-bit, no anti-aliasing, no gradients.
- **Design language**: 0 px radius, no shadows, no gradients (the OLED preview is
  the documented exception — see `DESIGN.md`), ~0.3 s linear transitions, General
  Sans / Aileron for text and a mono face for data, leftmost 3 of 12 columns for
  labels.
- **Plain direct summaries.** Decide and recommend rather than asking a question
  when the intent is clear. The user dislikes icon-only buttons and "profiles".

---

## 7. Where the truth lives

Read these instead of re-deriving:

| File | Contains |
|---|---|
| `docs/ARCHITECTURE.md` | process layout, module boundaries, data flow |
| `docs/PROTOCOL.md` | the byte-level serial contract (generated — `make docs`) |
| `docs/HARDWARE.md` | the board, pins, matrix, LED chain, Pico SDK setup |
| `docs/FIRST_RUN_INVENTORY.md` | what the app does on first launch, what is seeded |
| `docs/OLED_MODES.md` | the OLED mode definitions and frame format |
| `docs/LIGHTING_PAGE.md` | per-key lighting model |
| `docs/USER_GUIDE.md` | the app as the user experiences it |
| `docs/FRONTEND_FEATURES_SPEC.md` | the intended feature surface |
| `docs/REMOVAL_CANDIDATES.md` | deliberately deferred removals, with reasons |
| `docs/TIER4_PLAN.md` | deferred cleanup, staged |
| `DESIGN.md` | the visual language, with the OLED exception written down |
| `README.md` | short orientation |

**Protocol constants worth knowing without opening a file:**

```
Frame:        A5 5A | cmd | len | ver | payload | crc16
Config cmds:  0x02 SET / 0x03 GET / 0x05 COMMIT   (acks 0x82 / 0x83 / 0x85)
Lighting:     0x08 / 0x09 / 0x0A / 0x0B  (ack 0x88)
Baud:         115200
Config blob:  2268 bytes, CRC at offset 2264, CONFIG_FORMAT_VERSION 2,
              CFG_CHANNEL_COUNT 4
Key encoding: code = (mods << 8) | hid_usage   →  Ctrl+C = 0x0106
Palette:      ink #141414 · body #444343 · muted #646464 · paper #EDECE8
              rule #E3E2DE · blue #1351AA
```

---

## 8. Recommended first hour

1. `npm ci`, `python3 -m playwright install chromium`, `npm run host:artifacts`.
2. Run the five verification commands in §1 and confirm they are green. If they
   are not, fix that before anything else — you have inherited a broken baseline
   and every later judgement is unreliable.
3. `npm run dev`, open the app, and read every page. You are checking legibility
   and honesty, not features.
4. Start the dev server and run `python3 checks/contrastcheck.py` from `checks/`
   to confirm the legibility guard is still at zero.
5. Then take the first open item from §4 — the macro `Test Run` button is the one
   that matters, because it currently lies to the user.
