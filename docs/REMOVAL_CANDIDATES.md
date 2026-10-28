# What could come out of the app

An audit of things that are dead, duplicated, broken, or expensive to keep.
Every Tier 1 item was verified by reference count, not by eye.

**Tiers**

- **1 — Delete.** Provably unreferenced or unreachable. No behaviour change.
- **2 — Broken.** Three `tsc` errors point at leftovers of removed features. Fix or delete.
- **3 — Clutter.** Not code, but it costs review time and repo size.
- **4 — Decide.** Live features with a real maintenance bill. Cutting them is a product call, not a cleanup.
- **5 — Split.** One 1.25 MB JavaScript chunk; no dead code involved.

Tiers **1, 2 and 3 are executed** — see [Executed](#executed--tiers-1-2-3) at the
bottom for what changed and for the two items this audit got wrong. Tiers 4 and 5
are untouched.

---

## Tier 1 — dead code, zero behaviour change

| What | Where | Evidence | Saves |
| --- | --- | --- | --- |
| Superseded key editor | `src/components/KeyConfigModal.tsx` | **0 imports.** `KeyConfigDrawer` replaced it in `c106475` and it has not been touched since | 878 lines / 35.6 KB |
| OLED barrel nobody imports | `src/oled/index.ts` | 0 imports of `'…/oled'`; every consumer imports `./modes`, `./frame`, … directly | 356 B, plus one fewer place to keep in sync |
| Retired webhook route | `App.tsx:664` `case '/api/v1/profile'` | `webhookServer.cjs` returns **404** for it, so the renderer branch is unreachable | ~10 lines |
| Pre-profile-store migration | `App.tsx:88-90` `localStorage.getItem('kadowaz_profiles')` | Only runs if a store that no longer exists is present | ~8 lines |
| Dead IPC: `sendOLEDUpdate` | `preload.cjs` + `'oled-update'` in `main.cjs` | 0 renderer calls (the app uses `sendSerialCommand`) | 1 handler + 1 API |
| Dead IPC: `getAppIcon` | `preload.cjs` + `'get-app-icon'` | 0 renderer calls | 1 handler + native icon extraction |
| Dead IPC: `getSystemMetrics` | `preload.cjs` + `'get-system-metrics'` | Renderer only subscribes to `onSystemMetrics` | 1 handler |
| Dead IPC: `inspectFirmwareUf2` | `preload.cjs` + `'firmware:inspect'` | Upload flow only browses and flashes | 1 handler |
| Dead IPC: active-window chain | `getActiveWindow`, `onActiveWindowChanged` in `preload.cjs`, `electron/native/window.cjs`, half of `tests/windowTracker.test.cjs` | Worst case in the repo: `get-active-window` has **no handler in `main.cjs`** (the invoke would reject), `active-window-changed` is **never emitted**, and `native/window.cjs` is **required by nothing**. Its only consumer was auto profile switching, removed with profiles | 3.2 KB module + 2 APIs + the test half |
| Dead IPC: audio device + per-app read APIs | `listAudioDevices`, `setActiveAudioDevice`, `getProcessVolume`, `adjustProcessVolume`, `sampleAudioLevels`, `getNowPlaying` | 0 renderer calls. `sampleAudioLevels` fed the Audio Equalizer mode that was removed; `getNowPlaying` fed a Now Playing screen that now uses state | 6 handlers + COM paths |
| Dead setting: `screensaverMinutes` | `src/types/index.ts:147`, SCREEN SLEEP control in the display drawer | Written by the UI, read by nothing — there is no burn-in timer anywhere | ~25 lines of UI + a field |
| Dead state: `audioVULeft` / `audioVURight` | `src/types/index.ts:141-142`, `App.tsx:164-165` | Left over from the equalizer; the engine never reads them | 2 fields + 2 sample values |
| Dead sprite: `TARGET_DOT` | `src/oled/sprites.ts` | 0 uses | a few lines |
| Dead export: `GLYPH_W` | `src/oled/font.ts` | 0 uses | 1 line |
| Unused component classes | `src/index.css` — `btn--ghost`, `btn--ink`, `btn--sm`, `chip`, `chip--on`, `eyebrow--blue`, `headline`, `panel--flush`, `rule-b` | 9 of 43 custom classes appear in no TSX | ~60 lines of CSS |
| Unused font | `src/assets/fonts/sw-900.woff2` (Switzer) | Tailwind defines `font-display`, and `font-display` is used **0 times** in TSX | 14 KB, one `@font-face` |
| Unused deps | `clsx`, `tailwind-merge` | 0 imports anywhere | 2 deps |

Borderline, keep only if you intend to use them:

- `prevInPlaylist` / `maskToPlaylist` in `src/oled/playlist.ts` — used only by tests today. `prevInPlaylist` is the knob-CCW half of the rotation; if you never bind counter-clockwise, drop both and the matching test block.
- `nextOLEDMode` in `modes.ts` — tests only now that the rotation goes through `playlist.ts`.

---

## Tier 2 — broken leftovers (the three standing `tsc` errors)

These are not new; they mark code that no longer matches its own types.

1. `App.tsx:611` — `Cannot find name 'ActionLogItem'`. A type was deleted and a log entry still names it. Either reinstate the type or delete the log line.
2. `App.tsx:1194` — `handleTriggerAction` is passed where `(name, detail?, type?)` is expected. The Drawer prop contract and the handler disagree; one of them is the old signature.
3. `UploadModal.tsx:61` — compares a category against `'volume'`, a category that no longer exists in `ActionDefinition`.

Each is either a two-line fix or a deleted branch. They are the cheapest quality win in the repo.

---

## Tier 3 — clutter

| What | Detail |
| --- | --- |
| 19 of 20 root images | Only `b90a1e3c-…png` (the README banner) is referenced. Keep `oled-mode-catalogue.png` / `oled-modes-drawer.png` only if you want them linked from the docs; otherwise they are the same kind of capture as the rest. `FINAL-studio.png`, `deck-after.png`, `diag-after.png`, `display-drawer.png`, `n-1280-deck.png`, `osd-after.png`, `palette-after.png`, `w-upload-after.png`, `track-layer-0..3.png`, `track-pinned.png`, `four-layers.png`, `layer-change-filmstrip.png`, `layer-animation.webm` are QA captures. Move the two or three worth keeping into `docs/artifacts/` and reference them; delete the rest. |
| `Macropad Software Feature Research.md` | Research notes at root, referenced by nothing |
| Legacy Arduino sketch | `firmware/kadowaz_macropad/kadowaz_macropad.ino` (228 lines) is a **second, drifted firmware**: dashed-line track, no keycap sprites, no playlist, no capacity rules. README points at it three times. Delete it and point those sections at `firmware/src/`, or keep it and label it "legacy, not maintained". |
| Committed build output | `firmware/build-host/defaults.bin` + `layout.json` are generated, yet tracked. They are regenerated by `make -C firmware -f Makefile.host layout defaults`, which `host/tests/run.mjs` already tells you to run. |
| `dist/` | Present locally, correctly untracked — just don't `git add -A` it. |

---

## Tier 4 — features with a real bill (your call, not cleanup)

Ordered by cost per unit of value, in my reading of the code:

1. **Windows-only audio stack.** `electron/native/audio.cjs` (15.9 KB of PowerShell) + `audio.cs` (21 KB of COM interop for `IMMDeviceEnumerator`, `IAudioEndpointVolume`, `IAudioSessionManager2`, `IPolicyConfig`) + 22 IPC handlers, of which the UI uses about five. It only works on Windows, it is the flakiest thing in the test suite (`tests/audioControl.test.cjs` fails in any container without PowerShell), and per-app volume is the only part the OS does not already give you for free.
2. **OBS WebSocket integration.** `electron/native/obs.cjs` (19.6 KB) + `OBSPanel` (241 lines) + 4 IPC handlers + a test. Valuable if you stream; pure weight if you don't. **Decided and done: removed** — the user does not stream.
3. **Three browsers over one shortcut table.** `CommandPalette` (623 lines), `ShortcutsPanel` (297) and the picker inside `KeyConfigDrawer` (1684) all list `pcShortcuts.ts` (1474 lines / 39.6 KB). Two of the three could go; the palette is the fast path and the drawer picker is where assignment happens.
4. **Key Tester page.** `ViaKeyTester` (577 lines) + the sound engine — it duplicates the Shortcuts vault's purpose for anyone with a working keyboard.
5. **App launcher.** `AppLauncherPanel` (940 lines) + `appDiscovery.cjs`. Launches things the OS launcher already launches, and its data lives in `localStorage` rather than the device. **Decided: kept, but de-tabbed** — the browse grid is how a key gets bound to a program, so the page stays; what went was its nav slot.
6. **Firmware flasher.** `FirmwareModal` (350 lines) + `firmware.cjs` — an in-app UF2 flasher for a board that also flashes by dragging a file onto `RPI-RP2`.
7. **Fake telemetry fallback.** `App.tsx:481` invents `cpuLoad: Math.floor(18 + Math.random() * 25)` when there are no native metrics, so the OLED "System Telemetry" screen shows plausible numbers that mean nothing. Either show `--`/`SIM` or drop the simulated ticker.

---

## Tier 5 — not removal, splitting

The built bundle is **1.25 MB** of JS in one chunk (Vite warns about it). None of these needs deleting; they need to leave the initial load:

- `pcShortcuts.ts` (39.6 KB of data) — only the palette, the vault and the drawer picker need it.
- `lucide-react` — the icon set is imported per component but there is no tree-shake-friendly boundary; icons in rarely-opened drawers inflate the entry chunk.
- The audio / firmware / diagnostics stack — all of it lives behind modals, so it is a natural `React.lazy` boundary.

---

## If I had to pick

Delete every Tier 1 row and all of Tier 3, fix Tier 2 — that is roughly **1 000 lines of component code, ~120 KB of source, a native module, two dependencies, a font, and a stale second firmware** out of the repo with no user-visible change. Then decide Tier 4 one feature at a time, starting with the audio stack, because it is the largest thing that only works on one OS and the only part of the suite that fails its own test outside Windows.

---

## Executed — Tiers 1, 2, 3

Tiers 1–3 are done. Tier 4 (product decisions) and Tier 5 (code-splitting) are
untouched and still open. The table below records what actually happened, including
the two places the audit was wrong.

| Item | Outcome |
| --- | --- |
| `src/components/KeyConfigModal.tsx` | **Deleted** (878 lines). No imports, no test, no doc reference |
| `App.tsx` `case '/api/v1/profile'` | **Deleted.** The webhook daemon answers 404 for that route, and `webhookServer.test.cjs` asserts the 404 |
| `App.tsx` `kadowaz_profiles` migration | **Deleted** — 10 lines of one-time migration for a store nothing writes |
| Dead IPC (`sendOLEDUpdate`, `getAppIcon`, `getSystemMetrics`, `inspectFirmwareUf2`, `setMasterMute`) | **Deleted** from `main.cjs`, `preload.cjs` and `electron.d.ts`. `onSystemMetrics` (the live subscription) and the metrics broadcaster it feeds were left alone |
| Dead audio reads (`listAudioDevices`, `setActiveAudioDevice`, `getProcessVolume`, `adjustProcessVolume`, `sampleAudioLevels`, `getNowPlaying`) | **Deleted** (6 handlers + 6 bridge keys + 6 type entries). The audio module keeps the functions: Tier 4 decides their fate |
| Active-window bridge | **Half deleted.** `getActiveWindow` / `onActiveWindowChanged` are gone from the bridge and the types. See the correction below for why the native module stayed |
| `screensaverMinutes` + SCREEN SLEEP control | **Deleted** (field, reset default, the whole drawer row, the now-unused icon import) |
| `audioVULeft` / `audioVURight` | **Deleted** — 2 fields, 2 sample values |
| `TARGET_DOT`, `GLYPH_W` | **Deleted** |
| Unused CSS | **23 classes, not 9.** The 9 listed above plus 14 `oled-*` classes and 7 `@keyframes` that the pre-canvas panel used (`oled-px`, `oled-dot`, `oled-chip`, `oled-bar*`, `oled-wake`, `oled-roll-*`, `oled-bar-wipe`, `oled-blink`, `oled-scanlines`). The canvas rewrite orphaned them |
| `sw-900.woff2` + its `@font-face` | **Deleted.** Vite no longer emits the Switzer file |
| `clsx`, `tailwind-merge` | **Removed** from `package.json`; `package-lock.json` refreshed `npm install` |
| Tier 2: `App.tsx:611` `ActionLogItem` | Fixed to `ActionHistoryEntry['type']` — the type had been renamed |
| Tier 2: `App.tsx:1194` `handleTriggerAction` | `CommandPalette` does not dispatch actions, it logs lines: it now gets `pushLog` adapted to its `(name, detail?, type?)` shape instead of the dispatcher |
| Tier 2: `UploadModal.tsx:61` `'volume'` | Comparison deleted. `volume` is not an `ActionCategory` and nothing could produce it; the tile is now labelled `MEDIA` |
| 19 unreferenced root images | **Deleted.** The only referenced root image is the README banner, which packaging also ships |
| `Macropad Software Feature Research.md` | **Deleted** |
| `firmware/kadowaz_macropad/` (.ino) | **Deleted**, plus the README surgery it required: feature list item, "Method B: 3×3 matrix wiring" (a topology only that sketch supported), the sketch's `drawChannelScreen` excerpt (replaced by a table of the three C modules that own the panel), the project-tree line, and the "Option B: Arduino IDE" install instructions |
| `firmware/build-host/{defaults.bin,layout.json}` | **Untracked** and ignored. `scripts/host-artifacts.mjs` now runs first in `npm test` and regenerates both with `make -C firmware -f Makefile.host hostartifacts` when they are missing, so a fresh clone stays green |

### Two corrections to this audit

1. **`src/oled/index.ts` was not deletable.** "0 imports" counted TypeScript
   imports. `scripts/export-oled-frames.mjs:29` passes it to esbuild as the *bundle
   entry point*, so deleting the barrel breaks `npm run oled:frames`. It stays.
2. **`electron/native/window.cjs` was not deletable either.** The audit said
   "required by nothing"; in fact `electron/native/audio.cjs:198` requires it to
   resolve the `'focus'` target for per-app volume, and the live `setProcessVolume`
   path reaches that. The module and `tests/windowTracker.test.cjs` both stay. What
   was genuinely dead was only the two preload keys that nothing consumed.

### Verification after the three tiers

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | **0 errors** (was 3) |
| firmware unit tests | 1342 assertions, 0 failures (1389 after the OLED engine) |
| `node host/tests/run.mjs` | 114 checks, 0 failures |
| `npm test` JS suites | 11/11 pass; `audioControl` still fails, unchanged, because the container has no `powershell.exe` |
| browser checks (`uicheck.py`, `uicheck2.py`) | 19 + 9 assertions pass — no console errors, so no CSS or font was load-bearing |
| `vite build` | builds; JS bundle 1,247 kB (Tier 5 territory), Switzer font no longer emitted |
| `npm run oled:frames:check` | frames up to date, 7 loops / 65,024 B / 53 % of the region |
