// Optional real-browser coverage: start Vite, set CHROMIUM_PATH and PUPPETEER_CORE_PATH.
const assert = require('node:assert/strict');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
const { build } = require('esbuild');
(async () => {
  const bundle = await build({ stdin: { contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {KeyMatrix} from './src/components/KeyMatrix'; import {RotaryEncoder} from './src/components/RotaryEncoder';
    const a = id => ({ id, name:id, category:'hotkey', payload:{keys:['A']} });
    const key = {keyIndex:0,label:'Key',iconName:'',tapAction:a('tap'),holdAction:a('hold'),doubleTapAction:a('double')};
    const dial = {label:'Dial',activeModeName:'0',availableModes:['0','1','2','3'],cwAction:a('cw'),ccwAction:a('ccw'),pressAction:a('knob'),channelHoldThresholdMs:120,accelerationCurve:'linear',sensitivity:5};
    window.events = []; const trigger = id => window.events.push(id);
    createRoot(document.getElementById('root')).render(<><KeyMatrix keys={[key]} selectedKeyIndex={0} onSelectKey={()=>{}} onTriggerAction={trigger}/><RotaryEncoder dial={dial} channelIndex={0} onTriggerAction={trigger} onCycleMode={i=>window.events.push('layer'+i)}/></>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', logLevel:'silent' });
  const browser = await puppeteer.launch({ executablePath: process.env.CHROMIUM_PATH, headless:true, args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(process.env.APP_URL || 'http://127.0.0.1:5173/', {waitUntil:'domcontentloaded'});
    await page.setContent('<link rel="stylesheet" href="/src/index.css"><style>#root { display:flex; gap:100px; padding:80px }</style><div id="root"></div>');
    await page.waitForFunction(() => [...document.styleSheets].some(s => s.href?.includes("index.css")));
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const key = await page.waitForSelector('.macropad-key'); const knob = await page.waitForSelector('button[title^="Tap:"]');
    const pause = ms => new Promise(r => setTimeout(r,ms));
    const take = () => page.evaluate(() => window.events.splice(0));
    await key.click(); await pause(300); assert.deepEqual(await take(), ['tap']);
    let box = await key.boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await pause(320); await page.mouse.up(); await pause(270); assert.deepEqual(await take(), ['hold']);
    box = await key.boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width+150,box.y+box.height+150); await pause(320); await page.mouse.up(); await pause(300); assert.deepEqual(await take(), []);
    await knob.click(); await pause(50); assert.deepEqual(await take(), ['knob']);
    box = await knob.boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await pause(180); assert.deepEqual(await take(), [], 'legacy 120ms hold is ignored'); await pause(400); assert.deepEqual(await take(), [], 'the old 500ms threshold no longer switches'); await pause(300); assert.deepEqual(await take(), ['layer1']); await pause(800); await page.mouse.up(); assert.deepEqual(await take(), [], 'no repeat or tap after a hold');
    box = await knob.boundingBox(); await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+box.width+150,box.y+box.height+150); await pause(800); await page.mouse.up(); await pause(50); assert.deepEqual(await take(), []);
    await knob.focus(); await page.keyboard.press('Space'); assert.deepEqual(await take(), ['knob']);
    const surface = await page.waitForSelector('[title^="Scroll or Drag to rotate"]');
    box = await surface.boundingBox();
    await page.evaluate(() => { window.wheelObservations = []; window.addEventListener('wheel', e => window.wheelObservations.push({ prevented: e.defaultPrevented, ctrl: e.ctrlKey }), { passive: true }); });
    await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.25);
    await page.keyboard.down('Control'); await page.mouse.wheel({deltaY: -50}); await page.keyboard.up('Control');
    await page.waitForFunction(() => window.wheelObservations.length > 0);
    assert.deepEqual(await take(), ['cw']);
    assert.deepEqual(await page.evaluate(() => window.wheelObservations.shift()), { prevented:true, ctrl:true }, 'native Ctrl+wheel over the knob is cancelled');
    await page.mouse.move(5, 5); await page.mouse.wheel({deltaY: 50});
    await page.waitForFunction(() => window.wheelObservations.length > 0);
    assert.equal((await page.evaluate(() => window.wheelObservations.shift())).prevented, false, 'wheel outside the knob is not blocked');
    assert.deepEqual(await take(), []);
    assert.deepEqual(errors, []); console.log('gesture browser: key and knob tap, hold, release outside, keyboard passed');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
