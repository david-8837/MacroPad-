const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { JSDOM } = require('jsdom');

const root = join(__dirname, '..');
const html = readFileSync(join(root, 'website/index.html'), 'utf8');
const script = readFileSync(join(root, 'website/intro.js'), 'utf8');
const siteScript = readFileSync(join(root, 'website/script.js'), 'utf8');

function setup({ reduced = false, failAfter = Infinity } = {}) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
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
  observer().callback([{ target: document.querySelector('.hero'), isIntersecting: true }]);
  assert.ok(document.querySelector('[data-build-stage="hero"]'), 'the visible section starts building');
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'skip removes temporary wrappers');
  assert.equal(content.textContent, originalText, 'skip restores the same text');
  assert.equal(document.querySelector('.mock-keys button').inert, false, 'skip restores control input');
  assert.equal(document.querySelectorAll('.site-build-overlay').length, 0, 'skip removes cursors and guides');
  document.querySelector('.intro-replay').click();
  assert.ok(document.querySelectorAll('[data-build-text]').length > 100, 'replay re-arms the sections');
  document.querySelector('.site-build-skip').click();
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0);
  assert.equal(content.textContent, originalText);
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
  const { dom, document } = setup({ reduced: true });
  const externalLinks = [...document.querySelectorAll('a[href^="https://github.com/"]')];
  assert.ok(externalLinks.length >= 6, 'desktop, mobile and section GitHub links exist');
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
  dom.window.close();
}
{
  const { dom, document, originalText } = setup({ failAfter: 25 });
  assert.equal(document.querySelectorAll('[data-build-text]').length, 0, 'failed measurement removes partial wrappers');
  assert.equal(document.getElementById('site-content').textContent, originalText, 'failed setup leaves the site intact');
  assert.equal(document.querySelector('.mock-keys button').inert, false, 'failed setup leaves controls usable');
  dom.window.close();
}
console.log('website scroll intro: all text, scroll safety, replay, reduced motion and fail-open passed');
