// js/tb-model.js — 玩法数据模型（星光 / 应援 / 排名 / 换装 / 结算）
// 自漫改版 model.js 抽取，改为 IIFE + M3 命名空间，符合脚手架编码规范。
(function () {
  var M3 = window.M3;

  var _story    = null;
  var _stars    = 0;
  var _support  = null;   // 玩家 all in 的候选人
  var _rival    = null;   // 龙哥支持的对手
  var _ledger   = [];     // 全部投票流水
  var _intimacy = {};
  var _outfits  = {};
  var _wins     = {};
  var _benefit  = null;
  var _mult     = 1;
  var _seed     = 20260807;
  var _settled  = {};     // shotId -> 结算快照（保证同一 shot 结果稳定）
  var _adViews  = 0;

  function init(story) {
    _story = story;
    _stars = M3.Config.STAR_INIT;
    for (var id in story.candidates) {
      _intimacy[id] = 0;
      _outfits[id]  = {};
      _wins[id]     = [];
    }
    // 开局：所有候选人 0 票，等待老板出手
    // v1.0.8 移除种子票，符合"默认全 0"预期
  }

  function rand() { _seed = (_seed * 48271) % 2147483647; return _seed; }

  // ─── 星光 ───────────────────────────────────────────────────
  function addStars(n) { _stars = Math.max(0, _stars + n); return _stars; }
  // 2026-08-14：移除自然增长；addPassiveStars 保留为空实现以保持向后兼容
  function addPassiveStars(_n) { return _stars; }
  function getStars()  { return _stars; }
  function canAfford(cost) { return _stars >= cost; }
  function spendStars(cost) { if (!canAfford(cost)) return false; addStars(-cost); return true; }

  // ─── 礼物 ───────────────────────────────────────────────────
  function gift(id) {
    for (var i = 0; i < _story.gifts.length; i++) if (_story.gifts[i].id === id) return _story.gifts[i];
    return null;
  }

  // ─── 投票 ───────────────────────────────────────────────────
  function recordVote(candidate, amount, source, shotId) {
    if (!_story.candidates[candidate]) return null;
    var e = { candidate: candidate, amount: Math.round(amount * _mult), source: source, shotId: shotId };
    _ledger.push(e);
    return e;
  }

  // 玩家送礼：扣星光后记票；星光不足返回 null
  function sendGift(candidate, giftId, count, shotId) {
    var g = gift(giftId); if (!g) return null;
    var n = count || 1, cost = g.cost * n;
    if (!canAfford(cost)) return null;
    addStars(-cost);
    addIntimacy(candidate, g.votes * n / 100);
    return recordVote(candidate, g.votes * n, 'player', shotId);
  }

  // 龙哥/其他老板送礼：不扣玩家星光
  function rivalGift(candidate, giftId, count, shotId) {
    var g = gift(giftId); if (!g) return null;
    return recordVote(candidate, g.votes * (count || 1), 'longge', shotId);
  }

  // 观众自然增长
  function crowdTick(shotId, count) {
    var ids = Object.keys(_story.candidates);
    for (var i = 0; i < (count || 1); i++) {
      var id = ids[rand() % ids.length];
      recordVote(id, 100 + (rand() % 900), 'crowd', shotId);
    }
  }

  // ─── 排名 ───────────────────────────────────────────────────
  function votes() {
    var t = {};
    for (var id in _story.candidates) t[id] = 0;
    for (var i = 0; i < _ledger.length; i++) t[_ledger[i].candidate] += _ledger[i].amount;
    return t;
  }
  function ranking() {
    var t = _story.candidates, v = votes();
    return Object.keys(t).map(function (id) {
      return { id: id, short: t[id].short, votes: v[id] };
    }).sort(function (a, b) { return b.votes - a.votes || a.id.localeCompare(b.id); });
  }

  // ─── 结算（同一 shot 只算一次，保证画面与数据一致）─────────────
  function settle(kind, shotId) {
    var key = kind + ':' + shotId;
    if (_settled[key] !== undefined) return _settled[key];
    var r = ranking(), out;
    if (kind === 'rank-first')       out = r[0].id;
    else if (kind === 'rank-last')   out = r[r.length - 1].id;
    else if (kind === 'top-two')     out = [r[0].id, r[1].id];
    else if (kind === 'champion')    out = r[0].id;
    else if (kind === 'rival')       out = _story.rivalMap[_support] || 'lingwu';
    else if (kind === 'final-rival') {
      var top = [r[0].id, r[1].id];
      out = top.filter(function (x) { return x !== _support; })[0] || top[1] || top[0];
    } else out = r[0].id;
    _settled[key] = out;
    if (kind === 'rival' || kind === 'final-rival') _rival = out;
    return out;
  }

  // ─── 支持 / 亲密度 / 换装 / 战绩 ─────────────────────────────
  function chooseSupport(id) { if (_story.candidates[id]) _support = id; }
  function getSupport() { return _support; }
  function getRival()   { return _rival; }
  function addIntimacy(id, n) { _intimacy[id] = (_intimacy[id] || 0) + n; }
  function getIntimacy(id) { return Math.round(_intimacy[id] || 0); }
  function saveOutfit(id, slot, val) { if (_outfits[id]) _outfits[id][slot] = val; }
  function getOutfit(id) { return _outfits[id] || {}; }
  function addWin(id, game) { if (_wins[id] && _wins[id].indexOf(game) < 0) _wins[id].push(game); }
  function getWins(id) { return (_wins[id] || []).slice(); }
  function setBenefit(card) { _benefit = card; }
  function getBenefit() { return _benefit; }
  function setMultiplier(m) { _mult = m || 1; }
  function getMultiplier() { return _mult; }

  // 老板号召：按本局积累的表现折算一次性票数
  function rallyPower(id) {
    var w = (_wins[id] || []).length;
    var bonus = _benefit === '双倍积分卡' ? 2000 : 0;
    return 8000 + w * 1200 + getIntimacy(id) * 8 + bonus;
  }

  // ─── 广告观看计数 ────────────────────────────────────────────
  function canWatchAd() { return _adViews < M3.Config.AD_MAX_VIEW; }
  function markAdView() { _adViews++; }

  function reset() {
    _stars = 0; _support = null; _rival = null; _ledger = [];
    _intimacy = {}; _outfits = {}; _wins = {}; _benefit = null;
    _mult = 1; _settled = {}; _adViews = 0; _seed = 20260807;
    init(_story);
  }

  M3.Model = {
    init: init, reset: reset,
    addStars: addStars, addPassiveStars: addPassiveStars, getStars: getStars, canAfford: canAfford, spendStars: spendStars,
    gift: gift, sendGift: sendGift, rivalGift: rivalGift, recordVote: recordVote,
    crowdTick: crowdTick, votes: votes, ranking: ranking, settle: settle,
    chooseSupport: chooseSupport, getSupport: getSupport, getRival: getRival,
    addIntimacy: addIntimacy, getIntimacy: getIntimacy,
    saveOutfit: saveOutfit, getOutfit: getOutfit,
    addWin: addWin, getWins: getWins,
    setBenefit: setBenefit, getBenefit: getBenefit,
    setMultiplier: setMultiplier, getMultiplier: getMultiplier,
    rallyPower: rallyPower,
    canWatchAd: canWatchAd, markAdView: markAdView
  };
})();
