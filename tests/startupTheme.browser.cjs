// Pause the real editor entry so we can inspect the visible loading screen.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    for (const [theme, background] of [['light', 'rgb(255, 255, 255)'], ['dark', 'rgb(23, 27, 34)']]) {
      const context = await browser.createBrowserContext(); const page = await context.newPage();
      await page.evaluateOnNewDocument(value => { localStorage.setItem('kadowaz_app_theme', value); localStorage.setItem('kadowaz_guide_seen','1'); localStorage.setItem('kadowaz_opening_animation','off'); }, theme);
      await page.setRequestInterception(true);
      let release, gotEntry; const gate = new Promise(resolve => release = resolve); const intercepted = new Promise(resolve => gotEntry = resolve);
      page.on('request', request => {
        if (request.url().includes('/src/main.tsx')) { gotEntry(); gate.then(() => request.continue()).catch(() => {}); }
        else request.continue().catch(() => {});
      });
      const navigation = page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
      await intercepted; await page.waitForSelector('#startup-screen');
      assert.equal(await page.$eval('#startup-screen', el => getComputedStyle(el).backgroundColor), background, `${theme} loading screen uses chosen theme`);
      assert.equal(await page.$eval('#startup-status', el => el.textContent), 'Loading the editor…');
      release(); await navigation; await page.waitForSelector('#startup-screen', { hidden:true });
      await context.close();
    }
    console.log('startup theme: real loading screen matches saved light and dark choices');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
