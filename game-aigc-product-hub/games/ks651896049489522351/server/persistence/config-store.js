// ============================================================
// config-store.js — 数值配置中心
// ------------------------------------------------------------
// 主控/派生分离：主控项入库（config_items），派生项一律在
// deriveEffective() 读取时按公式计算，不允许单独保存。
// 版本与回滚：每次保存生成 config_versions 快照 + config_audit 明细，
// 回滚语义 = 以历史版本 payload 为变更集再走一次保存（生成新版本）。
// 灰度：meta.gray_version 指向一个历史版本作为灰度候选，
//       meta.gray_percentage + meta.gray_whitelist 决定哪些用户命中。
// ============================================================
'use strict';

const { getDb, transaction } = require('./db');
const logger = require('../logger');

// ---- 主控项默认值（迁移自 index.js ECONOMY / ROOM_TIERS / 超时常量） ----
const DEFAULT_MASTER = {
  // ── 全局主控 ──
  'economy.new_user_beans':            { scope: 'global', value: 20000, desc: '新用户注册礼包铁豆' },
  'economy.newcomer_gift_beans':       { scope: 'global', value: 10000, desc: '新手礼包铁豆' },
  'economy.daily_login_beans':         { scope: 'global', value: 1000,  desc: '每日登录奖励铁豆' },
  'economy.share_reward_beans':        { scope: 'global', value: 2000,  desc: '分享奖励铁豆' },
  'economy.shortcut_reward_beans':     { scope: 'global', value: 5000,  desc: '添加快捷方式奖励铁豆' },
  'economy.bankrupt_reward_beans':     { scope: 'global', value: 30000, desc: '破产补助铁豆' },
  'economy.bankrupt_threshold_beans':  { scope: 'global', value: 5000,  desc: '破产触发阈值（存量口径保留主控）' },
  'economy.bankrupt_reward_max_per_day': { scope: 'global', value: 1,   desc: '破产补助每日次数' },
  'economy.ad_real_income_fen':        { scope: 'global', value: 10,   desc: '单次广告真实收益（分）——奖励豆数的派生源' },
  'economy.ad_reward_max_per_day':     { scope: 'global', value: 20,    desc: '广告每日次数上限' },
  'economy.escape_cd_ms':              { scope: 'global', value: 3600000, desc: '逃跑 CD（中途逃跑后禁止进场时长 ms）' },
  'economy.exchange_rate':             { scope: 'global', value: 10000, desc: '兑换汇率（历史字段，钻石商城口径）' },
  'economy.rmb_to_diamond_rate':       { scope: 'global', value: 10,    desc: '人民币兑钻比例（1元=10钻，与 iap 档位一致）' },
  'economy.diamond_to_bean_rate':      { scope: 'global', value: 1000,  desc: '钻石兑豆比例（1钻=1000豆，与兑换档位一致）' },
  'economy.min_beans_to_enter_room':   { scope: 'global', value: 5000,  desc: '进房最低铁豆' },
  'economy.min_beans_to_ready':        { scope: 'global', value: 5000,  desc: '准备最低铁豆' },
  'economy.global_max_multiplier':     { scope: 'global', value: 64,    desc: '全局兜底倍数上限' },
  'economy.disconnect_grace_ms':       { scope: 'global', value: 30000, desc: '断线宽限期(ms)' },

  // ── 福利主控 ──
  'welfare.voice_pack_bean_price':     { scope: 'welfare', value: 100, desc: '语音包铁豆价' },
  'welfare.voice_pack_valid_days':     { scope: 'welfare', value: 7,   desc: '语音包有效期(天)' },

  // ── 充值与机器人主控 ──
  'charge.recharge_tiers':             { scope: 'charge', value: [], desc: '充值档位表（空=以 iap_products 为准）', type: 'json' },
  'charge.first_charge_trigger_sku':   { scope: 'charge', value: '',  desc: '首充触发档位 SKU' },
  'charge.first_charge_bonus_beans':   { scope: 'charge', value: 0,   desc: '首充赠送铁豆' },
  'bot.win_rate':                      { scope: 'bot', value: 0.5,   desc: '机器人目标胜率', ratio: true },
  'bot.win_rate_adjust_range':         { scope: 'bot', value: 0.05,  desc: '胜率纠偏范围', ratio: true },
  'bot.escape_cd_count':               { scope: 'bot', value: 3,     desc: '逃跑 CD 次数' },
  'bot.escape_cd_duration_min':        { scope: 'bot', value: 10,    desc: '逃跑 CD 时长(分钟)' },
  'bot.initial_balance':               { scope: 'bot', value: 10000000, desc: '机器人初始余额' },
  'bot.floor_beans':                   { scope: 'bot', value: 10000,    desc: '机器人余额触底线' },
  'bot.ceiling_beans':                 { scope: 'bot', value: 20000000, desc: '机器人余额天花板' },

  // ── 操作超时 ──
  'timeout.bid_ms':                    { scope: 'timeout', value: 15000, desc: '叫分超时(ms)' },
  'timeout.play_ms':                   { scope: 'timeout', value: 30000, desc: '出牌超时(ms)' },
  'timeout.double_ms':                 { scope: 'timeout', value: 10000, desc: '加倍超时(ms)' },

  // ── 灰度元配置 ──
  'meta.gray_version':                 { scope: 'meta', value: 0,   desc: '灰度版本号（0=无灰度）' },
  'meta.gray_percentage':              { scope: 'meta', value: 0,   desc: '灰度百分比(0-100)' },
  'meta.gray_whitelist':               { scope: 'meta', value: [],  desc: '灰度白名单(accountId)', type: 'json' },

  // ── 客户端文案（走后台配置，前端经 /api/v1/game/config 拉取）──
  'client_text.settle_col_nickname':   { scope: 'client_text', value: '昵称', type: 'string' },
  'client_text.settle_col_base':       { scope: 'client_text', value: '底分', type: 'string' },
  'client_text.settle_col_multiplier': { scope: 'client_text', value: '倍数', type: 'string' },
  'client_text.settle_col_beans':      { scope: 'client_text', value: '铁豆', type: 'string' },
  'client_text.settle_title_win':      { scope: 'client_text', value: '胜利', type: 'string' },
  'client_text.settle_title_fail':     { scope: 'client_text', value: '惜败', type: 'string' },
  'client_text.settle_title_broke':    { scope: 'client_text', value: '破产', type: 'string' },

  // ── 场次主控（junior/mid/master）──
  'tier.junior.name':                  { scope: 'tier', value: '初级场', type: 'string' },
  'tier.junior.base_bet':              { scope: 'tier', value: 100 },
  'tier.junior.entry_fee_rate':        { scope: 'tier', value: 0.5 },
  'tier.junior.freeze_multiplier':     { scope: 'tier', value: 4 },
  'tier.junior.quota_multiplier':      { scope: 'tier', value: 1.25 },
  'tier.junior.max_multiplier':        { scope: 'tier', value: 32 },
  'tier.junior.tax_rate':              { scope: 'tier', value: 0.05, ratio: true },
  'tier.junior.bot_max_multiplier':    { scope: 'tier', value: 32 },
  'tier.junior.match_asset_range':     { scope: 'tier', value: 0.3 },

  'tier.mid.name':                     { scope: 'tier', value: '中级场', type: 'string' },
  'tier.mid.base_bet':                 { scope: 'tier', value: 800 },
  'tier.mid.entry_fee_rate':           { scope: 'tier', value: 0.5 },
  'tier.mid.freeze_multiplier':        { scope: 'tier', value: 10 },
  'tier.mid.quota_multiplier':         { scope: 'tier', value: 6.25 },
  'tier.mid.max_multiplier':           { scope: 'tier', value: 200 },
  'tier.mid.tax_rate':                 { scope: 'tier', value: 0.05 },
  'tier.mid.bot_max_multiplier':       { scope: 'tier', value: 200 },
  'tier.mid.match_asset_range':        { scope: 'tier', value: 0.3 },

  'tier.master.name':                  { scope: 'tier', value: '大师场', type: 'string' },
  'tier.master.base_bet':              { scope: 'tier', value: 6400 },
  'tier.master.entry_fee_rate':        { scope: 'tier', value: 0.5 },
  'tier.master.freeze_multiplier':     { scope: 'tier', value: 10 },
  'tier.master.quota_multiplier':      { scope: 'tier', value: 7.8 },
  'tier.master.max_multiplier':        { scope: 'tier', value: 1000 },
  'tier.master.tax_rate':              { scope: 'tier', value: 0.05, ratio: true },
  'tier.master.bot_max_multiplier':    { scope: 'tier', value: 1000 },
  'tier.master.match_asset_range':     { scope: 'tier', value: 0.3 },
};

