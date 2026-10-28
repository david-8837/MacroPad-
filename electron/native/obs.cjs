/**
 * OBS control over obs-websocket 5.x.
 *
 * A hand-written WebSocket client on top of node:http and node:crypto, because
 * the alternative is shipping a dependency whose native or polyfill behaviour
 * has to be trusted for the one feature a streamer cannot work without. The
 * protocol is small: an HTTP upgrade, then JSON messages with an opcode.
 *
 * Auth is the obs-websocket 5 scheme:
 *   secret' = base64(sha256(password + salt))
 *   auth    = base64(sha256(secret' + challenge))
 *
 * State is polled rather than only event-driven, because the app must be right
 * after a reconnect and after OBS restarts on its own — an event-only model
 * would keep showing "streaming" forever if the one event that said otherwise
 * was missed.
 */

'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const { logLine, ok, fail } = require('./util.cjs');

const DEFAULT_URL = 'ws://127.0.0.1:4455';
const RPC_VERSION = 1;
const RECONNECT_MS = 4000;
const POLL_MS = 2500;

/* ------------------------------------------------------------- websocket */

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OP = {
  Hello: 0, Identify: 1, Identified: 2, Reidentify: 3,
  Event: 5, Request: 6, RequestResponse: 7, RequestBatch: 8, RequestBatchResponse: 9,
};

