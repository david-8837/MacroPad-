/** Set false to disable the intro and its replay control. */
export const ENABLE_INTRO = true;
export const INTRO_DURATION_MS = 25500;
export const INTRO_SESSION_KEY = 'kadowaz_intro_seen_v1';
export const INTRO_REPLAY_EVENT = 'kadowaz-replay-intro';

export interface BuildStep {
  selector: string;
  start: number;
  stagger?: number;
  label: string;
  /** Structural frames are drawn before their contents. */
  frame?: boolean;
  /** Reveal the real text one character at a time, including wrapped lines. */
  type?: boolean;
  /** Animate each text-only descendant in reading order. */
  textLeaves?: boolean;
  duration?: number;
}
export interface RegionScript {
  id: string;
  role: string;
  tint: string;
  /** Scale this cursor’s timeline around its first frame (1 = normal). */
  timeScale?: number;
  timeOrigin?: number;
  steps: BuildStep[];
}

// These are the real, visible UI nodes, not facsimiles. Every selector can match
// multiple elements; stagger gives each its own placement time.
export const REGION_SCRIPTS: RegionScript[] = [
  { id: 'navigation', role: 'Interface', tint: '#1351aa', steps: [
    { selector: '.app-header', start: 80, duration: 600, frame: true, label: 'Header' },
    // The navigation cursor draws the header, then takes over the sidebar
    // heading after the layers cursor has drawn its frame.
    { selector: '.workspace-rail > div:nth-child(1) > span', start: 1250, duration: 650, type: true, label: 'Typing' },
    { selector: '.workspace-rail > div:nth-child(1) > p', start: 1950, duration: 2400, type: true, label: 'Typing' },
    { selector: '.app-header nav button', start: 4550, stagger: 430, label: 'Navigation' },
    { selector: '.navbar-actions > .relative', start: 6600, label: 'Connect' },
    { selector: '.navbar-actions > button', start: 7050, stagger: 400, label: 'Tools' },
    { selector: '.navbar-actions > div:last-child > button', start: 8000, stagger: 220, label: 'Window' },
    { selector: '[aria-label="Getting started"]', start: 8850, label: 'Welcome' },
    { selector: '.mobile-rail-toggle', start: 9300, label: 'Layers & tools' },
  ] },
  { id: 'layers', role: 'Layers', tint: '#6689bc', steps: [
    { selector: '.workspace-rail', start: 450, duration: 600, frame: true, label: 'Sidebar frame' },
    // Reciprocal handoff: fill the header the navigation cursor just drew.
    { selector: '.navbar-brand', start: 1200, label: 'Brand' },
    { selector: '.workspace-rail > div:nth-child(2) > div:first-child', start: 2100, label: 'Edit layers' },
    { selector: '.workspace-rail > div:nth-child(2) > div:first-child', start: 2500, type: true, textLeaves: true, label: 'Typing' },
    ...[0, 1, 2, 3].flatMap(i => [
      { selector: `.workspace-rail > div:nth-child(2) > div:nth-child(2) > button:nth-child(${i + 1})`, start: 3450 + i * 1500, label: 'Layer' },
      { selector: `.workspace-rail > div:nth-child(2) > div:nth-child(2) > button:nth-child(${i + 1})`, start: 3850 + i * 1500, type: true, textLeaves: true, label: 'Typing' },
    ]),
    { selector: '.workspace-rail > div:nth-child(2) > p', start: 9550, duration: 2400, type: true, label: 'Typing' },
    { selector: '.workspace-rail > details:nth-of-type(1)', start: 12250, label: 'Firmware' },
    { selector: '.workspace-rail > details:nth-of-type(1) > summary', start: 12650, type: true, textLeaves: true, label: 'Typing' },
    { selector: '.workspace-rail > details:nth-of-type(2)', start: 14150, label: 'Backup' },
    { selector: '.workspace-rail > details:nth-of-type(2) > summary', start: 14550, type: true, textLeaves: true, label: 'Typing' },
    { selector: '.workspace-rail > div:last-child', start: 15650, label: 'Details' },
    { selector: '.workspace-rail > div:last-child > p', start: 16050, duration: 1200, type: true, label: 'Typing' },
  ] },
  { id: 'pad', role: 'Macropad', tint: '#177e80', steps: [
    { selector: '.workspace', start: 80, duration: 500, frame: true, label: 'Workspace' },
    { selector: '.designer-pad', start: 650, duration: 600, frame: true, label: 'Editor frame' },
    { selector: '.startup-deck-heading', start: 1300, label: 'Deck' },
    { selector: '.startup-deck-heading > div > span', start: 1700, duration: 600, stagger: 600, type: true, label: 'Typing' },
    { selector: '.startup-deck-chassis', start: 3000, duration: 600, frame: true, label: 'Chassis' },
    { selector: '.startup-deck-chassis .oled-screen', start: 3700, label: 'Display' },
    { selector: '.startup-deck-chassis .intro-knob-target', start: 4200, label: 'Knob' },
    { selector: '.startup-deck-chassis .macropad-key', start: 4700, stagger: 400, label: 'Switch' },
    { selector: '.startup-keycode-tray .panel', start: 8500, duration: 600, frame: true, label: 'Assignments frame' },
    { selector: '.workspace-arrival > p', start: 8400, label: 'Hint' },
    { selector: '.startup-keycode-tray .panel > div:first-child', start: 9200, label: 'Quick assignments' },
    { selector: '.startup-keycode-tray .panel > div:first-child > div > span', start: 9650, duration: 700, type: true, label: 'Typing' },
    { selector: '.startup-keycode-tray .panel > p', start: 10400, label: 'Key guide' },
    { selector: '.intro-quick-categories', start: 10800, duration: 350, frame: true, label: 'Category frame' },
    { selector: '.intro-quick-categories > button', start: 11200, stagger: 130, label: 'Category' },
    { selector: '.intro-quick-keys', start: 12050, duration: 350, frame: true, label: 'Keys frame' },
    { selector: '.intro-quick-keys > button', start: 12450, stagger: 95, label: 'Key' },
  ] },
  { id: 'inspector', role: 'Controls', tint: '#876ab2', timeScale: 0.85, timeOrigin: 650, steps: [
    { selector: '.designer-inspector:not(.designer-inspector--editing)', start: 650, duration: 600, frame: true, label: 'Inspector frame' },
    { selector: '.startup-deck-controls > div:first-child', start: 1400, duration: 600, frame: true, label: 'Layer frame' },
    { selector: '.startup-deck-controls > div:nth-child(2)', start: 2100, duration: 600, frame: true, label: 'Controls frame' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > section[aria-label="Selected key"]', start: 2800, duration: 500, frame: true, label: 'Switch frame' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > section[aria-label="Selected key"] > div:first-child', start: 3350, label: 'Switch' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > section[aria-label="Selected key"] > div:first-child', start: 3750, type: true, textLeaves: true, label: 'Typing' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > section[aria-label="Selected key"] > p', start: 5150, duration: 2300, type: true, label: 'Typing' },
    ...[0, 1].flatMap(i => [
      { selector: `.designer-inspector:not(.designer-inspector--editing) > section[aria-label="Selected key"] > div:nth-child(2) dl > div:nth-child(${i + 1})`, start: 5150 + i * 1500, label: 'Binding' },
      { selector: `.designer-inspector:not(.designer-inspector--editing) > section[aria-label="Selected key"] > div:nth-child(2) dl > div:nth-child(${i + 1})`, start: 5550 + i * 1500, type: true, textLeaves: true, label: 'Typing' },
    ]),
    ...[0, 1, 2].flatMap(i => [
      { selector: `.designer-inspector:not(.designer-inspector--editing) > details:nth-of-type(${i + 1})`, start: 7900 + i * 2000, label: 'Inspector' },
      { selector: `.designer-inspector:not(.designer-inspector--editing) > details:nth-of-type(${i + 1}) > summary`, start: 8300 + i * 2000, type: true, textLeaves: true, label: 'Typing' },
    ]),
    { selector: '.designer-inspector:not(.designer-inspector--editing) > div:last-child', start: 14000, duration: 500, frame: true, label: 'Telemetry frame' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > div:last-child > div:first-child', start: 14600, label: 'Telemetry' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > div:last-child > div:first-child', start: 15000, type: true, textLeaves: true, label: 'Typing' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > div:last-child > div:nth-child(2)', start: 16000, label: 'Status' },
    { selector: '.designer-inspector:not(.designer-inspector--editing) > div:last-child > div:nth-child(2) p', start: 16400, duration: 850, type: true, label: 'Typing' },
    { selector: '.startup-deck-controls > div:first-child > div:first-child', start: 17600, label: 'Layer selector' },
    { selector: '.startup-deck-controls > div:first-child > div:first-child > span:first-child', start: 18000, duration: 500, type: true, label: 'Typing' },
    { selector: '.startup-deck-controls > div:first-child > div:nth-child(2) > button', start: 18800, stagger: 270, label: 'Layer' },
    { selector: '.startup-deck-controls > div:first-child > div:nth-child(3)', start: 20000, label: 'Layer status' },
    { selector: '.startup-deck-controls > div:nth-child(2) > div:first-child', start: 20500, label: 'Configure' },
    { selector: '.startup-deck-controls > div:nth-child(2) > div:first-child > span', start: 20950, duration: 500, type: true, label: 'Typing' },
    { selector: '.startup-deck-controls > div:nth-child(2) > button', start: 21500, stagger: 600, label: 'Action' },
    { selector: '.startup-deck-controls > button', start: 23800, label: 'Upload' },
  ] },
];
