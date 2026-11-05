const assert = require('node:assert/strict');
const { buildSync } = require('esbuild');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const tmp = mkdtempSync(join(tmpdir(), 'intro-test-'));
try {
  const entry = join(tmp, 'entry.ts');
  writeFileSync(entry, `export * from ${JSON.stringify(join(__dirname, '../src/intro/timeline.ts'))}; export * from ${JSON.stringify(join(__dirname, '../src/intro/config.ts'))}; export * from ${JSON.stringify(join(__dirname, '../src/intro/textGeometry.ts'))};`);
  const result = buildSync({ entryPoints: [entry], platform: 'node', bundle: true, format: 'cjs', write: false });
  const bundled = join(tmp, 'intro.cjs'); writeFileSync(bundled, result.outputFiles[0].text);
  const { frameFor, revealFor, typingFor, textClip, scriptTime, scriptDuration, seededJitter, REGION_SCRIPTS, INTRO_DURATION_MS } = require(bundled);
  assert.ok(INTRO_DURATION_MS >= 10000, 'allow enough time to assemble the real interface');
  assert.equal(REGION_SCRIPTS.length, 4);
  for (const selector of ['.app-header', '.workspace', '.workspace-rail', '.designer-pad', '.designer-inspector:not(.designer-inspector--editing)', '.startup-deck-controls > div:first-child', '.startup-deck-controls > div:nth-child(2)', '.startup-keycode-tray .panel', '.navbar-brand', '.app-header nav button', '.workspace-rail > details:nth-of-type(1)', '.startup-deck-heading', '.startup-deck-chassis', '.startup-deck-chassis .oled-screen', '.startup-deck-chassis .intro-knob-target', '.startup-deck-chassis .macropad-key', '.intro-quick-categories > button', '.intro-quick-keys > button', '.designer-inspector:not(.designer-inspector--editing) > details:nth-of-type(1)', '.startup-deck-controls > button']) {
    assert.ok(REGION_SCRIPTS.some(s => s.steps.some(step => step.selector === selector)), `${selector} should be built`);
  }
  assert.equal(revealFor(1000, 1000), 0);
  assert.ok(revealFor(1180, 1000) > 0 && revealFor(1180, 1000) < 1);
  assert.equal(revealFor(1360, 1000), 1);
  assert.ok(revealFor(1300, 1000, 600) > 0 && revealFor(1300, 1000, 600) < 1);
  assert.ok(REGION_SCRIPTS.flatMap(s => s.steps).filter(s => s.frame).length >= 8, 'structural frames animate too');
  assert.equal(typingFor(1000, 1000, 1000, 10), 0);
  assert.equal(typingFor(1450, 1000, 1000, 10), .4, 'typing advances in character-sized steps');
  assert.equal(typingFor(2000, 1000, 1000, 10), 1);
  const navigation = REGION_SCRIPTS.find(s => s.id === 'navigation');
  const layers = REGION_SCRIPTS.find(s => s.id === 'layers');
  const inspector = REGION_SCRIPTS.find(s => s.id === 'inspector');
  assert.equal(scriptTime(inspector, 650), 650, 'controls cursor starts at the same time');
  assert.equal(scriptTime(inspector, 10650), 9150, 'only controls timeline runs 15 percent faster');
  assert.equal(scriptDuration(inspector, 1000), 850, 'typing and movement durations speed up too');
  for (const other of REGION_SCRIPTS.filter(s => s.id !== 'inspector')) {
    assert.equal(scriptTime(other, 10650), 10650, `${other.id} schedule remains unchanged`);
    assert.equal(scriptDuration(other, 1000), 1000, `${other.id} duration remains unchanged`);
  }
  const header = navigation.steps.find(s => s.selector === '.app-header');
  const rail = layers.steps.find(s => s.selector === '.workspace-rail');
  const brand = layers.steps.find(s => s.selector === '.navbar-brand');
  const railTitle = navigation.steps.find(s => s.selector === '.workspace-rail > div:nth-child(1) > span');
  assert.ok(brand.start >= header.start + header.duration, 'layers cursor fills the completed header');
  assert.ok(railTitle.type && railTitle.start >= rail.start + rail.duration, 'navigation cursor types into the completed sidebar');
  assert.ok(REGION_SCRIPTS.flatMap(s => s.steps).filter(s => s.type).length >= 12, 'the sidebar and inspector text is typed');
  for (const selector of ['.workspace-rail > div:nth-child(1) > p', '.workspace-rail > div:nth-child(2) > p', '.workspace-rail > details:nth-of-type(1) > summary', '.workspace-rail > details:nth-of-type(2) > summary', '.designer-inspector:not(.designer-inspector--editing) > div:last-child > div:nth-child(2) p']) {
    assert.ok(REGION_SCRIPTS.some(s => s.steps.some(step => step.selector === selector && step.type)), `${selector} should be typed`);
  }
  assert.equal(textClip([], 0, {left: 0, top: 0, width: 100, height: 30}), 'inset(0 100% 0 0)');
  const mask = textClip([{x: 20, y: 0, bottom: 10}, {x: 8, y: 15, bottom: 25}], 2, {left: 0, top: 0, width: 100, height: 30});
  assert.match(mask, /100% 14px, 8px 14px, 8px 26px/, 'wrapped text keeps previous lines while revealing the current line');
  assert.equal(seededJitter(42, 0), seededJitter(42, 0));
  assert.notEqual(seededJitter(42, 0), seededJitter(42, 1));
  const rect = { left: 10, top: 80, width: 320, height: 400 }, viewport = { width: 1280, height: 800 };
  const targets = [{ rect, start: 1000, label: 'first' }, { rect: {...rect, left: 500}, start: 1800, label: 'second' }];
  const frames = REGION_SCRIPTS.map((s, i) => frameFor(s, targets, 1200, 42, i, viewport));
  assert.ok(frames.every(f => f.opacity > 0), 'agents build simultaneously');
  assert.ok(new Set(frames.map(f => f.x)).size > 1, 'timings are independent');
  const typingTarget = [{rect: {...rect, width: 100}, start: 1000, duration: 1000, type: true, characters: 10, label: 'Typing'}];
  const typedEarly = frameFor(navigation, typingTarget, 1200 + seededJitter(42, 0), 42, 0, viewport);
  const typedLate = frameFor(navigation, typingTarget, 1800 + seededJitter(42, 0), 42, 0, viewport);
  assert.ok(typedLate.x > typedEarly.x + 40, 'cursor follows the typed text');
  assert.equal(frameFor(REGION_SCRIPTS[0], targets, 1400, 42, 0, viewport).active, 1, 'cursor advances through real elements');
  const finishedAt = 1800 + 360 + seededJitter(42, 0);
  const beforeExit = frameFor(REGION_SCRIPTS[0], targets, finishedAt - 10, 42, 0, viewport);
  const duringExit = frameFor(REGION_SCRIPTS[0], targets, finishedAt + 400, 42, 0, viewport);
  const afterExit = frameFor(REGION_SCRIPTS[0], targets, finishedAt + 850, 42, 0, viewport);
  assert.equal(beforeExit.opacity, 1, 'cursor stays visible while it is working');
  assert.ok(duringExit.opacity > 0 && duringExit.opacity < 1, 'finished cursor fades away');
  assert.equal(afterExit.opacity, 0, 'finished cursor does not wait for the whole intro');
  assert.notEqual(duringExit.x, beforeExit.x, 'finished cursor moves away as it fades');
  const longTrack = [...targets, { rect, start: 8000, label: 'still working' }];
  assert.ok(frameFor(REGION_SCRIPTS[1], longTrack, finishedAt + 850, 42, 1, viewport).opacity > 0,
    'other agents continue working while a finished cursor leaves');
  const intro = readFileSync(join(__dirname, '../src/intro/Intro.tsx'), 'utf8');
  assert.match(intro, /cancelAnimationFrame/); assert.match(intro, /removeEventListener\('resize'/);
  assert.match(intro, /app\.inert = previousInert/); assert.match(intro, /restoreTargets\(\)/);
  assert.match(intro, /restore\(element, 'clip-path'/); assert.match(intro, /restore\(element, 'translate'/); assert.match(intro, /restore\(element, 'opacity'/);
  assert.match(intro, /pointerRef\.current !== null/); assert.match(intro, /setPointerCapture/);
  assert.match(intro, /prefers-reduced-motion: reduce/); assert.match(intro, /sessionStorage/);
  const help = readFileSync(join(__dirname, '../src/components/HelpPanel.tsx'), 'utf8');
  assert.match(help, /Replay intro/); assert.match(help, /Reduce Motion/);
  console.log('intro: real home-screen elements, staggered tracks, safety and cleanup passed');
} finally { rmSync(tmp, { recursive: true, force: true }); }
