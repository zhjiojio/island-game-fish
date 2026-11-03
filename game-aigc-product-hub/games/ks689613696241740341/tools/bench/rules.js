/**
 * bench/rules.js —— 运行时规则契约（单一真值源）
 * ═══════════════════════════════════════════════════════════════════
 * 【为什么要有这个文件 · 全项目最贵的一条经验】
 *
 * skill 已知坑 10 记录：`solveLevel` 曾报 solvable:true / peakSlots:1 全绿，
 * 但真机 200 局里 112 局死局（56%）。根因不是算法错，而是【口径分裂】：
 * 求解器、验收脚本、胜率模拟器、真机运行时这四处，各自对
 * 「豆子怎样才能被吸走」「车什么时候离场」「有几个车位可用」有不同理解。
 *
 * 任何一处偷偷放宽一条规则，红线就会变成【假绿灯】—— 比没有红线更危险，
 * 因为它给了你「已经验过」的错觉。
 *
 * 【2026-08-31 结构性修复】真机规则已收拢为 pd-core.js 的 PD.simulateRuntime，
 * 成为唯一权威实现。本文件的职责随之变成两件事：
 *   ① 声明规则契约与 anchor，供 parity-audit 静态检查
 *   ② 声明【谁不许自己重写运行时规则】—— 重复实现是口径分裂的唯一来源
 *
 * ⚠️ 铁律：改动任何一条运行时规则，必须改 PD.simulateRuntime，
 *          并且【只改那一处】。任何在 tools/ 里重写一遍模拟器的 PR 都应被拒。
 * ═══════════════════════════════════════════════════════════════════
 */
'use strict';

/** 可用车位数。6 个车位里第 6 个默认锁着（需看广告解锁）→ 默认可用 5 */
const USABLE_SLOTS = 5;
/** 候选队列可直接取用的格数（前 4 格；5~8 格是第二排预览） */
const QUEUE_HEAD = 4;
/** 「消除」道具（激励视频）在一局内的额度预算，同时是广告曝光预估 */
const CLEAR_BUDGET = 4;

/**
 * 规则契约表。
 * id       规则编号（parity 报告里引用）
 * name     人话描述
 * why      为什么必须一致（分裂后会产生什么事故）
 * anchors  各实现文件里必须出现的代码特征（正则）。null = 该文件不适用此规则。
 */
