# KADOWAZ Deck Studio — Frontend Feature Specification & Blueprint

> **For AI Assistants & Frontend Engineers:**  
> Use this specification to build a brand-new, standalone **Black & White / Monochrome** web frontend for the **KADOWAZ Deck Studio** macropad companion application.

---

## 1. Visual Identity & Aesthetic Directive

- **Theme:** Strict **Black & White / Monochrome** (inspired by Teenage Engineering, Dieter Rams, Nothing OS, and Leica).
- **Color Palette:**
  - **Backgrounds:** Pitch Black (`#000000`), Deep Graphite (`#0A0A0A`, `#111113`), Dark Slate Surface (`#18181B`).
  - **Borders & Dividers:** Crisp hairline zinc (`#27272A`, `#3F3F46`).
  - **Text & Accents:** Stark Pure White (`#FFFFFF`), Crisp Off-White (`#F4F4F5`), Muted Silver (`#A1A1AA`), Dim Gray (`#71717A`).
  - **Highlights & Actuation:** Pure white glows (`rgba(255, 255, 255, 0.15)`) and high-contrast inverse badges (white background with black text).
  - **No Rainbow/Cyberpunk Colors:** Strictly eliminate all neon orange, cyan, and purple colors.
- **Typography:** Monospaced (`JetBrains Mono`, `SF Mono`, or `Consolas`) for hardware labels, metrics, and shortcuts; clean sans-serif (`Inter`, `Geist`, or `system-ui`) for UI navigation.

---

## 2. Layout Structure

The application consists of a single-screen dashboard with overlay drawers and modals:

```
+-----------------------------------------------------------------------------------+
|  [Logo] KADOWAZ DECK    [Profile Dropdown v]   [Layer Tabs 1 | 2 | 3]   [Actions] |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|                               +------------------------+                          |
|                               |  KADOWAZ IND. DECK-09  |                          |
|                               |  [OLED]       [KNOB]   |                          |
|                               |  [#1]  [#2]  [#3]      |                          |
|                               |  [#4]  [#5]  [#6]      |                          |
|                               |  [#7]  [#8]  [#9]      |                          |
|                               +------------------------+                          |
|                                                                                   |
|                [Edit Keys]       [Edit Knob]       [Edit Display]                 |
|                                                                                   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Core Feature Specifications

### A. Digital Twin Hardware Macropad
An interactive 3D / pseudo-3D representation of the physical 9-key macropad:
1. **Chassis:** Matte black CNC anodized well with 4 brushed stainless steel / silver corner screws and laser-etched branding (`KADOWAZ IND. DECK-09`).
2. **3x3 Key Matrix (9 Keys):**
   - Mechanical switches numbered `#1` to `#9`.
   - Tactile feedback: Visual depression (`translateY(3px)` or spring press) on click or physical actuation.
   - Display key label, assigned action icon, and custom subtext.
   - Selected key has a crisp white outline border.
3. **Rotary Encoder (Dial):**
   - Knurled metal rotary dial with a crisp white tick/indicator.
   - Interactive: Click left (CCW turn), click right (CW turn), and center click (push button).
   - Smooth rotation animation matching turn actions.
4. **OLED Screen Simulation (128x32 display):**
   - Paper-white pixels on pitch-black background with subtle horizontal scanlines.
   - Supports 5 switchable modes:
     1. **Deck Status:** Displays custom banner title, active profile name, and current layer.
     2. **System Telemetry:** Live 3-column performance metrics: `CPU: xx%`, `RAM: xx%`, `GPU: xx%`, `Temp: xx°C`.
     3. **Audio VU Meter:** Reactive 12-band stereo dB equalizer bars with peak indicators.
     4. **Now Playing:** Live track title, artist name, and a synchronized scrub progress bar.
     5. **Layer Stepper:** Minimalist industrial dashed stepper badge (`[01] / [02] / [03]`).

---

### B. Profile & Multi-Layer System
1. **Profiles:** Profiles represent specific user applications or workflows (e.g., *DaVinci Resolve*, *OBS Broadcast*, *Spotify DJ*, *Coding/IDE*).
2. **Layers (Channels 1–3):** Each profile contains 3 distinct layers:
   - **Layer 1 (Audio / Media):** Volume dial, play/pause, mute, track skip.
   - **Layer 2 (Editing / Scrubbing):** Timeline scrub dial, cut, split, undo, render.
   - **Layer 3 (Custom Macros):** Application-specific shortcuts, launch commands, webhooks.
3. **Auto-Profile Switching:** Detects active foreground application window and automatically switches profiles.

---

