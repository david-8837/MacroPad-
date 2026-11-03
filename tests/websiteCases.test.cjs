const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'website/cases.html'), 'utf8');
const dataScript = readFileSync(join(root, 'website/cases-data.js'), 'utf8');
const renderScript = readFileSync(join(root, 'website/cases.js'), 'utf8');
const home = readFileSync(join(root, 'website/index.html'), 'utf8');
function create(models) {
  const dom = new JSDOM(html, { url: 'https://example.test/cases.html', runScripts: 'outside-only' });
  if (models === undefined) dom.window.eval(dataScript);
  else dom.window.ZERO_CASE_MODELS = models;
  dom.window.eval(renderScript);
  return dom;
}
{
  const dom = create();
  assert.equal(dom.window.document.querySelectorAll('#case-grid .case-card').length, 0);
  assert.ok(dom.window.document.querySelector('.case-preview-card img'), 'an example image is displayed');
  assert.equal(dom.window.document.querySelector('.case-preview-card button').disabled, true, 'the placeholder cannot imply a download exists');
  assert.equal(dom.window.document.querySelector('#cases-empty').hidden, false, 'an empty library never invents a download');
  assert.match(home, /href="\.\/cases\.html"/, 'home links to the separate library page');
  const homeDoc = new JSDOM(home).window.document;
  const homePrefetches = [...homeDoc.querySelectorAll('link[rel="prefetch"]')].map(link => link.getAttribute('href'));
  assert.ok(homePrefetches.includes('./cases.html'), 'Home can warm the Cases document without changing navigation');
  for (const name of ['./cases-data.js?v=1', './cases.js?v=1']) assert.ok(homePrefetches.includes(name), `Home can warm ${name}`);
  const casePrefetches = [...dom.window.document.querySelectorAll('link[rel="prefetch"]')].map(link => link.getAttribute('href'));
  assert.ok(casePrefetches.includes('./index.html'), 'Cases can warm the Home document');
  for (const el of homeDoc.querySelectorAll('link[href*="specular-button.css"], script[src*="specular-button.js"]')) {
    const url = el.getAttribute('href') || el.getAttribute('src');
    assert.ok(casePrefetches.includes(url), `Cases prefetch matches the active Home asset version: ${url}`);
  }
  const document = dom.window.document;
  assert.ok(document.querySelector('script[src*="intro.js"]'), 'Cases loads the construction animation');
  assert.ok(document.querySelector('link[rel="stylesheet"][href*="intro.css"]'), 'Cases applies animation styles');
  assert.ok(document.querySelector('.intro-replay'), 'Cases provides a replay control');
  assert.ok(document.querySelector('.mobile-menu > summary.menu-toggle'), 'mobile navigation uses native details');
  assert.equal(document.querySelector('#mobile-menu').hasAttribute('hidden'), false, 'navigation does not depend on JavaScript to open');
  assert.match(html, /site-intro-preparing/, 'Cases prevents unfinished content flashing before setup');
  assert.equal(document.querySelectorAll('.guide-step').length, 5, 'build guide covers case, wiring, software, firmware and setup');
  assert.match(document.querySelector('.guide-steps').textContent, /BOOT/);
  assert.match(document.querySelector('.guide-steps').textContent, /Keys & Knob/);
  assert.match(document.querySelector('.guide-safety').textContent, /not been physically tested/i);
  assert.match(document.querySelector('.guide-safety').textContent, /LED power and data disconnected/i);
  const diagrams = [...document.querySelectorAll('.guide-diagram img')];
  assert.equal(diagrams.length, 2);
  assert.match(diagrams[0].getAttribute('src'), /wiring-v2-photo\.webp$/);
  assert.match(diagrams[1].getAttribute('src'), /wiring-v1-photo\.webp$/);
  assert.match(document.querySelector('.guide-reference p').textContent, /do not connect LED power or data, even at low brightness/i, 'the unapproved PDF RGB diagram is clearly flagged');
  const pdf = readFileSync(join(root, 'website/assets/Macropad_Complete_Wiring_Guide.pdf'));
  assert.equal(createHash('sha256').update(pdf).digest('hex'), '2906d1f99e8b7624a2ad7b9f2f3f3a95371a67391595fc3a5553692da294c53b', 'site links to the supplied guide');
  for (const image of diagrams) {
    const file = join(root, 'website', image.getAttribute('src'));
    assert.ok(readFileSync(file).length > 1000, 'the locally hosted wiring diagram exists');
  }
  assert.match(document.querySelector('.guide-reference a').href, /Macropad_Complete_Wiring_Guide\.pdf$/);
  dom.window.close();
}
{
  const dom = create([
    { title: 'My case', image: './assets/cases/case.webp', file: './assets/cases/case.stl' },
    { title: '<img src=x onerror=alert(1)>', image: './assets/cases/case.webp', file: './assets/cases/case.3mf' },
    { title: 'No file', image: './assets/cases/case.webp' },
    { title: 'Remote link', image: './assets/cases/case.webp', file: 'https://other.test/model.stl' },
    { title: 'Script URL', image: 'javascript:alert(1)', file: './assets/cases/case.stl' }
  ]);
  const document = dom.window.document;
  assert.equal(document.querySelector('#cases-empty').hidden, true);
  assert.equal(document.querySelectorAll('#case-grid .case-card').length, 2, 'only complete local entries are listed');
  assert.equal(document.querySelector('#case-grid .case-card img').alt, 'My case case model');
  const link = document.querySelector('#case-grid .case-card a');
  assert.equal(link.href, 'https://example.test/assets/cases/case.stl');
  assert.equal(link.hasAttribute('download'), true);
  assert.equal(document.querySelectorAll('.case-card h3 img').length, 0, 'titles render as text');
  dom.window.close();
}
// Cases uses the shared construction engine with independent per-page state.
function createAnimatedCases({ visited = false, reload = false, reduced = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/cases.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (visited) window.sessionStorage.setItem('zero-scroll-intro-v1:cases', 'played');
  if (reload) window.performance.getEntriesByType = () => [{ type: 'reload' }];
  const rect = { left: 20, top: 20, right: 220, bottom: 70, width: 200, height: 50, x: 20, y: 20, toJSON() { return this; } };
  window.HTMLElement.prototype.getBoundingClientRect = () => rect;
  window.Range.prototype.getBoundingClientRect = () => rect;
  const inert = new WeakMap();
  Object.defineProperty(window.HTMLElement.prototype, 'inert', { configurable: true, get() { return inert.get(this) || false; }, set(value) { inert.set(this, !!value); } });
  window.matchMedia = () => ({ matches: reduced, addEventListener() {} });
  window.requestAnimationFrame = () => 1;
  window.cancelAnimationFrame = () => {};
  let observer;
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {} unobserve() {} disconnect() {}
  };
  window.console.warn = () => {};
  window.eval(dataScript);
  window.eval(renderScript);
  window.eval(readFileSync(join(root, 'website/script.js'), 'utf8'));
  const originalText = window.document.getElementById('site-content').textContent;
  window.eval(readFileSync(join(root, 'website/intro.js'), 'utf8'));
  return { dom, window, document: window.document, observer: () => observer, originalText };
}
{
  const { dom, window, document, observer, originalText } = createAnimatedCases();
  assert.equal(window.sessionStorage.getItem('zero-scroll-intro-v1:cases'), 'played');
  assert.equal(window.sessionStorage.getItem('zero-scroll-last-page-v1'), 'cases');
  assert.ok(document.querySelectorAll('[data-build-text]').length > 50, 'Cases text is scheduled for typing');
  assert.equal(document.querySelector('.guide-safety').style.opacity, '0', 'unvisited wiring warnings wait for their section');
  observer().callback([{ target: document.querySelector('.cases-hero'), isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="cases-hero"]'), 'Cases hero builds on entering the viewport');
  observer().callback([{ target: document.querySelector('.cases-hero'), isIntersecting: false }]);
  assert.equal(document.querySelector('[data-build-stage="cases-hero"]'), null, 'off-screen construction finishes');
  observer().callback([{ target: document.querySelector('.guide-steps'), isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="case-guide-steps"]'), 'guide builds independently on scroll');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'keyboard navigation completes all stages');
  assert.equal(document.getElementById('site-content').textContent, originalText, 'completion restores the original text');
  assert.equal(document.querySelector('.guide-safety').style.opacity, '');
  document.querySelector('.intro-replay').click();
  assert.ok(document.querySelectorAll('[data-build-text]').length > 50, 'Replay starts Cases again');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, document } = createAnimatedCases({ visited: true });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'Cases does not replay on a return visit');
  dom.window.close();
}
{
  const { dom, document } = createAnimatedCases({ visited: true, reload: true });
  assert.ok(document.querySelectorAll('[data-build-text]').length > 50, 'refresh replays Cases');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, document } = createAnimatedCases({ reduced: true });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'Cases respects reduced motion');
  assert.equal(document.querySelector('.intro-replay').disabled, true);
  dom.window.close();
}
console.log('website cases: safe gallery, build guide and scroll animation passed');
