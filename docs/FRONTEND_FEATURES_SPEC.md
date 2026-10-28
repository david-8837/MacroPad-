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
|  [Logo] KADOWAZ / DECK  [Studio Deck]   [Layer Tabs 0 | 1 | 2 | 3]   [Actions] |
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
   - True-black panel with emissive warm-white pixels and a tight bloom; the app's only glowing surface.
   - Rendered by one 128×32 1-bit framebuffer engine (`src/oled/`) shared by the
     mode-card previews, the simulator and the firmware frame export.
   - Supports 12 switchable modes. Live-data screens:
     1. **Deck Status:** custom banner title, `ONLINE` badge, active layer hero line, deck name.
     2. **System Telemetry:** CPU / RAM / GPU meters with live percentages and package temperature.
     3. **Now Playing:** scrolling track title, artist, play/pause glyph, progress bar.
     4. **Layer Track:** a four-stop track (one stop per layer) built from two 1-bit sprites — a side-view keycap silhouette in every unselected stop, and a rounded-corner square carrying `00`–`03` in the selected one. Animated on every layer change: 120 ms paint, keycaps drop out, 320 ms travel with the number rolling, keycaps return, 2.0 s hold.
   - Looping screens (frames @ rate). Seven bake into firmware frames via
     `scripts/export-oled-frames.mjs`; **Clock** reads the system time, so it stays runtime-rendered:
     5. **Progress Loader** (12 @ 8 fps) · 6. **Pixel Buddy** (16 @ 6) · 7. **Signal Wave** (15 @ 15) ·
     8. **Starfield** (24 @ 12) · 9. **Digital Rain** (24 @ 12) · 10. **Clock** (live) ·
     11. **Radar Sweep** (24 @ 12) · 12. **Heartbeat** (12 @ 12).
   - Mode cards: title top-left, technical tag top-right (`ACTIVE` / `NN FPS` / `STATIC` / `SKIPPED`), live animated preview underneath, a footprint line (`24 FR · 12.0 KiB` or `RUNTIME · 0 B`) and an **IN ROTATION / SKIPPED** toggle in the card footer. No icons and no body copy.
   - **The panel is not a touchscreen.** Nothing advances by clicking the screen. The drawer drives the rotation: **AUTO SWITCH** (0 = stay put, 3–255 s, default 30) and the per-card rotation toggle, plus **CYCLE NEXT MODE** for a manual step. The firmware mirrors this with `cfg_global_t.oled_auto_cycle_s` / `oled_playlist`, `ACTION_TYPE_OLED_NEXT` and the `OLED:NEXT` / `OLED:AUTO:<s>` / `OLED:PL:<mask>` commands.
   - **Frame store readout:** `63.5 KiB / 120.0 KiB · 113 / 240 frames free · 6 loops headroom`, with a bar. The 120 KiB limit is derived from the flash map (`src/oled/capacity.ts`), not chosen: 2 MiB part − 8 KiB config sectors − a 1.87 MiB application ceiling, aligned to the 4 KiB erase sector and exact in 512 B frames.

---

### B. Deck & Multi-Layer System
1. **Single Deck:** One deck per install (no profile switching). It holds all 4 layers and can be locked to prevent edits.
2. **Layers (0–3):** The deck contains 4 distinct layers:
   - **Layer 0 (Edit):** Timeline scrub dial, cut, split, mark, render-out.
   - **Layer 1 (Tools):** Copy / paste / cut / undo / find / save.
   - **Layer 2 (Custom):** your own bank.
   - **Layer 3 (Macros):** empty macro bank, ready for your own keys.

---

### C. Key Action Assignment System
Clicking any key on the macropad opens the **Key Inspector Drawer**:
- **Supported Action Types:**
  1. **Hotkeys & Shortcuts:** Single keys, combinations (`Ctrl+Shift+T`, `Win+V`), or sequential keypresses.
  2. **Media & Volume:** Master Volume Up/Down/Mute, Play/Pause, Next Track, Previous Track.
  3. **Per-App Audio Mixer:** Adjust specific application volumes (e.g. Spotify, Discord, Chrome).
  4. **Application Launcher:** Browse or select executable/app to open on press.
  5. **Webhook Trigger:** Send HTTP POST payload to local port `38491` or external automation (Home Assistant, Stream Deck webhooks).
  6. **Layer Navigation:** Switch directly to Layer 0, 1, 2 or 3, or cycle layers.

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
  - Deck layers.
  - Subsystem tools (Diagnostics, Firmware Flasher, Audio Mixer, Settings).
- Full keyboard navigation (`ArrowUp`, `ArrowDown`, `Enter`, `Escape`).

---

### F. Subsystem Drawers & Modals

1. **Diagnostics & Activity Timeline Drawer:**
   - Real-time event log recording every keypress, knob turn, and webhook invocation with millisecond timestamps.
   - Subsystem self-tests showing green status indicators for Audio Engine and Telemetry.
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
  type: 'hotkey' | 'media' | 'app' | 'webhook' | 'layer';
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

export interface Deck {
  id: string;
  name: string;
  isLocked?: boolean;
  activeLayerId: string;
  layers: Layer[];
}

export interface OLEDState {
  mode: 'kadowaz' | 'system' | 'media' | 'channel' | 'loader' | 'creature' | 'wave'
      | 'starfield' | 'rain' | 'clock' | 'radar' | 'pulse';
  /** Seconds per screen; 0 disables automatic switching. */
  autoCycleS?: number;
  /** Screens in the rotation, catalogue order. Empty means every mode. */
  playlist?: OledMode[];
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
- **OLED:** Not clickable. The screen changes on the rotation timer, on a key bound to OLED NEXT, or on `OLED:NEXT` from the host.
- **Drawer Open / Close:** Sliding glass panels from right side with backdrop blur.

