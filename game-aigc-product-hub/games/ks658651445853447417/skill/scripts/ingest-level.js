#!/usr/bin/env node
/**
 * ingest-level.js — 编辑器导出 JSON 安全写入 levels.js
 *
 * 用法：
 *   node skill/scripts/ingest-level.js --file=~/Desktop/level38.json
 *   node skill/scripts/ingest-level.js --json='{"idx":38,"themeId":1,...}'
 *   node skill/scripts/ingest-level.js --file=level38.json --dry-run
 *   node skill/scripts/ingest-level.js --file=level38.json --add-props
 *   node skill/scripts/ingest-level.js --coords=story-coordinate-overrides.json
 *
 * 工作流：
 *   1. 解析 + 校验输入 JSON（格式/约束/敏感词）
 *   2. 检查 idx 不重复
 *   3. 检查 PROPS 覆盖，缺失时报告（--add-props 自动插入占位项）
 *   4. 找到正确插入位置（同 themeId 最后一关后面）
 *   5. 格式化成 levels.js 风格并插入
 *   6. --dry-run 模式只打印 diff，不写文件
 */
'use strict';

const fs   = require('fs');
const path = require('path');

// ─── 路径 ────────────────────────────────────────────────────────────────────
const GAME_ROOT  = path.resolve(__dirname, '../../');
const LEVELS_JS  = path.join(GAME_ROOT, 'package/js/levels.js');

// ─── 颜色 ────────────────────────────────────────────────────────────────────
const RED  = '\x1b[31m';
const GRN  = '\x1b[32m';
const YLW  = '\x1b[33m';
const CYA  = '\x1b[36m';
const RST  = '\x1b[0m';

// ─── 参数解析 ─────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const dryRun   = args.includes('--dry-run');
const addProps = args.includes('--add-props');
const coordsArg = args.find(arg => arg.startsWith('--coords='));

// ─── 已有关卡坐标批量回写 ───────────────────────────────────────────────────
// 只替换 odds 的 x/y/w/h，强制保留 idx/themeId/scene/title/剧情文案等权威字段。
if (coordsArg) {
  const coordsPath = path.resolve(coordsArg.slice(9).replace(/^~/, process.env.HOME));
  if (!fs.existsSync(coordsPath)) {
    console.error(`${RED}❌  坐标文件不存在: ${coordsPath}${RST}`);
    process.exit(1);
  }
  let overrides;
  try {
    overrides = JSON.parse(fs.readFileSync(coordsPath, 'utf8'));
  } catch (e) {
    console.error(`${RED}❌  坐标 JSON 解析失败: ${e.message}${RST}`);
    process.exit(1);
  }
  const entries = Object.entries(overrides || {});
  if (!entries.length) {
    console.error(`${RED}❌  坐标文件为空${RST}`);
    process.exit(1);
  }
  for (const [prop, box] of entries) {
    const valid = box && ['x', 'y', 'w', 'h'].every(k => typeof box[k] === 'number') &&
      box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0 &&
      box.x + box.w <= 100 && box.y + box.h <= 100;
    if (!valid) {
      console.error(`${RED}❌  ${prop} 坐标非法: ${JSON.stringify(box)}${RST}`);
      process.exit(1);
    }
  }

  const original = fs.readFileSync(LEVELS_JS, 'utf8');
  // 《1808房间》试制集使用独立 AFFAIR5_PILOT 作为运行时 SoT；旧版主题5
  // 仍保留 concat 区块供历史回溯。坐标回写必须优先命中新 SoT，不能误改死数据。
  const affairStart = original.indexOf('var AFFAIR5_PILOT = [');
  const storyStart = affairStart >= 0
    ? affairStart
    : original.indexOf('M3.LEVELS = M3.LEVELS.concat([');
  const storyEndMarker = affairStart >= 0 ? '\n  ];' : '\n  ]);';
  const storyEnd = original.indexOf(storyEndMarker, storyStart);
  if (storyStart < 0 || storyEnd < 0) {
    console.error(`${RED}❌  无法定位 themeId=5 故事关卡块${RST}`);
    process.exit(1);
  }

  const prefix = original.slice(0, storyStart);
  let story = original.slice(storyStart, storyEnd + storyEndMarker.length);
  const suffix = original.slice(storyEnd + storyEndMarker.length);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let updated = 0;
  for (const [prop, box] of entries) {
    const re = new RegExp(`(\\{\\s*prop\\s*:\\s*'${esc(prop)}'\\s*,\\s*)x\\s*:\\s*-?[\\d.]+\\s*,\\s*y\\s*:\\s*-?[\\d.]+\\s*,\\s*w\\s*:\\s*-?[\\d.]+\\s*,\\s*h\\s*:\\s*-?[\\d.]+`, 'g');
    const matches = [...story.matchAll(re)];
    if (matches.length !== 1) {
      console.error(`${RED}❌  ${prop} 在 themeId=5 中应唯一，实际匹配 ${matches.length} 次${RST}`);
      process.exit(1);
    }
    story = story.replace(re, `$1x:${box.x}, y:${box.y}, w:${box.w}, h:${box.h}`);
    updated++;
  }

  const next = prefix + story + suffix;
  if (next === original) {
    console.log(`${YLW}⚠  ${updated} 项坐标与 levels.js 已一致，无需写入${RST}`);
    process.exit(0);
  }
  console.log(`${CYA}════ ingest-level · 已有关卡坐标回写 ════${RST}`);
  console.log(`  ${GRN}✓${RST} 已校验 ${updated} 个唯一 prop`);
  console.log(`  ${GRN}✓${RST} 仅替换 x/y/w/h；idx/themeId/scene/剧情字段保持不变`);
  if (dryRun) {
    console.log(`  ${YLW}⚠${RST} --dry-run 模式，未写入文件`);
  } else {
    fs.writeFileSync(LEVELS_JS, next, 'utf8');
    console.log(`  ${GRN}✓${RST} levels.js 已回写 ${updated} 项坐标`);
  }
  process.exit(0);
}

