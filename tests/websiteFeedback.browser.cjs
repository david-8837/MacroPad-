// Optional: start static website on port 5174, set CHROMIUM_PATH/PUPPETEER_CORE_PATH.
// This mocks Web3Forms and PayPal; no real messages or payments are sent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require(process.env.PUPPETEER_CORE_PATH || 'puppeteer-core');
const base = process.env.WEBSITE_URL || 'http://127.0.0.1:5174';
const route = fs.readFileSync(path.join(__dirname,'../website/home/index.html'),'utf8').replace(/data-web3forms-key="[^"]*"/,'data-web3forms-key="12345678-1234-1234-1234-123456789abc"');
(async()=>{
 const browser=await puppeteer.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage']});
 try {
  for(const width of [320,390,1280]){
   const context=await browser.createBrowserContext(), page=await context.newPage(), errors=[], payloads=[]; let succeed=false, heldRequest=null;
   page.on('pageerror',e=>errors.push(String(e))); await page.setViewport({width,height:800}); await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]); await page.setRequestInterception(true);
   page.on('request',req=>{
    if(req.isNavigationRequest() && req.url()===`${base}/home/`) return req.respond({status:200,contentType:'text/html',body:route});
    if(req.url()==='https://api.web3forms.com/submit' && req.method()==='OPTIONS') return req.respond({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type'}});
    if(req.url()==='https://api.web3forms.com/submit') { payloads.push(JSON.parse(req.postData())); if (!succeed) { heldRequest=req; return; } return req.respond({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({success:true})}); }
    if(req.isNavigationRequest() && req.url()==='https://www.paypal.com/paypalme/ThongamDavid529') return req.respond({status:200,contentType:'text/html',body:'Mock PayPal'});
    return req.continue();
   });
   await page.goto(`${base}/home/`,{waitUntil:'load'});
   assert.match(await page.$eval('#feedback-note',el=>el.textContent),/Web3Forms/);
   await page.type('#feedback-message','My feedback');await page.type('#feedback-contact','@hello');await page.click('.feedback-submit');
   await page.waitForFunction(()=>document.querySelector('.feedback-status').dataset.state==='sending');
   assert.equal(await page.$eval('.feedback-submit', el => el.disabled), true);
   assert.match(await page.$eval('.feedback-submit', el => el.textContent), /Sending/);
   assert.equal(await page.$eval('.feedback-status', el => getComputedStyle(el, '::before').animationName), 'none', 'reduced motion stops the spinner');
   await new Promise((resolve,reject) => { const start=Date.now(); const check=()=>heldRequest?resolve():Date.now()-start>5000?reject(new Error('Mock submission did not arrive')):setTimeout(check,10); check(); });
   await heldRequest.respond({status:500,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({success:false})});
   await page.waitForFunction(()=>document.querySelector('.feedback-status').dataset.state==='error');
   assert.equal(await page.$eval('#feedback-message',el=>el.value),'My feedback'); assert.equal(await page.$eval('#feedback-contact',el=>el.value),'@hello');
   assert.equal(payloads.length,1);assert.equal(payloads[0].contact,'@hello');assert.equal(payloads[0].email,undefined);
   succeed=true;await page.click('.feedback-submit');await page.waitForFunction(()=>document.querySelector('.feedback-status').dataset.state==='success');
   assert.match(await page.$eval('.feedback-status',el=>el.textContent),/successfully sent/i);
   assert.equal(await page.$eval('.feedback-submit',el=>el.disabled),false);
   assert.equal(await page.$eval('#feedback-message',el=>el.value),'');assert.equal(payloads.length,2);
   const bounds=await page.$eval('.support-actions a',el=>{const r=el.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width}});
   assert.ok(bounds.left>=0 && bounds.right<=width && bounds.width>0,`PayPal visible within ${width}px`);
   assert.equal(await page.$eval('.support-actions button',el=>el.disabled),true);
   await Promise.all([page.waitForNavigation({waitUntil:'load'}),page.click('.support-actions a')]);
   assert.equal(page.url(),'https://www.paypal.com/paypalme/ThongamDavid529');assert.deepEqual(errors,[]);
   await context.close(); console.log(`website feedback browser: ${width}px mocked failure, success and PayPal navigation passed`);
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
