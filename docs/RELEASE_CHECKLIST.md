# Release and device validation checklist

This is a checklist, not a claim that a release has been validated. Record the app version, commit, Windows version, hardware revision, firmware name and UF2 hash alongside results. The project owner must decide the project license before publication. Signing and an automatic update service are not configured.

## Automated checks (development machine)

- Run `npm ci`, `npm test`, `npm run build`, and `npm run build:electron`. Run `git diff --check`.
- Build the Windows NSIS and portable artifacts with `npm run dist:win` in a suitable Windows build environment. Check installer, executable, tray and shortcut icons and included firmware/native assets. Do not assume staging on Linux verifies a Windows installer.
- Review third-party asset notices (`src/assets/preset-icons/README.md` and its license files) and release notes. No project license has been selected here.

## Clean Windows install (pending)

- On a clean, supported Windows machine, install NSIS, launch from the Start menu and desktop shortcut, check the taskbar/tray icon, startup, Help & About, close-to-tray, reopen, quit, uninstall and reinstall. Test the portable build separately. Note any unsigned-app warnings; do not represent an unsigned release as signed.
- Exercise a fresh profile and one with existing saved settings. Confirm the welcome guide can be dismissed, existing bindings survive, the Help button reopens guidance, backups export and restore, and startup failure offers recovery.
- Check app discovery/icons and launching, media detection, and CPU/GPU telemetry with real Windows apps and compare with Task Manager; these Windows-specific paths have not been validated in this environment.

## Physical hardware (pending)

- Use `Macropad_Complete_Wiring_Guide.pdf`; check every connection against the actual RP2040-Zero silkscreen with power disconnected. Validate keys-and-knob and full-display builds separately. **Keep RGB power and data disconnected** until the LED supply, current, level shifting and isolation design is approved.
- Both bundled UF2s are untested on a board. The supplied Full Deck UF2's source, pin map and LED behavior are unknown; do not assume it matches the current source. Check the firmware README and hashes before flashing, and have a recovery plan.
- Test BOOTSEL detection/flash and reboot, serial selection/retry and MPAD3 probe, each key/encoder gesture, held-key repeat and game holds, all four layers, upload/readback, unplug/reconnect, and recovery from interrupted writes. Verify desktop-only actions only run with their required PC connection. Test the SSD1306 wiring, static display, streaming and recovery separately on the Full Deck hardware.
- Check power, ground, shorts, temperatures and supply behavior before extended use. Record failures, exact firmware, wiring, test conditions and reproduction steps; do not label firmware or hardware verified until these tests pass.
