// Review a saved legacy hold without connecting or writing to a physical pad.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.evaluateOnNewDocument(() => localStorage.setItem('kadowaz_guide_seen', '1'));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
    await page.waitForSelector('[aria-label="Empty layer keys"]');
    await page.waitForFunction(() => localStorage.getItem('kadowaz_deck'));
    await page.evaluate(() => {
      const deck = JSON.parse(localStorage.getItem('kadowaz_deck'));
      deck.layers[0].dial.channelHoldThresholdMs = 1200;
      deck.layers[0].dial.cwAction = { id: 'multi', name: 'Ctrl+A+B', category: 'hotkey', payload: { keys: ['Ctrl','A','B'] } };
      deck.layers[0].dial.holdAction = { id: 'old-hold', name: 'Legacy custom hold', category: 'hotkey', payload: { keys: ['A'] } };
      localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('[aria-label="Empty layer keys"]');
    await page.$eval('button::-p-text(Upload to deck)', e => e.click());
    await page.waitForSelector('[aria-labelledby="upload-sheet-heading"]');
    const review = await page.$eval('[aria-labelledby="upload-sheet-heading"]', e => e.textContent);
    assert.match(review, /sets the pad’s knob hold to 0\.7 seconds/i);
    assert.match(review, /Next layer · 0\.7 s hold/i);
    assert.match(review, /Legacy custom hold/);
    assert.match(review, /Ctrl\+A\+B/);
    assert.match(review, /Desktop actions do not run in firmware/);
    assert.equal(await page.$eval('[data-testid="upload-knob-preview"] [title^="Ctrl+A+B"]', e => e.textContent.includes('PC')), true);
    assert.match(review, /Old knob-hold assignments are kept in the app but will not run/i);
    assert.equal(await page.$eval('[data-testid="upload-knob-preview"] [title^="Legacy custom hold"]', e => e.textContent.includes('FIXED')), true);
    assert.deepEqual(errors, []);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('kadowaz_deck')));
    assert.equal(saved.layers[0].dial.holdAction.id, 'old-hold', 'review must not erase legacy data');
    assert.equal(saved.layers[0].dial.channelHoldThresholdMs, 1200, 'review must not alter saved legacy settings');
    console.log('fixed knob hold: saved legacy warning and review-first upload passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
