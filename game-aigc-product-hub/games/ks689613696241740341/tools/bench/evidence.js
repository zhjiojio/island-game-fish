#!/usr/bin/env node
/**
 * bench/evidence.js —— 证据准入规则（移植 GameOpt 的 evidence admissibility）
 * ═══════════════════════════════════════════════════════════════════
 * 【它治什么病】
 * GameXpert-Bench 的 GameOpt 赛道发现：模型极擅长「声称做完了」。
 * 常见伪证有四类，本项目全部中过招：
 *   ① 注释说做了     → 「// 已修复车位死局」但代码一行没动
 *   ② 死代码里做了   → 函数写了但没有任何可达调用路径引用它
 *   ③ 配置项做了     → 加了 ENABLE_XXX 开关但默认 false 且无人读
 *   ④ 我自己说做了   → 对话里的自然语言描述当成交付证明
 *
 * 所以定义【准入】：只有能被执行、能被观测的东西才算证据。
 *   ✅ 可达调用链上的代码位置（有人真的 require/调用它）
 *   ✅ 运行时日志 / 审计脚本的退出码与数字产出
 *   ✅ 截图 / 音频轨（真机可观测）
 *   ❌ 注释、TODO、未被引用的配置、死代码、模型自述
 *
 * 【为什么值得写成脚本而不是靠自觉】
 * 「靠自觉」等价于零约束。skill 已知坑里反复出现的
 * 「照抄桌面源码 / rsync 覆盖 / 线上逻辑丢了」，本质都是
 * 「以为改了 = 真的改了」。只有可执行的准入检查能拦住它。
 *
 * 用法：
 *   node tools/bench/evidence.js check <符号名> ...   逐个判定证据是否可准入
 *   node tools/bench/evidence.js audit                扫全仓死代码/空开关
 * 退出码：0 = 全部可准入；非 0 = 存在不可准入的伪证
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const JS_DIR = path.join(ROOT, 'package', 'js');
const TOOLS_DIR = path.join(ROOT, 'tools');
// 【可达性的根必须同时包含运行时与工具链】
// 初版只扫 package/js/，结果把【只被验收脚本调用的函数】误判为死代码——
// 例如 PD.simulateRuntime 是给 tools/validate-levels.js 当判据用的，
// 它本就不应该出现在游戏运行时里。判据代码也是生产代码。
// ⚠️ 这个错误本身就是个好例子：【审计工具自己也会有口径 bug】——
//    它第一次跑就平反了一个真存在的符号，若不修就会造成【假红灯】，
//    而假红灯的后果是大家开始无脑绕过审计 —— 比假绿灯还难治。
const ENTRIES = ['main.js', 'm3-init.js', 'pd-game.js', 'pd-home.js'];

function listJs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => f.endsWith('.js'))
    .map(f => ({ name: f, path: path.join(dir, f) }));
}

function readAll() {
  const out = {};
  for (const f of listJs(JS_DIR)) out[f.name] = fs.readFileSync(f.path, 'utf8');
  // 工具链也算可达根（前缀 tools/ 以便报告里看得出来）
  for (const f of listJs(TOOLS_DIR)) out['tools/' + f.name] = fs.readFileSync(f.path, 'utf8');
  const bench = path.join(TOOLS_DIR, 'bench');
  for (const f of listJs(bench)) out['tools/bench/' + f.name] = fs.readFileSync(f.path, 'utf8');
  return out;
}

// ── 把注释剥掉：注释里的内容一律不算证据（这是准入规则的第一条）──────
// 【为什么必须剥】否则 `// PD.simulateRuntime 已接入` 这行注释会让
// 「是否接入」的检查通过 —— 正是我们要防的伪证 ①。
function stripComments(src) {
  // 先去块注释，再去行注释。字符串里的 // 会被误伤，但对「符号是否被调用」
  // 这个判定来说误伤方向是安全的（宁可漏报可达，不可虚报可达）。
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * 判定一个符号是否具备「可准入证据」。
 * 返回 { admissible, defined, callers, reason }
 */
function checkSymbol(sym, sources) {
  const bare = sym.replace(/^.*\./, '');           // PD.simulateRuntime → simulateRuntime
  const defRe = new RegExp('(function\\s+' + bare + '\\s*\\(|' +
    bare + '\\s*[:=]\\s*function|' +
    bare + '\\s*[:=]\\s*\\()');
  const callRe = new RegExp('(?<![.\\w])' + bare + '\\s*\\(');

  let defined = null;
  const callers = [];
  for (const name of Object.keys(sources)) {
    const clean = stripComments(sources[name]);
    if (!defined && defRe.test(clean)) defined = name;
    // 调用点：排除定义自身那一行
    const lines = clean.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (defRe.test(ln)) continue;                  // 定义行不算调用
      if (callRe.test(ln) || ln.indexOf(sym + '(') >= 0) {
        callers.push(name + ':' + (i + 1));
        break;
      }
    }
  }

  if (!defined) return { admissible: false, defined: null, callers, reason: '符号未定义 —— 只存在于注释或描述里（伪证①/④）' };
  if (!callers.length) return { admissible: false, defined, callers, reason: '已定义但无任何可达调用点 = 死代码（伪证②）' };
  return { admissible: true, defined, callers, reason: '定义于 ' + defined + '，被 ' + callers.length + ' 处调用' };
}