const TIER_TYPES = ['junior', 'mid', 'master'];

// ---- 纯函数：主控值 → 完整生效配置（含派生项） ----
function deriveEffective (master) {
  const num = (k) => Number(master[k]);

  // 全局派生
  // 单次广告奖励豆数（派生）：真实收益(分) × 兑换汇率 / 100，1000豆 ≈ 10分收益
  const adRewardBeans = Math.round(num('economy.ad_real_income_fen') * num('economy.exchange_rate') / 100);
  const adRewardMaxPerDay = num('economy.ad_reward_max_per_day');
  const diamondToBeanRate = num('economy.diamond_to_bean_rate');
  const voiceBeanPrice = num('welfare.voice_pack_bean_price');
  const adDailyCapBeans = adRewardBeans * adRewardMaxPerDay;

  // 场次派生
  const tiers = {};
  const tierDerived = {};
  for (const t of TIER_TYPES) {
    const baseBet = num(`tier.${t}.base_bet`);
    const entryFeeRate = num(`tier.${t}.entry_fee_rate`);
    const freezeMultiplier = num(`tier.${t}.freeze_multiplier`);
    const quotaMultiplier = num(`tier.${t}.quota_multiplier`);
    const maxMultiplier = num(`tier.${t}.max_multiplier`);
    const entryFeeBeans = Math.round(baseBet * entryFeeRate);
    const freezeBeans = baseBet * freezeMultiplier;
    const minBeansToMatch = Math.ceil(freezeBeans * quotaMultiplier);
    tiers[t] = {
      type: t,
      name: String(master[`tier.${t}.name`] ?? ''),
      baseBet,
      entryFeeBeans,
      freezeBeans,
      freezeEnabled: true,
      minBeansToMatch,
      minBeansToStart: minBeansToMatch,
      minBeansToReady: minBeansToMatch,
      maxMultiplier,
      taxRate: num(`tier.${t}.tax_rate`),
      botMaxMultiplier: num(`tier.${t}.bot_max_multiplier`),
      matchAssetRange: num(`tier.${t}.match_asset_range`),
    };
    tierDerived[t] = {
      quotaThresholdBeans: minBeansToMatch,
      escapePenaltyBeans: freezeBeans,
      maxLossBeans: baseBet * maxMultiplier * 2,
      maxGainBeans: baseBet * maxMultiplier * 2,
    };
  }

  const economy = {
    version: 'v2.1-config',
    currencyName: '铁豆',
    exchangeRate: num('economy.exchange_rate'),
    newUserBeans: num('economy.new_user_beans'),
    newcomerGiftBeans: num('economy.newcomer_gift_beans'),
    newcomerGiftLifetimeKey: 'lifetime',
    dailyLoginBeans: num('economy.daily_login_beans'),
    shareRewardBeans: num('economy.share_reward_beans'),
    shortcutRewardBeans: num('economy.shortcut_reward_beans'),
    shortcutRewardLifetimeKey: 'lifetime',
    bankruptRewardBeans: num('economy.bankrupt_reward_beans'),
    bankruptThresholdBeans: num('economy.bankrupt_threshold_beans'),
    bankruptRewardMaxPerDay: num('economy.bankrupt_reward_max_per_day'),
    adRewardMaxPerDay,
    adRewardDailyCapBeans: adDailyCapBeans,
    adRewardTiers: [{ from: 1, to: 999, amount: adRewardBeans }],
    minBeansToEnterRoom: num('economy.min_beans_to_enter_room'),
    minBeansToReady: num('economy.min_beans_to_ready'),
    disconnectGraceMs: num('economy.disconnect_grace_ms'),
    escapeCdMs: num('economy.escape_cd_ms'),
    baseBet: tiers.junior.baseBet,
    maxMultiplier: num('economy.global_max_multiplier'),
  };

  const derived = {
    adDailyCapBeans,
    leisureDailyIncomeCapBeans: adDailyCapBeans + num('economy.share_reward_beans') + num('economy.daily_login_beans'),
    voicePackDiamondPrice: diamondToBeanRate > 0 ? Math.ceil(voiceBeanPrice / diamondToBeanRate) : 0,
    tiers: tierDerived,
  };

  const timeouts = {
    bid: num('timeout.bid_ms'),
    play: num('timeout.play_ms'),
    double: num('timeout.double_ms'),
  };

  const bot = {
    winRate: num('bot.win_rate'),
    winRateAdjustRange: num('bot.win_rate_adjust_range'),
    escapeCdCount: num('bot.escape_cd_count'),
    escapeCdDurationMin: num('bot.escape_cd_duration_min'),
    initialBalance: num('bot.initial_balance'),
    floorBeans: num('bot.floor_beans'),
    ceilingBeans: num('bot.ceiling_beans'),
  };

  return { economy, tiers, tierDerived: derived.tiers, derived, timeouts, bot };
}

