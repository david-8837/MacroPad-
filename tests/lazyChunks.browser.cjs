// Optional built-app test: npm run build; npm run preview -- --host 0.0.0.0 --port 5175
const assert=require('node:assert/strict'); const puppeteer=require(process.env.PUPPETEER_CORE_PATH||'puppeteer-core');
(async()=>{const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {const url=process.env.APP_URL||'http://127.0.0.1:5175/'; const page=await browser.newPage(), requests=[], errors=[];
 page.on('request',r=>requests.push(r.url()));page.on('pageerror',e=>errors.push(String(e))); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.goto(url,{waitUntil:'load'});await page.waitForSelector('.designer-layout');
 assert(!requests.some(u=>/LegacyKeyIcon-/.test(u)),'full icon catalogue must not load at startup');
 assert(!requests.some(u=>/ViaMacroEditor-/.test(u)),'macro editor must not load at startup');
 const deck=JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_deck')));
 await page.$eval('nav[aria-label="Modules"] button::-p-text(Macros)',e=>e.click()); await page.waitForFunction(()=>document.body.innerText.includes('VIA Macro Studio'));
 assert(requests.some(u=>/ViaMacroEditor-/.test(u)),'macro editor loads when requested');
 deck.layers[0].keys[0].iconName='Anchor'; await page.evaluate(d=>localStorage.setItem('kadowaz_deck',JSON.stringify(d)),deck); await page.reload({waitUntil:'load'});
 await page.waitForSelector('.macropad-key .lucide-anchor'); assert(requests.some(u=>/LegacyKeyIcon-/.test(u)),'saved legacy icon loads on demand');
 assert.deepEqual(errors,[]);console.log('built app: lazy pages load on demand and legacy icon renders');
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
