#!/usr/bin/env node
/**
 * bump-version.js — 老铁眼真尖版本三件套一键 bump
 *
 * 用法：
 *   node skill/scripts/bump-version.js patch "本次改动摘要"
 *
 * 做的事：
 *   1. 读 package/js/main.js，提取 M3.BUILD_VER (v1.0.XX) → PATCH +1
 *   2. 提取 [MARKER vNN] → NN +1
 *   3. 更新 main.js: BUILD_VER + console.log（含日期、摘要、新 MARKER）
 *   4. 更新 index.html: 所有 ?v=旧 → ?v=新（取最大值 +1）
 *   5. 打印 diff 预览 + commit message 模板
 *
 * 选项：
 *   --dry-run   只打印 diff，不写文件
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 路径 ────────────────────────────────────────────────────────────────────
const GAME_ROOT  = path.resolve(__dirname, '../../');
const MAIN_JS    = path.join(GAME_ROOT, 'package/js/main.js');
const INDEX_HTML = path.join(GAME_ROOT, 'package/index.html');

// ─── 参数 ────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const summary = args.filter(a => !a.startsWith('--') && a !== 'patch')[0] || '';

if (!summary) {
  console.error('❌  用法：node bump-version.js patch "<本次改动摘要>"');
  process.exit(1);
}

// ─── 颜色输出 ─────────────────────────────────────────────────────────────────
const RED  = '\x1b[31m';
const GRN  = '\x1b[32m';
const YLW  = '\x1b[33m';
const CYA  = '\x1b[36m';
const RST  = '\x1b[0m';

// ─── 读取 main.js ─────────────────────────────────────────────────────────────
let mainSrc = fs.readFileSync(MAIN_JS, 'utf8');

// 提取当前版本号
const buildVerMatch = mainSrc.match(/M3\.BUILD_VER\s*=\s*'v1\.0\.(\d+)'/);
if (!buildVerMatch) {
  console.error('❌  main.js 中未找到 M3.BUILD_VER = \'v1.0.XX\'');
  process.exit(1);
}
const oldPatch   = parseInt(buildVerMatch[1], 10);
const newPatch   = oldPatch + 1;
const oldBuildVer = `v1.0.${oldPatch}`;
const newBuildVer = `v1.0.${newPatch}`;

// 提取 MARKER 编号
const markerMatch = mainSrc.match(/\[MARKER v(\d+)\]/);
if (!markerMatch) {
  console.error('❌  main.js 中未找到 [MARKER vNN]');
  process.exit(1);
}
const oldMarker = parseInt(markerMatch[1], 10);
const newMarker = oldMarker + 1;

// 生成新日期
const today = new Date();
const dateStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

console.log(`${CYA}════ 老铁眼真尖 · 版本 bump ════${RST}`);
console.log(`  BUILD_VER : ${YLW}${oldBuildVer}${RST} → ${GRN}${newBuildVer}${RST}`);
console.log(`  MARKER    : ${YLW}v${oldMarker}${RST} → ${GRN}v${newMarker}${RST}`);
console.log(`  摘要      : ${summary}`);
console.log(`  日期      : ${dateStr}`);

// ─── 更新 main.js ─────────────────────────────────────────────────────────────
let newMainSrc = mainSrc;

// 1. 替换 BUILD_VER
newMainSrc = newMainSrc.replace(
  /M3\.BUILD_VER\s*=\s*'v1\.0\.\d+'/,
  `M3.BUILD_VER = '${newBuildVer}'`
);

// 2. 替换 console.log 那行（含 VERSION + BUILD_VER + build日期 + MARKER + 摘要）
// 原格式：console.log('[VERSION] 老铁眼真尖 ' + M3.BUILD_VER + ' · build YYYY-MM-DD · [MARKER vNN] 摘要');
newMainSrc = newMainSrc.replace(
  /console\.log\('\[VERSION\] 老铁眼真尖 '[^;]+;/,
  `console.log('[VERSION] 老铁眼真尖 ' + M3.BUILD_VER + ' · build ${dateStr} · [MARKER v${newMarker}] ${summary}');`
);

// 3. 同时更新注释行（⭐⭐⭐ vX.X.XX · ... ⭐⭐⭐）
newMainSrc = newMainSrc.replace(
  /\/\/ ⭐⭐⭐ v1\.0\.\d+ · .*? ⭐⭐⭐/,
  `// ⭐⭐⭐ ${newBuildVer} · ${summary} ⭐⭐⭐`
);

// ─── 读取 index.html ──────────────────────────────────────────────────────────
let htmlSrc = fs.readFileSync(INDEX_HTML, 'utf8');

// 找所有 ?v=N，取最大值
const vMatches = [...htmlSrc.matchAll(/\?v=(\d+)/g)];
const vNums    = vMatches.map(m => parseInt(m[1], 10));
const maxV     = Math.max(...vNums);
const newV     = maxV + 1;

console.log(`  index.html ?v= : ${YLW}${[...new Set(vNums)].sort((a,b)=>a-b).join(', ')}${RST} → ${GRN}${newV}${RST}`);

// 全部替换为新版本号
let newHtmlSrc = htmlSrc.replace(/\?v=\d+/g, `?v=${newV}`);

// ─── Diff 预览 ────────────────────────────────────────────────────────────────
console.log(`\n${CYA}─── main.js 改动预览 ───${RST}`);
const mainLines = mainSrc.split('\n');
const newMainLines = newMainSrc.split('\n');
for (let i = 0; i < Math.max(mainLines.length, newMainLines.length); i++) {
  if (mainLines[i] !== newMainLines[i]) {
    console.log(`  ${RED}- ${(mainLines[i] || '').trim()}${RST}`);
    console.log(`  ${GRN}+ ${(newMainLines[i] || '').trim()}${RST}`);
  }
}

console.log(`\n${CYA}─── index.html 改动预览 ───${RST}`);
const htmlChangedLines = htmlSrc.split('\n').filter(l => l.includes('?v='));
console.log(`  ${RED}- (旧) ?v=... (${vMatches.length} 处)${RST}`);
console.log(`  ${GRN}+ (新) 全部替换为 ?v=${newV}${RST}`);

// ─── 写文件 ───────────────────────────────────────────────────────────────────
if (dryRun) {
  console.log(`\n${YLW}⚠  --dry-run 模式，未写入文件${RST}`);
} else {
  fs.writeFileSync(MAIN_JS, newMainSrc, 'utf8');
  fs.writeFileSync(INDEX_HTML, newHtmlSrc, 'utf8');
  console.log(`\n${GRN}✓  已写入 main.js + index.html${RST}`);
}

// ─── Commit message 模板 ──────────────────────────────────────────────────────
console.log(`\n${CYA}─── 建议 commit message ───${RST}`);
console.log(`  feat(laotie-zhaocha): ${newBuildVer} ${summary} [MARKER v${newMarker}]`);

console.log(`\n${CYA}─── 下一步 ───${RST}`);
console.log(`  1. bash skill/scripts/laotie-check.sh --skip-cdn   # 验证版本号`);
console.log(`  2. bash skill/scripts/ksmg-preview-guarded.sh upload ./package "${newBuildVer}" "${summary}"`);
console.log(`  3. git add -A && git commit -m "feat(laotie-zhaocha): ${newBuildVer} ${summary} [MARKER v${newMarker}]"`);
console.log(`  4. git push`);
