/**
 * vibrate.js — 震动反馈统一管理（VibrateManager）
 *
 * 分级（产品文档《斗地主震动分级定义》）：
 *   弱 light   ≈15ms  高频操作：选牌 / 出牌 / 倒计时秒针
 *   中 medium  ≈25ms  关键节点：叫抢地主 / 报单 / 错误双震
 *   强 heavy   ≈400ms 低频高价值：成地主 / 炸弹 / 结算
 *
 * 硬约束（全部在本层实现，业务代码不感知）：
 *   1. 铁律：一局内「强」≤3 次，超出自动降级为 medium（超预算硬震用户会去关震动）
 *   2. 全局节流 50ms：任意两次震动间隔 <50ms 丢弃后一次（防多回调叠一帧震成马达）
 *   3. 设置开关 ddz_vib_enabled：缓存读取，设置页写入后调 refresh()；关闭直接 return
 *   4. 平台降级：强档走 vibrateLong()（type 参数失效的安卓机型天然兼容，
 *      弱/中仍走 vibrateShort(type)，不因不支持分级而整体关闭）
 *   5. 切后台立即清空所有待触发震动队列
 *
 * 业务侧只允许调用 M3.Vibrate.*，禁止直调 KwaiDevice.vibrateShort/vibrateLong。
 * 常用语义封装：err() = 中×2 间隔 60ms（通用「错误」双震）。
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var STRONG_BUDGET = 3;   // 铁律：一局 ≤3 次强
  var THROTTLE_MS = 50;  // 全局节流
  var ERR_GAP_MS = 60;  // 错误双震间隔

  var _enabled = true;     // 开关缓存（避免每次震动读 storage）
  var _lastAt = 0;         // 上次实际震动时刻（节流基准）
  var _strongUsed = 0;     // 本局强档已用次数
  var _timers = [];        // 待触发序列（切后台清空）

  function readEnabled () {
    try {
      var raw = null;
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync) raw = KwaiStorage.getSync('ddz_vib_enabled');
      else if (typeof localStorage !== 'undefined') raw = localStorage.getItem('ddz_vib_enabled');
      // 未设置 / 空值 / 非常规返回（false 等）一律默认开；只有明确存过 '0' 才关
      if (raw === null || raw === undefined || raw === '' || raw === false) return true;
      return raw === true || raw === 1 || String(raw) === '1';
    } catch (e) { return true; }
  }
  _enabled = readEnabled();

  // 单次触发（含节流 / 预算 / 降级 / 开关，所有路径的最终出口）
  function fire (tier) {
    if (!_enabled) return;
    var now = Date.now();
    if (now - _lastAt < THROTTLE_MS) return;
    _lastAt = now;
    if (tier === 'strong') {
      if (_strongUsed >= STRONG_BUDGET) tier = 'medium';   // 超预算降级，不硬震
      else _strongUsed++;
    }
    try {
      if (typeof KwaiDevice === 'undefined' || !KwaiDevice) return;
      if (tier === 'strong') KwaiDevice.vibrateLong();     // 强 = vibrateLong（平台降级天然兼容）
      else KwaiDevice.vibrateShort(tier);                  // 弱/中 = vibrateShort(type)
    } catch (e) { /* iOS 系统触感反馈关闭时静默失败，不兜 */ }
  }

  // 延迟触发（序列成员；间隔设计均 ≥60ms，不会被全局节流误吞）
  function schedule (tier, delay) {
    if (!_enabled) return;
    if (!delay || delay <= 0) { fire(tier); return; }
    _timers.push(setTimeout(function () { fire(tier); }, delay));
  }

  /**
   * 取消所有待触发震动
   *
   * 清空所有震动定时器并重置定时器队列
   */
  function cancelAll () {
    for (var i = 0; i < _timers.length; i++) clearTimeout(_timers[i]);
    _timers = [];
  }

  // 切后台：立即停止所有待触发震动（快小 API 为 ks.onHide）
  try {
    if (typeof ks !== 'undefined' && ks.onHide) ks.onHide(function () { cancelAll(); });
    else if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) cancelAll();
      });
    }
  } catch (e) { /* 挂载失败不影响游戏 */ }

  M3.Vibrate = {
    /** 弱 ≈15ms：选牌 / 出牌成功 / 倒计时秒针 */
    light: function () { fire('light'); },
    /** 中 ≈25ms：叫抢地主 / 报单 / 豆子不足等关键节点 */
    medium: function () { fire('medium'); },
    /** 强 ≈400ms：成地主 / 我出炸弹王炸 / 结算 / 逃跑确认（局内 ≤3 次自动降级） */
    heavy: function () { fire('strong'); },
    /** 通用「错误」语义：中 ×2 间隔 60ms（出牌违规 / 提示无牌 / 断网重连） */
    err: function () { schedule('medium', 0); schedule('medium', ERR_GAP_MS); },
    /**
     * 序列：[{ tier:'strong', at:0 }, { tier:'light', at:250 }]，at 为相对毫秒。
     * 用于王炸两段式 / 胜利三段递减 / 春天全局最重等多段节奏。
     */
    pattern: function (list) {
      (list || []).forEach(function (p) { schedule(p && p.tier, p && p.at); });
    },
    /** 新一局开始（发牌时）调用：重置强档预算 */
    resetBudget: function () { _strongUsed = 0; },
    /** 设置页写入 ddz_vib_enabled 后调用：刷新开关缓存 */
    refresh: function () { _enabled = readEnabled(); },
    /** 清空待触发队列（切后台自动触发，一般无需业务调用） */
    cancelAll: cancelAll,
  };
})();
