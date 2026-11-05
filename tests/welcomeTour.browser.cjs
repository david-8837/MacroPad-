// Start Vite and provide CHROMIUM_PATH, PUPPETEER_CORE_PATH and AXE_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
const axePath = process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js');
const url = process.env.APP_URL || 'http://127.0.0.1:5173/';
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const page=await browser.newPage(), errors=[]; page.on('pageerror',e=>errors.push(String(e)));
    await page.setViewport({width:1280,height:900});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto(url,{waitUntil:'load'});
    await page.waitForSelector('[aria-labelledby="welcome-title"]');
    assert.match(await page.$eval('#welcome-title',e=>e.textContent),/Welcome to ZERO/);
    assert.equal(await page.$eval('.app-shell',e=>e.inert),true,'background must be inert');
    assert.equal(await page.evaluate(()=>document.activeElement.id),'welcome-title','heading gets focus');
    assert.equal(await page.$eval('.welcome-dialog', e=>getComputedStyle(e).animationName),'none','reduced motion disables the entrance');
    assert.equal(await page.$eval('.welcome-key', e=>getComputedStyle(e).animationName),'none','reduced motion disables key effects');
    assert.equal(await page.evaluate(()=>localStorage.getItem('kadowaz_welcome_pending')),'1');
    await page.reload({waitUntil:'load'}); await page.waitForSelector('[aria-labelledby="welcome-title"]');
    await page.addScriptTag({path:axePath});
    const violations=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
    assert.deepEqual(violations.violations.map(v=>v.id),[], 'welcome accessibility');
    await page.click('.welcome-primary'); await page.waitForFunction(()=>document.querySelector('#welcome-title')?.textContent === 'Make it yours');
    assert.match(await page.$eval('.welcome-description',e=>e.textContent),/Choose a layer/);
    await page.click('.welcome-primary'); await page.waitForFunction(()=>document.querySelector('#welcome-title')?.textContent === 'Try it, then upload');
    assert.match(await page.$eval('.welcome-description',e=>e.textContent),/Safe preview/);
    await page.click('.welcome-secondary'); assert.equal(await page.$eval('#welcome-title',e=>e.textContent),'Make it yours');
    await page.click('.welcome-primary');
    await page.keyboard.press('Tab'); await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift');
    assert(await page.evaluate(()=>!!document.activeElement.closest('[role="dialog"]')), 'keyboard focus remains in dialog');
    await page.click('.welcome-primary'); await page.waitForSelector('[aria-labelledby="welcome-title"]',{hidden:true});
    assert.equal(await page.$eval('.app-shell',e=>e.inert),false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('kadowaz_guide_seen')),'1');
    assert.equal(await page.evaluate(()=>localStorage.getItem('kadowaz_welcome_pending')),null);
    await page.reload({waitUntil:'load'}); assert.equal(await page.$('[aria-labelledby="welcome-title"]'),null,'does not repeat once dismissed');
    await page.click('button[aria-label="Help & About"]');
    await page.click('button::-p-text(Welcome & quick tour)'); await page.waitForSelector('[aria-labelledby="welcome-title"]');
    await page.keyboard.press('Escape'); await page.waitForSelector('[aria-labelledby="welcome-title"]',{hidden:true});
    assert.equal(await page.$eval('.app-shell',e=>e.inert),false);
    for (const [width,height] of [[320,480],[480,320],[900,600]]) {
      await page.setViewport({width,height});
      await page.$eval('button[aria-label="Help & About"]',e=>e.click());
      await page.$eval('button::-p-text(Welcome & quick tour)',e=>e.click());
      await page.waitForSelector('[aria-labelledby="welcome-title"]');
      const rect=await page.$eval('.welcome-dialog',e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,scroll:e.scrollHeight,client:e.clientHeight}});
      assert(rect.left>=0 && rect.right<=width && rect.top>=0 && rect.bottom<=height, `${width}x${height}: dialog fits ${JSON.stringify(rect)}`);
      await page.$eval('button[aria-label="Close welcome"]',e=>e.click());
    }
    assert.deepEqual(errors,[]);
    await page.close();
    // Intro stays visible and interactive first; the welcome waits for it to finish.
    const freshContext=await browser.createBrowserContext();
    const intro=await freshContext.newPage(); await intro.setViewport({width:1280,height:900});
    await intro.goto(url,{waitUntil:'load'}); await intro.waitForSelector('.intro-overlay');
    assert.equal(await intro.$('[aria-labelledby="welcome-title"]'),null,'welcome must not cover intro');
    await intro.click('.intro-skip'); await intro.waitForSelector('[aria-labelledby="welcome-title"]');
    assert.equal(await intro.$('.intro-overlay'),null);
    assert.equal(await intro.$eval('.welcome-dialog',e=>getComputedStyle(e).animationName),'welcome-card-in','card animates when motion is allowed');
    assert.equal(await intro.$eval('.welcome-key',e=>getComputedStyle(e).animationName),'welcome-key-in','illustrated keys animate');
    assert.equal(await intro.$eval('.welcome-art-footer span:last-child',e=>e.textContent),'01 — 03');
    await intro.click('.welcome-primary');
    await intro.waitForFunction(()=>document.querySelector('#welcome-title')?.textContent === 'Make it yours');
    assert.equal(await intro.evaluate(()=>document.activeElement.id),'welcome-title','step changes keep accessible focus');
    assert.equal(await intro.$eval('.welcome-art-footer span:last-child',e=>e.textContent),'02 — 03');
    assert.equal(await intro.$eval('.welcome-content h2',e=>getComputedStyle(e).animationName),'welcome-detail-in','tour content animates on step change');
    await intro.click('.welcome-primary');
    await intro.waitForFunction(()=>document.querySelector('#welcome-title')?.textContent === 'Try it, then upload');
    assert.equal(await intro.$eval('.welcome-art-footer span:last-child',e=>e.textContent),'03 — 03');
    await freshContext.close();
    console.log('welcome tour: first run, intro, persistence, keyboard, replay, accessibility and layouts passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
