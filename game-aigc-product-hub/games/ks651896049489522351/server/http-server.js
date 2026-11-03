// ============================================================
// HTTP Server（HTTP + WebSocket 共端口）
// ------------------------------------------------------------
// 从 http.createServer() 统一监听，WebSocket Server 挂载到同一实例。
// 仅开放明确路由，未知路径返回 404。
//
// 路由：
//   POST /api/v1/payments/kwai/notify  — 平台支付回调
//   GET  /healthz                      — 进程存活（数据库未就绪也返回 200）
//   GET  /readyz                       — 服务就绪（含数据库）
//   其他                                — 404
// ============================================================

const http = require('http');
const net = require('net');
const logger = require('./logger');
const { getConfig } = require('./payment/config');
const { handleNotify } = require('./payment/notify-handler');

const READYZ_CHECKS = [];
let ready = false;
let iapHttpHandler = null;
let gameHttpHandler = null;
let adminHttpHandler = null;

function setReady (value) {
  ready = value === true;
}

function isReady () {
  return ready;
}

/**
 * 注册就绪检查回调（由 index.js 在 db.init 后注册）。
 * @param {() => Promise<void>} fn — 抛出异常则 readyz 返回 503
 */
function registerReadyCheck (fn) {
  READYZ_CHECKS.push(fn);
}

function registerIapHttpHandler (handler) {
  iapHttpHandler = handler;
}

function registerGameHttpHandler (handler) {
  gameHttpHandler = handler;
}

// 仅在 ADMIN_TOKEN 已配置时由 index.js 注册；未注册则 /admin 落到 404，
// 生产环境不配这个变量就等同于后台不存在。
function registerAdminHttpHandler (handler) {
  adminHttpHandler = handler;
}

