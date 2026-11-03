const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const root = join(__dirname, '..');
function run(page, { path = `/${page}/`, query = '', hash = '', nav = 'navigate', values = {}, embedded = false, blocked = false } = {}) {
  const html = readFileSync(join(root, 'website', page === 'home' ? 'index.html' : 'cases.html'), 'utf8');
  const code = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const url = new URL(`https://example.test/MacroPad-${path}${query}${hash}`);
  const valuesMap = new Map(Object.entries(values)), listeners = {};
  let redirect = '', normalized = '', scrolled = 0;
  const location = { pathname:url.pathname, search:url.search, hash:url.hash, href:url.href, replace(value) { redirect = value; } };
  const history = { state:null, scrollRestoration:'auto', replaceState(_state, _title, value) { normalized = value; location.hash = ''; } };
  const sessionStorage = { getItem(key) { if(blocked) throw Error('blocked'); return valuesMap.get(key) || null; }, setItem(key, value) { if(blocked) throw Error('blocked'); valuesMap.set(key,value); }, removeItem(key) { if(blocked) throw Error('blocked'); valuesMap.delete(key); } };
  const window = { location, history, sessionStorage, performance: { getEntriesByType: () => [{ type:nav }] }, addEventListener(name, handler) { listeners[name] = handler; }, scrollTo(options) { assert.equal(options.top,0); scrolled++; }, requestAnimationFrame(fn) { fn(); } };
  window.window = window; window.parent = embedded ? {} : window;
  vm.runInNewContext(code, { ...window, window, URL, requestAnimationFrame:window.requestAnimationFrame });
  return { window, history, location, valuesMap, listeners, redirect, normalized, get scrolled() { return scrolled; } };
}
{
  const r = run('cases', { nav:'reload', query:'?q=1', hash:'#wiring' });
  assert.equal(r.redirect, 'https://example.test/MacroPad-/home/?q=1');
  assert.equal(r.valuesMap.get('zero-refresh-home-v1'), '1', 'Home can replay its loader and intro after redirect');
}
{
  const r = run('cases', { path:'/cases.html', nav:'reload', hash:'#wiring', blocked:true });
  assert.equal(r.redirect, 'https://example.test/MacroPad-/home/', 'redirect survives blocked storage');
}
{
  const r = run('cases', { path:'/cases/index.html', nav:'reload' });
  assert.equal(r.redirect, 'https://example.test/MacroPad-/home/');
}
{
  const r = run('cases', { query:'?q=1', hash:'#wiring' });
  assert.equal(r.redirect, '', 'ordinary Cases navigation preserves deep links');
}
{
  const r = run('cases', { path:'/cases.html', hash:'#wiring' });
  assert.equal(r.redirect, 'https://example.test/MacroPad-/cases/#wiring', 'old links retain their anchor');
}
{
  const r = run('cases', { nav:'back_forward', embedded:true, values:{'zero-scroll-last-page-v1':'cases'} });
  assert.equal(r.redirect, '', 'back/forward does not act like refresh');
}
for (const options of [{ nav:'reload', query:'?q=1', hash:'#faq' }, { values:{'zero-refresh-home-v1':'1'}, query:'?q=1', hash:'#faq' }]) {
  const r = run('home', options);
  assert.equal(r.window.__zeroRefreshHome, true);
  assert.equal(r.normalized, '/MacroPad-/home/?q=1', 'refresh drops the anchor, not the query');
  assert.equal(r.history.scrollRestoration, 'manual');
  r.listeners.DOMContentLoaded(); r.listeners.load();
  assert.ok(r.scrolled >= 2, 'refresh scrolls to the top');
  r.listeners.pagehide();
  assert.equal(r.history.scrollRestoration, 'auto', 'later history navigation can restore normally');
  assert.equal(r.valuesMap.has('zero-refresh-home-v1'), false, 'redirect marker is consumed');
}
{
  const r = run('home', { hash:'#faq' });
  assert.equal(r.window.__zeroRefreshHome, false);
  assert.equal(r.normalized, '', 'normal Home deep links are untouched');
}
console.log('website refresh: Home and Cases return to top Home; navigation and anchors preserved');
