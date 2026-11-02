# ZERO product website

This is a standalone, static product site. It does not replace or change the Deck Studio editor.

To preview it locally from the repository root:

```sh
python3 -m http.server 4173 --bind 0.0.0.0 --directory website
```

Open `http://localhost:4173/`. Deploy the contents of `website/` to any static host; no build step is required. The macropad image is a conceptual AI-generated render, not a photograph of tested hardware. The editor illustration is interactive but does not configure a real device. External links open in the top-level tab so they work when the site is embedded in a preview without popup permission. Update the GitHub and wiring-guide links if the project moves or the branch is merged.

The website has a scroll-triggered, multi-cursor construction animation in `intro.js` and `intro.css`. Each section builds the first time it comes into view; scrolling is never blocked. Use **Skip effects** or Escape to show everything immediately, and **↻ Replay** in the header to replay the sequence. Reduced motion bypasses the effects. The cursors write the visible text, including labels and controls. The animation reveals real page elements without activating links or changing their text; temporary inline wrappers are removed after each section. Visible buttons and links can be used during construction: activating one completes its section and lets the original click or keypress proceed. Set `ENABLE_INTRO` to `false` in `intro.js` to disable it.

In the interactive illustration, select a key or layer, or click the knob to cycle layers. Selections are held in memory per layer for that page visit only; the illustration does not change the actual app or a physical device.