function send (res, status, contentType, body, headers = {}) {
  res.writeHead(status, { ...headers, 'Content-Type': contentType, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function corsHeaders () {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, X-Client-Capabilities',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function clientIp (req, cfg) {
  const remoteAddress = String(req.socket?.remoteAddress || '');
  const trusted = new Set(Array.isArray(cfg.trustedProxyIps) ? cfg.trustedProxyIps : []);
  if (!trusted.has(remoteAddress)) return remoteAddress;
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map(value => value.trim()).filter(value => net.isIP(value));
  chain.push(remoteAddress);
  while (chain.length > 1 && trusted.has(chain[chain.length - 1])) chain.pop();
  return chain[chain.length - 1] || remoteAddress;
}

async function readBody (req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    let oversized = false;
    req.on('data', chunk => {
      if (oversized) return;
      total += chunk.length;
      if (total > maxBytes) {
        oversized = true;
        chunks.length = 0;
        reject(Object.assign(new Error('body_too_large'), { code: 'BODY_TOO_LARGE' }));
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (oversized) {
        reject(Object.assign(new Error('body_too_large'), { code: 'BODY_TOO_LARGE' }));
        return;
      }
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

async function handleRequest (req, res) {
  const url     = req.url.split('?')[0];
  const method  = req.method.toUpperCase();
  const cfg     = getConfig();
  const notifyPath = cfg.notifyPath || '/api/v1/payments/kwai/notify';

  // ---- /healthz ----
  // 返回 ok-<镜像tag>（Dockerfile 构建时注入 DDZ_IMAGE_TAG，本地未注入显示 local），
  // curl 一下即可识别线上运行的代码版本。
  if (url === '/healthz') {
    send(res, 200, 'text/plain', 'ok-' + (process.env.DDZ_IMAGE_TAG || 'local'));
    return;
  }

  // ---- /readyz ----
  if (url === '/readyz') {
    if (!ready || READYZ_CHECKS.length === 0) {
      send(res, 503, 'text/plain', 'not ready');
      return;
    }
    try {
      await Promise.all(READYZ_CHECKS.map(fn => fn()));
      send(res, 200, 'text/plain', 'ready');
    } catch (err) {
      send(res, 503, 'text/plain', 'not ready: ' + (err.message || 'unknown'));
    }
    return;
  }

  // ---- 本地调试后台 ----
  if (adminHttpHandler && (url === '/admin' || url.startsWith('/admin/'))) {
    const responseHeaders = { 'Cache-Control': 'no-store' };
    if (method === 'OPTIONS') {
      send(res, 204, 'text/plain', '', responseHeaders);
      return;
    }
    if (!ready) {
      send(res, 503, 'application/json', JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'service unavailable' } }), responseHeaders);
      return;
    }
    let rawBody = '';
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        rawBody = await readBody(req, cfg.bodyLimitBytes || 16384);
      } catch {
        send(res, 413, 'application/json', JSON.stringify({ error: { code: 'BODY_TOO_LARGE', message: 'body too large' } }), responseHeaders);
        return;
      }
    }
    const host = String(req.headers.host || 'localhost');
    const parsedUrl = new URL(req.url, `http://${host}`);
    const result = await adminHttpHandler.handle({
      method,
      path: url,
      query: parsedUrl.searchParams,
      headers: req.headers,
      rawBody,
      clientIp: clientIp(req, cfg),
    });
    if (result.handled) {
      if (result.html != null) send(res, result.status, 'text/html; charset=utf-8', result.html, responseHeaders);
      else send(res, result.status, 'application/json', JSON.stringify(result.data), responseHeaders);
      return;
    }
  }

  // ---- 客户端游戏大厅 HTTP API（wallet/reward/voice/etc.）----
  if (url.startsWith('/api/v1/game/')) {
    const cors = corsHeaders();
    const responseHeaders = { ...cors, 'Cache-Control': 'no-store' };
    if (method === 'OPTIONS') {
      send(res, 204, 'text/plain', '', responseHeaders);
      return;
    }
    if (!ready || !gameHttpHandler) {
      send(res, 503, 'application/json', JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'service unavailable' } }), responseHeaders);
      return;
    }
    let rawBody = '';
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        rawBody = await readBody(req, cfg.bodyLimitBytes || 16384);
      } catch {
        send(res, 413, 'application/json', JSON.stringify({ error: { code: 'BODY_TOO_LARGE', message: 'body too large' } }), responseHeaders);
        return;
      }
    }
    const host = String(req.headers.host || 'localhost');
    const parsedUrl = new URL(req.url, `http://${host}`);
    const result = await gameHttpHandler.handle({
      method,
      path: url,
      query: parsedUrl.searchParams,
      headers: req.headers,
      rawBody,
      clientIp: clientIp(req, cfg),
    });
    if (result.handled) {
      send(res, result.status, 'application/json', JSON.stringify(result.data), responseHeaders);
      return;
    }
  }

  // ---- 客户端支付 HTTP API ----
  if (url.startsWith('/api/v1/iap/') || url.startsWith('/api/v1/platform-coins/')) {
    const cors = corsHeaders();
    const responseHeaders = { ...cors, 'Cache-Control': 'no-store' };
    if (method === 'OPTIONS') {
      send(res, 204, 'text/plain', '', responseHeaders);
      return;
    }
    if (!ready || !iapHttpHandler) {
      send(res, 503, 'application/json', JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'service unavailable' } }), responseHeaders);
      return;
    }
    let rawBody = '';
    if (method !== 'GET' && method !== 'HEAD') {
      try {
        rawBody = await readBody(req, cfg.bodyLimitBytes || 16384);
      } catch {
        send(res, 413, 'application/json', JSON.stringify({ error: { code: 'BODY_TOO_LARGE', message: 'body too large' } }), responseHeaders);
        return;
      }
    }
    const host = String(req.headers.host || 'localhost');
    const parsedUrl = new URL(req.url, `http://${host}`);
    const result = await iapHttpHandler.handle({
      method,
      path: url,
      query: parsedUrl.searchParams,
      headers: req.headers,
      rawBody,
      clientIp: clientIp(req, cfg),
    });
    if (result.handled) {
      send(res, result.status, 'application/json', JSON.stringify(result.data), responseHeaders);
      return;
    }
  }

  // ---- 支付回调 ----
  if (url === notifyPath) {
    if (method !== 'POST') {
      send(res, 405, 'text/plain', 'Method Not Allowed');
      return;
    }
    if (!ready) {
      send(res, 503, 'text/plain', 'Service Unavailable');
      return;
    }

    let rawBody;
    try {
      rawBody = await readBody(req, cfg.bodyLimitBytes || 16384);
    } catch (err) {
      send(res, 200, 'text/plain', 'failed');
      return;
    }

    try {
      const contentType = req.headers['content-type'] || '';
      const result = await handleNotify(rawBody, contentType);
      send(res, result.httpStatus, 'text/plain', result.text);
    } catch (err) {
      logger.error('[http-server] notify unhandled error:', err.message);
      send(res, 200, 'text/plain', 'failed');
    }
    return;
  }

  send(res, 404, 'text/plain', 'Not Found');
}

/**
 * 创建 HTTP Server（WebSocket Server 由调用方挂载到此实例）。
 * @returns {http.Server}
 */
function createHttpServer () {
  const server = http.createServer((req, res) => {
    handleRequest(req, res).catch(err => {
      logger.error('[http-server] unhandled:', err.message);
      if (!res.headersSent) {
        const path = String(req.url || '').split('?')[0];
        const headers = path.startsWith('/api/v1/iap/') || path.startsWith('/api/v1/platform-coins/')
          ? { 'Cache-Control': 'no-store' }
          : {};
        send(res, 500, 'text/plain', 'Internal Server Error', headers);
      }
    });
  });

  // 限制 HTTP header 大小（Node 默认 16KB，显式设置更清晰）
  server.maxHeadersCount = 50;
  server.headersTimeout  = 10_000;
  server.requestTimeout  = 30_000;

  return server;
}

module.exports = { createHttpServer, registerReadyCheck, registerIapHttpHandler, registerGameHttpHandler, registerAdminHttpHandler, setReady, isReady, handleRequest, clientIp };
