// Browser simulation checks header layout; it cannot test Windows native snapping.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH, headless:true, args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    for (const width of [480, 600, 683, 900, 1280, 1920]) {
      const page = await browser.newPage(), errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.setViewport({width,height:800});
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      await page.evaluateOnNewDocument(() => { window.electronAPI = {nativeWindowControls:true}; });
      await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', {waitUntil:'load'});
      await page.waitForSelector('.app-header--native-controls');
      const dismiss = await page.$('button::-p-text(Dismiss)');
      if (dismiss) await dismiss.click();
      const metrics = await page.$eval('.app-header', header => {
        const rect = e => {const r = e.getBoundingClientRect(); return {left:r.left,right:r.right,width:r.width,height:r.height};};
        return {header:rect(header), layout:rect(header.querySelector('.navbar-layout')), actions:rect(header.querySelector('.navbar-actions'))};
      });
      assert.equal(metrics.header.height, width <= 600 ? 80 : 64, 'native overlay adds no extra title bar');
      assert(metrics.layout.width > 150 && metrics.layout.right <= width - 130, `${width}: reserve caption space ${JSON.stringify(metrics)}`);
      assert(metrics.actions.left >= 0 && metrics.actions.right <= metrics.layout.right+1, `${width}: actions stay in safe area ${JSON.stringify(metrics)}`);
      assert.equal(await page.$('[aria-label="Maximize or restore window"]'), null, 'custom caption buttons not duplicated');
      await page.click('[aria-label="Connect macropad"]');
      assert.equal(await page.$eval('[aria-label="Connect macropad"]', e => e.getAttribute('aria-expanded')), 'true');
      assert.deepEqual(errors, []);
      await page.close();
      console.log(`native header simulation: ${width}px passed`);
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode=1; });
