const toggle = document.querySelector('.menu-toggle');
const menu = document.querySelector('#mobile-menu');
if (toggle && menu) {
  const closeMenu = () => { toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-label', 'Open navigation'); menu.hidden = true; };
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    menu.hidden = !open;
  });
  menu.addEventListener('click', event => { if (event.target.closest('a')) closeMenu(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
}
// This is an interactive illustration, not a connection to a physical pad.
const layerButtons = document.querySelectorAll('.layer-buttons button');
const displayLayer = document.querySelector('#display-layer');
const previewStatus = document.querySelector('#preview-status');
const keys = document.querySelectorAll('.mock-keys button');
const previewKnob = document.querySelector('.mock-knob');
const selectedKeys = [0, 0, 0, 0];
let selectedLayer = 0;
function updatePreview() {
  layerButtons.forEach(button => {
    const active = Number(button.dataset.layer) === selectedLayer;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  keys.forEach((button, index) => {
    const active = index === selectedKeys[selectedLayer];
    button.classList.toggle('selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (displayLayer) displayLayer.textContent = `LAYER ${selectedLayer}`;
  if (previewStatus) previewStatus.textContent = `LAYER ${selectedLayer} · SWITCH ${selectedKeys[selectedLayer] + 1} SELECTED`;
}
layerButtons.forEach(button => button.addEventListener('click', () => {
  selectedLayer = Number(button.dataset.layer);
  updatePreview();
}));
keys.forEach((button, index) => button.addEventListener('click', () => {
  selectedKeys[selectedLayer] = index;
  updatePreview();
}));
previewKnob?.addEventListener('click', () => {
  selectedLayer = (selectedLayer + 1) % selectedKeys.length;
  updatePreview();
});