const RULES = [
  {
    id: 'R1',
    name: '可取性 = Z轴层叠(isPickable) AND XY走路(pathOut/canWalk)',
    why: '只判 Z 轴会让求解器偏乐观：豆子头顶没东西但被同层豆子围死走不出来，' +
         '求解器判可取、真机判不可取 → 求解器说能过的关，真机死局。',
    anchors: {
      'pd-core.js':          /isPickable\s*\(/,
      'pd-core.js#walk':     /useWalk|opt\.walk/,
      'pd-game.js':          /canWalkFast|canWalk\s*\(/,
      'validate-levels.js':  /isPickable[\s\S]{0,80}pathOut/,
      'winrate.js':          /isPickable[\s\S]{0,120}pathOut/
    }
  },
  {
    id: 'R2',
    name: '可用车位数 = 5（第 6 位默认锁着）',
    why: '求解器若用 lv.slots(=6) 就多了一个车位，等于凭空多一次容错，' +
         '所有「刚好卡死在 5 个位」的关卡都会被误判为可解。',
    anchors: {
      'pd-core.js':          /opt\.slots|slots\s*=\s*.{0,20}usable/,
      'pd-game.js':          /slot6Locked/,
      'validate-levels.js':  /usable\s*=\s*5/,
      'winrate.js':          /usable/
    }
  },
  {
    id: 'R3',
    name: '车离场只有两条通道：装满(left==0) 或 广告权益(扩容车)',
    why: '这是被用户明确拍死的铁律「车跑的逻辑 only 装满或者看广告获得的权益」。' +
         '任何实现里若还留着「该色豆清空 → 未装满也放行」，就等于凭空回收车位，' +
         '难度被系统性低估。当前 pd-game.js 已删除该通道，其他三处必须跟上。',
    anchors: {
      'pd-core.js':          /不再自动放行|与运行时同口径/,
      'pd-game.js':          /releaseAdBoostedCars/,
      'validate-levels.js':  /autoRelease/,
      'winrate.js':          /该色清空|autoRelease|releaseAd/
    }
  },
  {
    id: 'R4',
    name: 'ghost 干扰车(decoy===1) 永不自动放行，必须占位直到被广告拖走',
    why: 'ghost 的全部设计价值就是「占位制造压力 → 逼玩家看广告」。' +
         '任何一处把 ghost 当普通车放行，干扰车就变成零成本装饰，' +
         '变现闭环（失败压力→广告）当场失效，且胜率被高估。',
    anchors: {
      'pd-core.js':          /decoy/,
      'pd-game.js':          /decoy\s*===\s*1/,
      'validate-levels.js':  /decoy\s*!==\s*1|decoy\s*===\s*1/,
      'winrate.js':          /decoy/
    }
  },
  {
    id: 'R5',
    name: '三星阈值必须用 carMoves（纯调车次数），不能用 minMoves（混算装豆次数）',
    why: 'skill 已知坑 12：minMoves = 装豆次数 + 调车次数（量级 173/248/493），' +
         '而运行时 S.moves 只在拖车入位时 ++（量级 8/9/19）。' +
         '用 minMoves 定阈值 → 玩家永远 3 星 → 星门槛留存设计直接失效。',
    anchors: {
      'pd-core.js':          /carMoves/,
      'pd-game.js':          /carMoves|stars\.three\s*=/,
      'validate-levels.js':  /carMoves/,
      'winrate.js':          null
    }
  },
  {
    id: 'R6',
    name: '车位占满时玩家的官方出路 = 「消除」道具（有额度上限）',
    why: '若判死局不考虑广告道具，所有有难度的关卡都会被误报为 bug；' +
         '若考虑但不设额度，则任何关卡都「可解」，红线失去意义。' +
         '必须是「带 ' + CLEAR_BUDGET + ' 次广告额度仍过不了」才算不可解。',
    anchors: {
      'pd-core.js':          null,
      'pd-game.js':          /rewardAd/,
      'validate-levels.js':  /CLEAR_BUDGET/,
      'winrate.js':          null
    }
  },
  {
    id: 'R7',
    name: '单色冗余 S 必须按颜色取 min，不能算全局和',
    why: 'skill 参数 1 反例：粉 +20% / 紫 −10%，全局 +15% 看起来很安全，' +
         '但紫色已经数学上必死。全局和是假的安全感。',
    anchors: {
      'pd-core.js':          /colorStats|out\.min/,
      'pd-game.js':          null,
      'validate-levels.js':  /m\.S\s*<=\s*0|negS/,
      'winrate.js':          null
    }
  },
  {
    id: 'R8',
    name: '真机规则只有一份实现：PD.simulateRuntime',
    why: '这条是元规则，防的是「规则本身被复制成 N 份」。历史上真机规则被重复' +
         '实现了五遍（solveLevel / pd-game / simRuntime / playOnce / refPlay），' +
         '改一条规则要同步五处，漏一处就是假绿灯。现在收拢到 PD.simulateRuntime，' +
         '任何 tools 脚本必须调它，不许自己再写一遍 while(remain>0) 循环。',
    anchors: {
      'pd-core.js':          /PD\.simulateRuntime\s*=/,
      'pd-game.js':          null,
      'validate-levels.js':  /simulateRuntime/,
      'winrate.js':          null
    }
  },
  {
    id: 'R9',
    name: 'solveLevel 是【完美先知上界】，不是真机预测器',
    why: '它可从整个队列任意挑车、自动绕开 ghost、车位可压缩，' +
         '所以 peakSlots 恒接近 1、solvable 恒偏乐观 —— 这是设计内行为。' +
         '任何红线/胜率/三星判据若拿它当真机预测，必然重演「56% 死局」。' +
         '正确判据：solveLevel 判不可解 ⟹ 运行时必不可解（单向蕴含）。',
    anchors: {
      'pd-core.js':          /完美先知|先知特权/,
      'pd-game.js':          null,
      'validate-levels.js':  /不是 solveLevel|simulateRuntime/,
      'winrate.js':          null
    }
  }
];

/** 四处实现文件相对 tools/bench 的路径 */
const IMPL_FILES = {
  'pd-core.js':         '../../package/js/pd-core.js',
  'pd-core.js#walk':    '../../package/js/pd-core.js',
  'pd-game.js':         '../../package/js/pd-game.js',
  'validate-levels.js': '../validate-levels.js',
  'winrate.js':         '../winrate.js'
};

module.exports = { RULES, IMPL_FILES, USABLE_SLOTS, QUEUE_HEAD, CLEAR_BUDGET };
