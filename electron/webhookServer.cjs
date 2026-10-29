// Localhost REST / webhook server for KADOWAZ Deck Studio.
//
// Deliberately free of any `electron` import so it can be unit-tested with plain Node.
//
// Security model:
//  - Bound to 127.0.0.1 only.
//  - Every POST requires the shared token (Authorization: Bearer <token> or X-Kadowaz-Token).
//    Without it, any web page in the user's browser could fire deck actions at
//    http://127.0.0.1:38491 (a "simple" cross-origin POST needs no CORS preflight).
//  - The Host header must be a loopback name, which blocks DNS-rebinding attacks.
//  - No CORS headers are sent, so browsers cannot read responses or pass preflight.
//  - The server only *queues* requests for the renderer, which runs the actions the user
//    has already configured on keys/dial. It never executes arbitrary commands itself.

const http = require('http');
const crypto = require('crypto');

const MAX_BODY_BYTES = 64 * 1024;

// Endpoint -> validator. A validator returns an error string, or null when the body is OK.
const ROUTES = {
  '/api/v1/trigger': (b) => {
    if (b.target !== 'key') return 'target must be "key"';
    if (!Number.isInteger(b.index) || b.index < 0 || b.index > 8) return 'index must be an integer 0-8';
    if (b.action !== undefined && !['tap', 'hold', 'double'].includes(b.action)) {
      return 'action must be "tap", "hold" or "double"';
    }
    return null;
  },
  '/api/v1/dial': (b) => {
    if (!['cw', 'ccw', 'press'].includes(b.direction)) return 'direction must be "cw", "ccw" or "press"';
    if (b.step !== undefined && (!Number.isInteger(b.step) || b.step < 1 || b.step > 10)) {
      return 'step must be an integer 1-10';
    }
    return null;
  },
  '/api/v1/oled': (b) => {
    for (const k of ['line1', 'line2']) {
      if (b[k] !== undefined && (typeof b[k] !== 'string' || b[k].length > 32)) {
        return `${k} must be a string of at most 32 characters`;
      }
    }
    if (b.line1 === undefined && b.line2 === undefined) return 'provide line1 and/or line2';
    return null;
  },
  // Single-deck build: this selects an editor preview layer only, not the pad.
  // Accept `layer` (0-based 0–3) and normalise to `channel` for the renderer.
  '/api/v1/action': (b) => {
    if (b.channel === undefined && b.layer !== undefined) {
      b.channel = b.layer;
    }
    if (b.channel === undefined) return 'provide "layer" (0-3)';
    if (!Number.isInteger(b.channel) || b.channel < 0 || b.channel > 3) {
      return 'layer must be an integer 0-3';
    }
    return null;
  },
};

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function tokensEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function extractToken(req) {
  const auth = req.headers['authorization'];
  if (typeof auth === 'string' && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim();
  const custom = req.headers['x-kadowaz-token'];
  return typeof custom === 'string' ? custom.trim() : '';
}

function isLoopbackHost(hostHeader, port) {
  if (typeof hostHeader !== 'string') return false;
  const host = hostHeader.toLowerCase();
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        // Do not destroy the socket here: that would reset the connection before the 413
        // response can be written. Remaining chunks are ignored (aborted) and the handler
        // answers with "Connection: close", so Node closes the socket once it has replied.
        chunks.length = 0;
        reject(Object.assign(new Error('Payload too large'), { status: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(Object.assign(new Error('JSON body must be an object'), { status: 400 }));
          return;
        }
        resolve(parsed);
      } catch {
        reject(Object.assign(new Error('Malformed JSON payload'), { status: 400 }));
      }
    });
    req.on('error', (err) => reject(err));
  });
}

/**
 * @param {object} opts
 * @param {number} opts.port
 * @param {string} opts.token
 * @param {() => object} opts.getStatus   extra fields for GET /api/v1/status
 * @param {(event: object) => boolean} opts.onEvent  returns false if nobody can receive it
 */
function createWebhookServer({ port, token, getStatus, onEvent }) {
  const server = http.createServer(async (req, res) => {
    if (!isLoopbackHost(req.headers.host, port)) {
      sendJson(res, 403, { error: 'Forbidden host' });
      return;
    }

    const url = (req.url || '').split('?')[0];

    // Never grant cross-origin access. Preflights simply get no CORS headers and fail.
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (url === '/api/v1/status' && req.method === 'GET') {
      sendJson(res, 200, {
        status: 'online',
        app: 'KADOWAZ Deck Studio',
        port,
        ...(typeof getStatus === 'function' ? getStatus() : {}),
      });
      return;
    }

    const validate = ROUTES[url];
    if (!validate) {
      sendJson(res, 404, { error: 'Endpoint not found' });
      return;
    }
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Use POST' });
      return;
    }

    if (!tokensEqual(extractToken(req), token)) {
      sendJson(res, 401, { error: 'Missing or invalid token. Send "Authorization: Bearer <token>".' });
      return;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, err.status || 400, { error: err.message || 'Bad request' },
        err.status === 413 ? { Connection: 'close' } : {});
      return;
    }

    const problem = validate(body);
    if (problem) {
      sendJson(res, 400, { error: problem });
      return;
    }

    const delivered = onEvent({ source: 'webhook', endpoint: url, data: body });
    if (!delivered) {
      sendJson(res, 503, { error: 'Deck Studio window is not available to handle the request' });
      return;
    }
    // 202: the request was validated and handed to the UI; its outcome is not known here.
    sendJson(res, 202, { success: true, queued: true, endpoint: url });
  });

  return server;
}

module.exports = { createWebhookServer, generateToken, ROUTES, MAX_BODY_BYTES };
