// ============================================================
// admin-http.js — 管理后台（/admin）
// ------------------------------------------------------------
// 门禁（四层，任一层不满足即拒）：
//   1. ADMIN_TOKEN 未设置时整个模块不会被注册（见 index.js）→ 404；
//   2. IP 限制：默认只允许 127.0.0.1；ADMIN_ALLOW_REMOTE=1 才放行任意来源；
//   3. 密码：请求头 X-Admin-Token 必须与 ADMIN_TOKEN 恒定时间相等；
//   4. 防爆破：同一 IP 连续失败 5 次锁 15 分钟，成功后清零。
//
// 与业务层的关系：管理员操作刻意绕过业务校验（就是要强改数值），
// 所以这里直接写 SQL，不复用 wallet-store 的领奖/扣款语义；
// 但每次改豆子都补一条 admin_adjust 流水，保证余额与账本自洽。
// ============================================================
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb, retryableTransaction } = require('../persistence/db');
const botStatsStore = require('../persistence/bot-stats-store');
const logger = require('../logger');

const LOCAL_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
// 远程访问开关：默认关闭，仅 ADMIN_ALLOW_REMOTE=1 时放行非本地来源。
// 收紧方向优先（未配置=保持原有 local-only 行为），避免误配把自己锁在外面。
function allowRemote () {
  return process.env.ADMIN_ALLOW_REMOTE === '1';
}

function isAllowedIp (clientIp) {
  if (allowRemote()) return true;
  return LOCAL_IPS.has(String(clientIp || ''));
}

// ---- 登录失败计数（防暴力破解）----
// 单进程内存表：多副本部署时各自计数，总量上界为 副本数 × MAX_FAILS；
// 当前线上强制单副本（rooms 为进程内存），所以这里等价于全局。
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const FAIL_WINDOW_MS = 15 * 60 * 1000;
const loginFails = new Map(); // ip -> { count, firstAt, lockedUntil }

function loginLockInfo (clientIp) {
  const ip = String(clientIp || '');
  const entry = loginFails.get(ip);
  if (!entry) return null;
  const now = Date.now();
  // 锁定期未满直接拒。这一步必须在「失败窗口过期」之前判定：
  // 窗口从首次失败起算、锁从第 5 次失败起算，两者可以错开十几分钟。
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { retryAfterMs: entry.lockedUntil - now, locked: true };
  }
  // 锁已到期，或从未锁定且失败窗口也过期 → 整条记录作废，重新计数
  if (now - entry.firstAt > FAIL_WINDOW_MS) {
    loginFails.delete(ip);
    return null;
  }
  if (entry.lockedUntil && entry.lockedUntil <= now) {
    loginFails.delete(ip);
    return null;
  }
  return null;
}

function recordLoginFail (clientIp) {
  const ip = String(clientIp || '');
  const now = Date.now();
  let entry = loginFails.get(ip);
  if (!entry || now - entry.firstAt > FAIL_WINDOW_MS) {
    entry = { count: 0, firstAt: now, lockedUntil: 0 };
    loginFails.set(ip, entry);
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILS) entry.lockedUntil = now + LOCK_MS;
  // 表膨胀兜底：条目过多时清理已过期项
  if (loginFails.size > 1000) {
    for (const [key, value] of loginFails) {
      const expired = !value.lockedUntil || value.lockedUntil <= now;
      if (expired && now - value.firstAt > FAIL_WINDOW_MS) loginFails.delete(key);
    }
  }
  return entry.lockedUntil ? Math.ceil((entry.lockedUntil - now) / 1000) : 0;
}

function clearLoginFails (clientIp) {
  loginFails.delete(String(clientIp || ''));
}

const ACCOUNT_ID_RE = /^[A-Za-z0-9_]+$/;
const NEWCOMER_REWARD_TYPE = 'newcomer_gift';
const NEWCOMER_LIFETIME_KEY = 'lifetime';
const SHORTCUT_REWARD_TYPE = 'shortcut_reward';
const SHORTCUT_LIFETIME_KEY = 'lifetime';
const BANKRUPT_RELIEF_TYPE = 'bankrupt_relief';
// 与 server/index.js todayKey() 保持一致（UTC 日期键）
function adminTodayKey () {
  return new Date().toISOString().slice(0, 10);
}

