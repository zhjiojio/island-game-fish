#!/usr/bin/env node
/**
 * bench/mutators.js —— 可逆变异算子（移植 GameFix 的 reversible mutation）
 * ═══════════════════════════════════════════════════════════════════
 * 【核心思想 · 为什么这是整套 bench 里最巧的一环】
 *
 * 常规做法是「先有 bug，再人工标注正确答案」——
 * 标注昂贵、主观、且会泄漏（标注者的思路就是答案）。
 *
 * GameFix 的做法反过来：从一个【已知正确】的实现出发，用算子注入缺陷。
 * 于是【算子的逆运算天然就是标准答案（gold patch）】，零标注成本、
 * 零主观性、且缺陷分布完全可控。
 *
 * 【它在拼豆能回答什么问题（这是关键价值）】
 * 8 条红线全绿，只能证明「当前关卡没被抓到问题」，
 * 不能证明「红线有能力抓问题」。这两件事天差地别 ——
 * 一个永远返回绿灯的空脚本也能做到前者。
 *
 * 所以要反过来测红线本身：**故意注入已知缺陷，看红线抓不抓得住**。
 *   抓住了 → 这条红线有效（mutant killed）
 *   没抓住 → 【存活变异体】= 红线在这个方向上是瞎的 = 未来事故的入口
 * 变异体杀灭率 = killed / total，这是红线体系的**能力指标**，
 * 而 8/8 全绿只是红线体系的**当前状态**。状态好但能力差 = 运气好。
 *
 * 【为什么算子作用在源码文本上而不是运行期打补丁】
 * 因为要模拟的正是「人改错了一行代码」这件事。运行期猴子补丁
 * 只能改函数入口，改不到 while 循环里的判定 —— 而真实事故恰好都在那里。
 * 配合 sandbox.js 的 vm 隔离，每个变异体都在干净上下文里被观测。
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

/**
 * 每个算子：
 *   id       变异体编号
 *   dim      所属缺陷维度（对齐 failure-taxonomy.md 的 T1~T4）
 *   target   作用文件 'core' | 'levelgen'
 *   desc     这个变异模拟的是【什么人为错误】
 *   expect   期望被哪条红线/审计抓住（写清楚才能判定"该抓没抓"）
 *   apply    (src) => 变异后的源码；返回 null 表示锚点未命中（算子已过期）
 *
 * 逆运算 = 不施加该算子（原始源码），所以不需要单独写 inverse。
 */
