#!/usr/bin/env node
/**
 * build-registry.js —— 从 content/assets.registry.json 生成 js/registry.js
 * 
 * js/registry.js 挂 window.WEIHUNQI_REGISTRY，包含：
 *   NARR_LOCAL_FORCE, NARR_VIDEO_ALLOW, SUBTITLE_HIDE_KEYS, BUNDLED_IMAGES,
 *   NODE_UNLOCK_MAP, EARLY_NODES_BEFORE_SISTER, CHARS
 *   CDN_PREFIX_P4/P5, NARR_CDN
 *
 * main-v42.js 里的老白名单改为读 registry。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const reg = JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'assets.registry.json'), 'utf8'));

const P4 = reg.cdn.prefixP4;
const P5 = reg.cdn.prefixP5;

// 派生 BUNDLED_IMAGES 映射（CDN URL → assets/frames/xxx.jpg）
const bundled = {};
for (const it of reg.bundledImages) {
  const pref = it.cdn === 'p4' ? P4 : P5;
  const cdnUrl = pref + it.path;
  if (it.localOverride) { bundled[cdnUrl] = it.localOverride; continue; }
  const basename = it.path.replace(/^.*\//, '').replace(/\.png$/i, '.jpg');
  bundled[cdnUrl] = 'assets/frames/' + basename;
}

// Packaged poster paths are an explicit manifest, never guessed from video names.
for (const local of [...Object.values(reg.videoPosters || {}), ...Object.values(reg.imageAliases || {}), ...Object.values(bundled)]) {
  const file = path.resolve(REPO, 'package', local);
  if (!file.startsWith(path.join(REPO, 'package') + path.sep) || !fs.existsSync(file) || !fs.statSync(file).size) {
    throw new Error('Missing packaged image: ' + local);
  }
}
for (const name of fs.readdirSync(path.join(REPO, 'content/episodes')).filter(n => n.endsWith('.json'))) {
  const nodes = JSON.parse(fs.readFileSync(path.join(REPO, 'content/episodes', name), 'utf8'));
  for (const [id, node] of Object.entries(nodes)) {
    const media = node.media;
    if (media && media.kind === 'video' && (!reg.videoPosters[media.file] || media.poster !== reg.videoPosters[media.file])) {
      throw new Error('Missing/mismatched video poster: ' + name + ':' + id);
    }
  }
}

// For a saved choice/text node without media, retain a deterministic nearby scene.
// During normal play the actual previous video still takes precedence.
const allNodes = {}, parents = {}, nodePosters = {};
for (const file of fs.readdirSync(path.join(REPO, 'content/episodes')).filter(n => n.endsWith('.json')).sort()) {
  Object.assign(allNodes, JSON.parse(fs.readFileSync(path.join(REPO, 'content/episodes', file), 'utf8')));
}
for (const [id, node] of Object.entries(allNodes)) {
  for (const to of [node.next, ...(node.options || []).map(o => o.next)].filter(Boolean)) {
    (parents[to] || (parents[to] = [])).push(id);
  }
}
for (const [id, node] of Object.entries(allNodes)) {
  if (node.media) continue;
  const seen = new Set([id]), queue = [...(parents[id] || [])];
  while (queue.length) {
    const priorId = queue.shift(), prior = allNodes[priorId];
    if (!prior || seen.has(priorId) || prior.ep !== node.ep) continue;
    seen.add(priorId);
    const media = prior.media;
    if (media && media.kind === 'video' && reg.videoPosters[media.file]) {
      nodePosters[id] = reg.videoPosters[media.file]; break;
    }
    if (media && media.kind === 'image' && media.file) {
      nodePosters[id] = (reg.imageAliases || {})[media.file] || media.file; break;
    }
    queue.push(...(parents[priorId] || []));
  }
}

// 派生 NARR_LOCAL_FORCE
const narrLocalForce = {};
for (const k of reg.narrLocalForce) narrLocalForce[k] = true;

const narrVideoAllow = {};
for (const k of reg.narrVideoAllow) narrVideoAllow[k] = 1;

const subtitleHideKeys = {};
for (const k of (reg.subtitleHideKeys || [])) subtitleHideKeys[k] = 1;

const earlyBeforeSister = {};
for (const k of reg.earlyNodesBeforeSister) earlyBeforeSister[k] = 1;

// —— 派生 CARD_JUMP_MAP（成就卡 → 真实直通目标）——
// 为什么要自动派生：之前 achievements.js 里的 chapter/jump 是手写的，与 nodeUnlockMap 实际解锁位置
// 对不上（11 张卡有 6 张章节写错），导致“看完广告直通”跳到错的章节。
// 现在一律以「该卡在哪个节点解锁」为唯一真值源，章节与节点均从剧本数据推导。
const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'meta.json'), 'utf8'));
const homeChapterIds = new Set((meta.meta.homeChapters || []).map(c => c.id));
const cardJumpMap = {};
for (const [nodeId, cardId] of Object.entries(reg.nodeUnlockMap)) {
  const node = allNodes[nodeId];
  if (!node) throw new Error('nodeUnlockMap 指向不存在的节点: ' + nodeId);
  const ep = node.ep;
  if (cardJumpMap[cardId]) throw new Error('一张卡被多个节点解锁，直通目标歧义: ' + cardId);
  // 结局章（EP99）与未在章节首页列出的章节不可直通 → jumpable:false，按钮显示“敬请期待”
  cardJumpMap[cardId] = homeChapterIds.has(ep)
    ? { ep: ep, node: nodeId, jumpable: true }
    : { ep: ep, node: nodeId, jumpable: false };
}

const output = `// ⚠️⚠️⚠️ AUTO-GENERATED · 禁止手改 · 由 scripts/tools/build-registry.js 生成
//   源：content/assets.registry.json
//   任何修改请编辑 content/assets.registry.json，然后跑 \`npm run build:registry\`
//   生成时间：${new Date().toISOString()}

(function(){
  var R = {};
  R.CDN_PREFIX_P4 = ${JSON.stringify(P4)};
  R.CDN_PREFIX_P5 = ${JSON.stringify(P5)};
  R.NARR_CDN      = ${JSON.stringify(reg.cdn.narr)};
  R.NODE_POSTERS = ${JSON.stringify(nodePosters, null, 2)};
  R.VIDEO_POSTERS = ${JSON.stringify(reg.videoPosters || {}, null, 2)};
  R.IMAGE_ALIASES = ${JSON.stringify(reg.imageAliases || {}, null, 2)};
  R.BUNDLED_IMAGES = ${JSON.stringify(bundled, null, 2)};
  R.NARR_LOCAL_FORCE = ${JSON.stringify(narrLocalForce, null, 2)};
  R.NARR_VIDEO_ALLOW = ${JSON.stringify(narrVideoAllow, null, 2)};
  R.SUBTITLE_HIDE_KEYS = ${JSON.stringify(subtitleHideKeys, null, 2)};
  R.NODE_UNLOCK_MAP = ${JSON.stringify(reg.nodeUnlockMap, null, 2)};
  R.CARD_JUMP_MAP = ${JSON.stringify(cardJumpMap, null, 2)};
  R.EARLY_NODES_BEFORE_SISTER = ${JSON.stringify(earlyBeforeSister, null, 2)};
  R.CHARS = ${JSON.stringify(reg.chars, null, 2)};
  window.WEIHUNQI_REGISTRY = R;
})();
`;

const outPath = path.join(REPO, 'package', 'js', 'registry.js');
fs.writeFileSync(outPath, output);
console.log(`✅ 写入 ${outPath} (${output.length} bytes)`);
console.log(`   BUNDLED_IMAGES: ${Object.keys(bundled).length} 项`);
console.log(`   NARR_LOCAL_FORCE: ${Object.keys(narrLocalForce).length} 项`);
console.log(`   NARR_VIDEO_ALLOW: ${Object.keys(narrVideoAllow).length} 项`);
console.log(`   NODE_UNLOCK_MAP: ${Object.keys(reg.nodeUnlockMap).length} 项`);
console.log(`   CARD_JUMP_MAP: ${Object.keys(cardJumpMap).length} 项（可直通 ${Object.values(cardJumpMap).filter(v => v.jumpable).length} 项）`);
console.log(`   CHARS: ${Object.keys(reg.chars).length} 项`);
