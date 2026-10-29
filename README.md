# KADOWAZ DECK STUDIO

> **Hardware validation required.** No boot-verified RP2040 UF2 is bundled. The required SSD1306 128×32 display on GP28/GP29 (0x3C) has fake-I²C, compiled-firmware and fake-CDC tests, **not** an assembled-pad test. Saved config **v3** migrates CRC-valid v2 A/B sectors and **Save Display to Pad** verifies ACK–COMMIT–readback without replacing bindings/lighting. Wire protocol **v3** carries checked live OLED frames and a compile-time LED-output capability. The intended cuttable strip and 5 V supply/current budget are **not selected**: the default image gates physical LED data OFF after init; saving lighting settings does not light pixels or certify power. Custom labels/measurements are stored on the PC, not in flash, and can appear as volatile OLED pixels while connected. A separate default-LED-off RP2040-Zero UF2 has passed ARM cross-build, structural and flash-budget checks, but has not been booted; flashing and assembled-pad bench validation remain release gates.

<p align="center">
  <img src="./b90a1e3c-36e8-45d6-8fec-2b4e8802a836.png" alt="KADOWAZ Deck Studio Banner" width="720" style="border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.6);" />
</p>

<p align="center">
  <strong>Next-Generation 9-Key Macropad Desktop Studio & Hardware Companion Engine</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%2F%2011-0078D6?style=flat-square&logo=windows" alt="Platform" />
  <img src="https://img.shields.io/badge/Electron-33.0.2-47848F?style=flat-square&logo=electron" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18.3.1-61DAFB?style=flat-square&logo=react" alt="React" />
  <img src="https://img.shields.io/badge/Vite-5.4.9-646CFF?style=flat-square&logo=vite" alt="Vite" />
  <img src="https://img.shields.io/badge/TypeScript-5.6.3-3178C6?style=flat-square&logo=typescript" alt="TypeScript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4.14-38B2AC?style=flat-square&logo=tailwind-css" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Firmware-Waveshare%20RP2040--Zero-00979D?style=flat-square" alt="Firmware target: RP2040-Zero" />
</p>


**Keys & Knob model:** A separate RP2040-Zero build without OLED or LED
hardware is included for the confirmed direct-wired pin map. Both bundled UF2
images are untested on a physical pad. See [firmware bundle notes](electron/firmware/README.md)
for build instructions and [the hardware guide](docs/HARDWARE.md) for the key
and encoder wiring. Do not connect OLED or LED hardware for this model.

---

## 📌 Table of Contents

