// Optional: start static website on port 5174, set CHROMIUM_PATH/PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  try {
    for (const width of [390, 1280]) {
      const context = await browser.createBrowserContext(); const page = await context.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.setRequestInterception(true);
      page.on('request', req => req.url() === 'https://api.web3forms.com/submit' ? req.abort() : req.continue());
      await page.setViewport({ width, height: 800 }); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      const base = process.env.WEBSITE_URL || 'http://127.0.0.1:5174';
      await page.goto(`${base}/home/`, {waitUntil:'load'});
      await page.$eval('.layer-buttons button[data-layer="2"]', el => el.click());
      assert.match(await page.$eval('#display-layer', el => el.textContent), /LAYER 2/);
      await page.$eval('.mock-keys button:nth-child(2)', el => el.click());
      assert.equal(await page.$eval('.mock-keys button:nth-child(2)', el => el.getAttribute('aria-pressed')), 'true');
      await page.$eval('.faq-item summary', el => el.click()); assert.equal(await page.$eval('.faq-item', el => el.open), true);
      await page.$eval('#feedback-message', el => { el.value = 'Test feedback'; el.dispatchEvent(new Event('input', {bubbles:true})); });
      await page.$eval('.feedback-submit', el => el.click());
      await page.waitForFunction(() => /could not confirm|not connected|not been sent/i.test(document.querySelector('.feedback-status').textContent));
      assert.match(await page.$eval('.feedback-status', el => el.textContent), /could not confirm|not connected|not been sent/i);
      assert.equal(await page.$eval('#feedback-message', el => el.value), 'Test feedback');
      await page.goto(`${base}/cases/`, {waitUntil:'load'});
      assert.equal(await page.$$eval('.case-sale-info button', buttons => buttons.filter(b => b.disabled).length), 2);
      assert.equal(await page.$$eval('.case-sale-price', els => els.every(e => e.textContent.includes('150'))), true);
      await page.reload({waitUntil:'load'}); await page.waitForFunction(() => location.pathname.endsWith('/home/'));
      assert.deepEqual(errors, []); await context.close(); console.log(`website browser: ${width}px preview, FAQ, feedback, cases and reload passed`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
