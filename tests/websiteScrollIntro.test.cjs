const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'website/index.html'), 'utf8');
const script = readFileSync(join(root, 'website/intro.js'), 'utf8');
const siteScript = readFileSync(join(root, 'website/script.js'), 'utf8');

function setup({ reduced = false, failAfter = Infinity, visited = false, storageBlocked = false, reload = false, loaderActive = false, loaderSkipped = false } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  if (visited) window.sessionStorage.setItem('zero-scroll-intro-v1:home', 'played');
  if (reload) window.performance.getEntriesByType = () => [{ type: 'reload' }];
  if (storageBlocked) Object.defineProperty(window, 'sessionStorage', { get() { throw new Error('blocked'); } });
  let calls = 0;
  const rect = { left: 20, top: 20, right: 220, bottom: 70, width: 200, height: 50, x: 20, y: 20, toJSON() { return this; } };
  window.HTMLElement.prototype.getBoundingClientRect = () => rect;
  window.Range.prototype.getBoundingClientRect = () => { if (++calls >= failAfter) throw new Error('measurement failed'); return rect; };
  const inerts = new WeakMap();
  Object.defineProperty(window.HTMLElement.prototype, 'inert', { configurable: true, get() { return inerts.get(this) || false; }, set(value) { inerts.set(this, !!value); } });
  window.matchMedia = () => ({ matches: reduced, addEventListener() {} });
  let frame = null;
  window.requestAnimationFrame = callback => { frame = callback; return 1; };
  window.cancelAnimationFrame = () => { frame = null; };
  let observer;
  window.IntersectionObserver = class {
    constructor(callback) { this.callback = callback; this.nodes = []; observer = this; }
    observe(element) { this.nodes.push(element); }
    unobserve() {}
    disconnect() {}
  };
  window.console.warn = () => {};
  if (loaderActive) {
    window.document.documentElement.classList.add('zero-loading');
    window.document.querySelector('.zero-loader').classList.add('is-leaving');
  }
  if (loaderSkipped) window.__zeroLoaderOutcome = { skipped: true };
  const originalText = window.document.getElementById('site-content').textContent;
  window.eval(siteScript);
  window.eval(script);
  return { dom, window, document: window.document, originalText, observer: () => observer, advance: ms => { const callback = frame; if (callback) callback(window.performance.now() + ms); } };
}

