#!/usr/bin/env node
/**
 * static-server.js — package 目录静态服务（Web 预览用）
 *
 * 与 python -m http.server 的区别：
 *   index.html 强制 Cache-Control: no-store，避免浏览器缓存住旧的
 *   BUILD_VERSION，导致 js 改动不生效（破缓存参数根本到不了浏览器）。
 *
 * 用法：node scripts/static-server.js [port]   （默认 8766）
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.argv[2]) || 8766;
const ROOT = path.join(__dirname, '..', 'package');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent(String(req.url || '/').split('?')[0]);
  let filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403).end('Forbidden'); return; }
  if (urlPath === '/' || fs.existsSync(path.join(filePath, 'index.html'))) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('Not Found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    const isHtml = ext === '.html';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      // html 不缓存（保证 BUILD_VERSION 最新）；其余交给 ?v= 版本参数控制
      'Cache-Control': isHtml ? 'no-store' : 'public, max-age=60',
      'Content-Length': st.size,
      'Last-Modified': st.mtime.toUTCString(),
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[static] package 目录: ${ROOT}`);
  console.log(`[static] Web 预览: http://127.0.0.1:${PORT}/ (index.html no-store)`);
});
