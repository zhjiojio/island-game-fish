/**
 * bench/sandbox.js —— 隔离沙箱加载器
 * ═══════════════════════════════════════════════════════════════════
 * 【为什么必须有这一层】
 * 可逆 mutation 引擎（mutators.js）要做的事是：把 pd-core.js / pd-levelgen.js
 * 的源码改一个字符 → 加载 → 跑红线 → 还原。如果用 require()，Node 会缓存模块、
 * 且两个文件都往 global.window.M3 上挂东西，第二次加载会污染第一次的结果，
 * 于是「变异后红线还是绿的」这个结论可能是缓存造成的假象。
 *
 * 用 vm.createContext 给每次加载一个全新的 window/M3，才能保证
 * 「一次变异 = 一次干净观测」。这是 GameFix 那套「可逆 mutation + 确定性判据」
 * 能成立的前提，也是本目录所有审计脚本的共同底座。
 *
 * 语法：Node 侧脚本，可用 ES6（不进包，不受 project.config.json es6=false 约束）
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS_DIR = path.join(__dirname, '..', '..', 'package', 'js');
const CORE = path.join(JS_DIR, 'pd-core.js');
const LEVELGEN = path.join(JS_DIR, 'pd-levelgen.js');

/** 读取两个源文件的原始文本（mutation 的操作对象） */
function readSources() {
  return {
    core: fs.readFileSync(CORE, 'utf8'),
    levelgen: fs.readFileSync(LEVELGEN, 'utf8'),
    corePath: CORE,
    levelgenPath: LEVELGEN
  };
}

/**
 * 在全新沙箱里加载一对源码，返回 { PD, LG, L, errors }
 * @param {string} coreSrc      pd-core.js 源码文本（可为变异后版本）
 * @param {string} levelgenSrc  pd-levelgen.js 源码文本
 * @param {object} opt          { silent: true } 吞掉 console，避免变异体刷屏
 */
function load(coreSrc, levelgenSrc, opt) {
  opt = opt || {};
  const errors = [];
  const noop = () => {};
  const sink = { log: noop, warn: noop, error: noop, info: noop };
  const sandbox = {
    console: opt.silent ? sink : console,
    Math, Date, JSON, isNaN, parseInt, parseFloat, String, Number,
    Array, Object, Boolean, Error, TypeError, RangeError,
    setTimeout: noop, clearTimeout: noop
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);

  try {
    vm.runInContext(coreSrc, ctx, { filename: 'pd-core.js', timeout: 20000 });
  } catch (e) {
    errors.push({ file: 'pd-core.js', phase: 'load', msg: String(e && e.message || e) });
    return { PD: null, LG: null, L: null, errors };
  }
  try {
    vm.runInContext(levelgenSrc, ctx, { filename: 'pd-levelgen.js', timeout: 20000 });
  } catch (e) {
    errors.push({ file: 'pd-levelgen.js', phase: 'load', msg: String(e && e.message || e) });
  }

  const PD = sandbox.M3 && sandbox.M3.PD;
  if (!PD) {
    errors.push({ file: 'pd-core.js', phase: 'export', msg: 'window.M3.PD 未导出' });
    return { PD: null, LG: null, L: null, errors };
  }
  return { PD, LG: PD.LG || null, L: PD.L || null, errors };
}

/** 加载磁盘上的当前版本（未变异），审计脚本的常用入口 */
function loadPristine(opt) {
  const s = readSources();
  return load(s.core, s.levelgen, opt);
}

module.exports = { readSources, load, loadPristine, JS_DIR, CORE, LEVELGEN };
