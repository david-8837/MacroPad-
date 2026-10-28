# KADOWAZ Deck Studio — User Manual & Hardware Companion Guide

Welcome to **KADOWAZ Deck Studio**, the official companion software and configuration suite for the **KADOWAZ 9-Key Mechanical Macropad with Rotary Encoder & OLED Display**.

This manual covers everything from initial hardware connection and firmware flashing to and advanced multi-layer key binding and per-app audio mixing.

---

## 📌 Table of Contents

1. [Hardware Overview](#1-hardware-overview)
2. [Connecting Your Macropad](#2-connecting-your-macropad)
   - [WebHID Connection (QMK / Raw HID)](#a-webhid-mode-recommended)
   - [USB Serial / COM Port Connection](#b-usb-serial--cdc-mode)
3. [In-App RP2040 Firmware Flashing](#3-in-app-rp2040-firmware-flashing)
4. [Deck Studio & Digital Twin](#4-deck-studio--digital-twin)
   - [Key Configuration (Tap, Hold, Double-Tap)](#key-temporal-mechanics)
   - [Safety Isolation (Long-Press Protection)](#safety-isolation)
   - [Rotary Encoder Dial Modes](#rotary-encoder-configuration)
5. [Four-Layer Architecture](#5-four-layer-architecture)
6. [Windows Audio & Per-App Volume Mixer](#6-windows-audio--per-app-volume-mixer)
7. [Live OLED Telemetry & Display Modes](#7-live-oled-telemetry--display-modes)
8. [Global Command Palette (`Ctrl+K`)](#8-global-command-palette-ctrlk)
9. [Action History & Diagnostic Health Drawer](#9-action-history--diagnostic-health-drawer)
10. [Troubleshooting & FAQ](#10-troubleshooting--faq)

---

## 1. Hardware Overview

The physical macropad features:
- **9 Mechanical Switches (3×3 Matrix):** Cherry MX style hot-swap sockets connected to RP2040 GPIO pins.
- **1 EC11 Rotary Encoder:** Detented continuous dial with an integrated push switch.
- **1 0.96" I2C Monochrome OLED (128×64 SSD1306):** Displays hardware telemetry, audio VU meters, track info, and active channel labels.
- **9 Addressable RGB LEDs (WS2812B / NeoPixel):** Backlighting with per-key color customization and dynamic reactive effects.
- **Waveshare RP2040-Zero:** Dual-core ARM Cortex-M0+ microcontroller with 2MB onboard flash memory.

---

## 2. Connecting Your Macropad

Connect the macropad to your Windows PC using a **USB-C data cable** (ensure it is not a power-only charging cable).

Open **KADOWAZ Deck Studio**. In the top right corner of the navigation bar, click the **NOT CONNECTED** pill.

### A. WebHID Mode (Recommended)
1. In the connection dropdown, select **WebHID Macropad**.
2. Windows will display the secure Chromium device selector listing your connected macropad (e.g. `KADOWAZ Macropad [cafe:4003]`).
3. Select your device and click **Connect**.
4. The top status pill will turn **GREEN** and display **CONNECTED**.

### B. USB Serial / CDC Mode
1. In the connection dropdown, select **USB Serial / COM Port**.
2. Select your device's COM port (e.g., `COM3`, `COM5`) running at 115200 baud.
3. Once connected, key presses, dial rotations, and OLED updates stream bidirectionally.

> 💡 **Verifying Hardware Actuation:** Switch to the **Key Tester** tab from the top navigation bar. Press physical keys on your macropad—the switches on the visual matrix will illuminate green with real-time actuation counters!

---

## 3. In-App RP2040 Firmware Flashing

You can update or reflash your macropad firmware directly from KADOWAZ Deck Studio without installing compiler toolchains or copying files manually.

### Entering BOOTSEL Mode:
1. Unplug the USB-C cable from the macropad.
2. Press and **hold** the tiny **`BOOT`** button on the RP2040-Zero board (located next to the USB-C port).
3. Plug the USB-C cable back in, then release the button.
4. Windows will automatically mount a removable drive named **`RPI-RP2`**.

### Flashing via Deck Studio:
1. In the top navbar, open the connection menu and select **Flash Firmware (.uf2)...** (or press `Ctrl+K` and type `Firmware`).
2. The modal will confirm **READY TO FLASH** with the mounted drive letter (e.g., `D:\`).
3. Click **Browse File...** and select your `.uf2` firmware binary (e.g. `firmware/build/mpad3.uf2`).
4. The flasher inspects the image:
   - Validates all 512-byte blocks and checksums.
   - Verifies the target chip family (`RP2040`).
   - Detects the embedded version number.
5. Click **Flash Firmware**.
6. The software copies the validated image block-by-block. Once complete, the board automatically leaves bootloader mode, reboots, and initializes the OLED and RGB lighting.

---

## 4. Deck Studio & Digital Twin

The **Deck Studio** tab provides a real-time digital twin of your physical hardware. Clicking any switch on the visual pad opens the **Switch Configuration Drawer**.

### Key Temporal Mechanics
Each key supports three distinct temporal actions:
- **Tap Action:** Fires immediately on a standard momentary click (e.g., `Ctrl+C`, Launch App, or Layer Next).
- **Hold Action (Mod-Tap):** Fires when the key is held down past 250ms (e.g., holds `Shift`, switches temporary layer, or triggers a macro).
- **Double-Tap Action (Tap Dance):** Fires when double-clicked within 300ms (e.g., `Select All`, or emergency mute).

### Safety Isolation (Long-Press Protection)
For critical or destructive actions (such as *Delete All*, *Close Workspace*, or *Emergency Stream Cut*), enable **Safety Isolation**:
1. Check the **Destructive Safety Action** toggle in the Key Drawer.
2. Set the threshold duration (e.g., `1500ms`).
3. When tapped casually, the app rejects execution and warns with an amber safety alert. The action will only execute when deliberately held down for the full duration.

### Rotary Encoder Configuration
Click on the rotary knob in the Digital Twin to configure dial actions:
- **Clockwise (CW):** Incremental action (e.g. Volume Up, Scrub Timeline Right, Zoom In).
- **Counter-Clockwise (CCW):** Decremental action (e.g. Volume Down, Scrub Timeline Left, Zoom Out).
- **Single Press:** Momentary center click (e.g. Mute Audio, Play/Pause, Reset Zoom).
- **Hold Threshold (Layer Switch):** Holding down the knob for 800ms cycles through **Layer 0 → Layer 1 → Layer 2 → Layer 3**, back to Layer 0.

---

## 5. Four-Layer Architecture

The single Studio Deck contains 4 completely isolated, independent hardware layers, numbered 0–3:
- **Layer 0 (Edit):** Primary shortcuts and navigation.
- **Layer 1 (Tools):** Copy / paste / find and other secondary tools.
- **Layer 2 (Custom):** your own bank.
- **Layer 3 (Macros):** empty macro bank, ready for your own keys.

### How to Switch Layers:
- **Hardware:** Press and hold the rotary encoder knob for 800ms to cycle to the next layer.
- **Software:** Click a layer in the left sidebar or the layer pills under the deck (**00**–**03**), or select from the `Ctrl+K` command palette.
- **OLED Feedback:** The OLED screen immediately reflects the active layer name and accent color.

To commit your current keymap directly into the RP2040 onboard EEPROM/Flash memory, click the **Sync Keymap to Flash** icon (or press `Ctrl+K` → `Sync Keymap`).

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

The 0.96" OLED display communicates in real-time with the desktop hardware daemon. In the Digital Twin, toggle display modes or customize text:

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
- **Cycle Next Mode**, a key bound to `OLED NEXT`, or `OLED:NEXT` from the host
  step one screen by hand. Any input restarts the dwell timer.
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

## 9. Action History & Diagnostic Health Drawer

Click the **Activity icon** in the top navbar (or press `Ctrl+K` → `Diagnostics`):
- **Action History Stream:** Real-time chronological audit trail of all physical switch actuations, knob detents, app launches, and webhook triggers.
- **Filter Pills:** Filter events by `Key`, `Dial`, `Audio`, or `Safety`.
- **Subsystem Self-Tests:** Run automated health diagnostics across:
  - System Telemetry Engine
  - Windows CoreAudio WASAPI COM Interop
  - Localhost REST Webhook API (`:38491`)
  - RP2040 Bootloader & Firmware Drive
- **Export Report:** Copies a comprehensive markdown diagnostic log to your clipboard for technical support or GitHub issues.

---

## 10. Troubleshooting & FAQ

#### Q: The top bar says "NOT CONNECTED" and WebHID doesn't find the board.
- **Solution:** Verify you are using a **USB data cable**. Some cables only carry 5V power wires. Try plugging directly into a motherboard USB port rather than an unpowered hub.

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
