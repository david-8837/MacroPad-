// Optional: start Vite; set CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert=require('node:assert/strict'), fs=require('node:fs'), os=require('node:os'), path=require('node:path');
const puppeteer=require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const file=path.join(os.tmpdir(),`zero-settings-${process.pid}.json`);
 try {
  const context=await browser.createBrowserContext(), page=await context.newPage(), errors=[]; page.on('pageerror',e=>errors.push(String(e)));
  await page.setViewport({width:1400,height:900}); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  await page.evaluateOnNewDocument(()=>{localStorage.setItem('kadowaz_oled','{bad-screen');localStorage.setItem('kadowaz_lighting','{bad-lights');});
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/',{waitUntil:'load'}); await page.waitForSelector('.designer-layout');
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Saved screen settings could not be read')));
  assert.equal(await page.evaluate(()=>localStorage.getItem('kadowaz_oled')),'{bad-screen');
  await page.$eval('nav[aria-label="Modules"] button::-p-text(Lighting)',e=>e.click());
  await page.waitForFunction(()=>[...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Saved lighting settings could not be read')));
  await page.waitForSelector('button::-p-text(Breath)'); await page.$eval('button::-p-text(Breath)',e=>e.click());
  assert.equal(await page.evaluate(()=>localStorage.getItem('kadowaz_lighting')),'{bad-lights');
  // Explicit version-2 restore recovers both settings and re-enables future saves.
  await page.$eval('nav[aria-label="Modules"] button::-p-text(Keys)',e=>e.click()); await page.waitForSelector('.designer-layout');
  const deck=JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_deck')));
  const oled={mode:'kadowaz',customTitle:'RECOVERED',brightness:30,inverted:false,autoCycleS:30,playlist:['kadowaz']};
  const ch={mode:1,brightness:100,speed:80,r:1,g:2,b:3,perKey:Array.from({length:9},()=>[0,0,0]),perKeyMask:0};
  const lighting={version:1,channels:Array.from({length:4},()=>structuredClone(ch))};
  fs.writeFileSync(file,JSON.stringify({format:'kadowaz-macropad-backup',version:2,deck,presetLibrary:{version:1,overrides:{},custom:[]},extras:{macros:[],oled,lighting}}));
  await page.$eval('summary::-p-text(Backup & restore)',e=>e.click()); await (await page.$('input[type=file][accept*=json]')).uploadFile(file);
  await page.waitForSelector('[aria-label="Confirm backup restore"]'); await page.$eval('button::-p-text(Confirm restore)',e=>e.click());
  await page.waitForFunction(()=>![...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Saved screen settings could not be read')));
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_oled'))).customTitle,'RECOVERED');
  await page.$eval('nav[aria-label="Modules"] button::-p-text(Lighting)',e=>e.click());
  await page.waitForFunction(()=>![...document.querySelectorAll('[role=alert]')].some(e=>e.textContent.includes('Saved lighting settings could not be read')));
  await page.waitForSelector('button::-p-text(Breath)'); await page.$eval('button::-p-text(Breath)',e=>e.click());
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_lighting')).channels[0].mode !== 1);
  assert.deepEqual(errors,[]); await context.close(); console.log('settings storage browser: corrupt settings preserved; version 2 restore and subsequent saves succeed');
 } finally {try{fs.unlinkSync(file)}catch{} await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
