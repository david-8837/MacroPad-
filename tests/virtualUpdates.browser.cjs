// Optional: run Vite and provide CHROMIUM_PATH / PUPPETEER_CORE_PATH.
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
      window.electronAPI = { execAction: async action => {
        if (action.actionName === 'Slow action') { await new Promise(resolve => setTimeout(resolve, 200)); return { success: true }; }
        if (action.actionName === 'Brightness test') return { success: false, error: 'Display unavailable' };
        return { success: true };
      } };
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
    await page.waitForFunction(() => localStorage.getItem('kadowaz_deck'));
    await page.$eval('button::-p-text(Quick guide)', e => e.click());
    await page.waitForSelector('[aria-labelledby="help-title"]');
    assert.match(await page.$eval('[aria-labelledby="help-title"]', e => e.textContent), /virtual macropad/i);
    await page.$eval('button[aria-label="Close help"]', e => e.click());
    await page.evaluate(() => {
      const deck = JSON.parse(localStorage.getItem('kadowaz_deck'));
      deck.layers[0].keys[0].tapAction = { id: 'slow', category: 'hotkey', name: 'Slow action', payload: { keys: ['A'] } };
      deck.layers[0].keys[1].tapAction = { id: 'bright', category: 'media', name: 'Brightness test', payload: { mediaAction: 'brightness_up' } };
      localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
    });
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.macropad-key');
    assert.match(await page.$eval('.macropad-key', e => e.getAttribute('title')), /Switch 1.*Slow action/);
    // Assistive-style click bypasses pointer geometry and invokes the same virtual dispatcher.
    await page.$$eval('.macropad-key', keys => { keys[0].click(); keys[1].click(); });
    await page.waitForFunction(() => document.querySelector('[aria-label="Virtual action feedback"]')?.textContent.includes('Display unavailable'));
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.match(await page.$eval('[aria-label="Virtual action feedback"]', e => e.textContent), /Brightness test: Display unavailable/, 'slow earlier success must not hide latest failure');
    await page.$eval('button::-p-text(Backup & restore)', e => e.click());
    await page.waitForFunction(() => document.querySelector('#backup-restore summary')?.getAttribute('aria-expanded') === 'true');
    assert.match(await page.$eval('#backup-restore', e => e.textContent), /Save a copy.*Restore:/s);
    assert.deepEqual(errors, []);
    console.log('virtual updates: action feedback, race handling and backup access passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
