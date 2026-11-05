# ZERO project audit — 4 November 2026

## Status and scope

**Not cleared for production; the complete audit remains open.** Two consecutive post-change automated test/build passes succeeded, but passing tests are not two exhaustive finding-free inspections of the entire product. Hardware, Windows integrations, real third-party transactions and several recovery paths still need verification. The prior report, `docs/AUDIT_REPORT.md`, records earlier findings and repairs; its release-status and feedback descriptions are historical and are superseded by this report.

The existing published Windows prerelease is `v1.0.1-test.2`. The new fixes in this report are local working-tree changes and are **not in that installer or the deployed website**. No new release or push was performed for this audit.

## Findings and repairs in this audit

Severity describes potential impact, not proof that exploitation or hardware failure occurred.

| Severity | Finding and root cause | Repair and regression coverage |
| --- | --- | --- |
| High | The flasher inspected a UF2 and then reread it for copying, so a changed file could cause unvalidated bytes to be written. Multiple connected bootloaders and overlapping requests could also select an unintended target or interfere with a transfer. | `electron/native/firmware.cjs` now copies the same buffer it validates, refuses ambiguous drives and serializes transfers. It checks the selected drive and explains that disappearance is not proof of a successful boot. `tests/firmwareFlasher.test.cjs` simulates the races and drives; `src/components/FirmwarePanel.tsx` and `src/types/electron.d.ts` show ambiguous-drive errors. No real flash was attempted. |
| Medium | Linux automounts commonly nest the volume below a user directory, which the prior drive search missed. | Search one additional directory level under `/media` and `/run/media`; test the nested path using simulated filesystem calls. Other mount arrangements and real devices remain untested. |
| Medium | A webhook could be acknowledged while the editor window existed but its event listener had not subscribed or had been removed during reload. Unexpected callback exceptions could also interrupt request handling. | `electron/preload.cjs` signals subscription changes; `electron/main.cjs` accepts signals only from the trusted editor and clears readiness on navigation or renderer failure. `electron/webhookServer.cjs` returns 503 for callback errors. `tests/startup.test.cjs` and `tests/webhookServer.test.cjs` exercise the state changes and failures. A 202 acknowledges dispatch, not execution; a crash after dispatch can still lose an event. This is not a durable queue. |
| Medium | Malformed application-library data could crash search/selection or be replaced by an automatic scan, losing recoverable manually browsed entries. Storage quota failures were silent. | `src/utils/appLibrary.ts`, `src/components/KeyConfigDrawer.tsx` and `src/components/AppLauncherPanel.tsx` validate cache entries, retain malformed raw data, warn when saving is blocked, and keep discoveries usable for the session. Tests cover corrupt, legacy, quota and UI scan scenarios. Recovery of malformed library data is not yet a guided in-app workflow. |
| Low | The README listed a Node version below the project's configured minimum. | Updated `README.md` to Node 22.12 or newer and added a packaging regression check. |

The earlier audit also repaired navigation/IPC trust boundaries, storage/backup corruption handling, gesture cancellation, UI accessibility, audio controls and other behavior. See the earlier report and the corresponding source/tests for details. Those fixes were included in the published test installer unless specifically identified above as new local changes.

## Verification performed

- Two consecutive **post-change** runs of `npm test`, `npm run build`, `npm run build:electron`, `python3 tools/gen_protocol.py --check`, `npm run oled:frames:check`, and `bash scripts/test-all.sh` passed. Logs: `/tmp/zero-verified-1.log` and `/tmp/zero-verified-2.log` in this sandbox. ARM cross-compilation was skipped in both runs. Electron staging checked 19 IPC channels and native assets; it did not execute the Electron binary.
- Host firmware and protocol tests, pin mapping and USB descriptor checks passed. The flash-budget checker verified layout limits but found no local UF2 build to measure. Bundled images received structural tests only.
- Actual headless Chromium exercised editor layouts at ten sizes, mixer controls, key/knob gestures, keyboard navigation, backup and corrupt storage, and lazy-loaded production chunks. Automated axe WCAG 2/2.1 A/AA checks found no violations in six sampled editor sections. These are targeted checks, not full accessibility certification.
- Website browser checks covered mobile and desktop preview/FAQ/cases/reload, plus mocked feedback success/failure and PayPal navigation at 320, 390 and 1280 pixels. The tested website flows recorded no unhandled page errors. No real message or payment was sent.
- `npm audit` reported 15 moderate advisories, zero high/critical; `npm audit --omit=dev` reported zero advisories. Remaining findings are in the build/development dependency tree. A suggested forced electron-builder downgrade was not applied without packaging validation.
- The published prerelease's Windows workflow previously passed packaging and installed-startup smoke checks, and CI passed on Windows, Linux and macOS. Those checks predate the new local changes and are not evidence of physical device, Windows audio, or native action correctness.

## Open issues and limitations

1. **High — hardware and firmware safety:** No physical RP2040, OLED or RGB circuit was available. Actual BOOTSEL flashing, USB selection, boot, key repeat/hold, display and electrical behavior remain unverified. The Full Deck UF2's source and behavior are not established. V2 RGB power and data must remain disconnected until its design is approved. The INFO_UF2.TXT heuristic is not authenticated device identity; disconnect other USB storage and verify the detected target before flashing.
2. **Medium — production release and Windows:** The new fixes have not been packaged and tested on Windows. Native audio, media, brightness, keyboard injection, application discovery, DPI and signing need real Windows validation. The published installer is unsigned and predates these local fixes.
3. **Medium — commerce:** The ₹150 V1/V2 purchase controls remain disabled. There is no verified payment integration, private model storage or secure automatic fulfillment. GitHub Pages alone cannot enforce paid delivery; the requested YouPI-PG approach also needs hosting and manual reconciliation.
4. **Medium — integrations:** Web3Forms and the PayPal support URL are configured and tested with mocks. Actual inbox delivery and a real payment remain unverified. Webhook delivery is not durable and does not confirm the requested action succeeded.
5. **Medium — dependencies and platform coverage:** Fifteen moderate build-time advisories remain. ARM builds, actual Electron execution in this sandbox, assistive technology, alternate browsers and exhaustive interactive flows remain untested. The Electron download was unavailable in this environment; no TLS safeguards were disabled.
6. **Medium — local data recovery:** Corrupt app-library data is preserved rather than overwritten, but there is no guided repair/export/reset UI for it. Version 2 backups cover layers, presets, macros, screen and lighting preferences, not this application cache or device flash.

## Overall

The targeted fixes and automated checks improve safety and reliability, but they do not establish that the entire project is free of bugs or ready for production. Further review and the external/device validation above are required before declaring the requested full audit complete.
