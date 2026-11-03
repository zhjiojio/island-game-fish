/**
 * systems/checkin.js — 每日签到（独立可复用模块）
 * 职责：
 *   - 维护 7 天循环签到状态机（连续签到天数/是否可领取/是否断签重置）
 *   - 领取奖励并写入通用存储原语（Storage.addCount / Storage.grantTempUnlockAllHours），
 *     不关心道具/提示具体如何被消耗——消耗侧系统接入时直接读 Storage.getCount 即可
 *   - 奖励表本身来自 CONFIG.TEMPLATE.checkinModal.days（产品定制层配置，换产品/加天数
 *     只需改 product.config.js，无需改这里的状态机逻辑）
 * 依赖：CONFIG, Storage
 * 导出：CheckIn
 *
 * 复用方式：其他需要"周期性签到/打卡"的功能（如周签到、活动签到）可直接复用本模块，
 * 仅需在 product.config.js 增加一份独立的 days 配置 + 独立的 Storage key，再实例化
 * 一份状态（本模块目前为单例，若需要多套并行签到，可将 _state 相关方法参数化 storageKey）。
 */
(function () {
  'use strict';

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  /** 返回本地时区 'YYYY-MM-DD'，用于跨天判断（避免使用带时分秒的时间戳直接比较） */
  function dateKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 两个日期字符串相差的自然天数（date2 - date1），跨月/跨年安全 */
  function dayDiff(dateStr1, dateStr2) {
    var d1 = new Date(dateStr1 + 'T00:00:00');
    var d2 = new Date(dateStr2 + 'T00:00:00');
    return Math.round((d2 - d1) / 86400000);
  }

  var CheckIn = window.CheckIn = {

    /** 奖励配置表（[{ day, cardAsset, type, amount|hours }, ...]），来自产品配置 */
    getRewardConfig: function () {
      return (CONFIG.TEMPLATE.checkinModal && CONFIG.TEMPLATE.checkinModal.days) || [];
    },

    /**
     * 读取当前签到状态（只读，不修改存储）
     * @returns {{currentDay:number, claimedToday:boolean, claimedDays:number}}
     *   currentDay    今天对应第几天(1~7)，即"待领取/已领取"的那一天
     *   claimedToday  今天是否已领取过
     *   claimedDays   本轮已连续签到的天数(0~7，用于 UI 展示已点亮的天数)
     */
    getState: function () {
      var today = dateKey(new Date());
      var data = Storage.get(CONFIG.STORAGE_KEYS.checkinState) || { claimedCount: 0, lastClaimDate: null };
      var total = this.getRewardConfig().length || 7;

      if (data.lastClaimDate === today) {
        return { currentDay: data.claimedCount, claimedToday: true, claimedDays: data.claimedCount };
      }

      var streakBroken = true;
      if (data.lastClaimDate) {
        var diff = dayDiff(data.lastClaimDate, today);
        streakBroken = diff !== 1; // 只有"恰好连续下一天"才算续签，diff<=0(异常)或>1(断签)均视为断签
      }

      var claimedCount = streakBroken ? 0 : data.claimedCount;
      var nextDay = (claimedCount % total) + 1;
      return { currentDay: nextDay, claimedToday: false, claimedDays: claimedCount };
    },

    /**
     * 领取今天的签到奖励
     * @param {object} [opts]  { multiplier: 1 }  倍数仅对 prop/hint 计数类奖励生效(看视频翻倍)
     * @returns {{ok:boolean, reason?:string, reward?:object, currentDay?:number}}
     */
    claim: function (opts) {
      var state = this.getState();
      if (state.claimedToday) return { ok: false, reason: 'already-claimed' };

      var config = this.getRewardConfig();
      var total = config.length || 7;
      var dayConf = config[state.currentDay - 1];
      if (!dayConf) return { ok: false, reason: 'no-config' };

      var multiplier = (opts && opts.multiplier) || 1;
      this._grantReward(dayConf, multiplier);

      var today = dateKey(new Date());
      // claimedCount 存储"本轮环内已连续签到到第几天"(1~total)；领完第 total 天后，
      // 下次签到因与今天日期相差>1（隔了至少一天）或=1（次日）两种情况都需要开启新一轮，
      // getState() 的 nextDay = claimedCount % total + 1 会在 claimedCount===total 时正确
      // 翻回第 1 天。
      Storage.set(CONFIG.STORAGE_KEYS.checkinState, {
        claimedCount: state.currentDay,
        lastClaimDate: today
      });

      return { ok: true, reward: dayConf, multiplier: multiplier, currentDay: state.currentDay };
    },

    /** 按奖励类型写入对应的通用存储原语，不关心业务侧如何消耗 */
    _grantReward: function (dayConf, multiplier) {
      if (dayConf.type === 'prop') {
        Storage.addCount(CONFIG.STORAGE_KEYS.checkinPropCount, dayConf.amount * multiplier);
      } else if (dayConf.type === 'hint') {
        Storage.addCount(CONFIG.STORAGE_KEYS.checkinHintCount, dayConf.amount * multiplier);
      } else if (dayConf.type === 'tempUnlock') {
        Storage.grantTempUnlockAllHours(dayConf.hours);
      }
    }
  };
})();