{
  const { dom, window, document, originalText, observer } = setup();
  const content = document.getElementById('site-content');
  assert.ok(document.querySelectorAll('[data-build-text]').length > 100, 'small labels and controls are scheduled for typing');
  assert.equal(content.textContent, originalText, 'original text nodes keep their content');
  assert.equal(content.inert, false, 'scrolling and the page are never globally blocked');
  assert.equal(document.documentElement.style.overflow, '', 'scrollbar is never locked');
  assert.equal(document.querySelector('.mock-keys button').inert, true, 'unfinished controls cannot be activated');
  for (const selector of ['.how-backdrop', '.feedback-backdrop', '.features', '.steps', '.faq-border', '.faq-list', '.support-card', '.closing', 'footer']) {
    assert.equal(document.querySelector(selector).style.opacity, '0', `${selector} stays hidden until its scroll stage starts`);
  }

  observer().callback([{ target: document.querySelector('.hero'), isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="hero"]'), 'the visible section starts building');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'skip removes temporary wrappers');
  assert.equal(content.textContent, originalText, 'skip restores the same text');
  assert.equal(document.querySelector('.mock-keys button').inert, false, 'skip restores control input');
  for (const selector of ['.how-backdrop', '.feedback-backdrop', '.features', '.steps', '.faq-border', '.faq-list']) assert.equal(document.querySelector(selector).style.opacity, '', `skip restores ${selector}`);
  assert.equal(document.querySelectorAll('.site-build-overlay').length, 0, 'skip removes cursors and guides');
  document.querySelector('.intro-replay').click();
  assert.ok(document.querySelectorAll('[data-build-text]').length > 100, 'replay re-arms the sections');
  document.querySelector('.site-build-skip').click();
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0);
  assert.equal(content.textContent, originalText);
  dom.window.close();
}
{
  const { dom, window, document, observer, advance } = setup();
  observer().callback([{ target: document.querySelector('.hero'), isIntersecting: true }]);
  advance(800);
  const navLink = document.querySelector('.desktop-nav a[href="./cases/"]');
  const menuButton = document.querySelector('.menu-toggle');
  assert.equal(navLink.inert, false, 'navigation is usable soon after its frame settles, without waiting for all labels');
  assert.equal(menuButton.inert, false, 'mobile navigation becomes usable early as well');
  menuButton.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  menuButton.click();
  assert.equal(document.querySelector('.mobile-menu').open, true, 'the first mobile menu click opens it while the hero is building');
  dom.window.close();
}
{
  const { dom, window, document, observer, advance } = setup();
  observer().callback([{ target: document.querySelector('.hero'), isIntersecting: true }]);
  advance(4000);
  assert.equal(document.querySelector('.hero-download-mount a').inert, false, 'the primary action is available early in the hero build');
  assert.ok(document.querySelector('[data-build-stage="hero"]'), 'the rest of the hero can still animate');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'keyboard navigation finishes the decorative animation');
  assert.equal(document.querySelector('#feedback-message').inert, false, 'off-screen controls can be reached by keyboard');
  dom.window.close();
}
{
  const { dom, document, observer } = setup();
  const editor = document.querySelector('.studio-showcase');
  observer().callback([{ target: editor, isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="editor"]'));
  observer().callback([{ target: editor, isIntersecting: false }]);
  assert.equal(document.querySelector('[data-build-stage="editor"]'), null, 'a section stops running when it leaves the viewport');
  assert.equal(document.querySelector('.mock-keys button').inert, false, 'leaving restores the section controls');
  assert.equal(document.querySelector('.support-card').style.opacity, '0', 'unvisited sections remain hidden until scrolled to');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, window, document, observer } = setup();
  assert.equal(window.sessionStorage.getItem('zero-scroll-intro-v1:home'), 'played', 'the first play is remembered');
  observer().callback([{ target: document.querySelector('.hero'), isIntersecting: true }]);
  window.dispatchEvent(new window.Event('pagehide'));
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'leaving restores a complete page for back/forward cache');
  assert.equal(document.querySelector('.mock-keys button').inert, false);
  dom.window.close();
}
{
  const { dom, document } = setup({ visited: true });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'a returning page does not replay automatically');
  assert.equal(document.querySelectorAll('.site-build-overlay').length, 0);
  assert.equal(document.querySelector('.mock-keys button').inert, false);
  document.querySelector('.intro-replay').click();
  assert.ok(document.querySelectorAll('[data-build-text]').length > 100, 'explicit replay still works on a returning page');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, document } = setup({ visited: true, reload: true });
  assert.ok(document.querySelectorAll('[data-build-text]').length > 100, 'refresh replays the current page despite a previous visit');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, document } = setup({ visited: true, reload: true, reduced: true });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'refresh still respects reduced motion');
  dom.window.close();
}
{
  const { dom, document } = setup({ storageBlocked: true });
  assert.ok(document.querySelectorAll('[data-build-text]').length > 100, 'storage restrictions do not break the page');
  document.querySelector('.site-build-skip').click();
  assert.equal(document.querySelector('.mock-keys button').inert, false);
  dom.window.close();
}
{
  const { dom, document, observer, advance } = setup();
  observer().callback([{ target: document.querySelector('.studio-showcase'), isIntersecting: true }]);
  const button = document.querySelectorAll('.mock-keys button')[1];
  for (let time = 0; time < 25000 && button.inert; time += 100) advance(time);
  assert.equal(button.inert, false, 'a visible control is released before the rest of its section finishes');
  assert.ok(document.querySelector('[data-build-stage="editor"]'), 'the editor is still building');
  button.click();
  assert.equal(document.querySelector('[data-build-stage="editor"]'), null, 'activation completes just that section');
  assert.equal(button.getAttribute('aria-pressed'), 'true', 'the same native click reaches the real button');
  assert.match(document.querySelector('#preview-status').textContent, /LAYER 0 · SWITCH 2/);
  document.querySelector('.layer-buttons button[data-layer="2"]').click();
  document.querySelectorAll('.mock-keys button')[3].click();
  document.querySelector('.mock-knob').click();
  assert.equal(document.querySelector('#display-layer').textContent, 'LAYER 3');
  document.querySelector('.layer-buttons button[data-layer="2"]').click();
  assert.equal(document.querySelectorAll('.mock-keys button')[3].getAttribute('aria-pressed'), 'true', 'each preview layer retains its selection');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, document, observer, advance } = setup();
  const list = document.querySelector('.faq-list');
  observer().callback([{ target: list, isIntersecting: true }]);
  const summary = list.querySelector('summary');
  const detail = summary.parentElement;
  assert.equal(list.querySelectorAll('details').length, 6, 'FAQ has six expandable answers');
  assert.equal(summary.inert, true, 'unrevealed questions cannot be activated');
  for (let time = 0; time < 25000 && summary.inert; time += 100) advance(time);
  assert.equal(summary.inert, false, 'revealed FAQ questions become usable');
  assert.ok(document.querySelector('[data-build-stage="faq-list"]'));
  summary.click();
  assert.equal(document.querySelector('[data-build-stage="faq-list"]'), null, 'opening a question completes its section');
  assert.equal(detail.open, true, 'native summary activation opens its answer');
  summary.click();
  assert.equal(detail.open, false, 'native summary activation closes its answer');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, window, document, observer, advance } = setup();
  const form = document.querySelector('.feedback-form');
  observer().callback([{ target: form, isIntersecting: true }]);
  const field = document.querySelector('#feedback-message');
  for (let time = 0; time < 25000 && field.inert; time += 100) advance(time);
  assert.equal(field.inert, false, 'feedback field is usable before its section finishes');
  assert.ok(document.querySelector('[data-build-stage="feedback-form"]'));
  field.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  assert.equal(document.querySelector('[data-build-stage="feedback-form"]'), null, 'interaction completes form construction');
  field.value = 'A useful idea';
  document.querySelector('#feedback-contact').value = '@visitor';
  const event = new window.Event('submit', { bubbles: true, cancelable: true });
  form.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true, 'frontend-only form does not submit');
  assert.match(document.querySelector('.feedback-status').textContent, /not available yet/i);
  assert.equal(field.value, 'A useful idea', 'feedback remains in the field');
  assert.equal(document.querySelector('#feedback-contact').value, '@visitor');
  assert.equal(field.hasAttribute('name'), false, 'fallback navigation cannot send feedback fields');
  assert.equal(document.querySelector('#feedback-contact').hasAttribute('name'), false);
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, document, observer, advance } = setup();
  const card = document.querySelector('.support-card');
  observer().callback([{ target: card, isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="support"]'), 'support builds when scrolled into view');
  const buttons = [...card.querySelectorAll('.support-actions button')];
  assert.equal(buttons.length, 2);
  assert.ok(buttons.every(button => button.disabled), 'payment controls stay disabled without verified destinations');
  assert.match(card.querySelector('#support-availability').textContent, /aren’t connected yet/i);
  advance(30000);
  assert.equal(document.querySelector('[data-build-stage="support"]'), null, 'support construction completes');
  assert.ok(buttons.every(button => button.disabled), 'animation does not enable unavailable payments');
  document.querySelector('.site-build-skip').click();
  dom.window.close();
}
{
  const { dom, document } = setup({ reduced: true });
  const externalLinks = [...document.querySelectorAll('a[href^="https://github.com/"]')];
  assert.ok(externalLinks.length >= 6, 'desktop, mobile and section GitHub links exist');
  const download = document.querySelector('#download a.button-orange');
  assert.equal(download.href, 'https://github.com/david-8837/MacroPad-/releases', 'Windows download opens the real releases page');
  assert.match(document.getElementById('download-status').textContent, /no Windows installer has been released yet/i, 'availability is not overstated');
  const heroDownload = document.querySelector('.hero-actions a.button');
  assert.equal(heroDownload.href, download.href, 'hero and download section link to the same Windows releases page');
  assert.match(heroDownload.textContent, /download for windows/i);
  assert.match(document.getElementById('hero-download-status').textContent, /not released yet/i);
  assert.ok(document.querySelector('.mobile-nav a[href="#download"]'), 'download is accessible from mobile navigation');
  assert.equal(document.querySelector('.nav-cta').getAttribute('href'), '#support', 'header coffee link leads to the support section');
  assert.ok(document.querySelector('.mobile-nav a[href="#support"]'), 'support is accessible from mobile navigation');
  for (const link of externalLinks) {
    assert.equal(link.target, '_top', 'external links navigate the top-level page without a popup');
    assert.ok(link.rel.split(/\s+/).includes('noreferrer'));
  }
  dom.window.close();
}
{
  const { dom, document } = setup({ reduced: true });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'reduced motion bypasses writing');
  assert.equal(document.querySelector('.intro-replay').disabled, true);
  assert.equal(dom.window.sessionStorage.getItem('zero-scroll-intro-v1:home'), null, 'reduced motion is not marked as an animation play');
  assert.equal(document.querySelector('.feedback-backdrop').style.opacity, '', 'reduced motion keeps backgrounds visible');
  dom.window.close();
}
{
  const { dom, document, originalText } = setup({ failAfter: 25 });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'failed measurement removes partial wrappers');
  assert.equal(document.getElementById('site-content').textContent, originalText, 'failed setup leaves the site intact');
  assert.equal(document.querySelector('.mock-keys button').inert, false, 'failed setup leaves controls usable');
  assert.equal(dom.window.sessionStorage.getItem('zero-scroll-intro-v1:home'), null, 'failed setup is not marked as played');
  dom.window.close();
}
{
  const { dom, window, document, observer, advance } = setup({ loaderActive: true });
  const icon = document.querySelector('.zero-loader-cursor svg');
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'construction waits for the loader to open');
  window.dispatchEvent(new window.CustomEvent('zero-loader-opening'));
  assert.ok(document.querySelectorAll('[data-build-text]').length > 0, 'opening starts construction');
  observer().callback([{ target: document.querySelector('.hero'), isIntersecting: true }]);
  assert.equal(document.querySelector('[data-build-stage="hero"] [data-cursor="interface"] svg'), icon, 'the same loader cursor is handed to the hero');
  advance(200);
  assert.ok(document.querySelector('[data-loader-handoff]'), 'the handoff stays above the opening loader');
  window.dispatchEvent(new window.CustomEvent('zero-loader-done', { detail: { skipped: true } }));
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'skipping mid-reveal releases every control');
  assert.equal(document.querySelectorAll('.site-build-overlay').length, 0);
  dom.window.close();
}
{
  const { dom, window, document, observer } = setup({ loaderActive: true });
  window.dispatchEvent(new window.CustomEvent('zero-loader-done', { detail: { skipped: false } }));
  assert.ok(document.querySelectorAll('[data-build-text]').length > 0, 'dismissing the loader without skipping effects starts construction');
  observer().callback([{ target: document.querySelector('.hero'), isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="hero"]'), 'hero starts after a loader tap');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  dom.window.close();
}
{
  const { dom, document } = setup({ loaderSkipped: true });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'a keyboard skip before intro.js loads still skips effects');
  assert.equal(document.querySelector('.mock-keys button').inert, false, 'delayed skip leaves controls usable');
  dom.window.close();
}
console.log('website scroll intro: all text, scroll safety, replay, reduced motion and fail-open passed');

require('./websiteLoader.test.cjs');
require('./websiteRefresh.test.cjs');
