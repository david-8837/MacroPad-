# Windows laptop and desktop compatibility

This describes the intended behavior and tests still needed, not a guarantee that every computer or monitor is supported. The public test installer is an unsigned Windows x64 build; native Windows integration and physical pad behavior must be checked on real machines before claiming support. Windows ARM devices, other operating systems, enterprise restrictions and remote desktop sessions need separate validation.

## Display and window

- The editor starts maximized within the available desktop work area. The user can restore it with the title-bar button; reopening from the tray preserves the current window state.
- Windows scaling reduces the effective CSS/DIP work area. The editor stacks its main content and inspector when the three-column layout would be clipped, and the layer rail opens from the Layers, firmware & backup button. Narrow screens can require vertical or horizontal scrolling.
- Browser layout tests (`tests/appResponsive.browser.cjs`, optional Chromium and puppeteer-core required) exercise several effective viewport sizes. This does not verify native Windows scaling, mixed-DPI monitor transitions, native window placement or every display resolution.

## Shortcuts and media

- Shortcuts execute in the focused application. Clicking the simulator focuses the editor, so app-specific shortcuts and Windows snapping may target the editor rather than another app. Some system or elevated-app shortcuts can be blocked by Windows security or policies.
- Pad keyboard actions use USB HID key positions; character and symbol results depend on the host keyboard layout. The virtual keyboard and shifted-symbol mappings assume a US layout. Games and applications can override their own shortcuts. The keyboard tester, simulator and physical pad are different paths.
- Media keys request standard OS media actions. The active media application and Windows must handle them; not every application supports every action. YouTube next/previous depends on the browser exposing those controls and on the video having a supported queue or playlist. A sent media key does not prove the browser acted on it.
- For simulator brightness, Windows WMI is attempted for a compatible built-in display. Each press aims for a 10 percentage-point change, snapped to a supported brightness level; the real result depends on the display driver. If that reports no compatible display, the editor tries DDC/CI brightness VCP 0x10 on the first controllable external monitor. DDC/CI may need to be enabled in the monitor's own menu and may not work through some docks, adapters, cables, drivers or monitors. The app cannot yet select a particular display, and an unsupported monitor returns an error. The physical pad instead sends the USB consumer brightness usage; external-monitor DDC/CI fallback is **not** applied to that physical action.
- Text actions use the active application's input. Text that looks like an executable remains literal text; legacy executable scripts are blocked and should be reassigned with Open App. The pad accepts only short printable US-ASCII text; longer or non-ASCII text needs the desktop route and compatible USB events.

## Required real-machine matrix

Record the app build/commit, Windows version, machine model, display scaling, keyboard layout, monitor model and connection, app under test, pad/firmware version and outcome for each run. At minimum test:

1. A Windows laptop with built-in display, and a desktop with an external display. Check startup, maximize/restore, window dragging, navigation, layer selection, editor drawers and scrolling at normal and high Windows scaling. Include a mixed-DPI second display if available.
2. Volume up/down/mute and playback/stop/next/previous in multiple media applications. Verify brightness up/down on the built-in panel; separately test DDC/CI on an external monitor and a monitor with DDC/CI disabled or unsupported. Do not infer physical-pad support from simulator results.
3. Key and knob assignments in each of four layers, existing saved settings, backups, app launch, text entry and shortcuts in the intended focused application. Test a non-US keyboard layout and an elevated target app, documenting differences.
4. With actual hardware, verify BOOTSEL/flash, connection, all key and knob gestures, held keys, upload/readback, unplug/reconnect and recovery. Use the supplied wiring guide and keep RGB disconnected until its power/data design is approved. Both bundled UF2s are untested on hardware.
