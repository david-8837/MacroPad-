# ZERO project audit and repair report

## Status

**Improved, but not cleared for production or a fully completed audit.** The audit’s automated checks passed after the fixes described below. This is not the same as a comprehensive, finding-free audit: known dependency vulnerabilities remain, physical hardware and Windows integrations were unavailable, and paid fulfillment is not connected. Web3Forms feedback was configured after this audit, but real inbox delivery still needs verification. At the time of the audit, these app changes had not been published.


## Subsequent recheck

- A fresh browser test exposed a pointer-capture fallback issue: releasing away from a key or knob could allow a pending hold to fire in a browser where capture was unavailable. Added window-level tracking and blur cancellation, with unit and real-browser regression tests.
- Reran project tests, app and Electron staging builds, host firmware and protocol checks, responsive, storage, gesture, mixer and website browser checks. Hardware and native Windows features still require physical testing; ARM firmware compilation was skipped.
- npm audit continues to report 15 moderate findings and no high or critical findings. A Windows test installer build is required before the website download can be updated.

## Follow-up work

- Updated Electron to 42.11.18 and the CI Node version to 22 (minimum Node 22.12). Electron binary download failed in this sandbox, so runtime compatibility and packaging are **not verified**. No release was published.
- Added version 2 backups for macro definitions/references, display and lighting; version 1/deck-only imports remain compatible. Invalid stored lighting/display data is now preserved, errors are surfaced, and explicit restore enables recovery. Restore rolls back prior writes if any later write fails. Palette export now uses the same validated format and respects unreadable-deck protection.
- Reduced initial bundle size by loading secondary pages, drawers and uncommon saved Lucide icons on demand; real Chromium checked the built production chunks and legacy icon loading.
- Improved keyboard focus and labeling for the command palette, restricted Macro Studio key capture to its focused capture box, and fixed automated accessibility findings in the key tester and lighting page. Palette audio/shortcut commands now report failed or unavailable actions instead of false success. Axe checks were run on six main sections; they are not a complete accessibility certification.
- The follow-up `npm test`, production build, Electron staging, host firmware checks and targeted Chromium tests were rerun successfully. One browser test initially raced a lazy-loaded page; it was corrected to wait for the page and then passed. A clean npm install with Electron binary download and scripts skipped also passed. The real Electron binary download failed with a network fetch error.

## Issues investigated and repaired

Severity describes the potential user impact, not a verified exploit.

| Severity | Finding and root cause | Repair / principal files |
| --- | --- | --- |
| High | Electron accepted overly broad navigation and privileged IPC without verifying the current top-level editor frame, risking exposure of native capabilities to unexpected content. Permission handling was also too broad. | Restrict editor URLs, navigation, IPC senders and serial/HID permissions. `electron/main.cjs`, `tests/startup.test.cjs`, `scripts/build-electron.mjs`. Mock-tested; real Electron and device permissions remain unverified. |
| High | Invalid saved deck or macro data and storage quota errors could cause crashes, misleading success or overwrites of recoverable data. Parseable but malformed decks and shuffled key arrays could also be interpreted incorrectly. | Validate saved structures before use, preserve originals, suppress automatic writes and exports while unreadable, report errors and allow explicit backup restore. Preserve supported old layers and local macro/script assignments. `src/App.tsx`, `src/components/BackupPanel.tsx`, `src/components/via/ViaMacroEditor.tsx`, `src/utils/backup.ts`, `src/utils/presetLibrary.ts`, `tests/storage.browser.cjs`. Backup import deliberately has stricter rules than trusted local storage. |
| High | A held simulator key could also execute its tap; a pointer cancellation/leave could execute an action. The simulated knob had a similar cancellation problem. These actions may control the OS. | Separate tap and hold, cancel on pointer loss or departure (including while captured), cancel stale gestures when layers change, and support keyboard and assistive activation. Rapid ordinary taps now execute individually when no double-tap binding exists. `src/components/KeyMatrix.tsx`, `src/components/RotaryEncoder.tsx`, `tests/keyMatrixGestures.test.cjs`, `tests/rotaryGestures.test.cjs`, `tests/gestures.browser.cjs`. |
| Medium | Application discovery interpolated process names into PowerShell and did not reliably report asynchronous process-start errors. | Quote process names and await process startup errors. `electron/appDiscovery.cjs`, `tests/appLaunchSafety.test.cjs`. |
| Medium | Deck normalization modified input layer and dial objects in place, risking surprising shared-state changes. | Clone changed objects before normalization. `src/utils/channelLayers.ts`, `tests/deckLayers.test.cjs`. |
| Medium | Development server accepted arbitrary Host headers; a missing generated TypeScript protocol artifact caused protocol checks to fail. | Restrict preview hosts while allowing Arena preview domains; restore generated protocol types. `vite.config.ts`, `host/protocol/generated/mpad3-protocol.d.ts`. Malicious Host was rejected; preview and localhost were accepted. |
| Medium | Several dependency advisories affected the development stack. | Update Vite, React plugin, esbuild and Electron, and apply non-breaking npm fixes. Audit findings fell from 20 (4 high) to 15 (0 high). `package.json`, `package-lock.json`. The Electron 42 runtime and Windows packaging still need real testing. |
| Medium | Mixer controls were too small and asynchronous volume/mute operations could race or display stale values. | Enlarge slider targets and thumbs, label controls, serialize/coalesce writes, refresh when reopened and report failures. `src/components/AudioMixerPanel.tsx`, `src/index.css`, `tests/audioMixerUi.test.cjs`, `tests/audioMixer.browser.cjs`. Windows audio remains unverified. |
| Medium | Some shortcuts, shifted/numpad keys, media/brightness, literal text and application launch behavior were missing, misleading or unsafe. | Normalize bindings, separate literal text from executable scripts, route brightness via WMI then DDC/CI, and report unsupported or failed actions. Principal files: `src/utils/{shortcutBindings,deviceKeymap,deckToConfig,executeDeckAction}.ts`, `electron/actionExecutor.cjs`, `electron/native/brightness.cjs`, `docs/COMPATIBILITY.md`. Native behavior is mocked, not verified on Windows. |
| Low | Simulator knob reported acceleration multipliers that were never applied, and drag detents could use a stale rotation reference. | Report a single action per simulated detent and reset the drag reference. `src/components/RotaryEncoder.tsx`. |
| Low | App identity used old branding/icon; constrained layouts and a decorative shortcut symbol had usability/contrast issues. | Add ZERO assets and packaging identity, improve startup and responsive layouts, and darken the symbol. `electron/assets/zero.*`, `electron/main.cjs`, `src/components/{DigitalTwin,ShortcutsPanel}.tsx`, `src/index.css`, `tests/appResponsive.browser.cjs`. Actual Windows DPI/installer appearance remains unverified. |
| Low | Website instructions could be read as recommending publication of paid files in the public static gallery. | Clarify that gallery instructions apply only to explicitly free files. `website/README.md`. |
| Low | Node reparsed the PostCSS config as an ES module and warned on each build. | Use CommonJS configuration. `postcss.config.js`. |