// ---- 纯函数：保存校验红线（checklist：保存校验红线） ----
function validateMaster (master) {
  const eff = deriveEffective(master);
  const v = [];
  const num = (k) => Number(master[k]);

  // 红线1：验资门槛 ≥ 台费 + 冻结额（每场次）
  for (const t of TIER_TYPES) {
    const tier = eff.tiers[t];
    const need = tier.entryFeeBeans + tier.freezeBeans;
    if (tier.minBeansToMatch < need) {
      v.push(`tier.${t}: 验资门槛(${tier.minBeansToMatch}) 不得低于 台费+冻结额(${need})`);
    }
  }
  // 红线2：破产补助 ≥ 初级场台费+冻结额
  const juniorNeed = eff.tiers.junior.entryFeeBeans + eff.tiers.junior.freezeBeans;
  if (num('economy.bankrupt_reward_beans') < juniorNeed) {
    v.push(`economy.bankrupt_reward_beans(${num('economy.bankrupt_reward_beans')}) 不得低于初级场台费+冻结额(${juniorNeed})`);
  }
  // 红线3：注册礼包 ≥ 初级场验资门槛
  if (num('economy.new_user_beans') < eff.tiers.junior.minBeansToMatch) {
    v.push(`economy.new_user_beans(${num('economy.new_user_beans')}) 不得低于初级场验资门槛(${eff.tiers.junior.minBeansToMatch})`);
  }
  // 红线4：广告日封顶 = 单次奖励 × 次数上限（奖励豆由收益派生，封顶再由奖励派生——构造保证）
  const adCap = eff.economy.adRewardTiers[0] ? eff.economy.adRewardTiers[0].amount : 0;
  if (adCap * num('economy.ad_reward_max_per_day') !== eff.derived.adDailyCapBeans) v.push('ad_daily_cap 派生不一致');
  // （原红线5「语音包豆价须整除钻石汇率」已移除：语音包钻石购买路径未实现，
  //   voicePackDiamondPrice 仅为参考换算展示；rate 对齐真实档位 1钻=1000豆 后该约束不再成立）
  // 红线6：充值档位到账钻石符合汇率（档位表非空时校验）
  let tiersList = master['charge.recharge_tiers'];
  if (typeof tiersList === 'string') { try { tiersList = JSON.parse(tiersList); } catch (_) { tiersList = []; } }
  if (Array.isArray(tiersList) && tiersList.length > 0) {
    const rmbRate = num('economy.rmb_to_diamond_rate');
    for (const t of tiersList) {
      const expect = Math.round(Number(t.price_fen) / 100 * rmbRate);
      if (Number(t.diamonds) !== expect) {
        v.push(`charge.recharge_tiers[${t.sku || t.price_fen}]: 到账钻石(${t.diamonds}) 不符合汇率(应为 ${expect})`);
      }
    }
  }
  // 红线7：机器人初始余额 > 触底线
  if (num('bot.initial_balance') <= num('bot.floor_beans')) {
    v.push('bot.initial_balance 必须大于 bot.floor_beans');
  }
  // 通用数值合法性
  for (const key of Object.keys(master)) {
    const def = DEFAULT_MASTER[key];
    if (!def || def.type === 'json' || def.type === 'string') continue;
    const val = Number(master[key]);
    if (!Number.isFinite(val)) v.push(`${key}: 数值非法(${master[key]})`);
    if (def.ratio && (val < 0 || val > 1)) v.push(`${key}: 比例需在 [0,1]`);
    if (key === 'meta.gray_percentage' && (val < 0 || val > 100)) v.push(`${key}: 灰度百分比需在 [0,100]`);
  }
  return v;
}

