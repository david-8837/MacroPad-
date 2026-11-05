// Optional: run Vite and set CHROMIUM_PATH / PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setViewport({width: 1280, height: 900});
    await page.emulateMediaFeatures([{name: 'prefers-reduced-motion', value: 'reduce'}]);
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kadowaz_guide_seen', '1');
      window.__actions = [];
      window.electronAPI = {execAction: async a => { window.__actions.push(a); return {success:true}; }};
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', {waitUntil:'load'});
    await page.waitForSelector('[aria-label="Empty layer keys"]');
    const panel = () => page.$eval('[aria-label="Selected key"]', e => e.textContent);
    assert.match(await panel(), /Layer 0.*Switch 1.*Tap.*Unassigned/s);
    assert.match(await page.$eval('[aria-label="Empty layer keys"]', e => e.textContent), /No keys assigned yet.*knob may have its own assignments/i);
    // The prompt selects and opens an editor, never activating the virtual key.
    await page.$eval('[aria-label="Empty layer keys"] button', e => e.focus());
    await page.keyboard.press('Enter');
    await page.waitForSelector('.designer-inspector--editing');
    assert.equal(await page.evaluate(() => window.__actions.length), 0);
    await page.waitForSelector('button[title="Close Drawer"]');
    await page.$eval('button[title="Close Drawer"]', e => e.click());
    await page.$eval('button[title^="KC_A —"]', e => e.click());
    await page.waitForFunction(() => !document.querySelector('[aria-label="Empty layer keys"]'));
    assert.match(await panel(), /Tap.*A/s);
    await page.$eval('[aria-label="Selected key"] button::-p-text(Edit key)', e => e.click());
    await page.waitForSelector('.designer-inspector--editing');
    await page.waitForSelector('button[title="Close Drawer"]');
    await page.$eval('button[title="Close Drawer"]', e => e.click());
    // Seed representative existing assignments to check gesture and layer labels.
    await page.evaluate(() => {
      const deck = JSON.parse(localStorage.getItem('kadowaz_deck'));
      const action = name => ({id:name, name, category:'hotkey', payload:{keys:['Ctrl','X']}});
      Object.assign(deck.layers[0].keys[0], { tapAction: action('A long assigned action name that should wrap without being cut off'), holdAction: action('Hold action'), doubleTapAction: action('Double action') });
      Object.assign(deck.layers[1].keys[0], { isDestructiveSafety:true, safetyConfirmAction:action('Protected action'), longPressThresholdMs:2000, tapAction:action('Ignored tap') });
      deck.layers[2].keys[0].holdAction = action('Only hold');
      localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
    });
    await page.reload({waitUntil:'load'});
    await page.waitForSelector('[aria-label="Selected key"]');
    assert.match(await panel(), /Layer 0.*Tap.*A long assigned action name.*Ctrl \+ X.*Hold.*Hold action.*Double tap.*Double action/s);
    assert.equal(await page.$('[aria-label="Empty layer keys"]'), null);
    await page.$eval('.startup-deck-controls button::-p-text(Layer 1)', e => e.click());
    assert.match(await panel(), /Layer 1.*Hold to confirm.*Protected action.*Hold for 2\.0 seconds.*Tap is disabled/s);
    assert.doesNotMatch(await panel(), /Ignored tap/);
    assert.equal(await page.$('[aria-label="Empty layer keys"]'), null);
    await page.$eval('.startup-deck-controls button::-p-text(Layer 2)', e => e.click());
    assert.match(await panel(), /Tap.*Unassigned.*Hold.*Only hold/s);
    assert.equal(await page.$('[aria-label="Empty layer keys"]'), null, 'a hold-only binding is not an empty key layer');
    await page.$eval('.startup-deck-controls button::-p-text(Layer 3)', e => e.click());
    assert.match(await page.$eval('[aria-label="Empty layer keys"]', e => e.textContent), /Layer 3/);
    assert.deepEqual(errors, []);
    console.log('key inspector browser: assignments, gestures, safety, empty-layer prompt and keyboard edit passed');
  } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode=1;});
