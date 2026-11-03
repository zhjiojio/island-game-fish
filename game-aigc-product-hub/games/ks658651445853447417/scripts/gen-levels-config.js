#!/usr/bin/env node
/**
 * 从 package/js/levels.js 生成远程下发的 levels-config.json
 * 用法：node scripts/gen-levels-config.js
 * 输出：build-artifacts/levels-config.json
 *
 * 上传到 CDN 后即可让老玩家/新玩家启动时都拉到这份最新配置。
 */
const path = require('path');
const fs   = require('fs');

const ROOT = path.resolve(__dirname, '..');
const LEVELS_JS = path.join(ROOT, 'package/js/levels.js');
const OUT_DIR   = path.join(ROOT, 'build-artifacts');
const OUT_FILE  = path.join(OUT_DIR, 'levels-config.json');

// 通过 Node 环境模拟浏览器全局，直接 eval levels.js
// ⚠️ 关键：eval 前把 M3.LEVELS 的 filter 替换为 no-op，避免运行时隐藏逻辑影响 JSON 导出
const M3 = {};
const window = { M3 };
global.window = window;
global.M3     = M3;

let src = fs.readFileSync(LEVELS_JS, 'utf8');
// 注释掉所有 M3.LEVELS = M3.LEVELS.filter(...) 这类运行时隐藏逻辑
// 这样 gen 出来的 JSON 包含所有关卡，由 level-loader 的 hiddenIdxRanges 控制显示
// 策略：把包含 'M3.LEVELS = M3.LEVELS.filter' 的行替换成注释（只替换行首匹配，安全）
src = src.split('\n').map(function(line) {
  var t = line.trimStart();
  // 跳过：隐藏 idx 30-49 的 filter（场景4城市寻物暂隐，gen时全部导出）
  if (t.indexOf('M3.LEVELS = M3.LEVELS.filter') !== -1 && t.indexOf('idx >= 30') !== -1) {
    return '  /* [gen: filter-30-49 skipped] */';
  }
  return line;
}).join('\n');
try {
  // eslint-disable-next-line no-eval
  eval(src);
} catch (e) {
  console.error('❌ eval levels.js 失败：', e.message);
  process.exit(1);
}

// 生成时间戳版本号
const now = new Date();
const pad = n => String(n).padStart(2,'0');
const version = `${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())}.${pad(now.getHours())}${pad(now.getMinutes())}`;

// story 开场弹窗也属于关卡配置，统一随同一份 levels-config JSON 下发。
// 保留原有顶层字段用于旧包兼容；新包优先读取 intro，避免 UI 文案散落在 game.js。
const themeById = new Map((M3.THEMES || []).map(theme => [theme.id, theme]));
const levels = (M3.LEVELS || []).map(level => {
  if (!level || level.mode !== 'story') return level;
  const clone = Object.assign({}, level);
  const theme = themeById.get(level.themeId) || {};
  const themeIntro = theme.storyIntro && typeof theme.storyIntro === 'object'
    ? theme.storyIntro
    : {};
  const levelIntro = level.intro && typeof level.intro === 'object'
    ? level.intro
    : {};
  const goals = Array.isArray(level.briefGoals) && level.briefGoals.length
    ? level.briefGoals.slice()
    : [];
  clone.intro = Object.assign({}, themeIntro, levelIntro, {
    chapterTitle: levelIntro.chapterTitle || level.chapterTitle || themeIntro.chapterTitle || '先看剧情，再找线索',
    title: levelIntro.title || level.title || '',
    body: levelIntro.body || level.hint || '仔细观察现场，找出所有关键线索。',
    sectionTitle: levelIntro.sectionTitle || themeIntro.sectionTitle || '本关调查方向',
    goals: Array.isArray(levelIntro.goals) && levelIntro.goals.length ? levelIntro.goals.slice() : goals,
    buttonText: levelIntro.buttonText || themeIntro.buttonText || '开始找线索'
  });
  return clone;
});

// story 配置是上线契约：生成阶段就阻断缺字段，避免远程 JSON 下发后才在真机暴露。
const storyErrors = [];
levels.forEach(level => {
  if (!level || level.mode !== 'story') return;
  const intro = level.intro || {};
  if (!themeById.has(level.themeId)) storyErrors.push(`idx=${level.idx} 缺少 themeId=${level.themeId} 的主题配置`);
  ['chapterTitle','title','body','sectionTitle','buttonText'].forEach(key => {
    if (!String(intro[key] || '').trim()) storyErrors.push(`idx=${level.idx} intro.${key} 为空`);
  });
  if (!Array.isArray(intro.goals) || !intro.goals.length) storyErrors.push(`idx=${level.idx} intro.goals 为空`);
  if (!Array.isArray(level.odds) || !level.odds.length) storyErrors.push(`idx=${level.idx} odds 为空`);
  const seenProps = new Set();
  (level.odds || []).forEach((odd, oddIndex) => {
    if (!odd || !odd.prop) storyErrors.push(`idx=${level.idx} odds[${oddIndex}].prop 为空`);
    else if (seenProps.has(odd.prop)) storyErrors.push(`idx=${level.idx} prop=${odd.prop} 重复`);
    else seenProps.add(odd.prop);
    if (!String((odd && odd.clue) || '').trim()) storyErrors.push(`idx=${level.idx} prop=${odd && odd.prop} clue 为空`);
    if (!String((odd && odd.narrative) || '').trim()) storyErrors.push(`idx=${level.idx} prop=${odd && odd.prop} narrative 为空`);
  });
});
if (storyErrors.length) {
  console.error('❌ story 配置校验失败：');
  storyErrors.forEach(error => console.error('   - ' + error));
  process.exit(1);
}

const payload = {
  version,
  publishedAt: now.toISOString(),
  themes:       M3.THEMES       || [],
  levels,
  props:        M3.PROPS        || {},
  laotieLines:  M3.LAOTIE_LINES || [],
  // ⚠️ hiddenIdxRanges 按 themeId 分开控制
  // 场景1（themeId:1）全部显示，不需要全局 idx 范围过滤
  // 场景4（themeId:4）天津之后暂隐：在 levels.js 里用 filter 控制，此处留空
  // 如需动态隐藏特定关：加 { themeId:4, range:[30,49] } 格式（level-loader 需升级支持）
  hiddenIdxRanges: []  // 清空：改为在 levels.js filter 层控制，CDN JSON 只下发可见关
};

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
const sizeKB = (fs.statSync(OUT_FILE).size / 1024).toFixed(1);
console.log(`✅ 生成 ${OUT_FILE}`);
console.log(`   version=${version} themes=${payload.themes.length} levels=${payload.levels.length} size=${sizeKB}KB`);
console.log('');
console.log('下一步 · 上传到 CDN:');
console.log('  URL: https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks658651445853447417/levels-config.json');
console.log('  记得开发者后台「服务器域名白名单 · request」加 https://p1-ad.adkwai.com');
