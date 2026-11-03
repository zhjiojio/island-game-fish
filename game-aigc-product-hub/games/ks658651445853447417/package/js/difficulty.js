// ⭐ v1.0.27 难度公式化配置（difficulty engine）
//   目的：把关卡时长从「手工拍脑袋」变成「档位 × 茬数 + 模式补偿 + Boss buff」的可推导公式
//   ─────────────────────────────────────────────────────────────────
//   公式：  duration = setupTime(mode) + oddsCount × perOddSec(diffKey) + (boss ? bossBuf : 0)
//   ─────────────────────────────────────────────────────────────────
//   注意：本文件只提供工具函数，levels.js 里的 duration 仍然显式写死（避免运行时公式误差）。
//        新增关卡时先用 M3.suggestDuration() 算出建议值，写到 levels.js 里即可。
(function(){
  var M3 = window.M3 = window.M3 || {};

  // 档位 → 每茬秒数 & 中文标签（label 用于 UI 展示，key 用于程序判定）
  M3.DIFF = {
    tutorial:  { perOdd: 25, label: '教学'       },
    easy:      { perOdd: 20, label: '简单'       },
    'easy+':   { perOdd: 17, label: '简单+'      },
    normal:    { perOdd: 15, label: '进阶'       },
    'normal+': { perOdd: 13, label: '进阶+'      },
    hard:      { perOdd: 11, label: '困难'       },
    hell:      { perOdd:  9, label: '地狱'       },
    nightmare: { perOdd:  7, label: '极地狱'     },
    ultra:     { perOdd:  6, label: '究极地狱'   }
  };

  // 模式启动时间（观察题面 & 熟悉画布布局的固定成本）
  M3.SETUP_SEC = {
    hidden: 6,   // 单图找茬，眼球扫一张图
    spot:  10,   // 双图找不同，眼球要在左右/上下两图来回对齐
    hunt:   8    // 静态寻物，图更精致但目标更小
  };

  // Boss 关 buff：Boss 内容量普遍大 5-30%，加固定 8s 观察 buff（但每茬秒数不变，靠茬多堆压强）
  M3.BOSS_BUF = 8;

  // 计算建议时长
  //   options: { mode, odds, diffKey, boss }
  M3.suggestDuration = function(opts){
    opts = opts || {};
    var mode = opts.mode || 'hidden';
    var odds = +opts.odds || 1;
    var key  = opts.diffKey || 'normal';
    var d    = M3.DIFF[key] || M3.DIFF.normal;
    var setup = M3.SETUP_SEC[mode] || 6;
    var bossBuf = opts.boss ? M3.BOSS_BUF : 0;
    return setup + odds * d.perOdd + bossBuf;
  };

  // 反查：根据现有 duration 反推档位（用于旧关卡审计）
  M3.audit = function(opts){
    opts = opts || {};
    var mode = opts.mode || 'hidden';
    var odds = +opts.odds || 1;
    var dur  = +opts.duration || 0;
    var setup = M3.SETUP_SEC[mode] || 6;
    var bossBuf = opts.boss ? M3.BOSS_BUF : 0;
    var perOdd = (dur - setup - bossBuf) / odds;
    var best = 'normal', bestGap = 999;
    Object.keys(M3.DIFF).forEach(function(k){
      var gap = Math.abs(M3.DIFF[k].perOdd - perOdd);
      if (gap < bestGap){ bestGap = gap; best = k; }
    });
    return { perOdd: +perOdd.toFixed(1), suggestKey: best, label: M3.DIFF[best].label };
  };

  // ⭐ 宽容机制：连续失败次数 → 追加秒数
  //   同一关卡连续失败 N 次，第 N+1 次自动 +extra 秒
  M3.MERCY = {
    threshold: 2,   // 连续失败达到 threshold 次后，下一次开始就给 mercy
    extra: 10,      // 额外给 10 秒
    key: 'laotie_fail_streak_v1'
  };

  M3.getFailStreak = function(levelIdx){
    try {
      var raw = null;
      if (typeof ks!=='undefined' && ks.getStorageSync) raw = ks.getStorageSync(M3.MERCY.key);
      else if (typeof localStorage!=='undefined') raw = localStorage.getItem(M3.MERCY.key);
      if (!raw) return 0;
      if (typeof raw === 'string') raw = JSON.parse(raw);
      return (raw && raw[levelIdx]) || 0;
    } catch(_e){ return 0; }
  };

  M3.bumpFailStreak = function(levelIdx){
    try {
      var raw = null;
      if (typeof ks!=='undefined' && ks.getStorageSync) raw = ks.getStorageSync(M3.MERCY.key);
      else if (typeof localStorage!=='undefined') raw = localStorage.getItem(M3.MERCY.key);
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch(_e){ raw = {}; } }
      raw = raw || {};
      raw[levelIdx] = (raw[levelIdx] || 0) + 1;
      var v = JSON.stringify(raw);
      if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync(M3.MERCY.key, v);
      else if (typeof localStorage!=='undefined') localStorage.setItem(M3.MERCY.key, v);
    } catch(_e){}
  };

  M3.resetFailStreak = function(levelIdx){
    try {
      var raw = null;
      if (typeof ks!=='undefined' && ks.getStorageSync) raw = ks.getStorageSync(M3.MERCY.key);
      else if (typeof localStorage!=='undefined') raw = localStorage.getItem(M3.MERCY.key);
      if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch(_e){ raw = {}; } }
      raw = raw || {};
      delete raw[levelIdx];
      var v = JSON.stringify(raw);
      if (typeof ks!=='undefined' && ks.setStorageSync) ks.setStorageSync(M3.MERCY.key, v);
      else if (typeof localStorage!=='undefined') localStorage.setItem(M3.MERCY.key, v);
    } catch(_e){}
  };

  // 应用宽容：返回实际的 duration（可能比 base 多 10s）
  //   同时返回是否应用（用于 UI 提示"送你 10 秒 🎁"）
  M3.applyMercy = function(levelIdx, baseDuration){
    var streak = M3.getFailStreak(levelIdx);
    if (streak >= M3.MERCY.threshold){
      return { duration: baseDuration + M3.MERCY.extra, granted: true, streak: streak };
    }
    return { duration: baseDuration, granted: false, streak: streak };
  };

})();
