// Start Vite and set CHROMIUM_PATH / PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setViewport({width:1280,height:720});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kadowaz_guide_seen', '1');
      window.__actions = [];
      window.electronAPI = {execAction: async action => {
        window.__actions.push(action);
        if (action.actionName === 'Brighten') return {success:true,brightness:60};
        if (action.actionName === 'At limit') return {success:true,brightness:100,brightnessAtLimit:true};
        return {success:false,error:'The display did not respond. '.repeat(30)};
      }};
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', {waitUntil:'load'});
    await page.waitForFunction(() => localStorage.getItem('kadowaz_deck'));
    await page.evaluate(() => {
      const d=JSON.parse(localStorage.getItem('kadowaz_deck'));
      for (const [i,name] of ['Brighten','At limit','Failure'].entries()) d.layers[0].keys[i].tapAction={id:name,name,category:'media',payload:{mediaAction:'brightness_up'}};
      localStorage.setItem('kadowaz_deck',JSON.stringify(d));
    });
    await page.reload({waitUntil:'load'}); await page.waitForSelector('.macropad-key');
    await page.$$eval('.macropad-key', e => e[0].click());
    await page.waitForSelector('[data-brightness-indicator]');
    assert.match(await page.$eval('[data-brightness-indicator]',e=>e.textContent), /Brightness 60%.*Requested display level/s);
    assert.match(await page.$eval('[aria-label="Virtual action feedback"]',e=>e.textContent), /brightness 60% requested/);
    await page.$$eval('.macropad-key', e => e[1].click());
    await page.waitForFunction(() => document.querySelector('[data-brightness-indicator]')?.textContent.includes('100%'));
    assert.match(await page.$eval('[data-brightness-indicator]',e=>e.textContent), /Already at this limit/);
    await page.waitForFunction(() => !document.querySelector('[data-brightness-indicator]'), {timeout:5000});
    await page.$$eval('.macropad-key', e => e[2].click());
    await page.waitForFunction(() => document.querySelector('[aria-label="Virtual action feedback"]')?.textContent.includes('did not respond'));
    assert.equal(await page.$('[data-brightness-indicator]'), null, 'no success indicator for failure');
    const geometry = await page.evaluate(() => {
      const f=document.querySelector('[aria-label="Virtual action feedback"]').getBoundingClientRect();
      const t=document.querySelector('.startup-keycode-tray').getBoundingClientRect();
      return {bottom:f.bottom, trayTop:t.top, h:f.height};
    });
    assert(geometry.h>40 && geometry.bottom <= geometry.trayTop + 1, `long error must not overlap tray ${JSON.stringify(geometry)}`);
    await page.$eval('button::-p-text(Safe preview off)', e=>e.click());
    const calls=await page.evaluate(()=>window.__actions.length);
    await page.$$eval('.macropad-key',e=>e[0].click());
    assert.equal(await page.evaluate(()=>window.__actions.length),calls);
    assert.equal(await page.$('[data-brightness-indicator]'), null, 'safe preview never claims the display changed');
    assert.deepEqual(errors, []);
    console.log('brightness browser: popup, limits, error wrapping and safe preview passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