// ── 空开关探测：加了配置项但从没人读它 = 伪证 ③ ──────────────────
function findDeadFlags(sources) {
  const out = [];
  for (const name of Object.keys(sources)) {
    const clean = stripComments(sources[name]);
    // 形如 var ENABLE_X = false / FEAT_Y: false
    const re = /(?:var|let|const)\s+([A-Z][A-Z0-9_]{3,})\s*=\s*(false|0)\s*[;,]/g;
    let m;
    while ((m = re.exec(clean))) {
      const flag = m[1];
      // 统计除定义外的引用次数
      let refs = 0;
      for (const n2 of Object.keys(sources)) {
        const c2 = stripComments(sources[n2]);
        const rr = new RegExp('\\b' + flag + '\\b', 'g');
        refs += (c2.match(rr) || []).length;
      }
      if (refs <= 1) out.push({ file: name, flag });
    }
  }
  return out;
}

const sources = readAll();
const mode = process.argv[2] || 'audit';

if (mode === 'check') {
  const syms = process.argv.slice(3);
  if (!syms.length) { console.log('用法：node tools/bench/evidence.js check PD.simulateRuntime ...'); process.exit(2); }
  console.log('═══ 证据准入判定 ═══\n');
  let deny = 0;
  for (const s of syms) {
    const r = checkSymbol(s, sources);
    if (!r.admissible) deny++;
    console.log('  ' + (r.admissible ? '✅ 准入' : '❌ 拒收') + '  ' + s);
    console.log('        ' + r.reason);
    if (r.callers.length) console.log('        调用点：' + r.callers.slice(0, 5).join(', '));
    console.log('');
  }
  console.log(deny === 0 ? '✅ 全部证据可准入' : '❌ ' + deny + ' 项伪证被拒收');
  process.exit(deny === 0 ? 0 : 1);
}

// audit 模式
console.log('═══ 证据准入审计（伪证扫描）═══\n');
console.log('【规则】只有「可执行 + 可观测」的东西算证据。');
console.log('  ✅ 可达调用链上的代码 / 运行时日志 / 审计脚本退出码 / 截图音轨');
console.log('  ❌ 注释 / TODO / 未被读取的配置 / 死代码 / 模型自述\n');

// 关键契约符号：这些是本次改造声称交付的东西，必须逐个过准入
const CONTRACT = [
  'PD.simulateRuntime',
  'PD.solveLevel',
  'PD.isPickable',
  'PD.pathOut',
  'PD.colorStats'
];
console.log('【A】契约符号可达性');
let deny = 0;
for (const s of CONTRACT) {
  const r = checkSymbol(s, sources);
  if (!r.admissible) deny++;
  console.log('  ' + (r.admissible ? '✅' : '❌') + ' ' + s.padEnd(24) + r.reason);
}

console.log('\n【B】空开关探测（加了配置但无人读 = 伪证③）');
const dead = findDeadFlags(sources);
if (!dead.length) console.log('  ✅ 未发现空开关');
else for (const d of dead) console.log('  ⚠ ' + d.file + ' : ' + d.flag + ' 定义后无人引用');

console.log('\n【C】注释承诺 vs 实现（伪证①）');
// 扫「已修复 / 已接入 / 已删除」这类完成态断言，检查它引用的符号是否真的可达
let claimMiss = 0;
for (const name of Object.keys(sources)) {
  const lines = sources[name].split('\n');
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    if (!/\/\/|\*/.test(ln)) continue;
    if (!/已(修复|接入|删除|改为|统一|收拢)/.test(ln)) continue;
    // 从这行注释里抽出可能的符号名
    const m = ln.match(/([A-Za-z_$][\w$]*\.[A-Za-z_$][\w$]*)/);
    if (!m) continue;
    const r = checkSymbol(m[1], sources);
    if (!r.admissible) {
      claimMiss++;
      if (claimMiss <= 8) console.log('  ⚠ ' + name + ':' + (i + 1) + ' 声称「' + m[1] + '」但 ' + r.reason);
    }
  }
}
if (!claimMiss) console.log('  ✅ 注释里的完成态断言均有可达实现支撑');
else console.log('  共 ' + claimMiss + ' 处待确认');

console.log('\n' + (deny === 0 ? '✅ 契约符号全部可准入' : '❌ ' + deny + ' 个契约符号是伪证'));
process.exit(deny === 0 ? 0 : 1);
