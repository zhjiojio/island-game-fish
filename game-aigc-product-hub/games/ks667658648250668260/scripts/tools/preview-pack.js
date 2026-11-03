#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const target = process.argv[2] || path.join(REPO, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(REPO, 'packing.whitelist.json'), 'utf8'));

function globToRegex(g) {
  let re = '';
  for (let i = 0; i < g.length; ) {
    const c = g[i];
    if (c === '*' && g[i+1] === '*' && g[i+2] === '/') { re += '(?:.*/)?'; i += 3; }
    else if (c === '*' && g[i+1] === '*') { re += '.*'; i += 2; }
    else if (c === '*') { re += '[^/]*'; i++; }
    else if (c === '?') { re += '[^/]'; i++; }
    else if ('.+^${}()|[]\\'.includes(c)) { re += '\\' + c; i++; }
    else { re += c; i++; }
  }
  return new RegExp('^' + re + '$');
}
const includeREs = cfg.include.map(globToRegex);
const excludeREs = cfg.exclude.map(globToRegex);
const matchAny = (res, rel) => res.some(r => r.test(rel));

function walk(dir, out) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git','node_modules','dist','.codeflicker','tmp'].includes(e.name)) continue;
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else out.push(path.relative(REPO, full));
  }
}
const all = [];
walk(REPO, all);

let n = 0, bytes = 0;
for (const rel of all) {
  if (matchAny(excludeREs, rel)) continue;
  if (!matchAny(includeREs, rel)) continue;
  const dst = path.join(target, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(REPO, rel), dst);
  bytes += fs.statSync(dst).size;
  n++;
}
console.log(`   ✅ 已拷贝 ${n} 个文件，共 ${(bytes/1024/1024).toFixed(2)} MB → ${target}`);
