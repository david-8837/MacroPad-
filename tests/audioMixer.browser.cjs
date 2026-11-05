// Optional actual-browser mixer test. Start Vite and set CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
if (!process.env.CHROMIUM_PATH) throw new Error('Set CHROMIUM_PATH to a compatible Chromium executable');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  try {
    for (const [width, height] of [[480, 320], [683, 384], [1280, 720]]) {
      const page = await browser.newPage(); await page.setViewport({ width, height });
      await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
      await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kadowaz_guide_seen', '1');
        window.audioCalls = [];
        window.electronAPI = {
          getMasterVolume: async () => ({ ok: true, value: 50 }),
          getMasterMute: async () => ({ ok: true, value: false }),
          getMic: async () => ({ ok: true, value: { level: 65, muted: false } }),
          setMasterVolume: async value => { window.audioCalls.push(value); return { ok: true, value }; },
          setMic: async () => ({ ok: true }),
          toggleMasterMute: async () => ({ ok: true, value: true }),
        };
      });
      await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('.designer-layout');
      const dismiss = await page.$('button::-p-text(Dismiss)'); if (dismiss) await dismiss.click();
      await page.$eval('.designer-inspector', el => el.scrollIntoView({ block: 'start' }));
      const summary = await page.$('summary::-p-text(Audio mixer)'); assert(summary); await summary.click();
      await page.waitForSelector('input[aria-label="Master Output volume"]:not([disabled])');
      for (const name of ['Master Output volume', 'Microphone volume']) {
        const input = await page.$(`input[aria-label="${name}"]`);
        const rect = await input.boundingBox();
        assert(rect && rect.width >= 120 && rect.height >= 24, `${width}x${height} ${name} too small: ${JSON.stringify(rect)}`);
        assert(rect.x >= 0 && rect.x + rect.width <= width + 1, `${name} clipped`);
        console.log(`${width}x${height} ${name}: ${Math.round(rect.width)} × ${Math.round(rect.height)} px`);
      }
      await page.focus('input[aria-label="Master Output volume"]'); await page.keyboard.press('ArrowRight');
      await page.waitForFunction(() => window.audioCalls.includes(51));
      assert.equal(await page.$eval('input[aria-label="Master Output volume"]', el => el.value), '51');
      await page.$eval('input[aria-label="Master Output volume"]', el => el.scrollIntoView({ block: 'center' }));
      const track = await (await page.$('input[aria-label="Master Output volume"]')).boundingBox();
      await page.mouse.move(track.x + track.width * 0.52, track.y + track.height / 2);
      await page.mouse.down();
      await page.mouse.move(track.x + track.width * 0.8, track.y + track.height / 2, { steps: 5 });
      await page.mouse.up();
      await page.waitForFunction(() => window.audioCalls.some(v => v >= 75));
      const finalValue = await page.$eval('input[aria-label="Master Output volume"]', el => Number(el.value));
      assert(finalValue >= 75, `pointer drag changes volume (got ${finalValue})`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode = 1; });
