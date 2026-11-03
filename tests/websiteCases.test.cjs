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
const { renderPage } = require('../scripts/build-website-routes.cjs');
assert.equal(readFileSync(join(root, 'website/home/index.html'), 'utf8'), renderPage(home), 'clean Home route matches the canonical site');
assert.equal(readFileSync(join(root, 'website/cases/index.html'), 'utf8'), renderPage(html), 'clean Cases route matches the canonical site');
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
  assert.equal(dom.window.document.querySelector('.case-preview-card'), null, 'the placeholder card is not shown');
  assert.equal(dom.window.document.querySelector('#cases-empty').hidden, false, 'an empty library never invents a download');
  assert.match(home, /href="\.\/cases\/"/, 'home links to the separate library page');
  const homeDoc = new JSDOM(home).window.document;
  const homePrefetches = [...homeDoc.querySelectorAll('link[rel="prefetch"]')].map(link => link.getAttribute('href'));
  assert.ok(homePrefetches.includes('./cases/'), 'Home can warm the Cases document without changing navigation');
  for (const name of ['./cases-data.js?v=1', './cases.js?v=2']) assert.ok(homePrefetches.includes(name), `Home can warm ${name}`);
  const casePrefetches = [...dom.window.document.querySelectorAll('link[rel="prefetch"]')].map(link => link.getAttribute('href'));
  assert.ok(casePrefetches.includes('./home/'), 'Cases can warm the Home document');
  assert.equal(dom.window.document.querySelector('.desktop-nav a[href="./home/"]').href, 'https://example.test/home/', 'Cases navigates to the clean Home URL');
  assert.equal(dom.window.document.querySelector('.desktop-nav a[href="./home/#hardware"]').href, 'https://example.test/home/#hardware', 'deep links keep their anchor on the clean Home URL');
  assert.equal(dom.window.document.querySelector('.nav-cta').href, 'https://example.test/home/#support', 'Cases header coffee link leads to Home support');
  assert.ok(dom.window.document.querySelector('.mobile-nav a[href="./home/#support"]'), 'support is accessible from the Cases mobile menu');
  for (const el of homeDoc.querySelectorAll('link[href*="specular-button.css"], script[src*="specular-button.js"]')) {
    const url = el.getAttribute('href') || el.getAttribute('src');
    assert.ok(casePrefetches.includes(url), `Cases prefetch matches the active Home asset version: ${url}`);
  }
  const document = dom.window.document;
  const saleCards = [...document.querySelectorAll('.case-sale-card')];
  assert.equal(saleCards.length, 2, 'V1 and V2 each have their own case listing');
  for (const [index, card] of saleCards.entries()) {
    assert.match(card.querySelector('h3').textContent, new RegExp(`V${index + 1} case model`));
    assert.match(card.querySelector('.case-sale-price').textContent, /₹150/);
    assert.match(card.querySelector('.case-sale-visual small').textContent, /illustration \/ not final/i);
    assert.match(card.querySelector('.case-sale-description').textContent, /not yet verified/i);
    assert.equal(card.querySelector('button').disabled, true, 'purchase stays disabled without a checkout');
    assert.match(card.querySelector('button').textContent, /buy & download/i);
    assert.equal(card.querySelector('a[download]'), null, 'paid models have no unprotected public download');
  }
  assert.match(saleCards[0].querySelector('.case-sale-description').textContent, /without a screen or external LEDs/i);
  assert.equal(saleCards[0].querySelector('.sale-display, .sale-rgb-indicators'), null, 'V1 illustration has no screen or LEDs');
  assert.match(saleCards[1].querySelector('.case-sale-description').textContent, /screen and RGB/i);
  assert.ok(saleCards[1].querySelector('.sale-display'), 'V2 illustration has a screen');
  assert.ok(saleCards[1].querySelector('.sale-rgb-indicators'), 'V2 illustration indicates planned RGB');
  assert.match(homeDoc.querySelector('.hardware-facts').textContent, /V1\s*KEYS \+ KNOB\s*V2\s*DISPLAY \+ PLANNED RGB/);
  assert.match(document.querySelector('.case-wiring-intro p').textContent, /their V2 is now V1, and their V1 is now V2/i, 'old diagram labels are explained');
  assert.match(document.querySelector('.guide-steps').textContent, /Keys & Knob for V1 or Full Deck for V2/);
  assert.match(document.querySelector('.guide-safety').textContent, /For V2, the RGB power design is not approved/i);
  assert.match(document.querySelector('.case-sale-heading').textContent, /₹150 PER MODEL/i);
  assert.match(document.querySelector('#case-order-note').textContent, /₹150 per model/i);
  assert.match(document.querySelector('#case-order-note').textContent, /purchase is required to download/i);
  assert.match(document.querySelector('#case-order-note').textContent, /payment and secure file delivery aren’t connected/i);
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
  assert.equal(document.querySelectorAll('.case-sale-card').length, 2, 'paid listings remain visible when downloadable models are added');
  assert.equal(document.querySelectorAll('#case-grid .case-card').length, 2, 'only complete local entries are listed');
  assert.equal(document.querySelector('#case-grid .case-card img').alt, 'My case case model');
  const link = document.querySelector('#case-grid .case-card a');
  assert.equal(link.href, 'https://example.test/assets/cases/case.stl');
  assert.equal(link.hasAttribute('download'), true);
  assert.equal(document.querySelectorAll('.case-card h3 img').length, 0, 'titles render as text');
  dom.window.close();
}
{
  // Model URLs remain rooted at the project, not the /cases/ route.
  const cleanHtml = readFileSync(join(root, 'website/cases/index.html'), 'utf8');
  const dom = new JSDOM(cleanHtml, { url: 'https://example.test/MacroPad-/cases/', runScripts: 'outside-only' });
  dom.window.ZERO_CASE_MODELS = [{ title: 'Demo', image: './assets/cases/demo.webp', file: './assets/cases/demo.stl' }];
  dom.window.eval(renderScript);
  assert.equal(dom.window.document.querySelector('#case-grid img').src, 'https://example.test/MacroPad-/assets/cases/demo.webp');
  assert.equal(dom.window.document.querySelector('#case-grid a').href, 'https://example.test/MacroPad-/assets/cases/demo.stl');
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
  assert.equal(document.querySelector('.case-sale-card').style.opacity, '0', 'case listings wait for their scroll section');
  observer().callback([{ target: document.querySelector('.case-sale-grid'), isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="case-sale-cards"]'), 'case listings construct when they enter view');
  assert.equal(document.querySelector('.cases-future').getAttribute('aria-hidden'), 'true', 'library artwork is decorative');
  assert.equal(document.querySelector('.cases-future').style.opacity, '0', 'library artwork waits for its scroll section');
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