const MUTATORS = [
  // ── T2 状态机维度：车位与离场规则（拼豆最高危区）────────────────
  {
    id: 'M01', dim: 'T2', target: 'core',
    desc: '把可用车位从 5 改成 6（等于偷偷解锁广告车位）',
    expect: 'V1/V3 —— 多一个车位=凭空多一次容错，原本卡死的关卡会变成"可解"',
    apply: s => rep(s, /var usable = opt\.slots \|\| 5;/, 'var usable = opt.slots || 6;')
  },
  {
    id: 'M02', dim: 'T2', target: 'core',
    desc: '恢复「该色清空即放行」通道（autoRelease 默认 true）',
    expect: 'parity-audit P3 —— 这正是已知坑 10 的原始事故',
    apply: s => rep(s, /var autoRelease = !!opt\.autoRelease;/, 'var autoRelease = opt.autoRelease !== false;')
  },
  {
    id: 'M03', dim: 'T2', target: 'core',
    desc: '让 ghost 干扰车(decoy===1)也能自动放行',
    expect: 'V1 —— ghost 变成零成本装饰，变现闭环失效且胜率被高估',
    apply: s => rep(s, /if \(slots\[s\] && slots\[s\]\.decoy !== 1 && !rest\[slots\[s\]\.color\]\) \{ slots\[s\] = null; did = true; \}/,
      'if (slots[s] && !rest[slots[s].color]) { slots[s] = null; did = true; }')
  },
  {
    id: 'M04', dim: 'T2', target: 'core',
    desc: '把队列可取格数从 4 放宽到 8（第二排也能直接拖）',
    expect: 'V1 —— 玩家能绕开所有 ghost，难度归零',
    apply: s => rep(s, /var qHead = opt\.queueHead \|\| 4;/, 'var qHead = opt.queueHead || 8;')
  },
  {
    id: 'M05', dim: 'T2', target: 'core',
    desc: '把广告清车额度从 4 改成无限',
    expect: 'V1 —— 任何死局都能靠无限广告解开，不可解永远为 0',
    apply: s => rep(s, /var budget = opt\.clearBudget === undefined \? 4 : opt\.clearBudget;/,
      'var budget = 1e9;')
  },
  // ── T2 可取性判定：Z 轴 × XY 的 AND 关系 ────────────────────────
  {
    id: 'M06', dim: 'T2', target: 'core',
    desc: '可取性只判 Z 轴层叠，去掉 XY 走路判定（AND 退化为单条件）',
    expect: 'V1 —— 被围死的豆也算能走，走不出去的关卡被判可解',
    apply: s => rep(s, /return isPickable\(b, top\) && !!pathOut\(b, occ, bd, null\);/,
      'return isPickable(b, top);')
  },
  {
    id: 'M07', dim: 'T2', target: 'core',
    desc: 'isPickable 改成「层号为 0 即可取」（丢掉头顶遮挡语义）',
    expect: 'V1 —— 被压住的豆凭空可取，遮挡层设计完全失效',
    apply: s => rep(s, /return top\[bean\.gx \+ '_' \+ bean\.gy\] === bean\.layer;/,
      'return bean.layer === 0;')
  },
  // ── T2 冗余率：按颜色取 min vs 全局和 ──────────────────────────
  {
    id: 'M08', dim: 'T2', target: 'core',
    desc: 'colorStats 的 min 改成算全局平均（skill 参数1 的经典反例）',
    expect: 'V2 —— 粉+20%/紫-10% 时全局 +15% 看起来安全，但紫色数学上必死',
    apply: s => rep(s, /if \(s < out\.min\) out\.min = s;/, 'out.min = (out.min === Infinity ? s : (out.min + s) / 2);')
  },
  // ── T3 反馈/评分维度：三星阈值 ─────────────────────────────────
  {
    id: 'M09', dim: 'T3', target: 'levelgen',
    desc: '三星阈值改用 minMoves（混算装豆次数）而不是 carMoves',
    expect: 'V8 / parity P2 —— skill 已知坑「三星永远3星」的原始根因',
    apply: s => rep(s, /lv\.stars\.three = Math\.max\(sol\.carMoves, Math\.ceil\(sol\.carMoves \* 1\.15\)\);/,
      'lv.stars.three = Math.ceil(sol.minMoves * 1.15);')
  },
  {
    id: 'M10', dim: 'T3', target: 'levelgen',
    desc: '三星与二星阈值设成同一个值（星级失去区分度）',
    expect: 'V8 —— 拿不到 2 星，只有 3 星和 1 星',
    apply: s => rep(s, /lv\.stars\.two = Math\.ceil\(sol\.carMoves \* 1\.5\);/,
      'lv.stars.two = lv.stars.three;')
  },
  // ── T2 关卡生成门禁 ────────────────────────────────────────────
  {
    id: 'M11', dim: 'T2', target: 'levelgen',
    desc: '生成门禁去掉僵尸车峰值检查（只看 solvable）',
    expect: 'V3 —— 僵尸车堆满车位的关卡会被放行上线',
    apply: s => rep(s, /if \(s\.solvable === true && s\.zombiePeak < D\.usable\) \{ lv = cand; sol = s; break; \}/,
      'if (s.solvable === true) { lv = cand; sol = s; break; }')
  },
  {
    id: 'M12', dim: 'T2', target: 'levelgen',
    desc: '生成门禁改成「无条件接受第一个候选」（等于取消校验）',
    expect: 'V1/V3/V4 —— 任何一条与关卡质量相关的红线都该炸',
    apply: s => rep(s, /if \(s\.solvable === true && s\.zombiePeak < D\.usable\) \{ lv = cand; sol = s; break; \}/,
      '{ lv = cand; sol = s; break; }')
  },
  // ── T4 数值/平衡维度 ──────────────────────────────────────────
  {
    id: 'M13', dim: 'T4', target: 'core',
    desc: 'splitCaps 退回均分（所有车容量一样，信息量归零）',
    expect: '无红线覆盖 —— 预期存活。这暴露了「策略性」目前没有量化判据',
    apply: s => rep(s, /for \(i = 0; i < num \* 5; i\+\+\) \{/, 'for (i = 0; i < 0; i++) {')
  },
  {
    id: 'M14', dim: 'T4', target: 'core',
    desc: 'shuffleQueue 退回严格轮转（每排颜色完全一致）',
    expect: '无红线覆盖 —— 预期存活。用户原话「这还有策略么？」正是此病',
    apply: s => rep(s, /if \(run >= 2\) w = 0;/, 'if (run >= 1) w = 0;')
  },
  {
    id: 'M15', dim: 'T1', target: 'core',
    desc: '注入运行期异常（模拟加载/崩溃类缺陷）',
    expect: 'sandbox 加载即报错 —— 验证审计能识别 T1 类崩溃',
    apply: s => rep(s, /PD\.simulateRuntime = simulateRuntime;/,
      'PD.simulateRuntime = simulateRuntime; (function(){ throw new Error("MUTANT_M15_CRASH"); })();')
  }
];

// 精确替换：锚点必须唯一命中，命中 0 次或多次都返回 null（算子过期需修）
function rep(src, re, to) {
  const m = src.match(new RegExp(re.source, 'g'));
  if (!m || m.length !== 1) return null;
  return src.replace(re, to);
}

module.exports = { MUTATORS };
