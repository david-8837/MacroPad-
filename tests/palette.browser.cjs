// Optional: start Vite; set CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert=require('node:assert/strict'); const puppeteer=require(process.env.PUPPETEER_CORE_PATH||'puppeteer-core');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try {for(const corrupt of [false,true]) {const context=await browser.createBrowserContext(), page=await context.newPage(), errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewport({width:1280,height:900});await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.evaluateOnNewDocument(corrupt=>{ if(corrupt)localStorage.setItem('kadowaz_deck','{broken'); window.savedBackup=null; const original=URL.createObjectURL; URL.createObjectURL=function(blob){blob.text().then(t=>window.savedBackup=t);return original.call(this,blob)}; HTMLAnchorElement.prototype.click=function(){}; },corrupt);
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5173/',{waitUntil:'load'});await page.waitForSelector('.designer-layout');
 const open=async()=>{await page.keyboard.down('Control');await page.keyboard.press('k');await page.keyboard.up('Control');await page.waitForSelector('[aria-label="Global Command Palette"] input');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Search commands')};
 await page.focus('.macropad-key');await open();await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
 assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('role')),'option','focus wraps inside dialog');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('[aria-label="Global Command Palette"]'));assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('macropad-key')),true,'focus returns');
 if (!corrupt) {
   await open(); await page.type('input[aria-label="Search commands"]','audio toggle master mute');
   await page.waitForSelector('button[role=option]::-p-text(Audio: Toggle Master Mute)');
   await page.$eval('button[role=option]::-p-text(Audio: Toggle Master Mute)',e=>e.click());
   await page.waitForFunction(()=>document.body.textContent.includes('[ACTION FAILED] Audio: Toggle Master Mute'));
   assert(!await page.evaluate(()=>document.body.textContent.includes('Master Mute Toggled')), 'missing native API is not success');
 }
 await open();await page.type('input[aria-label="Search commands"]','export backup');await page.waitForSelector('button[role=option]::-p-text(Export Backup to JSON)');await page.$eval('button[role=option]::-p-text(Export Backup to JSON)',e=>e.click());
 if(corrupt){await page.waitForFunction(()=>[...document.querySelectorAll('[role=status]')].some(e=>e.textContent.includes('temporary layout is not a backup')));assert.equal(await page.evaluate(()=>window.savedBackup),null);}
 else {await page.waitForFunction(()=>window.savedBackup!==null);const result=JSON.parse(await page.evaluate(()=>window.savedBackup));assert.equal(result.version,2);assert(result.extras);}
 assert.deepEqual(errors,[]);await context.close();console.log(`palette browser: focus, accessibility and ${corrupt?'blocked corrupt':'version-2'} export passed`);
}}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
