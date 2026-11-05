// Start Vite and provide CHROMIUM_PATH and PUPPETEER_CORE_PATH.
// Hold a real lazy chunk to exercise slow navigation without fake timers.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const page = await browser.newPage(), errors=[];
    page.on('pageerror', e=>errors.push(String(e)));
    await page.setViewport({width:1280,height:900});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(()=>localStorage.setItem('kadowaz_guide_seen','1'));
    let release, held; const heldPromise=new Promise(resolve=>held=resolve);
    const gate=new Promise(resolve=>release=resolve);
    await page.setRequestInterception(true);
    page.on('request', request=>{
      if (/ViaMacroEditor(?:\.tsx|-[\w-]+\.js)/.test(request.url())) { held(request.url()); gate.then(()=>request.continue()).catch(()=>{}); }
      else request.continue().catch(()=>{});
    });
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForSelector('.designer-layout');
    await page.click('nav[aria-label="Modules"] button::-p-text(Macros)');
    const delayedUrl=await Promise.race([heldPromise,new Promise((_,reject)=>setTimeout(()=>reject(new Error('Macro chunk was not requested')),5000))]);
    await page.waitForSelector('[role="status"]', {timeout:5000});
    assert(await page.$('.designer-layout'), 'current page stays visible while real code loads');
    assert.equal(await page.$eval('nav button::-p-text(Keys)',e=>e.closest('button').getAttribute('aria-current')),'true');
    assert(!await page.evaluate(()=>document.body.innerText.includes('Loading page')), 'no page loading screen');
    await page.click('nav[aria-label="Modules"] button::-p-text(Keys)');
    const downloaded=page.waitForResponse(response=>response.url()===delayedUrl);
    release(); await downloaded;
    await new Promise(resolve=>setTimeout(resolve,200));
    assert(await page.$('.designer-layout'), 'latest tab choice cancels the older pending navigation');
    assert.equal(await page.$eval('nav button::-p-text(Keys)',e=>e.closest('button').getAttribute('aria-current')),'true');
    await page.click('nav[aria-label="Modules"] button::-p-text(Macros)');
    await page.waitForFunction(()=>document.body.innerText.includes('VIA Macro Studio'));
    assert.equal(await page.$eval('nav button::-p-text(Macros)',e=>e.closest('button').getAttribute('aria-current')),'true');
    assert.deepEqual(errors,[]);
    console.log('navigation: real delayed chunk, current page retained, cancellation and navigation passed');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