## Verification performed

After the latest code changes, two consecutive automated verification runs passed:

- `npm test`: TypeScript and project Node tests, including mocked Electron IPC/navigation, webhook authentication/validation, storage, gesture, UI, shortcuts, protocol and website checks. One deliberately exercised error path logs `OLED command not sent: Error: save is active`; the test passes. Windows WASAPI test reports a skip on this machine.
- The follow-up build splits the initial bundle to approximately 461 kB minified / 142 kB gzip and no longer reports the 500 kB warning. Electron staging checks 19 IPC channels; it does not run the Electron executable.
- `bash scripts/test-all.sh`: host-compiled firmware tests passed with 2,026 assertions; host protocol tests passed 143 checks. ARM cross-compilation was **skipped**, and these are not physical hardware tests.
- Protocol generation, board pin-map and OLED frame checks passed. Scoped `git diff --check` passed, excluding the pre-existing modified binary wiring PDF.
- Real headless Chromium: app responsive layouts across ten sizes from 480×320 to 1920×1080; mixer keyboard and pointer interactions; key and knob tap/hold/cancel/keyboard; corrupt, malformed, shuffled, invalid-dial, legacy and quota storage scenarios, including successful restore; and website preview, FAQ, feedback placeholder, Cases and reload behavior at mobile and desktop widths. No unhandled page errors were reported in these targeted tests.
- An earlier sampled contrast run using a temporary Chromium/Playwright setup and reduced motion reported no remaining low-contrast sampled nodes. This was an adapted run, not a guarantee of full WCAG compliance.

Browser tests require the optional Chromium/Puppeteer setup and, for the website, a running static server; they are not part of the default `npm test` chain. The new gesture unit tests are included in `npm test` through `tests/keyEvents.test.cjs`.

## Open issues and external validation

1. **Medium — dependency security and Electron upgrade:** `npm audit` now reports 15 moderate findings and zero high/critical after updating Electron to 42.11.18. The remaining advisories trace to minimatch in Electron Builder’s build-time dependency tree. npm suggests a major downgrade of the builder; forcing that or overriding incompatible major APIs without packaging tests would be unsafe. The Electron executable download failed in this sandbox, so the upgraded runtime and Windows package have not been run. The old published installer still has the old dependencies.
2. **High — real-world hardware and Windows:** No physical RP2040 pad, OLED, RGB, Windows WASAPI devices, real Windows native action environment or signed installer was available. The ARM target was not cross-compiled in these runs. Validate flashing, USB serial/HID permission selection, key hold/repeat, media and brightness, audio, app discovery, display, DPI and installer/signing on real hardware before release. The V2 RGB power/data wiring remains unapproved and must stay disconnected.
3. **Medium — backups:** Version 2 now covers local macro slots, screen and lighting preferences, alongside layers and presets, with validation and rollback. Standard M0–M15 references are supported; arbitrary legacy script actions remain unsupported and are reported rather than silently dropped. Backups can contain sensitive text and actions capable of controlling the PC; restore only trusted files. Backups are not pad flash images. Older formats leave data they lack unchanged.
4. **Medium — commerce and feedback:** ₹150 V1/V2 purchases and secure paid delivery are not connected. Purchase buttons are disabled. Web3Forms feedback was subsequently configured; real email delivery remains unverified. No private case files, payment credentials, or secure backend were available. Static GitHub Pages cannot enforce payment. YouPI-PG requires hosting and manual reconciliation and describes itself as experimental.
5. **Medium — accessibility and performance:** The initial JavaScript entry was reduced from roughly 1.18 MB to 461 kB minified by lazy-loading rarely used views and legacy icons. Automated axe checks across six app sections found and helped fix a prohibited ARIA attribute and lighting contrast. Automated checks do not replace assistive-technology, cross-browser or real-device testing.
6. **Release status at audit time:** The audit changes had not been published, and the available unsigned Windows test installer predated the app fixes. A newer build requires Windows validation and publication.

## Overall

The checked host tests and targeted browser paths are passing, and the identified local data-loss, gesture and boundary issues were repaired. The project still has known security advisories, unfinished external integrations and substantial device/platform verification outstanding. It should remain a test build until those issues are resolved.