### C. Key Action Assignment System
Clicking any key on the macropad opens the **Key Inspector Drawer**:
- **Supported Action Types:**
  1. **Hotkeys & Shortcuts:** Single keys, combinations (`Ctrl+Shift+T`, `Win+V`), or sequential keypresses.
  2. **Media & Volume:** Master Volume Up/Down/Mute, Play/Pause, Next Track, Previous Track.
  3. **Per-App Audio Mixer:** Adjust specific application volumes (e.g. Spotify, Discord, Chrome).
  4. **OBS Studio Controls:** Start/Stop Stream, Start/Stop Recording, Toggle Mic Mute, Switch Scene.
  5. **Application Launcher:** Browse or select executable/app to open on press.
  6. **Webhook Trigger:** Send HTTP POST payload to local port `38491` or external automation (Home Assistant, Stream Deck webhooks).
  7. **Layer Navigation:** Switch directly to Layer 1, 2, or 3, or cycle layers.

---

### D. Rotary Knob Configuration Drawer
Configure the 3 distinct interactions of the rotary dial per layer:
- **Rotate Clockwise (CW):** e.g., Volume Up, Timeline Scrub Forward, Zoom In, Next Tab.
- **Rotate Counter-Clockwise (CCW):** e.g., Volume Down, Timeline Scrub Backward, Zoom Out, Previous Tab.
- **Center Push Button:** e.g., Mute/Unmute, Play/Pause, Reset Zoom, Layer Cycle.

---

### E. Global Command Palette (`Ctrl+K`)
- Triggered by `Ctrl+K` or search button in header.
- Fuzzy ranked search across:
  - 400+ Windows/Mac software shortcuts (Photoshop, Premiere, DaVinci, VS Code, Blender, Windows OS).
  - Hardware profiles and layers.
  - Subsystem tools (Diagnostics, Firmware Flasher, Audio Mixer, Settings).
- Full keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`).

---

### F. Subsystem Drawers & Modals

1. **Diagnostics & Activity Timeline Drawer:**
   - Real-time event log recording every keypress, knob turn, and webhook invocation with millisecond timestamps.
   - Subsystem self-tests showing green status indicators for Audio Engine, Window Tracker, Telemetry, and OBS.
   - Raw serial/HID wire packet viewer.

2. **RP2040 UF2 Firmware Flasher Modal:**
   - Detects RP2040 microcontrollers in BOOTSEL mode (`RPI-RP2` USB drive).
   - File selector for `.uf2` firmware binaries.
   - Validates 512-byte block structures and Raspberry Pi UF2 Family ID (`0xe48dba04`).
   - One-click flash button with animated percentage progress bar.

3. **VIA Physical Key Matrix Tester:**
   - Visual 3x3 switch grid.
   - Actuating a physical switch on the real hardware lights up the corresponding switch tile in white with a persistent "Tested" badge.
   - Quick latency counter and reset button.

4. **Per-App Windows Audio Mixer Panel:**
   - Lists active audio-producing processes (Spotify, Discord, Chrome, Game).
   - Individual volume sliders and mute toggles per app.

---

## 4. Minimal TypeScript Data Models

To ensure compatibility when reconnecting to the backend, the state should follow these models:

```typescript
export interface KeyAction {
  type: 'hotkey' | 'media' | 'app' | 'obs' | 'webhook' | 'layer';
  payload?: any;
  label?: string;
  icon?: string;
}

export interface KeyBinding {
  keyIndex: number; // 0 to 8
  label: string;
  sublabel?: string;
  action: KeyAction;
}

export interface DialConfig {
  cwAction: KeyAction;
  ccwAction: KeyAction;
  pressAction: KeyAction;
}

export interface Layer {
  id: string; // e.g. 'layer-1', 'layer-2', 'layer-3'
  name: string;
  keys: KeyBinding[];
  dial: DialConfig;
}

export interface Profile {
  id: string;
  name: string;
  processMatch?: string; // e.g. 'resolve.exe', 'obs64.exe'
  layers: Layer[];
}

export interface OLEDState {
  mode: 'kadowaz' | 'system' | 'visualizer' | 'media' | 'channel';
  customTitle?: string;
  customSubtitle?: string;
  cpuLoad: number;
  gpuLoad: number;
  ramUsage: number;
  cpuTemp: number;
  nowPlayingTrack?: string;
  nowPlayingArtist?: string;
  trackProgress?: number;
}
```

---

## 5. Expected User Interactions to Handle
- **Key Tap / Hold / Double-click:** Triggers action, shows visual bounce animation, logs event to diagnostics.
- **Dial Wheel Drag / Click:** Adjusts value (volume / scrub), rotates indicator.
- **OLED Click:** Cycles between the 5 OLED display modes.
- **Drawer Open / Close:** Sliding glass panels from right side with backdrop blur.

