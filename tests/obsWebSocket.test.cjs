// Run: node tests/obsWebSocket.test.cjs
const assert = require('assert');
const obs = require('../electron/native/obs.cjs');
const { executeAction } = require('../electron/actionExecutor.cjs');

async function runTests() {
  console.log('Testing OBS Studio WebSocket 5.x Integration...');

  // 1. WebSocket URL parsing
  const u1 = obs.parseWsUrl('ws://127.0.0.1:4455');
  assert.strictEqual(u1.host, '127.0.0.1');
  assert.strictEqual(u1.port, 4455);
  assert.strictEqual(u1.path, '/');

  const u2 = obs.parseWsUrl('ws://localhost:9000/obs');
  assert.strictEqual(u2.host, 'localhost');
  assert.strictEqual(u2.port, 9000);
  assert.strictEqual(u2.path, '/obs');

  const u3 = obs.parseWsUrl('wss://studio.remote.net');
  assert.strictEqual(u3.host, 'studio.remote.net');
  assert.strictEqual(u3.port, 443);

  assert.strictEqual(obs.parseWsUrl('not-a-valid-url'), null);
  console.log('  ✓ parseWsUrl passed');

  // 2. Authentication signature calculation (obs-websocket v5 spec)
  const auth = obs.authString('secretpass', 'test_salt', 'test_challenge');
  assert.strictEqual(typeof auth, 'string');
  assert.strictEqual(auth.length, 44, 'Base64 SHA-256 hash must be 44 chars');
  // Deterministic verify
  const auth2 = obs.authString('secretpass', 'test_salt', 'test_challenge');
  assert.strictEqual(auth, auth2, 'authString must be deterministic');
  console.log('  ✓ authString calculation passed');

  // 3. Status code error mapping
  const err301 = obs.obsErrorMessage({ code: 301, comment: 'Missing' }, 'SetScene');
  assert.ok(err301.includes('OBS has nothing with that name'));
  const err1002 = obs.obsErrorMessage({ code: 1002 }, 'BogusReq');
  assert.ok(err1002.includes('does not know that request'));
  console.log('  ✓ obsErrorMessage passed');

  // 4. State initial schema
  const st = obs.getState();
  assert.strictEqual(st.ok, true);
  assert.strictEqual(st.value.connected, false);
  assert.strictEqual(st.value.streaming, false);
  assert.strictEqual(st.value.recording, false);
  assert.strictEqual(st.value.currentScene, null);
  assert.ok(Array.isArray(st.value.scenes));
  console.log('  ✓ getState schema passed');

  // 5. Self-test while offline
  const self = await obs.selfTest();
  assert.strictEqual(self.ok, false);
  assert.ok(self.detail.includes('Not connected') || self.detail.includes('OBS'));
  console.log('  ✓ selfTest passed:', self.detail);

  // 6. Commands when offline safely return descriptive error
  const cmdRes = await obs.command('toggleStreaming');
  assert.strictEqual(cmdRes.ok, false);
  assert.ok(cmdRes.error.includes('OBS is not connected'));
  console.log('  ✓ offline command safety passed');

  // 7. ActionExecutor category: 'obs' integration
  const actRes = await executeAction({
    category: 'obs',
    payload: { obsAction: 'switch_scene', obsTarget: 'Full Camera' },
  });
  assert.strictEqual(actRes.success, false);
  assert.ok(actRes.error.includes('OBS is not connected'));
  console.log('  ✓ actionExecutor category:obs dispatch passed');

  console.log('All obsWebSocket tests passed successfully!');
}

runTests().catch((err) => {
  console.error('obsWebSocket test failed:', err);
  process.exit(1);
});