class ObsSocket {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.buf = Buffer.alloc(0);
    this.fragOp = 0;
    this.fragBuf = Buffer.alloc(0);
    this.rpcId = 0;
    this.pending = new Map();
    this.listeners = new Set();
    this.onStateChange = null;
  }

  /**
   * Connect and authenticate. Resolves with a Result, never throws.
   */
  connect(url, password) {
    return new Promise((resolve) => {
      const parsed = parseWsUrl(url || DEFAULT_URL);
      if (!parsed) {
        resolve(fail(`“${url}” is not a websocket address. It should look like ws://127.0.0.1:4455.`));
        return;
      }

      const key = crypto.randomBytes(16).toString('base64');
      const req = http.request({
        host: parsed.host,
        port: parsed.port,
        path: parsed.path,
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Key': key,
          'Sec-WebSocket-Version': '13',
        },
        timeout: 6000,
      });

      req.on('error', (e) => {
        resolve(fail(translateConnectError(e, parsed)));
      });
      req.on('timeout', () => {
        req.destroy(new Error('timeout'));
      });

      req.on('upgrade', (res, socket) => {
        const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
        if (res.headers['sec-websocket-accept'] !== accept) {
          socket.destroy();
          resolve(fail('OBS answered the handshake incorrectly. Something else may be listening on that port.'));
          return;
        }
        this.socket = socket;
        this.buf = Buffer.alloc(0);
        socket.on('data', (d) => this.onData(d));
        socket.on('close', () => this.handleClose('OBS closed the connection.'));
        socket.on('error', (e) => this.handleClose(`Connection error: ${e.message}`));
        this.expectHello = { password, resolve };
      });

      req.on('response', (res) => {
        // An HTTP response instead of an upgrade means something else is there.
        res.resume();
        resolve(fail(`That address answered with HTTP ${res.statusCode}, not a websocket. Check the port in OBS under Tools → WebSocket Server Settings.`));
      });

      req.end();
    });
  }

  handleClose(reason) {
    const wasConnected = this.connected;
    this.connected = false;
    this.socket = null;
    this.expectHello = null;
    this.pending.forEach((p) => p.reject(new Error(reason)));
    this.pending.clear();
    if (wasConnected && this.onStateChange) this.onStateChange({ connected: false, error: reason });
    logLine('obs', 'disconnected', reason);
  }

  onData(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    for (;;) {
      const frame = this.readFrame();
      if (!frame) break;
      if (frame.op === 8) this.handleClose('OBS sent a close frame.');
      else this.dispatch(frame.text);
    }
  }

  /**
   * Parse one RFC 6455 frame from the front of the buffer.
   *
   * Handles the two things a naive implementation misses: payload lengths above
   * 125 bytes (OBS scene lists exceed this easily) and continuation frames
   * (a large GetSceneList response can be split).
   */
  readFrame() {
    const b = this.buf;
    if (b.length < 2) return null;
    const fin = (b[0] & 0x80) !== 0;
    const opcode = b[0] & 0x0f;
    const masked = (b[1] & 0x80) !== 0;
    let len = b[1] & 0x7f;
    let offset = 2;
    if (len === 126) {
      if (b.length < 4) return null;
      len = b.readUInt16BE(2);
      offset = 4;
    } else if (len === 127) {
      if (b.length < 10) return null;
      const hi = b.readUInt32BE(2);
      const lo = b.readUInt32BE(6);
      // Node buffers cannot exceed 2 GB anyway; a huge length means corruption.
      if (hi !== 0 || lo > 8 * 1024 * 1024) { this.buf = Buffer.alloc(0); return null; }
      len = lo;
      offset = 10;
    }
    let mask = null;
    if (masked) {
      if (b.length < offset + 4) return null;
      mask = b.slice(offset, offset + 4);
      offset += 4;
    }
    if (b.length < offset + len) return null;
    let payload = b.slice(offset, offset + len);
    if (mask) {
      const out = Buffer.allocUnsafe(payload.length);
      for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ mask[i & 3];
      payload = out;
    }
    this.buf = b.slice(offset + len);

    if (opcode === 0) {
      this.fragBuf = Buffer.concat([this.fragBuf, payload]);
      if (!fin) return { op: -1, text: '' };
      const text = this.fragBuf.toString('utf8');
      this.fragBuf = Buffer.alloc(0);
      return { op: this.fragOp, text };
    }
    if (!fin) {
      this.fragOp = opcode;
      this.fragBuf = Buffer.from(payload);
      return { op: -1, text: '' };
    }
    if (opcode === 1) return { op: 1, text: payload.toString('utf8') };
    return { op: 8, text: '' };
  }

  send(obj) {
    if (!this.socket || this.socket.destroyed) return false;
    const payload = Buffer.from(JSON.stringify(obj), 'utf8');
    const mask = crypto.randomBytes(4);
    let header;
    if (payload.length < 126) {
      header = Buffer.alloc(2);
      header[1] = 0x80 | payload.length;
    } else if (payload.length < 65536) {
      header = Buffer.alloc(4);
      header[1] = 0x80 | 126;
      header.writeUInt16BE(payload.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[1] = 0x80 | 127;
      header.writeUInt32BE(0, 2);
      header.writeUInt32BE(payload.length, 6);
    }
    // 0x81 = FIN + text opcode. Client frames must be masked.
    header[0] = 0x81;
    const maskedPayload = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) maskedPayload[i] = payload[i] ^ mask[i & 3];
    try {
      this.socket.write(Buffer.concat([header, mask, maskedPayload]));
      return true;
    } catch (e) {
      logLine('obs', 'write failed', e.message);
      return false;
    }
  }

  dispatch(text) {
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    const op = msg.op;
    const d = msg.d || {};

    if (op === OP.Hello) {
      this.handleHello(d);
      return;
    }
    if (op === OP.Identified) {
      this.connected = true;
      this.listeners.forEach((l) => l(d));
      if (this.expectHello) {
        this.expectHello.resolve(ok(undefined));
        this.expectHello = null;
      }
      if (this.onStateChange) this.onStateChange({ connected: true });
      logLine('obs', 'identified', d.obsWebSocketVersion || '');
      return;
    }
    if (op === OP.RequestResponse) {
      const p = this.pending.get(d.requestId);
      if (p) {
        this.pending.delete(d.requestId);
        p.resolve(d.responseData || {}, d.requestStatus || {});
      }
      return;
    }
    if (op === OP.Event) {
      this.listeners.forEach((l) => l({ event: d.eventType, data: d.eventData || {} }));
    }
  }

  handleHello(d) {
    const identify = {
      rpcVersion: d.rpcVersion || RPC_VERSION,
      eventSubscriptions: 0x2 | 0x4 | 0x20, // scenes, inputs, media — enough for live state
    };
    if (d.authentication) {
      const password = this.expectHello ? this.expectHello.password : undefined;
      if (!password) {
        this.socket && this.socket.destroy();
        if (this.expectHello) {
          this.expectHello.resolve(fail('OBS needs a password. Enter it in Settings and connect again.'));
          this.expectHello = null;
        }
        return;
      }
      identify.authentication = authString(password, d.authentication.salt, d.authentication.challenge);
    }
    this.send({ op: OP.Identify, d: identify });
  }

  /** Send a request and wait for its response. */
  request(type, data = {}, timeoutMs = 5000) {
    if (!this.connected) return Promise.resolve({ ok: false, error: 'OBS is not connected.' });
    const requestId = `k${++this.rpcId}`;
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        resolve({ ok: false, error: `OBS did not answer “${type}” within ${timeoutMs / 1000} seconds. It may be busy or overloaded.` });
      }, timeoutMs);
      this.pending.set(requestId, {
        resolve: (responseData, status) => {
          clearTimeout(timer);
          if (status && status.result === false) {
            resolve({ ok: false, error: obsErrorMessage(status, type) });
          } else {
            resolve({ ok: true, value: responseData });
          }
        },
        reject: (e) => { clearTimeout(timer); resolve({ ok: false, error: e.message }); },
      });
      if (!this.send({ op: OP.Request, d: { requestType: type, requestId, requestData: data } })) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        resolve({ ok: false, error: 'The message could not be sent to OBS.' });
      }
    });
  }

  onEvent(cb) {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  close() {
    if (this.socket) { try { this.socket.end(); } catch { /* ignore */ } }
    this.handleClose('Disconnected.');
  }
}

