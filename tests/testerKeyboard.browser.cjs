// Optional: start Vite and provide CHROMIUM_PATH/PUPPETEER_CORE_PATH/AXE_CORE_PATH.
const assert=require('node:assert/strict');
const puppeteer=require(process.env.PUPPETEER_CORE_PATH||'puppeteer-core');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  const context=await browser.createBrowserContext(), page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.setViewport({width:1280,height:1000});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('kadowaz_guide_seen','1');window.sent=[];window.electronAPI={execAction:async a=>{window.sent.push(a);return {success:true}}}});
  await page.goto(process.env.APP_URL||'http://127.0.0.1:5173/',{waitUntil:'load'});
  await page.click('nav[aria-label="Modules"] button::-p-text(Tester)');await page.waitForSelector('[aria-label="Keyboard event visualizer"]');
  await page.waitForFunction(()=>document.activeElement?.matches('main[tabindex="-1"]'));
  const originalDeck=await page.evaluate(()=>localStorage.getItem('kadowaz_deck'));
  const a='[data-code="KeyA"]'; const rect=await page.$eval(a,e=>{const r=e.getBoundingClientRect();return [r.width,r.height]});
  await page.keyboard.down('a');await page.waitForFunction(()=>document.querySelector('[data-code="KeyA"]')?.dataset.state==='held');
  assert.deepEqual(await page.$eval(a,e=>{const r=e.getBoundingClientRect();return [r.width,r.height]}),rect,'held key does not shift geometry');
  await page.keyboard.down('a'); await page.keyboard.up('a');
  await page.waitForFunction(()=>document.querySelector('[data-code="KeyA"]')?.dataset.state==='tested');
  assert.match(await page.$eval(a,e=>e.textContent),/1x/,'repeat is not a new press');
  assert.match(await page.$eval('[aria-label="Observed key codes"]',e=>e.textContent),/1 OS repeats/);
  assert(await page.$('[aria-label="KeyA, 1 press"]'));
  await page.keyboard.down('Shift');await page.waitForFunction(()=>document.querySelector('[data-code="ShiftLeft"]')?.dataset.state==='held');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur'))); await page.waitForFunction(()=>document.querySelector('[data-code="ShiftLeft"]')?.dataset.state==='tested');await page.keyboard.up('Shift');
  await page.$eval('[aria-label="Keyboard layout"] button::-p-text(TKL)',e=>e.click());
  assert.equal(await page.$('[data-code="Numpad1"]'),null);assert(await page.$('[data-code="ArrowUp"]'));
  assert(await page.$('[aria-label="KeyA, 1 press"]'),'observed data survives layout switch');
  await page.$eval('[aria-label="Keyboard layout"] button::-p-text(60%)',e=>e.click());
  assert.equal(await page.$('[data-code="ArrowUp"]'),null);
  await page.$eval('[aria-label="Keyboard layout"] button::-p-text(Full size)',e=>e.click());assert(await page.$('[data-code="Numpad1"]'));
  await page.addScriptTag({path:process.env.AXE_CORE_PATH||require.resolve('axe-core/axe.min.js')});
  for(const [width,theme] of [[1280,'light'],[800,'light'],[480,'light'],[480,'dark'],[320,'dark']]) {
   await page.setViewport({width,height:900});await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}: no page overflow`);
   const metrics=await page.$eval('.tester-main-scroll',e=>({scroll:e.scrollWidth,client:e.clientWidth}));
   if(width>=480) assert.equal(metrics.scroll,metrics.client,`${width}: main keys fit`);
   else assert(metrics.scroll>metrics.client,'very narrow window keeps accessible horizontal scroll');
   const clipped=await page.$$eval('.tester-key-legend',els=>els.filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.parentElement.dataset.code));
   assert.deepEqual(clipped,[],`${width}: legends must not be truncated`);
   const issues=await page.evaluate(async()=> (await axe.run('[aria-label="Keyboard event visualizer"]',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>v.id));
   assert.deepEqual(issues,[],`${width} ${theme}: accessibility`);
  }
  await page.focus('.tester-main-scroll');const allowed=await page.evaluate(()=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',code:'ArrowRight',bubbles:true,cancelable:true})));
  assert.equal(allowed,true,'scrollable key rows retain arrow navigation');
  await page.$eval('button::-p-text(Reset events)',e=>e.click());
  await page.waitForFunction(()=>document.querySelector('[data-code="KeyA"]')?.dataset.state==='idle');
  assert.match(await page.$eval('[aria-label="Observed key codes"]',e=>e.textContent),/No key events yet/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('kadowaz_deck')),originalDeck,'tester does not change the deck');
  assert.deepEqual(await page.evaluate(()=>window.sent),[],'tester never triggers pad actions');assert.deepEqual(errors,[]);
  await context.close();console.log('tester keyboard: responsive readable labels, held/released/repeat events, layouts, reset and accessibility passed');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
