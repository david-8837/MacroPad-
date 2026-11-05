// Optional: start Vite; set CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    const seedContext = await browser.createBrowserContext();
    const seed = await seedContext.newPage();
    await seed.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
    await seed.waitForFunction(() => localStorage.getItem('kadowaz_deck'));
    const deck = JSON.parse(await seed.evaluate(() => localStorage.getItem('kadowaz_deck')));
    await seedContext.close();
    const backupPath = path.join(os.tmpdir(), `zero-storage-backup-${process.pid}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(deck));
    for (const scenario of ['corrupt', 'malformed', 'shuffled', 'bad-dial', 'legacy', 'quota']) {
      const context = await browser.createBrowserContext();
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.setViewport({ width: 1400, height: 900 });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.evaluateOnNewDocument((kind, deck) => {
        if (kind === 'corrupt') {
          localStorage.setItem('kadowaz_deck', '{broken deck');
          localStorage.setItem('kadowaz_macros_v2', '{broken macros');
        } else if (kind === 'malformed') {
          deck.layers[0].keys[0] = null;
          localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
        } else if (kind === 'shuffled') {
          [deck.layers[0].keys[0], deck.layers[0].keys[1]] = [deck.layers[0].keys[1], deck.layers[0].keys[0]];
          localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
        } else if (kind === 'bad-dial') {
          deck.layers[0].dial.pressAction = null;
          localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
        } else if (kind === 'legacy') {
          deck.name = 'Studio Deck'; deck.layers = deck.layers.slice(0, 2);
          deck.layers[0].keys[0].tapAction = { id: 'legacy-macro', name: 'Legacy Macro', category: 'macro', payload: { macroId: 0 } };
          localStorage.setItem('kadowaz_deck', JSON.stringify(deck));
        } else {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key, value) {
            if (this === localStorage && key.startsWith('kadowaz_')) throw new DOMException('quota', 'QuotaExceededError');
            return original.call(this, key, value);
          };
        }
      }, scenario, deck);
      await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.designer-layout');
      if (scenario === 'legacy') {
        await page.waitForFunction(() => JSON.parse(localStorage.getItem('kadowaz_deck')).layers.length === 4);
        const saved = JSON.parse(await page.evaluate(() => localStorage.getItem('kadowaz_deck')));
        assert.equal(saved.layers[0].keys[0].tapAction.id, 'legacy-macro');
        assert.equal(saved.name, 'Macropad'); assert.deepEqual(errors, []);
        await context.close(); console.log('storage browser: legacy deck preserved and normalized'); continue;
      }
      await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(e => /could not be (read|saved)/i.test(e.textContent)));
      if (['corrupt', 'malformed', 'shuffled', 'bad-dial'].includes(scenario)) {
        if (scenario === 'corrupt') assert.equal(await page.evaluate(() => localStorage.getItem('kadowaz_deck')), '{broken deck');
        else if (scenario === 'malformed') assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('kadowaz_deck'))).layers[0].keys[0], null);
        else if (scenario === 'shuffled') assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('kadowaz_deck'))).layers[0].keys[0].keyIndex, 1);
        else assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('kadowaz_deck'))).layers[0].dial.pressAction, null);
        await page.click('button[aria-label="Settings"]'); await page.waitForSelector('#backup-restore');
        assert.equal(await page.$eval('button::-p-text(Download backup)', el => el.disabled), true);
        const input = await page.$('input[type="file"][accept*="json"]'); await input.uploadFile(backupPath);
        await page.waitForSelector('[aria-label="Confirm backup restore"]');
        await page.$eval('button::-p-text(Confirm restore)', el => el.click());
        await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(e => e.textContent.includes('Download backup')).disabled);
        assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('kadowaz_deck'))), deck);
      }
      if (scenario === 'corrupt' || scenario === 'quota') {
        await page.$eval('nav[aria-label="Modules"] button::-p-text(Macros)', el => el.click());
        await page.waitForFunction(() => [...document.querySelectorAll('[role="alert"]')].some(e => /macros could not be (read|saved)/i.test(e.textContent)));
        await page.$eval('button::-p-text(Save)', el => el.click());
        if (scenario === 'corrupt') assert.equal(await page.evaluate(() => localStorage.getItem('kadowaz_macros_v2')), '{broken macros');
      }
      assert.deepEqual(errors, [], `${scenario}: no unhandled renderer errors`);
      await context.close(); console.log(`storage browser: ${scenario} data preserved and failure shown`);
    }
    fs.unlinkSync(backupPath);
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
