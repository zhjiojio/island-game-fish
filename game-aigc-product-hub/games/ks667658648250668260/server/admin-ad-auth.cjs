'use strict';

// Deploy behind HTTPS, then configure the game's identityEndpoint to /admin/ad-auth.
// Required server-only environment: KWAI_APP_ID, KWAI_APP_SECRET.
// Official game API: https://open.kuaishou.com/miniGameDocs/gameDev/api/open/login/auth.code2Session.html
const http = require('node:http');
const https = require('node:https');
const { createHmac } = require('node:crypto');

const ADMIN_OPENIDS = new Set([
  '120592009db29834aa07fb38a13cde0a4d',
  '120592009db29834aa07fb38a116ec6f9b',
]);
const DENIED = Object.freeze({ adminAdControl: false });
const BODY_LIMIT = 2048;
const UPSTREAM_LIMIT = 16384;
const LEASE_MS = 5 * 60 * 1000;

function errorWithStatus(status) {
  const error = new Error('Identity verification unavailable');
  error.status = status;
  return error;
}

function exchangeCode({ appId, appSecret, code, signal }) {
  const url = new URL('https://open.kuaishou.com/game/minigame/jscode2session');
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');
  return new Promise((resolve, reject) => {
    const request = https.get(url, { signal, headers: { accept: 'application/json' } }, (response) => {
      if (response.statusCode !== 200) {
        response.destroy();
        reject(errorWithStatus(502));
        return;
      }
      const chunks = [];
      let length = 0;
      response.on('data', (chunk) => {
        length += chunk.length;
        if (length > UPSTREAM_LIMIT) {
          reject(errorWithStatus(502));
          response.destroy();
          return;
        }
        chunks.push(chunk);
      });
      response.on('error', () => reject(errorWithStatus(502)));
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch (_) { reject(errorWithStatus(502)); }
      });
    });
    // Do not log the upstream URL or raw error: the URL contains server credentials.
    request.on('error', () => reject(errorWithStatus(502)));
  });
}

function readBody(request, timeoutMs) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let length = 0;
    let settled = false;
    const timer = setTimeout(() => finish(errorWithStatus(408)), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      request.removeListener('data', onData);
      request.removeListener('end', onEnd);
      request.removeListener('aborted', onAborted);
      if (error) { request.pause(); reject(error); }
      else resolve(value);
    }
    function onData(chunk) {
      length += chunk.length;
      if (length > BODY_LIMIT) { finish(errorWithStatus(413)); return; }
      chunks.push(chunk);
    }
    function onEnd() {
      try { finish(null, JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { finish(errorWithStatus(400)); }
    }
    function onAborted() { finish(errorWithStatus(400)); }
    request.on('data', onData);
    request.on('end', onEnd);
    request.on('aborted', onAborted);
    request.on('error', onAborted);
  });
}

function respond(response, status, body) {
  if (response.destroyed || response.writableEnded) return;
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, private',
    pragma: 'no-cache',
    'x-content-type-options': 'nosniff',
    ...(status >= 400 ? { connection: 'close' } : {}),
    ...(status === 405 ? { allow: 'POST' } : {}),
  });
  response.end(JSON.stringify(body));
}

function createHandler(options = {}) {
  const appId = options.appId ?? process.env.KWAI_APP_ID;
  const appSecret = options.appSecret ?? process.env.KWAI_APP_SECRET;
  const exchange = options.exchangeCode || exchangeCode;
  const now = options.now || Date.now;
  const upstreamTimeoutMs = options.upstreamTimeoutMs ?? 6000;
  const bodyTimeoutMs = options.bodyTimeoutMs ?? 5000;
  return async function adminAdAuth(request, response) {
    if (request.url !== '/admin/ad-auth') { respond(response, 404, DENIED); return; }
    if (request.method !== 'POST') { respond(response, 405, DENIED); return; }
    if (typeof appId !== 'string' || !appId || typeof appSecret !== 'string' || !appSecret) {
      respond(response, 503, DENIED); return;
    }
    const contentType = request.headers['content-type'] || '';
    if (!/^application\/json(?:\s*;\s*charset\s*=\s*utf-8)?\s*$/i.test(contentType)) {
      respond(response, 415, DENIED); return;
    }
    const declaredLength = request.headers['content-length'];
    if (declaredLength && (!/^\d+$/.test(declaredLength) || Number(declaredLength) > BODY_LIMIT)) {
      respond(response, 413, DENIED); return;
    }
    try {
      const body = await readBody(request, bodyTimeoutMs);
      if (!body || typeof body !== 'object' || Array.isArray(body) ||
          Object.keys(body).length !== 1 || typeof body.code !== 'string' ||
          body.code.length < 1 || body.code.length > 1024 || /[\s\u0000-\u001f\u007f]/.test(body.code)) {
        respond(response, 400, DENIED); return;
      }
      const controller = new AbortController();
      let timer;
      let platform;
      try {
        platform = await Promise.race([
          Promise.resolve().then(() => exchange({ appId, appSecret, code: body.code, signal: controller.signal })),
          new Promise((_, reject) => {
            timer = setTimeout(() => { reject(errorWithStatus(504)); controller.abort(); }, upstreamTimeoutMs);
          }),
        ]);
      } finally { clearTimeout(timer); }
      // Kuaishou uses numeric result=1 for success. Missing or other results fail closed,
      // even if the response happens to contain a whitelisted open_id.
      if (!platform || platform.result !== 1 || typeof platform.open_id !== 'string' || !platform.open_id) {
        respond(response, 502, DENIED); return;
      }
      if (!ADMIN_OPENIDS.has(platform.open_id)) { respond(response, 200, DENIED); return; }
      const accountTag = createHmac('sha256', appSecret)
        .update('weihunqi:admin-ad-account:v1\0')
        .update(platform.open_id)
        .digest('hex');
      respond(response, 200, { adminAdControl: true, accountTag, expiresAt: now() + LEASE_MS });
    } catch (error) {
      respond(response, (error && error.status) || 502, DENIED);
    }
  };
}

module.exports = { createHandler, handler: createHandler() };

if (require.main === module) {
  if (!process.env.KWAI_APP_ID || !process.env.KWAI_APP_SECRET) {
    console.error('Configure server-only KWAI_APP_ID and KWAI_APP_SECRET before starting.');
    process.exitCode = 1;
  } else {
    const port = Number(process.env.PORT || 8788);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      console.error('PORT must be an integer from 1 to 65535.');
      process.exitCode = 1;
    } else {
      const server = http.createServer(module.exports.handler);
      server.requestTimeout = 10000;
      server.headersTimeout = 10000;
      server.listen(port, '127.0.0.1', () => {
        console.log(`Admin identity endpoint: http://127.0.0.1:${port}/admin/ad-auth (requires an HTTPS reverse proxy).`);
      });
    }
  }
}
