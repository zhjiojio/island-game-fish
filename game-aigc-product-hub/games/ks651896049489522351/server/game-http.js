// ============================================================
// game-http.js — 游戏大厅 HTTP 接口（合并版）
// ------------------------------------------------------------
// 3 个核心端点，替代原来十几个 WebSocket 往返：
//
//   GET  /api/v1/game/bootstrap
//     返回：wallet + economy + 每日登录奖励 + newcomer 状态 +
//           广告次数 + voiceConfig + entitlements
//     ──── 页面加载后一次拿齐，不用等 WebSocket auth ────
//
//   POST /api/v1/game/claim
//     body: { type, adTransId? }
//     type: ad_reward | share_reward | bankrupt_relief |
//           shortcut_reward | newcomer_gift
//     返回：wallet + economy + rewardType + claimed + amount + message
//
//   GET  /api/v1/game/profile
//     返回：成就统计（只在个人面板打开时调用）
//
//   POST /api/v1/game/sku/buy
//     body: { sku, requestId, source }
//     返回：ok + sku + wallet + entitlements
// ============================================================
'use strict';

const logger = require('./logger');

const auth = require('./auth');
const accountStore = require('./persistence/account-store');

function createGameHttpHandler (services) {
  const {
    getEconomy,
    getOrCreateWallet,
    claimDailyLoginIfNeeded,
    claimAdRewardIfAllowed,
    nextAdRewardAmount,
    newcomerGiftStatus,
    claimNewcomerGiftIfNeeded,
    claimShareRewardIfNeeded,
    claimBankruptRewardIfAllowed,
    claimShortcutRewardIfNeeded,
    buildVoiceConfigForCapabilities,
    getProfileStats,
    buySku,
    todayKey,
    walletStore,
    entitlementStore,
    onWalletChanged,
    configCenter = null,
  } = services;

  const rateBuckets = new Map();
  const rateLimits = {
    bootstrap:    { windowMs: 10000, max: 12 },
    claim:        { windowMs: 60000, max: 30 },
    profile:      { windowMs: 10000, max: 6  },
    updateProfile: { windowMs: 10000, max: 6 },
    buySku:       { windowMs: 60000, max: 5  },
  };

  function response (status, data) {
    return { handled: true, status, data };
  }

  function errorResponse (code, message, extra) {
    const statusMap = {
      UNAUTHENTICATED: 401, RATE_LIMITED: 429,
      NOT_ELIGIBLE: 400, ALREADY_CLAIMED: 409,
      INVALID_REQUEST: 400, SKU_NOT_FOUND: 404,
      SKU_DISABLED: 403, INSUFFICIENT_BEANS: 402,
      FEATURE_DISABLED: 503,
    };
    return response(statusMap[code] || 400, { error: { code, message, ...(extra || {}) } });
  }

  function authenticate (headers) {
    const authorization = String(headers.authorization || '');
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const identity = match ? auth.verifySessionToken(match[1]) : null;
    if (!identity) throw Object.assign(new Error('authentication required'), { code: 'UNAUTHENTICATED' });
    return identity;
  }

  function enforceRateLimit (accountId, action) {
    const rule = rateLimits[action];
    if (!rule) return;
    const now = Date.now();
    const key = `${accountId}:${action}`;
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= rule.windowMs) {
      bucket = { startedAt: now, count: 0 };
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > rule.max) throw Object.assign(new Error('rate limited'), { code: 'RATE_LIMITED' });
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) {
        if (now - v.startedAt >= 120000) rateBuckets.delete(k);
      }
    }
  }

  function requireJson (contentType, rawBody) {
    const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/json') throw Object.assign(new Error('content-type must be application/json'), { code: 'INVALID_REQUEST' });
    try {
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('invalid body');
      return body;
    } catch {
      throw Object.assign(new Error('invalid json body'), { code: 'INVALID_REQUEST' });
    }
  }

  function walletEnvelope (wallet, economy, extra) {
    // HTTP 到账后同步房间豆数并广播（fire-and-forget，不阻塞响应）
    if (typeof onWalletChanged === 'function' && wallet && wallet.accountId) {
      void onWalletChanged(wallet.accountId).catch(() => {});
    }
    return {
      wallet,
      economy,
      walletSource: 'server',
      economyVersion: economy.version,
      initialBeans: economy.rewards ? economy.rewards.newUserBeans : 0,
      serverNow: Date.now(),
      ...(extra || {}),
    };
  }

  // 破产补助可领判定（服务端权威，随 wallet 下发）：
  // 与 index.js sendWalletTo 保持同一逻辑——余额低于门槛才查当日领取记录。
  // 客户端主页点场次豆不足时按 wallet.bankruptRelief 优先弹补助。
  async function attachBankruptRelief (wallet, economy) {
    const rewards = (economy && economy.rewards) || {};
    const threshold = Number(rewards.bankruptThresholdBeans || 5000);
    const amount = Number(rewards.bankruptRewardBeans || 0);
    const maxPerDay = Number(rewards.bankruptRewardMaxPerDay || 1);
    wallet.bankruptRelief = { claimable: false, amount: amount };
    if (wallet && Number(wallet.beans) < threshold) {
      const st = await walletStore.getDailyRewardStatus(wallet.accountId, 'bankrupt_relief', todayKey());
      wallet.bankruptRelief = {
        claimable: Number(st.claimCount || 0) < maxPerDay,
        amount: amount,
      };
    }
    return wallet;
  }

  async function handle (request) {
    const { method, path, headers, rawBody } = request;
    if (!path.startsWith('/api/v1/game/')) return { handled: false };

    let identity;
    try {
      identity = authenticate(headers);
    } catch (err) {
      return errorResponse(err.code || 'UNAUTHENTICATED', err.message || 'authentication required');
    }

    const accountId = identity.accountId;
    const capStr = String(headers['x-client-capabilities'] || '');
    const capabilities = new Set(capStr.split(',').map(s => s.trim()).filter(Boolean));

    try {
      if (method === 'POST' && path === '/api/v1/game/profile') {
        enforceRateLimit(accountId, 'updateProfile');
        const body = requireJson(headers['content-type'], rawBody);
        const nickname = accountStore.sanitizeNickname(body.nickname).slice(0, 12);
        if (!nickname) return errorResponse('INVALID_REQUEST', 'nickname is required');
        const updated = await accountStore.updateNickname(accountId, nickname);
        if (!updated) {
          const account = await accountStore.getAccount(accountId);
          if (!account || account.nickname !== nickname) {
            return response(503, { error: { code: 'PROFILE_SYNC_FAILED', message: 'nickname sync failed' } });
          }
        }
        return response(200, { nickname });
      }

      // ══════════════════════════════════════════════════════════
      // GET /api/v1/game/config
      // 配置中心客户端下发：文案 + 对客户端安全的数值子集（灰度感知）。
      // ══════════════════════════════════════════════════════════
      if (method === 'GET' && path === '/api/v1/game/config') {
        enforceRateLimit(accountId, 'config');
        if (!configCenter) return response(200, { version: 0, enabled: false });
        const view = await configCenter.getEffectiveFor(accountId);
        const client = configCenter.clientView(view.master);
        return response(200, { ...client, enabled: true, gray: view.gray });
      }

      // ══════════════════════════════════════════════════════════
      // GET /api/v1/game/bootstrap
      // 一次拿齐启动所需全部数据：钱包/经济体/每日登录/新手礼包/广告次数/语音配置/权益
      // ══════════════════════════════════════════════════════════
      if (method === 'GET' && path === '/api/v1/game/bootstrap') {
        enforceRateLimit(accountId, 'bootstrap');
        logger.info(`[game-http] bootstrap ${accountId.slice(0, 12)}…`);
        const economy = getEconomy();

        // 钱包必须先建好，再并发拉其余数据。
        // 否则下面三条路径（每日登录 / 新手礼包 / 广告次数）会同时对同一个
        // 不存在的钱包发起创建事务，新账号首次 bootstrap 必然抢锁。
        const wallet = await getOrCreateWallet(accountId);

        // 并发拉取其余数据
        const [
          loginReward,
          newcomerSt,
          adSt,
          entitlementItems,
        ] = await Promise.all([
          claimDailyLoginIfNeeded(accountId),
          newcomerGiftStatus(accountId),
          walletStore.getDailyRewardStatus(accountId, 'ad_reward', todayKey()),
          entitlementStore.listEntitlements(accountId).catch(() => []),
        ]);

        await attachBankruptRelief(wallet, economy);
        const voiceConfig = buildVoiceConfigForCapabilities(capabilities);

        return response(200, {
          // ── 钱包 ──
          ...walletEnvelope(wallet, economy, {
            rewardType: loginReward.claimed ? 'daily_login' : '',
            claimed: loginReward.claimed,
            amount: loginReward.amount,
            message: loginReward.claimed ? `每日登录，获得 ${loginReward.amount} 铁豆` : '',
          }),
          // ── 新手礼包 ──
          newcomerGift: newcomerSt,
          // ── 广告次数 ──
          adReward: {
            claimCount: adSt.claimCount,
            maxClaimsPerDay: economy.rewards.adRewardMaxPerDay,
            remaining: Math.max(0, economy.rewards.adRewardMaxPerDay - adSt.claimCount),
            nextRewardAmount: nextAdRewardAmount(adSt.claimCount),
            dailyCapAmount: economy.rewards.adRewardDailyCapBeans,
            totalAmount: adSt.totalAmount,
          },
          // ── 语音配置 ──
          voiceConfig,
          // ── 权益（已购语音包）──
          entitlements: {
            seq: Date.now(),
            items: entitlementItems.map(item => ({
              sku: item.sku,
              source: item.source,
              grantedAt: item.grantedAt,
              expiresAt: item.expiresAt,
            })),
          },
        });
      }

      // ══════════════════════════════════════════════════════════
      // POST /api/v1/game/claim
      // 统一奖励领取接口：ad_reward / share_reward / bankrupt_relief /
      //                    shortcut_reward / newcomer_gift
      // ══════════════════════════════════════════════════════════
      if (method === 'POST' && path === '/api/v1/game/claim') {
        enforceRateLimit(accountId, 'claim');
        const body = requireJson(headers['content-type'], rawBody);
        const type = String(body.type || '').trim();
        const economy = getEconomy();

        let reward;
        let rewardTypeKey;
        let claimedMsg;
        let duplicateMsg;

        if (type === 'ad_reward') {
          const adTransId = String(body.adTransId || '').replace(/[^a-zA-Z0-9_\-:.]/g, '').slice(0, 64);
          reward = await claimAdRewardIfAllowed(accountId, adTransId);
          rewardTypeKey = 'ad_reward';
          const nextReward = nextAdRewardAmount(reward.claimCount || 0);
          reward.nextRewardAmount = nextReward;
          claimedMsg = `第${reward.claimCount || 0}次广告奖励，获得 ${reward.amount} 铁豆`;
          duplicateMsg = '今日广告奖励已达上限，明日再来';

        } else if (type === 'share_reward') {
          reward = await claimShareRewardIfNeeded(accountId);
          rewardTypeKey = 'share_reward';
          claimedMsg = `分享成功，获得 ${reward.amount} 铁豆`;
          duplicateMsg = '今日分享奖励已领取';

        } else if (type === 'bankrupt_relief') {
          reward = await claimBankruptRewardIfAllowed(accountId);
          rewardTypeKey = 'bankrupt_relief';
          claimedMsg = `破产补助，获得 ${reward.amount} 铁豆`;
          duplicateMsg = reward.notEligible
            ? `余额未低于 ${economy.bankruptThresholdBeans || 5000} 铁豆，暂不可领取`
            : '破产补助已用完，明日再来';

        } else if (type === 'shortcut_reward') {
          reward = await claimShortcutRewardIfNeeded(accountId);
          rewardTypeKey = 'shortcut_reward';
          claimedMsg = `加桌成功，获得 ${reward.amount} 铁豆`;
          duplicateMsg = '加桌奖励已领取';

        } else if (type === 'newcomer_gift') {
          reward = await claimNewcomerGiftIfNeeded(accountId);
          rewardTypeKey = 'newcomer_gift';
          claimedMsg = `新手礼包已领取，获得 ${reward.amount} 铁豆`;
          duplicateMsg = '新手礼包已领取过';

        } else {
          return errorResponse('INVALID_REQUEST', `不支持的奖励类型: ${type}`);
        }

        const wallet = await getOrCreateWallet(accountId);
        await attachBankruptRelief(wallet, economy);
        return response(200, {
          ...walletEnvelope(wallet, economy, {
            rewardType: rewardTypeKey,
            claimed: reward.claimed,
            amount: reward.amount,
            claimCount: reward.claimCount || 0,
            maxClaimsPerDay: reward.maxClaimsPerDay || 0,
            totalAmount: reward.totalAmount || 0,
            dailyCapAmount: reward.dailyCapAmount || 0,
            nextRewardAmount: reward.nextRewardAmount || 0,
            notEligible: !!reward.notEligible,
            message: reward.claimed ? claimedMsg : duplicateMsg,
          }),
        });
      }

      // ══════════════════════════════════════════════════════════
      // GET /api/v1/game/profile
      // 成就统计（只在个人面板打开时调用，不需合入 bootstrap）
      // ══════════════════════════════════════════════════════════
      if (method === 'GET' && path === '/api/v1/game/profile') {
        enforceRateLimit(accountId, 'profile');
        const stats = await getProfileStats(accountId);
        return response(200, stats);
      }

      // ══════════════════════════════════════════════════════════
      // POST /api/v1/game/sku/buy
      // 语音包购买（独立，因为有幂等 requestId 语义）
      // ══════════════════════════════════════════════════════════
      if (method === 'POST' && path === '/api/v1/game/sku/buy') {
        enforceRateLimit(accountId, 'buySku');
        const body = requireJson(headers['content-type'], rawBody);
        const sku = String(body.sku || '').trim();
        const requestId = String(body.requestId || '').replace(/[^a-zA-Z0-9_\-:.]/g, '').slice(0, 64);
        const source = String(body.source || '').slice(0, 64);
        if (!sku) return errorResponse('INVALID_REQUEST', 'sku is required');

        const result = await buySku(accountId, sku, requestId, source, capabilities);
        if (!result.ok) {
          return errorResponse(result.code || 'SKU_DISABLED', result.message || '购买失败', {
            sku: result.sku || sku,
            priceBeans: result.priceBeans || 0,
          });
        }
        const economy = getEconomy();
        const wallet = await getOrCreateWallet(accountId);
        await attachBankruptRelief(wallet, economy);
        const entitlementItems = await entitlementStore.listEntitlements(accountId);
        return response(200, {
          ok: true,
          sku: result.sku,
          owned: true,
          charged: !!result.charged,
          priceBeans: result.priceBeans,
          ...walletEnvelope(wallet, economy),
          entitlements: {
            seq: Date.now(),
            items: entitlementItems.map(item => ({
              sku: item.sku,
              source: item.source,
              grantedAt: item.grantedAt,
              expiresAt: item.expiresAt,
            })),
          },
        });
      }

      return response(404, { error: { code: 'NOT_FOUND', message: 'not found' } });

    } catch (err) {
      logger.error('[game-http]', path, err.message);
      const code = err.code || 'INTERNAL_ERROR';
      const status = code === 'UNAUTHENTICATED' ? 401 : code === 'RATE_LIMITED' ? 429 : 500;
      return response(status, { error: { code, message: err.message || 'internal error' } });
    }
  }

  return { handle };
}

module.exports = { createGameHttpHandler };
