const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const root = join(__dirname, '..');
const html = readFileSync(join(root,'website/index.html'),'utf8');
const script = readFileSync(join(root,'website/script.js'),'utf8');
const TEST_KEY = '12345678-1234-1234-1234-123456789abc'; // test-only public form identifier
function setup(key, fetch) {
  const dom = new JSDOM(html, {url:'https://example.test/home/',runScripts:'outside-only'});
  const {window} = dom, form=window.document.querySelector('.feedback-form');
  form.dataset.web3formsKey=key; window.fetch=fetch; window.eval(script);
  const message=form.querySelector('#feedback-message'), contact=form.querySelector('#feedback-contact');
  const status=()=>form.querySelector('.feedback-status').textContent;
  const send=()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,window,form,message,contact,status,send};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
(async()=>{
  for(const key of ['', 'not-a-key']) {
    let calls=0; const t=setup(key,()=>{calls++;}); t.message.value='keep this'; t.send(); await tick();
    assert.equal(calls,0); assert.match(t.status(),/not available yet/i); assert.equal(t.message.value,'keep this'); t.dom.window.close();
  }
  {
    let calls=0; const t=setup(TEST_KEY,()=>{calls++;}); t.message.value='   '; t.send(); await tick();
    assert.equal(calls,0); assert.match(t.message.validationMessage,/feedback/i); t.dom.window.close();
  }
  {
    let resolveFetch, calls=[]; const t=setup(TEST_KEY,(url,opts)=>{calls.push([url,opts]); return new Promise(r=>{resolveFetch=r})});
    t.message.value='  great project  '; t.contact.value='@visitor'; t.send(); t.send();
    assert.equal(calls.length,1,'no duplicate submission'); assert.equal(t.form.querySelector('.feedback-submit').disabled,true); assert.equal(t.form.querySelector('.feedback-submit').getAttribute('aria-busy'),'true'); assert.equal(t.form.querySelector('.feedback-submit-label').textContent,'Sending…'); assert.equal(t.form.querySelector('.feedback-status').dataset.state,'sending'); assert.match(t.status(),/sending/i);
    assert.equal(calls[0][0],'https://api.web3forms.com/submit'); const payload=JSON.parse(calls[0][1].body);
    assert.equal(payload.access_key,TEST_KEY); assert.equal(payload.message,'great project'); assert.equal(payload.contact,'@visitor'); assert.equal(payload.email,undefined);
    t.message.value='edited while sending'; resolveFetch({ok:true,json:async()=>({success:true})}); await tick();
    assert.match(t.status(),/successfully sent.*recent edits/i); assert.equal(t.form.querySelector('.feedback-status').dataset.state,'success'); assert.equal(t.form.querySelector('.feedback-submit-label').textContent,'Send feedback'); assert.equal(t.message.value,'edited while sending','new edits are preserved'); assert.equal(t.contact.value,'@visitor'); assert.equal(t.form.querySelector('.feedback-submit').disabled,false); t.dom.window.close();
  }
  {
    let payload; const t=setup(TEST_KEY,async (_,opts)=>{payload=JSON.parse(opts.body);return {ok:true,json:async()=>({success:true})}});
    t.message.value='hello'; t.contact.value='test@example.com'; t.send(); await tick(); assert.equal(payload.email,'test@example.com'); assert.equal(t.message.value,''); assert.equal(t.contact.value,''); assert.equal(t.form.querySelector('.feedback-status').dataset.state,'success'); t.message.value='new idea'; t.message.dispatchEvent(new t.window.Event('input',{bubbles:true})); assert.equal(t.status(),''); t.dom.window.close();
  }
  for(const response of [()=>Promise.reject(new Error('offline')),async()=>({ok:false,json:async()=>({success:true})}),async()=>({ok:true,json:async()=>({success:false})}),async()=>({ok:true,json:async()=>{throw Error('bad json')}})]) {
    const t=setup(TEST_KEY,response);t.message.value='keep'; t.contact.value='@me';t.send();await tick();assert.match(t.status(),/could not confirm/i);assert.equal(t.form.querySelector('.feedback-status').dataset.state,'error');assert.equal(t.form.querySelector('.feedback-submit-label').textContent,'Send feedback');assert.equal(t.message.value,'keep');assert.equal(t.contact.value,'@me');assert.equal(t.form.querySelector('.feedback-submit').disabled,false);t.dom.window.close();
  }
  {
    const t=setup(TEST_KEY,(_,opts)=>new Promise((_,reject)=>opts.signal.addEventListener('abort',()=>reject(new Error('aborted')))));
    const originalTimeout=t.window.setTimeout.bind(t.window); t.window.setTimeout=(fn,ms)=>originalTimeout(fn,ms===15000?0:ms);
    t.message.value='keep on timeout'; t.send(); await new Promise(resolve=>setTimeout(resolve,20));
    assert.match(t.status(),/could not confirm/i);assert.equal(t.message.value,'keep on timeout');assert.equal(t.form.querySelector('.feedback-submit').disabled,false);t.dom.window.close();
  }
  {
    let calls=0;const t=setup(TEST_KEY,()=>{calls++});t.message.value='test';t.form.querySelector('#feedback-botcheck').checked=true;t.send();await tick();assert.equal(calls,0);assert.equal(t.message.value,'test');t.dom.window.close();
  }
  console.log('websiteFeedback: configuration, validation, Web3Forms payload, success, failure, honeypot and duplicate prevention passed');
})().catch(e=>{console.error(e);process.exitCode=1});
