// Optional browser integration: start Vite and supply CHROMIUM_PATH/PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setViewport({ width: 1360, height: 900 });
    await page.evaluateOnNewDocument(() => { localStorage.setItem('kadowaz_guide_seen', '1'); window.electronAPI = { setWindowTheme: async t => { window.lastTheme = t; return true; } }; });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
    await page.waitForSelector('.intro-skip'); await page.click('.intro-skip');
    await page.waitForFunction(() => !document.documentElement.classList.contains('intro-running'));
    await page.click('button[aria-label="Settings"]'); await page.waitForSelector('.settings-page');
    assert.equal(await page.$eval('input[value="light"]', el => el.checked), true);
    assert.equal(await page.$eval('[role="switch"][aria-label="Opening animation"]', el => el.getAttribute('aria-checked')), 'true');
    await page.click('input[value="dark"]');
    await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
    assert.equal(await page.evaluate(() => window.lastTheme), 'dark');
    assert.equal(await page.evaluate(() => localStorage.getItem('kadowaz_app_theme')), 'dark');
    assert.equal(await page.$eval('.settings-page', el => getComputedStyle(el).backgroundColor), 'rgb(29, 34, 43)');
    await page.click('[role="switch"][aria-label="Opening animation"]');
    assert.equal(await page.evaluate(() => localStorage.getItem('kadowaz_opening_animation')), 'off');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('.designer-layout');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('intro-running')), false);
    assert.equal(await page.$('.intro-skip'), null);
    assert.equal(await page.$eval('.app-shell', el => el.classList.contains('startup-entrance')), false);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.evaluate(() => window.lastTheme), 'dark');
    const chassis = await page.$eval('.chassis', el => getComputedStyle(el).backgroundImage);
    assert.match(chassis, /rgb\(20, 20, 20\)/, 'physical pad preview retains original color');
    await page.screenshot({ path: '/tmp/zero-dark-keys.png' });
    await page.click('button[aria-label="Settings"]'); await page.waitForSelector('.settings-page');
    assert.equal(await page.$eval('input[value="dark"]', el => el.checked), true);
    assert.equal(await page.$eval('[role="switch"][aria-label="Opening animation"]', el => el.getAttribute('aria-checked')), 'false');
    await page.screenshot({ path: '/tmp/zero-dark-settings.png' });
    // Replay remains a deliberate action even with automatic startup disabled.
    await page.click('button::-p-text(Replay intro)'); await page.waitForSelector('.intro-skip');
    await page.click('.intro-skip');
    await page.waitForFunction(() => !document.documentElement.classList.contains('intro-running'));
    await page.click('button[aria-label="Settings"]'); await page.waitForSelector('.settings-page');
    await page.click('[role="switch"][aria-label="Opening animation"]');
    await page.click('input[value="light"]');
    assert.equal(await page.evaluate(() => window.lastTheme), 'light');
    await page.reload({ waitUntil: 'load' }); await page.waitForSelector('.intro-skip');
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await page.click('.intro-skip');
    assert.deepEqual(errors, []);
    console.log('preferences: theme, hardware colors, startup off/on, persistence and manual replay passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
