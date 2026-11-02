# KADOWAZ / ZERO Deck Studio — Product Website

This is the standalone product website and hardware companion guide for **KADOWAZ / ZERO Deck Studio**. It is completely decoupled from the desktop editor and contains:

1. **Interactive Pad Simulator:**
   - Real-time 9-key tactile mechanical switch simulation.
   - Clickable and rotatable EC11 encoder knob.
   - Live 128×32 SSD1306 OLED canvas emulator with real 30 FPS pixel rendering (System Metrics, Now Playing, Code Metrics, and Audio Spectrum).
   - 4-Layer switching with live host bridge action logging.

2. **Hardware Specifications & Build Guides:**
   - Detailed build comparison between **Build V2 (Keys & Knob — recommended)** and **Build V1 (Full Deck + OLED)**.
   - Complete GPIO pinout reference table for the Waveshare RP2040-Zero.
   - Clear, honest safety notes regarding breadboard RGB power isolation.

3. **Honest Download Hub:**
   - Pre-compiled RP2040 firmware binaries (`keys-and-knob.uf2` and `full-deck.uf2`) bundled in `downloads/`.
   - Complete printable PDF wiring diagrams and soldering manuals bundled in `downloads/`.
   - Windows desktop app release links and GitHub source repository.
   - Action execution reality table distinguishing on-device HID actions from desktop-daemon actions.

---

## Preview Locally

You can open `website/index.html` directly in any web browser, or serve it using any local HTTP server:

```bash
# Option 1: Python
python -m http.server 3000 --directory website

# Option 2: Node.js (npx serve)
npx serve website

# Option 3: Direct in browser
# Just double-click website/index.html!
```

---

## Deploy to the Web

The website is completely static with zero build dependencies. It can be deployed in seconds to:
- **GitHub Pages:** Point GitHub Pages settings to `/website` or deploy via GitHub Actions.
- **Vercel / Netlify / Cloudflare Pages:** Set the publish directory to `website`.
