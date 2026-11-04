// Start Vite and provide CHROMIUM_PATH / PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(() => {
      window.__nativeCalls = [];
      window.electronAPI = { execAction: async action => { window.__nativeCalls.push(action); if (window.__delayNext) { window.__delayNext = false; return new Promise(resolve => { window.__resolveAction = resolve; }); } return { success: true }; } };
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
    await page.waitForFunction(() => localStorage.getItem('kadowaz_deck'));
    await page.evaluate(() => {
      const deck = JSON.parse(localStorage.getItem('kadowaz_deck'));
      deck.layers[0].keys[0].tapAction = { id: 'test', name: 'Send A', category: 'hotkey', payload: { keys: ['A'] } };
      deck.layers[0].keys[3].holdAction = { id: 'hold', name: 'Hold B', category: 'hotkey', payload: { keys: ['B'] } };
      deck.layers[0].keys[1].tapAction = { id: 'macro', name: 'Macro M0', category: 'macro', payload: { macroId: 0 } };
      localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
      localStorage.setItem('kadowaz_macros_v2', JSON.stringify([{ id: 0, name: 'Example', actions: [{ id: 's1', type: 'combo', value: 'B', keys: ['B'] }] }]));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.macropad-key');
    const feedback = () => page.$eval('[aria-label="Virtual action feedback"]', e => e.textContent);
    const clicks = () => page.evaluate(() => window.__nativeCalls.length);
    await page.$eval('button::-p-text(Safe preview off)', e => e.click());
    assert.equal(await page.$eval('button::-p-text(Safe preview on)', e => e.getAttribute('aria-pressed')), 'true');
    await page.$$eval('.macropad-key', keys => keys[0].click());
    await page.waitForFunction(() => document.querySelector('[aria-label="Virtual action feedback"]')?.textContent.includes('Send A'));
    assert.match(await feedback(), /Preview only: Send A.*A.*Nothing was sent/);
    await page.$$eval('.macropad-key', keys => keys[1].click());
    assert.match(await feedback(), /Macro M0.*Nothing was sent/);
    await page.$$eval('.macropad-key', keys => keys[2].click());
    assert.match(await feedback(), /unassigned.*Nothing was sent/i);
    await page.$eval('button[title^="Tap:"]', e => e.click());
    assert.match(await feedback(), /Preview only:.*Nothing was sent/);
    assert.equal(await clicks(), 0, 'safe virtual keys, macro and knob do not invoke native actions');
    await page.$eval('button::-p-text(Safe preview on)', e => e.click());
    await page.$$eval('.macropad-key', keys => keys[0].click());
    await page.waitForFunction(() => window.__nativeCalls.length === 1);
    assert.deepEqual((await page.evaluate(() => window.__nativeCalls[0])).payload.keys, ['A']);

    // An already-pending response must not overwrite preview feedback.
    await page.evaluate(() => { window.__delayNext = true; });
    await page.$$eval('.macropad-key', keys => keys[0].click());
    await page.waitForFunction(() => window.__resolveAction);
    await page.$eval('button::-p-text(Safe preview off)', e => e.click());
    await page.evaluate(() => window.__resolveAction({ success: true }));
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.match(await feedback(), /Safe preview is on.*will not send/);
    // A hold started before the toggle still observes the current safe state.
    await page.$eval('button::-p-text(Safe preview on)', e => e.click());
    await page.$$eval('.macropad-key', keys => keys[3].dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 19, button: 0 })));
    await page.$eval('button::-p-text(Safe preview off)', e => e.click());
    await page.waitForFunction(() => document.querySelector('[aria-label="Virtual action feedback"]')?.textContent.includes('Hold B'));
    assert.equal(await clicks(), 2, 'the delayed hold must not call native code after safe preview is enabled');
    await page.$$eval('.macropad-key', keys => keys[3].dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 19 })));

    // The quick tray is an editor operation; undo/redo is separate from selection.
    await page.$$eval('.macropad-key', keys => keys[0].click());
    await page.$eval('button[title^="KC_B —"]', e => e.click());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction?.payload.keys?.[0] === 'B');
    await page.$eval('button[title^="KC_C —"]', e => e.click());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction?.payload.keys?.[0] === 'C');
    await page.$eval('[aria-label="Layout edit history"] button::-p-text(Undo)', e => e.click());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction?.payload.keys?.[0] === 'B');
    await page.$eval('.workspace-arrival .panel button::-p-text(Keys)', e => e.click());
    await page.waitForSelector('.designer-inspector--editing');
    await page.$eval('[aria-label="Layout edit history"] button::-p-text(Redo)', e => e.click());
    await page.waitForFunction(() => !document.querySelector('.designer-inspector--editing'));
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction?.payload.keys?.[0] === 'C');
    await page.$eval('.startup-deck-controls button::-p-text(Layer 1)', e => e.click());
    await page.$eval('[aria-label="Layout edit history"] button::-p-text(Undo)', e => e.click());
    await page.waitForFunction(() => {
      const d = JSON.parse(localStorage.getItem('kadowaz_deck'));
      return d.activeLayerId === d.layers[1].id && d.layers[0].keys[0].tapAction?.payload.keys?.[0] === 'B';
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('button::-p-text(Safe preview off)');
    assert.equal(await page.$eval('[aria-label="Layout edit history"] button::-p-text(Undo)', e => e.disabled), true);
    assert.equal(await page.$eval('[aria-label="Layout edit history"] button::-p-text(Redo)', e => e.disabled), true);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction.payload.keys[0]), 'B');
    assert.deepEqual(errors, []);
    console.log('safe preview and history browser: virtual isolation, live action, undo/redo and layer selection passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
