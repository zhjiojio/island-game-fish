#!/usr/bin/env node
/**
 * bench/bench-all.js —— 一条命令跑完整个 bench
 * ═══════════════════════════════════════════════════════════════════
 * 用法：node tools/bench/bench-all.js [关卡上限] [每关seed数]
 * 退出码：0 = 核心项全过；1 = 有核心项未过（禁止 build）；2 = 环境异常
 *
 * 【为什么必须有一条命令】
 * 六个脚本分开跑时，人会本能地只跑"上次报错那个"，
 * 于是逐渐退化成"只看自己关心的那条红线" —— 这是红线体系失效的标准路径。
 * 一条命令、一份报告、一个退出码，让"跳过某一项"变成一个需要刻意为之的动作。
 *
 * 【报告结构对齐 rubric.json】
 *   核心项 core  ：任一不过 = 禁止上线，一票否决，不做加权
 *   加分项 bonus ：反映品质，不阻塞
 * 为什么核心项不加权求和：加权会产生"这项差一点、那项好一点、总分还行"的
 * 幻觉，而核心项的性质是【每一条都是独立的必要条件】——
 * 语法错和口径分裂之间没有互相补偿的可能。
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const MAXN = process.argv[2] || '20';
const SEEDS = process.argv[3] || '3';
const ROOT = path.resolve(__dirname, '../..');
const rubric = JSON.parse(fs.readFileSync(path.join(__dirname, 'rubric.json'), 'utf8'));

function run(label, script, args) {
  const t0 = Date.now();
  let out = '', code = 0;
  try {
    out = execFileSync('node', [path.join(ROOT, script)].concat(args || []),
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    code = e.status === undefined ? 2 : e.status;
    out = (e.stdout || '') + (e.stderr || '');
  }
  return { label, script, code, out, ms: Date.now() - t0 };
}

// ES5 语法门禁：本地 Chrome 完全看不出来，但真机白屏（T1 类，先验概率最高）
function checkES5() {
  const dir = path.join(ROOT, 'package/js');
  const bad = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    try { execFileSync('node', ['-c', path.join(dir, f)], { stdio: 'ignore' }); }
    catch (e) { bad.push(f); }
  }
  return { label: 'C6 ES5 语法纯净', code: bad.length ? 1 : 0,
    out: bad.length ? '语法错文件：' + bad.join(', ') : '全部通过', ms: 0 };
}

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  拼豆 Bench —— 全量审计（对齐 rubric.json v' + rubric._meta.version + '）        ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('  样本：1~' + MAXN + ' 关 × ' + SEEDS + ' seed\n');

const results = [];
console.log('▶ C6 ES5 语法门禁 …');
results.push(checkES5());
console.log('▶ C3 证据准入 …');
results.push(Object.assign(run('C3 契约符号可准入', 'tools/bench/evidence.js', ['audit'])));
console.log('▶ C1+C2 口径一致性 …');
results.push(Object.assign(run('C1+C2 口径一致性', 'tools/bench/parity-audit.js', [MAXN, SEEDS])));
console.log('▶ C4 8 条红线 …');
results.push(Object.assign(run('C4 8 条红线', 'tools/validate-levels.js', [MAXN, SEEDS])));
console.log('▶ C5 变异体杀灭率 …');
results.push(Object.assign(run('C5 变异体杀灭率', 'tools/bench/gate-audit.js', [Math.min(12, +MAXN), '2'])));
console.log('▶ B1~B4 曲线健康度 …');
results.push(Object.assign(run('B1~B4 曲线健康度', 'tools/bench/strict-curve.js', [MAXN, SEEDS])));

// ── 报告 ──────────────────────────────────────────────────────────
const CORE = ['C6', 'C3', 'C1', 'C4', 'C5'];
console.log('\n╔═══ 核心项（任一不过 = 禁止 build）═══╗');
let coreFail = 0;
for (const r of results) {
  const isCore = CORE.some(c => r.label.indexOf(c) === 0);
  if (!isCore) continue;
  const ok = r.code === 0;
  if (!ok) coreFail++;
  console.log('  ' + (ok ? '✅' : '❌') + ' ' + r.label.padEnd(24)
    + (r.ms ? (r.ms / 1000).toFixed(1) + 's' : ''));
}
console.log('\n╔═══ 加分项（反映品质，不阻塞）═══╗');
for (const r of results) {
  if (CORE.some(c => r.label.indexOf(c) === 0)) continue;
  console.log('  ' + (r.code === 0 ? '✅' : '⚠️ ') + ' ' + r.label.padEnd(24)
    + (r.ms ? (r.ms / 1000).toFixed(1) + 's' : ''));
}

// 失败项的关键输出摘录 —— 只摘最后 12 行，避免报告本身变成噪音
const failed = results.filter(r => r.code !== 0);
if (failed.length) {
  console.log('\n╔═══ 失败项摘录 ═══╗');
  for (const r of failed) {
    console.log('\n── ' + r.label + '  (exit ' + r.code + ') ──');
    const lines = r.out.trim().split('\n');
    for (const ln of lines.slice(-12)) console.log('  ' + ln);
  }
}

console.log('\n╔══════════════════════════════════════════════════════════╗');
if (coreFail) {
  console.log('║  ❌ ' + coreFail + ' 项核心红线未过 —— 禁止 build / 禁止上传          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log('\n【修复顺序 —— 按 docs/failure-taxonomy.md 的先验概率排队】');
  console.log('  1) C6 语法    ：真机白屏，本地看不出来，先验概率最高');
  console.log('  2) C3 证据    ：伪证会让后面所有结论失效，必须先清理');
  console.log('  3) C1/C2 口径 ：口径不一致时，其他红线的数字都不可信');
  console.log('  4) C4 红线    ：口径修好后再看关卡本身的质量');
  console.log('  5) C5 杀灭率  ：最后测红线的能力（基线必须先全绿，顺序不可逆）');
  console.log('\n⚠️ 不要倒着修。先修 C5 是徒劳的 —— 基线红着的时候，');
  console.log('   杀灭率里大量算子会落入"无法判定"，那个数字没有意义。');
} else {
  console.log('║  ✅ 核心红线全过                                          ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  const bonusFail = results.filter(r => r.code !== 0).length;
  if (bonusFail) console.log('\n  ⚠️ 仍有 ' + bonusFail + ' 项加分项未达标，属品质问题，可上线但应排期。');
}
console.log('\n【证据准入提醒】');
console.log('  本报告的退出码本身就是可准入证据。');
console.log('  「我看了一下应该没问题」不是证据 —— 见 tools/bench/evidence.js。');
process.exit(coreFail ? 1 : 0);
