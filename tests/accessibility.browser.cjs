// Optional: start Vite; set CHROMIUM_PATH, PUPPETEER_CORE_PATH and AXE_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
const axePath = process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js');
(async () => {
  const browser = await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const page=await browser.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
    await page.setViewport({width:1280,height:900}); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(() => localStorage.setItem('kadowaz_guide_seen', '1'));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/',{waitUntil:'load'}); await page.waitForSelector('.designer-layout');
    await page.addScriptTag({path:axePath});
    const tabs = { Keys: null, Presets: 'Layer presets', Tester: 'Key tester', Shortcuts: 'Shortcuts vault', Lighting: 'LED STUDIO', Macros: 'VIA Macro Studio' };
    for(const [tab, marker] of Object.entries(tabs)) {
      if(marker) { await page.$eval(`nav[aria-label="Modules"] button::-p-text(${tab})`,e=>e.click()); await page.waitForFunction(text => document.body.innerText.includes(text), {}, marker); }
      const result=await page.evaluate(()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
      assert.deepEqual(result.violations.map(v=>`${v.id}: ${v.nodes.map(n=>n.target.join(' ')).join(', ')}`),[], `${tab} axe violations`);
      console.log(`accessibility browser: ${tab} axe WCAG A/AA automated checks passed`);
    }
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1});
