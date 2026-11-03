#!/usr/bin/env node
/**
 * preview-check.js —— 打包前健康度扫描
 */
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const whitelist = path.join(REPO, 'packing.whitelist.json');
const packageConfig = JSON.parse(fs.readFileSync(path.join(REPO, 'package/project.config.json'), 'utf8'));
const cfg = fs.existsSync(whitelist) ? JSON.parse(fs.readFileSync(whitelist, 'utf8')) : {
  include: ['package/**'],
  exclude: (packageConfig.setting.ignore || []).map(p => 'package/' + p.replace(/^\.\//, '').replace(/\/$/, '/**')),
  budgetBytes: { singleFileWarnAt: 500 * 1024, totalWarnAt: 5.5 * 1024 * 1024, totalFatalAt: 6 * 1024 * 1024 }
};

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
const allFiles = [];
walk(fs.existsSync(whitelist) ? REPO : path.join(REPO, 'package'), allFiles);

const inPack = [], excluded = [], notMatched = [];
for (const rel of allFiles) {
  if (matchAny(excludeREs, rel)) { excluded.push(rel); continue; }
  if (matchAny(includeREs, rel)) inPack.push(rel);
  else notMatched.push(rel);
}

function human(b) {
  if (b > 1024*1024) return (b/1024/1024).toFixed(2) + ' MB';
  if (b > 1024)      return (b/1024).toFixed(1) + ' KB';
  return b + ' B';
}

let total = 0;
const byDir = {};
const bigOnes = [];
for (const rel of inPack) {
  const sz = fs.statSync(path.join(REPO, rel)).size;
  total += sz;
  const parts = rel.split('/');
  const key = parts.length > 1 ? parts[0] + '/' + parts[1] + '/' : parts[0];
  byDir[key] = (byDir[key] || 0) + sz;
  if (sz >= cfg.budgetBytes.singleFileWarnAt) bigOnes.push({ rel, sz });
}

console.log('=================== 打包预览健康度报告 ===================');
console.log(`将进包文件数    : ${inPack.length}`);
console.log(`将进包总大小    : ${human(total)}`);
console.log(`已排除文件数    : ${excluded.length}`);
console.log(`未匹配文件数    : ${notMatched.length}`);
console.log('');
console.log(`预算：warn ${human(cfg.budgetBytes.totalWarnAt)} · fatal ${human(cfg.budgetBytes.totalFatalAt)}`);
if (total >= cfg.budgetBytes.totalFatalAt) console.log(`❌ 超过 fatal 阈值`);
else if (total >= cfg.budgetBytes.totalWarnAt) console.log(`⚠️  超过 warn 阈值`);
else console.log(`✅ 总体积在预算内`);
console.log('');

console.log('📊 目录占比 Top:');
for (const [dir, sz] of Object.entries(byDir).sort((a,b) => b[1] - a[1]).slice(0, 10)) {
  const pct = (sz / total * 100).toFixed(1);
  console.log(`   ${pct.padStart(5)}%  ${human(sz).padEnd(10)}  ${dir}`);
}
console.log('');

if (bigOnes.length) {
  console.log(`⚠️  单文件超大（≥ ${human(cfg.budgetBytes.singleFileWarnAt)}）：`);
  bigOnes.sort((a,b) => b.sz - a.sz);
  for (const b of bigOnes.slice(0, 15)) console.log(`   ${human(b.sz).padEnd(10)}  ${b.rel}`);
  console.log('');
}

const critical = notMatched.filter(r =>
  (r.startsWith('js/') && r.endsWith('.js') && !r.includes('_archive')) ||
  (r.startsWith('assets/') && /\.(mp3|mp4|jpg|png|m4a)$/i.test(r))
);
if (critical.length) {
  console.log('⚠️  关键文件未匹配（新加的资源忘了写白名单？）：');
  for (const r of critical.slice(0, 20)) console.log(`   ${r}`);
  if (critical.length > 20) console.log(`   ... 还有 ${critical.length - 20} 个`);
  console.log('');
  console.log('💡 遵循 CLAUDE.md 铁律 50，先决定加载时机：');
  console.log('   T1 主包（<500KB 高频）→ 加进 packing.whitelist.json include');
  console.log('   T2 分包 sp2（剧情帧）→ 挪到 assets/frames/');
  console.log('   T3 CDN（>5MB 或稀有）→ 挪到 large-assets/ 并上 CDN');
  console.log('   详见 docs/PACKAGING_STRATEGY.md');
  console.log('');
}

if (total >= cfg.budgetBytes.totalFatalAt) process.exit(1);
