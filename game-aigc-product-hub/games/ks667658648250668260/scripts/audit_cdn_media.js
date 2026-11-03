#!/usr/bin/env node
/**
 * scripts/audit_cdn_media.js
 * ---------------------------
 * v72.3 · 扫描 js/story.js 里所有 media.file 引用，检查：
 *   1) CDN URL 是否 200 存活
 *   2) 本地相对路径（assets/xxx）是否真实存在
 *   3) 裸文件名（既不是 http、也不是 assets/）→ 报警
 *
 * 用法：node scripts/audit_cdn_media.js
 *
 * 退出码：0 全绿 · 1 有 404/丢失
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');
const STORY = fs.readFileSync(path.join(ROOT, 'js/story.js'), 'utf8');

// 抽取所有 media.file 字段
// v78.8 修复：原正则 /file:\s*"([^"]+)"/ 只匹配【无引号 key】的老 story.js 写法；
//   v73.0 起 story.js 由 scripts/tools/build-story.js 用 JSON.stringify 生成，key 带引号（"file": "..."），
//   导致这个审计脚本长期输出「发现 0 条 media.file 引用 → ✅ 全部素材可用」的假绿灯（铁律 96 同类问题）。
//   现改为真正 require story.js 后遍历节点对象，不再靠正则刮文本。
const refs = [];
{
  const g = global;
  const prevWindow = g.window;
  g.window = {};
  delete require.cache[require.resolve(path.join(ROOT, 'js/story.js'))];
  require(path.join(ROOT, 'js/story.js'));
  const RAW = g.window.STORY || g.STORY || {};
  g.window = prevWindow;

  const buckets = [RAW.nodes || {}, RAW.endings || {}];
  const seen = Object.create(null);
  buckets.forEach(function (bucket) {
    Object.keys(bucket).forEach(function (id) {
      const n = bucket[id];
      if (!n || !n.media || !n.media.file) return;
      const url = String(n.media.file);
      if (!/\.(jpg|jpeg|png|webp|mp4|mov)$/i.test(url)) return;
      if (seen[url + '|' + id]) return;
      seen[url + '|' + id] = 1;
      // 定位行号（尽力而为：在源文本里找该 url 第一次出现的位置）
      const idx = STORY.indexOf(url);
      const line = idx >= 0 ? STORY.substring(0, idx).split('\n').length : 0;
      refs.push({ url, line, node: id });
    });
  });
}
if (!refs.length) {
  console.error('[audit] ❌ 一条 media.file 都没抽到 —— 极可能是抽取逻辑又和 story.js 生成格式脱节了，拒绝给绿灯');
  process.exit(1);
}

console.log(`[audit] 发现 ${refs.length} 条 media.file 引用`);

function head(url, timeout = 8000) {
  return new Promise((resolve) => {
    try {
      const req = https.request(url, { method: 'HEAD', timeout }, (res) => {
        resolve(res.statusCode);
        res.resume();
      });
      req.on('error', () => resolve(0));
      req.on('timeout', () => { req.destroy(); resolve(-1); });
      req.end();
    } catch (e) { resolve(0); }
  });
}

(async () => {
  const bad = [];
  // 分组
  const cdnRefs = refs.filter(r => /^https?:\/\//.test(r.url));
  const localRefs = refs.filter(r => !/^https?:\/\//.test(r.url) && r.url.includes('/'));
  const bareRefs = refs.filter(r => !/^https?:\/\//.test(r.url) && !r.url.includes('/'));

  // 1) 本地文件检查
  //   v92.0 · 瘦包后所有打包素材都在 package/ 下（仓库根已无 assets/images 副本），
  //   剧本里的相对路径（images/lastframes/xxx.jpg）是相对 package/ 而非仓库根。
  //   两处都找不到才算 missing。
  for (const r of localRefs) {
    const candidates = [path.join(ROOT, 'package', r.url), path.join(ROOT, r.url)];
    if (!candidates.some(p => fs.existsSync(p))) {
      bad.push({ ...r, reason: 'local-missing' });
    }
  }
  console.log(`[audit] 本地相对路径: ${localRefs.length}, missing: ${bad.filter(b => b.reason === 'local-missing').length}`);

  // 2) 裸文件名：EP05+ 是已知未来占位（见 v71.15），仅报警不报错
  const placeholders = [];
  for (const r of bareRefs) {
    if (/^[eE][5-9][sS][0-9]+\.(jpg|png|mp4)$/i.test(r.url)) {
      placeholders.push({ ...r, reason: 'placeholder-ep5+' });
    } else if (/^skill_[a-z_]+_activate\.mp4$/i.test(r.url)) {
      // v72.12 · 技能激活视频（bare filename 走 auto-prefix，CDN 200 已验证）
      placeholders.push({ ...r, reason: 'skill-activate-video' });
    } else {
      bad.push({ ...r, reason: 'bare-filename (无 http 也无目录)' });
    }
  }
  console.log(`[audit] 裸文件名: ${bareRefs.length} (未来占位 ${placeholders.length} · 需修 ${bareRefs.length - placeholders.length})`);

  // 3) CDN URL 存活检查（并发 20）
  const uniqCdn = [...new Set(cdnRefs.map(r => r.url))];
  console.log(`[audit] 检查 ${uniqCdn.length} 条独立 CDN URL...`);
  const CONCURRENCY = 20;
  const results = {};
  let i = 0;
  async function worker() {
    while (i < uniqCdn.length) {
      const url = uniqCdn[i++];
      const code = await head(url);
      results[url] = code;
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  for (const r of cdnRefs) {
    const code = results[r.url];
    if (code !== 200) {
      bad.push({ ...r, reason: `cdn-${code}` });
    }
  }

  console.log('---');
  if (bad.length === 0) {
    console.log('[audit] ✅ 全部素材可用');
    process.exit(0);
  }
  console.log(`[audit] ❌ ${bad.length} 条素材有问题：`);
  bad.forEach(b => {
    console.log(`  L${b.line}  [${b.reason}]  ${b.url}`);
  });
  process.exit(1);
})();
