// Optional real-browser test: start Vite and set CHROMIUM_PATH/PUPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.setViewport({ width: 1280, height: 900 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kadowaz_guide_seen', '1');
      window.mockScale = 1; window.scaleRequests = []; window.nativeActions = [];
      window.electronAPI = {
        getViewScale: async () => window.mockScale,
        setViewScale: async factor => { window.scaleRequests.push(factor); if (window.rejectScale) throw new Error('fail'); window.mockScale = factor; return factor; },
        execAction: async action => { window.nativeActions.push(action); return { success: true }; },
      };
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
    await page.waitForSelector('.designer-layout');
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector('main.settings-page h1');
    assert.equal(await page.$eval('button[aria-label="Settings"]', el => el.getAttribute('aria-current')), 'page');
    await page.waitForFunction(() => document.querySelector('#settings-view-size')?.value === '100');
    await page.select('#settings-view-size', '125');
    await page.waitForFunction(() => window.mockScale === 1.25 && document.querySelector('#settings-view-size').value === '125');
    await page.click('button::-p-text(Reset to 100%)');
    await page.waitForFunction(() => window.mockScale === 1 && document.querySelector('#settings-view-size').value === '100');
    assert.deepEqual(await page.evaluate(() => window.scaleRequests), [1.25, 1]);
    await page.evaluate(() => { window.rejectScale = true; });
    await page.select('#settings-view-size', '150');
    await page.waitForFunction(() => document.body.innerText.includes('Could not change the view size'));
    assert.equal(await page.$eval('#settings-view-size', el => el.value), '100', 'failed request retains previous size');
    await page.click('[role="switch"][aria-label="Safe preview"]');
    assert.equal(await page.$eval('[role="switch"][aria-label="Safe preview"]', el => el.getAttribute('aria-checked')), 'true');
    await page.click('nav[aria-label="Modules"] button::-p-text(Keys)');
    await page.waitForSelector('.designer-layout');
    assert(await page.$('button::-p-text(Safe preview on)'), 'safe preview state is shared with the virtual deck');
    await page.click('button[title^="Tap:"]');
    assert.equal(await page.evaluate(() => window.nativeActions.length), 0, 'safe preview does not send virtual knob action');
    await page.click('button[aria-label="Settings"]');
    await page.waitForSelector('.settings-page');
    await page.click('button::-p-text(Welcome & tour)');
    await page.waitForSelector('[role="dialog"][aria-labelledby]');
    await page.keyboard.press('Escape');
    assert(await page.$('.settings-page #backup-restore button::-p-text(Download backup)'), 'backup tools are in Settings');
    assert.equal(await page.$('#workspace-rail #backup-restore'), null, 'backup removed from rail');
    await page.setViewport({ width: 480, height: 800 });
    // Close the overlaid rail to see the page at a narrow width.
    const toggle = await page.$('button[aria-controls="workspace-rail"]'); if (toggle && await toggle.evaluate(el => el.getAttribute('aria-expanded') === 'true')) await toggle.click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'settings page fits narrow window');
    await page.screenshot({ path: '/tmp/zero-settings.png' });
    assert.deepEqual(errors, []);
    console.log('settings: navigation, scale, failure, safe preview, welcome, backup and narrow layout passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
