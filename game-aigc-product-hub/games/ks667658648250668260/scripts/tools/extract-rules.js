#!/usr/bin/env node
/**
 * extract-rules.js — 从 docs/CHANGELOG.md 抽出所有「铁律 N: ...」+ 从 CLAUDE.md 抽结构化铁律
 * 产出 docs/RULES.md：编号铁律清单，每条含来源版本 + 简介
 */
'use strict';
const fs = require('fs');
const path = require('path');
const CHG = path.resolve(__dirname, '..', '..', 'docs', 'CHANGELOG.md');
const OUT = path.resolve(__dirname, '..', '..', 'docs', 'RULES.md');

const src = fs.readFileSync(CHG, 'utf8');
// 用二级标题分节
const sections = src.split(/^##\s+/m).slice(1);

// 匹配 "铁律 N: ..." 或 "铁律 N ..." 中文冒号也算
const RULE_RE = /铁律\s*(\d+)\s*[:：]\s*([^。；]+[。；])/g;
// 有些老铁律没编号，形如「铁律：...」也抓
const RULE_NONUM_RE = /铁律[:：]\s*([^。；]+[。；])/g;

const rules = new Map(); // number -> {version, text}
const unnumberedRules = []; // {version, text}

for (const sec of sections) {
  const header = sec.split('\n')[0].trim(); // e.g. "v72.12 · 2026-08-10"
  const version = header.split(' · ')[0].trim();
  const body = sec.substring(sec.indexOf('\n') + 1);
  let m;
  while ((m = RULE_RE.exec(body)) !== null) {
    const num = parseInt(m[1], 10);
    const text = m[2].trim();
    // 保留最新版本的定义（因为 CHANGELOG 是新→旧顺序）
    if (!rules.has(num)) rules.set(num, { version, text, num });
  }
  // 无编号铁律
  const bodyStripNum = body.replace(RULE_RE, '');
  let n;
  while ((n = RULE_NONUM_RE.exec(bodyStripNum)) !== null) {
    unnumberedRules.push({ version, text: n[1].trim() });
  }
}

// 排序
const sorted = [...rules.values()].sort((a, b) => a.num - b.num);

let md = '# 《我的未婚妻》互动剧游铁律清单\n\n';
md += `> 从 \`docs/CHANGELOG.md\` 自动抽取（${new Date().toLocaleString()}）\n`;
md += `> 共 **${sorted.length}** 条编号铁律 + ${unnumberedRules.length} 条无编号历史铁律\n\n`;
md += `> ⚠️ 改代码前必读；违反任何一条会导致回归 bug。\n`;
md += `> 全项目铁律（图片生成/视频生成/kling API 等技术类）在 \`CLAUDE.md\`。\n\n`;
md += '---\n\n';

md += '## 📖 编号铁律（新→需按编号查阅）\n\n';
md += '| 编号 | 首次定义于 | 铁律内容 |\n|---:|---|---|\n';
for (const r of sorted) {
  md += `| ${r.num} | \`${r.version}\` | ${r.text.replace(/\|/g, '\\|').replace(/\n/g, ' ')} |\n`;
}
md += '\n---\n\n';
md += '## 📚 无编号铁律（历史 · 仅供参考）\n\n';
md += '<details><summary>展开 ' + unnumberedRules.length + ' 条</summary>\n\n';
for (const r of unnumberedRules) {
  md += `- \`${r.version}\`: ${r.text.replace(/\n/g, ' ')}\n`;
}
md += '\n</details>\n';

fs.writeFileSync(OUT, md);
console.log(`✅ ${OUT}`);
console.log(`   ${sorted.length} 编号铁律，${unnumberedRules.length} 无编号铁律`);
