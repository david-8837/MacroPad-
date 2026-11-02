# Multi-Cursor “AI Builds the App” Intro Animation

Updated from the original universal prompt to include the requested changes and the current KADOWAZ Deck Studio implementation. The animation is scripted decoration, not real AI generation or editing.

For another project, adapt the configuration and discover its actual UI before applying the experience and safety requirements below. For this project, see the implementation notes at the end and the [intro module README](../src/intro/README.md).

---

## Configuration

- **App:** KADOWAZ Deck Studio (adapt to the target app).
- **Cursors:** four independent, role-labeled cursors where their regions are visible: Interface, Layers, Macropad, and Controls.
- **Duration:** as long or short as the construction needs. The original 7–9 second target and 10 second maximum no longer apply.
- **Playback:** once per session in production; replay from Help & About. The development preview also plays on refresh and supports a replay shortcut.
- **Skip:** Escape, the Skip button, or hold and release to skip.
- **Appearance:** use the app's own interface, colors and typography, with a subtle distinct tint per cursor.

## Role and discovery

Act as a front-end and motion engineer. Before changing another project, inspect its stack, entry points, existing loading screen, visible home-screen regions, design tokens, responsive layout and interaction risks. Identify focus traps, keyboard listeners, hardware connections and state that must not be disturbed. Make a brief plan mapping cursors to real regions and prefer a small, isolated implementation.

## Experience

1. Keep the existing loader and its behavior intact. The intro follows it; it is not another loading screen.
2. Show independent cursors working concurrently, with their own paths and timing. They are decorative and do not perform real app actions.
3. Construct the **actual visible home screen**, not a few generic boxes or an invented replacement interface. Include the initially empty workspace and panel frames, then their real contents: navigation, sidebar, controls, device view, keys and inspector. Draw the frames before filling them so they do not simply pop in.
4. Let cursors briefly hand work off to each other—for example, one draws a panel and another fills it. Keep each cursor's work intelligible.
5. Make real headings, labels, values and descriptions look as if they are being typed, including wrapped text in the sidebar and inspector. Reveal the existing text visually rather than changing its contents or triggering keyboard input. The Controls cursor, which works on the inspector and control dock, should work a little faster; leave the other cursors' timing unchanged.
6. As each cursor finishes its own work, have it move away and fade independently. Do not leave finished cursors parked on screen while others continue. End the sequence after the last visible track has finished and departed.
7. Restore the normal, interactive interface without a layout jump, changed assignments or extra mouse movement. Elements outside the visible area remain available when the user scrolls.

Keep the motion subtle and consistent with the app. The selected direction is the real-element construction above, **not** generic rough mockups, placeholder code panels, fake mistakes, or a redesign. Temporary selection outlines and cursor labels may support the effect, but should not obscure the interface.

## Technical and safety requirements

- Keep the implementation isolated and data-driven: an enable flag, region scripts, independent cursor tracks, a single master animation clock and lightweight cursor/guide components. Do not add heavy dependencies.
- Keep the real app mounted. Measure visible real elements before animating them and remeasure on resize or font readiness. Reveal them in place; do not duplicate or replace the whole interface.
- Use real text geometry for the typing effect without rewriting React text nodes, user data or configuration. Preserve and restore every inline style that the animation temporarily changes.
- Prevent pointer and keyboard input from reaching the underlying app while the intro runs. Preserve and restore focus, inert and accessibility state. Capture a held pointer through release so skipping cannot activate an underlying control.
- Escape, Skip and hold-to-skip must restore the interface and clean up timers, event listeners and animation frames. A failure must fail open to the app rather than trapping the user.
- Respect `prefers-reduced-motion`. In this project the intro is bypassed entirely when reduced motion is requested.
- Adapt to the visible viewport and missing or hidden regions; do not animate off-screen content as though it were visible. End when the applicable tracks are done rather than leaving an empty overlay.
- Favor inexpensive animation and avoid layout reads on every frame. Aim for smooth performance on typical hardware, but do not claim a 60 fps result without measuring it.

## Verification checklist

- [ ] Real workspace and panel frames are built before their visible contents; the actual home screen is revealed.
- [ ] Cursors work concurrently, the header/sidebar handoff is visible, and finished cursors leave independently.
- [ ] Sidebar and inspector text types in order, including wrapped lines; the underlying text and assignments remain unchanged.
- [ ] The Controls track is modestly faster without changing the other tracks.
- [ ] Completion, Escape, Skip, hold-and-release, resize and replay restore styles, focus and input. No pointer release reaches a real control.
- [ ] Reduced motion bypasses the animation; production playback is once per session and replay remains available.
- [ ] The final interface matches the original layout and remains usable; no console errors or leaked listeners and timers.
- [ ] Test the production build and packaged desktop app, multiple viewport sizes and real hardware performance. Record any checks that could not be performed rather than assuming they passed.

## KADOWAZ implementation notes

- Source: [`src/intro/`](../src/intro/). `config.ts` contains the selectors and scripts; `timeline.ts` handles the tracks; `textGeometry.ts` measures character positions for wrapped text; `Intro.tsx` manages the overlay, measurement, restoration and input isolation.
- `ENABLE_INTRO` disables the feature. Production uses `sessionStorage`; **Help & About → Replay intro** replays it. In development, **Ctrl+Alt+I** also replays it.
- The Controls track uses `timeScale: 0.85` around its first frame. The other tracks keep their existing timing. The current `INTRO_DURATION_MS` is a 25.5-second implementation ceiling, not a user-mandated target; the intro normally ends after the last visible track exits, and a watchdog fails open if necessary.
- Automated intro tests are in [`tests/intro.test.cjs`](../tests/intro.test.cjs) and run with `npm test`. Browser checks have covered construction, typing, completion, resize, skip, cleanup and reduced motion. Vite and Electron staging builds have passed.
- Smooth 60 fps on typical hardware and behavior in a real packaged Windows/Electron app have **not** yet been verified. Device behavior remains subject to physical testing.
