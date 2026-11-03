#!/usr/bin/env node
/**
 * build-story.js —— 从 content/episodes/*.json + content/meta.json 编译出 js/story.js
 *
 * 约定：
 *  - 编辑 content/episodes/*.json 是**唯一**修改剧情的方式
 *  - js/story.js 是**派生产物**（顶部会自动加"AUTO-GENERATED"标记），禁止手改
 *  - 编译流程保留 R() 帮助函数以兼容旧代码（虽然新数据都直接用对象）
 *
 * 校验：
 *  - 顺序：EP01, EP02, ..., EP99, _endings, _unknown
 *  - 每个节点必须有 id（key），可选 ep 字段
 *  - meta.version / meta.start / meta.meta.episodes 必须存在
 */
'use strict';
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');
const EP_DIR = path.join(REPO, 'content', 'episodes');
const META = path.join(REPO, 'content', 'meta.json');
const OUT = path.join(REPO, 'package', 'js', 'story.js');

const meta = JSON.parse(fs.readFileSync(META, 'utf8'));
if (!meta.version || !meta.start) { console.error('❌ meta.json 缺 version/start'); process.exit(1); }

// 按集顺序合并
const files = fs.readdirSync(EP_DIR).filter(f => f.endsWith('.json')).sort((a, b) => {
  const rank = s => {
    if (s === '_endings.json') return 999;
    if (s === '_unknown.json') return 998;
    const m = s.match(/EP(\d+)/); return m ? parseInt(m[1], 10) : 500;
  };
  return rank(a) - rank(b);
});

const merged = {};
for (const f of files) {
  const chunk = JSON.parse(fs.readFileSync(path.join(EP_DIR, f), 'utf8'));
  for (const [id, node] of Object.entries(chunk)) {
    if (merged[id]) console.warn(`  ⚠️ 节点 id 重复：${id} (来自 ${f})`);
    merged[id] = node;
  }
}

// 生成 story.js
// 保留 window.STORY 契约、R() 帮助函数、CDN 常量
const CDN = 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks667658648250668260/';
const banner = [
  '// ⚠️⚠️⚠️ AUTO-GENERATED · 禁止手改 · 由 scripts/tools/build-story.js 生成',
  '//   源：content/episodes/*.json + content/meta.json',
  '//   任何修改请编辑 content/ 下的 JSON，然后跑 `npm run build:story`',
  `//   生成时间：${new Date().toISOString()}`,
  ''
].join('\n');

const preamble = `
var CDN = ${JSON.stringify(CDN)};
// R(id, speaker, text, next, ep, scene, char) —— 反应帧节点帮助函数（兼容旧代码）
function R(id, speaker, text, next, ep, scene, char) {
  var n = { id: id, speaker: speaker, text: text, next: next };
  if (ep) n.ep = ep;
  if (scene) n.scene = scene;
  if (char) n.char = char;
  return n;
}
`.trim() + '\n';

// 组织 window.STORY = { ... }
// 节点区：按 merged 顺序输出
const nodesLines = [];
for (const [id, node] of Object.entries(merged)) {
  // 每个节点单行 JSON（尽量紧凑但保留 key 顺序）
  nodesLines.push(`    ${JSON.stringify(id)}: ${JSON.stringify(node)}`);
}
const nodesBody = nodesLines.join(',\n');

const storyObj = [
  'window.STORY = {',
  `  version: ${JSON.stringify(meta.version)},`,
  `  updatedAt: ${JSON.stringify(meta.updatedAt || '')},`,
  '  changelog: [',
  ...(meta.changelog || []).map((c, i, arr) => `    ${JSON.stringify(c)}${i < arr.length - 1 ? ',' : ''}`),
  '  ],',
  `  start: ${JSON.stringify(meta.start)},`,
  `  meta: ${JSON.stringify(meta.meta || {}, null, 2).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')},`,
  ...(meta.endings ? [`  endings: ${JSON.stringify(meta.endings, null, 2).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')},`] : []),
  '  nodes: {',
  nodesBody,
  '  }',
  '};'
].join('\n');

const output = banner + preamble + '\n' + storyObj + '\n';
fs.writeFileSync(OUT, output);
console.log(`✅ 写入 ${OUT}`);
console.log(`   节点数：${Object.keys(merged).length}`);
console.log(`   version：${meta.version}`);

// 校验：重新加载确认 STORY 完整
delete global.window;
global.window = {};
try {
  eval(output);
  const S = global.window.STORY;
  if (!S || !S.nodes) throw new Error('STORY 或 nodes 缺失');
  const cnt = Object.keys(S.nodes).length;
  console.log(`✅ 语法校验通过：STORY.version=${S.version}, nodes=${cnt}, changelog=${S.changelog.length}`);
  if (cnt !== Object.keys(merged).length) {
    console.error(`❌ 节点数不一致：${cnt} !== ${Object.keys(merged).length}`);
    process.exit(1);
  }
} catch (e) {
  console.error('❌ 编译产物语法错误：', e.message);
  process.exit(1);
}
