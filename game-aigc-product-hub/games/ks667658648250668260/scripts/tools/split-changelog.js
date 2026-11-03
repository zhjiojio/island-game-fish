#!/usr/bin/env node
/**
 * split-changelog.js — 一次性脚本
 * 从 js/story.js 抽出 changelog 数组，写入：
 *   - docs/CHANGELOG.md      （全部历史，人读）
 * 然后把 story.js 里的 changelog 数组瘦身成最近 3 条 + 一句「历史见 docs/CHANGELOG.md」
 */
'use strict';
const fs = require('fs');
const path = require('path');
const STORY = path.resolve(__dirname, '..', '..', 'package', 'js', 'story.js');
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'CHANGELOG.md');

const src = fs.readFileSync(STORY, 'utf8');
const lines = src.split('\n');

// 找 changelog: [   ...   ],
const start = lines.findIndex(l => /^\s*changelog:\s*\[\s*$/.test(l));
if (start < 0) { console.error('no changelog start'); process.exit(1); }
let end = -1;
for (let i = start + 1; i < lines.length; i++) {
  if (/^\s*\],?\s*$/.test(lines[i])) { end = i; break; }
}
if (end < 0) { console.error('no changelog end'); process.exit(1); }

const body = lines.slice(start + 1, end);
// 每条 changelog 都是一整行以 "vXX (...): ... ",  结尾（可能有转义）
// 直接按行提取
const entries = [];
for (const raw of body) {
  const m = raw.match(/^\s*"(.*)",?\s*$/);
  if (m) {
    // 反转义 \" → "
    const text = m[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    entries.push(text);
  }
}
console.log(`  found ${entries.length} changelog entries`);

// 写 CHANGELOG.md
let md = '# 《我的未婚妻》Changelog（历史归档）\n\n';
md += `> 从 \`js/story.js\` 的 \`changelog\` 数组迁移而来（${new Date().toLocaleString()}）\n`;
md += `> \`story.js\` 里现在只保留最新 3 条，历史全部在此。\n\n`;
md += `> **每条格式**：\`vX.Y (日期): 【标题】...根因/修复/铁律\`\n\n`;
md += '---\n\n';
for (const e of entries) {
  // 抽版本号做二级标题
  const vm = e.match(/^(v[0-9.]+)\s*\(([^)]+)\):\s*(.*)$/);
  if (vm) {
    md += `## ${vm[1]} · ${vm[2]}\n\n${vm[3]}\n\n`;
  } else {
    md += `## (unknown version)\n\n${e}\n\n`;
  }
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, md);
console.log(`  ✅ wrote ${OUT} (${md.length} bytes)`);

// 精简 story.js changelog：保留前 3 条
const keep = body.slice(0, Math.min(3, body.length));
// 确保最后一条以 "," 结尾（保守：如果它是 body[2] 恰好末尾无逗号，加一个）
for (let i = 0; i < keep.length; i++) {
  if (!/,\s*$/.test(keep[i]) && i < keep.length - 1) keep[i] = keep[i].replace(/\s*$/, ',');
}
// 加一个"历史见 CHANGELOG"占位行（作为字符串数组元素，不破坏 JS 语法）
const indent = keep[0].match(/^(\s*)/)[1] || '    ';
keep.push(`${indent}"…早期版本见 docs/CHANGELOG.md（共 ${entries.length} 条）"`);

const newLines = [
  ...lines.slice(0, start + 1),
  ...keep,
  ...lines.slice(end)
];
fs.writeFileSync(STORY, newLines.join('\n'));
console.log(`  ✅ story.js changelog 精简为 ${keep.length} 条（原 ${entries.length}）`);
