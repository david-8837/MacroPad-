# Tier 4 — what to do with the features that cost real money

> Historical product triage. Its original Key Tester rationale was incorrect: that UI only observes OS/DOM keyboard events. Step 6 relabels it; it is not a hardware-in-the-loop or timing validator.

## Status

| Item | State |
| --- | --- |
| 1. Fake telemetry + hard-coded "Starboy" | **Done** — measured or `null`, `--` on the panel (`8fdbc38`, `edc4768`) |
| 2. Windows-only tests fail off-Windows | **Done** — skip with a notice (`8fdbc38`) |
| 3. Palette's latent `slice(0, 400)` | **Done** — searches the whole vault |
| 4. Audio stack | **Done (option A)** — the invented session rows are gone; the panel shows master output and microphone, or says the bridge is unavailable. The per-app bridge channels went with them; the engine stayed, because a key bound to `audio_session` still dispatches through `actionExecutor.cjs` |
| 5. OBS | **Removed** — the user does not stream; see the correction below |
| 6. Firmware flasher | Kept — no work, unchanged |
| 7. Key Tester | Kept; Step 6 relabelled it as an OS-event visualizer, not a hardware test |
| 8. Apps tab (940 lines) | **Resolved (option D)** — kept in full, removed from the nav bar. It is a palette-only page now, with its own way back |

A correction to the original reasoning: the audit said all nine audio handlers had
callers. Two of them (`setProcessVolume`, `setProcessMute`) were called only by the
invented rows in the mixer panel, which is why removing those rows removed the
bridge channels — but the same functions are used by `actionExecutor.cjs` for
`audio_session` key actions, so `audio.cjs` and `audio.cs` keep them.

A correction on the OBS removal: `electron/native/obs.cjs` was **not** a fake
integration — 568 lines of real WebSocket v5 client with challenge/response auth,
`GetSceneList`, `SetCurrentProgramScene`, `ToggleStream`, `ToggleRecord` and source
mute, covered by its own test. What was fake was the panel: four hard-coded scene
names and a pre-selected `Full Camera` before any connection, plus a browser-mode
"connect" that flipped a local boolean. So the app lost a working protocol client
nobody had a use for, and an invented UI over it. Everything OBS was deleted —
module, panel, IPC, preload keys, types, palette commands, the diagnostics health
card, two shortcut-vault entries, its test — and the docs that described it.



Tier 4 is not cleanup. Every item here works, is reachable from the UI, and has a
test. The question is whether the maintenance bill is worth the feature.

This is the plan I would follow, ordered by value per hour. Three items are work I
would just do (no product change). One is a genuine product call. The rest I would
leave alone, with reasons.

## Corrections to how the audit framed this tier

Three of the seven items were described more dramatically than they deserve:

| Audit said | Actually |
| --- | --- |
| "Windows-only audio stack" | Windows is the **only** thing we ship. `package.json` builds `nsis` + `portable` and nothing else. Windows-only is the product, not a defect. The real bill is the 518-line C# COM file, not portability |
| "Three browsers over one shortcut table" | Two. `CommandPalette` and `ShortcutsPanel` both read `pcShortcuts.ts` (187 shortcuts); `KeyConfigDrawer` uses its own small `SHORTCUT_PRESETS` list and never imports the table |
| "Palette samples only 400 shortcuts" (correct: it does `slice(0, 400)`) | Harmless today — the table has 187 entries. It is a latent cap, not a bug. Worth deleting the slice, not worth a feature decision |

## Recommendation

| # | Item | Verdict | Why |
| --- | --- | --- | --- |
| 1 | Fake telemetry fallback + hard-coded "Starboy" | **Fix** | The panel is the product's showpiece and it currently lies. Highest honesty per hour in the whole tier |
| 2 | Windows-only tests fail off-Windows | **Fix** | `npm test` is red on any machine that is not Windows, so nobody trusts it. A skip is honest; a red is not |
| 3 | App launcher panel (Apps tab) | **Kept, de-tabbed** | The user launches apps from a key one tap at a time, so the browse grid stays — but it no longer occupies a nav slot |
| 4 | Audio stack | Keep, harden | 9 handlers, all used, all backed by UI. Surface failures instead of cutting |
| 5 | OBS panel + native module | **Delete** (done) | The user does not stream. The client was real; the panel invented its scene list, so it was worth nothing to the only user |
| 6 | Firmware flasher | Keep | Only in-app path to update the board; its UF2 validation is covered by 8 tests |
| 7 | Key Tester page | Keep, relabelled | OS key-event visualizer only; keyboard layout tables remain, but it cannot certify a physical switch or timing |

---

## Do these now

### 1. Stop the panel from inventing numbers

`App.tsx` simulates telemetry when there are no native metrics
(`cpuLoad: Math.floor(18 + Math.random() * 25)`, same for GPU/RAM/temp), and the
Now Playing screen has been reading `nowPlayingTrack: 'Starboy'` since the audio
reads were removed. The simulator is fine — a deck simulator that shows a dead
panel is useless. **The lie is showing invented digits without saying so.**

Plan:

- Add `simulated: boolean` to `OLEDState`, set true whenever the values come from
  the ticker rather than from `onSystemMetrics`.
- The panel draws a `SIM` tag in the corner of every telemetry screen when it is
  set, and Now Playing shows `NO MEDIA` instead of a track name that is not
  playing.
- Same for the drawer previews: they read the same state, so they follow for free.