// ---- 存取与缓存 ----
let cache = null;          // { master: Map, version: int }
let refreshTimer = null;

function parseVal (def, raw) {
  if (def && def.type === 'json') {
    try { return JSON.parse(raw); } catch (_) { return def.value; }
  }
  if (def && def.type === 'string') {
    try { return JSON.parse(raw); } catch (_) { return String(raw); }
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : (def ? def.value : raw);
}

async function refresh () {
  const db = getDb();
  const rows = await db.all('SELECT config_key, value_json FROM config_items');
  const master = {};
  for (const key of Object.keys(DEFAULT_MASTER)) master[key] = DEFAULT_MASTER[key].value;
  for (const r of rows) {
    const def = DEFAULT_MASTER[r.config_key];
    master[r.config_key] = parseVal(def, r.value_json);
  }
  let version = 0;
  const vRows = await db.all('SELECT version FROM config_versions ORDER BY version DESC LIMIT 1');
  if (vRows.length > 0) version = Number(vRows[0].version);
  cache = { master, version };
  return cache;
}

function masterMap () {
  if (!cache) return Object.fromEntries(Object.keys(DEFAULT_MASTER).map(k => [k, DEFAULT_MASTER[k].value]));
  return cache.master;
}

function currentVersion () {
  return cache ? cache.version : 0;
}

async function initConfigCenter () {
  const db = getDb();
  const { applySqlFile } = require('./db');
  const path = require('path');
  await applySqlFile(db, path.join(__dirname, '..', 'scripts', 'migrations', '20260919_config_center.sql'));
  // 种子：仅补缺（INSERT IGNORE 语义），保留 DB 已有覆盖值
  for (const [key, def] of Object.entries(DEFAULT_MASTER)) {
    const raw = def.type === 'json' || def.type === 'string' ? JSON.stringify(def.value) : String(def.value);
    await db.run(
      'INSERT IGNORE INTO config_items (config_key, scope, value_json, description, updated_at, updated_by, version) VALUES (?, ?, ?, ?, ?, ?, 0)',
      [key, def.scope, raw, def.desc || '', Date.now(), 'seed']
    );
  }
  await refresh();
  if (!refreshTimer) {
    refreshTimer = setInterval(() => { refresh().catch(err => logger.error('[config] refresh failed:', err.message)); }, 30000);
    if (typeof refreshTimer.unref === 'function') refreshTimer.unref();
  }
  logger.info(`[config-center] 就绪，当前版本 v${currentVersion()}，主控项 ${Object.keys(DEFAULT_MASTER).length} 个`);
}

// ---- 灰度：按用户选稳定/灰度通道 ----
function userInGray (master, accountId) {
  const grayVersion = Number(master['meta.gray_version'] || 0);
  if (!grayVersion || !accountId) return { hit: false, grayVersion };
  const whitelist = Array.isArray(master['meta.gray_whitelist']) ? master['meta.gray_whitelist'] : [];
  if (whitelist.includes(accountId)) return { hit: true, grayVersion };
  const pct = Number(master['meta.gray_percentage'] || 0);
  if (pct <= 0) return { hit: false, grayVersion };
  let h = 0;
  const s = String(accountId);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return { hit: (h % 100) < pct, grayVersion };
}

async function getVersionPayload (version) {
  const rows = await getDb().all('SELECT payload_json FROM config_versions WHERE version = ?', [version]);
  if (rows.length === 0) return null;
  try { return JSON.parse(rows[0].payload_json); } catch (_) { return null; }
}

async function getEffectiveFor (accountId) {
  const master = { ...masterMap() };
  const gray = userInGray(master, accountId);
  if (gray.hit) {
    const payload = await getVersionPayload(gray.grayVersion);
    if (payload) {
      for (const [k, val] of Object.entries(payload)) {
        if (DEFAULT_MASTER[k]) master[k] = val;
      }
    }
  }
  return { master, effective: deriveEffective(master), gray: { hit: gray.hit, version: gray.grayVersion }, version: currentVersion() };
}

function getEffectiveSync () {
  const master = masterMap();
  return { master, effective: deriveEffective(master), version: currentVersion() };
}

// ---- 保存 / 回滚 ----
async function saveConfig ({ operator = 'admin', changes = {}, comment = '' }) {
  if (!changes || typeof changes !== 'object') throw Object.assign(new Error('changes required'), { code: 'INVALID_REQUEST' });
  const unknown = Object.keys(changes).filter(k => !DEFAULT_MASTER[k]);
  if (unknown.length > 0) throw Object.assign(new Error(`unknown keys: ${unknown.join(',')}`), { code: 'INVALID_REQUEST' });

  // 档位到账钻石为派生项：只允许配价格，钻石数由汇率自动推导
  if (Array.isArray(changes['charge.recharge_tiers'])) {
    const rmbRate = Number(masterMap()['economy.rmb_to_diamond_rate']) || 100;
    changes['charge.recharge_tiers'] = changes['charge.recharge_tiers'].map(t => ({
      ...t,
      diamonds: Math.round(Number(t.price_fen || 0) / 100 * rmbRate),
    }));
  }
  const merged = { ...masterMap(), ...changes };
  const violations = validateMaster(merged);
  if (violations.length > 0) throw Object.assign(new Error('config validation failed'), { code: 'CONFIG_VALIDATION', violations });

  const now = Date.now();
  return transaction(async () => {
    const db = getDb();
    const auditRows = [];
    for (const [key, newVal] of Object.entries(changes)) {
      const def = DEFAULT_MASTER[key];
      const rawOld = await db.all('SELECT value_json FROM config_items WHERE config_key = ?', [key]);
      const oldVal = rawOld.length > 0 ? parseVal(def, rawOld[0].value_json) : def.value;
      const raw = def.type === 'json' || def.type === 'string' ? JSON.stringify(newVal) : String(newVal);
      await db.run(
        `INSERT INTO config_items (config_key, scope, value_json, description, updated_at, updated_by, version)
         VALUES (?, ?, ?, ?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE value_json = VALUES(value_json), updated_at = VALUES(updated_at), updated_by = VALUES(updated_by), version = version + 1`,
        [key, def.scope, raw, def.desc || '', now, operator]
      );
      auditRows.push({ key, oldVal, newVal });
    }
    const payload = { ...merged };
    const ret = await db.run(
      'INSERT INTO config_versions (payload_json, operator, comment, created_at) VALUES (?, ?, ?, ?)',
      [JSON.stringify(payload), operator, String(comment || '').slice(0, 255), now]
    );
    const version = Number(ret && (ret.insertId ?? ret.insertId_) ) || 0;
    for (const a of auditRows) {
      await db.run(
        'INSERT INTO config_audit (version, operator, config_key, old_value_json, new_value_json, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [version, operator, a.key, JSON.stringify(a.oldVal), JSON.stringify(a.newVal), now]
      );
    }
    await refresh();
    return { version, changed: Object.keys(changes) };
  });
}

async function rollbackToVersion (version, { operator = 'admin' } = {}) {
  const payload = await getVersionPayload(version);
  if (!payload) throw Object.assign(new Error(`version ${version} not found`), { code: 'NOT_FOUND' });
  const changes = {};
  for (const [k, val] of Object.entries(payload)) {
    if (!DEFAULT_MASTER[k]) continue;
    if (k.startsWith('meta.gray_')) continue;   // 灰度元配置不随回滚
    if (JSON.stringify(masterMap()[k]) !== JSON.stringify(val)) changes[k] = val;
  }
  if (Object.keys(changes).length === 0) return { version: currentVersion(), changed: [] };
  return saveConfig({ operator, changes, comment: `rollback to v${version}` });
}

async function listVersions (limit = 20) {
  const lim = Math.max(1, Math.min(100, Number(limit) || 20));
  const rows = await getDb().all(
    `SELECT version, operator, comment, created_at FROM config_versions ORDER BY version DESC LIMIT ${lim}`
  );
  return rows;
}

async function listAudit (version, limit = 100) {
  const lim = Math.max(1, Math.min(200, Number(limit) || 100));
  return getDb().all(
    `SELECT config_key, old_value_json, new_value_json, operator, created_at FROM config_audit WHERE version = ${Number(version) || 0} ORDER BY id DESC LIMIT ${lim}`
  );
}

// ECONOMY 兼容代理：所有 ECONOMY.xxx 读取走实时配置，未命中键回退默认
function economyProxy () {
  const get = () => getEffectiveSync().effective.economy;
  return new Proxy({}, {
    get (_t, prop) {
      const econ = get();
      if (prop in econ) return econ[prop];
      return undefined;
    },
    has (_t, prop) { return prop in get(); },
    ownKeys () { return Object.keys(get()); },
    getOwnPropertyDescriptor () { return { enumerable: true, configurable: true }; },
  });
}

function timeoutsProxy () {
  const get = () => getEffectiveSync().effective.timeouts;
  return new Proxy({}, {
    get (_t, prop) { return get()[prop]; },
    has (_t, prop) { return prop in get(); },
    ownKeys () { return Object.keys(get()); },
    getOwnPropertyDescriptor () { return { enumerable: true, configurable: true }; },
  });
}

// 客户端下发视图：文案 + 对客户端安全的数值子集（不含机器人/风控内部键）
function clientView (master) {
  const eff = deriveEffective(master);
  const texts = {};
  for (const [k, def] of Object.entries(DEFAULT_MASTER)) {
    if (def.scope === 'client_text') texts[k.replace('client_text.', '')] = master[k];
  }
  return {
    version: currentVersion(),
    currencyName: eff.economy.currencyName,
    texts,
    values: {
      newUserBeans: eff.economy.newUserBeans,
      dailyLoginBeans: eff.economy.dailyLoginBeans,
      shareRewardBeans: eff.economy.shareRewardBeans,
      bankruptRewardBeans: eff.economy.bankruptRewardBeans,
      adRewardMaxPerDay: eff.economy.adRewardMaxPerDay,
      adRewardBeans: eff.economy.adRewardTiers[0] ? eff.economy.adRewardTiers[0].amount : 0,
      disconnectGraceMs: eff.economy.disconnectGraceMs,
      tiers: Object.fromEntries(TIER_TYPES.map(t => [t, {
        name: eff.tiers[t].name,
        baseBet: eff.tiers[t].baseBet,
        maxMultiplier: eff.tiers[t].maxMultiplier,
      }])),
    },
  };
}

// 管理后台视图：主控项全量 + 派生项 + 版本
function adminView () {
  const { master, effective, version } = getEffectiveSync();
  const items = Object.fromEntries(Object.entries(DEFAULT_MASTER).map(([k, def]) => [k, {
    scope: def.scope,
    value: master[k],
    isDefault: JSON.stringify(master[k]) === JSON.stringify(def.value),
    description: def.desc || '',
  }]));
  return { version, items, derived: effective.derived, tiers: effective.tiers, economy: effective.economy };
}

function getTier (type, version) {
  if (!version || !cache || version === currentVersion()) {
    return deriveEffective(masterMap()).tiers[type] || null;
  }
  return null; // 历史版本快照：灰度用户下一局生效语义下，房间一律用当前版本（version 仅作标记）
}

module.exports = {
  DEFAULT_MASTER,
  TIER_TYPES,
  deriveEffective,
  validateMaster,
  initConfigCenter,
  refresh,
  currentVersion,
  getEffectiveFor,
  getEffectiveSync,
  saveConfig,
  rollbackToVersion,
  listVersions,
  listAudit,
  economyProxy,
  timeoutsProxy,
  clientView,
  adminView,
  getTier,
  masterMap,
};