function createAdminHttpHandler (deps = {}) {
  const { mockExchangeClient = null, gameConfig = null, configCenter = null } = deps;
  const indexHtmlPath = path.join(__dirname, 'index.html');

  function response (status, data) {
    return { handled: true, status, data };
  }

  function tokenMatches (provided) {
    const expected = String(process.env.ADMIN_TOKEN || '');
    if (!expected) return false;
    const a = Buffer.from(String(provided || ''));
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  function authorize (headers, clientIp) {
    if (!isAllowedIp(clientIp)) {
      throw Object.assign(new Error('admin console is local-only'), { code: 'FORBIDDEN' });
    }
    const lock = loginLockInfo(clientIp);
    if (lock) {
      const mins = Math.max(1, Math.ceil(lock.retryAfterMs / 60000));
      throw Object.assign(new Error(`too many failed attempts, retry in ${mins} min`), { code: 'RATE_LIMITED' });
    }
    if (!tokenMatches(headers['x-admin-token'])) {
      recordLoginFail(clientIp);
      throw Object.assign(new Error('invalid admin token'), { code: 'UNAUTHORIZED' });
    }
    clearLoginFails(clientIp);
  }

  function requireAccountId (raw) {
    const id = decodeURIComponent(String(raw || ''));
    if (!ACCOUNT_ID_RE.test(id)) {
      throw Object.assign(new Error('invalid account id'), { code: 'INVALID_REQUEST' });
    }
    return id;
  }

  function parseJson (headers, rawBody) {
    const ct = String(headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/json') {
      throw Object.assign(new Error('content-type must be application/json'), { code: 'INVALID_REQUEST' });
    }
    try {
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('bad body');
      return body;
    } catch {
      throw Object.assign(new Error('invalid json body'), { code: 'INVALID_REQUEST' });
    }
  }

  // 非负整数，超出 BIGINT 范围直接拒绝
  function requireAmount (value, field) {
    const text = String(value == null ? '' : value).trim();
    if (!/^\d+$/.test(text)) {
      throw Object.assign(new Error(`${field} must be a non-negative integer`), { code: 'INVALID_REQUEST' });
    }
    const num = BigInt(text);
    if (num > 9007199254740991n) {
      throw Object.assign(new Error(`${field} is too large`), { code: 'INVALID_REQUEST' });
    }
    return num;
  }

  // ── 查询 ────────────────────────────────────────────────────
  async function listUsers (query) {
    const keyword = String(query.get('q') || '').trim();
    const limit = Math.min(200, Math.max(1, parseInt(query.get('limit') || '50', 10) || 50));
    const offset = Math.max(0, parseInt(query.get('offset') || '0', 10) || 0);
    const db = getDb();

    // 关键词同时匹配 账号 / 设备 / 昵称。三处都是 LIKE '%kw%'，前导通配符
    // 走不了索引，全表扫但 accounts 量级小（万级）可以接受。
    const runList = async (withNickname) => {
      const where = withNickname
        ? (keyword ? 'WHERE a.account_id LIKE ? OR a.device_id LIKE ? OR a.nickname LIKE ?' : '')
        : (keyword ? 'WHERE a.account_id LIKE ? OR a.device_id LIKE ?' : '');
      const args = !keyword ? [] : (withNickname
        ? [`%${keyword}%`, `%${keyword}%`, `%${keyword}%`]
        : [`%${keyword}%`, `%${keyword}%`]);
      const total = await db.get(`SELECT COUNT(*) AS c FROM accounts a ${where}`, args);
      const rows = await db.all(`
        SELECT a.account_id, a.account_type, a.login_type, a.device_id, a.login_count,
               a.banned, a.ban_reason, a.created_at, a.last_login_at,
               ${withNickname ? 'a.nickname,' : ''}
               w.beans, w.frozen_beans
        FROM accounts a
        LEFT JOIN wallets w ON w.account_id = a.account_id
        ${where}
        ORDER BY a.last_login_at DESC, a.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `, args);
      return { total, rows };
    };

    // 线上 nickname 列由 DBA 单独补。列未就绪时退回「账号/设备」检索，
    // 避免补列前整个用户列表直接 500（后台最常用的就是这一页）。
    let result;
    try {
      result = await runList(true);
    } catch (err) {
      if (!(err && (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054))) throw err;
      logger.warn('[admin] accounts.nickname 列缺失，用户列表退回按账号/设备检索');
      result = await runList(false);
    }
    const { total, rows } = result;

    return {
      total: Number(total ? total.c : 0),
      limit,
      offset,
      items: rows.map(row => ({
        accountId: row.account_id,
        accountType: row.account_type,
        loginType: row.login_type,
        deviceId: row.device_id,
        nickname: row.nickname || '',
        loginCount: Number(row.login_count || 0),
        banned: row.banned === 1 || row.banned === true,
        banReason: row.ban_reason || '',
        beans: row.beans == null ? null : String(row.beans),
        frozenBeans: row.frozen_beans == null ? null : String(row.frozen_beans),
        createdAt: Number(row.created_at || 0),
        lastLoginAt: Number(row.last_login_at || 0),
      })),
    };
  }

  async function getUserDetail (accountId) {
    const db = getDb();
    const account = await db.get('SELECT * FROM accounts WHERE account_id = ?', [accountId]);
    if (!account) throw Object.assign(new Error('account not found'), { code: 'NOT_FOUND' });

    const [wallet, stats, newcomer, claims, firstChargeSkus, products, bankruptReliefRow, adRewardRow, shortcutRow] = await Promise.all([
      db.get('SELECT * FROM wallets WHERE account_id = ?', [accountId]),
      db.get('SELECT * FROM player_stats WHERE account_id = ?', [accountId]),
      db.get('SELECT * FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, NEWCOMER_REWARD_TYPE, NEWCOMER_LIFETIME_KEY]),
      db.all('SELECT reward_type, claim_date, claim_count, total_amount FROM reward_claims WHERE account_id = ? ORDER BY updated_at DESC LIMIT 30', [accountId]),
      db.all(`
        SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(meta_json, '$.skuId')) AS sku_id
        FROM wallet_ledger
        WHERE account_id = ? AND type = 'platform_exchange_credit'
      `, [accountId]),
      db.all('SELECT exchange_sku_id, display_name, cost_balance, grant_beans, is_first_charge, first_charge_bonus_beans FROM platform_exchange_products ORDER BY display_order ASC', []),
      db.get('SELECT claim_count, total_amount FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, BANKRUPT_RELIEF_TYPE, adminTodayKey()]),
      db.get('SELECT claim_count, total_amount FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, 'ad_reward', adminTodayKey()]),
      db.get('SELECT claim_count, total_amount FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, SHORTCUT_REWARD_TYPE, SHORTCUT_LIFETIME_KEY]),
    ]);

    const claimed = new Set(firstChargeSkus.map(row => row.sku_id).filter(Boolean));
    const diamonds = mockExchangeClient
      ? (await mockExchangeClient.getBalance({ accountId })).chargeBalance
      : null;

    // 语音包权益（含已到期行，便于管理员改期恢复；有效期判定与 entitlement-store 一致）
    const voicePackRows = await db.all(
      'SELECT sku, source, price_beans, granted_at, expires_at FROM user_entitlements WHERE account_id = ? ORDER BY granted_at ASC',
      [accountId]
    );

    // 人机陪练每日额度（bot_match_stats）：赢豆超过 maxPositiveGain 后 reserveBotQuota
    // 拒绝配 AI（daily_positive_gain_limit），管理员可清空后恢复匹配
    const botStatsRow = await db.get(
      'SELECT * FROM bot_match_stats WHERE account_id = ? AND stat_date = ?',
      [accountId, adminTodayKey()]
    );

    return {
      account: {
        accountId: account.account_id,
        accountType: account.account_type,
        loginType: account.login_type,
        deviceId: account.device_id,
        nickname: account.nickname || '',
        firstIp: account.first_ip,
        lastIp: account.last_ip,
        loginCount: Number(account.login_count || 0),
        banned: account.banned === 1 || account.banned === true,
        banReason: account.ban_reason || '',
        createdAt: Number(account.created_at || 0),
        lastLoginAt: Number(account.last_login_at || 0),
      },
      wallet: wallet ? {
        beans: String(wallet.beans),
        frozenBeans: String(wallet.frozen_beans),
        totalEarned: String(wallet.total_earned),
        totalSpent: String(wallet.total_spent),
        totalWon: String(wallet.total_won),
        totalLost: String(wallet.total_lost),
        dailyLoginDate: wallet.daily_login_date || '',
        shareRewardDate: wallet.share_reward_date || '',
        version: Number(wallet.version || 1),
      } : null,
      stats: stats ? {
        springCount: Number(stats.spring_count || 0),
        bombCount: Number(stats.bomb_count || 0),
        maxMultiplier: Number(stats.max_multiplier || 0),
        totalGames: Number(stats.total_games || 0),
        totalWins: Number(stats.total_wins || 0),
        curStreak: Number(stats.cur_streak || 0),
        maxStreak: Number(stats.max_streak || 0),
      } : null,
      newcomerGift: { claimed: !!(newcomer && Number(newcomer.claim_count || 0) > 0) },
      // 加桌奖励（桌面快捷方式启动发放，终身一次）：领取状态 + 累计发放
      shortcutReward: {
        claimed: !!(shortcutRow && Number(shortcutRow.claim_count || 0) > 0),
        totalAmount: String(shortcutRow ? shortcutRow.total_amount || 0 : 0),
      },
      // 破产补助今日状态：realClaimed 区分真实领取（totalAmount>0）与管理员禁领（totalAmount=0）
      bankruptRelief: {
        todayClaimCount: Number(bankruptReliefRow ? bankruptReliefRow.claim_count || 0 : 0),
        todayTotalAmount: String(bankruptReliefRow ? bankruptReliefRow.total_amount || 0 : 0),
        claimable: Number(bankruptReliefRow ? bankruptReliefRow.claim_count || 0 : 0) < 1,
        date: adminTodayKey(),
      },
      // 看广告得铁豆今日状态：已看次数 / 每日上限 / 剩余
      adReward: {
        todayClaimCount: Number(adRewardRow ? adRewardRow.claim_count || 0 : 0),
        maxPerDay: Number((gameConfig && gameConfig.economy && gameConfig.economy.adRewardMaxPerDay) || 20),
        get remaining () {
          return Math.max(0, this.maxPerDay - this.todayClaimCount);
        },
        date: adminTodayKey(),
      },
      rewardClaims: claims.map(row => ({
        rewardType: row.reward_type,
        claimDate: row.claim_date,
        claimCount: Number(row.claim_count || 0),
        totalAmount: String(row.total_amount || 0),
      })),
      // 人机陪练每日额度（今日已用局数/赢豆 vs 上限）
      botQuota: {
        date: adminTodayKey(),
        matchCount: Number(botStatsRow ? botStatsRow.match_count || 0 : 0),
        maxMatches: botStatsStore.DEFAULT_MAX_MATCHES,
        positiveGainTotal: Number(botStatsRow ? botStatsRow.positive_gain_total || 0 : 0),
        reservedPositiveGain: Number(botStatsRow ? botStatsRow.reserved_positive_gain || 0 : 0),
        maxPositiveGain: botStatsStore.DEFAULT_MAX_POSITIVE_GAIN,
        netGain: Number(botStatsRow ? botStatsRow.net_gain || 0 : 0),
        winCount: Number(botStatsRow ? botStatsRow.win_count || 0 : 0),
        loseCount: Number(botStatsRow ? botStatsRow.lose_count || 0 : 0),
      },
      // 语音包权益与到期状态（skU 尾段即包名，如 tiezi / tianmei）
      voicePacks: voicePackRows.map(row => {
        const expiresAt = Number(row.expires_at || 0);
        return {
          sku: row.sku,
          packName: String(row.sku || '').split(':')[1] || row.sku,
          source: row.source,
          grantedAt: Number(row.granted_at || 0),
          expiresAt,
          expired: expiresAt > 0 && expiresAt <= Date.now(),
        };
      }),
      // 钻石余额：mock 模式存内存（重启重置），真实模式由快手平台托管不可改
      diamonds: { editable: !!mockExchangeClient, balance: diamonds },
      firstCharge: products
        .filter(row => row.is_first_charge === 1 || row.is_first_charge === true)
        .map(row => ({
          exchangeSkuId: row.exchange_sku_id,
          displayName: row.display_name,
          costBalance: String(row.cost_balance),
          grantBeans: String(row.grant_beans),
          bonusBeans: String(row.first_charge_bonus_beans || 0),
          claimed: claimed.has(row.exchange_sku_id),
        })),
    };
  }

  async function getLedger (accountId, query) {
    const limit = Math.min(200, Math.max(1, parseInt(query.get('limit') || '50', 10) || 50));
    const rows = await getDb().all(`
      SELECT tx_id, type, amount, balance_before, balance_after, match_id, meta_json, created_at
      FROM wallet_ledger WHERE account_id = ? ORDER BY created_at DESC, tx_id DESC LIMIT ${limit}
    `, [accountId]);
    return {
      items: rows.map(row => ({
        txId: row.tx_id,
        type: row.type,
        amount: String(row.amount),
        balanceBefore: String(row.balance_before),
        balanceAfter: String(row.balance_after),
        matchId: row.match_id || '',
        meta: row.meta_json || '',
        createdAt: Number(row.created_at || 0),
      })),
    };
  }

  async function getOrders (accountId) {
    const db = getDb();
    const [exchanges, iaps] = await Promise.all([
      db.all(`
        SELECT exchange_order_id, exchange_sku_id, cost, grant_beans, bonus_beans,
               status, platform_code, created_at
        FROM platform_exchange_orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 50
      `, [accountId]),
      db.all(`
        SELECT order_id, sku_id, platform, price_fen, grant_diamonds, status, created_at
        FROM iap_orders WHERE account_id = ? ORDER BY created_at DESC LIMIT 50
      `, [accountId]),
    ]);
    return {
      exchangeOrders: exchanges.map(row => ({
        orderId: row.exchange_order_id,
        skuId: row.exchange_sku_id,
        cost: String(row.cost),
        grantBeans: String(row.grant_beans),
        bonusBeans: String(row.bonus_beans),
        status: row.status,
        platformCode: row.platform_code == null ? null : Number(row.platform_code),
        createdAt: Number(row.created_at || 0),
      })),
      iapOrders: iaps.map(row => ({
        orderId: row.order_id,
        skuId: row.sku_id,
        platform: row.platform,
        priceFen: String(row.price_fen),
        grantDiamonds: String(row.grant_diamonds),
        status: row.status,
        createdAt: Number(row.created_at || 0),
      })),
    };
  }

  // ── 写操作 ──────────────────────────────────────────────────
  // 改豆子必须连带写 admin_adjust 流水，否则余额和账本会对不上，
  // 排查线上问题时无从判断某次跳变是管理员改的还是业务写的。
  async function setBeans (accountId, body) {
    const beans = requireAmount(body.beans, 'beans');
    const frozen = body.frozenBeans == null ? null : requireAmount(body.frozenBeans, 'frozenBeans');

    return retryableTransaction(async () => {
      const db = getDb();
      const wallet = await db.get('SELECT beans, frozen_beans FROM wallets WHERE account_id = ? FOR UPDATE', [accountId]);
      if (!wallet) throw Object.assign(new Error('wallet not found'), { code: 'NOT_FOUND' });
      const before = BigInt(String(wallet.beans));
      const nextFrozen = frozen == null ? BigInt(String(wallet.frozen_beans)) : frozen;
      const now = Date.now();

      await db.run(
        'UPDATE wallets SET beans = ?, frozen_beans = ?, updated_at = ?, version = version + 1 WHERE account_id = ?',
        [String(beans), String(nextFrozen), now, accountId],
      );
      if (beans !== before) {
        await db.run(`
          INSERT INTO wallet_ledger (tx_id, account_id, type, amount, balance_before, balance_after,
            room_id, round_no, match_id, idempotency_key, meta_json, created_at)
          VALUES (?, ?, 'admin_adjust', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
        `, [
          `tx_${crypto.randomUUID()}`, accountId, String(beans - before), String(before), String(beans),
          `admin_adjust:${crypto.randomUUID()}`,
          JSON.stringify({ by: 'admin', before: String(before), after: String(beans) }), now,
        ]);
      }
      return { beans: String(beans), frozenBeans: String(nextFrozen) };
    }, { attempts: 3 });
  }

  // 注销清零：铁豆（含冻结）清零并写 account_cancel 流水（幂等），已购权益删除。
  // 钻石余额在快手平台侧（charge/free balance），由平台注销流程清零，本地仅缓存不改写。
  // 流水与牌局记录按合规要求保留（审计/未成年退款举证），不做物理删除。
  async function cancelAccount (accountId) {
    return retryableTransaction(async () => {
      const db = getDb();
      const wallet = await db.get('SELECT beans, frozen_beans FROM wallets WHERE account_id = ? FOR UPDATE', [accountId]);
      if (!wallet) throw Object.assign(new Error('wallet not found'), { code: 'NOT_FOUND' });
      const before = BigInt(String(wallet.beans));
      const now = Date.now();

      await db.run(
        'UPDATE wallets SET beans = 0, frozen_beans = 0, updated_at = ?, version = version + 1 WHERE account_id = ?',
        [now, accountId],
      );
      // 幂等：同一账号只落一条 account_cancel 流水，重复调用不重复记账
      const idemKey = `account_cancel:${accountId}`;
      const existing = await db.get('SELECT tx_id FROM wallet_ledger WHERE idempotency_key = ?', [idemKey]);
      if (!existing && before > 0n) {
        await db.run(`
          INSERT INTO wallet_ledger (tx_id, account_id, type, amount, balance_before, balance_after,
            room_id, round_no, match_id, idempotency_key, meta_json, created_at)
          VALUES (?, ?, 'account_cancel', ?, ?, 0, NULL, NULL, NULL, ?, ?, ?)
        `, [
          `tx_${crypto.randomUUID()}`, accountId, String(-before), String(before),
          idemKey, JSON.stringify({ by: 'admin', source: 'account_cancel' }), now,
        ]);
      }
      const ent = await db.run('DELETE FROM user_entitlements WHERE account_id = ?', [accountId]);
      const entitlementsCleared = Number(ent && ent.changes != null ? ent.changes : ent?.affectedRows || 0);
      return { cancelled: true, beansCleared: String(before), entitlementsCleared };
    }, { attempts: 3 });
  }

  // 首充资格的唯一判定口径是 wallet_ledger 里的到账流水
  // （platform-exchange-catalog.js 的 isFirstChargeAvailable），所以重置 = 删流水。
  // 刻意不退豆子：余额调整交给「设置豆子」，避免一次操作牵连两种语义。
  async function resetFirstCharge (accountId, body) {
    const skuId = body.exchangeSkuId ? String(body.exchangeSkuId) : null;
    const db = getDb();
    const result = skuId
      ? await db.run(`
          DELETE FROM wallet_ledger
          WHERE account_id = ? AND type = 'platform_exchange_credit'
            AND JSON_UNQUOTE(JSON_EXTRACT(meta_json, '$.skuId')) = ?
        `, [accountId, skuId])
      : await db.run(`
          DELETE FROM wallet_ledger WHERE account_id = ? AND type = 'platform_exchange_credit'
        `, [accountId]);
    return { deleted: Number(result && result.changes != null ? result.changes : result?.affectedRows || 0) };
  }

  async function setNewcomer (accountId, body) {
    const claimed = body.claimed === true;
    const db = getDb();
    const now = Date.now();
    if (claimed) {
      await db.run(`
        INSERT INTO reward_claims (account_id, reward_type, claim_date, claim_count, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, 1, 0, ?, ?)
        ON DUPLICATE KEY UPDATE claim_count = 1, updated_at = VALUES(updated_at)
      `, [accountId, NEWCOMER_REWARD_TYPE, NEWCOMER_LIFETIME_KEY, now, now]);
    } else {
      await db.run('DELETE FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, NEWCOMER_REWARD_TYPE, NEWCOMER_LIFETIME_KEY]);
      // 必须同步删 wallet_ledger 的 newcomer_gift 流水（幂等行），只删 reward_claims 不够：
      // 重置语义是「可重新领取」，但重领时 applyWalletDelta 会按幂等键
      // （newcomer_gift:{id}:lifetime:N）命中历史流水，直接当作「已发过」返回
      // claimed:true/amount:10000 而不真正加钱 —— 表现为领取回包 200 但不到账。
      // 先例：首充重置（resetFirstCharge）同样通过删流水恢复资格。
      await db.run('DELETE FROM wallet_ledger WHERE account_id = ? AND type = ?',
        [accountId, NEWCOMER_REWARD_TYPE]);
    }
    return { claimed };
  }

  // 加桌奖励重置：与 setNewcomer 同构。必须同步删 wallet_ledger 的
  // shortcut_reward 流水（幂等键 shortcut_reward:{id}:lifetime:1），只删
  // reward_claims 不够 —— 重领会命中历史幂等行回 200 但不加钱。
  async function setShortcutReward (accountId, body) {
    const claimed = body.claimed === true;
    const db = getDb();
    const now = Date.now();
    if (claimed) {
      await db.run(`
        INSERT INTO reward_claims (account_id, reward_type, claim_date, claim_count, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, 1, 0, ?, ?)
        ON DUPLICATE KEY UPDATE claim_count = 1, updated_at = VALUES(updated_at)
      `, [accountId, SHORTCUT_REWARD_TYPE, SHORTCUT_LIFETIME_KEY, now, now]);
    } else {
      await db.run('DELETE FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, SHORTCUT_REWARD_TYPE, SHORTCUT_LIFETIME_KEY]);
      await db.run('DELETE FROM wallet_ledger WHERE account_id = ? AND type = ?',
        [accountId, SHORTCUT_REWARD_TYPE]);
    }
    return { claimed };
  }

  // scope=all 清掉全部领奖记录（含 newcomer_gift 的 lifetime 行），
  // 默认只清今日的日常记录，保留终身一次的资格状态。
  async function resetDaily (accountId, body) {
    const scope = String(body.scope || 'today');
    const db = getDb();
    let result;
    if (scope === 'all') {
      result = await db.run('DELETE FROM reward_claims WHERE account_id = ?', [accountId]);
    } else {
      result = await db.run('DELETE FROM reward_claims WHERE account_id = ? AND claim_date <> ?',
        [accountId, NEWCOMER_LIFETIME_KEY]);
    }
    await db.run('UPDATE wallets SET daily_login_date = \'\', share_reward_date = \'\', updated_at = ?, version = version + 1 WHERE account_id = ?',
      [Date.now(), accountId]);
    return { scope, deleted: Number(result && result.changes != null ? result.changes : result?.affectedRows || 0) };
  }

  async function setBan (accountId, body) {
    const banned = body.banned === true;
    const reason = String(body.reason || '').slice(0, 255);
    await getDb().run('UPDATE accounts SET banned = ?, ban_reason = ? WHERE account_id = ?',
      [banned ? 1 : 0, banned ? reason : '', accountId]);
    return { banned, reason: banned ? reason : '' };
  }

  // 语音包权益改期（管理员强改，绕过业务校验；到期判定链自动生效）：
  //   days / hours / minutes / seconds 组合时长，从现在起算：
  //     days = -1（且不带时分秒）→ 永久（expires_at = 0）
  //     总时长 = 0              → 立即过期
  //     总时长 > 0              → now + 总时长
  //   days 单独传 7（不带时分秒）即旧行为的 7 天，向后兼容。
  async function setVoicePackExpiry (accountId, body) {
    const sku = String(body.sku || '');
    if (!/^[a-zA-Z0-9_:-]+$/.test(sku)) {
      throw Object.assign(new Error('invalid sku'), { code: 'INVALID_REQUEST' });
    }
    const intOr = (value, fallback) =>
      (value == null || value === '' ? fallback : parseInt(value, 10));
    const days = intOr(body.days, 0);
    const hours = intOr(body.hours, 0);
    const minutes = intOr(body.minutes, 0);
    const seconds = intOr(body.seconds, 0);
    if (![days, hours, minutes, seconds].every(Number.isInteger)) {
      throw Object.assign(new Error('时长字段必须都是整数'), { code: 'INVALID_REQUEST' });
    }
    if (days < -1 || days > 3650 || hours < 0 || hours > 23
        || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) {
      throw Object.assign(new Error('days 需为 -1(永久) 或 0~3650；时 0~23；分/秒 0~59'), { code: 'INVALID_REQUEST' });
    }
    const db = getDb();
    const row = await db.get('SELECT sku FROM user_entitlements WHERE account_id = ? AND sku = ?', [accountId, sku]);
    if (!row) throw Object.assign(new Error('该用户未拥有此语音包'), { code: 'NOT_FOUND' });
    let expiresAt;
    if (days === -1) {
      if (hours || minutes || seconds) {
        throw Object.assign(new Error('永久不能携带时分秒'), { code: 'INVALID_REQUEST' });
      }
      expiresAt = 0;
    } else {
      const durationMs = days * 86400000 + hours * 3600000 + minutes * 60000 + seconds * 1000;
      expiresAt = durationMs > 0 ? Date.now() + durationMs : Date.now() - 1;
    }
    await db.run('UPDATE user_entitlements SET expires_at = ?, updated_at = ? WHERE account_id = ? AND sku = ?',
      [expiresAt, Date.now(), accountId, sku]);
    return {
      sku, days, hours, minutes, seconds,
      expiresAt,
      expired: expiresAt > 0 && expiresAt <= Date.now(),
    };
  }

  // 看广告得铁豆：按用户设置今日已看次数（直接操作 reward_claims 的 ad_reward 记录，
  // remaining = maxPerDay - claimCount，服务端全部判定链自动生效）：
  //   count=0 → 删除今日记录：恢复全部次数
  //   count=N → 今日已看 N 次；N ≥ maxPerDay 即视为今日看完（不弹广告引导）
  async function setAdRewardClaims (accountId, body) {
    const count = Math.max(0, Math.min(999, parseInt(body.count, 10) || 0));
    const db = getDb();
    const now = Date.now();
    if (count === 0) {
      await db.run('DELETE FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, 'ad_reward', adminTodayKey()]);
    } else {
      await db.run(`
        INSERT INTO reward_claims (account_id, reward_type, claim_date, claim_count, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        ON DUPLICATE KEY UPDATE claim_count = VALUES(claim_count), updated_at = VALUES(updated_at)
      `, [accountId, 'ad_reward', adminTodayKey(), count, now, now]);
    }
    const maxPerDay = Number((gameConfig && gameConfig.economy && gameConfig.economy.adRewardMaxPerDay) || 20);
    return { count, remaining: Math.max(0, maxPerDay - count), date: adminTodayKey() };
  }

  // 破产补助按用户开关（复用每日限领判定链，服务端游戏逻辑零改动）：
  //   enabled=false → 今日 claim_count 顶到上限(1)：结算 claimable / wallet.bankruptRelief /
  //                    claimBankruptRewardIfAllowed 全部自动视为"今日已领"，弹窗与领取均拦截
  //   enabled=true  → 清今日记录：恢复领取资格（真实领取记录也会被清，显式恢复语义）
  async function setBankruptRelief (accountId, body) {
    const enabled = body.enabled === true;
    const db = getDb();
    const now = Date.now();
    if (enabled) {
      await db.run('DELETE FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
        [accountId, BANKRUPT_RELIEF_TYPE, adminTodayKey()]);
    } else {
      await db.run(`
        INSERT INTO reward_claims (account_id, reward_type, claim_date, claim_count, total_amount, created_at, updated_at)
        VALUES (?, ?, ?, 1, 0, ?, ?)
        ON DUPLICATE KEY UPDATE claim_count = 1, total_amount = 0, updated_at = VALUES(updated_at)
      `, [accountId, BANKRUPT_RELIEF_TYPE, adminTodayKey(), now, now]);
    }
    return { enabled, date: adminTodayKey() };
  }

  // 人机陪练额度清零（赢 AI 豆数到上限后不再配人机，清空后恢复匹配）：
  //   1) 删除当日 bot_match_stats 统计行 —— 赢豆/局数清零，下次 reserveBotQuota 按全新额度判定
  //   2) 释放仍处 reserved（未开局）的配额预留；active（进行中对局）绝不动 ——
  //      结算事务 settleBotQuota 依赖 reservation 行存在，删掉会让整局结算回滚卡死
  //   scope: 'today'（默认）只清今日；'all' 清全部日期
  async function resetBotQuota (accountId, body) {
    const scope = String(body.scope || 'today') === 'all' ? 'all' : 'today';
    const db = getDb();
    const now = Date.now();
    const dateArgs = scope === 'all' ? [] : [adminTodayKey()];
    const dateCond = scope === 'all' ? '' : ' AND stat_date = ?';
    const count = result =>
      Number(result && result.changes != null ? result.changes : result?.affectedRows || 0);

    const released = await db.run(`
      UPDATE bot_quota_reservations
      SET status = 'released', released_at = ?, updated_at = ?
      WHERE account_id = ?${dateCond} AND status = 'reserved'
    `, [now, now, accountId, ...dateArgs]);
    const deleted = await db.run(`
      DELETE FROM bot_match_stats WHERE account_id = ?${dateCond}
    `, [accountId, ...dateArgs]);
    return { scope, released: count(released), deleted: count(deleted), date: adminTodayKey() };
  }

  async function setDiamonds (accountId, body) {
    if (!mockExchangeClient || !mockExchangeClient.set) {
      throw Object.assign(new Error('diamond balance is managed by the Kwai platform'), { code: 'NOT_EDITABLE' });
    }
    const amount = requireAmount(body.diamonds, 'diamonds');
    mockExchangeClient.set(accountId, amount);
    const balance = await mockExchangeClient.getBalance({ accountId });
    return { diamonds: balance.chargeBalance };
  }

  async function resetStats (accountId) {
    await getDb().run(`
      UPDATE player_stats SET spring_count = 0, bomb_count = 0, max_multiplier = 0,
        total_games = 0, total_wins = 0, cur_streak = 0, max_streak = 0, updated_at = ?
      WHERE account_id = ?
    `, [Date.now(), accountId]);
    return { reset: true };
  }

  // ── 游戏配置一览（只读）────────────────────────────────────
  async function getConfig () {
    const iapCatalog = require('../payment/catalog');
    const exchangeCatalog = require('../payment/platform-exchange-catalog');
    const tradeCatalog = require('../trade/catalog');
    const [iapProducts, exchangeProducts] = await Promise.all([
      iapCatalog.getAllProducts().catch(() => []),
      exchangeCatalog.getAllExchangeProducts().catch(() => []),
    ]);
    const cfg = gameConfig || {};
    const resolve = (v) => (typeof v === 'function' ? v() : v);
    const configCenterView = configCenter
      ? { configCenter: configCenter.adminView() }
      : {};
    return {
      economy: resolve(cfg.economy) || null,
      roomTiers: resolve(cfg.roomTiers) || null,
      botMatch: resolve(cfg.botMatch) || null,
      voiceChat: resolve(cfg.voiceChat) || null,
      security: resolve(cfg.security) || null,
      commandRateLimits: resolve(cfg.commandRateLimits) || null,
      timeouts: resolve(cfg.timeouts) || null,
      guestAllowedRoomTypes: resolve(cfg.guestAllowedRoomTypes) || [],
      ...configCenterView,
      iapProducts,
      exchangeProducts,
      tradeItems: tradeCatalog.listPublicItems(),
    };
  }

  // ── 路由分发 ────────────────────────────────────────────────
  const WRITE_ROUTES = {
    beans: setBeans,
    'reset-first-charge': resetFirstCharge,
    newcomer: setNewcomer,
    'shortcut-reward': setShortcutReward,
    'reset-daily': resetDaily,
    ban: setBan,
    diamonds: setDiamonds,
    'reset-stats': resetStats,
    'bankrupt-relief': setBankruptRelief,
    'ad-claims': setAdRewardClaims,
    'voice-pack-expiry': setVoicePackExpiry,
    'reset-bot-quota': resetBotQuota,
    cancel: cancelAccount,
  };

  async function handle (request) {
    const { method, path: urlPath, query, headers, rawBody, clientIp } = request;
    if (urlPath !== '/admin' && !urlPath.startsWith('/admin/')) return { handled: false };

    // 控制台页面本身不含数据，但仍要求本地来源，避免暴露后台存在性。
    // ADMIN_ALLOW_REMOTE=1 时才对外提供这层空壳页面（页面内容需密码才能取数）。
    if (method === 'GET' && (urlPath === '/admin' || urlPath === '/admin/')) {
      if (!isAllowedIp(clientIp)) return { handled: true, status: 403, html: 'forbidden' };
      return { handled: true, status: 200, html: fs.readFileSync(indexHtmlPath, 'utf8') };
    }

    if (!urlPath.startsWith('/admin/api/')) return { handled: false };

    try {
      authorize(headers, clientIp);

      if (method === 'GET' && urlPath === '/admin/api/config') {
        return response(200, await getConfig());
      }

      // ── 配置中心：保存 / 回滚 / 版本列表 / 审计明细 ──
      if (configCenter && urlPath.startsWith('/admin/api/config/')) {
        const sub = urlPath.slice('/admin/api/config/'.length);
        if (method === 'POST' && sub === 'save') {
          const body = parseJson(headers, rawBody);
          return response(200, await configCenter.saveConfig({
            operator: String(body.operator || 'admin'),
            changes: body.changes || {},
            comment: body.comment || '',
          }));
        }
        if (method === 'POST' && sub === 'rollback') {
          const body = parseJson(headers, rawBody);
          return response(200, await configCenter.rollbackToVersion(Number(body.version), {
            operator: String(body.operator || 'admin'),
          }));
        }
        if (method === 'GET' && sub === 'versions') {
          return response(200, { versions: await configCenter.listVersions(query.get('limit')) });
        }
        if (method === 'GET' && sub === 'audit') {
          return response(200, { audit: await configCenter.listAudit(query.get('version'), query.get('limit')) });
        }
      }

      if (method === 'GET' && urlPath === '/admin/api/users') {
        return response(200, await listUsers(query));
      }

      const segments = urlPath.slice('/admin/api/users/'.length).split('/').filter(Boolean);
      if (urlPath.startsWith('/admin/api/users/') && segments.length >= 1) {
        const accountId = requireAccountId(segments[0]);
        const action = segments[1] || '';

        if (method === 'GET' && !action) return response(200, await getUserDetail(accountId));
        if (method === 'GET' && action === 'ledger') return response(200, await getLedger(accountId, query));
        if (method === 'GET' && action === 'orders') return response(200, await getOrders(accountId));

        const writeFn = WRITE_ROUTES[action];
        if (method === 'POST' && writeFn) {
          const body = parseJson(headers, rawBody);
          return response(200, await writeFn(accountId, body));
        }
      }

      return response(404, { error: { code: 'NOT_FOUND', message: 'unknown admin route' } });
    } catch (err) {
      const statusMap = {
        UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
        RATE_LIMITED: 429,
        INVALID_REQUEST: 400, NOT_EDITABLE: 409, CONFIG_VALIDATION: 400,
      };
      const code = err.code || 'INTERNAL';
      if (code === 'INTERNAL') logger.error('[admin] unhandled:', err.message);
      return response(statusMap[code] || 500, { error: { code, message: err.message || 'error' } });
    }
  }

  return { handle };
}

module.exports = { createAdminHttpHandler };