function authString(password, salt, challenge) {
  const secret = crypto.createHash('sha256').update(String(password) + String(salt)).digest('base64');
  return crypto.createHash('sha256').update(secret + String(challenge)).digest('base64');
}

function parseWsUrl(url) {
  const m = /^wss?:\/\/([^:/]+)(?::(\d+))?(\/.*)?$/i.exec(String(url).trim());
  if (!m) return null;
  return { host: m[1], port: parseInt(m[2] || (/^wss:/i.test(url) ? '443' : '80'), 10), path: m[3] || '/' };
}

function translateConnectError(e, parsed) {
  const code = e && e.code;
  if (code === 'ECONNREFUSED') {
    return `Nothing is listening on ${parsed.host}:${parsed.port}. Start OBS, then turn on the websocket server under Tools → WebSocket Server Settings.`;
  }
  if (code === 'timeout' || e && e.message === 'timeout') {
    return `OBS at ${parsed.host}:${parsed.port} did not respond. A firewall may be blocking it.`;
  }
  if (code === 'ENOTFOUND') return `The address ${parsed.host} could not be resolved.`;
  return `Could not reach OBS: ${e && e.message ? e.message : e}`;
}

function obsErrorMessage(status, type) {
  const code = status && status.code;
  const known = {
    1002: 'OBS does not know that request. It may be a different OBS version.',
    301: 'OBS has nothing with that name.',
    500: 'OBS refused the request in its current state.',
    600: 'A request was already in flight.',
    700: 'OBS could not deliver that.',
  };
  return `${known[code] || `OBS refused “${type}”.`} ${status && status.comment ? status.comment : ''}`.trim();
}

/* ---------------------------------------------------------------- module */

const socket = new ObsSocket();
let url = DEFAULT_URL;
let password = '';
let pollTimer = null;
let reconnectTimer = null;
let wantConnected = false;
let state = emptyState();
const stateListeners = new Set();

function emptyState() {
  return {
    connected: false, streaming: false, recording: false,
    currentScene: null, scenes: [], sources: [], mutedSources: [], error: undefined,
  };
}

function setState(patch) {
  state = Object.assign({}, state, patch);
  stateListeners.forEach((l) => { try { l(state); } catch { /* ignore */ } });
}

socket.onStateChange = (patch) => {
  setState(patch);
  if (!patch.connected) {
    stopPolling();
    if (wantConnected) scheduleReconnect();
  } else {
    startPolling();
  }
};

socket.onEvent((e) => {
  if (!e.event) return;
  switch (e.event) {
    case 'StreamStateChanged':
      setState({ streaming: e.data.outputActive === true && e.data.outputState === 'OBS_WEBSOCKET_OUTPUT_STARTED' ? true : e.data.outputActive === false ? false : state.streaming });
      break;
    case 'RecordStateChanged':
      setState({ recording: e.data.outputActive === true ? true : e.data.outputActive === false ? false : state.recording });
      break;
    case 'CurrentProgramSceneChanged':
      setState({ currentScene: e.data.sceneName || null });
      break;
    case 'SceneCreated': case 'SceneRemoved': case 'SceneNameChanged':
      void refreshScenes();
      break;
    case 'InputMuteStateChanged':
      setState({
        mutedSources: e.data.inputMuted
          ? Array.from(new Set([...state.mutedSources, e.data.inputName]))
          : state.mutedSources.filter((s) => s !== e.data.inputName),
      });
      break;
    case 'InputCreated': case 'InputRemoved':
      void refreshSources();
      break;
    default: break;
  }
});

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (wantConnected) void connect(url, password);
  }, RECONNECT_MS);
}

async function connect(nextUrl, nextPassword) {
  if (nextUrl !== undefined) url = nextUrl || DEFAULT_URL;
  if (nextPassword !== undefined) password = nextPassword || '';
  wantConnected = true;
  socket.close();
  setState({ ...emptyState(), error: undefined });
  const r = await socket.connect(url, password);
  if (!r.ok) {
    setState({ error: r.error });
    wantConnected = false;
    return fail(r.error);
  }
  await refreshScenes();
  await refreshSources();
  await refreshStreamState();
  return ok(undefined);
}

function disconnect() {
  wantConnected = false;
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  stopPolling();
  socket.close();
  setState(emptyState());
  return ok(undefined);
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => { void refreshStreamState(); }, POLL_MS);
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

