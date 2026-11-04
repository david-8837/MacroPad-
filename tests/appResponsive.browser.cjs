// Optional real-browser layout test. Start Vite first, then set CHROMIUM_PATH
// and install puppeteer-core separately (or set PUPPETEER_CORE_PATH).
// Example: APP_URL=http://127.0.0.1:5173 CHROMIUM_PATH=/path/to/chrome node tests/appResponsive.browser.cjs
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
const url = process.env.APP_URL || 'http://127.0.0.1:5173/';
if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a compatible Chromium executable');

(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH,
    headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const [width, height, scale] of [[480, 320, 1], [512, 384, 2], [683, 384, 2],
      [900, 600, 1], [1092, 614, 1], [1259, 700, 1], [1260, 720, 1],
      [1280, 720, 1], [1536, 864, 1], [1920, 1080, 1]]) {
      const page = await browser.newPage();
      await page.setViewport({ width, height, deviceScaleFactor: scale });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.designer-layout');
      const dismiss = await page.$('button::-p-text(Dismiss)');
      if (dismiss) await dismiss.click();
      const measure = selector => page.$eval(selector, e => {
        const r = e.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, display: getComputedStyle(e).display };
      });
      for (const selector of ['.startup-deck-chassis', '.startup-deck-controls', '.designer-inspector', '.navbar-actions']) {
        const r = await measure(selector);
        assert(r.width > 0 && r.left >= -1 && r.right <= width + 1, `${width}x${height}: ${selector} clipped: ${JSON.stringify(r)}`);
      }
      // Scrolling must actually make the stacked inspector reachable.
      await page.$eval('.designer-inspector', e => e.scrollIntoView({ block: 'start' }));
      const inspector = await measure('.designer-inspector');
      assert(inspector.top < height && inspector.bottom > 0, `${width}x${height}: inspector cannot be scrolled into view`);
      // The layer rail is reachable on both stacked and desktop layouts.
      if (width <= 1259) {
        await page.click('[aria-controls="workspace-rail"]');
        assert.notEqual((await measure('.workspace-rail')).display, 'none');
        await page.click('[aria-controls="workspace-rail"]');
      } else assert.notEqual((await measure('.workspace-rail')).display, 'none');
      await page.$eval('.startup-deck-controls', e => e.scrollIntoView({ block: 'center' }));
      const config = await page.$('.startup-deck-controls .panel:nth-child(2) button');
      assert(config, 'key configuration button exists');
      await config.click();
      await page.waitForSelector('.designer-inspector--editing');
      const drawer = await measure('.designer-inspector--editing');
      assert(drawer.left >= -1 && drawer.right <= width + 1 && drawer.height > 0,
        `${width}x${height}: editor clipped: ${JSON.stringify(drawer)}`);
      const close = await page.waitForSelector('button[title="Close Drawer"]');
      assert(close, 'key editor close button exists');
      await close.click();
      // A real click scrolls horizontally clipped tabs into view.
      const tabs = await page.$$('nav[aria-label="Modules"] button');
      assert.equal(tabs.length, 6);
      for (const tab of tabs) await tab.click();
      await page.close();
      console.log(`responsive browser: ${width}x${height} at device scale ${scale} passed`);
    }
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
