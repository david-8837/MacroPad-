// Native details keeps mobile navigation usable without JavaScript.
const mobileMenu = document.querySelector('.mobile-menu');
const menu = document.querySelector('#mobile-menu');
if (mobileMenu && menu) {
  const closeMenu = () => { mobileMenu.open = false; };
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

// Web3Forms access keys are public form identifiers, not secret credentials.
// Leave the data attribute empty until the project owner supplies their key.
const feedbackForm = document.querySelector('.feedback-form');
if (feedbackForm) {
  const message = feedbackForm.querySelector('#feedback-message');
  const contact = feedbackForm.querySelector('#feedback-contact');
  const botcheck = feedbackForm.querySelector('#feedback-botcheck');
  const status = feedbackForm.querySelector('.feedback-status');
  const note = feedbackForm.querySelector('#feedback-note');
  const submit = feedbackForm.querySelector('.feedback-submit');
  const submitLabel = submit.querySelector('.feedback-submit-label');
  const showStatus = (state, text) => { status.dataset.state = state; status.textContent = text; };
  const clearSuccess = () => { if (status.dataset.state === 'success') { status.textContent = ''; delete status.dataset.state; } };
  const key = (feedbackForm.dataset.web3formsKey || '').trim();
  const configured = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  let sending = false;
  note.textContent = configured
    ? 'Feedback is sent via Web3Forms to the ZERO project. Please do not include sensitive information.'
    : 'Feedback sending isn’t connected yet. Nothing will be sent or saved.';
  message.addEventListener('input', () => { message.setCustomValidity(''); clearSuccess(); });
  contact.addEventListener('input', clearSuccess);
  feedbackForm.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    if (!message.value.trim()) {
      message.setCustomValidity('Please write your feedback first.');
      message.reportValidity();
      return;
    }
    if (!configured) {
      showStatus('error', 'Sending is not available yet. Your feedback is still here, but it has not been sent or saved.');
      return;
    }
    if (botcheck.checked) {
      showStatus('error', 'Feedback could not be sent. Please try again.');
      return;
    }
    const originalMessage = message.value;
    const originalContact = contact.value;
    const payload = { access_key: key, subject: 'ZERO website feedback', from_name: 'ZERO website', message: originalMessage.trim(), contact: originalContact.trim(), botcheck: '' };
    // Only use an email as Reply-To when it really looks like an email. Social
    // handles remain in the separate contact field and are never rejected.
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.contact)) payload.email = payload.contact;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    sending = true; submit.disabled = true; submit.setAttribute('aria-busy', 'true');
    submit.dataset.state = 'sending'; submitLabel.textContent = 'Sending…';
    showStatus('sending', 'Sending your feedback…');
    try {
      const response = await fetch('https://api.web3forms.com/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload), signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok || result.success !== true) throw new Error('Feedback was not accepted');
      // Do not erase edits made while the request was in flight.
      if (message.value === originalMessage && contact.value === originalContact) {
        message.value = ''; contact.value = '';
        showStatus('success', 'Thank you! Your feedback was successfully sent.');
      } else {
        showStatus('success', 'Your feedback was successfully sent. Your recent edits are still here.');
      }
    } catch (_) {
      showStatus('error', 'Could not confirm your feedback was sent. Your message is still here; please try again.');
    } finally {
      window.clearTimeout(timeout); sending = false; submit.disabled = false; submit.removeAttribute('aria-busy');
      delete submit.dataset.state; submitLabel.textContent = 'Send feedback';
    }
  });
}
