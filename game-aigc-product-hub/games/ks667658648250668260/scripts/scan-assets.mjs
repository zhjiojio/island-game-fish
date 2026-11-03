#!/usr/bin/env node
/**
 * scan-assets.mjs — 扫描仓库中所有素材引用，产出 manifests/assets.json
 *
 * 输入源：
 *   1. 代码里 https://p*-ad.adkwai.com/... 的 CDN URL  → 直接登记
 *   2. 代码里 assets/xxx.mp4|png|jpg|mp3 的相对路径   → 标记 needsUpload
 *   3. materials-src/ 生产原料（未来）                 → 标记 needsUpload
 *
 * 产出：manifests/assets.json  { assets: { id: { type, cdn|local, size?, sha?, refs: [...] } } }
 *
 * 用法：node scripts/scan-assets.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'manifests', 'assets.json');

// —— 1. 遍历需要扫的代码文件
const CODE_GLOBS = ['package/js', 'package/index.html', 'package/game.js', 'package/events.js', 'content'];
function walk(p, out = []) {
  if (!fs.existsSync(p)) return out;
  const st = fs.statSync(p);
  if (st.isFile()) { if (/\.(js|json|html)$/.test(p)) out.push(p); return out; }
  for (const f of fs.readdirSync(p)) {
    if (f.startsWith('.') || f === 'node_modules') continue;
    walk(path.join(p, f), out);
  }
  return out;
}
const codeFiles = CODE_GLOBS.flatMap(g => walk(path.join(ROOT, g)));

// —— 2. 正则抓引用
const RE_CDN = /https?:\/\/[^\s"')]+\.(mp4|mov|webm|png|jpg|jpeg|mp3|wav|ogg)/gi;
const RE_LOCAL = /(?:^|['"`(\s=])((?:assets|avatars|images)\/[a-zA-Z0-9_./-]+\.(?:mp4|mov|webm|png|jpg|jpeg|mp3|wav|ogg))/gi;

const cdnRefs = new Map();   // url  -> Set(files)
const localRefs = new Map(); // path -> Set(files)

for (const f of codeFiles) {
  const src = fs.readFileSync(f, 'utf8').split('\n').filter(line => !/^\s*(?:\/\/|\*)/.test(line)).join('\n');
  const rel = path.relative(ROOT, f);
  for (const m of src.matchAll(RE_CDN)) {
    const url = m[0];
    if (!cdnRefs.has(url)) cdnRefs.set(url, new Set());
    cdnRefs.get(url).add(rel);
  }
  for (const m of src.matchAll(RE_LOCAL)) {
    const p = m[1];
    if (!localRefs.has(p)) localRefs.set(p, new Set());
    localRefs.get(p).add(rel);
  }
}

// —— 3. 生成 assetId：从 URL/路径最后一段
function makeId(urlOrPath) {
  const base = path.basename(urlOrPath).replace(/\.[^.]+$/, '');
  return base.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}
function typeOf(name) {
  const ext = path.extname(name).toLowerCase();
  if (['.mp4', '.mov', '.webm'].includes(ext)) return 'video';
  if (['.png', '.jpg', '.jpeg'].includes(ext)) return 'image';
  if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
  return 'other';
}

// —— 4. 尝试保留原 manifest 中的 sha/size（增量）
let prev = { assets: {} };
if (fs.existsSync(MANIFEST)) {
  try { prev = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')); } catch (_) {}
}

const assets = {};
const seenIds = new Set();
function uniqueId(base) {
  let id = base, i = 2;
  while (seenIds.has(id)) id = `${base}_${i++}`;
  seenIds.add(id);
  return id;
}

// 4a) CDN 引用（已上传）
for (const [url, refs] of cdnRefs) {
  const id = uniqueId(makeId(url));
  assets[id] = {
    type: typeOf(url),
    cdn: url,
    status: 'published',
    refs: [...refs]
  };
}

// 4b) 本地引用（需要上传）
for (const [p, refs] of localRefs) {
  const id = uniqueId(makeId(p));
  const abs = path.join(ROOT, 'package', p);
  let size = null, sha = null;
  if (fs.existsSync(abs)) {
    size = fs.statSync(abs).size;
    sha = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex').slice(0, 16);
  }
  assets[id] = {
    type: typeOf(p),
    local: p,
    size,
    sha,
    status: fs.existsSync(abs) ? 'bundled' : 'missing',
    refs: [...refs]
  };
}

// —— 5. 汇总统计
const stats = {
  total: Object.keys(assets).length,
  published: 0,
  needs_upload: 0,
  missing: 0,
  local_bytes: 0
};
for (const a of Object.values(assets)) {
  stats[a.status] = (stats[a.status] || 0) + 1;
  if (a.size) stats.local_bytes += a.size;
}

const manifest = {
  version: new Date().toISOString().slice(0, 10),
  generatedAt: new Date().toISOString(),
  cdnBase: 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260',
  stats,
  assets
};

fs.mkdirSync(path.dirname(MANIFEST), { recursive: true });
fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

console.log(`\n✅ manifests/assets.json 生成完毕`);
console.log(`   ├─ 总计   ${stats.total} 条`);
console.log(`   ├─ 已发布 ${stats.published} (在 CDN 上)`);
console.log(`   ├─ 包内 ${stats.bundled || 0} (本地资源，${(stats.local_bytes / 1024 / 1024).toFixed(2)} MB)`);
console.log(`   └─ 缺失   ${stats.missing} (代码引用但文件不存在)`);
console.log('图片运行时清单校验：node scripts/tools/check-image-manifest.cjs');