async function refreshScenes() {
  const r = await socket.request('GetSceneList');
  if (!r.ok) return;
  setState({
    scenes: (r.value.scenes || []).map((s) => s.sceneName),
    currentScene: r.value.currentProgramSceneName || state.currentScene,
  });
}

async function refreshSources() {
  const r = await socket.request('GetInputList');
  if (!r.ok) return;
  const inputs = (r.value.inputs || []).map((i) => i.inputName);
  // Ask about every source at once: sequentially, a scene collection with 30
  // sources would take seconds and the key states would lag behind OBS.
  const results = await Promise.all(
    inputs.map((name) => socket.request('GetInputMute', { inputName: name })),
  );
  const muted = inputs.filter((_n, i) => results[i] && results[i].ok && results[i].value.inputMuted);
  setState({ sources: inputs, mutedSources: muted });
}

async function refreshStreamState() {
  if (!socket.connected) return;
  const [s, r] = await Promise.all([
    socket.request('GetStreamStatus'),
    socket.request('GetRecordStatus'),
  ]);
  setState({
    streaming: s.ok ? Boolean(s.value.outputActive) : state.streaming,
    recording: r.ok ? Boolean(r.value.outputActive) : state.recording,
  });
}

/**
 * One entry point for every action the UI can bind to a key.
 *
 * Keeping the mapping here rather than in the renderer means the local API and
 * the tray can trigger OBS too, with identical behaviour and identical errors.
 */
async function command(action, arg) {
  if (!socket.connected) {
    return fail(state.error || 'OBS is not connected. Connect it in Settings, and make sure the websocket server is enabled in OBS.');
  }
  switch (action) {
    case 'startStreaming': return wrap(await socket.request('StartStream'));
    case 'stopStreaming': return wrap(await socket.request('StopStream'));
    case 'toggleStreaming': return wrap(await socket.request('ToggleStream'));
    case 'startRecording': return wrap(await socket.request('StartRecord'));
    case 'stopRecording': return wrap(await socket.request('StopRecord'));
    case 'toggleRecording': return wrap(await socket.request('ToggleRecord'));
    case 'setScene': {
      if (!arg) return fail('No scene was given.');
      if (!state.scenes.includes(arg)) {
        return fail(`OBS has no scene called “${arg}”. Its scenes are: ${state.scenes.join(', ') || 'none yet'}.`);
      }
      return wrap(await socket.request('SetCurrentProgramScene', { sceneName: arg }));
    }
    case 'nextScene': return stepScene(1);
    case 'previousScene': return stepScene(-1);
    case 'muteSource': return sourceMute(arg, true);
    case 'unmuteSource': return sourceMute(arg, false);
    case 'toggleSourceMute': {
      if (!arg) return fail('No source was given.');
      return wrap(await socket.request('ToggleInputMute', { inputName: arg }));
    }
    default:
      return fail(`“${action}” is not an OBS action this build knows.`);
  }
}

function wrap(r) {
  return r.ok ? ok(undefined) : fail(r.error);
}

async function stepScene(dir) {
  const scenes = state.scenes;
  if (!scenes.length) return fail('OBS has no scenes yet.');
  const i = scenes.indexOf(state.currentScene || '');
  const next = scenes[((i < 0 ? 0 : i) + dir + scenes.length) % scenes.length];
  return wrap(await socket.request('SetCurrentProgramScene', { sceneName: next }));
}

async function sourceMute(name, muted) {
  if (!name) return fail('No source was given.');
  if (!state.sources.includes(name)) {
    return fail(`OBS has no source called “${name}”. Its sources are: ${state.sources.join(', ') || 'none yet'}.`);
  }
  return wrap(await socket.request('SetInputMute', { inputName: name, inputMuted: muted }));
}

function getState() {
  return ok(Object.assign({}, state));
}

function onState(cb) {
  stateListeners.add(cb);
  cb(state);
  return () => stateListeners.delete(cb);
}

/** A readable self-test result for the Diagnostics page. */
async function selfTest() {
  if (!socket.connected) {
    return { ok: false, detail: state.error || 'Not connected. Start OBS and enable Tools → WebSocket Server Settings.' };
  }
  const version = await socket.request('GetVersion');
  return {
    ok: true,
    detail: `Connected to OBS ${version.ok ? version.value.obsVersion : '?'}, websocket ${version.ok ? version.value.obsWebSocketVersion : '?'}. ${state.scenes.length} scenes, ${state.sources.length} sources, ${state.streaming ? 'streaming' : 'not streaming'}, ${state.recording ? 'recording' : 'not recording'}.`,
  };
}

module.exports = { connect, disconnect, command, getState, onState, selfTest, authString, parseWsUrl, obsErrorMessage };
