const assert = require('node:assert/strict');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zero-art-'));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(); const errors=[]; page.on('pageerror', e=>errors.push(String(e)));
    await page.setViewport({width:1440,height:1000}); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(()=>localStorage.setItem('kadowaz_guide_seen','1'));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/',{waitUntil:'load'});
    await page.waitForSelector('.startup-deck-controls');
    const open = async () => {
      await page.$eval('.startup-deck-controls button::-p-text(Display)',e=>e.click());
      await page.waitForSelector('button::-p-text(CREATE SCREEN)');
      assert.match(await page.evaluate(()=>document.body.innerText), /Built-in animations run from the pad’s installed firmware/);
      assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='TELEMETRY')), false);
      await page.$eval('button::-p-text(CREATE SCREEN)',e=>e.click());
      await page.waitForSelector('[aria-label="Custom screen editor"]');
    };
    await open();
    if (process.env.AXE_CORE_PATH) {
      await page.addScriptTag({path:process.env.AXE_CORE_PATH});
      const results = await page.evaluate(async()=>await axe.run(document.querySelector('[aria-label="Custom screen editor"]'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
      assert.deepEqual(results.violations.map(v=>({id:v.id, nodes:v.nodes.map(n=>n.html)})), []);
    }
    await page.focus('[aria-label="Drawing canvas, 128 by 32 pixels"]'); await page.keyboard.press('Space');
    await page.$eval('button::-p-text(Save & show)',e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_oled')||'{}').customScreen?.kind==='drawing');
    let saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('kadowaz_oled')));
    assert.equal(saved.mode,'system'); assert.equal(saved.customScreenEnabled,true);
    assert.equal(Buffer.from(saved.customScreen.frames[0], 'base64')[0],1,'keyboard paints actual screen pixel');
    assert.match(await page.$eval('[aria-label="Custom screen editor"]',e=>e.textContent),/Custom artwork stays on this computer/);
    await page.reload({waitUntil:'load'}); await page.waitForSelector('.startup-deck-controls'); await open();
    assert(await page.$('button::-p-text(Show saved design)'), 'saved design survives reload');
    await page.$eval('button::-p-text(DISPLAY MODES)', e=>e.click());
    await page.$eval('button[title^="System Telemetry"]', e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_oled')).customScreenEnabled===false);
    await page.$eval('button::-p-text(CREATE SCREEN)', e=>e.click());
    await page.$eval('button::-p-text(Show saved design)', e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_oled')).customScreenEnabled===true);
    const png = await page.evaluate(()=>{const c=document.createElement('canvas');c.width=320;c.height=240;const g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,160,240);g.fillStyle='black';g.fillRect(160,0,160,240);return c.toDataURL('image/png').split(',')[1];});
    const imagePath=path.join(dir,'photo.png'); fs.writeFileSync(imagePath,Buffer.from(png,'base64'));
    await (await page.$('input[type=file]')).uploadFile(imagePath); await page.waitForSelector('[aria-label="Crop outline"] img');
    await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save & show')?.disabled===false);
    assert.equal(await page.$('input[type=range][aria-label="Clip start"]'),null, 'image has no video controls');
    if (process.env.AXE_CORE_PATH) {
      await page.addScriptTag({path:process.env.AXE_CORE_PATH});
      const results = await page.evaluate(async()=>await axe.run(document.querySelector('[aria-label="Custom screen editor"]'), {runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
      assert.deepEqual(results.violations.map(v=>({id:v.id, nodes:v.nodes.map(n=>n.html)})), []);
    }
    await page.$eval('button::-p-text(Save & show)',e=>e.click());
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_oled')||'{}').customScreen?.kind==='image');
    saved = await page.evaluate(()=>JSON.parse(localStorage.getItem('kadowaz_oled')));
    const picture=Buffer.from(saved.customScreen.frames[0],'base64'); assert(picture.some(v=>v!==0) && picture.some(v=>v===0), 'image converts to a monochrome crop');
    // Produce a small, local WebM fixture with actual moving canvas frames.
    const webm = await page.evaluate(async()=>{
      if (!window.MediaRecorder || !MediaRecorder.isTypeSupported('video/webm;codecs=vp8')) return null;
      const c=document.createElement('canvas');c.width=128;c.height=32;const g=c.getContext('2d');
      const chunks=[]; const r=new MediaRecorder(c.captureStream(10),{mimeType:'video/webm;codecs=vp8'}); r.ondataavailable=e=>chunks.push(e.data);
      const stopped=new Promise(resolve=>r.onstop=resolve); r.start();
      for(let i=0;i<8;i++){g.fillStyle=i%2?'white':'black';g.fillRect(0,0,128,32);await new Promise(resolve=>setTimeout(resolve,120));}
      r.stop(); await stopped; const blob=new Blob(chunks,{type:'video/webm'}); return await new Promise(resolve=>{const f=new FileReader();f.onload=()=>resolve(f.result.split(',')[1]);f.readAsDataURL(blob);});
    });
    if (webm) {
      const videoPath=path.join(dir,'clip.webm'); fs.writeFileSync(videoPath,Buffer.from(webm,'base64'));
      await (await page.$('input[type=file]')).uploadFile(videoPath);
      await page.waitForSelector('[aria-label="Crop outline"] video');
      await page.waitForFunction(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Save & show')?.disabled===false);
      await page.$eval('button::-p-text(Save & show)',e=>e.click());
      await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kadowaz_oled')||'{}').customScreen?.kind==='video',{timeout:15000});
      saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kadowaz_oled')));
      assert(saved.customScreen.frames.length>1 && saved.customScreen.frames.length<=50);
      assert.equal(saved.customScreen.fps,5);
      assert(new Set(saved.customScreen.frames).size > 1, 'video samples actual changing frames');
    } else console.log('custom screen browser: video fixture skipped (WebM recorder unavailable)');
    const before = await page.evaluate(()=>localStorage.getItem('kadowaz_oled'));
    await page.evaluate(()=>{ const original=Storage.prototype.setItem; Storage.prototype.setItem=function(key,value){ if(key==='kadowaz_oled') throw new DOMException('Quota exceeded','QuotaExceededError'); return original.call(this,key,value); }; });
    await page.$eval('button::-p-text(Draw)',e=>e.click());
    await page.$eval('button::-p-text(Save & show)',e=>e.click());
    await page.waitForFunction(()=>document.querySelector('[aria-label="Custom screen editor"]')?.textContent.includes('Could not save the screen on this PC'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('kadowaz_oled')), before, 'failed storage preserves the previous design');
    assert.deepEqual(errors,[]); console.log('custom screen browser: drawing, persistence, crop, image, video and storage failure passed');
  } finally { await browser.close(); fs.rmSync(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1});