Cost: ~1 h, one commit, no IPC. Value: the app stops asserting facts it does not
have, which is the rule the rest of the repo already follows.

### 2. Make the Windows-only suites skip instead of fail

`tests/audioControl.test.cjs` fails on any non-Windows machine (it needs
`powershell.exe`). It has been red in every run in this container and that makes
`npm test` useless as a gate. Plan: skip-with-notice when `process.platform !==
'win32'`, print `SKIP (needs Windows)`, and keep the assertions for Windows CI. Do
the same for anything else platform-bound, then `npm test` is green everywhere and
red means something again.

Cost: ~20 min. Value: the suite becomes a gate rather than a permanent caveat.

### 3. Delete the palette's latent shortcut cap

`CommandPalette.tsx:385` does `PC_SHORTCUTS.slice(0, 400)`. It truncates nothing
today (187 entries) and will silently hide shortcuts the day the table grows. Drop
the slice; the ranking already caps how much it renders.

Cost: minutes.

---

## The one real product call: the Apps tab

`AppLauncherPanel.tsx` is 940 lines. It scans for installed applications
(`appDiscovery.cjs`, 752 lines — Start Menu, registry uninstall keys, packaged
apps, App Paths, `PATH`), shows a category grid with search and sort, and assigns
the selected app to a switch.

**The key drawer already does the assignment half.** `KeyConfigDrawer.tsx` has
`drawerApps`, `selectedDrawerApp`, launch args, focus-existing and
launch-minimized options. So there are two places to bind an app, and one of them
is a whole nav tab.

Option A — **delete the Apps tab** (my recommendation). Keep `appDiscovery.cjs`;
binding happens where binding happens. −940 lines, one fewer tab, discovery still
reachable from the drawer. What is lost is the browse-everything grid: search, the
category filters, and the visual scan of 200 app icons.

Option B — delete the drawer's inline picker instead. Smaller win (~200 lines),
worse ergonomics: you lose the inline flow, and the drawer's app fields are the
ones that carry launch args and focus behaviour.

Option C — keep both and accept the duplication. It is ~940 lines that works, and
the Apps tab is the friendlier surface for someone who does not yet know which key
they want.

I would have taken A. **The user took D:**

Option D — **keep the page, take away the tab.** Launching an app from one key is
the reason the deck exists, so the browse-and-assign grid earns its 940 lines; what
it never earned was a permanent slot in the nav bar beside Studio and Tester. It is
now a palette-only page (`Ctrl+K` → *Application Library*), with a one-line header
saying so and a `← Studio` button to get back. Nothing else changed: discovery,
search, filters, sort, the assignment flow and the drawer's inline picker all stay.

That also settles the question the audit asked. The panel was never the problem —
the tab was.

---

## Keep, with reasons (no work)

**Audio (417 lines JS + 518 lines C# + 9 handlers).** Every one of the 9 handlers
has a caller: the mixer panel uses 6, the command palette uses 3, and all of them
were just verified by grep. What it buys that Windows does not give you for free is
**per-app volume on a single key** — that is the point of a macropad. The C# COM
layer is the ugly part (four interfaces, a `IPolicyConfig` default-device call
Windows never documented) but it is written, tested and stable. What I would fix is
the silent-failure path: when the COM bridge is missing, the mixer panel should say
so rather than showing zeros.

**OBS — removed.** The original argument was "it costs nothing at runtime", which
was true and beside the point: the panel seeded four scene names and a connected
state before it had connected to anything, so what it actually delivered was an
invented UI over a real client. Deleted whole (568 + 241 lines, 4 handlers, a test,
a health card, two palette commands, two vault entries).

**Firmware flasher (350 + 269).** It is the only way to update the board without
knowing what `RPI-RP2` is. Its UF2 inspection already has 8 tests, so it is cheap
to own and it is the first thing a new buyer needs.

**Key Tester (originally 525 lines).** It draws a conventional keyboard layout for OS-delivered key events, from *any* keyboard in the focused window. It cannot verify which physical switch fired or measure scan/USB latency or chatter. About 300 lines are the layout tables. The sound engine is shared with other controls; it stays for optional feedback.

---

## If you want to cut deeper anyway

Numbers, so the choice is concrete:

| Cut | Lines/bytes removed | What breaks in the product |
| --- | --- | --- |
| Apps tab (Option A) | 940 lines, ~30 KB of icons at runtime | No browse-all grid; assign from the drawer. **Not taken** — option D instead: page kept, tab removed |
| OBS | 568 + 241 + 4 handlers + 1 test | ~~No scene/stream control from the deck~~ — **already removed** |
| Per-app volume only (keep endpoint volume) | ~250 lines C#, 2 handlers, 2 mixer rows, `window.cjs` | Volume keys work, per-app focus targeting does not |
| Key Tester | 525 + layout tables | No way to verify a switch reports |
| Flasher | 350 + 269 + 1 test | Flash by dragging a UF2 onto the drive |

Nothing else in Tier 4 is worth the edit. The remaining weight is `KeyConfigDrawer`
(1,684 lines) and `pcShortcuts.ts` (187 shortcuts), both of which are load-bearing.

## Suggested sequence

1. Honesty pass — `SIM` tag, `NO MEDIA`, drawer previews follow. One commit.
2. Test skips off-Windows + drop the slice. One commit.
3. The Apps tab decision — done: option D, page kept and de-tabbed. One commit.
4. Audio failure state in the mixer panel. One commit.

Steps 1, 2 and 4 change no feature and no capability. Step 3 is the only one that
removes something a user can currently click.
