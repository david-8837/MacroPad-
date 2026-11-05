// Start Vite and supply CHROMIUM_PATH/PUPETEER_CORE_PATH. Accelerate animation
// time only in this test so the real cursor timeline can complete quickly.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setViewport({ width: 1360, height: 1200 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kadowaz_guide_seen', '1');
      localStorage.removeItem('kadowaz_deck');
      localStorage.setItem('kadowaz_opening_animation', 'on');
      const now = performance.now.bind(performance);
      performance.now = () => now() * 4;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = callback => raf(time => callback(time * 4));
      window.cursorLabels = [];
      new MutationObserver(records => records.forEach(record => {
        const el = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
        const label = el?.closest?.('[data-selection-label]');
        if (label?.textContent) window.cursorLabels.push(label.textContent);
      })).observe(document, { childList: true, characterData: true, subtree: true });
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'load' });
    await page.waitForSelector('.intro-overlay');
    for (const selector of ['.intro-preview-tools', '.intro-preview-feedback', '[aria-label="Empty layer keys"]']) {
      assert.equal(await page.$eval(selector, e => e.style.opacity), '0', `${selector} must not appear before its cursor`);
    }
    await page.waitForFunction(() => !document.documentElement.classList.contains('intro-running'), { timeout: 12000 });
    const labels = await page.evaluate(() => window.cursorLabels);
    for (const label of ['Empty layer frame', 'Assign key', 'Preview frame', 'Safe preview', 'Edit history', 'Feedback frame']) {
      assert(labels.includes(label), `cursor must visit ${label}: ${JSON.stringify(labels)}`);
    }
    for (const selector of ['.intro-preview-tools', '.intro-preview-feedback', '[aria-label="Empty layer keys"]']) {
      assert.equal(await page.$eval(selector, e => e.style.opacity), '', `${selector} must be restored after the intro`);
    }
    const brandIcon = await page.$eval('.navbar-brand img.brand-mark', img => ({
      loaded: img.complete && img.naturalWidth > 0, alt: img.getAttribute('alt'), hidden: img.getAttribute('aria-hidden'),
      width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height,
    }));
    assert.deepEqual(brandIcon, { loaded: true, alt: '', hidden: 'true', width: 24, height: 24 }, 'the existing ZERO icon loads at the correct size after the intro');
    assert.equal(await page.$eval('.workspace-rail > div:first-child > span', e => e.textContent), 'Your setup');
    const sidebarCopy = await page.$eval('.workspace-rail > div:first-child > p', e => ({ text: e.textContent.trim(), fits: e.scrollWidth <= e.clientWidth }));
    assert.equal(sidebarCopy.text, 'Choose a layer, assign actions to your keys and knob, then try them on the virtual pad. Saved on this PC. Upload to apply to your macropad.');
    assert(sidebarCopy.fits, 'sidebar guidance wraps without horizontal overflow');
    assert.deepEqual(errors, []);
    console.log('intro: cursors build the three added elements and restore them afterwards');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
