// Optional: start Vite and provide CHROMIUM_PATH/PUPPETEER_CORE_PATH/AXE_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context=await browser.createBrowserContext(), page=await context.newPage(), errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.setViewport({width:1440,height:1000}); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(()=>{localStorage.setItem('kadowaz_guide_seen','1');window.actions=[];window.electronAPI={execAction:async a=>{window.actions.push(a);return {success:true}}}});
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/',{waitUntil:'load'}); await page.waitForSelector('[aria-label="Empty layer keys"]');
    await page.$eval('[aria-label="Empty layer keys"] button',e=>e.click()); await page.waitForSelector('.drawer-keyboard-section');
    await page.addScriptTag({path:process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js')});
    async function inspect(title) {
      assert.equal(await page.$eval('.drawer-keyboard-section',el=>!!(el.compareDocumentPosition(document.querySelector('.drawer-shortcuts')) & Node.DOCUMENT_POSITION_FOLLOWING)),true,`${title}: shortcuts follow keyboard`);
      assert.equal(await page.$eval('.drawer-shortcuts-grid',el=>el.scrollWidth===el.clientWidth),true,`${title}: shortcuts don't scroll sideways`);
      assert.equal(await page.$eval('.drawer-keyboard-main-scroll',el=>el.scrollWidth===el.clientWidth),true,`${title}: main keyboard fits`);
      assert.equal(await page.$eval('[data-key-code="KeyA"]',el=>Math.round(el.getBoundingClientRect().height)),34,`${title}: keys are larger`);
      const issues=await page.evaluate(async()=> (await axe.run('.drawer-keyboard-section',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>({id:v.id, nodes:v.nodes.map(n=>n.target)})));
      assert.deepEqual(issues,[],`${title}: keyboard accessibility`);
      await page.$eval('[aria-label="Keyboard layout"] button::-p-text(TKL)',e=>e.click());
      assert.equal(await page.$('[aria-label="Number pad"]'),null); assert(await page.$('[aria-label="Navigation and arrow keys"]'));
      await page.$eval('[aria-label="Keyboard layout"] button::-p-text(60%)',e=>e.click());
      assert.equal(await page.$('[aria-label="Navigation and arrow keys"]'),null);
      await page.$eval('[aria-label="Keyboard layout"] button::-p-text(Full 104)',e=>e.click());
      assert(await page.$('[aria-label="Number pad"]'));
    }
    await inspect('key editor');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /^(⚡\s*)?Chord$|^\+ Append Keys$/.test(b.textContent.trim()))), false, 'shortcut mode buttons are removed');
    const deck=async()=>JSON.parse(await page.evaluate(()=>localStorage.getItem('kadowaz_deck')));
    await page.$eval('[data-key-code="ControlLeft"]',e=>e.click()); await page.$eval('[data-key-code="KeyC"]',e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction?.payload?.keys?.join(',')==='Ctrl,C');
    assert.equal(await page.$eval('[data-key-code="KeyC"]',e=>e.getAttribute('aria-pressed')),'true');
    const color=await page.$eval('[data-key-code="KeyC"]',e=>getComputedStyle(e).backgroundColor); assert.equal(color,'rgb(19, 81, 170)','selected key has visible fill');
    await page.$eval('.drawer-shortcuts-grid button::-p-text(Brightness Down)',e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].keys[0].tapAction?.payload?.keys?.join(',')==='BrightnessDown');
    await page.$eval('button[title="Close Drawer"]',e=>e.click());
    await page.$eval('button::-p-text(Knob)',e=>e.click()); await page.waitForSelector('.drawer-keyboard-section');
    await inspect('knob editor');
    assert.match(await page.$eval('[aria-label="Fixed knob hold"]', e=>e.textContent), /0\.7 seconds.*Upload/i);
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].some(b => /Test Hold/i.test(b.textContent))), false, 'hold test button is removed');
    const clear = await page.$('button[title="Clear All Keys"]'); if (clear) await clear.evaluate(e=>e.click());
    await page.$eval('[data-key-code="ControlLeft"]',e=>e.click()); await page.$eval('[data-key-code="KeyC"]',e=>e.click()); await page.$eval('[data-key-code="KeyV"]',e=>e.click());
    assert.equal(await page.$eval('[data-key-code="KeyC"]',e=>e.getAttribute('aria-pressed')),'true');
    assert.equal(await page.$eval('[data-key-code="KeyV"]',e=>e.getAttribute('aria-pressed')),'true');
    assert.match(await page.$eval('p[role="status"]',e=>e.textContent), /needs ZERO running on the connected PC/);
    assert.equal(await page.evaluate(()=>document.body.textContent.includes('1 shortcut per rotary key')),false);
    await page.$eval('button::-p-text(Save Knob Bindings)',e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_deck')).layers[0].dial.cwAction?.payload?.keys?.join(',')==='Ctrl,C,V');
    assert.deepEqual((await deck()).layers[0].dial.cwAction.payload.keys,['Ctrl','C','V']);
    await page.$eval('button::-p-text(Knob)',e=>e.click()); await page.waitForSelector('.drawer-keyboard-section');
    await page.focus('[data-key-code="KeyZ"]'); await page.keyboard.press('Space');
    assert.equal(await page.$eval('[data-key-code="KeyZ"]',e=>e.getAttribute('aria-pressed')),'true','Space activates an on-screen knob key, not physical capture');
    await page.keyboard.press('Tab'); assert.notEqual(await page.evaluate(()=>document.activeElement?.dataset.keyCode),'KeyZ','Tab navigates in knob editor');
    for (const theme of ['light','dark']) {
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.setViewport({width:480,height:800});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,`${theme}: no page overflow`);
      assert.equal(await page.$eval('.drawer-shortcuts-grid',el=>el.scrollWidth===el.clientWidth),true,`${theme}: shortcuts fit narrow window`);
      assert.equal(await page.$eval('.drawer-keyboard-main-scroll',el=>el.scrollWidth===el.clientWidth),true,`${theme}: main keys fit narrow window`);
      const bg=await page.$eval('[data-key-code="KeyZ"]',e=>getComputedStyle(e).backgroundColor); assert.equal(bg,'rgb(19, 81, 170)',`${theme}: selected key is blue`);
      const issues=await page.evaluate(async()=> (await axe.run('.drawer-keyboard-section',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>v.id));
      assert.deepEqual(issues,[],`${theme}: keyboard accessibility`);
      const holdIssues=await page.evaluate(async()=> (await axe.run('[aria-label="Fixed knob hold"]',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}})).violations.map(v=>v.id));
      assert.deepEqual(holdIssues,[],`${theme}: hold information accessibility`);
    }
    await page.setViewport({width:320,height:600});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth),true,'very narrow window has no page overflow');
    assert.equal(await page.$eval('.drawer-shortcuts-grid',el=>el.scrollWidth===el.clientWidth),true,'shortcut cards wrap even at 320px');
    assert.deepEqual(await page.evaluate(()=>window.actions),[],'configuring keys never executes them');
    await page.setViewport({width:1440,height:1000});
    await page.$eval('button[title="Close Drawer"]', e => e.click());
    await page.$eval('[title^="Scroll or Drag to rotate"]', e => e.dispatchEvent(new WheelEvent('wheel', {deltaY:-30, bubbles:true, cancelable:true})));
    await page.waitForFunction(() => window.actions.some(a => a.category === 'hotkey' && a.payload?.keys?.join(',') === 'Ctrl,C,V'));
    assert.deepEqual((await page.evaluate(()=>window.actions)).at(-1).payload.keys, ['Ctrl','C','V'], 'virtual knob sends the entire chord to the desktop executor');

    assert.deepEqual(errors,[]);
    await context.close();console.log('drawer keyboards: responsive layout, shortcut grid, key & knob assignments and accessibility passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
