const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const html = fs.readFileSync('index.html', 'utf8');
const dom = () => new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/' });
{
  const { window } = dom();
  assert.ok(window.document.querySelector('#startup-screen'), 'loading screen exists before the app starts');
  assert.equal(window.document.querySelector('#startup-status').textContent, 'Loading the editor…');
  window.dispatchEvent(new window.Event('kadowaz-editor-ready'));
  assert.equal(window.document.querySelector('#startup-screen'), null, 'ready removes the loading screen immediately');
  window.close();
}
{
  const { window } = dom();
  window.document.querySelector('#app-entry').dispatchEvent(new window.Event('error'));
  assert.equal(window.document.querySelector('#startup-error').style.display, 'block', 'script load failure shows retry');
  assert.equal(window.document.querySelector('#startup-status').style.display, 'none');
  window.dispatchEvent(new window.Event('kadowaz-editor-ready'));
  assert.equal(window.document.querySelector('#startup-screen'), null, 'late readiness still recovers');
  window.close();
}
{
  const dark = new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/', beforeParse: w => w.localStorage.setItem('kadowaz_app_theme', 'dark') });
  assert.equal(dark.window.document.documentElement.dataset.theme, 'dark', 'saved theme is read before the entry bundle');
  assert.equal(dark.window.getComputedStyle(dark.window.document.querySelector('#startup-screen')).backgroundColor, 'rgb(23, 27, 34)');
  dark.window.close();
  const light = dom();
  assert.equal(light.window.document.documentElement.dataset.theme, 'light');
  assert.equal(light.window.getComputedStyle(light.window.document.querySelector('#startup-screen')).backgroundColor, 'rgb(255, 255, 255)');
  light.window.close();
}
console.log('browser startup: immediate loading, readiness and failure recovery passed');
