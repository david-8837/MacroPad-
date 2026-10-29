# KADOWAZ Deck Studio — User Manual & Hardware Companion Guide

Welcome to **KADOWAZ Deck Studio**, a companion app and simulator for a 9-key RP2040 macropad.

**Hardware status:** No boot-verified firmware image is bundled. A Pico SDK/ARM candidate UF2 was built and source-checked, but the required SSD1306 128×32 OLED on RP2040-Zero GP28/GP29 has only fake-I²C and fake-CDC source tests; physical flash/display validation is still needed. On a verified responding pad, Display Save performs a flash commit with readback. Protocol-v3 runtime OLED streaming and mode sync are source-implemented; LED data output is default-disabled while the cuttable strip and its supply are unselected. Real hardware behavior is not yet confirmed.

This guide covers connection and configuration; treat descriptions of optional hardware as target behavior until verified on a real board.

---

## 📌 Table of Contents

1. [Hardware Overview](#1-hardware-overview)
2. [Connecting Your Macropad](#2-connecting-your-macropad)
   - [USB Serial / COM Port Connection](#usb-serial--cdc-mode)
3. [In-App RP2040 Firmware Flashing](#3-in-app-rp2040-firmware-flashing)
4. [Deck Studio & Digital Twin](#4-deck-studio--digital-twin)
   - [Key Configuration (Tap, Hold, Double-Tap)](#key-temporal-mechanics)
   - [Safety Isolation (Long-Press Protection)](#safety-isolation)
   - [Rotary Encoder Dial Modes](#rotary-encoder-configuration)
5. [Four-Layer Architecture](#5-four-layer-architecture)
6. [Windows Audio & Per-App Volume Mixer](#6-windows-audio--per-app-volume-mixer)
7. [Live OLED Telemetry & Display Modes](#7-live-oled-telemetry--display-modes)
8. [Global Command Palette (`Ctrl+K`)](#8-global-command-palette-ctrlk)
9. [Inline Action History & Diagnostics](#9-inline-action-history--diagnostics)
10. [Troubleshooting & FAQ](#10-troubleshooting--faq)

---

## 1. Hardware Overview

The physical macropad features:
- **9 Mechanical Switches (direct GPIO):** one RP2040 pin per key, no 3×3 diode matrix in this build.
- **1 EC11 Rotary Encoder:** Detented continuous dial with an integrated push switch.
- **Required SSD1306 128×32 OLED:** wire 3V3/GND and I²C0 GP28 SDA/GP29 SCL (0x3C). Firmware draws baked animations and offline live-mode fallbacks; the assembled panel is not yet bench-tested.
- **9 planned addressable RGB pixel positions:** You intend to buy a cuttable strip; its exact chipset, per-pixel cut points, current and 5 V supply are unknown. Normal firmware gates physical data OFF after initialization. Lighting presets can be edited/saved but no physical LED output is approved yet.
- **Waveshare RP2040-Zero:** Dual-core ARM Cortex-M0+ microcontroller with 2MB onboard flash memory.

---

## 2. Connecting Your Macropad

Connect the macropad to your Windows PC using a **USB-C data cable** (ensure it is not a power-only charging cable).

Open **KADOWAZ Deck Studio**. In the top right corner of the navigation bar, click the **NOT CONNECTED** pill.

### USB Serial / CDC Mode
1. In the connection dropdown, select **USB Serial / COM Port**.
2. Select the RP2040's COM port (for example, `COM3`), at 115200 baud.
3. When the device answers the MPAD3 probe, key/encoder events and configuration use this serial link. The device's HID keyboard/consumer reports go directly to the operating system. **There is no raw WebHID event interface** in this firmware; do not select a keyboard HID interface for pad events.

> **Key Tester is an OS keyboard-event visualizer, not a pad diagnostic.** It draws `KeyboardEvent.code` events delivered to the focused app (from any keyboard), and separates fresh keydowns from OS auto-repeat. It cannot identify their source, measure scan/USB latency or detect switch chatter. Verify physical switch registration and timing with a booted pad, its CDC `KEY_EVENT` reports and appropriate USB/logic-analyser instrumentation. The simulator works without a board; serial connection alone does not prove correct actions.

---

## 3. In-App RP2040 Firmware Flashing

The app can transfer a **user-supplied** RP2040 `.uf2` file to a board in BOOTSEL mode. No known-good image is bundled; obtain or build one for your exact board and retain a recovery path before flashing. Structural inspection cannot prove an image boots.

### Entering BOOTSEL Mode:
1. Unplug the USB-C cable from the macropad.
2. Press and **hold** the tiny **`BOOT`** button on the RP2040-Zero board (located next to the USB-C port).
3. Plug the USB-C cable back in, then release the button.
4. Windows will automatically mount a removable drive named **`RPI-RP2`**.

### Flashing via Deck Studio:
1. Expand **RP2040 Firmware & Bootloader** below Edit Layers in the **left sidebar**. The top connection menu's **Firmware & bootloader** shortcut (when offline) or the `Ctrl+K` firmware action expands that same sidebar row; it does not open a separate app popup.
2. Check that **BOOTSEL Drive** reports the mounted `RPI-RP2` volume (for example `D:\`). Browser preview cannot inspect Windows drives; use the desktop app.
3. Click **Browse .uf2 File…** (this intentionally opens the standard Windows *file picker*) and select a **known-good** image built for your exact hardware. Do not assume a file in this repository is ready to flash.
4. The flasher checks UF2 block structure, RP2040 family, contiguous image addresses, and plausible boot vectors. It does **not** prove the program boots or matches your board.
5. **Flash Firmware** stays disabled until a valid RP2040 UF2 and BOOTSEL drive are detected. Click it only when ready, then verify that the board re-enumerates and responds to the serial probe. Keep BOOTSEL recovery instructions handy if it does not.

---

## 4. Deck Studio & Digital Twin

The **Deck Studio** tab provides a real-time digital twin of your physical hardware. Clicking a switch on the visual pad opens the **Switch Configuration Drawer** while the deck is unlocked.

**Deck lock:** Click **Lock deck** in the sidebar to make key/knob assignments and PC M-slot editing read-only and block deck uploads (including the Studio and command-palette paths). Open key/knob editors and the upload sheet close when locking; the lock button is disabled during an in-progress upload. Exporting a backup and browsing editing layers are still allowed. Click **Unlock deck** to resume editing. The lock is saved locally with the deck, but is **not** a password, an import validator, a pad security feature or a way to stop actions already saved to the pad. Display and lighting settings are separate from deck bindings and remain editable. There is no in-app deck import in this version; modifying local storage or running another program can bypass this convenience guard.

### Key Temporal Mechanics
Each key supports three distinct temporal actions:
- **Tap Action:** Fires immediately on a standard momentary click (e.g., `Ctrl+C`, Launch App, or Layer Next).
- **Hold Action (Mod-Tap):** Fires when the key is held down past 250ms (e.g., holds `Shift`, switches temporary layer, or triggers a macro).
- **Double-Tap Action (Tap Dance):** Fires when double-clicked within 300ms (e.g., `Select All`, or emergency mute).

### Safety Isolation (Long-Press Protection)
For critical or destructive actions (such as *Delete All*, *Close Workspace*, or *Emergency Stream Cut*), enable **Safety Isolation**:
1. Check the **Destructive Safety Action** toggle in the Key Drawer.
2. Set the threshold duration (e.g., `1500ms`).
3. A casual tap does not execute the action. In the simulator, confirmation fires after the threshold while held; with MPAD3 serial events, it fires **on release** only if the firmware reported a verified hold duration at least that long. It stays PC-only: keep the app open and connected, and update firmware if older events report no duration (those fail closed).

### Rotary Encoder Configuration
Click on the rotary knob in the Digital Twin to configure dial actions:
- **Clockwise (CW):** Incremental action (e.g. Volume Up, Scrub Timeline Right, Zoom In).
- **Counter-Clockwise (CCW):** Decremental action (e.g. Volume Down, Scrub Timeline Left, Zoom Out).
- **Single Press:** Momentary center click (e.g. Mute Audio, Play/Pause, Reset Zoom).
- **Hold Threshold (Layer Switch):** The desktop simulator defaults to 800 ms; the firmware's own knob hold defaults to 500 ms. A real pad follows its firmware setting, not the simulator timer.

---

## 5. Four-Layer Architecture

The single Studio Deck contains 4 completely isolated, independent hardware layers, numbered 0–3:
- **Layer 0 (Edit):** Primary shortcuts and navigation.
- **Layer 1 (Tools):** Copy / paste / find and other secondary tools.
- **Layer 2 (Custom):** your own bank.
- **Layer 3 (Macros):** empty macro bank, ready for your own keys.

### How to Switch Layers:
- **Hardware:** Hold the rotary knob past the firmware's configured knob-hold threshold (500 ms by default) to cycle channels; the simulator's setting can differ.
- **Software:** Click a layer in the left sidebar or the layer pills under the deck (**00**–**03**), or select from the `Ctrl+K` command palette.
- **Display feedback:** Firmware now draws a temporary layer indicator on the required OLED when the physical channel changes; the desktop preview also follows the channel. Confirm timing/appearance on the assembled board.

To upload supported bindings, connect a compatible MPAD3 serial device with flash capability, then click **Upload to deck** in the Studio pad's **Configure** column. There is no Upload button in the top navbar. The review panel **slides up from the bottom**: inspect each of the four layers’ nine switches and its **visible rotary knob** (clockwise, counter-clockwise, press and hold). The knob here is a read-only preview; clicking or turning it does not execute an action. Review pad/PC/unavailable assignments, connection and capability warnings, and (for PC-owned actions) the explicit USB-event opt-in. Nothing writes merely by opening it. Use the fixed **Flash / Upload All to Macropad Now** button to begin; the action stays disabled when the pad is unready or the deck is locked. You cannot dismiss the sheet during a write or readback. A successful upload requires a final SET_ACK, COMMIT_ACK, and matching full readback. App-only bindings remain on the PC and require the desktop app plus event reporting. In a browser-only preview or without a connected pad, you can review but cannot upload. The connected-device `Ctrl+K` upload command opens the same review sheet instead of silently writing.

---

## 5. Lighting: presets versus physical LEDs

The Lighting page always has an **on-screen simulation**, not proof of hardware
output. The cuttable LED strip and 5 V source have not been chosen or measured.
With normal protocol-v3 firmware, `CAP_LED_OUTPUT` is absent: physical **Preview
on pad** is disabled, and raw `LED_TEST` replies `LED_DISABLED`. **Save to pad**
can still persist per-channel lighting settings after ACK–COMMIT–readback, but
does **not** light LEDs or certify the supply. The misleading **Clear pad LEDs**
button was removed: sending a zero raw frame did not mean "turn off".

Do not connect an unbudgeted strip to USB/board 5 V. A qualified bench setup
requires selecting a truly individually addressable strip, checking its voltage,
colour order, timing and current, designing a non-backfeeding 5 V source, and
measuring idle/full-white draw with current limiting. Only then may an explicit
`-DMPAD_BENCH_LED_OUTPUT=ON` firmware build drive data. `CAP_LED_OUTPUT` means
*bench data is compiled in*, not that the rail is safe. A raw wiring frame
bypasses brightness and auto-expires after **300 ms**; the normal mode resumes
at the next LED tick. Firmware pulling GP10 LOW after init does **not** cut
strip power, guarantee boot/reset darkness, or clear a previously latched lit
pixel. See [Hardware → LED power](./HARDWARE.md#led-power--this-is-the-one-to-get-right).

---

## 6. Windows Audio & Per-App Volume Mixer

Deck Studio features native Windows CoreAudio & WASAPI COM integration.

### What You Can Control:
- **Master Volume:** Incremental step up/down or direct percentage slider.
- **Master Mute:** Toggle system speaker output with one button.
- **Microphone Mute:** Mute or unmute your primary communication mic (Discord, Teams, Zoom).
- **Per-Application Volume:** Assign the rotary dial or keys to specifically adjust **Spotify**, **Discord**, **Chrome**, or your active game without affecting system master audio!
- **Audio Output Switching:** Toggle between Headphones and Desktop Speakers directly from a key.

---

## 7. Live OLED Telemetry & Display Modes

The 128×32 SSD1306 is a **required physical part**. Seven baked animations and honest local status/fallback screens run autonomously in firmware. On a verified MPAD3 **protocol-v3** pad with a responding panel, the app streams PC-rendered runtime pixels (custom labels, PC clock, measured telemetry and media) at most five times a second; unavailable metrics still show `--` and empty media shows `NO MEDIA`. A hidden preview does not itself stop the stream, but a suspended browser can throttle it. After roughly 1.2 s without a complete frame, firmware resumes its local offline screen on the next refresh. Mode changes made by the pad's gesture/timer update the app without an echo loop. These are source-tested behaviors, not assembled-pad proof.

**Saving the physical display:** With a format-v3 MPAD3 pad that reports both flash and a responding OLED, choose a screen, contrast/brightness, inversion and rotation settings; click **Save Display to Pad**. The app first reads the pad's current config, changes only these OLED globals, requires the final SET_ACK and flash COMMIT_ACK, then reads back and compares the full config. Its saved mode appears on the next boot; contrast, inversion and rotation are applied by firmware. Editing a preview does **not** silently write flash. With no compatible pad, missing panel, or older firmware, the drawer clearly stays **PC-only**. A new v3 firmware boot migrates CRC-valid v2 A/B sectors without dropping existing bindings. Firmware migration does not replace a real backup or hardware verification.

In the Digital Twin, choose a mode or customize the PC preview:

1. **Deck Status:** Banner title, status badge, active layer and deck name.
2. **System Telemetry:** Live CPU utilisation, GPU load, RAM usage and CPU package temperature.
3. **Now Playing:** Track title (scrolling), artist and a synchronised progress bar.
4. **Layer Indicator:** The four-stop layer track with a rounded badge on the active layer.
   It is also what flashes up for a couple of seconds on every layer change.
5. **Collection:** Eight looping screens — progress loader, pixel buddy, signal wave,
   starfield, digital rain, clock, radar sweep and heartbeat.
6. **Audio Equalizer:** retired. It was the only screen that needed a running
   audio analyser to look like anything, so it was replaced by the loop collection.

**How the panel changes screen.** It cannot be tapped — there is no touch layer on
an SSD1306 module — so:

- **Auto switch** sets how long each screen stays up: `OFF`, or 3–255 seconds
  (default 30). A full lap of the 12 shipping screens at 30 s takes 6 minutes.
- **IN ROTATION / SKIPPED** on each card decides which screens take part. Skipped
  screens are jumped over, not deleted.
- **Cycle Next Mode** in the drawer selects the next screen from the PC (a verified protocol-v3 pad confirms the change); the `OLED NEXT` item in MPAD3 Quick Assignments writes firmware action type 13 into a switch, so **pressing that physical switch after upload** advances the on-pad playlist without the PC app. Upload refuses this binding if the connected pad reports no responding SSD1306. Legacy diagnostic `OLED:NEXT` from the host also steps the playlist. A virtual switch click logs that the on-pad action is not being sent; any real step restarts the dwell timer.
- **Frame store** under the cards shows what the loops cost: the panel has
  120 KiB of flash reserved for animation frames (240 frames of 512 B), and the
  shipping seven loops use 53 % of it. Live screens cost nothing because the
  firmware draws them from live values.

---

## 8. Global Command Palette (`Ctrl+K`)

Press **`Ctrl+K`** (or click the search button in the top navbar) from anywhere in the application to summon the Command Palette:
- **Fuzzy Search:** Type to instantly locate pages, layers, keys, audio commands, and hardware tools.
- **400+ PC Shortcuts:** Search application shortcuts across Windows, DaVinci, Blender, Premiere, Photoshop, Figma, and Chrome.
- **Instant Execution:** Press `Enter` on any shortcut in the palette to execute it immediately through the keyboard synthesizer.
- **Keyboard Navigation:** Use `↑` / `↓` arrows to navigate and `Esc` to dismiss.

---

## 9. Inline Action History & Diagnostics

Click the **Activity icon** in the top navbar (or press `Ctrl+K` → `Hardware Status & Diagnostics`). The full panel expands **inline in the right Studio inspector**, above Audio Mixer. It does not open a popup:
- **Action History Stream:** Real-time chronological audit trail of all physical switch actuations, knob detents, app launches, and webhook triggers.
- **Filter Pills:** Filter events by `Key`, `Dial`, `Audio`, or `Safety`.
- **Subsystem Self-Tests:** Run automated health diagnostics across:
  - System Telemetry Engine
  - Windows CoreAudio WASAPI COM Interop
  - Localhost REST Webhook API (`:38491`)
- **Firmware/BOOTSEL:** Managed separately in the **left sidebar**'s expandable RP2040 Firmware & Bootloader row; it is not duplicated in Diagnostics.
- **Export Report:** Copies a comprehensive markdown diagnostic log to your clipboard for technical support or GitHub issues.

---

## 10. Troubleshooting & FAQ

#### Q: The top bar says "NOT CONNECTED" and the USB serial picker doesn't find the board.
- **Solution:** Verify you are using a USB data cable and that your board has running firmware exposing a CDC COM port. A board in BOOTSEL mode appears as `RPI-RP2` storage, not a COM port. Try a direct USB port and inspect Device Manager; keyboard HID alone is not a control link.

#### Q: The rotary knob changes master volume, but I want it to control Spotify only.
- **Solution:** Open the **Deck Studio** tab, click on the Rotary Knob, set the CW action to **Audio Session Volume (+5%)** and set the target process to `spotify.exe`.


#### Q: How do I build a standalone Windows `.exe` installer?
- **Solution:** Open a terminal in the project directory and run:
  ```bash
  npm run dist:win
  ```
  The NSIS installer and portable executable will be generated inside the `release/` folder!

---

*KADOWAZ Deck Studio — Designed for makers, streamers, video editors, and audio engineers.*