let inputJson = null;
for (const arg of args) {
  if (arg.startsWith('--file=')) {
    const filePath = arg.slice(7).replace(/^~/, process.env.HOME);
    if (!fs.existsSync(filePath)) {
      console.error(`${RED}❌  文件不存在: ${filePath}${RST}`);
      process.exit(1);
    }
    inputJson = fs.readFileSync(filePath, 'utf8');
  } else if (arg.startsWith('--json=')) {
    inputJson = arg.slice(7);
  }
}

if (!inputJson) {
  console.error(`${RED}❌  必须提供 --file=<path> 或 --json='...'${RST}`);
  console.error('用法：node ingest-level.js --file=level38.json [--dry-run] [--add-props]');
  console.error('      node ingest-level.js --coords=story-coordinate-overrides.json [--dry-run]');
  process.exit(1);
}

// ─── 解析 JSON ────────────────────────────────────────────────────────────────
let level;
try {
  level = JSON.parse(inputJson);
} catch (e) {
  console.error(`${RED}❌  JSON 解析失败: ${e.message}${RST}`);
  process.exit(1);
}

// ─── 校验函数 ─────────────────────────────────────────────────────────────────
const REQUIRED_FIELDS = ['idx', 'themeId', 'title', 'scene', 'duration', 'hint', 'diff', 'odds'];
const SENSITIVE_WORDS = ['供销社', '洗浴中心', '国营', '春运'];
const ENGLISH_TAG_RE  = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
const TITLE_PREFIX_RE = /^第[\d〇一二三四五六七八九十]+关\s*[·・]\s*/;
const HINT_NUM_RE     = /(\d+)\s*[样处个]/;

let errors   = [];
let warnings = [];

function ok(msg)   { console.log(`  ${GRN}✓${RST} ${msg}`); }
function fail(msg) { errors.push(msg); console.log(`  ${RED}✗${RST} ${msg}`); }
function warn(msg) { warnings.push(msg); console.log(`  ${YLW}⚠${RST} ${msg}`); }