1. [Overview](#overview)
2. [Key Architecture & Dual-Engine Model](#key-architecture--dual-engine-model)
3. [Core Feature Breakdown](#core-feature-breakdown)
   - [1. Automatic Application Discovery & Launcher](#1-automatic-application-discovery--smart-launcher)
   - [2. Three Independent Layers (Layer 1, Layer 2, Layer 3)](#2-three-independent-layers-layer-1-layer-2-layer-3)
   - [3. Digital Twin & Visual Keycaps](#3-digital-twin--visual-keycaps)
   - [4. Switch Configuration Drawer](#4-switch-configuration-drawer)
   - [5. Rotary Encoder Engine](#5-rotary-encoder-engine)
   - [6. OLED Display Control (SSD1306)](#6-oled-display-control-ssd1306)
   - [7. PC Shortcuts Vault](#7-pc-shortcuts-vault)
   - [8. VIA Hardware Suite](#8-via-hardware-suite)
   - [9. Safety Isolation (Long-Press Protection)](#9-safety-isolation-long-press-protection)
   - [10. Embedded Localhost REST & Webhook Daemon](#10-embedded-localhost-rest--webhook-daemon)
   - [11. Live OLED Hardware Telemetry (CPU, GPU, RAM, Temp)](#live-oled-telemetry)
   - [12. Foreground Window Tracking & Auto-Profile Switching](#auto-profile-switching)
   - [13. Windows CoreAudio & Per-App WASAPI Mixer Control](#windows-audio-control)
   - [14. Direct OBS Studio WebSocket 5.x Client](#obs-studio-websocket)
   - [15. Action History & Diagnostic Health Drawer](#action-history--diagnostics)
   - [16. In-App RP2040 UF2 Firmware Flasher](#rp2040-firmware-flasher)
   - [17. Global Command Palette (Ctrl+K)](#global-command-palette)
   - [18. Windows Packaging (electron-builder)](#windows-packaging)
4. [Hardware & Firmware Integration](#hardware--firmware-integration)
   - [Recommended Hardware Bill of Materials (BOM)](#recommended-hardware-bill-of-materials-bom)
   - [Firmware Options (Pico SDK C vs Arduino)](#firmware-options)
   - [Hardware Wiring & Electrical Guide (`docs/HARDWARE.md`)](./docs/HARDWARE.md)
   - [Firmware Architecture & Event Pipeline (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)
   - [Binary Wire Protocol Specification (`docs/PROTOCOL.md`)](./docs/PROTOCOL.md)
   - [Hardware Pinout & Wiring Configurations](#hardware-pinout--wiring-configurations)
   - [Serial Protocol Specification](#serial-protocol-specification-115200-baud)
5. [Project Structure](#project-structure)
6. [Installation & Development Guide](#installation--development-guide)
   - [Desktop App Setup](#1-install-dependencies)
   - [Firmware Flashing & UF2 Build](#5-firmware-build--flashing-rp2040-zero)
   - [Testing & Quality Verification](#6-testing--verification)
7. [Security & Safe Execution](#security--safe-execution)

---

## 🌟 Overview

**KADOWAZ Deck Studio** is a professional desktop suite designed to configure, monitor, and empower physical 9-key mechanical macropads equipped with a rotary encoder, an I2C OLED display (SSD1306), and USB HID / Serial microcontrollers (Raspberry Pi Pico RP2040, Arduino Pro Micro ATmega32U4, ESP32-S3).

It bridges the gap between hardware key actuation and operating-system automation—offering multi-source Windows application discovery, live application launching, 3 isolated operational layers, multi-key combo recording, VIA keycode remapping, safety-isolated long-press actions, and an embedded webhook API server.

> 📖 **User Manual & Hardware Companion Guide:** For step-by-step instructions on connecting your pad, configuring keys, setting up auto-profile switching, audio mixer controls, and OBS WebSocket automation, read the complete [**User Guide (`docs/USER_GUIDE.md`)**](./docs/USER_GUIDE.md).

---

## 🏗 Key Architecture & Dual-Engine Model

The software uses a dual-engine architecture:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       KADOWAZ Deck Studio Companion                         │
│                                                                             │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌─────────────────┐  │
│  │  Deck Studio Twin UI  │  │  Application Library  │  │ Shortcuts Vault │  │
│  └───────────┬───────────┘  └───────────┬───────────┘  └────────┬────────┘  │
│              │                          │                       │           │
│              └──────────────────────────┼───────────────────────┘           │
│                                         ▼                                   │
│                        ┌─────────────────────────────────┐                  │
│                        │ Profiles & Multi-Layer Store    │                  │
│                        │ (Layer 1, Layer 2, Layer 3)     │                  │
│                        └────────────────┬────────────────┘                  │
│                                         │                                   │
│                    ┌────────────────────┴───────────────────┐               │
│                    │                                        │               │
│                    ▼                                        ▼               │
│      ┌───────────────────────────┐            ┌──────────────────────────┐  │
│      │  Electron Main Process    │            │  hardwareBridge.ts       │  │
│      │  • Native Action Runner   │            │  • MPAD3 binary events   │  │
│      │  • Native Icon Extractor  │            │  • WebSerial CDC Stream  │  │
│      │  • Safe Process Spawner   │            │  • Flash config + verify │  │
│      │  • Webhook REST (38491)   │            └─────────────┬────────────┘  │
│      └─────────────┬─────────────┘                          │               │
└────────────────────┼────────────────────────────────────────┼───────────────┘
                     │ OS Shell / Process Spawn               │ USB CDC (HID → OS)
                     ▼                                        ▼
          ┌─────────────────────┐                 ┌───────────────────────┐
          │  Windows OS / Apps  │                 │  Micro Pad Hardware   │
          │  (Code, Chrome,     │                 │  (9 direct keys, knob,│
          │   Spotify, Discord) │                 │   SSD1306 OLED)       │
          └─────────────────────┘                 └───────────────────────┘
```

1. **Hardware Layer (Physical Macropad):**
   - Scans the 3x3 mechanical switch matrix and rotary encoder detents with hardware debouncing.
   - Emits binary MPAD3 key/encoder events over CDC, and standard keyboard/consumer HID reports directly to the OS. Drives a **required 128×32 SSD1306 OLED** over I²C0 (GP28 SDA, GP29 SCL, address 0x3C), with local artwork and offline screens. No physical-board result has been verified.
   - No known-good firmware UF2 is bundled. Build and verify for the actual board before flashing.

2. **Desktop Companion Layer (Electron + React):**
   - Handles the complex logic the microcontroller memory cannot perform: process launching, window focusing, file picking, active profile switching, and app discovery.
   - Reads MPAD3 pad events over WebSerial (CDC). Standard HID keyboard reports do not include raw pad-key indices; the app no longer offers a misleading WebHID connection. Device/host ownership of actions still needs validation on physical hardware.

---

## ⚡ Core Feature Breakdown

### 1. Automatic Application Discovery & Smart Launcher

The application discovery engine (`electron/appDiscovery.cjs`) discovers installed programs across Windows 10 & 11 without executing applications or running slow disk scans:

- **5 Discovery Vectors:**
  1. **Start Menu Shortcuts (`.lnk`):** Scans `%APPDATA%\Microsoft\Windows\Start Menu\Programs` and `%PROGRAMDATA%\Microsoft\Windows\Start Menu\Programs`, resolving targets via `shell.readShortcutLink`.
  2. **Registry Uninstall Entries:** Queries 64-bit and 32-bit `Uninstall` keys (`HKLM` and `HKCU`) to extract application names, `DisplayIcon` resources, and installation paths.
  3. **Microsoft Store / Packaged Apps (UWP / MSIX):** Discovers registered modern Windows applications via `Get-StartApps` with their App User Model IDs (AUMIDs).
  4. **App Paths Registry:** Extracts registered executables from `...\CurrentVersion\App Paths`.
  5. **PATH Environment:** Discovers CLI tools, compilers, and editors located on the system `PATH`.
- **High-Resolution Icon Extraction:** Uses Electron's native `app.getFileIcon` API to extract icons from executables and shortcuts into base64 `data:image/png;base64,...` URLs.
- **Browse for App (`.exe` / `.lnk`):** Native Windows file chooser integration for portable software or utilities located in non-standard directories.
- **Safe Execution:** Spawns executables using argument arrays without concatenating shell strings, opens packaged apps via `shell:AppsFolder\<AUMID>`, and launches shortcuts via `shell.openPath`.
- **Advanced Launch Settings:** Focus existing window if already open, launch minimized, custom key labels, and optional command-line flags.

---

### 2. Four Independent Layers (Layer 0–3)

The macropad has **four independent layers**, numbered `0–3`, each with nine switches and three assignable knob actions. On a fresh installation all 36 keys are empty; saved configurations from earlier versions are preserved. The knob starts with pad-native volume up/down and mute, and holding it cycles layers.

The **Presets** page offers ready-made key layouts for everyday editing, browsing, media and navigation, as well as Blender, Autodesk Fusion, Figma, Canva, Adobe Photoshop, Illustrator and Premiere Pro, DaVinci Resolve, Claude Code CLI, Codex CLI, Visual Studio Code, Microsoft Word, Excel and PowerPoint, GIMP, Inkscape, Krita, After Effects, Audacity, IntelliJ IDEA, and Google Docs, Sheets and Slides, Minecraft: Java Edition, Fortnite, VALORANT, Counter-Strike 2, League of Legends, Dota 2, Roblox, Elden Ring, Cyberpunk 2077, The Witcher 3, Skyrim, Baldur’s Gate 3, Stardew Valley and Terraria. Create your own nine-key presets or edit and duplicate existing ones on the Presets page. Presets are saved locally on this PC, separately from your layers; you can restore built-in defaults or delete custom presets without changing layers already saved. To use a preset, choose it and a target layer, then save it to that layer. This replaces that layer's nine key assignments (including hold gestures), while leaving the knob and other layers unchanged. Review and upload all layers to apply them to the pad. Application presets send the listed default shortcuts to the focused app; shortcut behavior can vary with OS, version, workspace, keyboard layout and custom keymaps. Claude Code and Codex presets target their terminal interfaces, not desktop or IDE variants. Normal keyboard keys in the updated Keys & Knob firmware are sent down while the pad key is held and released when it is lifted; the computer controls text repeat. The supplied Full Deck image is unchanged and its hold behavior is unverified. Older firmware may only send taps. Check in-game keybinds and test safely.

- **Independent edits:** Editing a switch in one layer does not change another. UI selection changes only the editor preview, **not** the pad channel.
- **Physical switching:** Holding the actual knob cycles the pad's four channels; firmware owns its configured hold timing. The simulated editor hold previews the next layer, and the pad's actual channel is unknown until a device event reports it. An uploaded absolute `CHANNEL` key can switch the pad as well.
- **Capacity:** 36 key slots plus four each of knob press, CW and CCW (48 assignable slots total), with knob hold reserved for channel cycling. Not every action type can run autonomously: PC-only actions require a compatible serial event stream and desktop app. A safety hold is PC-owned, never silently downgraded to a normal tap.

---

### 3. Digital Twin & Visual Keycaps

The **Digital Twin** provides a pixel-perfect, interactive representation of your physical device:
- **Key icons:** Choose an icon or None in the switch drawer. Icons are visual labels in the app, not images on physical keys.
- **Live Actuation Feedback:** Depressing keys in the UI or on the physical macropad lights up the key dish with real mechanical switch animations.
- **Underglow Glow & Colors:** Configurable per-switch accent colors that shine through switch cutouts.

---

### 4. Switch Configuration Drawer

Clicking any switch in Deck Studio opens the unified Configuration Drawer:
- **Tab 1: Keyboard & Combos:** Full 15u visual keyboard supporting ANSI/ISO layout, modifiers (`Ctrl`, `Alt`, `Shift`, `Win`), and dual recording modes (`append` and `chord`).
- **Tab 2: Keystroke Recorder:** Records live hardware key chords directly from your computer keyboard.
- **Tab 3: Text Macro:** Types out boilerplate text snippets, code templates, or emails upon pressing the switch.
- **Tab 4: Safety Hold:** Isolates destructive actions (e.g. terminating a broadcast or closing processes) behind a sustained long-press (500ms to 4000ms) with animated visual filling.
- **Tab 5: Open App:** Dedicated application picker featuring instant search, category filters, browse fallback, custom label overrides, and launch arguments.

---

### 5. Rotary Encoder Engine

The rotary knob supports bi-directional rotation and an integrated push button:
- **Clockwise (CW) & Counter-Clockwise (CCW):** Configurable actions per rotation detent.
- **Velocity Acceleration Curves:**
  - `Linear`: 1-to-1 detent response.
  - `Exponential`: Rotates faster during rapid turns (ideal for volume or long timeline scrubbing).
  - `Precision Nudge`: Ultra-fine adjustments for color grading or frame-by-frame jog.
- **Hold-to-Switch Layer:** Sustained hold switches the entire macropad layer without needing extra keys.

---

### 6. OLED Display Control (SSD1306)

The **required SSD1306 128×32 at 0x3C** connects to RP2040-Zero **GP28 SDA / GP29 SCL** on I²C0 with 3.3 V power and 3.3 V pull-ups. Firmware draws seven baked animation loops (`loader`, `creature`, `wave`, `starfield`, `rain`, `radar`, `pulse`) plus local Deck Status, System, Media, Layer Indicator and Uptime/Clock fallbacks. It temporarily overlays the current **0–3** layer when a channel changes. It keeps working without a PC.

With a verified **protocol-v3** OLED stream, the app sends complete, CRC-checked 512-byte PC-rendered canvases to runtime modes at most five times per second: measured telemetry/media (or truthful unavailable placeholders), PC wall time, and custom Deck Status labels. The pad reports physical mode changes from its key/knob/timer to the app without an echo loop. If USB frames stop, the pad displays its own offline fallback within about 1.4 s; baked loops never depend on the PC. Live pixels and custom text are **not saved to pad flash**. A browser may throttle a suspended tab, causing the expected local fallback.

A UI mode choice uses a confirmed `SET_OLED_MODE` binary request; a bound OLED NEXT gesture or saved rotation timer can change the screen autonomously. **Save Display to Pad** persists only boot mode, SSD1306 contrast, inversion, playlist and dwell via full-config ACK–COMMIT–matching readback, preserving bindings/lighting. Without a compatible flash/panel the edits remain **PC-only**. A CRC-valid v2 flash slot is migrated to config v3 without erasing the source on a failed write. These are **source-tested behaviors**, not an assembled-pad claim; no boot-verified UF2 is bundled.

For catalogue order, exact stream bytes, wiring and offline fallbacks, see [`docs/OLED_MODES.md`](./docs/OLED_MODES.md), [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) and [`docs/HARDWARE.md`](./docs/HARDWARE.md).

---

### 7. Key assignments, PC macros and editor layers

The MPAD3 quick tray offers **92 reviewed assignments**: 63 keyboard taps, 7 consumer-media keys, 4 absolute on-pad layer keys, an OLED NEXT playlist step, 16 PC-owned macro slots and a clear-slot action. It does **not** offer QMK momentary/toggle/fallthrough, reset, mouse, bare-modifier or arbitrary raw keycodes, which this firmware cannot execute. Create executable steps in Macro Studio before assigning M0–M15. A macro leaves its firmware slot empty; a physical `KEY_EVENT` executes it only while the Electron desktop app is open with USB key events enabled and the native executor available. Upload checks these prerequisites and requires explicit consent before changing a pad whose key-event setting was off. A verified flash **is not** evidence of Windows/physical-pad operation; see [`docs/FIRST_RUN_INVENTORY.md`](./docs/FIRST_RUN_INVENTORY.md).

Sidebar, command palette and Digital Twin layer selectors choose an **editing preview** only. The pad's reported layer is displayed separately and remains unknown until it sends a `CHANNEL_CHANGE` event. Hold the physical knob or press an uploaded on-pad layer key to change the actual pad channel; the editor no longer sends an unacknowledged `OLED:CH` command and calls it a switch. The app keeps one local configuration; edit any of its four layers and upload to apply it. Connecting does not import the pad’s existing bindings into the editor. OLED NEXT writes firmware action 13 and requires an SSD1306 detected by the target pad; it never needs a PC macro or native key injector.

### 8. PC Shortcuts Vault

A built-in curated vault of shortcuts categorized by application:
- **Creative & Editing:** DaVinci Resolve, Adobe Premiere Pro, Blender 3D, Adobe Photoshop, Figma, Canva.
- **Developer Tools:** VS Code, Git, Windows Terminal, PowerShell.
- **Streaming & Voice:** OBS Studio, Discord, Spotify.
- **Windows Utilities:** Snipping Tool, Task Manager, Virtual Desktop Switcher.

---

### 9. VIA Hardware Suite

A VIA-inspired editor for **custom MPAD3 firmware, not QMK**:
- **Key Tester:** OS keyboard-event visualizer (fresh keydowns vs auto-repeat), not a physical-pad scan/USB latency or contact-chatter measurement.
- **Lighting Studio:** Preview and save supported effects; physical LED data remains default-off pending the separate electrical gate.
- **Macro Editor:** Up to 16 saved **PC-only** macros (`M0`–`M15`) with explicit event/native-shell requirements.
- **Quick Assignments:** Curated keyboard, media, absolute-channel and on-pad OLED NEXT actions; arbitrary raw QMK/hex codes are not accepted.

---

### 10. Safety Isolation (Long-Press Protection)

Destructive commands (such as stopping a recording, closing active apps, or resetting channels) can be flagged with **Destructive Safety**:
- Normal taps are ignored.
- The switch must be continuously held down for the user-configured duration (default: 1500ms).
- A radial progress indicator fills the keycap before the action is dispatched.

---

### 11. Embedded Localhost REST & Webhook Daemon

KADOWAZ Deck Studio runs an embedded HTTP server on port `38491` (`127.0.0.1:38491`):
- **Status Endpoint (`GET /api/v1/status`):**
  ```json
  { "status": "online", "app": "KADOWAZ Deck Studio", "port": 38491 }
  ```
- **Webhook Input (`POST /api/v1/action`):**
  Accepts authenticated JSON automation payloads from local tools. The `layer` field selects an **editor preview** layer only; it does not remotely switch the pad or a profile.

---

## 🔌 Hardware & Firmware Integration

### 🛠 Recommended Hardware Bill of Materials (BOM)

Here is the recommended component list to build your custom Micro Pad hardware:

#### 1. RP2040-Zero
The Waveshare RP2040-Zero handles nine direct-wired keys, the EC11 encoder, nine planned addressable LED positions (strip not yet selected), four channels (layers), the required I²C OLED and composite HID + USB CDC.

#### 2. MX-Style Through-Hole Mechanical Switches × 9
Best for hand soldering because the electrical contact pins are large and easy to access. Solder the switches directly to the PCB or perfboard; hot-swap sockets are not strictly necessary.

#### 3. Cuttable addressable LED strip — nine independent RGB pixels planned
**No specific strip has been purchased/verified.** Its IC, independent-pixel cut points, voltage, colour order, waveform, maximum current, package fit and 5 V supply are unresolved. The Normand SK6812MINI-E Rev.02 is a *reference for existing PIO timing tests*, not a selected part or proof that an arbitrary cuttable strip will work. Normal firmware keeps GP10 LOW **after initialization**, does not start LED PIO/DMA, and refuses physical Preview/`LED_TEST` (`ERROR/LED_DISABLED`). The app still lets you edit and save lighting presets. A deliberate `-DMPAD_BENCH_LED_OUTPUT=ON` build allows output only for a current-limited bench check; it has **no automatic current cap**. A data gate cannot switch off strip power or guarantee darkness at boot/reset or after a pixel latched a previous frame. See the [hardware and power guide](./docs/HARDWARE.md) before connecting LED 5 V.

#### 4. EC11 Rotary Encoder with Push Switch × 1
Gives you stepped left rotation (CCW), right rotation (CW), and push button press.
- **Rotary Macros:** Tap the knob to trigger the assigned layer's knob press action.
- **Default layer switching:** The physical knob hold defaults to `CHANNEL_NEXT` across layers **0–3**; firmware's default hold threshold is 500 ms and is preserved by deck upload. A PC macro is not a supported replacement for the pad-owned hold switch.

#### 5. 0.91-inch I2C OLED Display Module (4-Pin, 128×32, SSD1306) × 1
Compact monochrome display mounted horizontally on the top bezel above the key switches next to the rotary knob.
- **Pinout (4 Pins):** GND → GND/header 2, VCC → **3V3/header 3**, SDA → **GP28/header 5**, SCL → **GP29/header 4**; use 3.3 V pull-ups, **never 5 V on the I²C lines**.
- **I²C address:** `0x3C` (SSD1306 128×32; verify module controller/address before soldering).
- **Role:** Baked animations and truthful offline screens; with a verified v3 device and responding module, runtime PC telemetry, custom labels and media pixels stream without writing display content to flash.
- **Form Factor:** The slim 0.91-inch 128×32 aspect ratio fits the top chassis window perfectly without protruding over the mechanical keycaps.

#### Supporting Components & Circuit Protection

| Component | Quantity | Why & Circuit Rationale |
| :--- | :---: | :--- |
| **Key-matrix diodes** | 0 | This firmware uses one GPIO per switch, not a 3×3 matrix. |
| **74AHCT1G125 non-inverting buffer** | 1 planned | GP10 → A, Y → 330 Ω → LED0 DIN; `/OE` to GND; VCC on a **verified** 5 V LED rail with shared GND. Confirm strip level, package pinout and power-sequencing. |
| **Buffer input pull-down / physical enable** | To design | Prevent floating `A` during MCU boot/reset; candidate ~10 kΩ to GND must be measured. A hardware LED-power switch is needed if guaranteed-dark/zero-idle is required. |
| **330 Ω resistor** | 1 | Between buffer Y and first LED DIN. |
| **10–47 µF capacitor, appropriately rated** | 1 | Across LED 5 V/GND at the first pixel; confirm supply and part ratings. |
| **100 nF ceramic capacitor** | 1 | Across buffer VCC/GND close to the chip. |
| **Perfboard or custom PCB** | 1 | Rigid structural base plate for switch and wiring mounting |
| **USB-C data cable** | 1 | High-speed PC connection for USB CDC/HID communication |
| **Hookup wire, solder and heat-shrink** | As needed | Assembly, wiring runs, and electrical insulation |

---

### Supported Firmware

The **supported firmware for the RP2040-Zero and v3 desktop app** is Pico SDK C (`firmware/`). It provides composite USB keyboard/consumer HID + CDC, default-gated LED data (with a separate bench-only PIO/DMA opt-in), the SSD1306 driver, four channels and CRC-checked A/B flash storage (format v3, 2,272-byte config). A historical Arduino `.ino` sketch is still in the tree, but it uses an **incompatible 3×3 matrix/pin map and text protocol**, not this wiring or v3 Save; do not flash it on the selected hardware. Use [`docs/HARDWARE.md`](./docs/HARDWARE.md) for a soldering plan and [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) for wire bytes; do not flash a placeholder image.

---

### Hardware Pinout & Wiring

This firmware uses **direct GPIO to GND** for each key (internal pull-up), not a switch matrix. With the USB-C connector pointing up and the component side facing you, check the pin numbers against the board silkscreen before soldering:

| Function | RP2040-Zero GPIO | Main header pin |
| :--- | :--- | ---: |
| Switches K0–K6 | GP0–GP6 | 23–17 |
| Switches K7, K8 | GP11, GP12 | 12, 11 |
| Encoder A, B, switch | GP7, GP8, GP9 | 16, 15, 14 |
| LED chain data | GP10 | 13 |
| Required OLED I²C0 SDA, SCL | **GP28, GP29** | **5, 4** |
| Required OLED VCC, GND | **3V3, GND** | **3, 2** |

Pull SDA/SCL up to **3.3 V**, not 5 V. GP4/GP5 are **keys**, not OLED pins; GP14/GP15 are unused spares, not the selected OLED bus. See [`docs/HARDWARE.md`](./docs/HARDWARE.md) for LED level shifting, power limits and connector orientation.

### USB CDC / MPAD3 Protocol

The supported firmware sends **binary MPAD3 v3 frames** for key/encoder events, configuration and live OLED canvases; `PING` + `GET_INFO` verify the protocol, config-v3 size (2,272 bytes), flash and actual SSD1306 detection. Full config transfers use indexed CRC-checked chunks; a successful host Save requires final `SET_ACK`, flash `COMMIT_ACK` and matching readback. `GET_OLED_STATE`/`OLED_MODE_EVENT` sync the active physical screen; `SET_OLED_MODE` confirms UI selection. Two `OLED_FRAME` chunks carry a full 512-byte runtime canvas with a shared CRC-32 and final ACK, never writing flash. The pad expires it after 1.2 s and shows its local fallback. `OLED:NEXT`, `OLED:MODE:<0..11>` and `OLED:CH:<0..3>` text diagnostics still share CDC, but the app prefers the confirmed binary mode command. `OLED:AUTO` / `OLED:PL` are RAM-only diagnostics; Display Save persists them. `OLED:<text>` is **not implemented** as an ASCII command; the app instead sends rendered pixels containing custom labels. See [`docs/PROTOCOL.md`](./docs/PROTOCOL.md) and [`docs/OLED_MODES.md`](./docs/OLED_MODES.md).

---

## 📁 Project Structure

```
desktop-app/
├── docs/                       # Detailed Hardware, Architecture & Protocol Specs
│   ├── HARDWARE.md             # Complete RP2040-Zero wiring, pin table & level-shifter guide
│   ├── ARCHITECTURE.md         # Microcontroller modular design & event pipeline
│   └── PROTOCOL.md             # Wire protocol & CRC-16 specification
│
├── electron/
│   ├── actionExecutor.cjs      # Safe Windows process spawner & keystroke executor
│   ├── appDiscovery.cjs        # Multi-source Windows application discovery & launcher engine
│   ├── main.cjs                # Electron main process, tray menu, window management & IPC
│   ├── preload.cjs             # Safe context bridge exposing electronAPI to React
│   ├── run-electron.cjs        # Electron runner script
│   └── webhookServer.cjs       # Localhost REST & webhook daemon (port 38491)
│
├── firmware/
│   ├── CMakeLists.txt          # Native Raspberry Pi Pico SDK C build configuration
│   ├── Makefile.host           # Host-runner test makefile for C unit tests
│   ├── include/                # Firmware headers (board.h, gesture.h, leds.h, magic.h, etc.)
│   ├── src/                    # Firmware C sources (core, drivers, lighting, storage, usb)
│   ├── tests/                  # Gated + bench host-compiled firmware tests (no actual board)
│   └── kadowaz_macropad/       # Historical incompatible matrix/Arduino sketch (do not flash here)
│
├── host/
│   ├── protocol/
│   │   ├── protocol.json       # Wire protocol JSON definition
│   │   ├── mpad3-protocol.mjs  # Browser & Node JavaScript framing & CRC-16 codec
│   │   └── generated/          # Generated TypeScript definitions
│   └── tests/
│       └── run.mjs             # 127 automated wire protocol & struct checks
│
├── scripts/
│   ├── setup.sh                # Automated toolchain installer and firmware builder
│   └── test-all.sh             # End-to-end verification test suite
│
├── tools/                      # Python verification & simulation tools
│   ├── check_board.py          # Pin map cross-check validator
│   ├── check_usb_descriptors.py# HID USB report descriptor checker
│   ├── gen_protocol.py         # Wire protocol code generator
│   └── pio_timing.py           # Cycle-accurate WS2812 PIO waveform simulator
│
├── src/                        # React Desktop Studio frontend
│   ├── components/
│   │   ├── AppLauncherPanel.tsx    # Full Application Library browser & assignment panel
│   │   ├── DigitalTwin.tsx         # Interactive hardware visualizer & layer controls
│   │   ├── DisplayConfigDrawer.tsx # OLED display settings drawer
│   │   ├── KeyConfigDrawer.tsx     # Switch remap drawer (Keyboard, Macro, Safety, Open App)
│   │   ├── KeyMatrix.tsx           # 3x3 Keycaps with dynamic app icons & LED underglow
│   │   ├── KnobConfigDrawer.tsx    # Rotary knob curves, sensitivity & layer hold config
│   │   ├── OLEDDisplay.tsx         # OLED display component (visualizer, media, system)
│   │   ├── OSDFlyout.tsx           # On-screen display banner for profile/layer switches
│   │   ├── ProfileModal.tsx        # Profile creation & deletion modal
│   │   ├── RotaryEncoder.tsx       # Interactive knob component with rotation physics
│   │   ├── ShortcutsPanel.tsx      # Curated PC shortcuts vault
│   │   ├── TopNavbar.tsx           # Navigation bar with connection status & tab switcher
│   │   └── via/
│   │       ├── ViaKeycodePicker.tsx # Quick keycode remapping tray
│   │       ├── ViaKeyTester.tsx     # Matrix switch test suite
│   │       ├── ViaLightingPanel.tsx # RGB underglow lighting studio
│   │       └── ViaMacroEditor.tsx   # Multi-step macro recorder & editor
│   │
│   ├── data/
│   │   ├── defaultProfiles.ts      # Initial profiles (DaVinci Resolve, OBS, Spotify DJ)
│   │   ├── pcShortcuts.ts          # Preset application shortcut definitions
│   │   └── viaKeycodes.ts          # QMK / VIA standard keycode definitions
│   │
│   ├── types/
│   │   └── index.ts                # TypeScript domain interfaces (KeyBinding, DiscoveredApp, etc.)
│   │
│   ├── utils/
│   │   ├── channelLayers.ts        # Layer normalization & layer isolation helpers
│   │   ├── hardwareBridge.ts       # WebSerial CDC/MPAD3 bridge; HID goes to OS
│   │   └── soundEffects.ts         # Audio synthesizers for detent clicks and key presses
│   │
│   ├── App.tsx                     # Main application orchestrator & state manager
│   ├── index.css                   # Tailwind styles, glassmorphism, and keycap shadows
│   └── main.tsx                    # React application entry point
│
├── Makefile                        # Root firmware build & test convenience targets
├── package.json                    # Dependencies and run scripts
├── tsconfig.json                   # TypeScript compiler configuration
├── tailwind.config.js              # Theme colors, glow effects, and typography
└── vite.config.ts                  # Vite production build pipeline
```

---

## 🚀 Installation & Development Guide

### Prerequisites
- **Node.js:** v18.0.0 or higher
- **npm:** v9.0.0 or higher
- **Operating System:** Windows 10 or Windows 11 (64-bit recommended)

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Web Development Mode (Browser Sandbox)
Runs Vite dev server with simulated hardware input:
```bash
npm run dev
```

### 3. Run Native Electron Desktop Studio
Launches Vite and Electron with full native Windows application discovery, process spawning, and tray support:
```bash
npm run electron:dev
```

### 4. Build Desktop Production Bundle
Compiles TypeScript and bundles assets with Vite:
```bash
npm run build
```

### 5. Firmware Build & Flashing (RP2040-Zero)

Use **only the Pico SDK C firmware** for this wiring and desktop protocol. The old Arduino sketch is incompatible. LED output is disabled in normal builds; do not connect the strip merely because a UF2 was produced.

---

#### Pico SDK C Firmware (supported path)

Building and flashing the native firmware is a simple step-by-step process:

##### Step 1: Install Build Tools (One-Time Setup)
You need `cmake` and the ARM cross-compiler (`gcc-arm-none-eabi`) to build the `.uf2` file:
- **Windows (Easiest):**
  - Install the official [Raspberry Pi Pico VS Code Extension](https://marketplace.visualstudio.com/items?itemName=raspberry-pi.raspberry-pi-pico) (which configures CMake, GCC, and the SDK automatically), OR
  - Install the [Pico Windows Setup Installer](https://github.com/raspberrypi/pico-setup-windows/releases).
- **Linux (Debian / Ubuntu / WSL):**
  Run the automated script included in this repository:
  ```bash
  bash scripts/setup.sh
  ```
- **macOS:**
  ```bash
  brew install cmake arm-none-eabi-gcc
  ```

##### Step 2: Compile the `.uf2` Firmware File
Open your terminal in the project directory and run:

```bash
# 1. Configure the build for Waveshare RP2040-Zero
cmake -S firmware -B firmware/build -DPICO_BOARD=waveshare_rp2040_zero

# 2. Compile the binary (generates mpad3.uf2)
cmake --build firmware/build -j4
```

When finished, your compiled firmware file will be located at:
📁 **`firmware/build/mpad3.uf2`**

##### Step 3: Put Your RP2040-Zero into Bootloader Mode
You don't need any special flashing software or programmers! The RP2040 has a built-in hardware bootloader:

1. **Unplug** the USB-C cable from your RP2040-Zero.
2. Locate the tiny **`BOOT`** button on the RP2040-Zero board (right next to the USB-C connector).
3. **Press and hold down** the **`BOOT`** button.
4. While continuing to hold the button, **plug the USB-C cable** into your PC.
5. **Release** the **`BOOT`** button.
6. A new removable drive named **`RPI-RP2`** will automatically appear in Windows File Explorer (just like plugging in a USB flash drive).

##### Step 4: Drag & Drop to Flash
1. Open File Explorer and navigate to `firmware/build/mpad3.uf2`.
2. **Drag and drop** (or copy & paste) `mpad3.uf2` directly onto the **`RPI-RP2`** drive.
3. The `RPI-RP2` drive will automatically disconnect and vanish as soon as the file copies.
4. **Verify before use:** A BOOTSEL copy is not evidence that a firmware build boots. With LED 5 V disconnected, check re-enumeration, MPAD3 v3 probing, keys, SSD1306 at 0x3C and **absence of `CAP_LED_OUTPUT`** in a normal build. Only test LED output later on a current-limited bench after selecting the strip and supply. Source-level tests do not replace this bench check.

> 💡 **Troubleshooting Tip:** If the `RPI-RP2` drive does not appear, verify that your USB-C cable is a **data sync cable**. Some cheap USB cables only have power wires and cannot transmit data.

---

#### Arduino sketches are not a supported flashing path

The historical `firmware/kadowaz_macropad/kadowaz_macropad.ino` uses a different key matrix, pin map and legacy text serial commands. It is **not compatible** with the selected direct-wired RP2040-Zero + GP28/GP29 OLED or the v3 desktop Save path. Use the Pico SDK C build above; do not follow the old Arduino wiring instructions for this pad.

### 6. Testing & Verification

Run the unified test suite across both desktop, native interop, and firmware protocol layers:
```bash
npm test
```
- **113 Host Protocol & Binary Tests:** Byte-identical C struct layouts, CRC-16 frame encoding/decoding, auto-resynchronization state machine, and chunked flash config streaming.
- **17 Webhook & REST API Tests:** Token-authenticated daemon, CORS preflight isolation, DNS-rebinding protection, and event streaming.
- **8 RP2040 Firmware Flasher Tests:** UF2 block inspection, magic header & trailer checks, chip family validation, and truncated binary rejection.
- **7 Global Command Palette Tests:** Multi-tier ranking algorithms, fuzzy search scoring, and out-of-order token matching.
- **Windows CoreAudio & WASAPI Mixer Tests:** Volume scaling, per-process session volume adjustments, microphone mute, and device queries.
- **OBS Studio WebSocket 5.x Tests:** URL parsing, SHA-256 authentication challenge hashing, error handling, and state schemas.
- **System Telemetry & Window Tracker Tests:** Live CPU/GPU/RAM sampling, process foreground window detection, and auto-profile matching.
- **Packaging Configuration Tests:** NSIS and portable target validation, asset extraction, and script presence.
- **Total:** **171 automated assertions, 0 failures**.

### 7. Standalone Windows Packaging

Build a production standalone executable or installer using `electron-builder`:
```bash
# Verify electron assets and build unpacked directory for testing
npm run pack

# Build complete NSIS Windows Installer and Portable Standalone Executable
npm run dist:win
```
Output artifacts are saved directly to `release/`:
- `release/KADOWAZ-Deck-Studio-1.0.0-x64.exe` (NSIS Installer)
- `release/KADOWAZ-Deck-Studio-1.0.0-x64.portable.exe` (Portable Executable)
- `release/win-unpacked/` (Unpacked binary distribution)

---

## 🔒 Security & Safe Execution

- **Zero Shell Concatenation:** Process execution in `electron/appDiscovery.cjs` parses argument tokens into discrete argument arrays passed directly to `child_process.spawn`, preventing command injection vulnerabilities.
- **Context Isolation:** The renderer has no direct access to Node.js `fs` or `child_process`. All interactions pass through explicit, validated channels in `preload.cjs`.
- **Read-Only Discovery:** The discovery engine scans system manifests and shortcuts without modifying, moving, or executing discovered applications during discovery.
- **Bounded Resources:** Icon extraction operates in batched concurrency limits (10 items per batch) to prevent memory spikes or UI stutter.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details. Built for makers, streamers, video editors, and audio engineers.

