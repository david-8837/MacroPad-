# ZERO product website

This is a standalone, static product site. It does not replace or change the Deck Studio editor.

To preview it locally from the repository root:

```sh
python3 -m http.server 4173 --bind 0.0.0.0 --directory website
```

Open `http://localhost:4173/home/` and `http://localhost:4173/cases/` for the clean page URLs (the root and legacy HTML files remain fallbacks). The website is static. After changing `website/index.html` or `website/cases.html`, run `node scripts/build-website-routes.cjs` to update the checked-in route pages before previewing or deploying; the Pages workflow also regenerates them. Both pages offer low-priority browser prefetch hints for the other page and its page-specific assets. Browsers or hosting cache policies may ignore them; links remain ordinary navigation and work without prefetch. The macropad image is a conceptual AI-generated render, not a photograph of tested hardware. The editor illustration is interactive but does not configure a real device. External links open in the top-level tab so they work when the site is embedded in a preview without popup permission. Update the GitHub and wiring-guide links if the project moves or the branch is merged.

A lightweight ZERO loading screen introduces the first page opened in a tab and appears again on refresh, which returns either page to the top of Home. Ordinary Home/Cases navigation and direct anchor links skip it to keep navigation quick. It lasts about three seconds including its fade, waits for the document to be ready rather than every image, and has a fail-open timeout. Clicking the loading screen skips only the loader and still plays the cursor construction. Escape or Tab skips both effects; reduced-motion and no-JavaScript visitors bypass them. The symbols gather into the first cursor as the screen opens onto the construction animation. The changing symbols are decorative, not a download percentage.

The Home and Cases pages have a scroll-triggered, multi-cursor construction animation in `intro.js` and `intro.css`. On the first visit to each page in a browser tab, each section builds as it comes into view; scrolling is never blocked. Returning to a previously visited page in the same tab session shows it immediately instead of starting over. Refreshing either page returns to the top of Home and starts Home’s animation again, as does opening a new tab session; if session storage is unavailable, the page remains usable but the visit cannot be remembered across navigation. Use **Skip effects**, Escape, or Tab to show everything immediately for keyboard navigation, and **↻ Replay** in the header to replay the sequence. Reduced motion bypasses the effects. The cursors write the visible text, including labels and controls. The animation reveals real page elements without activating links or changing their text; temporary inline wrappers are removed after each section. Visible buttons and links can be used during construction: activating one completes its section and lets the original click or keypress proceed. Set `ENABLE_INTRO` to `false` in `intro.js` to disable it. The optional WebGL shine on the Home download button initializes when the pointer approaches or the button receives focus, rather than blocking the initial page load; the native link works without WebGL.

The completed pages use a subtle grid, editorial artwork and hover feedback on interactive elements; the decorative case-library panel appears only with the empty placeholder. No extra animation loop is added, and reduced-motion visitors retain a static experience.

In the interactive illustration, select a key or layer, or click the knob to cycle layers. Selections are held in memory per layer for that page visit only; the illustration does not change the actual app or a physical device.

The **Download for Windows** button downloads the unsigned Windows test installer from the GitHub pre-release `v1.0.1-test.22`. The app was built and smoke-tested on a hosted Windows runner; physical Windows devices, audio hardware, macropad hardware and firmware remain untested. Windows may show a warning because the installer is unsigned. The website does not host the installer itself.

## Feedback and support