console.log(`${CYA}════ ingest-level · 写入前校验 ════${RST}`);

// ① 必填字段
const missingFields = REQUIRED_FIELDS.filter(f => !(f in level));
if (missingFields.length > 0) {
  fail(`缺少必填字段: ${missingFields.join(', ')}`);
} else {
  ok('必填字段完整');
}

// ② 数字类型
if (typeof level.idx !== 'number')      fail('idx 必须是数字');
if (typeof level.themeId !== 'number')  fail('themeId 必须是数字');
if (typeof level.duration !== 'number') fail('duration 必须是数字');

// ③ odds 是数组
if (!Array.isArray(level.odds) || level.odds.length === 0) {
  fail('odds 必须是非空数组');
} else {
  ok(`odds 共 ${level.odds.length} 项`);
}

// ─── 读取 levels.js ───────────────────────────────────────────────────────────
const src = fs.readFileSync(LEVELS_JS, 'utf8');

// ④ idx 不重复
const existingIdxs = [...src.matchAll(/\{\s*idx\s*:\s*(\d+)\s*,\s*themeId\s*:\s*(\d+)/g)]
  .map(m => ({ idx: parseInt(m[1]), themeId: parseInt(m[2]) }));
const idxMap = {};
existingIdxs.forEach(({ idx, themeId }) => {
  if (!idxMap[themeId]) idxMap[themeId] = [];
  idxMap[themeId].push(idx);
});

if (existingIdxs.some(e => e.idx === level.idx && e.themeId === level.themeId)) {
  fail(`idx=${level.idx} 在 themeId=${level.themeId} 中已存在！`);
} else {
  ok(`idx=${level.idx} 在 themeId=${level.themeId} 中不重复`);
}

// ⑤ 标题长度 ≤ 8 字
if (level.title) {
  const cleanTitle = level.title.replace(TITLE_PREFIX_RE, '');
  if (cleanTitle.length > 8) {
    fail(`标题「${cleanTitle}」超过 8 字（当前 ${cleanTitle.length} 字）`);
  } else {
    ok(`标题长度 ${cleanTitle.length} 字 ≤ 8`);
  }
}

// ⑥ hint 数字 = odds 长度
if (level.hint && Array.isArray(level.odds)) {
  const hintMatch = level.hint.match(HINT_NUM_RE);
  if (hintMatch) {
    const hintNum = parseInt(hintMatch[1]);
    if (hintNum !== level.odds.length) {
      fail(`hint 写的是「${hintNum}」但 odds 有 ${level.odds.length} 项，必须一致`);
    } else {
      ok(`hint 数字(${hintNum}) = odds 长度(${level.odds.length})`);
    }
  } else {
    warn('hint 里没有找到数字，建议写明茬数（如「3 样」「4 处」）');
  }
}

// ⑦ tag 全中文
if (Array.isArray(level.odds)) {
  const englishTags = level.odds.filter(o => o.tag && ENGLISH_TAG_RE.test(o.tag));
  if (englishTags.length > 0) {
    fail(`以下 odd 的 tag 是英文（必须改中文）: ${englishTags.map(o => JSON.stringify(o.tag)).join(', ')}`);
  } else {
    ok('所有 tag 已是中文');
  }
}

// ⑧ 敏感词
const titleHint = (level.title || '') + ' ' + (level.hint || '');
const hitWords = SENSITIVE_WORDS.filter(w => titleHint.includes(w));
if (hitWords.length > 0) {
  fail(`title/hint 命中敏感词: ${hitWords.join(', ')}`);
} else {
  ok('无敏感词');
}

// ─── PROPS 覆盖检查 ───────────────────────────────────────────────────────────
console.log(`\n${CYA}─── PROPS 覆盖检查 ───${RST}`);
const propsBlockMatch = src.match(/var P = M3\.PROPS = \{([\s\S]*?)\};\s*\/\/ ─── 主题列表/);
let declaredProps = new Set();
if (propsBlockMatch) {
  const propsBody = propsBlockMatch[1];
  const keys = [...propsBody.matchAll(/^\s*([a-zA-Z_][a-zA-Z_0-9]*)\s*:/gm)].map(m => m[1]);
  keys.forEach(k => declaredProps.add(k));
}

const usedProps = (level.odds || []).map(o => o.prop).filter(Boolean);
const missingProps = usedProps.filter(p => !declaredProps.has(p));

if (missingProps.length > 0) {
  fail(`PROPS 表缺失以下 prop_id（会导致 UI 显示 undefined）:\n    ${missingProps.join(', ')}`);
  console.log(`\n  ${YLW}补全方法：${RST}`);
  console.log(`  A. 手动在 levels.js PROPS 块末尾添加：`);
  missingProps.forEach(p => {
    console.log(`    ${p}: { emoji:'🔍', name:'${p}的中文名' },`);
  });
  console.log(`  B. 加 --add-props 参数让本脚本自动插入占位项（emoji 🔍，name 需后续手填）`);
} else {
  ok(`所有 ${usedProps.length} 个 prop 均在 PROPS 表中`);
}

// ─── 有错直接退出（除非 --add-props 可以自动修复 PROPS） ─────────────────────
const nonPropsErrors = errors.filter(e => !e.includes('PROPS 表缺失'));
if (nonPropsErrors.length > 0) {
  console.log(`\n${RED}✗ 校验失败（${nonPropsErrors.length} 项），请修复后重试${RST}`);
  process.exit(1);
}

if (missingProps.length > 0 && !addProps) {
  console.log(`\n${RED}✗ PROPS 缺失，请补充后重试（或加 --add-props 自动插入占位）${RST}`);
  process.exit(1);
}

// ─── 格式化 level 对象 ────────────────────────────────────────────────────────
function formatLevel(lv) {
  const lines = [];
  const modeStr = lv.mode ? `, mode:'${lv.mode}'` : '';
  const bossStr = lv.boss ? ', boss:true' : '';
  const layoutStr = lv.layout ? `, layout:'${lv.layout}'` : '';

  // 头行
  lines.push(`    { idx:${lv.idx}, themeId:${lv.themeId}${modeStr}${layoutStr},`);

  // title + scene
  if (lv.sceneA) {
    // spot 模式
    lines.push(`      title:'${lv.title}', duration:${lv.duration}${bossStr},`);
    lines.push(`      sceneA:'${lv.sceneA}',`);
    lines.push(`      sceneB:'${lv.sceneB}',`);
  } else {
    lines.push(`      title:'${lv.title}', scene:'${lv.scene}', duration:${lv.duration}${bossStr},`);
  }

  // hint
  lines.push(`      hint:'${lv.hint}',`);

  // diff
  const d = lv.diff;
  lines.push(`      diff:{ hitScale:${d.hitScale}, penalty:${d.penalty}, bonus:${d.bonus}, label:'${d.label}', key:'${d.key}' },`);

  // odds
  lines.push(`      odds:[`);
  lv.odds.forEach((o, i) => {
    const comma = i < lv.odds.length - 1 ? ',' : '';
    const propStr = o.prop ? `prop:'${o.prop}', ` : '';
    const tagStr  = o.tag  ? `, tag:'${o.tag}'` : '';
    lines.push(`        {${propStr}x:${o.x}, y:${o.y}, w:${o.w}, h:${o.h}${tagStr}}${comma}`);
  });
  lines.push(`      ] },`);

  return lines.join('\n');
}

// ─── 找插入位置 ───────────────────────────────────────────────────────────────
// 找同 themeId 的最后一关，在其 ] }, 后面插入
const themeIdxs = idxMap[level.themeId] || [];
const lastIdx   = themeIdxs.length > 0 ? Math.max(...themeIdxs) : -1;

let insertPos = -1;
if (lastIdx >= 0) {
  // 找最后一关的结束位置：'{ idx:X, themeId:Y' 后面找到对应的 '] },'
  const lastLevelRe = new RegExp(`\\{\\s*idx\\s*:\\s*${lastIdx}\\s*,\\s*themeId\\s*:\\s*${level.themeId}[\\s\\S]*?\\]\\s*\\},`, 'g');
  const lastLevelMatch = [...src.matchAll(lastLevelRe)];
  if (lastLevelMatch.length > 0) {
    const lm = lastLevelMatch[lastLevelMatch.length - 1];
    insertPos = lm.index + lm[0].length;
  }
}

if (insertPos < 0) {
  // 找不到就插到 M3.LEVELS = [ 后第一个关卡前（主题1）
  const levelsStart = src.indexOf('M3.LEVELS = [');
  if (levelsStart < 0) {
    console.error(`${RED}❌  无法在 levels.js 中找到 M3.LEVELS，请手动检查${RST}`);
    process.exit(1);
  }
  insertPos = src.indexOf('\n', levelsStart) + 1;
  warn('未找到同主题关卡，将插入到 M3.LEVELS 数组开头，请手动确认位置');
}

// ─── 生成新 src ───────────────────────────────────────────────────────────────
const newLevelCode = '\n    // 关' + (level.idx + 1) + ' · ' + level.title.replace(TITLE_PREFIX_RE, '') + '\n' + formatLevel(level);
let newSrc = src.slice(0, insertPos) + newLevelCode + '\n' + src.slice(insertPos);

// ─── 如果 --add-props，自动插入缺失 prop 占位 ─────────────────────────────────
if (addProps && missingProps.length > 0) {
  const propInsertMarker = '// ─── 主题列表 ───';
  const propInsertIdx = newSrc.indexOf(propInsertMarker);
  if (propInsertIdx < 0) {
    warn('无法找到 PROPS 块结束位置，缺失 props 未自动插入，请手动添加');
  } else {
    // 找到 }; 在 marker 之前最后一个
    const beforeMarker = newSrc.slice(0, propInsertIdx);
    const lastBraceIdx = beforeMarker.lastIndexOf('};');
    if (lastBraceIdx >= 0) {
      const propLines = missingProps.map(p => `    ${p}: { emoji:'🔍', name:'${p}' },  // TODO: 填写中文名`).join('\n');
      newSrc = newSrc.slice(0, lastBraceIdx) + propLines + '\n  ' + newSrc.slice(lastBraceIdx);
      console.log(`\n${GRN}✓  已自动插入 ${missingProps.length} 个 PROPS 占位项（请补充 name 中文名）${RST}`);
    }
  }
}

// ─── 打印 diff ────────────────────────────────────────────────────────────────
console.log(`\n${CYA}─── 将插入以下关卡代码 ───${RST}`);
console.log(`${GRN}${newLevelCode}${RST}`);
console.log(`\n${CYA}─── 插入位置 ───${RST}`);
const contextStart = Math.max(0, insertPos - 80);
const contextEnd   = Math.min(src.length, insertPos + 80);
const before = src.slice(contextStart, insertPos).split('\n').slice(-2).join('\n');
const after  = src.slice(insertPos, contextEnd).split('\n').slice(0, 2).join('\n');
console.log(`  ...${before}`);
console.log(`  ${GRN}^^^ 在这里插入 ^^^${RST}`);
console.log(`  ${after}...`);

// ─── 写文件 ───────────────────────────────────────────────────────────────────
if (dryRun) {
  console.log(`\n${YLW}⚠  --dry-run 模式，未写入文件${RST}`);
} else {
  fs.writeFileSync(LEVELS_JS, newSrc, 'utf8');
  console.log(`\n${GRN}✓  levels.js 已更新（插入 idx=${level.idx}）${RST}`);
  console.log(`\n${CYA}─── 下一步 ───${RST}`);
  console.log(`  1. 手动确认 levels.js 格式正确（特别是插入位置）`);
  if (addProps && missingProps.length > 0) {
    console.log(`  2. ${YLW}PROPS 占位项已插入，请补充中文 name 字段${RST}`);
  }
  console.log(`  3. node skill/scripts/bump-version.js patch "<摘要>"`);
  console.log(`  4. bash skill/scripts/laotie-check.sh --skip-cdn`);
}
