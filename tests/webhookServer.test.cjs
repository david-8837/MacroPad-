// Run: node tests/webhookServer.test.cjs
const http = require('http');
const { createWebhookServer, generateToken } = require('../electron/webhookServer.cjs');
const PORT = 38499, TOKEN = generateToken();
const received = [];
let deliverable = true;
const server = createWebhookServer({ port: PORT, token: TOKEN, getStatus: () => ({ deckId: 'deck-main', deckName: 'Studio Deck' }),
  onEvent: (e) => { if (deliverable) received.push(e); return deliverable; } });

function req(method, path, { headers = {}, body, host } = {}) {
  return new Promise((resolve) => {
    const data = body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body));
    const r = http.request({ host: '127.0.0.1', port: PORT, method, path,
      headers: { ...(host ? { Host: host } : {}), ...(data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {}), ...headers } },
      (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve({ status: res.statusCode, cors: res.headers['access-control-allow-origin'], body: b })); });
    r.on('error', (e) => resolve({ status: 'ERR ' + e.code, body: '' }));
    if (data) r.write(data); r.end();
  });
}
const auth = { Authorization: `Bearer ${TOKEN}` };
const cases = [
  ['GET status (no token needed)',        () => req('GET', '/api/v1/status'), 200],
  ['POST valid trigger + bearer',         () => req('POST', '/api/v1/trigger', { headers: auth, body: { target: 'key', index: 0, action: 'tap' } }), 202],
  ['POST valid via X-Kadowaz-Token',      () => req('POST', '/api/v1/dial', { headers: { 'X-Kadowaz-Token': TOKEN }, body: { direction: 'cw', step: 2 } }), 202],
  ['POST no token (CSRF-style)',          () => req('POST', '/api/v1/trigger', { body: { target: 'key', index: 0 } }), 401],
  ['POST wrong token',                    () => req('POST', '/api/v1/trigger', { headers: { Authorization: 'Bearer nope' }, body: { target: 'key', index: 0 } }), 401],
  ['POST text/plain simple-request',      () => req('POST', '/api/v1/trigger', { headers: { 'Content-Type': 'text/plain' }, body: '{"target":"key","index":0}' }), 401],
  ['DNS-rebinding Host header',           () => req('POST', '/api/v1/trigger', { host: 'evil.example.com:38499', headers: auth, body: { target: 'key', index: 0 } }), 403],
  ['Unknown endpoint (was fake success)', () => req('POST', '/api/v1/anything', { headers: auth, body: {} }), 404],
  ['GET on POST-only route',              () => req('GET', '/api/v1/trigger'), 405],
  ['Malformed JSON',                      () => req('POST', '/api/v1/trigger', { headers: auth, body: '{bad' }), 400],
  ['JSON array body',                     () => req('POST', '/api/v1/trigger', { headers: auth, body: '[1]' }), 400],
  ['key index out of range',              () => req('POST', '/api/v1/trigger', { headers: auth, body: { target: 'key', index: 9 } }), 400],
  ['channel out of range',                () => req('POST', '/api/v1/action', { headers: auth, body: { channel: 4 } }), 400],
  ['layer 0 is valid (0-based)',          () => req('POST', '/api/v1/action', { headers: auth, body: { layer: 0 } }), 202],
  ['negative layer is rejected',          () => req('POST', '/api/v1/action', { headers: auth, body: { layer: -1 } }), 400],
  ['oled line too long',                  () => req('POST', '/api/v1/oled', { headers: auth, body: { line1: 'x'.repeat(40) } }), 400],
  ['oversize body (>64KB)',               () => req('POST', '/api/v1/oled', { headers: auth, body: JSON.stringify({ line1: 'a', pad: 'x'.repeat(70000) }) }), 413],
  ['OPTIONS preflight: no CORS grant',    () => req('OPTIONS', '/api/v1/trigger', { headers: { Origin: 'https://evil.example' } }), 204],
  ['retired profile endpoint is 404',     () => req('POST', '/api/v1/profile', { headers: auth, body: { profileId: 'x' } }), 404],
  ['action without layer is 400',         () => req('POST', '/api/v1/action', { headers: auth, body: {} }), 400],
  ['valid but renderer unavailable',      async () => { deliverable = false; const r = await req('POST', '/api/v1/action', { headers: auth, body: { layer: 2 } }); deliverable = true; return r; }, 503],
];
server.listen(PORT, '127.0.0.1', async () => {
  let pass = 0;
  for (const [name, fn, want] of cases) {
    const r = await fn();
    const ok = r.status === want && r.cors === undefined;
    if (ok) pass++;
    console.log((ok ? 'PASS' : 'FAIL').padEnd(5), String(r.status).padEnd(4), '(want ' + want + ')', name, r.cors ? '  <-- CORS header leaked: ' + r.cors : '');
  }
  console.log(`\n${pass}/${cases.length} passed; events delivered to renderer: ${received.length} (expected 3)`);
  server.close();
  if (pass !== cases.length || received.length !== 3) process.exit(1);
});
