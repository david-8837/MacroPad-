// Optional: start Vite and set CHROMIUM_PATH / PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    for (const scenario of ['native-success', 'native-failure', 'storage-failure', 'finish-failure', 'preview']) {
      const context = await browser.createBrowserContext(), page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(String(error)));
      await page.setViewport({width:1280,height:900});
      await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
      await page.evaluateOnNewDocument(kind => {
        if (!sessionStorage.getItem('fixture_started')) {
          sessionStorage.setItem('fixture_started','yes'); sessionStorage.setItem('kadowaz_intro_seen_v1','1');
          localStorage.setItem('unrelated_data','keep'); sessionStorage.setItem('unrelated_session','keep');
          localStorage.setItem('kadowaz_guide_seen','1'); localStorage.setItem('kadowaz_opening_animation','0');
          localStorage.setItem('kadowaz_macros_v2','[{"id":0,"name":"KEEP THIS UNTIL CONFIRMED","actions":[]}]');
          localStorage.setItem('kadowaz_app_theme','dark');
        }
        window.nativeActions = []; window.prepareCalls = 0; window.finishCalls = 0;
        if (kind !== 'preview') window.electronAPI = {
          execAction: async action => { window.nativeActions.push(action); return {success:true}; },
          prepareReset: async () => { window.prepareCalls++; if (kind === 'native-failure') throw new Error('native reset blocked'); return true; },
          finishReset: async () => { window.finishCalls++; return kind !== 'finish-failure'; }
        };
        if (kind === 'storage-failure') {
          const remove = Storage.prototype.removeItem;
          Storage.prototype.removeItem = function(key) { if (key === 'kadowaz_macros_v2') throw new Error('storage blocked'); return remove.call(this,key); };
        }
      }, scenario);
      await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/',{waitUntil:'load'});
      await page.waitForSelector('.designer-layout');
      assert.equal(await page.$('#workspace-rail #backup-restore'), null);
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('#workspace-rail button')].some(e => /backup/i.test(e.textContent))), false);
      await page.click('button[aria-label="Settings"]'); await page.waitForSelector('.settings-page #backup-restore');
      await page.click('button::-p-text(Reset saved data)');
      assert.equal(await page.$eval('button::-p-text(Delete saved data)', e => e.disabled), true);
      await page.click('[aria-label="Confirm reset"] button::-p-text(Cancel)');
      assert.match(await page.evaluate(() => localStorage.getItem('kadowaz_macros_v2')), /KEEP THIS/);
      assert.equal(await page.evaluate(() => window.prepareCalls), 0);
      await page.click('button::-p-text(Reset saved data)');
      await page.type('#reset-confirmation','reset');
      assert.equal(await page.$eval('button::-p-text(Delete saved data)', e => e.disabled), true);
      await page.$eval('#reset-confirmation', el => { el.focus(); el.select(); });
      await page.type('#reset-confirmation','RESET');
      assert.equal(await page.$eval('button::-p-text(Delete saved data)', e => e.disabled), false);
      if (scenario === 'preview') {
        await Promise.all([page.waitForNavigation({waitUntil:'load'}), page.click('button::-p-text(Delete saved data)')]);
        await page.waitForSelector('.designer-layout');
        assert.equal(await page.evaluate(() => localStorage.getItem('kadowaz_macros_v2')), null);
        assert.equal(await page.evaluate(() => localStorage.getItem('kadowaz_app_theme')), null);
      } else {
        await page.click('button::-p-text(Delete saved data)');
        if (scenario === 'native-success') {
          await page.waitForFunction(() => window.finishCalls === 1);
          await new Promise(resolve => setTimeout(resolve,200));
          assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(k=>k.startsWith('kadowaz_')).length), 0, 'editor must not rewrite data after reset');
          assert.equal(await page.evaluate(() => Object.keys(sessionStorage).filter(k=>k.startsWith('kadowaz_')).length), 0);
          assert.equal(await page.evaluate(() => window.prepareCalls), 1);
        } else if (scenario === 'finish-failure') {
          await page.waitForSelector('main [role=alert]');
          assert.match(await page.$eval('main [role=alert]', el => el.textContent), /Some data was removed.*Quit ZERO/s);
          assert.equal(await page.evaluate(() => localStorage.getItem('kadowaz_macros_v2')), null);
          assert.equal(await page.$('button::-p-text(Return to ZERO)'), null);
        } else {
          await page.waitForSelector('main [role=alert]');
          assert.match(await page.$eval('main [role=alert]', el => el.textContent), scenario === 'native-failure' ? /native reset blocked/ : /storage blocked/);
          assert.match(await page.evaluate(() => localStorage.getItem('kadowaz_macros_v2')), /KEEP THIS/, 'failed reset restores saved data');
          assert.equal(await page.evaluate(() => window.finishCalls), 0);
          if (scenario === 'storage-failure') assert.equal(await page.evaluate(() => window.prepareCalls), 0);
          await page.click('button::-p-text(Return to ZERO)'); await page.waitForSelector('.designer-layout');
        }
      }
      assert.equal(await page.evaluate(() => localStorage.getItem('unrelated_data')), 'keep');
      assert.equal(await page.evaluate(() => sessionStorage.getItem('unrelated_session')), 'keep');
      assert.deepEqual(await page.evaluate(() => window.nativeActions), [], 'reset sends no pad actions');
      assert.deepEqual(errors, []);
      await context.close(); console.log(`reset browser: ${scenario} passed`);
    }
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