The feedback form is integrated with [Web3Forms](https://web3forms.com/) using the public access key supplied by the project owner. To change the receiving inbox, create a Web3Forms access key using the new email address, then put that public key in the `data-web3forms-key` attribute on the feedback form in `website/index.html`. Web3Forms describes this key as a public form identifier, not a secret. Run `node scripts/build-website-routes.cjs` and deploy the updated site. Confirm a real submission arrives in the recipient inbox (including its spam folder); a successful API response alone does not prove email delivery. Use Web3Forms' available anti-spam/domain controls as appropriate and review its privacy policy and terms before enabling. Feedback and optional contact details are sent to Web3Forms; the site advises visitors not to include sensitive information. The contact field supports both email addresses and social handles. The form shows sending, success, and failure states, prevents duplicate submissions, and keeps the message in the form for retry if sending fails. Until a valid key is set, no request is sent and the form explains that it is unavailable. The form requires JavaScript.

The header’s **Buy me a coffee** link opens the support section. PayPal links to the owner's supplied PayPal.Me page in the top-level tab. The separate **Buy me a coffee** button remains disabled until its destination is supplied.

Section backgrounds and dividers are part of their own scroll construction. A started section completes when it leaves the viewport so off-screen cursors do not continue consuming resources. Mobile navigation uses native details and remains usable without JavaScript. Background layers are independent of content so direct links and deep scrolling still work; skipping or reduced motion restores everything immediately.


## GitHub Pages

The `Deploy ZERO website` workflow publishes the contents of `website/` with GitHub Actions, without building the Electron app. In repository **Settings → Pages**, select **GitHub Actions** as the build source. The clean Home URL is `https://david-8837.github.io/MacroPad-/home/`; it becomes available only after a successful deployment. The workflow runs when website files change on `main` or `arena/d088a202-macropad`, and can also be run manually once the workflow is available on the default branch. If the `github-pages` environment restricts deployment branches, add `arena/d088a202-macropad` under its deployment branch rules or deploy after merging to `main`.

## Case model library

`/cases/` shows paid V1 (keys and knob, no screen or external LEDs) and V2 (screen and planned RGB) case model downloads priced at ₹150 each. Purchase is required before downloading. The illustrations are placeholders, the case designs and fit are unverified, and the purchase buttons are disabled until payment verification and protected file delivery are implemented. A static site cannot enforce purchases: do not put paid files in `website/`, Git, public storage, or `cases-data.js`. A backend or secure commerce service must verify payment and authorize access to privately stored files before delivery. The page also has a separate library for case pictures and downloadable files. Until additional models are added, the library shows decorative artwork and no download cards. This is a static frontend, not an upload service: adding files through a browser and storing them online will require backend work later.

To add an **explicitly free** model to the separate public gallery (not a paid V1 or V2 file):

1. Put a browser-readable picture and the free model file (for example, STL, STEP, 3MF, or ZIP) in `website/assets/cases/`. These files are public and cannot be protected by this gallery.
2. Add an entry to `website/cases-data.js`, for example: `{ title: 'My case', image: './assets/cases/my-case.webp', file: './assets/cases/my-case.stl' }`.
3. Deploy both files and the updated `cases-data.js` together. Use local same-site paths; invalid or incomplete entries are not displayed. Keep large models out of Git if they exceed the repository's storage conventions.

Each listed item shows its picture, name, and a real download link to its file. Confirm the case fit with your physical hardware before describing it as tested. The build walkthrough uses photo-style keys-and-knob and display illustrations rendered from pages 1 and 2 of the user-provided `website/assets/Macropad_Complete_Wiring_Guide.pdf` (SHA-256 `2906d1f99e8b7624a2ad7b9f2f3f3a95371a67391595fc3a5553692da294c53b`). The original PDF and its illustrations use the old names: its V2 is now V1, and its V1 is now V2. They are illustrative and must be verified against the actual parts. The PDF’s page 3 depicts an unapproved RGB circuit and mentions low brightness; do not treat that as safe or solder-ready. Hardware and firmware remain physically untested, and V2 RGB power and data must stay disconnected until approved.

## Specular download button

The hero's download link is progressively enhanced with React Bits' `SpecularButton` (`components/SpecularButton.jsx`). It remains a native link and has a static fallback if JavaScript or WebGL is unavailable. Pointer-following motion is disabled when reduced motion is requested. The source includes the React Bits license (MIT with Commons Clause) and the bundled React, React DOM and Scheduler license notices in `components/`.

The site stays directly deployable as static files. After changing the component or its entry point, install the root project dependencies and run `npm run website:build-button` to rebuild the checked-in `assets/specular-button.js` and `assets/specular-button.css`; deploy those assets alongside `index.html`.
