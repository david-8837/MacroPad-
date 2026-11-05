// Optional: start Vite and set CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict'); const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({ executablePath:process.env.CHROMIUM_PATH, headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  const file = path.join(os.tmpdir(),`zero-extended-backup-${process.pid}.json`);
  try {
    const page = await browser.newPage(), errors=[]; page.on('pageerror',e=>errors.push(String(e)));
    await page.setViewport({width:1400,height:900}); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>localStorage.getItem('kadowaz_deck') && localStorage.getItem('kadowaz_oled'));
    const deck = JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_deck')));
    deck.layers[0].keys[0].tapAction={id:'macro-0',name:'Macro M0',category:'macro',payload:{macroId:0}};
    const macros = [{id:0,name:'Restored macro',actions:[{id:'s1',type:'text',value:'hello'}]}];
    const oled = {mode:'kadowaz',customTitle:'RESTORED',customSubtitle:'SAFE',brightness:42,inverted:false,autoCycleS:30,playlist:['kadowaz']};
    const channel = {mode:1,brightness:123,speed:80,r:1,g:2,b:3,perKey:Array.from({length:9},()=>[0,0,0]),perKeyMask:0};
    const lighting = {version:1,channels:Array.from({length:4},()=>structuredClone(channel))};
    const backup = {format:'kadowaz-macropad-backup',version:2,deck,presetLibrary:{version:1,overrides:{},custom:[]},extras:{macros,oled,lighting}};
    fs.writeFileSync(file, JSON.stringify(backup));
    await page.$$eval('.macropad-key', keys => keys[0].click());
    await page.$eval('button[title^="KC_A —"]', e => e.click());
    await page.waitForFunction(() => !document.querySelector('[aria-label="Layout edit history"] button')?.disabled);
    await page.$eval('button[aria-label="Settings"]',el=>el.click()); await page.waitForSelector('#backup-restore');
    const input=await page.$('input[type="file"][accept*="json"]'); await input.uploadFile(file);
    await page.waitForSelector('[aria-label="Confirm backup restore"]');
    assert.match(await page.$eval('[aria-label="Confirm backup restore"]',el=>el.textContent),/macros, screen and lighting/);
    await page.$eval('button::-p-text(Confirm restore)',el=>el.click());
    await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent.includes('Restored in the app'));
    await page.$eval('nav[aria-label="Modules"] button::-p-text(Keys)',el=>el.click());
    await page.waitForSelector('[aria-label="Layout edit history"]');
    assert.equal(await page.$eval('[aria-label="Layout edit history"] button::-p-text(Undo)', e => e.disabled), true, 'restore clears layout history');
    for(const [key, expected] of [['kadowaz_deck',deck],['kadowaz_macros_v2',macros],['kadowaz_oled',oled],['kadowaz_lighting',lighting]])
      assert.deepEqual(JSON.parse(await page.evaluate(k=>localStorage.getItem(k),key)),expected,key);
    await page.$eval('nav[aria-label="Modules"] button::-p-text(Macros)',el=>el.click());
    await page.waitForFunction(()=>document.body.textContent.includes('Restored macro'));
    assert.deepEqual(errors,[]); console.log('backup browser: version 2 restore preserves macro bindings, macros, screen and lighting');
  } finally { try {fs.unlinkSync(file);} catch {} await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
