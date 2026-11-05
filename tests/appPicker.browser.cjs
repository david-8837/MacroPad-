// Start Vite, then supply CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    for (const viewport of [{width:1440,height:1000},{width:480,height:700}]) {
      const context = await browser.createBrowserContext(), page = await context.newPage(), errors=[];
      page.on('pageerror', e => errors.push(String(e)));
      await page.setViewport(viewport); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      await page.evaluateOnNewDocument(() => {
        localStorage.setItem('kadowaz_guide_seen','1');
        const apps=Array.from({length:20},(_,i)=>({id:`app-${i}`,name:`Application ${String(i+1).padStart(2,'0')}`,category:i%2?'game':'utility',source:'custom',exePath:`C:\\Apps\\app${i}.exe`,isValid:true,targetType:'executable'}));
        localStorage.setItem('kadowaz_app_library',JSON.stringify(apps));
        localStorage.setItem('kadowaz_app_library_icon_version','2');
      });
      await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/',{waitUntil:'load'});
      await page.waitForSelector('[aria-label="Empty layer keys"] button');
      await page.$eval('[aria-label="Empty layer keys"] button',e=>e.click());
      await page.waitForSelector('button::-p-text(3. Open App)'); await page.$eval('button::-p-text(3. Open App)',e=>e.click());
      await page.waitForSelector('[data-app-list] button');
      const dimensions = await page.evaluate(() => {
        const list=document.querySelector('[data-app-list]'), body=document.querySelector('[data-key-drawer-body]');
        return {count:list.querySelectorAll('button').length, listHeight:list.clientHeight, listScroll:list.scrollHeight, bodyHeight:body.clientHeight, bodyScroll:body.scrollHeight, overflow:getComputedStyle(list).overflowY};
      });
      assert.equal(dimensions.count,20); assert(dimensions.listHeight > 500, 'the list is not limited to four rows');
      assert.equal(dimensions.listScroll,dimensions.listHeight, 'there is no nested vertical scrolling');
      assert(dimensions.bodyScroll > dimensions.bodyHeight, 'drawer handles scrolling');
      await page.$eval('[data-key-drawer-body]', e=>{e.scrollTop=e.scrollHeight});
      const visible=await page.evaluate(()=>{
        const body=document.querySelector('[data-key-drawer-body]').getBoundingClientRect();
        return [...document.querySelectorAll('[data-app-list] button')].filter(b=>{const r=b.getBoundingClientRect();return r.bottom<=body.bottom+1 && r.top>=body.top-1}).length;
      });
      assert(visible>=4, `the available drawer area shows multiple application cards (${visible})`);
      await page.$eval('[data-app-list] button:last-child', e=>e.click());
      await page.waitForFunction(()=>document.querySelector('[data-app-list] button:last-child')?.getAttribute('aria-pressed')==='true');
      await page.$eval('button::-p-text(Assign)', e=>e.click());
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction?.payload?.exePath?.endsWith('app19.exe'));
      assert.deepEqual(errors,[]); await context.close();
      console.log(`app picker: ${viewport.width}×${viewport.height}, full list, single scroll and assignment passed`);
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
