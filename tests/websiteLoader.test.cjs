const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const root = join(__dirname, '..');
function setup(page = 'home', { seen = false, reduced = false, hash = '', reload = false, blocked = false } = {}) {
  const html = readFileSync(join(root, `website/${page}/index.html`), 'utf8');
  const loaderCode = html.match(/<script>\s*\/\/ A short, optional first-entry transition[\s\S]*?<\/script>/)[0].replace(/^<script>|<\/script>$/g, '');
  const dom = new JSDOM(html, { url: `https://example.test/project/${page}/${hash}`, runScripts: 'outside-only' });
  const { window } = dom;
  window.matchMedia = () => ({ matches: reduced });
  window.performance.getEntriesByType = () => [{ type: reload ? 'reload' : 'navigate' }];
  if (seen) window.sessionStorage.setItem('zero-loader-seen-v1', '1');
  if (blocked) Object.defineProperty(window, 'sessionStorage', { get() { throw Error('blocked'); } });
  const timers = [];
  window.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const completed = [];
  window.addEventListener('zero-loader-done', event => completed.push(event.detail.skipped));
  window.eval(loaderCode);
  return { dom, window, timers, completed, active: () => window.document.documentElement.classList.contains('zero-loading') };
}
for (const page of ['home', 'cases']) {
  {
    const t = setup(page);
    assert.equal(t.active(), true, `${page}: first entry shows loader`);
    assert.equal(t.window.document.querySelectorAll('.zero-loader-symbols span').length, 11, 'centered symbols are separate animated characters');
    assert.match(t.window.document.querySelector('style').textContent, /@keyframes zero-symbol/, 'symbols change and move over time');
    assert.equal(t.window.sessionStorage.getItem('zero-loader-seen-v1'), '1');
    t.window.document.dispatchEvent(new t.window.Event('DOMContentLoaded'));
    assert.ok(t.window.document.querySelector('.zero-loader-cursor svg'), 'loader has the opening cursor');
    t.timers.find(timer => timer.ms <= 2050).fn();
    assert.ok(t.window.document.querySelector('.zero-loader').classList.contains('is-gathering'));
    let opening = 0; t.window.addEventListener('zero-loader-opening', () => opening++);
    t.timers.find(timer => timer.ms > 2050 && timer.ms <= 2680).fn();
    assert.equal(opening, 1, 'opening starts construction during the reveal');
    assert.ok(t.window.document.querySelector('.zero-loader').classList.contains('is-leaving'));
    t.timers.find(timer => timer.ms === 320).fn();
    assert.equal(t.active(), false);
    assert.deepEqual(t.completed, [false], 'normal exit signals cursor animation');
    t.dom.window.close();
  }
  {
    const t = setup(page);
    t.window.document.querySelector('.zero-loader').click();
    assert.equal(t.active(), false);
    assert.deepEqual(t.completed, [false], 'click dismisses only the loader and keeps the opening animation');
    assert.equal(t.window.__zeroLoaderOutcome.skipped, false, 'the decision survives a delayed intro script');
    t.dom.window.close();
  }
  {
    const t = setup(page);
    t.timers.find(timer => timer.ms === 4000).fn();
    assert.equal(t.active(), false, 'watchdog releases stalled page');
    t.dom.window.close();
  }
  for (const options of [{ seen: true }, { reduced: true }, { hash: '#wiring' }, { blocked: true }]) {
    const t = setup(page, options);
    assert.equal(t.active(), false, `${page}: should bypass for ${JSON.stringify(options)}`);
    if (options.hash || options.reduced) assert.equal(t.window.sessionStorage.getItem('zero-loader-seen-v1'), '1', 'bypassed entry still counts as a visit');
    t.dom.window.close();
  }
  {
    const t = setup(page, { seen: true, reload: true });
    assert.equal(t.active(), true, 'reload shows loader again');
    t.window.dispatchEvent(new t.window.KeyboardEvent('keydown', { key: 'Tab' }));
    assert.equal(t.active(), false, 'keyboard navigation immediately dismisses loader');
    assert.deepEqual(t.completed, [true]);
    assert.equal(t.window.__zeroLoaderOutcome.skipped, true, 'keyboard skip survives a delayed intro script');
    t.dom.window.close();
  }
}
console.log('website loader: entry, skip, navigation, refresh and fail-open passed');
