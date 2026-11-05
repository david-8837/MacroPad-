// Optional: start Vite; provide CHROMIUM_PATH, PUPPETEER_CORE_PATH and AXE_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
const { resolveVk } = require('../electron/actionExecutor.cjs');
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context = await browser.createBrowserContext(), page = await context.newPage(), errors=[];
    page.on('pageerror', e => errors.push(String(e)));
    await page.setViewport({width:1280,height:900});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('kadowaz_guide_seen','1');
      window.sentActions=[]; window.electronAPI={execAction: async a => {window.sentActions.push(a);return {success:true}}};
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', {waitUntil:'load'});
    await page.$eval('nav[aria-label="Modules"] button::-p-text(Macros)',e=>e.click());
    await page.waitForSelector('[aria-label="On-screen macro keyboard"]');
    const keys=await page.$$eval('.macro-keyboard-key', buttons => buttons.map(b=>b.dataset.macroKey));
    for (const k of keys) assert.notEqual(resolveVk(k), null, `native executor supports on-screen key ${k}`);
    const press = async key => page.$eval(`[aria-label="Key ${key}"]`,e=>e.click());
    const stored=async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_macros_v2')))[0].actions;
    await press('Ctrl'); assert.equal(await page.$eval('[aria-label="Key Ctrl"]',e=>e.getAttribute('aria-pressed')),'true');
    await press('C'); await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length===1);
    assert.deepEqual((await stored())[0].keys,['Ctrl','C']);
    assert.equal(await page.$eval('[aria-label="Key Ctrl"]',e=>e.getAttribute('aria-pressed')),'false');
    await press('Win'); await press('Shift'); await press('S');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length===2);
    assert.deepEqual((await stored())[1].keys,['Shift','Win','S']);
    await press('Esc'); await press('Tab');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length===4);
    assert.deepEqual((await stored()).slice(2).map(a=>a.keys),[['Esc'],['Tab']]);
    await press('Alt'); await page.$eval('button::-p-text(Add modifiers as step)',e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length===5);
    assert.deepEqual((await stored())[4].keys,['Alt']);
    await press('Ctrl'); await page.focus('[aria-label="Type the keys you want to log"]'); await page.keyboard.down('Shift');await page.keyboard.press('b');await page.keyboard.up('Shift');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length===6);
    assert.deepEqual((await stored())[5].keys,['Ctrl','Shift','B']);
    await page.$eval('button[aria-label="Edit step 1"]',e=>e.click()); await press('Win'); await press('R');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions[0].value==='Win+R');
    assert.equal((await stored()).length,6,'editing replaces the step');
    assert.deepEqual((await stored())[0].keys,['Win','R']);
    // Keyboard activation of a virtual key records that key, not the Enter/Space used to activate it.
    await page.focus('[aria-label="Key A"]'); await page.keyboard.press('Space');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length===7);
    assert.deepEqual((await stored())[6].keys,['A']);
    assert.deepEqual(await page.evaluate(()=>window.sentActions),[], 'editing never sends OS actions');
    await page.addScriptTag({path:process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js')});
    const violations=await page.evaluate(async()=> (await axe.run('.macro-keyboard-scroll',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>v.id));
    assert.deepEqual(violations,[],'on-screen keyboard accessibility');
    for (const theme of ['light','dark']) {
      await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
      const clearColor = await page.$eval('button::-p-text(Clear All Steps)', e => getComputedStyle(e).color);
      assert.equal(clearColor, theme === 'dark' ? 'rgb(255, 170, 170)' : 'rgb(162, 51, 51)', `${theme}: clear action is red`);
      await page.setViewport({width:480,height:800});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,`${theme}: no page overflow`);
      assert.equal(await page.$eval('.macro-keyboard-scroll',e=>e.scrollWidth > e.clientWidth),true,'narrow keyboard scrolls independently');
    }
    await page.$eval('button::-p-text(Clear All Steps)', e => e.click());
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length === 0);
    assert.deepEqual(errors,[]);
    await context.close(); console.log('macro keyboard: key mapping, staged combinations, editing, no execution, accessibility and layout passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
