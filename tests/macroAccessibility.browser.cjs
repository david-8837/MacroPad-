// Optional: start Vite; set CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert=require('node:assert/strict');const puppeteer=require(process.env.PUPPETEER_CORE_PATH||'puppeteer-core');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{const page=await browser.newPage(), errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.goto(process.env.APP_URL||'http://127.0.0.1:5173/',{waitUntil:'load'});await page.$eval('nav[aria-label="Modules"] button::-p-text(Macros)',e=>e.click());await page.waitForSelector('[aria-label="Type the keys you want to log"]');
 await page.focus('button[title^="Saves the macro library"]');await page.keyboard.press('Space');await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Saved'));
 let saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_macros_v2')));assert.equal(saved[0].actions.length,0,'button activation does not record Space');
 await page.focus('[aria-label="Type the keys you want to log"]');await page.keyboard.down('Control');await page.keyboard.press('c');await page.keyboard.up('Control');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_macros_v2'))[0].actions.length===1);
 saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_macros_v2')));assert.deepEqual(saved[0].actions[0].keys,['Ctrl','C']);
 await page.keyboard.down('Control');await page.keyboard.press('k');await page.keyboard.up('Control');await page.waitForSelector('[aria-label="Global Command Palette"]');
 saved=JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_macros_v2')));assert.equal(saved[0].actions.length,1,'palette shortcut not recorded');assert.deepEqual(errors,[]);
 console.log('macro browser: button keyboard access, focused capture and palette shortcut passed');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
