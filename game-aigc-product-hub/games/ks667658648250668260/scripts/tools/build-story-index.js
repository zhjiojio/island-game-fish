#!/usr/bin/env node
/**
 * build-story-index.js
 * 输入：js/story.js（不拆分源码，只做索引层）
 * 产出：
 *   1. docs/story-index.json    — 机读节点索引 { nodeId: { ep, line, type, char, media, next[], from[] } }
 *   2. docs/story-map.md        — 人读节点地图（按集分组，行号 + 前驱/后继）
 *
 * 用法：node scripts/tools/build-story-index.js
 * 用途：Agent/开发者要改某节点前，先跑此脚本，得到「该节点在 story.js 第几行 + 前驱后继」，
 *      避免每次全文 grep。
 *
 * 实现原则：
 *   - 不 require story.js（避免依赖 window/GameGlobal）
 *   - 直接文本解析，用节点 id 的正则定位行号；字段值用宽容正则抽取
 *   - 只索引 window.STORY.nodes 里的节点（不追 endings/其他配置）
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..', '..');
const STORY_PATH = path.join(REPO, 'package', 'js', 'story.js');
const OUT_JSON = path.join(REPO, 'docs', 'story-index.json');
const OUT_MD = path.join(REPO, 'docs', 'story-map.md');

// Authoritative JSON supplies fields; generated JS is used only for line locations.
const sourceNodes = {};
for (const file of fs.readdirSync(path.join(REPO, 'content/episodes')).filter(n => n.endsWith('.json'))) {
  Object.assign(sourceNodes, JSON.parse(fs.readFileSync(path.join(REPO, 'content/episodes', file), 'utf8')));
}
const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'content/meta.json'), 'utf8'));
const src = fs.readFileSync(STORY_PATH, 'utf8');
const lines = src.split(/\r?\n/);

// 找到 window.STORY = { ... }  nodes: { 段
const nodesStart = lines.findIndex(l => /^\s*nodes\s*:\s*\{/.test(l));
if (nodesStart < 0) {
  console.error('❌ 找不到 nodes: { 段');
  process.exit(1);
}

// 节点头形如：  "s1": { ep:"EP01", ...
// 或：         "r_f0_a": R(...)   （通过 R() 函数快捷生成）
const NODE_RE = /^\s*"([a-zA-Z0-9_]+)"\s*:\s*(\{|R\()/;

const nodes = {};
let lastNodeId = null;
let bufStart = -1;
let braceDepth = 0;
let inNode = false;

// 简易词法：为每个节点抓一段"节点定义原文"，然后从原文里抽字段
function flushNode(endLine) {
  if (!lastNodeId || bufStart < 0) return;
  const raw = lines.slice(bufStart, endLine + 1).join('\n');
  nodes[lastNodeId] = parseNode(lastNodeId, bufStart + 1, raw);
  lastNodeId = null;
  bufStart = -1;
  braceDepth = 0;
  inNode = false;
}

for (let i = nodesStart + 1; i < lines.length; i++) {
  const ln = lines[i];
  const m = ln.match(NODE_RE);
  if (m) {
    // 前一个节点收尾
    if (lastNodeId) flushNode(i - 1);
    lastNodeId = m[1];
    bufStart = i;
    inNode = true;
    // R(...) 形式的节点通常单行；用括号平衡判断结束
    if (m[2] === 'R(') {
      // 单行 R() —— 找到本行行末
      // 简单处理：R() 通常一行结束（可能跨到下一行的极少数情况忽略）
      let parens = 0;
      const s = ln.substring(ln.indexOf('R('));
      for (const ch of s) {
        if (ch === '(') parens++;
        else if (ch === ')') { parens--; if (parens === 0) break; }
      }
      // 若本行结束就 flush
      if (parens === 0) flushNode(i);
    } else {
      // { ... }
      braceDepth = 0;
      // 计算本行大括号
      for (const ch of ln) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') braceDepth--;
      }
      if (braceDepth === 0) flushNode(i);
    }
    continue;
  }
  if (inNode && lastNodeId) {
    for (const ch of ln) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth--;
    }
    if (braceDepth === 0) flushNode(i);
  }
  // 遇到 nodes 段的结束 }
  if (!inNode && /^\s*\}\s*[,;]?\s*$/.test(ln)) {
    // 判断是否是 nodes: { 的收尾（简单启发式：早于 meta/endings 或 } 前有 nodes 关键闭合）
    // 保守起见：如果 lastNodeId 之后已经处理完了，跳出
  }
}
if (lastNodeId) flushNode(lines.length - 1);

// 从节点定义原文里抽字段
function parseNode(id, line, raw) {
  const node = sourceNodes[id];
  if (!node) throw new Error('Generated node missing from source: ' + id);
  return {
    id, line, raw_snippet: raw.split('\n')[0].trim().slice(0, 120),
    ep: node.ep || null, epTitle: node.epTitle || null, scene: node.scene || null,
    char: node.char || null, speaker: node.speaker || null, type: node.type || 'text',
    stay: !!node.stay, forceCaption: !!node.forceCaption,
    kind: node.media && node.media.kind || null, mediaFile: node.media && node.media.file || null,
    next: [...new Set([node.next, ...(node.options || []).map(o => o.next)].filter(Boolean))],
    hasOptions: !!node.options, optionCount: (node.options || []).length
  };
}

// 构建反向索引
for (const id of Object.keys(nodes)) {
  nodes[id].from = [];
}
for (const [id, n] of Object.entries(nodes)) {
  for (const nx of n.next) {
    if (nodes[nx]) nodes[nx].from.push(id);
  }
}

// 输出 JSON
fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
fs.writeFileSync(OUT_JSON, JSON.stringify({
  generatedAt: new Date().toISOString(),
  sourceFile: 'package/js/story.js',
  nodeCount: Object.keys(nodes).length,
  nodes
}, null, 2));

// 输出 Markdown
const byEp = {};
for (const [id, n] of Object.entries(nodes)) {
  const ep = n.ep || 'UNKNOWN';
  (byEp[ep] = byEp[ep] || []).push(n);
}
const epOrder = Object.keys(byEp).sort();

let md = '';
md += '# 《我的未婚妻》节点地图（自动生成）\n\n';
md += `> 生成时间：${new Date().toLocaleString()}\n`;
md += `> 源文件：\`js/story.js\`，共 **${Object.keys(nodes).length}** 个节点\n\n`;
md += `> **用法**：想改某节点前先看这个地图。每个节点写明 \`js/story.js:LINE\` 行号，直接跳过去改。\n\n`;
md += '## 快速索引\n\n';
for (const ep of epOrder) md += `- [${ep}（${byEp[ep].length} 节点）](#${ep.toLowerCase()})\n`;
md += '\n---\n\n';

for (const ep of epOrder) {
  md += `## ${ep}\n\n`;
  md += '| ID | 行号 | 类型 | speaker | media | → next | ← from |\n';
  md += '|---|---:|---|---|---|---|---|\n';
  for (const n of byEp[ep].sort((a, b) => a.line - b.line)) {
    const t = (n.hasOptions ? 'choice' : (n.kind === 'video' ? 'video' : (n.kind === 'image' ? 'image' : 'text')))
      + (n.stay ? '·stay' : '')
      + (n.forceCaption ? '·fc' : '');
    const media = n.mediaFile ? '`' + n.mediaFile.replace(/^https:\/\/[^/]+\/udata\/pkg\/KS-GAME\/AIGC-SoGame\/ks[0-9]+\//, '⚡/').slice(0, 40) + '`' : '—';
    const nexts = n.next.length ? n.next.map(x => `\`${x}\``).join('<br/>') : '—';
    const froms = n.from.length ? n.from.slice(0, 5).map(x => `\`${x}\``).join('<br/>') + (n.from.length > 5 ? ` +${n.from.length - 5}` : '') : '—';
    md += `| \`${n.id}\` | ${n.line} | ${t} | ${n.speaker || '—'} | ${media} | ${nexts} | ${froms} |\n`;
  }
  md += '\n';
}

// 孤儿节点检测
const start = meta.start;
const reached = new Set();
(function bfs(id) {
  const q = [id];
  while (q.length) {
    const x = q.shift();
    if (reached.has(x) || !nodes[x]) continue;
    reached.add(x);
    for (const nx of nodes[x].next) q.push(nx);
  }
})(start);
const orphans = Object.keys(nodes).filter(id => !reached.has(id));
md += `\n## 🧭 图健康度\n\n`;
md += `- 从 \`${start}\` 可达：**${reached.size} / ${Object.keys(nodes).length}**\n`;
md += `- 孤儿节点：**${orphans.length}**\n`;
if (orphans.length) md += '<details><summary>展开</summary>\n\n' + orphans.map(id => `- \`${id}\` (line ${nodes[id].line}, ${nodes[id].ep})`).join('\n') + '\n\n</details>\n';

fs.writeFileSync(OUT_MD, md);
console.log(`✅ 生成 ${OUT_JSON}`);
console.log(`✅ 生成 ${OUT_MD}`);
console.log(`   共 ${Object.keys(nodes).length} 节点，可达 ${reached.size}，孤儿 ${orphans.length}`);
