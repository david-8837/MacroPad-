# KADOWAZ Deck Studio — User Manual & Hardware Companion Guide

Welcome to **KADOWAZ Deck Studio**, the official companion software and configuration suite for the **KADOWAZ 9-Key Mechanical Macropad with Rotary Encoder & OLED Display**.

This manual covers everything from initial hardware connection and firmware flashing to advanced multi-layer key binding, per-app audio mixing, OBS Studio WebSocket automation, and automated profile switching.

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
5. [Triple-Layer Architecture (Channels)](#5-triple-layer-architecture-channels)
6. [Active Window Tracking & Auto-Profile Switching](#6-active-window-tracking--auto-profile-switching)
7. [Windows Audio & Per-App Volume Mixer](#7-windows-audio--per-app-volume-mixer)
8. [OBS Studio WebSocket 5.x Integration](#8-obs-studio-websocket-5x-integration)
9. [Live OLED Telemetry & Display Modes](#9-live-oled-telemetry--display-modes)
10. [Global Command Palette (`Ctrl+K`)](#10-global-command-palette-ctrlk)
11. [Action History & Diagnostic Health Drawer](#11-action-history--diagnostic-health-drawer)
12. [Troubleshooting & FAQ](#12-troubleshooting--faq)

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
- **Tap Action:** Fires immediately on a standard momentary click (e.g., `Ctrl+C`, Launch App, or OBS scene switch).
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
- **Hold Threshold (Channel Switch):** Holding down the knob for 800ms automatically cycles through **Layer 1 → Layer 2 → Layer 3**.

---

## 5. Triple-Layer Architecture (Channels)

Each profile contains 3 completely isolated, independent hardware layers:
- **Layer 1 (Edit / Blue):** Primary shortcuts and navigation.
- **Layer 2 (Color / Green):** Grading, secondary tools, or mixer.
- **Layer 3 (Audio / Amber):** Sound levels, mic control, or system shortcuts.

### How to Switch Layers:
- **Hardware:** Press and hold the rotary encoder knob for 800ms to cycle to the next layer.
- **Software:** Click the layer pills (**Layer 1**, **Layer 2**, **Layer 3**) in the left sidebar or select from the `Ctrl+K` command palette.
- **OLED Feedback:** The OLED screen immediately reflects the active layer name and accent color.

To commit your current keymap directly into the RP2040 onboard EEPROM/Flash memory, click the **Sync Keymap to Flash** icon (or press `Ctrl+K` → `Sync Keymap`).

---

## 6. Active Window Tracking & Auto-Profile Switching

KADOWAZ Deck Studio tracks which application currently has foreground focus on Windows and can automatically switch your active macropad profile.

### Setting Up Auto-Switching:
1. Click **Manage Profiles...** from the profile dropdown in the top navbar.
2. Edit or create a profile (e.g., *DaVinci Resolve*, *Visual Studio Code*, *OBS Studio*, or *Blender*).
3. Set the **Target Process Name**:
   - `resolve.exe` for DaVinci Resolve
   - `Code.exe` for VS Code
   - `obs64.exe` for OBS Studio
   - `Photoshop.exe` for Adobe Photoshop
   - `spotify.exe` for Spotify
4. In the top navbar, ensure the **AUTO** pill is illuminated green (`AUTO: ON`).
5. Now, whenever you switch between software on your computer, your macropad instantly switches layouts and OLED modes to match!

---

## 7. Windows Audio & Per-App Volume Mixer

Deck Studio features native Windows CoreAudio & WASAPI COM integration.

### What You Can Control:
- **Master Volume:** Incremental step up/down or direct percentage slider.
- **Master Mute:** Toggle system speaker output with one button.
- **Microphone Mute:** Mute or unmute your primary communication mic (Discord, Teams, Zoom).
- **Per-Application Volume:** Assign the rotary dial or keys to specifically adjust **Spotify**, **Discord**, **Chrome**, or your active game without affecting system master audio!
- **Audio Output Switching:** Toggle between Headphones and Desktop Speakers directly from a key.

---

## 8. OBS Studio WebSocket 5.x Integration

Directly control OBS Studio without simulating keyboard hotkeys:

### Setup:
1. In OBS Studio, open **Tools → WebSocket Server Settings**.
2. Check **Enable WebSocket server** (Server Port: `4455`).
3. Set a password (or leave authentication unchecked).
4. In Deck Studio, keys configured with OBS actions will communicate directly with OBS.
5. In the Health tab of the Diagnostics Drawer, observe the connection status indicator (**CONNECTED**).

### Supported OBS Actions:
- **Toggle Stream:** Start or stop broadcasting to Twitch / YouTube.
- **Toggle Recording:** Start or stop local video recording.
- **Set Scene:** Instant switch to specific scenes (e.g. *Gameplay*, *Camera Only*, *BRB*).
- **Mute Audio Source:** Toggle mute on desktop audio, mic, or game audio capture.

---

## 9. Live OLED Telemetry & Display Modes

The 0.96" OLED display communicates in real-time with the desktop hardware daemon. In the Digital Twin, toggle display modes or customize text:

1. **System Telemetry:** Live hardware monitors:
   - CPU Utilization percentage
   - GPU Load percentage (supports NVIDIA CUDA and AMD SMI query engines)
   - RAM Memory consumption (used vs total GB)
   - CPU Package Temperature (via ACPI thermal sensors)
2. **Audio Visualizer:** Stereo VU bars (Left & Right channels) with peak bounce.
3. **Now Playing:** Displays current track title, artist name, and playback progress bar.
4. **Channel / Layer:** Displays active layer badge, profile title, and key function map.
5. **KADOWAZ Branding:** Default custom branded logo animation.

---

## 10. Global Command Palette (`Ctrl+K`)

Press **`Ctrl+K`** (or click the search button in the top navbar) from anywhere in the application to summon the Command Palette:
- **Fuzzy Search:** Type to instantly locate pages, layers, profiles, keys, audio commands, and hardware tools.
- **400+ PC Shortcuts:** Search application shortcuts across Windows, DaVinci, Blender, Premiere, Photoshop, Figma, and Chrome.
- **Instant Execution:** Press `Enter` on any shortcut in the palette to execute it immediately through the keyboard synthesizer.
- **Keyboard Navigation:** Use `↑` / `↓` arrows to navigate and `Esc` to dismiss.

---

## 11. Action History & Diagnostic Health Drawer

Click the **Activity icon** in the top navbar (or press `Ctrl+K` → `Diagnostics`):
- **Action History Stream:** Real-time chronological audit trail of all physical switch actuations, knob detents, app launches, and webhook triggers.
- **Filter Pills:** Filter events by `Key`, `Dial`, `OBS`, `Audio`, or `Safety`.
- **Subsystem Self-Tests:** Run automated health diagnostics across:
  - System Telemetry Engine
  - Windows CoreAudio WASAPI COM Interop
  - OBS Studio WebSocket v5
  - Localhost REST Webhook API (`:38491`)
  - RP2040 Bootloader & Firmware Drive
- **Export Report:** Copies a comprehensive markdown diagnostic log to your clipboard for technical support or GitHub issues.

---

## 12. Troubleshooting & FAQ

#### Q: The top bar says "NOT CONNECTED" and WebHID doesn't find the board.
- **Solution:** Verify you are using a **USB data cable**. Some cables only carry 5V power wires. Try plugging directly into a motherboard USB port rather than an unpowered hub.

#### Q: The rotary knob changes master volume, but I want it to control Spotify only.
- **Solution:** Open the **Deck Studio** tab, click on the Rotary Knob, set the CW action to **Audio Session Volume (+5%)** and set the target process to `spotify.exe`.

#### Q: Auto-profile switching is not activating when I open DaVinci Resolve.
- **Solution:** Check the top navbar to ensure the **AUTO** toggle pill is green (`AUTO: ON`). Then verify your profile's target process is set to `resolve.exe`.

#### Q: How do I build a standalone Windows `.exe` installer?
- **Solution:** Open a terminal in the project directory and run:
  ```bash
  npm run dist:win
  ```
  The NSIS installer and portable executable will be generated inside the `release/` folder!

---

*KADOWAZ Deck Studio — Designed for makers, streamers, video editors, and audio engineers.*
