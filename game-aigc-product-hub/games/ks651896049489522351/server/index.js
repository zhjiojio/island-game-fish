// ============================================================
// 斗地主 WebSocket 服务端 - 带房间管理
// 用法: node index.js        (默认端口 8080)
//       PORT=3000 node index.js
// ============================================================

const crypto = require('crypto');
const fs = require('fs');
const { WebSocketServer } = require('ws');
const logger = require('./logger');
logger.installConsoleBridge();
const { createHttpServer, registerReadyCheck, registerIapHttpHandler, registerGameHttpHandler, registerAdminHttpHandler, setReady, isReady } = require('./http-server');
const { checkEnv: checkRequiredEnv } = require('./config/required-env');
const { getConfig: getIapConfig } = require('./payment/config');
const { notifyEvents } = require('./payment/notify-handler');
const iapOrderStore = require('./persistence/iap-order-store');
const iapOrderService = require('./payment/order-service');
const iapCatalog = require('./payment/catalog');
const exchangeCatalog = require('./payment/platform-exchange-catalog');
const { createPlatformBalanceService } = require('./payment/platform-balance-service');
const { createPlatformExchangeService } = require('./payment/platform-exchange-service');
const { createIapHttpHandler } = require('./payment/http-api');
const { createGameHttpHandler } = require('./game-http');
const platformExchangeStore = require('./payment/platform-exchange-store');
const kwaiIdentityStore = require('./identity/kwai-identity-store');
const { createDeck, shuffle, sortCards, removeCards } = require('./cards');
const { analyzePlay, canBeat, isMultiplierPlay } = require('./rules');
const walletStore = require('./persistence/wallet-store');
const matchStore = require('./persistence/match-store');
const accountStore = require('./persistence/account-store');
const entitlementStore = require('./persistence/entitlement-store');
const catalog = require('./trade/catalog');
const { purchaseSku } = require('./trade/purchase');
const botStatsStore = require('./persistence/bot-stats-store');
const treasuryStore = require('./persistence/treasury-store');
const botSettlementStore = require('./persistence/bot-settlement-store');
const { createMatchmakingOrchestrator } = require('./matchmaking/orchestrator');
const { createJoinReservationStore } = require('./matchmaking/reservation');
const { buildObservation } = require('./game-ai/observation');
const { enumerateLegalActions } = require('./game-ai/legal-actions');
const { decideAction, STRATEGY_VERSION } = require('./game-ai/strategy');
const { createHandStrengthRuntimeFromEnv } = require('./game-ai/hand-strength/runtime');
const { createDecisionRouterFromEnv } = require('./game-ai/decision-router');
const { snapshotAction, applyGuardedPlayingAction } = require('./game-ai/action-guard');
const { ShadowMetrics } = require('./game-ai/shadow-metrics');
const { clampPercent, stablePercent, shouldLogDecision, formatDecisionLog } = require('./game-ai/decision-log');
const { resetPlayActionHistory, appendPlayAction } = require('./game-ai/play-history');
const { getPersona } = require('./game-ai/personas');
const {
  VOICE_CONFIG,
  VOICE_PACK_SKUS,
  VOICE_BY_ID,
  getVoiceConfigForCapabilities,
} = require('./game-ai/voice-config');

const voiceContentSkus = new Set(VOICE_PACK_SKUS);
const enabledVoiceContentSkus = new Set(VOICE_CONFIG.packs.map(pack => pack.sku));
for (const sku of VOICE_PACK_SKUS) {
  const item = catalog.get(sku);
  if (!item || item.type !== 'voice_pack') throw new Error(`voice_catalog_missing_sku:${sku}`);
}
for (const item of catalog.ITEMS) {
  if (item.type === 'voice_pack' && !voiceContentSkus.has(item.sku)) throw new Error(`voice_content_missing_sku:${item.sku}`);
}
const { thinkingDelayMs, scheduleGuardedAction, scheduleLockedActionRetry } = require('./bots/bot-scheduler');
const { createBot } = require('./bots/bot-factory');
const { getDb, initDb, closeDb, transaction, DIALECT } = require('./persistence/db');
const configCenter = require('./persistence/config-store');
const auth = require('./auth');

const decisionRouter = createDecisionRouterFromEnv();
const handStrengthRuntime = createHandStrengthRuntimeFromEnv();
const iapConfig = getIapConfig();
const platformBalanceService = createPlatformBalanceService();
// Mock 模式下（DDZ_MOCK_DIAMOND_BALANCE 已配置）：钻石余额在内存中按 accountId 追踪，
// 兑换时直接在 http-api.js handler 层扣减 + 写铁豆，跳过真实快手平台。
// 重启后余额重置为 DDZ_MOCK_DIAMOND_BALANCE 初始值。
const _mockExchangeClient = process.env.DDZ_MOCK_DIAMOND_BALANCE ? (() => {
  const _initBalance = BigInt(process.env.DDZ_MOCK_DIAMOND_BALANCE);
  const _balances = new Map(); // accountId → BigInt 余额
  function _get (accountId) {
    if (!_balances.has(accountId)) _balances.set(accountId, _initBalance);
    return _balances.get(accountId);
  }
  return {
    getBalance ({ accountId }) { return Promise.resolve({ chargeBalance: String(_get(accountId)), freeBalance: '0' }); },
    deduct (accountId, cost) {
      const cur = _get(accountId);
      if (cur < cost) return false;
      _balances.set(accountId, cur - cost);
      logger.info(`[mock-exchange] ${accountId} 扣除 ${cost} 钻石，剩余 ${cur - cost}`);
      return true;
    },
    credit (accountId, amount) {
      const cur = _get(accountId);
      _balances.set(accountId, cur + amount);
      logger.info(`[mock-buy] ${accountId} 充值 ${amount} 钻石，余额 ${cur + amount}`);
    },
    set (accountId, amount) {
      _balances.set(accountId, BigInt(amount));
      logger.info(`[mock-admin] ${accountId} 钻石余额设为 ${amount}`);
    },
  };
})() : null;
const platformExchangeService = createPlatformExchangeService({
  maxPayAttempts: iapConfig.platformImmediateAttempts,
  payPriority: iapConfig.platformPayPriority,
  fulfillmentPaused: iapConfig.fulfillmentPaused,
});
registerIapHttpHandler(createIapHttpHandler({
  getConfig: getIapConfig,
  iapCatalog,
  iapOrderService,
  exchangeCatalog,
  platformBalanceService,
  platformExchangeService,
  mockExchangeClient: _mockExchangeClient,
}));
const shadowMetrics = new ShadowMetrics({ logEvery: process.env.DDZ_DOUZERO_SHADOW_LOG_EVERY || 100 });
const BOT_DECISION_LOG_PERCENT = clampPercent(process.env.DDZ_DOUZERO_DECISION_LOG_PERCENT, 5);
const READY_FILE = String(process.env.DDZ_READY_FILE || '/tmp/ddz-ready');

const PORT = parseInt(process.env.PORT || '8080', 10);
// 行动超时时长已迁入配置中心（timeout.bid_ms / timeout.play_ms / timeout.double_ms），
// 运营可通过后台调整，热更下一局生效；环境变量不再覆盖。
// 当玩家尚未出过牌（没有打过对方的牌）时，需要跟牌的超时时间
const PLAY_RESPONSE_TIMEOUT_MS = parseInt(process.env.DDZ_PLAY_RESPONSE_TIMEOUT_MS || '5000', 10);
const MANAGED_ACTION_DELAY_MS = 1200;
const BOT_MATCH = {
  enabled: String(process.env.DDZ_BOT_MATCH_ENABLED || 'true').toLowerCase() === 'true',
  soloMinMs: parseInt(process.env.DDZ_BOT_SOLO_MIN_MS || '28000', 10),
  soloMaxMs: parseInt(process.env.DDZ_BOT_SOLO_MAX_MS || '36000', 10),
  duoMinMs: parseInt(process.env.DDZ_BOT_DUO_MIN_MS || '80000', 10),
  duoMaxMs: parseInt(process.env.DDZ_BOT_DUO_MAX_MS || '105000', 10),
  joinTicketTtlMs: parseInt(process.env.DDZ_BOT_JOIN_TICKET_TTL_MS || '60000', 10),
  maxRoundsPerRoom: parseInt(process.env.DDZ_BOT_MAX_ROUNDS_PER_ROOM || '3', 10),
  roomLifetimeMs: parseInt(process.env.DDZ_BOT_ROOM_LIFETIME_MS || '1800000', 10),
  treasuryMinReserve: parseInt(process.env.DDZ_BOT_TREASURY_MIN_RESERVE || '10000', 10),
};
const JOIN_TICKET_SECRET = auth.getSigningSecret();
const SECURITY = {
  maxMessageBytes: 4096,
  maxViolationsPerConnection: 5,
  connectionWindowMs: 10000,
  maxMessagesPerWindow: 80,
  maxObjectKeys: 16,
  maxCardIdsPerPlay: 20,
};
const COMMAND_RATE_LIMITS = {
  ping: { windowMs: 10000, max: 30 },
  auth: { windowMs: 60000, max: 10 },
  getWallet: { windowMs: 10000, max: 12 },
  claimShareReward: { windowMs: 60000, max: 3 },
  claimAdReward: { windowMs: 60000, max: 30 },
  getAdRewardStatus: { windowMs: 10000, max: 6 },
  getNewcomerGiftStatus: { windowMs: 10000, max: 6 },
  getProfileStats: { windowMs: 10000, max: 6 },
  claimNewcomerGift: { windowMs: 60000, max: 3 },
  claimShortcutReward: { windowMs: 60000, max: 3 },
  claimBankruptReward: { windowMs: 60000, max: 3 },
  quickMatch: { windowMs: 10000, max: 6 },
  cancelMatch: { windowMs: 10000, max: 10 },
  resumeMatch: { windowMs: 10000, max: 10 },
  createRoom: { windowMs: 60000, max: 5 },
  join: { windowMs: 10000, max: 10 },
  leaveRoom: { windowMs: 10000, max: 10 },
  setReady: { windowMs: 10000, max: 12 },
  bid: { windowMs: 10000, max: 8 },
  double: { windowMs: 10000, max: 6 },
  playCards: { windowMs: 10000, max: 12 },
  pass: { windowMs: 10000, max: 12 },
  syncHand: { windowMs: 10000, max: 6 },
  hint: { windowMs: 10000, max: 12 },
  voiceMsg: { windowMs: 10000, max: 6 },
  buySku: { windowMs: 60000, max: 5 },
  getEntitlements: { windowMs: 10000, max: 2 },
  getVoiceConfig: { windowMs: 10000, max: 5 },
  getIapCatalog: { windowMs: 10000, max: 5 },
  createIapOrder: { windowMs: 60000, max: 10 },
  reportIapClientResult: { windowMs: 10000, max: 10 },
  getIapOrder: { windowMs: 10000, max: 12 },
  getPendingIapOrders: { windowMs: 10000, max: 6 },
  getPlatformCoinBalance: { windowMs: 10000, max: 12 },
  getPlatformCoinExchangeCatalog: { windowMs: 10000, max: 5 },
  createPlatformCoinExchange: { windowMs: 60000, max: 10 },
  getPlatformCoinExchange: { windowMs: 10000, max: 12 },
};
const ALLOWED_MESSAGE_TYPES = new Set(Object.keys(COMMAND_RATE_LIMITS));
const IAP_MESSAGE_TYPES = new Set([
  'getIapCatalog', 'createIapOrder', 'reportIapClientResult', 'getIapOrder',
  'getPendingIapOrders', 'getPlatformCoinBalance', 'getPlatformCoinExchangeCatalog',
  'createPlatformCoinExchange', 'getPlatformCoinExchange',
]);
function commandRateLimitPolicy (type, scope) {
  if (scope === 'connection') return { soft: false, close: true, structuredIap: IAP_MESSAGE_TYPES.has(type) };
  if (IAP_MESSAGE_TYPES.has(type)) return { soft: true, close: false, structuredIap: true };
  return { soft: false, close: false, structuredIap: false };
}
const CORRELATION_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,63}$/;
const SUPPORTED_CLIENT_CAPABILITIES = new Set(['voice_config_v2', 'voice_trade_v1']);
const VOICE_CHAT = {
  enabled: String(process.env.DDZ_VOICE_CHAT_ENABLED || 'true').toLowerCase() === 'true',
  tradeEnabled: String(process.env.DDZ_VOICE_TRADE_ENABLED || 'true').toLowerCase() === 'true',
  cooldownMs: 3000,
  maxBufferedBytes: 256 * 1024,
};
// 数值配置中心：主控项入库（config_items）可后台修改，派生项推导只读。
// ECONOMY 改为实时代理 —— 所有 ECONOMY.xxx 读取走当前生效配置，
// 键位与默认值见 persistence/config-store.js 的 DEFAULT_MASTER。
// （含远端新增的逃跑 CD：economy.escape_cd_ms，热更可调）
const ECONOMY = configCenter.economyProxy();
const TIMEOUTS = configCenter.timeoutsProxy();

// ---- 游客账号能力边界 ----
// 游客身份可通过更换设备/清缓存低成本再生，若与快手正式账号同权，
// 高倍率场次会成为洗豆通道。新手铁豆维持 20000 不变（产品要求），
// 这里只限制「能进哪些场次」，把风险敞口收敛在初级场。
const GUEST_ALLOWED_ROOM_TYPES = new Set(['junior']);

function isGuestAccount (loginType) {
  return String(loginType || '') === 'guest';
}

function guestRoomTypeRejection (loginType, roomType) {
  if (!isGuestAccount(loginType)) return null;
  const type = normalizeRoomType(roomType || DEFAULT_ROOM_TYPE);
  if (GUEST_ALLOWED_ROOM_TYPES.has(type)) return null;
  return {
    code: 'GUEST_ROOM_FORBIDDEN',
    message: '游客身份仅可进入初级场，请使用快手登录后体验更高场次',
  };
}

const DEFAULT_ROOM_TYPE = 'junior';
const ROOM_TYPE_ALIASES = { classic: 'junior', senior: 'master' };
// 场次主控项已迁入配置中心（tier.<type>.* 键）；此处仅保留启动期默认值，
// 供编排器 roomTypes 列表与配置中心未就绪时兜底。
const DEFAULT_ROOM_TIERS = {
  // 数值口径（2026-09-17 设计表）：底注=主控；台费=底注×50%（entryFeeBeans，开局收）；
  // 冻结额/逃跑罚款=底注×冻结倍数（4/10/10，freezeEnabled 已启用）；验资门槛=冻结额×验资倍数（1.25/6.25/7.8）；
  // 倍数上限=主控；抽水=结算 taxRate 5% 统一。
  junior: { type: 'junior', name: '初级场', entryFeeBeans: 50, freezeBeans: 400, freezeEnabled: true, minBeansToMatch: 500, minBeansToStart: 500, minBeansToReady: 500, baseBet: 100, maxMultiplier: 32, taxRate: 0.05 },
  mid: { type: 'mid', name: '中级场', entryFeeBeans: 400, freezeBeans: 8000, freezeEnabled: true, minBeansToMatch: 50000, minBeansToStart: 50000, minBeansToReady: 50000, baseBet: 800, maxMultiplier: 200, taxRate: 0.05 },
  master: { type: 'master', name: '大师场', entryFeeBeans: 3200, freezeBeans: 64000, freezeEnabled: true, minBeansToMatch: 500000, minBeansToStart: 500000, minBeansToReady: 500000, baseBet: 6400, maxMultiplier: 1000, taxRate: 0.05 },
};

// ---- room storage ----
const rooms = new Map();  // roomId -> Room
const disconnectTimers = new Map(); // `${roomId}:${playerId}` -> Timeout

// ---- 快速匹配编排 ----
// 第一阶段为单 WebSocket 进程内的账户级唯一队列；多进程部署必须使用
// sticky shard 或集中式协调，禁止多个进程各自维护同一场次队列。
if (BOT_MATCH.enabled && JOIN_TICKET_SECRET.length < 16) {
  throw new Error('[BOT_MATCH] DDZ_AUTH_SECRET 必须至少 16 字符');
}
const joinReservations = createJoinReservationStore({
  secret: JOIN_TICKET_SECRET,
  ttlMs: BOT_MATCH.joinTicketTtlMs,
});
const matchOrchestrator = createMatchmakingOrchestrator({
  roomTypes: Object.keys(DEFAULT_ROOM_TIERS),
  config: {
    soloMinMs: BOT_MATCH.soloMinMs,
    soloMaxMs: BOT_MATCH.soloMaxMs,
    duoMinMs: BOT_MATCH.duoMinMs,
    duoMaxMs: BOT_MATCH.duoMaxMs,
    enabledBotRoomTypes: BOT_MATCH.enabled ? ['junior', 'mid'] : [],
    // 匹配资产区间（真人配对余额 ±30%）：默认关闭，DDZ_MATCH_ASSET_BAND_ENABLED=true 开启
    assetBandEnabled: String(process.env.DDZ_MATCH_ASSET_BAND_ENABLED || 'false').toLowerCase() === 'true',
  },
  onAssemble: assembleMatchedRoom,
  onError: (err, context) => logger.error(`[匹配] ${context.roomType} 组房失败:`, err),
});
const matchQueues = matchOrchestrator.queues;

function matchQueueSize () {
  return matchOrchestrator.totalSize();
}

function normalizeRoomType (roomType) {
  const raw = String(roomType || DEFAULT_ROOM_TYPE);
  return ROOM_TYPE_ALIASES[raw] || raw;
}

function getRoomTier (roomType) {
  return configCenter.getTier(normalizeRoomType(roomType)) || DEFAULT_ROOM_TIERS[normalizeRoomType(roomType)] || DEFAULT_ROOM_TIERS[DEFAULT_ROOM_TYPE];
}

function cloneRoomTier (tier) {
  return {
    type: tier.type,
    name: tier.name,
    entryFeeBeans: tier.entryFeeBeans,
    freezeBeans: tier.freezeBeans,
    freezeEnabled: !!tier.freezeEnabled,
    minBeansToMatch: tier.minBeansToMatch,
    minBeansToStart: tier.minBeansToStart,
    minBeansToReady: tier.minBeansToReady,
    baseBet: tier.baseBet,
    maxMultiplier: tier.maxMultiplier,
    taxRate: tier.taxRate || 0,
    botMaxMultiplier: tier.botMaxMultiplier,
    matchAssetRange: tier.matchAssetRange,
  };
}

function getRoomTierForRoom (room) {
  return room?.tierConfig || getRoomTier(room?.roomType || DEFAULT_ROOM_TYPE);
}

function serializeRoomTiers () {
  return Object.fromEntries(Object.entries(configCenter.getEffectiveSync().effective.tiers).map(([type, tier]) => [type, cloneRoomTier(tier)]));
}

function getMatchQueue (roomType) {
  return matchQueues[getRoomTier(roomType).type];
}

// ── 快手支付回调成功 → 推 socket 通知客户端 ──────────────────────
notifyEvents.on('iapConfirmed', ({ accountId, orderId, diamondsGranted }) => {
  const session = matchOrchestrator.sessions.getByAccount(accountId);
  const ws = session && session.ws;
  if (ws && ws.readyState === ws.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'iapConfirmed', data: { orderId, diamondsGranted } }));
      logger.info(`[notify] 推送 iapConfirmed → ${accountId} orderId=${orderId} diamonds=${diamondsGranted}`);
    } catch (e) {
      logger.warn('[notify] 推送 iapConfirmed 失败:', e.message);
    }
  } else {
    logger.info(`[notify] iapConfirmed: ${accountId} 不在线，跳过推送 orderId=${orderId}`);
  }
});

function isInAnyMatchQueue (accountOrWs) {
  if (typeof accountOrWs === 'string') return !!matchOrchestrator.sessions.getByAccount(accountOrWs);
  return matchOrchestrator.sessions.values().some(session => session.ws === accountOrWs);
}

function processMatchQueue (roomType) {
  return matchOrchestrator.process(getRoomTier(roomType).type);
}

function removeFromQueue (accountOrWs, matchRequestId = '') {
  const session = typeof accountOrWs === 'string'
    ? matchOrchestrator.sessions.getByAccount(accountOrWs)
    : matchOrchestrator.sessions.values().find(item => item.ws === accountOrWs);
  if (!session) return false;
  joinReservations.invalidateAccount(session.accountId);
  return matchOrchestrator.cancelByAccount(session.accountId, matchRequestId);
}

function botTreasuryAccountId (roomType) {
  return `system::bot_treasury::${getRoomTier(roomType).type}`;
}

function maximumBotExposure (tier) {
  const maxMultiplier = Math.max(1, Math.min(
    tier.maxMultiplier,
    Math.floor(botStatsStore.DEFAULT_MAX_POSITIVE_GAIN / Math.max(1, tier.baseBet * 2))
  ));
  return tier.baseBet * maxMultiplier * 2;
}

function addBotPlayer (room, bot) {
  const seat = room.seats.findIndex(value => value === null);
  if (seat < 0) throw new Error('bot_room_has_no_empty_seat');
  room.seats[seat] = bot.id;
  room.players[bot.id] = {
    ...bot,
    seat,
    ready: true,
    frozenBeans: 0,
    availableBeans: bot.beans,
    roundDelta: 0,
    totalDelta: 0,
    autoManagedReason: '',
    autoManagedAt: 0,
    autoManagedTurns: 0,
    exitPenaltyApplied: false,
    role: null,
    ws: null,
  };
  room.handCounts[bot.id] = 0;
}

async function assembleMatchedRoom ({ roomType, humans, botCount, mode }) {
  const tier = getRoomTier(roomType);
  const roomId = generateRoomId();
  const groupId = `matchgroup_${crypto.randomUUID()}`;
  const quotaReservationIds = {};
  let treasuryReservationId = null;
  const requiredExposure = maximumBotExposure(tier);

  try {
    if (botCount > 0) {
      for (const human of humans) {
        const quota = await botStatsStore.reserveBotQuota({
          matchRequestId: human.matchRequestId,
          accountId: human.accountId,
          statDate: todayKey(),
          requiredPositiveGain: requiredExposure,
        });
        if (!quota.ok) throw new Error(quota.reason || 'bot_quota_reserve_failed');
        quotaReservationIds[human.accountId] = quota.reservation.reservationId;
      }
      const treasury = await treasuryStore.reserveTreasuryExposure({
        matchRequestGroupId: groupId,
        roomId,
        roomType: tier.type,
        treasuryAccountId: botTreasuryAccountId(tier.type),
        requiredExposure,
        minReserve: BOT_MATCH.treasuryMinReserve,
      });
      if (!treasury.ok) throw new Error(treasury.reason || 'treasury_reserve_failed');
      treasuryReservationId = treasury.reservation.reservationId;
    }

    const room = createRoom(roomId, tier.type);
    room.isMatchmakingRoom = true;
    room.hasBots = botCount > 0;
    room.botMode = botCount > 0 ? mode : null;
    room.botCount = botCount;
    room.humanCount = humans.length;
    room.matchRequestGroupId = groupId;
    room.quotaReservationIds = quotaReservationIds;
    room.treasuryReservationId = treasuryReservationId;
    room.requiredBotExposure = botCount > 0 ? requiredExposure : 0;
    room.createdAt = Date.now();
    rooms.set(roomId, room);

    const usedNames = [];
    const usedAvatars = [];
    const excludedPersonaIds = [];
    for (let i = 0; i < botCount; i++) {
      const bot = createBot({
        minimumBeans: Math.max(tier.minBeansToReady, requiredExposure),
        usedNames,
        usedAvatars,
        excludedPersonaIds,
      });
      usedNames.push(bot.name);
      usedAvatars.push(bot.avatarUrl);
      excludedPersonaIds.push(bot.personaId);
      addBotPlayer(room, bot);
    }

    const reservationIds = {};
    let roomJoinDeadlineAt = 0;
    for (const human of humans) {
      const issued = joinReservations.issue({
        accountId: human.accountId,
        roomId,
        matchRequestId: human.matchRequestId,
      });
      reservationIds[human.accountId] = issued.reservationId;
      roomJoinDeadlineAt = Math.max(roomJoinDeadlineAt, issued.expiresAt);
      sendTo(human.ws, 'matchFound', {
        roomId,
        roomType: tier.type,
        roomName: tier.name,
        entryFeeBeans: tier.entryFeeBeans,
        matchRequestId: human.matchRequestId,
        joinTicket: issued.joinTicket,
        joinExpiresAt: issued.expiresAt,
      });
    }
    room.joinDeadlineAt = roomJoinDeadlineAt;
    logger.info(`[匹配] ${tier.name} ${humans.length}H+${botCount}B 组房成功，房间号 ${roomId}`);
    return { ok: true, roomId, reservationIds };
  } catch (err) {
    rooms.delete(roomId);
    if (treasuryReservationId) await treasuryStore.releaseTreasuryExposure(treasuryReservationId).catch(() => {});
    for (const reservationId of Object.values(quotaReservationIds)) {
      await botStatsStore.releaseBotQuota(reservationId).catch(() => {});
    }
    throw err;
  }
}

function generateRoomId () {
  // 生成 6 位数字房间号
  let id;
  do {
    id = String(Math.floor(100000 + Math.random() * 900000));
  } while (rooms.has(id));
  return id;
}

function getOrCreateRoom (roomId, roomType = DEFAULT_ROOM_TYPE) {
  if (!rooms.has(roomId)) rooms.set(roomId, createRoom(roomId, roomType));
  return rooms.get(roomId);
}

function createRoom (roomId, roomType = DEFAULT_ROOM_TYPE) {
  const tier = getRoomTier(roomType);
  return {
    id: roomId,
    instanceId: `room_${roomId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    roomType: tier.type,
    roomName: tier.name,
    tierConfig: cloneRoomTier(tier),
    // 配置快照语义：房间创建时的配置版本，一局内不随后台热更变化
    configVersion: configCenter.currentVersion(),
    entryFees: {},
    players: {},        // playerId -> { id, accountId, name, avatarUrl, seat, ready, beans, roundDelta, totalDelta, connected, role, ws }
    seats: [null, null, null],
    phase: 'waiting',   // waiting | ready | bidding | playing | settlement
    dealer: null,
    landlordCardsVisible: [],
    currentPlayerId: null,
    bidState: null,
    lastPlay: null,
    playActionHistory: [],
    playActionSeq: 0,
    handCounts: {},
    hands: {},           // playerId -> Card[]
    landlordCardsHidden: [],
    actionSeq: 0,
    actionLock: false,  // 见 withActionLock：防止 await 窗口内同一回合被重复行动
    actionDeadlineAt: 0,
    actionTimeoutMs: 0,
    actionTimer: null,
    autoActionSeq: 0,
    settlementContext: null,
    settlementRetryTimer: null,
    matchId: null,
    eventSeq: 0,
    lastWinnerIds: [],
    round: { number: 0, starterSeat: 0, passCount: 0, multiplier: 1, baseScore: 0, playCounts: {} },
    result: null,
    message: '等待三名玩家加入',
    botStrategyVersion: STRATEGY_VERSION,
    botDecisionMode: 'rule',
    handStrengthMode: 'lite',
    handEvaluatorVersion: 'hand-strength-lite',
    handPolicyVersion: 'bid-double-policy-lite',
    botMaxMultiplier: Math.max(1, Math.min(tier.maxMultiplier, Math.floor(botStatsStore.DEFAULT_MAX_POSITIVE_GAIN / Math.max(1, tier.baseBet * 2)))),
    lastActivityAt: Date.now(),   // 供 sweepRooms 判定空闲回收
  };
}

// ---- economy helpers ----
function todayKey () {
  return new Date().toISOString().slice(0, 10);
}

// 所有钱包操作的账号入参必须来自 auth 握手结果。
// 历史实现用 `accountId || 'guest_unknown'` 兜底，任何漏传都会静默落到
// 同一个公共账号上，既污染账本又掩盖调用方 bug，故改为显式校验。
function assertAccountId (accountId) {
  const id = String(accountId || '').trim();
  if (!id) throw new Error('钱包操作缺少 accountId，调用方必须先完成 auth 认证');
  return id;
}

async function getOrCreateWallet (accountId) {
  return await walletStore.getOrCreateWallet(assertAccountId(accountId), {
    initialBeans: ECONOMY.newUserBeans,
    todayKey: todayKey(),
  });
}

async function applyWalletDelta (accountId, amount, type, meta = {}) {
  const id = assertAccountId(accountId);
  const ret = await walletStore.applyWalletDelta(id, amount, type, {
    roomId: meta.roomId,
    roundNo: meta.roundNo,
    matchId: meta.matchId,
    idempotencyKey: meta.idempotencyKey,
    meta,
  });
  return ret;
}

async function claimDailyLoginIfNeeded (accountId) {
  const id = assertAccountId(accountId);
  await getOrCreateWallet(id);
  return await walletStore.claimDailyLoginIfNeeded(id, ECONOMY.dailyLoginBeans, todayKey());
}

async function claimShareRewardIfNeeded (accountId) {
  const id = assertAccountId(accountId);
  await getOrCreateWallet(id);
  return await walletStore.claimShareRewardIfNeeded(id, ECONOMY.shareRewardBeans, todayKey());
}

function adRewardAmountForCount (claimCount) {
  const tier = ECONOMY.adRewardTiers.find(item => claimCount >= item.from && claimCount <= item.to);
  return tier ? tier.amount : 0;
}

function nextAdRewardAmount (claimCount) {
  return adRewardAmountForCount((claimCount || 0) + 1);
}

function economyPayload () {
  return {
    version: ECONOMY.version,
    currencyName: ECONOMY.currencyName,
    exchangeRate: ECONOMY.exchangeRate,
    rewards: {
      newUserBeans: ECONOMY.newUserBeans,
      dailyLoginBeans: ECONOMY.dailyLoginBeans,
      shareRewardBeans: ECONOMY.shareRewardBeans,
      shortcutRewardBeans: ECONOMY.shortcutRewardBeans,
      bankruptRewardBeans: ECONOMY.bankruptRewardBeans,
      bankruptThresholdBeans: ECONOMY.bankruptThresholdBeans,
      bankruptRewardMaxPerDay: ECONOMY.bankruptRewardMaxPerDay,
      adRewardMaxPerDay: ECONOMY.adRewardMaxPerDay,
      adRewardDailyCapBeans: ECONOMY.adRewardDailyCapBeans,
      adRewardTiers: ECONOMY.adRewardTiers,
    },
    roomTiers: serializeRoomTiers(),
  };
}

// ---- 玩家成就统计（春天/炸弹/最高倍，真人玩家；总豆数走 wallets.total_earned）----
// 出牌时炸弹/火箭 +1（fire-and-forget，失败不影响出牌）
async function recordBombPlay (accountId) {
  if (!accountId) return;
  try {
    const db = getDb();
    const now = Date.now();
    await db.run(`INSERT INTO player_stats (account_id, spring_count, bomb_count, max_multiplier, updated_at)
            VALUES (?, 0, 1, 0, ?)
            ON DUPLICATE KEY UPDATE bomb_count = bomb_count + 1, updated_at = ?`,
      [accountId, now, now]);
  } catch (e) { /* 统计失败不影响业务 */ }
}
// 结算时更新成就统计：春天（只给真人赢家）/最高倍/总对局/总胜场/最高连胜
async function recordSettlementStats (winnerIds, allHumanAccounts, spring, multiplier) {
  try {
    const db = getDb();
    const now = Date.now();
    for (const item of allHumanAccounts) {
      const win = winnerIds.includes(item.playerId) ? 1 : 0;
      const springInc = (spring && win) ? 1 : 0;
      // 全部在 SQL 侧增量计算：连胜 = 赢则 +1、输则清零；最高连胜 = max(历史, 本局后连胜)
      // await：让 SQL 错误能被下方 catch 捕获（否则变成 unhandled rejection 静默丢失）
      await db.run(`INSERT INTO player_stats (account_id, spring_count, bomb_count, max_multiplier,
                                        total_games, total_wins, cur_streak, max_streak, updated_at)
              VALUES (?, ?, 0, ?, 1, ?, ?, ?, ?)
              ON DUPLICATE KEY UPDATE
                spring_count = spring_count + VALUES(spring_count),
                max_multiplier = GREATEST(max_multiplier, VALUES(max_multiplier)),
                total_games = total_games + 1,
                total_wins = total_wins + VALUES(total_wins),
                -- 注意列顺序：max_streak 必须在 cur_streak 之前 —— MySQL 的 UPDATE SET
                -- 从左到右顺序执行，放在 cur_streak 之后会读到已更新的新值（连胜多记 1）
                max_streak = GREATEST(max_streak,
                  CASE WHEN VALUES(total_wins) = 1 THEN cur_streak + 1 ELSE 0 END),
                cur_streak = CASE WHEN VALUES(total_wins) = 1 THEN cur_streak + 1 ELSE 0 END,
                updated_at = VALUES(updated_at)`,
        [item.accountId, springInc, multiplier, win, win, win, now]);
    }
  } catch (e) { /* ignore */ }
}

async function claimAdRewardIfAllowed (accountId, adTransId = '') {
  const id = assertAccountId(accountId);
  await getOrCreateWallet(id);
  return await walletStore.claimTieredDailyRewardIfAllowed(id, 'ad_reward', todayKey(), {
    maxClaimsPerDay: ECONOMY.adRewardMaxPerDay,
    dailyCapAmount: ECONOMY.adRewardDailyCapBeans,
    amountForCount: adRewardAmountForCount,
    ledgerType: 'ad_reward',
    idempotencyKey: adTransId ? `ad_reward:${id}:trans:${adTransId}` : '',
    meta: { source: 'rewarded_video', adTransId: adTransId || '' },
  });
}

async function claimShortcutRewardIfNeeded (accountId) {
  const id = assertAccountId(accountId);
  await getOrCreateWallet(id);
  return await walletStore.claimDailyRewardIfAllowed(id, 'shortcut_reward', ECONOMY.shortcutRewardBeans, ECONOMY.shortcutRewardLifetimeKey, {
    maxClaimsPerDay: 1,
    ledgerType: 'shortcut_reward',
    meta: { source: 'add_shortcut', lifetimeOnce: true },
  });
}

// 新手礼包：终身一次，客户端上线查状态、点领取后服务端权威发放
async function newcomerGiftStatus (accountId) {
  const id = assertAccountId(accountId);
  const status = await walletStore.getDailyRewardStatus(id, 'newcomer_gift', ECONOMY.newcomerGiftLifetimeKey);
  return { claimed: status.claimCount > 0, amount: ECONOMY.newcomerGiftBeans, claimCount: status.claimCount };
}

async function claimNewcomerGiftIfNeeded (accountId) {
  const id = assertAccountId(accountId);
  await getOrCreateWallet(id);
  return await walletStore.claimDailyRewardIfAllowed(id, 'newcomer_gift', ECONOMY.newcomerGiftBeans, ECONOMY.newcomerGiftLifetimeKey, {
    maxClaimsPerDay: 1,
    ledgerType: 'newcomer_gift',
    meta: { source: 'newcomer_popup', lifetimeOnce: true },
  });
}

async function claimBankruptRewardIfAllowed (accountId) {
  const id = assertAccountId(accountId);
  const wallet = await getOrCreateWallet(id);
  if (wallet.beans >= ECONOMY.bankruptThresholdBeans) {
    return { claimed: false, wallet, amount: 0, claimCount: 0, maxClaimsPerDay: ECONOMY.bankruptRewardMaxPerDay, notEligible: true };
  }
  return await walletStore.claimDailyRewardIfAllowed(id, 'bankrupt_relief', ECONOMY.bankruptRewardBeans, todayKey(), {
    maxClaimsPerDay: ECONOMY.bankruptRewardMaxPerDay,
    ledgerType: 'bankrupt_relief',
    meta: { source: 'settlement_relief', thresholdBeans: ECONOMY.bankruptThresholdBeans },
  });
}

async function sendRewardResult (ws, accountId, rewardType, reward, messages) {
  const claimedMessage = messages?.claimed || `奖励领取成功，获得 ${reward.amount} 铁豆`;
  const duplicateMessage = messages?.duplicate || '今日奖励已领取';
  await sendWalletTo(ws, accountId, {
    rewardType,
    claimed: reward.claimed,
    amount: reward.amount,
    claimCount: reward.claimCount || 0,
    maxClaimsPerDay: reward.maxClaimsPerDay || 1,
    totalAmount: reward.totalAmount || 0,
    dailyCapAmount: reward.dailyCapAmount || 0,
    nextRewardAmount: reward.nextRewardAmount || 0,
    message: reward.claimed ? claimedMessage : duplicateMessage,
  });
  sendTo(ws, 'notice', {
    message: reward.claimed ? claimedMessage : duplicateMessage,
    action: 'rewardClaimed',
    rewardType,
    value: reward.amount,
    claimed: reward.claimed,
  });
}

// ---- 身份可信边界 ----
// 身份完全由服务端 auth 握手决定，见 server/auth.js：
//   · 正式环境（DDZ_AUTH_MODE=strict）只认快手登录，游客一律拒绝；
//   · H5 / 测试环境允许游客，但 accountId = HMAC(密钥, deviceId)，
//     客户端无法凭空构造他人身份；
//   · 业务消息前必须完成 auth，否则直接 close(1008)。
//
// 历史问题（已修复，勿回退）：
//   1. 旧 accountIdFromData 会在缺省时凭 connId 造出 guest_unknown_xxx，
//      每建一次连接就诞生一个新账号并白送新手铁豆，等于无限刷号水龙头；
//   2. 旧实现直接采信客户端自报的 accountId/openId/guestId，
//      随手编一个 guest_h5_xxx 即可接管他人钱包。
// 因此：任何情况下都不得再从客户端消息体推导 accountId。

function byteLengthOfRawMessage (raw) {
  if (Buffer.isBuffer(raw)) return raw.length;
  if (Array.isArray(raw)) return raw.reduce((sum, part) => sum + byteLengthOfRawMessage(part), 0);
  return Buffer.byteLength(String(raw));
}

function sanitizeString (value, maxLen, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, maxLen);
}

function isUuid (value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function sanitizeRoomId (value) {
  const roomId = sanitizeString(value, 12, '');
  return /^\d{6}$/.test(roomId) ? roomId : '';
}

function sanitizeRoomType (value) {
  const roomType = normalizeRoomType(sanitizeString(value, 24, DEFAULT_ROOM_TYPE));
  return DEFAULT_ROOM_TIERS[roomType] ? roomType : DEFAULT_ROOM_TYPE;
}

function sanitizeAccountLikeId (value) {
  return sanitizeString(value, 64, '').replace(/[^a-zA-Z0-9_\-:.]/g, '').slice(0, 64);
}

function sanitizeCardIds (value) {
  if (!Array.isArray(value)) return [];
  const ids = [];
  const seen = new Set();
  for (const item of value) {
    const id = sanitizeString(item, 32, '');
    if (!id || seen.has(id)) continue;
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= SECURITY.maxCardIdsPerPlay) break;
  }
  return ids;
}

function sanitizeCapabilities (value) {
  if (!Array.isArray(value)) return new Set();
  const output = new Set();
  for (const item of value.slice(0, 16)) {
    const capability = sanitizeString(item, 32, '');
    if (/^[a-zA-Z0-9_-]+$/.test(capability) && SUPPORTED_CLIENT_CAPABILITIES.has(capability)) output.add(capability);
  }
  return output;
}

function canPlayerSendVoice (player) {
  return !!(player && player.connected && !player.autoManaged && !player.detachedFromSession);
}

function broadcastVoice (room, data) {
  touchRoom(room);
  const msg = JSON.stringify({ type: 'voiceMsg', data });
  for (const player of allPlayers(room)) {
    const socket = player.ws;
    if (!socket || socket.readyState !== 1) continue;
    if (Number(socket.bufferedAmount || 0) > VOICE_CHAT.maxBufferedBytes) continue;
    socket.send(msg);
  }
}

function isSkuPurchaseEnabled (sku) {
  const item = catalog.get(sku);
  if (!item || !item.saleEnabled) return false;
  if (item.type === 'voice_pack' && !enabledVoiceContentSkus.has(item.sku)) return false;
  return true;
}

function buildVoiceConfigForCapabilities (capabilities) {
  const base = getVoiceConfigForCapabilities(capabilities);
  if (Number(base.schemaVersion || 1) < 2) return base;
  return {
    ...base,
    packs: base.packs.map(pack => {
      const item = catalog.get(pack.sku);
      return {
        ...pack,
        priceBeans: item ? item.priceBeans : 0,
        promoLabel: item ? item.promoLabel : (pack.promoLabel || ''),
        saleEnabled: !!(isSkuPurchaseEnabled(pack.sku) && VOICE_CHAT.tradeEnabled),
      };
    }),
  };
}

function entitlementPayload (items, seq) {
  return {
    seq,
    items: items.map(item => ({
      sku: item.sku,
      source: item.source,
      grantedAt: item.grantedAt,
      expiresAt: item.expiresAt,
    })),
  };
}

function validateMessage (msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return { ok: false, reason: '消息必须是 JSON 对象' };
  }
  if (Object.keys(msg).length > SECURITY.maxObjectKeys) {
    return { ok: false, reason: '消息字段过多' };
  }
  const type = sanitizeString(msg.type, 32, '');
  if (!type || !ALLOWED_MESSAGE_TYPES.has(type)) {
    return { ok: false, reason: '未知协议类型' };
  }

  const data = { ...msg, type };
  if (IAP_MESSAGE_TYPES.has(type)) {
    const rawCorrelationId = typeof data.correlationId === 'string' ? data.correlationId : '';
    if (!CORRELATION_ID_RE.test(rawCorrelationId)) {
      return { ok: false, reason: 'correlationId 格式错误', code: 'INVALID_CORRELATION_ID', type, correlationId: '' };
    }
    data.correlationId = rawCorrelationId;
  }
  if ('nickname' in data) data.nickname = sanitizeString(data.nickname, 12, '');
  if ('playerName' in data) data.playerName = sanitizeString(data.playerName, 12, '');
  if ('avatarUrl' in data) data.avatarUrl = sanitizeString(data.avatarUrl, 256, '');
  if ('roomType' in data) data.roomType = sanitizeRoomType(data.roomType);
  // 注意：不再解析 accountId / openId / guestId。
  // 身份只能来自 auth 握手结果，采信客户端自报字段等于把钱包主键交给攻击者。
  delete data.accountId;
  delete data.openId;
  delete data.guestId;

  if (type === 'auth') {
    data.sessionToken = sanitizeString(data.sessionToken, 512, '');
    data.code = sanitizeString(data.code, 256, '');
    data.deviceId = auth.sanitizeDeviceId(data.deviceId);
    data.capabilities = Array.from(sanitizeCapabilities(data.capabilities));
    if (!data.sessionToken && !data.code && !data.deviceId) {
      return { ok: false, reason: '认证信息不完整' };
    }
  }

  if (type === 'quickMatch' || type === 'cancelMatch' || type === 'resumeMatch' || type === 'join') {
    if ('matchRequestId' in data) data.matchRequestId = sanitizeString(data.matchRequestId, 160, '').replace(/[^a-zA-Z0-9_-]/g, '');
  }
  if (type === 'join') {
    data.roomId = sanitizeRoomId(data.roomId);
    data.joinTicket = sanitizeString(data.joinTicket, 128, '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!data.roomId) return { ok: false, reason: '房间号格式错误' };
  }
  if (type === 'setReady') {
    if (typeof data.ready !== 'boolean') return { ok: false, reason: 'ready 必须是布尔值' };
  }
  if (type === 'bid') {
    // score: 0 = 不叫/不抢, 1 = 叫地主/抢地主
    const score = Number(data.score);
    if (!Number.isInteger(score) || score < 0 || score > 1) return { ok: false, reason: '叫地主只能是 0（不叫）或 1（叫地主/抢）' };
    data.score = score;
  }
  if (type === 'double') {
    // multiplier: 1 = 不加倍, 2 = 加倍, 4 = 超级加倍
    const multiplier = Number(data.multiplier);
    if (!Number.isInteger(multiplier) || ![1, 2, 4].includes(multiplier)) return { ok: false, reason: '加倍选项只能是 1/2/4' };
    data.multiplier = multiplier;
  }
  if (type === 'playCards') {
    data.cardIds = sanitizeCardIds(data.cardIds);
    if (data.cardIds.length === 0) return { ok: false, reason: '出牌列表不能为空' };
  }
  if (type === 'voiceMsg') {
    data.voiceId = sanitizeString(data.voiceId, 32, '').replace(/[^a-zA-Z0-9_-]/g, '');
    delete data.text;
    delete data.voiceUrl;
    if (!data.voiceId) return { ok: false, reason: '语音 ID 不能为空' };
  }
  if (type === 'buySku') {
    data.sku = sanitizeString(data.sku, 64, '');
    if (!data.sku || !/^[a-zA-Z0-9_:-]+$/.test(data.sku)) return { ok: false, reason: 'SKU 格式错误' };
    data.source = sanitizeString(data.source, 32, 'unknown');
    if (!new Set(['room_chat_panel', 'home_voice_store']).has(data.source)) data.source = 'unknown';
    data.requestId = sanitizeString(data.requestId, 64, '').replace(/[^a-zA-Z0-9_-]/g, '');
  }
  if (type === 'createIapOrder') {
    data.skuId = sanitizeString(data.skuId, 64, '');
    data.os = sanitizeString(data.os, 16, '').toLowerCase();
    data.requestId = sanitizeString(data.requestId, 64, '');
    if (!/^[a-zA-Z0-9_:-]+$/.test(data.skuId)) return { ok: false, reason: 'IAP SKU 格式错误' };
    if (!['android', 'ios'].includes(data.os)) return { ok: false, reason: '支付平台格式错误' };
    if (!isUuid(data.requestId)) return { ok: false, reason: 'requestId 必须是 UUID' };
  }
  if (type === 'reportIapClientResult') {
    data.orderId = sanitizeString(data.orderId, 64, '');
    data.code = sanitizeString(data.code, 32, '');
    data.message = sanitizeString(data.message, 255, '');
    if (!/^iap_[a-zA-Z0-9_-]+$/.test(data.orderId)) return { ok: false, reason: 'IAP 订单号格式错误' };
  }
  if (type === 'getIapOrder') {
    data.orderId = sanitizeString(data.orderId, 64, '');
    if (!/^iap_[a-zA-Z0-9_-]+$/.test(data.orderId)) return { ok: false, reason: 'IAP 订单号格式错误' };
  }
  if (type === 'createPlatformCoinExchange') {
    data.exchangeSkuId = sanitizeString(data.exchangeSkuId, 64, '');
    data.clientRequestId = sanitizeString(data.clientRequestId, 64, '');
    data.os = sanitizeString(data.os, 16, '').toLowerCase();
    if (!/^[a-zA-Z0-9_:-]+$/.test(data.exchangeSkuId)) return { ok: false, reason: '兑换 SKU 格式错误' };
    if (!isUuid(data.clientRequestId)) return { ok: false, reason: 'clientRequestId 必须是 UUID' };
    if (!['android', 'ios'].includes(data.os)) return { ok: false, reason: '支付平台格式错误' };
  }
  if (type === 'getPlatformCoinBalance') {
    data.os = sanitizeString(data.os, 16, '').toLowerCase();
    if (!['android', 'ios'].includes(data.os)) return { ok: false, reason: '支付平台格式错误' };
  }
  if (type === 'getPlatformCoinExchange') {
    data.exchangeOrderId = sanitizeString(data.exchangeOrderId, 64, '');
    if (!/^pex_[0-9a-f]{32}$/.test(data.exchangeOrderId)) return { ok: false, reason: '兑换订单号格式错误' };
  }

  return { ok: true, type, data };
}

function hitWindowRateLimit (bucket, key, limit, now = Date.now()) {
  let state = bucket.get(key);
  if (!state || now - state.windowStart >= limit.windowMs) {
    state = { windowStart: now, count: 0 };
    bucket.set(key, state);
  }
  state.count += 1;
  return state.count > limit.max;
}

// ---- 账号维度全局限流 ----
// 原限流桶是 per-connection 的：断线重连即得到全新配额，
// 因此「60s 内最多 3 次」这类限制可以通过反复重连绕过。
// 奖励类接口虽有 reward_claims 表兜住日上限，但 CPU/DB 层面的刷接口无防护。
// 这里按 accountId 维度做全局桶，跨连接生效。
const accountRateBuckets = new Map();   // accountId -> Map<type, state>
const ACCOUNT_RATE_LIMITED_TYPES = new Set([
  'getWallet', 'claimShareReward', 'claimAdReward', 'getAdRewardStatus',
  'getNewcomerGiftStatus', 'claimNewcomerGift', 'getProfileStats',
  'claimShortcutReward', 'claimBankruptReward',
  'quickMatch', 'cancelMatch', 'resumeMatch', 'createRoom', 'join', 'voiceMsg',
  'buySku', 'getEntitlements', 'getVoiceConfig',
  'getIapCatalog', 'createIapOrder', 'reportIapClientResult', 'getIapOrder',
  'getPendingIapOrders', 'getPlatformCoinBalance', 'getPlatformCoinExchangeCatalog',
  'createPlatformCoinExchange', 'getPlatformCoinExchange',
]);

function hitAccountRateLimit (accountId, type) {
  if (!accountId || !ACCOUNT_RATE_LIMITED_TYPES.has(type)) return false;
  const limit = COMMAND_RATE_LIMITS[type];
  if (!limit) return false;
  let bucket = accountRateBuckets.get(accountId);
  if (!bucket) {
    bucket = new Map();
    accountRateBuckets.set(accountId, bucket);
  }
  bucket.lastSeenAt = Date.now();
  return hitWindowRateLimit(bucket, type, limit);
}

// 清理长期无活动的账号桶，避免 Map 无界增长
function sweepAccountRateBuckets (idleMs = 600000, now = Date.now()) {
  let removed = 0;
  for (const [accountId, bucket] of accountRateBuckets) {
    const lastSeen = bucket.lastSeenAt || 0;
    if (now - lastSeen > idleMs) {
      accountRateBuckets.delete(accountId);
      removed += 1;
    }
  }
  return removed;
}

async function hasEnoughBeansToMatch (accountId, roomType) {
  const tier = getRoomTier(roomType);
  return (await getOrCreateWallet(accountId)).availableBeans >= Math.max(1, tier.minBeansToMatch || 1);
}

function hasPaidRoomEntryFee (room, accountId) {
  return !!(room.entryFees && room.entryFees[accountId] && room.entryFees[accountId].charged);
}

async function chargeEntryFeesForStart (room) {
  const tier = getRoomTierForRoom(room);
  const players = allPlayers(room);
  const nextRoundNo = (room.round?.number || 0) + 1;

  for (const p of players) {
    if (p.isBot) continue;
    const wallet = await getOrCreateWallet(p.accountId);
    p.beans = wallet.beans;
    p.frozenBeans = wallet.frozenBeans || 0;
    p.availableBeans = wallet.availableBeans;
    const paid = hasPaidRoomEntryFee(room, p.accountId);
    const required = paid ? Math.max(1, tier.minBeansToReady || 1) : Math.max(tier.entryFeeBeans || 0, tier.freezeBeans || 0, tier.minBeansToStart || 1);
    if (wallet.availableBeans < required) {
      return { ok: false, player: p, wallet, requiredBeans: required, roomType: tier.type, roomName: tier.name };
    }
  }

  const charged = [];
  const frozen = [];
  for (const p of players) {
    if (p.isBot) continue;
    if (hasPaidRoomEntryFee(room, p.accountId)) continue;
    const fee = Math.max(0, tier.entryFeeBeans || 0);
    if (fee <= 0) {
      room.entryFees[p.accountId] = { charged: true, amount: 0, roomType: tier.type, chargedAt: Date.now() };
      continue;
    }
    const ret = await applyWalletDelta(p.accountId, -fee, 'room_entry_fee', {
      roomId: room.id,
      roundNo: nextRoundNo,
      roomType: tier.type,
      roomName: tier.name,
      entryFeeBeans: fee,
      freezeBeans: tier.freezeBeans || 0,
      freezeEnabled: !!tier.freezeEnabled,
      roomInstanceId: room.instanceId,
      source: 'start_round',
      idempotencyKey: `room_entry_fee:${room.instanceId}:${p.accountId}`,
    });
    p.beans = ret.wallet.beans;
    p.frozenBeans = ret.wallet.frozenBeans || 0;
    p.availableBeans = ret.wallet.availableBeans;
    room.entryFees[p.accountId] = { charged: true, amount: -ret.actual, roomType: tier.type, roomName: tier.name, chargedAt: Date.now(), balanceAfter: ret.wallet.beans };
    charged.push({ playerId: p.id, accountId: p.accountId, amount: -ret.actual, balanceAfter: ret.wallet.beans });
  }

  for (const p of players) {
    if (p.isBot || room.hasBots) continue;
    if (room.entryFees[p.accountId]?.frozen && !room.entryFees[p.accountId]?.freezeReleased) continue;
    const freezeBeans = Math.max(0, tier.freezeBeans || 0);
    if (freezeBeans <= 0) {
      room.entryFees[p.accountId] = { ...(room.entryFees[p.accountId] || {}), frozen: true, freezeAmount: 0 };
      continue;
    }
    const ret = await walletStore.freezeWalletBeans(p.accountId, freezeBeans, {
      roomId: room.id,
      roundNo: nextRoundNo,
      matchId: room.matchId || null,
      idempotencyKey: `room_freeze:${room.instanceId}:${nextRoundNo}:${p.accountId}`,
      meta: { roomType: tier.type, roomName: tier.name, freezeBeans, source: 'start_round' },
    });
    if (ret.actual < freezeBeans) {
      return { ok: false, player: p, wallet: ret.wallet, requiredBeans: freezeBeans, roomType: tier.type, roomName: tier.name };
    }
    p.beans = ret.wallet.beans;
    p.frozenBeans = ret.wallet.frozenBeans || 0;
    p.availableBeans = ret.wallet.availableBeans;
    room.entryFees[p.accountId] = { ...(room.entryFees[p.accountId] || {}), frozen: true, freezeReleased: false, freezeAmount: ret.actual, freezeAt: Date.now() };
    frozen.push({ playerId: p.id, accountId: p.accountId, amount: ret.actual, frozenBeans: ret.wallet.frozenBeans, availableBeans: ret.wallet.availableBeans });
  }

  return { ok: true, charged, frozen, roomType: tier.type, roomName: tier.name, entryFeeBeans: tier.entryFeeBeans || 0, freezeBeans: tier.freezeBeans || 0 };
}

async function sendWalletTo (ws, accountId, extra = {}) {
  const wallet = await getOrCreateWallet(accountId);
  // 破产补助可领判定（服务端权威，随 wallet 推送）：
  // 余额低于门槛才查当日领取记录（免得每次推送多一次 DB 查询）；
  // 客户端主页点场次豆不足时按此弹补助，不依赖客户端内存态。
  let bankruptRelief = { claimable: false, amount: ECONOMY.bankruptRewardBeans };
  if (wallet.beans < ECONOMY.bankruptThresholdBeans) {
    const relief = await walletStore.getDailyRewardStatus(accountId, 'bankrupt_relief', todayKey());
    bankruptRelief = {
      claimable: Number(relief.claimCount || 0) < ECONOMY.bankruptRewardMaxPerDay,
      amount: ECONOMY.bankruptRewardBeans,
    };
  }
  wallet.bankruptRelief = bankruptRelief;
  sendTo(ws, 'wallet', {
    wallet,
    // 显式告知客户端当前账号类型与可进场次，
    // 避免 UI 先放行再被服务端拒绝造成体验割裂。
    accountType: extra.loginType || '',
    guestAllowedRoomTypes: Array.from(GUEST_ALLOWED_ROOM_TYPES),
    economy: economyPayload(),
    walletSource: 'server',
    economyVersion: ECONOMY.version,
    initialBeans: ECONOMY.newUserBeans,
    serverNow: Date.now(),
    ...extra,
  });
  // 钱包有变动（领奖/兑换/充值到账等）且玩家在房间内：
  // 同步房间内存豆数并广播 state，让局内所有人（含其他玩家）看到最新余额
  void syncRoomStateIfInRoom(accountId).catch(() => {});
}

// 到账后房间同步：找到该账号所在的进行中房间，sync 玩家豆数并广播 state
async function syncRoomStateIfInRoom (accountId) {
  for (const room of rooms.values()) {
    if (!room) continue;
    const p = Object.values(room.players || {})
      .find(x => x && !x.isBot && x.accountId === accountId);
    if (!p) continue;
    await syncPlayerBeans(room, p.id);
    broadcastAll(room, 'state');
    break;
  }
}

async function sendWalletsForRoom (room, extra = {}) {
  if (!room) return;
  for (const p of allPlayers(room)) {
    if (p.isBot) continue;
    await syncPlayerBeans(room, p.id);
    if (p.ws) {
      await sendWalletTo(p.ws, p.accountId, {
        roomId: room.id,
        roomType: room.roomType,
        roomName: room.roomName,
        ...extra,
      });
    }
  }
}

// 逃跑 CD 拦截：1 小时滚动窗口内禁止再次进场（quickMatch / createRoom / join）
async function rejectIfEscapeCd (ws, accountId) {
  const remainMs = await walletStore.getEscapeCdRemainingMs(accountId);
  if (remainMs <= 0) return false;
  sendTo(ws, 'error', {
    code: 'ESCAPE_CD',
    message: `逃跑后需冷却 ${Math.ceil(remainMs / 60000)} 分钟才能再次进场`,
    remainingMs: remainMs,
  });
  return true;
}

async function applyExitPenalty (room, playerId, reason) {
  const p = room.players[playerId];
  if (!p || p.isBot || room.hasBots) return { actual: 0, wallet: p && !p.isBot ? await getOrCreateWallet(p.accountId) : null };
  if (p.exitPenaltyApplied) return { actual: 0, wallet: await getOrCreateWallet(p.accountId) };
  const tier = getRoomTierForRoom(room);
  const penaltyBeans = Math.max(0, tier.freezeBeans || 0);
  const ret = await walletStore.consumeFrozenBeans(p.accountId, penaltyBeans, 'exit_penalty', {
    roomId: room.id,
    roundNo: room.round.number,
    matchId: room.matchId,
    idempotencyKey: `exit_penalty:${room.matchId || room.id}:${room.round.number}:${playerId}:${reason}`,
    meta: {
      reason,
      roomType: tier.type,
      roomName: tier.name,
      penaltyBeans,
    },
  });
  p.exitPenaltyApplied = true;
  // 逃跑 CD：扣冻结豆成功（真逃跑）后进入 1 小时滚动窗口，禁止再次进场
  if (penaltyBeans > 0) {
    try {
      await walletStore.setEscapeCdUntil(p.accountId, Date.now() + ECONOMY.escapeCdMs);
    } catch (err) {
      logger.error('[逃跑CD] 写入失败:', err.message);
    }
  }
  if (room.entryFees && room.entryFees[p.accountId]) {
    const remainFreeze = Math.max(0, room.entryFees[p.accountId].freezeAmount || 0);
    room.entryFees[p.accountId].freezeAmount = Math.max(0, remainFreeze + ret.actual);
    room.entryFees[p.accountId].penaltyConsumed = (room.entryFees[p.accountId].penaltyConsumed || 0) + (-ret.actual);
  }
  p.beans = ret.wallet.beans;
  p.frozenBeans = ret.wallet.frozenBeans || 0;
  p.availableBeans = ret.wallet.availableBeans;
  p.roundDelta = (p.roundDelta || 0) + ret.actual;
  p.totalDelta = (p.totalDelta || 0) + ret.actual;
  return { actual: -ret.actual, wallet: ret.wallet };
}

async function syncPlayerBeans (room, playerId) {
  const p = room.players[playerId];
  if (!p || p.isBot) return;
  const wallet = await getOrCreateWallet(p.accountId);
  p.beans = wallet.beans;
  p.frozenBeans = wallet.frozenBeans || 0;
  p.availableBeans = wallet.availableBeans;
}

async function syncAllPlayerBeans (room) {
  for (const p of allPlayers(room)) await syncPlayerBeans(room, p.id);
}

async function releaseRoomFreezesForSettlement (room) {
  if (!room || !room.entryFees) return [];
  const released = [];
  for (const p of allPlayers(room)) {
    if (p.isBot) continue;
    const entry = room.entryFees[p.accountId];
    if (!entry || entry.freezeReleased) continue;
    const amount = Math.max(0, entry.freezeAmount || 0);
    if (amount > 0) {
      const ret = await walletStore.unfreezeWalletBeans(p.accountId, amount, {
        roomId: room.id,
        roundNo: room.round?.number || 0,
        matchId: room.matchId || null,
        idempotencyKey: `room_unfreeze:${room.matchId || room.instanceId}:${room.round?.number || 0}:${p.accountId}`,
        meta: { roomType: room.roomType, roomName: room.roomName, source: 'settlement' },
      });
      p.beans = ret.wallet.beans;
      p.frozenBeans = ret.wallet.frozenBeans || 0;
      p.availableBeans = ret.wallet.availableBeans;
      released.push({ playerId: p.id, accountId: p.accountId, amount: ret.actual });
    }
    entry.freezeReleased = true;
    entry.frozen = false;
    entry.freezeAmount = 0;
  }
  return released;
}

// ---- helpers ----
function allPlayers (room) {
  return room.seats.map(id => (id ? room.players[id] : null)).filter(Boolean);
}

function playerCount (room) {
  return allPlayers(room).length;
}

function playerBlocksNewSession (player, accountId) {
  return !!(
    player &&
    !player.isBot &&
    player.accountId === accountId &&
    !player.detachedFromSession
  );
}

function isStaleBlockingPlayer (player) {
  if (!player || player.isBot || player.detachedFromSession) return false;
  // 已经进入托管/离线，或 socket 已关闭/缺失，说明用户不应再被该旧座位阻塞新匹配。
  return player.autoManaged || player.connected === false || !player.ws || player.ws.readyState !== 1;
}

function detachStalePlayerSeat (room, player, reason) {
  if (!room || !player || player.detachedFromSession) return false;
  player.detachedFromSession = true;
  player.connected = false;
  player.autoManaged = true;
  player.autoManagedReason = reason || 'stale_session_detached';
  player.autoManagedAt = player.autoManagedAt || Date.now();
  player.ws = null;
  clearDisconnectTimer(room, player.id);
  return true;
}

async function detachStaleAccountBlocks (accountId) {
  let detached = 0;
  for (const room of rooms.values()) {
    if (!room || !room.players) continue;
    for (const player of Object.values(room.players)) {
      if (!playerBlocksNewSession(player, accountId)) continue;
      if (!isStaleBlockingPlayer(player)) continue;
      if (detachStalePlayerSeat(room, player, 'stale_before_match')) {
        detached += 1;
        await matchStore.appendMatchEvent(room, 'detached_stale_session', {
          playerId: player.id,
          phase: room.phase,
          reason: 'stale_before_match',
        }, player).catch(() => {});
      }
    }
  }
  return detached;
}

function playerCanRecoverSeat (player, accountId) {
  return !!(
    player &&
    player.accountId === accountId &&
    !player.detachedFromSession &&
    (!player.connected || player.autoManaged)
  );
}

// 冷启动/新连接恢复：反查该账号当前是否在某个活跃房间里仍持有可恢复座位
// （断线或托管、且未主动离场）。命中则返回房间信息供 authOk 下发，
// 让客户端自动重新加入上次掉线的房间。
function findRecoverableRoomForAccount (accountId) {
  if (!accountId) return null;
  for (const room of rooms.values()) {
    if (!room || !room.players) continue;
    // 仅恢复进行中的对局（叫分/加倍/出牌）；结算或等待中的房间无需强制回房
    if (room.phase !== 'bidding' && room.phase !== 'doubling' && room.phase !== 'playing') continue;
    for (const p of Object.values(room.players)) {
      if (playerCanRecoverSeat(p, accountId)) {
        const tier = getRoomTierForRoom(room);
        return { roomId: room.id, roomType: tier.type };
      }
    }
  }
  return null;
}

function nextPlayerId (room, playerId) {
  const p = room.players[playerId];
  if (!p) return playerId;
  const ns = (p.seat + 1) % 3;
  return room.seats[ns] || playerId;
}

function disconnectKey (room, playerId) {
  return `${room.id}:${playerId}`;
}

function clearDisconnectTimer (room, playerId) {
  const key = disconnectKey(room, playerId);
  const timer = disconnectTimers.get(key);
  if (timer) clearTimeout(timer);
  disconnectTimers.delete(key);
}

async function markManagedPlayer (room, playerId, reason) {
  const p = room.players[playerId];
  if (!p) return;
  clearDisconnectTimer(room, playerId);
  p.connected = false;
  p.autoManaged = true;
  p.autoManagedReason = reason || 'unknown';
  p.autoManagedAt = Date.now();
  p.autoManagedTurns = p.autoManagedTurns || 0;
  p.ws = null;
  const penalty = await applyExitPenalty(room, playerId, reason);
  await matchStore.appendMatchEvent(room, 'managed', { playerId, reason, penalty: penalty.actual, phase: room.phase }, p);
  broadcastAll(room, 'notice', { message: `${p.name} 已进入托管，扣除 ${penalty.actual} 铁豆`, action: 'playerManaged', actorId: playerId, label: '托管' });
  if (room.phase === 'bidding' && room.bidState?.currentPlayerId === playerId) {
    await handleActionTimeout(room);
  } else if (room.phase === 'doubling' && room.doublingPlayerId === playerId) {
    await handleActionTimeout(room);
  } else if (room.phase === 'playing' && room.currentPlayerId === playerId) {
    await handleActionTimeout(room);
  } else {
    broadcastAll(room, 'state');
  }
}

function pickForcedLandlord (room) {
  const players = allPlayers(room);
  const bid = room.bidState || {};
  const starterId = bid.starterId || bid.currentPlayerId || room.seats[room.round.starterSeat] || players[0]?.id;
  const winnerSet = new Set((room.lastWinnerIds || []).filter(id => room.players[id]));
  if (winnerSet.size > 0 && starterId && room.players[starterId]) {
    const starterSeat = room.players[starterId].seat;
    for (let offset = 0; offset < 3; offset++) {
      const id = room.seats[(starterSeat + offset) % 3];
      if (id && winnerSet.has(id)) return id;
    }
  }
  return starterId || players[0]?.id;
}

// ---- 兜底巡检 ----
// rooms.delete 只在「最后一人 close / leaveRoom」时触发。异常路径（timer 泄漏、
// phase 卡在 settlement 后再无人操作、玩家对象已清空但房间残留）会永久占用内存，
// disconnectTimers 同样缺少全局清理。这里加周期巡检兜底回收。
const GC_INTERVAL_MS = parseInt(process.env.DDZ_GC_INTERVAL_MS || '60000', 10);
const ROOM_IDLE_TIMEOUT_MS = parseInt(process.env.DDZ_ROOM_IDLE_TIMEOUT_MS || '1800000', 10);

function touchRoom (room) {
  if (room) room.lastActivityAt = Date.now();
}

function sweepRooms (now = Date.now()) {
  const disposed = [];
  for (const [roomId, room] of rooms) {
    const players = allPlayers(room);
    const idleFor = now - (room.lastActivityAt || 0);

    // 1) 无人房间：直接回收
    // 2) 空座位但对象残留 / 长期无活动：同样回收
    const shouldDispose = players.length === 0 || idleFor > ROOM_IDLE_TIMEOUT_MS;
    if (!shouldDispose) continue;

    // 仍有在线连接的房间不回收，避免误杀长时间挂机但连接正常的房
    if (players.some(p => p.ws && p.ws.readyState === 1)) continue;

    clearActionTimer(room);
    for (const p of players) clearDisconnectTimer(room, p.id);
    rooms.delete(roomId);
    disposed.push(roomId);
  }

  // 清理孤儿断线定时器（房间已不存在）
  let orphanTimers = 0;
  for (const [key, timer] of disconnectTimers) {
    const roomId = key.split(':')[0];
    if (!rooms.has(roomId)) {
      clearTimeout(timer);
      disconnectTimers.delete(key);
      orphanTimers += 1;
    }
  }

  const staleBuckets = sweepAccountRateBuckets(600000, now);
  if (disposed.length || orphanTimers || staleBuckets) {
    logger.info(`[GC] 回收房间 ${disposed.length} 个${disposed.length ? `(${disposed.join(',')})` : ''}，孤儿定时器 ${orphanTimers} 个，限流桶 ${staleBuckets} 个，剩余房间 ${rooms.size}`);
  }
  return { disposedRooms: disposed, orphanTimers, staleBuckets };
}

const gcTimer = setInterval(() => {
  try { sweepRooms(); } catch (err) { logger.error('[GC] 巡检失败:', err); }
}, GC_INTERVAL_MS);
gcTimer.unref?.();

const matchScanTimer = setInterval(() => {
  for (const roomType of Object.keys(DEFAULT_ROOM_TIERS)) {
    processMatchQueue(roomType).catch(err => logger.error(`[匹配] ${roomType} 定时扫描失败:`, err));
  }
  joinReservations.sweep();
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.isMatchmakingRoom || room.disposed || room.phase !== 'waiting') continue;
    if (!room.joinDeadlineAt || room.joinDeadlineAt > now) continue;
    for (const human of allPlayers(room).filter(player => !player.isBot && player.ws)) {
      sendTo(human.ws, 'matchExpired', { roomId: room.id });
    }
    disposeRoom(room, 'join_timeout').catch(err => logger.error('[匹配] 过期房间回收失败:', err));
  }
}, 500);
matchScanTimer.unref?.();

function broadcastAll (room, type, data) {
  touchRoom(room);
  for (const p of allPlayers(room)) {
    if (!p.ws || p.ws.readyState !== 1) continue;
    const payload = type === 'state' ? buildStatePayload(room, p.id) : data;
    try {
      p.ws.send(JSON.stringify({ type, data: payload }));
    } catch (err) {
      logger.warn(`[发送] 广播失败 type=${type} reason=${String(err?.code || err?.name || 'unknown').slice(0, 48)}`);
    }
  }
}

function sendTo (ws, type, data) {
  if (ws && ws.readyState === 1) {
    try {
      ws.send(JSON.stringify({ type, data }));
    } catch (err) {
      logger.warn(`[发送] 单播失败 type=${type} reason=${String(err?.code || err?.name || 'unknown').slice(0, 48)}`);
    }
  } else if (ws) {
    logger.warn(`[sendTo] 跳过发送 type=${type}，ws.readyState=${ws.readyState}（非 OPEN）`);
  }
}

// 对外下发的玩家字段白名单。
// 严禁直接下发 room.players：其上挂着 ws（活的 WebSocket 实例），
// JSON.stringify 会把 _socket/headers/host 等内部结构一并序列化，
// 实测 3 人房 state 从 310B 膨胀到 13.8KB（44x），且会把对端 IP、请求头广播给同房其他玩家。
// accountId 属于账号维度隐私，客户端只需要自己的（由 wallet/joined 回包单独给），故不下发。
const PUBLIC_PLAYER_FIELDS = [
  'id', 'name', 'avatarUrl', 'seat', 'ready', 'role',
  'beans', 'frozenBeans', 'availableBeans',
  'roundDelta', 'totalDelta',
  'connected', 'autoManaged',
];

function toPublicPlayer (player) {
  if (!player) return null;
  const out = {};
  for (const key of PUBLIC_PLAYER_FIELDS) {
    if (player[key] !== undefined) out[key] = player[key];
  }
  return out;
}

function serializePublicPlayers (players) {
  const out = {};
  for (const [id, player] of Object.entries(players || {})) {
    const publicPlayer = toPublicPlayer(player);
    if (publicPlayer) out[id] = publicPlayer;
  }
  return out;
}

function buildStatePayload (room, viewerPlayerId = null) {
  const tier = getRoomTierForRoom(room);
  const actorId = currentActionPlayerId(room);
  const shouldMaskFastPlayTimer =
    room.phase === 'playing' &&
    actorId &&
    viewerPlayerId &&
    viewerPlayerId !== actorId &&
    room.actionTimeoutMs === PLAY_RESPONSE_TIMEOUT_MS &&
    room.actionPublicTimeoutMs === TIMEOUTS.play;
  const actionDeadlineAt = shouldMaskFastPlayTimer
    ? (room.actionStartedAt || Date.now()) + TIMEOUTS.play
    : (room.actionDeadlineAt || 0);
  const actionTimeoutMs = shouldMaskFastPlayTimer
    ? TIMEOUTS.play
    : (room.actionTimeoutMs || 0);
  return {
    roomType: tier.type,
    roomName: tier.name,
    tierConfig: cloneRoomTier(tier),
    phase: room.phase,
    players: serializePublicPlayers(room.players),
    seats: room.seats,
    dealer: room.dealer,
    landlordCardsVisible: room.landlordCardsVisible,
    currentPlayerId: room.currentPlayerId,
    doublingPlayerId: room.doublingPlayerId || null,
    bidState: room.bidState,
    lastPlay: room.lastPlay,
    handCounts: room.handCounts,
    round: room.round,
    result: room.result,
    message: room.message,
    economy: {
      ...economyPayload(),
      minBeansToEnterRoom: ECONOMY.minBeansToEnterRoom,
      minBeansToReady: ECONOMY.minBeansToReady,
      shareRewardBeans: ECONOMY.shareRewardBeans,
      exitPenaltyBeans: tier.freezeBeans || 0,
      baseBet: tier.baseBet,
      maxMultiplier: tier.maxMultiplier,
      taxRate: tier.taxRate || 0,
      adRewardBeans: nextAdRewardAmount(0),
      adRewardMaxPerDay: ECONOMY.adRewardMaxPerDay,
      shortcutRewardBeans: ECONOMY.shortcutRewardBeans,
    },
    actionDeadlineAt,
    actionTimeoutMs,
    actionActorId: actorId || null,
    serverNow: Date.now(),
  };
}

// ---- action timeout helpers ----
function clearActionTimer (room) {
  if (room.actionTimer) {
    clearTimeout(room.actionTimer);
    room.actionTimer = null;
  }
  if (room.botWatchdog) {
    clearTimeout(room.botWatchdog);
    room.botWatchdog = null;
  }
  room.actionStartedAt = 0;
  room.actionDeadlineAt = 0;
  room.actionTimeoutMs = 0;
  room.actionPublicTimeoutMs = 0;
}

function hasAnyBeatAction (room, playerId) {
  if (!room || !playerId || room.phase !== 'playing') return true;
  if (!room.lastPlay || room.lastPlay.playerId === playerId) return true;
  try {
    const observation = buildObservation(room, playerId);
    return enumerateLegalActions(observation).some(action => action.type === 'playCards');
  } catch (err) {
    logger.warn(`[倒计时] 判断可压牌失败，按正常出牌时间处理: ${err.message}`);
    return true;
  }
}

function startActionTimer (room) {
  clearActionTimer(room);
  if (!(room.phase === 'bidding' || room.phase === 'playing' || room.phase === 'doubling')) return;

  const actorId = currentActionPlayerId(room);
  const actor = actorId ? room.players[actorId] : null;

  let normalTimeoutMs;
  if (room.phase === 'doubling') {
    normalTimeoutMs = TIMEOUTS.double;
  } else if (room.phase === 'bidding') {
    normalTimeoutMs = TIMEOUTS.bid;
  } else {
    // playing 阶段：只有「需要跟牌且手牌里没有任何能大过对方的牌」时，倒计时改为 5 秒；
    // 其他情况（主动出牌、能压过上家、炸弹/火箭可压等）均保持正常 30 秒。
    const needsResponse = room.lastPlay && room.lastPlay.playerId !== actorId;
    if (needsResponse && !hasAnyBeatAction(room, actorId)) {
      normalTimeoutMs = PLAY_RESPONSE_TIMEOUT_MS;
    } else {
      normalTimeoutMs = TIMEOUTS.play;
    }
  }

  room.actionTimeoutMs = actor?.autoManaged ? MANAGED_ACTION_DELAY_MS : normalTimeoutMs;
  room.actionStartedAt = Date.now();
  room.actionDeadlineAt = room.actionStartedAt + room.actionTimeoutMs;
  room.actionPublicTimeoutMs = room.phase === 'playing' ? TIMEOUTS.play : normalTimeoutMs;
  const seq = ++room.autoActionSeq;
  if (actor?.isBot) {
    room.actionTimeoutMs = normalTimeoutMs;
    room.actionStartedAt = Date.now();
    room.actionDeadlineAt = room.actionStartedAt + normalTimeoutMs;
    room.actionPublicTimeoutMs = room.phase === 'playing' ? TIMEOUTS.play : normalTimeoutMs;
    const phase = room.phase;
    room.botWatchdog = setTimeout(() => {
      if (seq !== room.autoActionSeq || currentActionPlayerId(room) !== actorId) return;
      handleActionTimeout(room).catch(err => logger.error('[机器人] watchdog 行动失败:', err));
    }, normalTimeoutMs + 1500);
    void prepareAndScheduleBotAction(room, actorId, seq, phase).catch(() => {
      if (room.disposed || room.autoActionSeq !== seq || room.phase !== phase || currentActionPlayerId(room) !== actorId) return;
      const action = emergencyBotAction(room, actorId, phase, 'decision_error');
      if (!action) return;
      room.actionTimer = scheduleGuardedAction({
        room,
        playerId: actorId,
        seq,
        phase,
        delayMs: 0,
        execute: () => executeAutomaticAction(room, actorId, action, 'bot', { seq, phase }),
      });
    });
    return;
  }
  room.actionTimer = setTimeout(() => {
    if (seq !== room.autoActionSeq) return;
    handleActionTimeout(room).catch(err => logger.error('[托管] 自动行动失败:', err));
  }, room.actionTimeoutMs + 200);
}

async function prepareAndScheduleBotAction (room, actorId, seq, phase) {
  const startedAt = Date.now();
  const actor = room.players[actorId];
  if (!actor) return;
  let observation;
  let action;
  let ruleAction;
  try {
    observation = buildObservation(room, actorId);
    const profileId = room.botMode === 'solo' ? 'bot_solo_fill' : 'bot_duo_fill';
    const strategyOptions = {
      personaId: actor.personaId,
      profileId,
      handEvaluatorVersion: room.handEvaluatorVersion,
      handPolicyVersion: room.handPolicyVersion,
    };
    ruleAction = snapshotAction(decideAction(observation, strategyOptions));
    action = snapshotAction(await decisionRouter.resolve(observation, {
      mode: room.botDecisionMode || 'rule',
      decisionId: `${room.instanceId}:${room.round?.number || 0}:${seq}`,
      deadlineAt: room.actionDeadlineAt,
      ruleAction,
      strategyOptions,
      onShadowResult: result => shadowMetrics.record(result),
    }));
  } catch (_) {
    action = emergencyBotAction(room, actorId, phase, 'decision_error', Date.now() - startedAt);
  }
  if (!action || room.disposed || room.autoActionSeq !== seq || room.phase !== phase || currentActionPlayerId(room) !== actorId) return;

  let targetDelayMs = 0;
  if (observation && action.meta?.fallbackReason !== 'decision_error') {
    targetDelayMs = thinkingDelayMs(observation, action, getPersona(actor.personaId));
  }
  const elapsedMs = Date.now() - startedAt;
  const deadlineBudgetMs = Math.max(0, room.actionDeadlineAt - Date.now() - 500);
  const delayMs = Math.min(Math.max(0, targetDelayMs - elapsedMs), deadlineBudgetMs);
  room.actionTimer = scheduleGuardedAction({
    room,
    playerId: actorId,
    seq,
    phase,
    delayMs,
    execute: () => executeAutomaticAction(room, actorId, action, 'bot', { seq, phase, ruleAction }),
  });
}

function fallbackDecisionMeta (room, reason, totalDecisionMs = 0) {
  const mode = room.botDecisionMode || 'rule';
  return {
    requestedEngine: mode === 'active' ? 'douzero' : mode === 'shadow' ? 'douzero_shadow' : 'rule',
    selectedEngine: 'rule',
    fallbackReason: reason,
    fallbackApplied: true,
    totalDecisionMs: Math.max(0, Number(totalDecisionMs || 0)),
    strategyVersion: STRATEGY_VERSION,
  };
}

function emergencyBotAction (room, playerId, phase, reason, totalDecisionMs = 0) {
  const meta = fallbackDecisionMeta(room, reason, totalDecisionMs);
  if (phase === 'bidding') return { type: 'bid', score: 0, cardIds: [], meta };
  if (phase === 'doubling') return { type: 'double', multiplier: 1, score: 0, cardIds: [], meta };
  if (phase !== 'playing') return null;
  const cardIds = findAutoPlayCardIds(room, playerId);
  if (cardIds.length) return { type: 'playCards', score: 0, cardIds, meta };
  if (room.lastPlay && room.lastPlay.playerId !== playerId) return { type: 'pass', score: 0, cardIds: [], meta };
  return null;
}

function currentActionPlayerId (room) {
  if (room.phase === 'bidding') return room.bidState?.currentPlayerId || null;
  if (room.phase === 'playing') return room.currentPlayerId || null;
  if (room.phase === 'doubling') return room.doublingPlayerId || null;
  return null;
}

async function executeAutomaticAction (room, playerId, action, controllerType, guard = null) {
  if (!action || currentActionPlayerId(room) !== playerId) return false;
  const player = room.players[playerId];
  if (!player) return false;
  if (action.type === 'playCards' || action.type === 'pass') {
    try {
      return await withActionLock(room, () => applyGuardedPlayingAction({
        room,
        playerId,
        selectedAction: action,
        ruleAction: guard?.ruleAction || null,
        guard,
        apply: finalAction => finalAction.type === 'playCards'
          ? applyPlayCardsUnlocked(room, playerId, finalAction.cardIds || [], true, finalAction.meta || {})
          : applyPassUnlocked(room, playerId, true, finalAction.meta || {}),
      }));
    } catch (err) {
      logger.error(`[机器人] 自动动作失败 reason=${String(err?.code || err?.name || 'unknown').slice(0, 48)}`);
      return false;
    }
  }
  await matchStore.appendMatchEvent(room, 'automatic_decision', {
    playerId,
    controllerType,
    actionType: action.type,
    score: action.score || 0,
    cardIds: action.cardIds || [],
    meta: action.meta || {},
  }, player);
  if (action.type === 'bid') return applyBid(room, playerId, action.score || 0, true);
  if (action.type === 'double') return applyDouble(room, playerId, action.multiplier || 1, true);
  return false;
}

async function handleActionTimeout (room) {
  // 正在落库的动作不能并发执行第二次，但其 Promise 也可能稍后失败。
  // 短轮询保留原代际；动作成功会 clearActionTimer，失败释放锁后由下一次检查接管。
  if (room.actionLock) {
    const playerId = currentActionPlayerId(room);
    const phase = room.phase;
    const seq = room.autoActionSeq;
    if (!playerId) return;
    const timer = scheduleLockedActionRetry({
      room,
      playerId,
      seq,
      phase,
      delayMs: 250,
      execute: () => handleActionTimeout(room),
    });
    if (room.players[playerId]?.isBot) room.botWatchdog = timer;
    else room.actionTimer = timer;
    return;
  }

  if (room.phase === 'doubling' && room.doublingPlayerId) {
    const pid = room.doublingPlayerId;
    const p = room.players[pid];
    broadcastAll(room, 'notice', { message: `${p?.name || '玩家'} 超时不加倍`, action: 'actionTimeout', actorId: pid, label: '不加倍' });
    await applyDouble(room, pid, 1, true);
    return;
  }

  if (room.phase === 'bidding' && room.bidState?.currentPlayerId) {
    const pid = room.bidState.currentPlayerId;
    const p = room.players[pid];
    if (p?.autoManaged) p.autoManagedTurns = (p.autoManagedTurns || 0) + 1;
    const name = p?.name || '玩家';
    const bidPhase = room.bidState?.phase || 'calling';
    const label = p?.autoManaged
      ? (bidPhase === 'calling' ? '托管不叫' : '托管不抢')
      : (bidPhase === 'calling' ? '超时不叫' : '超时不抢');
    broadcastAll(room, 'notice', { message: `${name} ${label}`, action: 'actionTimeout', actorId: pid, label });
    await applyBid(room, pid, 0, true);
    return;
  }

  if (room.phase === 'playing' && room.currentPlayerId) {
    const pid = room.currentPlayerId;
    const name = room.players[pid]?.name || '玩家';
    const p = room.players[pid];
    if (p?.autoManaged) p.autoManagedTurns = (p.autoManagedTurns || 0) + 1;

    // 真实玩家超时/托管：与机器人一样走 DouZero（active 模式），规则 AI 兜底
    const seq = room.autoActionSeq;
    const phase = room.phase;
    let timeoutAction = null;
    if (!p?.isBot) {
      try {
        const obs = buildObservation(room, pid);
        const ruleAct = snapshotAction(decideAction(obs, {}));
        timeoutAction = snapshotAction(await decisionRouter.resolve(obs, {
          mode: room.botDecisionMode || 'active',
          decisionId: `timeout:${room.instanceId}:${Date.now()}`,
          deadlineAt: Date.now() + 600,
          ruleAction: ruleAct,
        }));
      } catch (_) { /* 降级到规则兜底 */ }
      // guard: 决策期间状态可能已变化
      if (room.disposed || room.autoActionSeq !== seq || room.phase !== phase || room.currentPlayerId !== pid) return;
    }

    // 使用 DouZero 决策结果，或回落到纯规则兜底
    let cardIds;
    if (timeoutAction?.type === 'playCards' && (timeoutAction.cardIds || []).length > 0) {
      cardIds = timeoutAction.cardIds;
    } else if (timeoutAction?.type === 'pass') {
      cardIds = [];
    } else {
      cardIds = findAutoPlayCardIds(room, pid);
    }

    const meta = p?.isBot ? fallbackDecisionMeta(room, 'bot_watchdog') : (timeoutAction?.meta || null);

    if (cardIds.length > 0) {
      const label = p?.autoManaged ? '托管出牌' : '超时出牌';
      broadcastAll(room, 'notice', { message: `${name} ${label}`, action: 'actionTimeout', actorId: pid, label });
      await applyPlayCards(room, pid, cardIds, true, meta);
      return;
    }

    if (room.lastPlay && room.lastPlay.playerId !== pid) {
      const label = p?.autoManaged ? '托管不出' : '超时不出';
      broadcastAll(room, 'notice', { message: `${name} ${label}`, action: 'actionTimeout', actorId: pid, label });
      await applyPass(room, pid, true, meta);
    }
  }
}

function findAutoPlayCardIds (room, playerId) {
  const hand = sortCards(room.hands[playerId] || []);
  if (hand.length === 0) return [];
  const lastPlay = room.lastPlay;
  if (lastPlay && lastPlay.playerId !== playerId) {
    return findBeatCardIds(hand, lastPlay.analysis || null, room, playerId);
  }
  return findLeadCardIds(hand, room, playerId);
}

function findLeadCardIds (hand, room = null, playerId = null) {
  const allPlay = analyzePlay(hand);
  if (allPlay) return hand.map(card => card.id);

  const groups = groupCardsByRank(hand);
  const straight = findBestStraight(groups, 5, 1, 0);
  if (straight.length > 0) return straight.map(card => card.id);

  const pairStraight = findBestStraight(groups, 3, 2, 0);
  if (pairStraight.length > 0) return pairStraight.map(card => card.id);

  const airplanePairs = findAirplane(groups, 0, 0, 2);
  if (airplanePairs.length > 0) return airplanePairs.map(card => card.id);

  const airplaneSingles = findAirplane(groups, 0, 0, 1);
  if (airplaneSingles.length > 0) return airplaneSingles.map(card => card.id);

  const airplane = findAirplane(groups, 0, 0, 0);
  if (airplane.length > 0) return airplane.map(card => card.id);

  const tripleWithPair = findTripleWith(groups, 0, 2);
  if (tripleWithPair.length > 0) return tripleWithPair.map(card => card.id);

  const tripleWithSingle = findTripleWith(groups, 0, 1);
  if (tripleWithSingle.length > 0) return tripleWithSingle.map(card => card.id);

  const triple = pickNOfKind(groups, 3, 0, { avoidBomb: true });
  if (triple.length > 0) return triple.map(card => card.id);

  const pair = pickNOfKind(groups, 2, 0, { avoidBomb: true });
  if (pair.length > 0) return pair.map(card => card.id);

  const fourTwoPairs = findFourWith(groups, 0, 2);
  if (fourTwoPairs.length > 0) return fourTwoPairs.map(card => card.id);

  const fourTwoSingles = findFourWith(groups, 0, 1);
  if (fourTwoSingles.length > 0) return fourTwoSingles.map(card => card.id);

  const single = pickSingle(groups, 0, { preferSolo: true, avoidBomb: true, preferHigh: shouldLeadHighSingle(room, playerId) });
  if (single.length > 0) return single.map(card => card.id);

  const fallback = pickSingle(groups, 0, { preferSolo: false, avoidBomb: false, preferHigh: shouldLeadHighSingle(room, playerId) });
  return fallback.map(card => card.id);
}

function findBeatCardIds (hand, previous, room, playerId) {
  if (!previous) return findLeadCardIds(hand, room, playerId);
  if (shouldProtectTeammate(room, playerId, hand)) return [];

  const groups = groupCardsByRank(hand);
  let picked = [];

  if (previous.type === 'single') picked = pickSingle(groups, previous.rank, { preferSolo: true, avoidBomb: true, preferHigh: false });
  else if (previous.type === 'pair') picked = pickNOfKind(groups, 2, previous.rank, { avoidBomb: true });
  else if (previous.type === 'triple') picked = pickNOfKind(groups, 3, previous.rank, { avoidBomb: true });
  else if (previous.type === 'triple-single') picked = findTripleWith(groups, previous.rank, 1);
  else if (previous.type === 'triple-pair') picked = findTripleWith(groups, previous.rank, 2);
  else if (previous.type === 'straight') picked = findBestStraight(groups, previous.chainLength || previous.length, 1, previous.rank);
  else if (previous.type === 'pair-straight') picked = findBestStraight(groups, previous.chainLength || (previous.length / 2), 2, previous.rank);
  else if (previous.type === 'airplane') picked = findAirplane(groups, previous.rank, previous.chainLength || 2, 0);
  else if (previous.type === 'airplane-singles') picked = findAirplane(groups, previous.rank, previous.chainLength || 2, 1);
  else if (previous.type === 'airplane-pairs') picked = findAirplane(groups, previous.rank, previous.chainLength || 2, 2);
  else if (previous.type === 'four-two-singles') picked = findFourWith(groups, previous.rank, 1);
  else if (previous.type === 'four-two-pairs') picked = findFourWith(groups, previous.rank, 2);
  else if (previous.type === 'bomb') picked = pickNOfKind(groups, 4, previous.rank, { avoidBomb: false });
  else if (previous.type === 'rocket') picked = [];

  if (picked.length > 0) return picked.map(card => card.id);

  if (shouldUsePowerPlay(room, playerId, previous)) {
    const bomb = pickNOfKind(groups, 4, 0, { avoidBomb: false });
    if (bomb.length > 0 && previous.type !== 'bomb') return bomb.map(card => card.id);
    const rocket = pickRocket(groups);
    if (rocket.length > 0 && previous.type !== 'rocket') return rocket.map(card => card.id);
  }

  return [];
}

function shouldProtectTeammate (room, playerId, hand) {
  const me = room.players[playerId];
  const lastPlayerId = room.lastPlay?.playerId;
  const lastPlayer = lastPlayerId ? room.players[lastPlayerId] : null;
  if (!me || !lastPlayer || !room.dealer) return false;
  if (me.role !== 'farmer' || lastPlayer.role !== 'farmer') return false;
  const fullPlay = analyzePlay(hand);
  if (fullPlay && canBeat(fullPlay, room.lastPlay?.analysis || null)) return false;
  const landlordCount = room.handCounts[room.dealer] || 0;
  return !(landlordCount > 0 && landlordCount <= 2);
}

function shouldUsePowerPlay (room, playerId, previous) {
  const hand = room.hands[playerId] || [];
  if (hand.length <= 4) return true;
  const lastPlayerId = room.lastPlay?.playerId;
  const lastCount = lastPlayerId ? room.handCounts[lastPlayerId] : 0;
  if (lastCount > 0 && lastCount <= 2) return true;
  if (previous.type === 'bomb') return true;
  return false;
}

function shouldLeadHighSingle (room, playerId) {
  if (!room || !playerId || !room.dealer) return false;
  const me = room.players[playerId];
  if (!me || me.role !== 'farmer') return false;
  const landlordCount = room.handCounts[room.dealer] || 0;
  return landlordCount > 0 && landlordCount <= 2;
}

function groupCardsByRank (cards) {
  const map = new Map();
  for (const card of sortCards(cards || [])) {
    if (!map.has(card.rank)) map.set(card.rank, []);
    map.get(card.rank).push(card);
  }
  return [...map.entries()]
    .map(([rank, grouped]) => ({ rank, cards: grouped.slice().sort((a, b) => a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.rank - b.rank);
}

function pickSingle (groups, minRank, options = {}) {
  const preferSolo = options.preferSolo !== false;
  const avoidBomb = options.avoidBomb !== false;
  const candidates = groups
    .filter(g => g.rank > minRank && (!avoidBomb || g.cards.length < 4))
    .sort((a, b) => options.preferHigh ? b.rank - a.rank : a.rank - b.rank);
  const solo = candidates.find(g => preferSolo && g.cards.length === 1);
  const group = solo || candidates[0];
  return group ? [group.cards[0]] : [];
}

function pickNOfKind (groups, count, minRank, options = {}) {
  const avoidBomb = options.avoidBomb === true;
  const group = groups.find(g => g.rank > minRank && g.cards.length >= count && (!avoidBomb || g.cards.length < 4));
  return group ? group.cards.slice(0, count) : [];
}

function findTripleWith (groups, minRank, wingCount) {
  for (const tripleGroup of groups) {
    if (tripleGroup.rank <= minRank || tripleGroup.cards.length < 3 || tripleGroup.cards.length >= 4) continue;
    const triple = tripleGroup.cards.slice(0, 3);
    const wing = pickWing(groups, tripleGroup.rank, wingCount);
    if (wing.length === wingCount) return triple.concat(wing);
  }
  return [];
}

function findAirplane (groups, minRank, chainLength, wingCount) {
  const triples = groups.filter(g => g.rank < 15 && g.rank > 0 && g.cards.length >= 3 && g.cards.length < 4);
  const requiredLength = chainLength || 0;
  for (let start = 0; start < triples.length; start++) {
    let chain = [triples[start]];
    for (let i = start + 1; i < triples.length; i++) {
      if (triples[i].rank === chain[chain.length - 1].rank + 1) chain.push(triples[i]);
      else if (triples[i].rank > chain[chain.length - 1].rank + 1) break;
    }
    for (let len = chain.length; len >= 2; len--) {
      if (requiredLength && len !== requiredLength) continue;
      for (let offset = 0; offset + len <= chain.length; offset++) {
        const segment = chain.slice(offset, offset + len);
        const high = segment[segment.length - 1].rank;
        if (high <= minRank) continue;
        const mainRanks = new Set(segment.map(g => g.rank));
        const wings = pickAirplaneWings(groups, mainRanks, len, wingCount);
        if (wings.length === len * wingCount) {
          const main = [];
          for (const g of segment) main.push(...g.cards.slice(0, 3));
          return main.concat(wings);
        }
      }
    }
  }
  return [];
}

function pickAirplaneWings (groups, mainRanks, chainLength, wingCount) {
  if (wingCount === 0) return [];
  const picked = [];
  for (const group of groups) {
    if (mainRanks.has(group.rank) || group.cards.length >= 4) continue;
    if (wingCount === 1 && group.cards.length >= 1) picked.push(group.cards[0]);
    if (wingCount === 2 && group.cards.length >= 2) picked.push(...group.cards.slice(0, 2));
    if (picked.length >= chainLength * wingCount) return picked.slice(0, chainLength * wingCount);
  }
  return [];
}

function findFourWith (groups, minRank, wingMode) {
  for (const fourGroup of groups) {
    if (fourGroup.rank <= minRank || fourGroup.cards.length < 4) continue;
    const wings = pickFourWings(groups, fourGroup.rank, wingMode);
    if (wings.length === (wingMode === 2 ? 4 : 2)) return fourGroup.cards.slice(0, 4).concat(wings);
  }
  return [];
}

function pickFourWings (groups, mainRank, wingMode) {
  const picked = [];
  for (const group of groups) {
    if (group.rank === mainRank || group.cards.length >= 4) continue;
    if (wingMode === 1 && group.cards.length >= 1) picked.push(group.cards[0]);
    if (wingMode === 2 && group.cards.length >= 2) picked.push(...group.cards.slice(0, 2));
    if (picked.length >= (wingMode === 2 ? 4 : 2)) return picked.slice(0, wingMode === 2 ? 4 : 2);
  }
  return [];
}

function pickWing (groups, mainRank, count) {
  for (const group of groups) {
    if (group.rank === mainRank || group.cards.length >= 4) continue;
    if (count === 1 && group.cards.length >= 1) return [group.cards[0]];
    if (count === 2 && group.cards.length >= 2) return group.cards.slice(0, 2);
  }
  return [];
}

function findBestStraight (groups, chainLength, eachCount, minHighRank) {
  if (!chainLength || chainLength < (eachCount === 1 ? 5 : 3)) return [];
  const valid = groups.filter(g => g.rank < 15 && g.cards.length >= eachCount);
  for (let i = 0; i <= valid.length - chainLength; i++) {
    let ok = true;
    for (let j = 1; j < chainLength; j++) {
      if (valid[i + j].rank !== valid[i].rank + j) { ok = false; break; }
    }
    if (!ok) continue;
    const high = valid[i + chainLength - 1].rank;
    if (high <= minHighRank) continue;
    const picked = [];
    for (let k = 0; k < chainLength; k++) picked.push(...valid[i + k].cards.slice(0, eachCount));
    return picked;
  }
  return [];
}

function pickRocket (groups) {
  const smallJoker = groups.find(g => g.rank === 16);
  const bigJoker = groups.find(g => g.rank === 17);
  if (smallJoker && bigJoker) return [smallJoker.cards[0], bigJoker.cards[0]];
  return [];
}

// ---- 回合动作串行化 ----
// applyBid / applyPlayCards / applyPass 内部都有 await（落库、结算），而
// “是否轮到你” 的守卫依赖 room.currentPlayerId / bidState.currentPlayerId，
// 这两个字段直到所有 await 结束后才推进。因此在 await 让出事件循环期间，
// 同一玩家再发一条同类消息会再次通过守卫 —— 等于一回合出两手牌。
// 限流是 10s/12 次，连发两条毫无门槛，故必须用房间级互斥锁兜住。
async function withActionLock (room, fn) {
  if (!room) return false;
  if (room.actionLock) {
    logger.warn(`[并发] 房间 ${room.id} 动作被锁拒绝（上一动作仍在处理）`);
    return false;
  }
  room.actionLock = true;
  try {
    return await fn();
  } finally {
    room.actionLock = false;
  }
}

function restoreCurrentActionTimer (room, expectedPhase, expectedPlayerId) {
  if (!room || room.disposed || room.phase !== expectedPhase) return;
  if (currentActionPlayerId(room) !== expectedPlayerId) return;
  if (room.settlementContext) return;
  startActionTimer(room);
}

async function runRecoverableAction (room, fn) {
  const expectedPhase = room?.phase;
  const expectedPlayerId = room ? currentActionPlayerId(room) : null;
  try {
    return await fn();
  } catch (err) {
    restoreCurrentActionTimer(room, expectedPhase, expectedPlayerId);
    throw err;
  }
}

async function applyBid (room, playerId, score, isAuto = false) {
  return withActionLock(room, () => runRecoverableAction(room, () => applyBidUnlocked(room, playerId, score, isAuto)));
}

async function applyDouble (room, playerId, multiplier, isAuto = false) {
  return withActionLock(room, () => runRecoverableAction(room, () => applyDoubleUnlocked(room, playerId, multiplier, isAuto)));
}

async function applyPlayCards (room, playerId, ids, isAuto = false, decisionMeta = null) {
  return withActionLock(room, () => runRecoverableAction(room, () => applyPlayCardsUnlocked(room, playerId, ids, isAuto, decisionMeta)));
}

async function applyPass (room, playerId, isAuto = false, decisionMeta = null) {
  return withActionLock(room, () => runRecoverableAction(room, () => applyPassUnlocked(room, playerId, isAuto, decisionMeta)));
}

// ============================================================
// 叫地主阶段（欢乐斗地主规则）
//
// 三层流程：
//   1. 竞叫：起始玩家先叫/不叫；叫了之后后续玩家可以「抢」（底分×2）；
//      有人抢后回问第一个叫的人做最终裁决（一问即终）
//   2. 确认地主后进入加倍阶段（doubling），地主看完底牌后选择加倍选项
//   3. 进入出牌
//
// bidState 结构扩展：
//   phase: 'calling' | 'robbing' | 'final_confirm'
//     - calling：依次问每人叫/不叫
//     - robbing：有人叫了，后续玩家依次可以选择抢/不抢
//     - final_confirm：有人抢了，回问第一个叫地主的人做最终裁决（抢/不抢），只问一次
//   firstCallerId: 第一个叫地主（score=1）的玩家 id
//   robberId: 第一个抢地主的玩家 id（仅 final_confirm 阶段有）
//   bidMultiplier: 当前底分倍率（抢地主每次×2）
// ============================================================
async function applyBidUnlocked (room, playerId, score, isAuto = false) {
  if (room.phase !== 'bidding') return false;
  if (room.bidState?.currentPlayerId !== playerId) return false;

  const me = room.players[playerId];
  if (!me) return false;
  if (!Number.isInteger(score) || score < 0 || score > 1) return false;

  clearActionTimer(room);
  const bid = room.bidState;
  const autoLabel = isAuto && !me.isBot;

  // 记录本次行动
  const actionLabel = score === 1
    ? (bid.phase === 'calling' ? '叫地主' : (bid.phase === 'final_confirm' ? '继续抢地主' : '抢地主'))
    : (bid.phase === 'calling' ? '不叫' : '不抢');
  const nextTurns = bid.turns + 1;
  const bidPayload = { playerId, score, isAuto, bidPhase: bid.phase, turns: nextTurns };
  let landlordId = null;
  const nextBidPlayerId = nextPlayerId(room, playerId);
  // calling 阶段的终点是行动顺序回到起叫者，而不是 passed 的人数。
  // 最后一位玩家叫地主不会写入 passed；若用 passed.length 判断，会错误
  // 地再进入一轮 robbing。
  const reachesStarter = bid.phase === 'calling' && nextBidPlayerId === bid.starterId;
  const forcedLandlord = reachesStarter && score === 0;
  if (reachesStarter) {
    landlordId = score === 1 ? playerId : pickForcedLandlord(room);
  } else if (bid.phase === 'robbing' && score === 0) {
    const nextId = nextPlayerId(room, playerId);
    if (nextId === bid.starterId || nextId === bid.firstCallerId) landlordId = bid.firstCallerId;
  } else if (bid.phase === 'final_confirm') {
    landlordId = score === 1 ? playerId : (bid.highestPlayerId || bid.firstCallerId);
  }

  if (landlordId) {
    const finalBidMultiplier = bid.phase === 'final_confirm' && score === 1
      ? (bid.bidMultiplier || 1) * 2
      : (bid.bidMultiplier || 1);
    await beginDoubling(room, landlordId, {
      bidPayload,
      bidActor: me,
      bidMultiplier: finalBidMultiplier,
    });
    bid.turns = nextTurns;
    if (bid.phase === 'final_confirm' && score === 1) {
      bid.bidMultiplier = finalBidMultiplier;
      bid.highestPlayerId = playerId;
    }
    broadcastAll(room, 'notice', {
      message: `${me.name}${actionLabel}${autoLabel ? '（托管）' : ''}`,
      label: actionLabel,
      action: 'bidPlaced',
      actorId: playerId,
      value: score,
      bidPhase: bid.phase,
    });
    if (forcedLandlord) {
      broadcastAll(room, 'notice', {
        message: `无人叫地主，${room.players[landlordId]?.name || '玩家'} 成为地主`,
        action: 'landlordForced',
        actorId: landlordId,
        label: '强制地主',
      });
    }
    startActionTimer(room);
    broadcastAll(room, 'state');
    return true;
  }

  await matchStore.appendMatchEvent(room, 'bid', bidPayload, me);
  bid.turns = nextTurns;
  broadcastAll(room, 'notice', {
    message: `${me.name}${actionLabel}${autoLabel ? '（托管）' : ''}`,
    label: actionLabel,
    action: 'bidPlaced',
    actorId: playerId,
    value: score,
    bidPhase: bid.phase,
  });

  // ── calling 阶段：依次问每人 ──────────────────────────────────
  if (bid.phase === 'calling') {
    if (score === 1) {
      // 有人叫地主，后续玩家可以抢
      bid.firstCallerId = playerId;
      bid.highestPlayerId = playerId;
      bid.bidMultiplier = Math.max(1, bid.bidMultiplier || 1);
      // 看后面还有没有人没叫
      const nextId = nextPlayerId(room, playerId);
      // 进入 robbing 阶段
      bid.phase = 'robbing';
      bid.currentPlayerId = nextId;
      startActionTimer(room);
      broadcastAll(room, 'state');
      return true;
    } else {
      // 不叫，继续向下一家
      if (!bid.passed.includes(playerId)) bid.passed.push(playerId);
      const nextId = nextPlayerId(room, playerId);
      bid.currentPlayerId = nextId;
      startActionTimer(room);
      broadcastAll(room, 'state');
      return true;
    }
  }

  // ── robbing 阶段：有人叫了，后续玩家可以抢 ───────────────────
  if (bid.phase === 'robbing') {
    if (score === 1) {
      // 抢地主：底分×2
      bid.bidMultiplier = (bid.bidMultiplier || 1) * 2;
      bid.robberId = playerId;
      bid.highestPlayerId = playerId;
      // 回问第一个叫地主的人做最终裁决
      bid.phase = 'final_confirm';
      bid.currentPlayerId = bid.firstCallerId;
      startActionTimer(room);
      broadcastAll(room, 'state');
      return true;
    } else {
      // 不抢，继续向下一家（跳过已叫地主的人）
      const nextId = nextPlayerId(room, playerId);
      bid.currentPlayerId = nextId;
      startActionTimer(room);
      broadcastAll(room, 'state');
      return true;
    }
  }

  return false;
}

// 进入加倍阶段（地主看底牌 → 选加倍选项）
async function beginDoubling (room, landlordId, options = {}) {
  const bid = room.bidState;
  const bidMultiplier = options.bidMultiplier || bid?.bidMultiplier || 1;
  const landlordCardsVisible = sortCards(room.landlordCardsHidden);
  const landlordHand = sortCards([...(room.hands[landlordId] || []), ...room.landlordCardsHidden]);
  const rolesByPlayerId = Object.fromEntries(allPlayers(room).map(player => [
    player.id,
    player.id === landlordId ? 'landlord' : 'farmer',
  ]));

  // 先持久化角色和阶段事件，再做不可逆的内存切换/发底牌。
  // 这样 DB 异常时原 bidding 状态仍可安全重试，不会把底牌重复加入手牌。
  await matchStore.recordLandlordAssignment(room, {
    bidPayload: options.bidPayload,
    bidActor: options.bidActor,
    rolesByPlayerId,
    landlordPayload: { landlordId, bidMultiplier, landlordCards: landlordCardsVisible },
    landlordActor: room.players[landlordId],
  });

  room.landlordCardsVisible = landlordCardsVisible;
  room.hands[landlordId] = landlordHand;
  room.handCounts[landlordId] = landlordHand.length;
  sendTo(room.players[landlordId]?.ws, 'hand', { cards: landlordHand });
  for (const p of allPlayers(room)) p.role = rolesByPlayerId[p.id];
  room.phase = 'doubling';
  room.doublingPlayerId = landlordId;
  room.doublingBidMultiplier = bidMultiplier;  // 抢地主带来的倍率
  room.dealer = landlordId;
  room.bidState = null;

  const landlordName = room.players[landlordId]?.name || '玩家';
  broadcastAll(room, 'notice', {
    message: `${landlordName} 成为地主，请选择加倍`,
    action: 'landlordAssigned',
    actorId: landlordId,
    cards: room.landlordCardsVisible,
    bidMultiplier,
  });
}

// 加倍阶段：地主选择不加倍(1)/加倍(2)/超级加倍(4)
async function applyDoubleUnlocked (room, playerId, multiplier, isAuto = false) {
  if (room.phase !== 'doubling') return false;
  if (room.doublingPlayerId !== playerId) return false;
  if (![1, 2, 4].includes(multiplier)) return false;

  clearActionTimer(room);
  const me = room.players[playerId];
  if (!me) return false;

  const labelMap = { 1: '不加倍', 2: '加倍', 4: '超级加倍' };
  const autoLabel = isAuto && !me.isBot;
  const tier = getRoomTierForRoom(room);
  const bidMultiplier = room.doublingBidMultiplier || 1;
  const finalMultiplier = bidMultiplier * multiplier;
  const landlordCardsVisible = sortCards(room.landlordCardsHidden);
  const rolesByPlayerId = Object.fromEntries(allPlayers(room).map(player => [
    player.id,
    player.id === playerId ? 'landlord' : 'farmer',
  ]));
  await matchStore.recordGameStart(room, {
    doublePayload: { playerId, multiplier, isAuto },
    actor: me,
    rolesByPlayerId,
    gamePayload: {
      landlordId: playerId,
      bidMultiplier,
      doubleMultiplier: multiplier,
      finalMultiplier,
      landlordCards: landlordCardsVisible,
    },
  });
  broadcastAll(room, 'notice', {
    message: `${me.name}${autoLabel ? '（超时）' : ''}${labelMap[multiplier] || '不加倍'}`,
    label: labelMap[multiplier] || '不加倍',
    action: 'doubleApplied',
    actorId: playerId,
    value: multiplier,
  });

  beginPlaying(room, playerId, multiplier);
  startActionTimer(room);
  broadcastAll(room, 'state');
  return true;
}

function logBotDecision (room, playerId, actionType, decisionMeta) {
  if (!room.players[playerId]?.isBot) return;
  if (!shouldLogDecision(room, playerId, decisionMeta, BOT_DECISION_LOG_PERCENT)) return;
  logger.info(formatDecisionLog(room, playerId, actionType, decisionMeta));
}

async function applyPlayCardsUnlocked (room, playerId, ids, isAuto = false, decisionMeta = null) {
  if (room.phase !== 'playing' || room.currentPlayerId !== playerId) return false;

  const ws = room.players[playerId]?.ws;
  const me = room.players[playerId];
  const selected = removeCards(room.hands[playerId] || [], ids);
  if (!selected || selected.length === 0) { sendTo(ws, 'error', { message: '请选择要出的牌' }); return false; }

  const analysis = analyzePlay(selected);
  if (!analysis) { sendTo(ws, 'error', { message: '牌型不合法' }); return false; }
  if (!canBeat(analysis, room.lastPlay?.analysis || null)) {
    sendTo(ws, 'error', { message: '需要出同牌型更大的牌，或使用炸弹/火箭' });
    return false;
  }

  const remainingHand = sortCards((room.hands[playerId] || []).filter(c => !ids.includes(c.id)));
  const sortedSelected = sortCards(selected);
  await matchStore.appendMatchEvent(room, 'play_cards', {
    playerId,
    cardIds: ids,
    cards: sortedSelected,
    playType: analysis.type,
    label: analysis.label,
    isAuto,
    handCount: remainingHand.length,
    ...(decisionMeta ? { decisionMeta } : {}),
  }, me);

  clearActionTimer(room);
  room.hands[playerId] = remainingHand;
  room.handCounts[playerId] = room.hands[playerId].length;
  room.round.playCounts[playerId] = (room.round.playCounts[playerId] || 0) + 1;
  if (isMultiplierPlay(analysis)) {
    // 普通炸弹 ×2，王炸（火箭）×4，多个累乘
    room.round.multiplier *= analysis.type === 'rocket' ? 4 : 2;
    if (!me.isBot && me.accountId) void recordBombPlay(me.accountId);   // 真人炸弹/火箭计数
  }

  room.lastPlay = { playerId, cards: sortedSelected, analysis };
  room.round.passCount = 0;
  appendPlayAction(room, { playerId, type: 'play', cards: selected, playType: analysis.type });
  sendTo(ws, 'hand', { cards: room.hands[playerId] });
  const autoLabel = isAuto && !me.isBot;
  if (!me.isBot) logger.info(`[出牌] ${me.name} 出 ${analysis.label}${autoLabel ? '（托管）' : ''}，剩余 ${room.hands[playerId].length} 张，房间 ${room.id}`);

  broadcastAll(room, 'notice', { message: `${me.name}${autoLabel ? '托管' : ''}出了 ${analysis.label}`, action: 'cardsPlayed', actorId: playerId, cards: room.lastPlay.cards, playType: analysis.type, label: analysis.label });
  logBotDecision(room, playerId, 'playCards', decisionMeta);
  if (room.hands[playerId].length <= 2 && room.hands[playerId].length > 0) {
    broadcastAll(room, 'notice', { action: 'lowCards', actorId: playerId, value: room.hands[playerId].length, label: `只剩 ${room.hands[playerId].length} 张` });
  }

  if (room.hands[playerId].length === 0) {
    beginSettlement(room, playerId);
    broadcastAll(room, 'state');
    return true;
  }

  room.currentPlayerId = nextPlayerId(room, playerId);
  startActionTimer(room);
  broadcastAll(room, 'state');
  return true;
}

async function applyPassUnlocked (room, playerId, isAuto = false, decisionMeta = null) {
  if (room.phase !== 'playing' || room.currentPlayerId !== playerId) return false;
  if (!room.lastPlay || room.lastPlay.playerId === playerId) return false;

  const me = room.players[playerId];
  const autoLabel = isAuto && !me.isBot;
  const lastPlayPlayerId = room.lastPlay?.playerId || null;
  await matchStore.appendMatchEvent(room, 'pass', {
    playerId,
    isAuto,
    lastPlayPlayerId,
    ...(decisionMeta ? { decisionMeta } : {}),
  }, me);
  clearActionTimer(room);
  appendPlayAction(room, { playerId, type: 'pass' });
  room.round.passCount += 1;
  broadcastAll(room, 'notice', { message: `${me.name} ${autoLabel ? '超时自动不出' : '不出'}`, action: 'playerPassed', actorId: playerId });
  logBotDecision(room, playerId, 'pass', decisionMeta);

  if (room.round.passCount >= 2) {
    room.currentPlayerId = room.lastPlay.playerId;
    room.lastPlay = null;
    room.round.passCount = 0;
    broadcastAll(room, 'notice', { action: 'trickCleared', actorId: room.currentPlayerId });
    startActionTimer(room);
    broadcastAll(room, 'state');
    return true;
  }

  room.currentPlayerId = nextPlayerId(room, playerId);
  startActionTimer(room);
  broadcastAll(room, 'state');
  return true;
}

async function prepareBotRoundReservations (room, nextRoundNo) {
  if (!room.hasBots) return true;
  if (nextRoundNo > 1) {
    const tier = getRoomTierForRoom(room);
    const exposure = maximumBotExposure(tier);
    const quotaIds = {};
    try {
      for (const human of allPlayers(room).filter(p => !p.isBot)) {
        const quota = await botStatsStore.reserveBotQuota({
          matchRequestId: `${room.matchRequestGroupId}:round:${nextRoundNo}:${human.accountId}`,
          accountId: human.accountId,
          statDate: todayKey(),
          requiredPositiveGain: exposure,
        });
        if (!quota.ok) throw new Error(quota.reason);
        quotaIds[human.accountId] = quota.reservation.reservationId;
      }
      const treasury = await treasuryStore.reserveTreasuryExposure({
        matchRequestGroupId: `${room.matchRequestGroupId}:round:${nextRoundNo}`,
        roomId: room.id,
        roomType: tier.type,
        treasuryAccountId: botTreasuryAccountId(tier.type),
        requiredExposure: exposure,
        minReserve: BOT_MATCH.treasuryMinReserve,
      });
      if (!treasury.ok) throw new Error(treasury.reason);
      room.quotaReservationIds = quotaIds;
      room.treasuryReservationId = treasury.reservation.reservationId;
      room.requiredBotExposure = exposure;
    } catch (err) {
      for (const id of Object.values(quotaIds)) await botStatsStore.releaseBotQuota(id).catch(() => {});
      throw err;
    }
  }
  return true;
}

async function activateBotRoundReservations (room) {
  if (!room.hasBots) return;
  await transaction(async () => {
    for (const reservationId of Object.values(room.quotaReservationIds || {})) {
      await botStatsStore.activateBotQuota(reservationId, room.matchId, room.botMode);
    }
    await treasuryStore.activateTreasuryReservation(room.treasuryReservationId, room.matchId);
  });
}

function activeHumanCount (room) {
  return allPlayers(room).filter(player => !player.isBot && player.connected && !player.autoManaged).length;
}

async function releasePendingBotReservations (room) {
  if (!room?.hasBots || room.phase === 'bidding' || room.phase === 'doubling' || room.phase === 'playing') return;
  if (room.treasuryReservationId) {
    await treasuryStore.releaseTreasuryExposure(room.treasuryReservationId).catch(() => {});
    room.treasuryReservationId = null;
  }
  for (const id of Object.values(room.quotaReservationIds || {})) {
    await botStatsStore.releaseBotQuota(id).catch(() => {});
  }
  room.quotaReservationIds = {};
}

async function disposeRoom (room, reason = 'disposed') {
  if (!room || room.disposed) return;
  room.disposed = true;
  clearActionTimer(room);
  if (room.settlementRetryTimer) clearTimeout(room.settlementRetryTimer);
  room.settlementRetryTimer = null;
  for (const timer of room.botReadyTimers || []) clearTimeout(timer);
  room.botReadyTimers = [];
  for (const player of allPlayers(room)) clearDisconnectTimer(room, player.id);
  joinReservations.invalidateRoom(room.id);
  await releasePendingBotReservations(room);
  for (const human of allPlayers(room).filter(player => !player.isBot)) {
    matchOrchestrator.complete(human.accountId, reason);
  }
  rooms.delete(room.id);
}

async function tryStartReadyRoom (room) {
  if (!room || room.disposed || !(room.phase === 'ready' || room.phase === 'settlement')) return false;
  if (playerCount(room) !== 3 || !allPlayers(room).every(player => player.ready)) return false;
  if (room.hasBots && (activeHumanCount(room) === 0 || room.round.number >= BOT_MATCH.maxRoundsPerRoom)) {
    await disposeRoom(room, 'bot_room_complete');
    return false;
  }
  const feeResult = await chargeEntryFeesForStart(room);
  if (!feeResult.ok) {
    const target = feeResult.player;
    if (target) target.ready = false;
    const currentBeans = feeResult.wallet ? feeResult.wallet.beans : 0;
    const message = `${target?.name || '玩家'}铁豆不足，${feeResult.roomName}开局需要 ${feeResult.requiredBeans} 铁豆`;
    if (target?.ws) {
      sendTo(target.ws, 'error', {
        message: `${feeResult.roomName}开局需要 ${feeResult.requiredBeans} 铁豆，当前 ${currentBeans} 铁豆`,
        code: 'INSUFFICIENT_ENTRY_FEE',
        roomType: feeResult.roomType,
        requiredBeans: feeResult.requiredBeans,
        currentBeans,
      });
      await sendWalletTo(target.ws, target.accountId);
    }
    broadcastAll(room, 'notice', { message, label: '铁豆不足', action: 'entryFeeInsufficient', actorId: target?.id || null });
    broadcastAll(room, 'state');
    return false;
  }
  if (feeResult.charged && feeResult.charged.length > 0) {
    await sendWalletsForRoom(room, {
      action: 'entryFeeCharged',
      entryFeeBeans: feeResult.entryFeeBeans,
      charged: feeResult.charged,
    });
    broadcastAll(room, 'notice', { message: `${feeResult.roomName}开局，扣除门票 ${feeResult.entryFeeBeans} 铁豆`, label: '已扣门票', action: 'entryFeeCharged', value: feeResult.entryFeeBeans });
  }
  await startRound(room);
  broadcastAll(room, 'state');
  return room.phase === 'bidding';
}

function scheduleBotsReady (room) {
  if (!room?.hasBots || room.disposed) return;
  room.botReadyTimers = room.botReadyTimers || [];
  for (const timer of room.botReadyTimers) clearTimeout(timer);
  room.botReadyTimers = [];
  for (const bot of allPlayers(room).filter(player => player.isBot)) {
    bot.ready = false;
    const timer = setTimeout(() => {
      if (!rooms.has(room.id) || room.disposed || room.phase !== 'settlement') return;
      bot.ready = true;
      broadcastAll(room, 'state');
      tryStartReadyRoom(room).catch(err => logger.error('[机器人] 自动准备失败:', err));
    }, 2000 + Math.floor(Math.random() * 3000));
    room.botReadyTimers.push(timer);
  }
}

// ---- Game logic (same as reference) ----
async function startRound (room) {
  const players = allPlayers(room);
  if (players.length !== 3) return;
  const nextRoundNo = room.round.number + 1;
  if (room.hasBots) {
    if (nextRoundNo > BOT_MATCH.maxRoundsPerRoom || Date.now() - room.createdAt > BOT_MATCH.roomLifetimeMs) return;
    try {
      await prepareBotRoundReservations(room, nextRoundNo);
    } catch (err) {
      room.message = '等待其他玩家准备';
      logger.warn(`[机器人] 房间 ${room.id} 第 ${nextRoundNo} 局预占失败: ${err.message}`);
      return;
    }
  }

  const previousState = {
    phase: room.phase,
    round: room.round,
    hands: room.hands,
    landlordCardsHidden: room.landlordCardsHidden,
    handCounts: room.handCounts,
    result: room.result,
    matchId: room.matchId,
    playActionHistory: room.playActionHistory,
    playActionSeq: room.playActionSeq,
    botDecisionMode: room.botDecisionMode,
    botStrategyVersion: room.botStrategyVersion,
    handStrengthMode: room.handStrengthMode,
    handEvaluatorVersion: room.handEvaluatorVersion,
    handPolicyVersion: room.handPolicyVersion,
  };
  const deck = shuffle(createDeck());
  room.hands = {};
  for (const p of players) room.hands[p.id] = sortCards(deck.splice(0, 17));
  room.landlordCardsHidden = deck.splice(0, 3);

  room.phase = 'bidding';
  room.dealer = null;
  room.landlordCardsVisible = [];
  room.currentPlayerId = null;
  room.lastPlay = null;
  if (room.settlementRetryTimer) clearTimeout(room.settlementRetryTimer);
  room.settlementContext = null;
  room.settlementRetryTimer = null;
  resetPlayActionHistory(room);
  room.handCounts = Object.fromEntries(players.map(p => [p.id, 17]));
  room.result = null;
  const tier = getRoomTierForRoom(room);
  room.round = {
    number: room.round.number + 1,
    starterSeat: room.round.number % 3,
    passCount: 0,
    multiplier: 1,
    baseScore: tier.baseBet,
    playCounts: Object.fromEntries(players.map(p => [p.id, 0])),
  };
  decisionRouter.configureRoom(room, room.round.number);
  handStrengthRuntime.configureRoom(room);
  room.eventSeq = 0;
  try {
    if (room.hasBots) {
      room.matchId = await transaction(async () => {
        const matchId = await matchStore.createMatch(room, players);
        room.matchId = matchId;
        await activateBotRoundReservations(room);
        return matchId;
      });
    } else {
      room.matchId = await matchStore.createMatch(room, players);
    }
  } catch (err) {
    room.phase = previousState.phase;
    room.round = previousState.round;
    room.hands = previousState.hands;
    room.landlordCardsHidden = previousState.landlordCardsHidden;
    room.handCounts = previousState.handCounts;
    room.result = previousState.result;
    room.matchId = previousState.matchId;
    room.playActionHistory = previousState.playActionHistory;
    room.playActionSeq = previousState.playActionSeq;
    room.botDecisionMode = previousState.botDecisionMode;
    room.botStrategyVersion = previousState.botStrategyVersion;
    room.handStrengthMode = previousState.handStrengthMode;
    room.handEvaluatorVersion = previousState.handEvaluatorVersion;
    room.handPolicyVersion = previousState.handPolicyVersion;
    room.eventSeq = 0;
    room.message = '等待其他玩家准备';
    logger.error(`[开局] 房间 ${room.id} 创建比赛或激活资金保障失败:`, err);
    return;
  }

  for (const p of players) {
    p.ready = false;
    p.role = null;
    p.roundDelta = 0;
    p.exitPenaltyApplied = false;
    await syncPlayerBeans(room, p.id);
    sendTo(p.ws, 'hand', { cards: room.hands[p.id] });
  }

  const starterId = room.seats[room.round.starterSeat] || players[0].id;
  room.bidState = {
    currentPlayerId: starterId,
    starterId,
    highestScore: 0,
    highestPlayerId: null,
    firstCallerId: null,
    robberId: null,
    bidMultiplier: 1,
    phase: 'calling',   // 'calling' | 'robbing' | 'final_confirm'
    turns: 0,
    passed: [],
  };
  room.doublingPlayerId = null;
  room.doublingBidMultiplier = 1;
  room.message = '开始叫地主';
  broadcastAll(room, 'notice', { message: '新一局开始，叫地主', action: 'dealStarted', actorId: starterId });
  await matchStore.appendMatchEvent(room, 'deal', {
    starterId,
    playerIds: players.map(p => p.id),
    accountIds: players.map(p => p.accountId),
    handCounts: room.handCounts,
    landlordCardsHidden: room.landlordCardsHidden,
    roomType: tier.type,
    roomName: tier.name,
    tierConfig: cloneRoomTier(tier),
  });
  startActionTimer(room);
}

function beginPlaying (room, landlordId, doubleMultiplier) {
  room.phase = 'playing';
  room.dealer = landlordId;
  // 底牌已在 beginDoubling 中发给地主，这里只需标记可见
  room.landlordCardsVisible = sortCards(room.landlordCardsHidden);
  room.currentPlayerId = landlordId;
  room.doublingPlayerId = null;
  const tier = getRoomTierForRoom(room);

  // 最终倍率 = 抢地主倍率 × 加倍选项
  const bidMultiplier = room.doublingBidMultiplier || 1;
  const finalMultiplier = bidMultiplier * (doubleMultiplier || 1);
  room.round.baseScore = tier.baseBet;
  room.round.bidMultiplier = bidMultiplier;
  room.round.doubleMultiplier = doubleMultiplier || 1;
  room.round.multiplier = Math.max(1, finalMultiplier);
  room.message = `${room.players[landlordId].name} 成为地主`;

  for (const p of allPlayers(room)) p.role = p.id === landlordId ? 'landlord' : 'farmer';
  // 底牌已在 beginDoubling 发给地主，这里确保手牌数正确
  room.handCounts[landlordId] = (room.hands[landlordId] || []).length;
  broadcastAll(room, 'notice', {
    message: `${room.players[landlordId].name} 成为地主，倍率 ${finalMultiplier}x`,
    action: 'gameBegan',
    actorId: landlordId,
    cards: room.landlordCardsVisible,
    finalMultiplier,
    bidMultiplier,
    doubleMultiplier: doubleMultiplier || 1,
  });
}

function settlementRetryDelayMs (attempt) {
  return Math.min(5000, 250 * (2 ** Math.max(0, Number(attempt || 1) - 1)));
}

function scheduleSettlementRetry (room) {
  const context = room?.settlementContext;
  if (!room || room.disposed || !context || context.completed || room.settlementRetryTimer) return;
  const roundNo = context.roundNo;
  const winnerId = context.winnerId;
  const delayMs = settlementRetryDelayMs(context.attempts);
  room.settlementRetryTimer = setTimeout(() => {
    room.settlementRetryTimer = null;
    const latest = room.settlementContext;
    if (room.disposed || !latest || latest.completed || latest.roundNo !== roundNo || latest.winnerId !== winnerId) return;
    void runSettlementAttempt(room).catch(() => {});
  }, delayMs);
  room.settlementRetryTimer.unref?.();
}

function beginSettlement (room, winnerId) {
  clearActionTimer(room);
  if (!room || room.disposed) return;
  const roundNo = room.round?.number || 0;
  const existing = room.settlementContext;
  if (existing && (existing.winnerId !== winnerId || existing.roundNo !== roundNo)) return;
  if (existing?.running || existing?.completed) return;
  if (!existing) {
    room.settlementContext = {
      winnerId,
      roundNo,
      attempts: 0,
      running: false,
      completed: false,
      multiplierPrepared: false,
    };
  }
  void runSettlementAttempt(room).catch(() => {});
}

async function runSettlementAttempt (room) {
  const context = room?.settlementContext;
  if (!context || context.running || context.completed || room.disposed) return false;
  context.running = true;
  context.attempts += 1;
  try {
    await settleRound(room, context.winnerId, context);
    context.completed = true;
    room.settlementContext = null;
    if (room.settlementRetryTimer) clearTimeout(room.settlementRetryTimer);
    room.settlementRetryTimer = null;
    broadcastAll(room, 'state');
    return true;
  } catch (err) {
    logger.error(`[结算] 房间结算失败 attempt=${context.attempts} reason=${String(err?.code || err?.name || 'unknown').slice(0, 48)}`);
    scheduleSettlementRetry(room);
    return false;
  } finally {
    context.running = false;
  }
}

// 统一破产补助判定（人机局 / 真人局共用同一逻辑，不做区分）：
// 输家（delta < 0）结算后余额低于门槛即破产，按当日领取记录下发 claimable；
// 领过之后再破产 claimable=false，客户端改弹「豆子不足」引导购买。
// entries: [{ id: playerId, accountId, delta, beans }]
async function buildBankruptRewards (entries) {
  const rewards = {};
  for (const e of entries) {
    if (!e || Number(e.delta) >= 0) continue;
    if (Number(e.beans) >= ECONOMY.bankruptThresholdBeans) continue;
    const relief = await walletStore.getDailyRewardStatus(e.accountId, 'bankrupt_relief', todayKey());
    rewards[e.id] = {
      claimable: Number(relief.claimCount || 0) < ECONOMY.bankruptRewardMaxPerDay,
      amount: ECONOMY.bankruptRewardBeans,
      thresholdBeans: ECONOMY.bankruptThresholdBeans,
    };
  }
  return rewards;
}

async function settleRound (room, winnerId, context = null) {
  clearActionTimer(room);
  const landlordId = room.dealer;
  if (!landlordId) return;

  const tier = getRoomTierForRoom(room);
  await releaseRoomFreezesForSettlement(room);
  await syncAllPlayerBeans(room);
  const landlordWon = winnerId === landlordId;
  const farmerIds = allPlayers(room).filter(p => p.id !== landlordId).map(p => p.id);
  const spring = landlordWon
    ? farmerIds.every(id => (room.round.playCounts[id] || 0) === 0)
    : (room.round.playCounts[landlordId] || 0) <= 1;
  const maxSettlementMultiplier = room.hasBots
    ? Math.min(tier.maxMultiplier || ECONOMY.maxMultiplier, room.botMaxMultiplier || tier.maxMultiplier || ECONOMY.maxMultiplier)
    : (tier.maxMultiplier || ECONOMY.maxMultiplier);
  // 倍数拆解来源（checklist：记录最终倍数及拆解来源）：先记录进结算时
  // 未含春天的倍率（= 抢地主 × 加倍 × 炸弹累乘），再应用春天与封顶
  const preSettleMultiplier = room.round.multiplier;
  if (context && !context.multiplierPrepared) {
    context.settlementMultiplier = Math.min(room.round.multiplier * (spring ? 2 : 1), maxSettlementMultiplier);
    context.multiplierPrepared = true;
  }
  room.round.multiplier = context?.settlementMultiplier
    ?? Math.min(room.round.multiplier * (spring ? 2 : 1), maxSettlementMultiplier);
  const bidFactor = Number(room.round.bidMultiplier || 1);
  const doubleFactor = Number(room.round.doubleMultiplier || 1);
  const multiplierBreakdown = {
    bid: bidFactor,               // 叫地主+抢地主累计（每次抢 ×2）
    double: doubleFactor,         // 加倍选项（1/2/4）
    bomb: bidFactor * doubleFactor > 0
      ? Math.round((preSettleMultiplier / (bidFactor * doubleFactor)) * 10000) / 10000
      : 1,                        // 炸弹/王炸累乘（普通×2、王炸×4）
    spring: spring ? 2 : 1,       // 春天/反春
    final: room.round.multiplier, // 最终倍数（已含春天与封顶）
    capped: room.round.multiplier < preSettleMultiplier * (spring ? 2 : 1),
  };

  const unit = Math.max(1, room.round.baseScore || tier.baseBet || ECONOMY.baseBet) * room.round.multiplier;
  const requestedDeltas = {};
  if (landlordWon) {
    requestedDeltas[landlordId] = unit * 2;
    for (const id of farmerIds) requestedDeltas[id] = -unit;
  } else {
    requestedDeltas[landlordId] = -unit * 2;
    for (const id of farmerIds) requestedDeltas[id] = unit;
  }

  if (room.hasBots) {
    const botResult = context?.botResult || await botSettlementStore.settleBotEconomy(room, requestedDeltas, {
      taxRate: Math.max(0, tier.taxRate || 0),
      winnerTeam: landlordWon ? 'landlord' : 'farmers',
      baseBet: room.round.baseScore || tier.baseBet || ECONOMY.baseBet,
      bidScore: room.round.bidScore || 1,
      multiplier: room.round.multiplier,
      spring,
    });
    if (context && !context.botResult) context.botResult = botResult;

    // 人机局破产判定：与真人局同一 buildBankruptRewards（不区分局型），
    // 只对真人玩家判定（delta<0 输家自动命中，赢家 delta>0 自动跳过）
    const botBankruptRewards = await buildBankruptRewards(
      allPlayers(room)
        .filter(p => !p.isBot)
        .map(p => ({
          id: p.id,
          accountId: p.accountId,
          delta: botResult.deltas[p.id] || 0,
          beans: Number(botResult.balances[p.id] || 0),
        }))
    );

    room.lastWinnerIds = botResult.winnerIds.slice();
    room.result = {
      winnerTeam: landlordWon ? 'landlord' : 'farmers',
      winnerIds: botResult.winnerIds,
      baseBet: room.round.baseScore || tier.baseBet || ECONOMY.baseBet,
      roomType: tier.type,
      roomName: tier.name,
      bidMultiplier: room.round.bidMultiplier || 1,
      doubleMultiplier: room.round.doubleMultiplier || 1,
      unit,
      requestedDeltas,
      grossDeltas: botResult.grossDeltas,
      taxDeltas: botResult.taxDeltas,
      taxRate: Math.max(0, tier.taxRate || 0),
      taxTotal: botResult.taxTotal,
      deltas: botResult.deltas,
      balances: botResult.balances,
      bankruptRewards: botBankruptRewards,
      spring,
      multiplier: room.round.multiplier,
      multiplierBreakdown,
      currencyName: ECONOMY.currencyName,
    };
    if (!context?.settlementRecorded) {
      await matchStore.appendMatchEvent(room, 'settlement', room.result, room.players[winnerId]);
      if (context) context.settlementRecorded = true;
    }
    if (!context?.statsRecorded) {
      void recordSettlementStats(botResult.winnerIds,
        allPlayers(room).filter(p => !p.isBot && p.accountId)
          .map(p => ({ playerId: p.id, accountId: p.accountId })),
        spring, room.round.multiplier);
      if (context) context.statsRecorded = true;
    }
    room.phase = 'settlement';
    room.currentPlayerId = null;
    room.message = '本局结束，请准备下一局';
    if (spring) broadcastAll(room, 'notice', { message: landlordWon ? '春天' : '反春', label: landlordWon ? '春天' : '反春', action: 'multiplierChanged', value: room.round.multiplier });
    broadcastAll(room, 'notice', { message: landlordWon ? '地主胜利' : '农民胜利', label: landlordWon ? '地主胜利' : '农民胜利', action: 'roundSettled', actorId: winnerId, value: room.round.multiplier });
    for (const human of allPlayers(room).filter(p => !p.isBot && p.ws)) await sendWalletTo(human.ws, human.accountId);
    if (activeHumanCount(room) === 0 || room.round.number >= BOT_MATCH.maxRoundsPerRoom || room.closeAfterSettlement) {
      await disposeRoom(room, 'bot_room_complete');
    } else {
      scheduleBotsReady(room);
    }
    return;
  }

  let humanPlan = context?.humanPlan || null;
  if (!humanPlan) {
    const winnerIds = landlordWon ? [landlordId] : farmerIds;
    const loserIds = allPlayers(room).map(p => p.id).filter(id => winnerIds.indexOf(id) === -1);
    const deltas = {};
    let totalLost = 0;
    for (const id of loserIds) {
      const p = room.players[id];
      const shouldLose = Math.abs(requestedDeltas[id] || 0);
      const wallet = await getOrCreateWallet(p.accountId);
      const actualLose = Math.min(shouldLose, wallet.availableBeans);
      deltas[id] = -actualLose;
      totalLost += actualLose;
    }

    const positiveRequestedTotal = winnerIds.reduce((sum, id) => sum + Math.max(0, requestedDeltas[id] || 0), 0) || 1;
    const grossDeltas = { ...deltas };
    const taxDeltas = {};
    let remainingWin = totalLost;
    let taxTotal = 0;
    const taxRate = Math.max(0, tier.taxRate || 0);
    winnerIds.forEach((id, idx) => {
      const grossShare = idx === winnerIds.length - 1
        ? remainingWin
        : Math.floor(totalLost * Math.max(0, requestedDeltas[id] || 0) / positiveRequestedTotal);
      const tax = Math.floor(grossShare * taxRate);
      grossDeltas[id] = grossShare;
      taxDeltas[id] = -tax;
      deltas[id] = grossShare - tax;
      taxTotal += tax;
      remainingWin -= grossShare;
    });
    humanPlan = { winnerIds, loserIds, deltas, grossDeltas, taxDeltas, taxRate, taxTotal };
    if (context) context.humanPlan = humanPlan;
  }

  const { winnerIds, loserIds, deltas, grossDeltas, taxDeltas, taxRate, taxTotal } = humanPlan;
  room.lastWinnerIds = winnerIds.slice();

  const balances = {};
  const settledWallets = {};   // id -> 结算后的钱包快照，供破产判定复用
  for (const [id, delta] of Object.entries(deltas)) {
    const p = room.players[id];
    const type = delta >= 0 ? 'game_win' : 'game_lose';
    const ret = await applyWalletDelta(p.accountId, delta, type, {
      roomId: room.id,
      roundNo: room.round.number,
      matchId: room.matchId,
      roomType: tier.type,
      roomName: tier.name,
      grossDelta: grossDeltas[id] || delta,
      taxDelta: taxDeltas[id] || 0,
      taxRate,
      idempotencyKey: `game_settlement:${room.matchId || room.id}:${room.round.number}:${p.accountId}`,
    });
    // 复用事务返回的钱包，避免额外的全表查询；
    // 若扣了抽水，则以抽水事务的返回钱包为最终态。
    let latestWallet = ret.wallet;
    let taxRet = null;
    if ((taxDeltas[id] || 0) < 0) {
      taxRet = await applyWalletDelta(p.accountId, taxDeltas[id], 'game_tax', {
        roomId: room.id,
        roundNo: room.round.number,
        matchId: room.matchId,
        roomType: tier.type,
        roomName: tier.name,
        taxRate,
        source: 'winner_tax',
        idempotencyKey: `game_tax:${room.matchId || room.id}:${room.round.number}:${p.accountId}`,
      });
      latestWallet = taxRet.wallet;
    }
    p.beans = latestWallet.beans;
    p.frozenBeans = latestWallet.frozenBeans || 0;
    p.availableBeans = latestWallet.availableBeans;
    const memoryApplied = context?.memoryAppliedPlayerIds || new Set();
    if (!memoryApplied.has(id)) {
      const netDelta = delta + (taxDeltas[id] || 0);
      p.roundDelta = (p.roundDelta || 0) + netDelta;
      p.totalDelta = (p.totalDelta || 0) + netDelta;
      memoryApplied.add(id);
      if (context) context.memoryAppliedPlayerIds = memoryApplied;
    }
    p.ready = false;
    balances[id] = latestWallet.beans;
    settledWallets[id] = latestWallet;
  }

  // 真人局破产判定：与机器人局同一 buildBankruptRewards（不区分局型）
  const bankruptRewards = await buildBankruptRewards(
    loserIds.map(id => {
      const w = settledWallets[id];
      return w ? { id: id, accountId: w.accountId, delta: (deltas[id] || 0), beans: Number(w.beans) } : null;
    }).filter(Boolean)
  );

  room.result = {
    winnerTeam: landlordWon ? 'landlord' : 'farmers',
    winnerIds,
    baseBet: room.round.baseScore || tier.baseBet || ECONOMY.baseBet,
    roomType: tier.type,
    roomName: tier.name,
    bidMultiplier: room.round.bidMultiplier || 1,
    doubleMultiplier: room.round.doubleMultiplier || 1,
    unit,
    requestedDeltas,
    grossDeltas,
    taxDeltas,
    taxRate,
    taxTotal,
    deltas,
    balances,
    bankruptRewards,
    spring,
    multiplier: room.round.multiplier,
    multiplierBreakdown,
    currencyName: ECONOMY.currencyName,
  };
  await matchStore.recordSettlement(room, room.result, room.players[winnerId]);
  if (!context?.statsRecorded) {
    void recordSettlementStats(winnerIds,
      allPlayers(room).filter(p => !p.isBot && p.accountId)
        .map(p => ({ playerId: p.id, accountId: p.accountId })),
      spring, room.round.multiplier);
    if (context) context.statsRecorded = true;
  }
  room.phase = 'settlement';
  room.currentPlayerId = null;
  room.message = '本局结束，请准备下一局';

  if (spring) broadcastAll(room, 'notice', { message: landlordWon ? '春天' : '反春', label: landlordWon ? '春天' : '反春', action: 'multiplierChanged', value: room.round.multiplier });
  broadcastAll(room, 'notice', { message: landlordWon ? '地主胜利' : '农民胜利', label: landlordWon ? '地主胜利' : '农民胜利', action: 'roundSettled', actorId: winnerId, value: room.round.multiplier });
}

// ============================================================
// WebSocket server
// ============================================================
function startServer () {
const httpServer = createHttpServer();

// 注册游戏大厅 HTTP handler（wallet/奖励/profile/voice 等，替代 WebSocket 冷启动查询）
registerGameHttpHandler(createGameHttpHandler({
  getEconomy: () => economyPayload(),
  configCenter,
  getOrCreateWallet,
  // HTTP 到账路径（/claim、finishExchange 等）也做房间同步广播
  onWalletChanged: syncRoomStateIfInRoom,
  claimDailyLoginIfNeeded,
  claimAdRewardIfAllowed,
  nextAdRewardAmount,
  newcomerGiftStatus,
  claimNewcomerGiftIfNeeded,
  claimShareRewardIfNeeded,
  claimBankruptRewardIfAllowed,
  claimShortcutRewardIfNeeded,
  buildVoiceConfigForCapabilities,
  getProfileStats: async (accountId) => {
    let stats = {
      springCount: 0, bombCount: 0, maxMultiplier: 0,
      totalGames: 0, totalWins: 0, winRate: 0, maxStreak: 0,
    };
    try {
      const row = await getDb().get(
        'SELECT spring_count, bomb_count, max_multiplier, total_games, total_wins, max_streak FROM player_stats WHERE account_id = ?',
        [accountId]);
      if (row) {
        const totalGames = Number(row.total_games || 0);
        const totalWins = Number(row.total_wins || 0);
        stats = {
          springCount: Number(row.spring_count || 0),
          bombCount: Number(row.bomb_count || 0),
          maxMultiplier: Number(row.max_multiplier || 0),
          totalGames,
          totalWins,
          winRate: totalGames > 0 ? Math.round(totalWins * 100 / totalGames) : 0,
          maxStreak: Number(row.max_streak || 0),
        };
      }
    } catch (e) { /* 表可能尚未迁移，返回默认值 */ }
    let totalBeansEarned = 0;
    try {
      const wallet = await walletStore.getWallet(accountId);
      totalBeansEarned = Number(wallet && wallet.totalEarned || 0);
    } catch (e) { /* ignore */ }
    return { ...stats, totalBeansEarned };
  },
  buySku: async (accountId, sku, requestId, source, capabilities) => {
    if (!VOICE_CHAT.tradeEnabled) {
      return { ok: false, sku, priceBeans: 0, code: 'SKU_DISABLED', message: '购买功能暂未开放' };
    }
    if (!capabilities.has('voice_trade_v1')) {
      return { ok: false, sku, priceBeans: 0, code: 'CLIENT_UPGRADE_REQUIRED', message: '请升级客户端后再购买' };
    }
    if (!isSkuPurchaseEnabled(sku)) {
      return { ok: false, sku, priceBeans: 0, code: 'SKU_DISABLED', message: '该语音包暂不可购买' };
    }
    const result = await purchaseSku({ accountId, sku, requestId, source });
    return result;
  },
  todayKey,
  walletStore,
  entitlementStore,
  catalog,
}));

// 本地调试后台：只在 ADMIN_TOKEN 配置时才注册，未配置则 /admin 返回 404。
if (process.env.ADMIN_TOKEN) {
  const { createAdminHttpHandler } = require('./admin/admin-http');
  registerAdminHttpHandler(createAdminHttpHandler({
    mockExchangeClient: _mockExchangeClient,
    // 只读展示传 live getter（每次请求取当前配置）；写操作走
    // /admin/api/config/save|rollback（config-center，含红线校验与审计）。
    configCenter,
    gameConfig: {
      economy: ECONOMY,
      roomTiers: () => serializeRoomTiers(),
      botMatch: BOT_MATCH,
      voiceChat: VOICE_CHAT,
      security: SECURITY,
      commandRateLimits: COMMAND_RATE_LIMITS,
      timeouts: () => ({
        bid: TIMEOUTS.bid,
        play: TIMEOUTS.play,
        playResponse: PLAY_RESPONSE_TIMEOUT_MS,
        double: TIMEOUTS.double,
        managedDelay: MANAGED_ACTION_DELAY_MS,
      }),
      guestAllowedRoomTypes: Array.from(GUEST_ALLOWED_ROOM_TYPES),
    },
  }));
  logger.info(`[启动] 本地后台已启用 http://127.0.0.1:${PORT}/admin`);
}


const wss = new WebSocketServer({
  server: httpServer,
  // 单帧上限 64KB：本游戏最大的消息也就是一手牌，
  // 不设限则一条超大帧即可打爆内存。
  maxPayload: 64 * 1024,
  verifyClient: (_info, done) => {
    if (!isReady()) return done(false, 503, 'Service not ready');
    done(true);
  },
});
httpServer.listen(PORT, () => {
  logger.info(`[启动] HTTP+WebSocket 端口 ${PORT} 已绑定，等待数据库就绪`);
});

wss.on('connection', (ws, req) => {
  let playerId = null;
  let currentRoomId = null;
  let violationCount = 0;
  const connectionRateBucket = new Map();
  const commandRateBucket = new Map();
  const connId = `conn_${Date.now()}_${Math.random().toString(36).slice(2,5)}`;

  // 本连接绑定的账号身份，只能由 auth 握手写入。
  // 未认证前 boundAccountId 为 null，此时除 auth / ping 外一律拒绝。
  let boundAccountId = null;
  let boundLoginType = '';
  let clientCapabilities = new Set();
  // 已购 sku 缓存：sku → expiresAt（0 = 永久）。长连接期间到期也能拦截 voiceMsg。
  let ownedSkus = new Map();
  let entitlementsGeneration = 0;
  let entitlementsSeq = 0;
  let lastVoiceSentAt = 0;
  let authenticated = false;
  // 本连接已落库的昵称。客户端每次开局/查钱包都会带 nickname，
  // 记下来避免每条消息都打一次 UPDATE（同一连接昵称几乎不变）。
  let persistedNickname = '';
  const clientIp = String(ws._socket?.remoteAddress || '').slice(0, 64);

  async function loadEntitlementsSnapshot (options = {}) {
    const generation = ++entitlementsGeneration;
    try {
      const items = await entitlementStore.listEntitlements(resolveAccountId());
      if (generation !== entitlementsGeneration) return null;
      ownedSkus = new Map(items.map(item => [item.sku, Number(item.expiresAt || 0)]));
      const payload = entitlementPayload(items, ++entitlementsSeq);
      if (options.send !== false) sendTo(ws, 'entitlements', payload);
      return { items, payload };
    } catch (err) {
      if (generation !== entitlementsGeneration) return null;
      logger.warn(`[权益] ${auth.maskId(boundAccountId)} 加载失败: ${err.message}`);
      sendTo(ws, 'entitlementsUnavailable', { seq: ++entitlementsSeq, retryAfterMs: 3000 });
      return null;
    }
  }

  async function hasOwnedSku (sku) {
    const cachedExpiry = ownedSkus.get(sku);
    if (cachedExpiry === 0 || (cachedExpiry > 0 && cachedExpiry > Date.now())) return true;
    const entitlement = await entitlementStore.getEntitlement(resolveAccountId(), sku);
    if (entitlement && !entitlementStore.isExpired(entitlement)) {
      ownedSkus.set(sku, Number(entitlement.expiresAt || 0));
      return true;
    }
    return false;
  }

  // 认证网关：未完成 auth 的连接不允许触碰任何业务逻辑。
  // 返回 true 表示已拦截并回包，调用方应直接 return。
  function requireAuth (type, correlationId = '') {
    if (authenticated) return false;
    logger.warn(`[安全] ${connId} 未认证即请求 ${type}，已拒绝`);
    sendTo(ws, 'error', {
      message: '请先完成登录认证', code: 'UNAUTHENTICATED', commandType: type,
      ...(IAP_MESSAGE_TYPES.has(type) ? { correlationId } : {}),
    });
    ws.close(1008, 'unauthenticated');
    return true;
  }

  async function handleAuth (data) {
    // 重复认证直接回当前身份，杜绝一条连接中途换号
    if (authenticated) {
      const resumeRoomDup = findRecoverableRoomForAccount(boundAccountId);
      sendTo(ws, 'authOk', {
        accountId: boundAccountId,
        loginType: boundLoginType,
        authMode: auth.AUTH_MODE,
        guestAllowed: auth.GUEST_LOGIN_ALLOWED,
        enabledCapabilities: Array.from(clientCapabilities),
        expiresIn: auth.SESSION_TTL_MS,
        resumeRoomId: resumeRoomDup ? resumeRoomDup.roomId : '',
        resumeRoomType: resumeRoomDup ? resumeRoomDup.roomType : '',
        shortcutRewardBeans: ECONOMY.shortcutRewardBeans,
      });
      // voiceConfig 和 entitlements 已通过 HTTP /api/v1/game/bootstrap 下发，此处不再重复推送
      return;
    }

    // 判断是否属于「新建账号」：已有钱包记录即视为老账号，不占新建配额
    let isKnownAccount = false;
    try {
      const probeId = data.sessionToken
        ? (auth.verifySessionToken(data.sessionToken) || {}).accountId
        : (data.deviceId ? auth.deriveGuestAccountId(data.deviceId) : '');
      if (probeId) isKnownAccount = !!(await walletStore.getWallet(probeId));
    } catch { /* 探测失败按新账号处理，偏严格 */ }

    const result = await auth.authenticate(data, { ip: clientIp, isKnownAccount });
    if (!result.ok) {
      logger.warn(`[安全] ${connId} 认证失败 code=${result.code}：${result.reason}`);
      sendTo(ws, 'authFail', { code: result.code, message: result.reason });
      ws.close(1008, 'auth_failed');
      return;
    }

    // 封禁校验必须在置位 authenticated 之前：
    // 一旦放行，后续所有业务分支都不会再检查身份状态。
    try {
      const ban = await accountStore.isBanned(result.identity.accountId);
      if (ban.banned) {
        logger.warn(`[安全] ${connId} 封禁账号尝试登录 ${auth.maskId(result.identity.accountId)}`);
        sendTo(ws, 'authFail', { code: 'ACCOUNT_BANNED', message: ban.reason || '账号已被封禁' });
        ws.close(1008, 'account_banned');
        return;
      }
    } catch (e) {
      // 账号表查询失败不阻断登录：封禁是少数派场景，
      // 因一次 DB 抖动让全量用户登不进去，代价远大于收益。
      logger.warn('[账号] 封禁状态查询失败，按未封禁放行:', e.message);
    }

    // 快手账号必须有支付身份绑定（kwai_identity_bindings）。
    // 只在 resume 路径校验：那条路径是 token 续期，identity 里没有 platformOpenId，
    // 无法补写绑定；若绑定行缺失（典型场景：后端清过账号数据，客户端本地 token
    // 仍有效），放行会产出一个调用支付接口即抛 KWAI_IDENTITY_NOT_BOUND 的残废账号。
    // 此时直接拒绝，逼客户端重新走一次 ks.login，顺带重建绑定。
    // 首次/重新 ks.login 的路径（带 platformOpenId）不校验——绑定行在下面写入。
    if (result.identity.loginType === 'kwai' && !result.identity.platformOpenId) {
      let bound = true;
      try {
        bound = !!(await kwaiIdentityStore.getOpenId(result.identity.accountId));
      } catch (e) {
        // 查询失败不阻断登录：宁可放行一个可能缺绑定的账号，
        // 也不能因一次 DB 抖动把全量快手用户挡在门外。
        logger.warn('[身份] 绑定状态查询失败，按已绑定放行:', e.message);
      }
      if (!bound) {
        logger.warn(`[身份] ${connId} 账号缺支付绑定，要求重新登录 ${auth.maskId(result.identity.accountId)}`);
        sendTo(ws, 'authFail', {
          code: auth.AUTH_ERRORS.IDENTITY_REBIND_REQUIRED,
          loginType: 'kwai',
          message: '登录信息需要刷新，请重新登录',
        });
        ws.close(1008, 'identity_rebind_required');
        return;
      }
    }

    boundAccountId = result.identity.accountId;
    boundLoginType = result.identity.loginType;
    clientCapabilities = sanitizeCapabilities(data.capabilities);
    authenticated = true;

    // 平台托管 IAP 需要在服务重启及用户离线后继续恢复订单，因此快手 open_id
    // 按账号持久化。该值不得写日志、下发客户端或进入普通业务 DTO。
    try {
      await accountStore.recordLogin(boundAccountId, {
        loginType: boundLoginType,
        deviceId: result.identity.deviceId || '',
        kwaiOpenIdHash: result.identity.openIdHash || '',
        ip: clientIp,
      });
      if (boundLoginType === 'kwai' && result.identity.platformOpenId) {
        await kwaiIdentityStore.putOpenId(boundAccountId, result.identity.platformOpenId);
      }
    } catch (e) {
      if (boundLoginType === 'kwai') {
        authenticated = false;
        boundAccountId = null;
        boundLoginType = '';
        logger.error('[身份] 快手账号绑定落库失败');
        sendTo(ws, 'authFail', { code: 'IDENTITY_PERSIST_FAILED', message: '登录信息保存失败，请稍后重试' });
        ws.close(1011, 'identity_persist_failed');
        return;
      }
      logger.warn('[账号] 登录信息落库失败:', e.message);
    }
    logger.info(`[身份] ${connId} 认证通过 type=${boundLoginType} account=${auth.maskId(boundAccountId)}`);

    // 冷启动/新连接自动回房：认证成功后反查该账号是否还在某个进行中的房间里
    // 持有可恢复座位（断线未主动离场）。命中则随 authOk 下发，客户端据此自动重新加入。
    const resumeRoom = findRecoverableRoomForAccount(boundAccountId);
    logger.info(`[回房] ${connId} account=${auth.maskId(boundAccountId)} 反查可恢复房间: ${resumeRoom ? resumeRoom.roomId + '(' + resumeRoom.roomType + ')' : '无'}`);

    sendTo(ws, 'authOk', {
      accountId: boundAccountId,
      loginType: boundLoginType,
      sessionToken: result.token,
      authMode: auth.AUTH_MODE,
      guestAllowed: auth.GUEST_LOGIN_ALLOWED,
      enabledCapabilities: Array.from(clientCapabilities),
      expiresIn: auth.SESSION_TTL_MS,
      resumeRoomId: resumeRoom ? resumeRoom.roomId : '',
      resumeRoomType: resumeRoom ? resumeRoom.roomType : '',
      shortcutRewardBeans: ECONOMY.shortcutRewardBeans,
    });
    // voiceConfig 和 entitlements 已通过 HTTP /api/v1/game/bootstrap 下发，此处不再重复推送
  }

  // 取当前连接已绑定的账号。业务分支必须先经过 requireAuth，
  // 因此这里一定拿得到值；保留兜底抛错以便暴露漏改的调用点。
  function resolveAccountId () {
    if (!boundAccountId) throw new Error('resolveAccountId 在未认证状态下被调用');
    return boundAccountId;
  }

  function sendIap (responseType, commandType, correlationId, payload = {}) {
    sendTo(ws, responseType, { ...payload, commandType, correlationId });
  }

  function sendIapError (commandType, correlationId, err, fallbackCode = 'PAYMENT_UNAVAILABLE') {
    sendTo(ws, 'error', {
      code: err?.code || fallbackCode,
      message: err?.message || '请求失败，请稍后重试',
      commandType,
      correlationId,
    });
  }

  // 账号维度限流：返回 true 表示已被限流并已回包，调用方应直接 return。
  function checkAccountRateLimit (type, accountId, correlationId = '') {
    if (!hitAccountRateLimit(accountId, type)) return false;
    logger.warn(`[安全] 账号 ${accountId} 的 ${type} 操作超出频率限制`);
    sendTo(ws, 'error', {
      message: '操作过于频繁，请稍后再试',
      code: 'ACCOUNT_RATE_LIMITED',
      commandType: type,
      ...(IAP_MESSAGE_TYPES.has(type) ? { correlationId } : {}),
    });
    return true;
  }

  logger.info(`[连接] 新连接 ${connId}，当前在线: ${wss.clients.size}`);

  function recordViolation (reason, fatal = false, context = {}) {
    violationCount += 1;
    logger.warn(`[安全] ${connId} violation=${violationCount}/${SECURITY.maxViolationsPerConnection}: ${reason}`);
    sendTo(ws, 'error', {
      message: reason,
      ...(context.commandType ? {
        code: context.code || 'RATE_LIMITED',
        commandType: context.commandType,
        correlationId: context.correlationId || '',
      } : {}),
    });
    if (fatal || violationCount >= SECURITY.maxViolationsPerConnection) {
      logger.warn(`[安全] ${connId} 因违规过多断开连接`);
      ws.close(1008, 'policy_violation');
      return true;
    }
    return false;
  }

  function checkRateLimit (type, data = {}) {
    const iapContext = IAP_MESSAGE_TYPES.has(type)
      ? { code: 'RATE_LIMITED', commandType: type, correlationId: data.correlationId || '' }
      : {};
    if (hitWindowRateLimit(connectionRateBucket, 'all', { windowMs: SECURITY.connectionWindowMs, max: SECURITY.maxMessagesPerWindow })) {
      // 全连接洪泛仍立即关闭；IAP 请求在关闭前获得可关联的结构化错误。
      return recordViolation('消息过于频繁，请稍后再试', commandRateLimitPolicy(type, 'connection').close, iapContext);
    }
    const limit = COMMAND_RATE_LIMITS[type];
    // IAP 命令级超限是业务软拒绝：不累计 violation、不关闭连接。
    // 语音/购买/权益同步仍在各自业务分支内软拒绝。
    if (IAP_MESSAGE_TYPES.has(type) && limit && hitWindowRateLimit(commandRateBucket, type, limit)) {
      sendTo(ws, 'error', {
        code: 'RATE_LIMITED', message: `${type} 操作过于频繁，请稍后再试`,
        commandType: type, correlationId: data.correlationId || '',
      });
      return true;
    }
    if (!new Set(['voiceMsg', 'buySku', 'getEntitlements', 'getVoiceConfig']).has(type)
        && limit && hitWindowRateLimit(commandRateBucket, type, limit)) {
      return recordViolation(`${type} 操作过于频繁，请稍后再试`, false, iapContext);
    }
    return false;
  }

  ws.on('error', (err) => {
    logger.error(`[错误] ${connId} ws错误:`, err.message);
  });

  // ---- 消息串行化 ----
  // ws 的 message 事件是同步派发的，而处理函数是 async（要查库、落库）。
  // 若不串行化，客户端「auth 后紧跟 getWallet」这种连发场景下，
  // 第二条会在第一条 await 期间就被处理，此时 authenticated 尚未置位，
  // 于是合法请求被误判为未认证并 close(1008) —— 表现为大厅「同步失败」。
  //
  // 这里用 promise 链把同一连接上的消息排成队列。跨连接仍然并发，
  // 不影响吞吐；同连接内的消息本就应该按发送顺序处理。
  let messageChain = Promise.resolve();

  ws.on('message', (raw) => {
    messageChain = messageChain.then(() => handleRawMessage(raw)).catch((err) => {
      // 单条消息失败不能弄断整条队列，否则后续消息会被静默丢弃
      logger.error(`[错误] ${connId} 消息处理异常:`, err && err.message);
    });
  });

  async function handleRawMessage (raw) {
    if (byteLengthOfRawMessage(raw) > SECURITY.maxMessageBytes) {
      recordViolation('消息过大，连接已断开', true);
      return;
    }

    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      recordViolation('消息不是合法 JSON');
      return;
    }

    const validation = validateMessage(msg);
    if (!validation.ok) {
      const rejectedType = sanitizeString(msg?.type, 32, '');
      const rejectedCorrelationId = CORRELATION_ID_RE.test(String(msg?.correlationId || ''))
        ? String(msg.correlationId)
        : '';
      if (IAP_MESSAGE_TYPES.has(rejectedType)) {
        recordViolation(validation.reason, false, {
          code: validation.code || 'INVALID_REQUEST',
          commandType: rejectedType,
          correlationId: rejectedCorrelationId,
        });
      } else {
        recordViolation(validation.reason);
      }
      return;
    }

    const { type, data } = validation;
    if (checkRateLimit(type, data)) return;

    // ---- 心跳 ----
    if (type === 'ping') {
      sendTo(ws, 'pong', {});
      return;
    }

    // ---- 登录认证：必须先于一切业务消息 ----
    if (type === 'auth') {
      await handleAuth(data);
      return;
    }

    // ---- 认证网关 ----
    // 放在所有业务分支之前统一拦截。历史实现允许「建连即 getWallet」，
    // 服务端会顺手造一个 guest_unknown_* 账号并发放新手铁豆，
    // 等价于无限刷号水龙头；这里要求任何业务前必须完成 auth 握手。
    if (requireAuth(type, data.correlationId || '')) return;

    if (IAP_MESSAGE_TYPES.has(type)) {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId, data.correlationId)) return;
    }

    logger.info(`[消息] ${connId} type=${type}`, JSON.stringify(data).slice(0, 120));

    // ---- 昵称落库（供 admin 后台按昵称检索）----
    // auth 帧不带昵称（快手 code2session 只给 open_id），昵称是客户端
    // getUserInfo 后随业务消息自报的，所以只能在这里收。这里刻意不 await：
    // 昵称是展示用缓存，写失败或写慢都不能阻塞改豆/开局/结算。
    if (data.nickname && data.nickname !== persistedNickname) {
      const nickname = accountStore.sanitizeNickname(data.nickname);
      if (nickname && nickname !== persistedNickname) {
        const nicknameAccountId = resolveAccountId();
        accountStore.updateNickname(nicknameAccountId, nickname)
          .then(updated => {
            if (updated && boundAccountId === nicknameAccountId) persistedNickname = nickname;
          })
          .catch(() => {});
      }
    }

    // ---- 钱包查询：进入大厅前同步真实铁豆，新用户在服务端发放 1000，并发放每日登录奖励 ----
    if (type === 'getWallet') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      await getOrCreateWallet(accountId);
      const loginReward = await claimDailyLoginIfNeeded(accountId);
      await sendWalletTo(ws, accountId, {
        rewardType: 'daily_login',
        claimed: loginReward.claimed,
        amount: loginReward.amount,
        message: loginReward.claimed ? `每日登录，获得 ${loginReward.amount} 铁豆` : '',
      });
      if (loginReward.claimed) {
        sendTo(ws, 'notice', { message: `每日登录，获得 ${loginReward.amount} 铁豆`, action: 'rewardClaimed', rewardType: 'daily_login', value: loginReward.amount, claimed: true });
      }
      return;
    }

    // ---- 分享奖励：每日首次分享 +300 铁豆，服务端权威发放 ----
    if (type === 'claimShareReward') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const reward = await claimShareRewardIfNeeded(accountId);
      await sendRewardResult(ws, accountId, 'share_reward', reward, {
        claimed: `分享成功，获得 ${reward.amount} 铁豆`,
        duplicate: '今日分享奖励已领取',
      });
      return;
    }

    // ---- 广告补豆：每日限次递减，服务端权威发放 ----
    // 查询接口：弹窗打开时拉取今日次数（只读，不发豆）
    if (type === 'getAdRewardStatus') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const status = await walletStore.getDailyRewardStatus(accountId, 'ad_reward', todayKey());
      sendTo(ws, 'adRewardStatus', {
        claimCount: status.claimCount,
        maxClaimsPerDay: ECONOMY.adRewardMaxPerDay,
        remaining: Math.max(0, ECONOMY.adRewardMaxPerDay - status.claimCount),
        nextRewardAmount: nextAdRewardAmount(status.claimCount),
        dailyCapAmount: ECONOMY.adRewardDailyCapBeans,
        totalAmount: status.totalAmount,
      });
      return;
    }

    if (type === 'claimAdReward') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const adTransId = sanitizeAccountLikeId(data.adTransId || data.transId || '');
      const reward = await claimAdRewardIfAllowed(accountId, adTransId);
      const nextReward = nextAdRewardAmount(reward.claimCount || 0);
      await sendRewardResult(ws, accountId, 'ad_reward', { ...reward, nextRewardAmount: nextReward }, {
        claimed: `第${reward.claimCount || 0}次广告奖励，获得 ${reward.amount} 铁豆`,
        duplicate: '今日广告奖励已达上限，明日再来',
      });
      return;
    }

    // ---- 破产补助：结算输钱后余额低于初级场门槛，每日 1 次 ----
    if (type === 'claimBankruptReward') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const reward = await claimBankruptRewardIfAllowed(accountId);
      await sendRewardResult(ws, accountId, 'bankrupt_relief', reward, {
        claimed: `破产补助，获得 ${reward.amount} 铁豆`,
        duplicate: reward.notEligible ? `余额未低于 ${ECONOMY.bankruptThresholdBeans} 铁豆，暂不可领取` : '破产补助已用完，明日再来',
      });
      return;
    }

    // ---- 加桌奖励：每日首次添加到桌面 +500 铁豆，服务端权威发放 ----
    if (type === 'claimShortcutReward') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const reward = await claimShortcutRewardIfNeeded(accountId);
      await sendRewardResult(ws, accountId, 'shortcut_reward', reward, {
        claimed: `加桌成功，获得 ${reward.amount} 铁豆`,
        duplicate: '加桌奖励已领取',
      });
      return;
    }

    // ---- 成就统计拉取：春天/炸弹/最高倍 + 总豆数（wallets.total_earned）----
    if (type === 'getProfileStats') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      let stats = {
        springCount: 0, bombCount: 0, maxMultiplier: 0,
        totalGames: 0, totalWins: 0, winRate: 0, maxStreak: 0,
      };
      try {
        // db.get 是 async（返回 Promise），必须 await——否则 row 是 Promise，
        // 字段读取全是 undefined，表现为统计恒为 0
        const row = await getDb().get(
          'SELECT spring_count, bomb_count, max_multiplier, total_games, total_wins, max_streak FROM player_stats WHERE account_id = ?',
          [accountId]);
        if (row) {
          const totalGames = Number(row.total_games || 0);
          const totalWins = Number(row.total_wins || 0);
          stats = {
            springCount: Number(row.spring_count || 0),
            bombCount: Number(row.bomb_count || 0),
            maxMultiplier: Number(row.max_multiplier || 0),
            totalGames,
            totalWins,
            winRate: totalGames > 0 ? Math.round(totalWins * 100 / totalGames) : 0,
            maxStreak: Number(row.max_streak || 0),
          };
        }
      } catch (e) { /* 表可能尚未迁移，返回默认值 */ }
      let totalBeansEarned = 0;
      try {
        const wallet = await walletStore.getWallet(accountId);
        totalBeansEarned = Number(wallet && wallet.totalEarned || 0);
      } catch (e) { /* ignore */ }
      sendTo(ws, 'profileStats', { ...stats, totalBeansEarned });
      return;
    }

    // ---- 新手礼包：客户端上线查状态，未领取弹窗，点领取后服务端发放 ----
    if (type === 'getNewcomerGiftStatus') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      sendTo(ws, 'newcomerGiftStatus', await newcomerGiftStatus(accountId));
      return;
    }

    if (type === 'claimNewcomerGift') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const reward = await claimNewcomerGiftIfNeeded(accountId);
      await sendRewardResult(ws, accountId, 'newcomer_gift', reward, {
        claimed: `新手礼包已领取，获得 ${reward.amount} 铁豆`,
        duplicate: '新手礼包已领取过',
      });
      return;
    }

    // ---- 权益完整快照：大厅与房间均可调用 ----
    if (type === 'getEntitlements') {
      const accountId = resolveAccountId();
      if (hitWindowRateLimit(commandRateBucket, type, COMMAND_RATE_LIMITS[type])
          || hitAccountRateLimit(accountId, type)) {
        sendTo(ws, 'error', { code: 'ENTITLEMENTS_UNAVAILABLE', message: '同步过于频繁，请稍后再试', retryAfterMs: 3000 });
        return;
      }
      await loadEntitlementsSnapshot();
      return;
    }

    // ---- 语音配置拉取 ----
    if (type === 'getVoiceConfig') {
      if (VOICE_CHAT.enabled) sendTo(ws, 'voiceConfig', buildVoiceConfigForCapabilities(clientCapabilities));
      return;
    }

    // ---- SKU 购买：必须位于房间 guard 之前，允许大厅购买 ----
    if (type === 'buySku') {
      const accountId = resolveAccountId();
      if (hitWindowRateLimit(commandRateBucket, type, COMMAND_RATE_LIMITS[type])
          || hitAccountRateLimit(accountId, type)) {
        sendTo(ws, 'purchaseResult', {
          requestId: data.requestId || '', ok: false, sku: data.sku,
          owned: false, charged: false, priceBeans: 0,
          code: 'ACCOUNT_RATE_LIMITED', message: '购买过于频繁，请稍后再试',
        });
        return;
      }
      if (!clientCapabilities.has('voice_trade_v1')) {
        sendTo(ws, 'purchaseResult', {
          requestId: data.requestId || '', ok: false, sku: data.sku,
          owned: false, charged: false, priceBeans: 0,
          code: 'CLIENT_UPGRADE_REQUIRED', message: '请升级客户端后再购买',
        });
        return;
      }
      if (!VOICE_CHAT.tradeEnabled) {
        sendTo(ws, 'purchaseResult', {
          requestId: data.requestId || '', ok: false, sku: data.sku,
          owned: false, charged: false, priceBeans: 0,
          code: 'SKU_DISABLED', message: '购买功能暂未开放',
        });
        return;
      }
      const requestedItem = catalog.get(data.sku);
      if (requestedItem && !isSkuPurchaseEnabled(data.sku)) {
        sendTo(ws, 'purchaseResult', {
          requestId: data.requestId || '', ok: false, sku: data.sku,
          owned: false, charged: false, priceBeans: requestedItem.priceBeans,
          code: 'SKU_DISABLED', message: '该语音包暂不可购买',
        });
        return;
      }

      ++entitlementsGeneration; // 使认证后仍在飞行的旧快照失效
      let result;
      try {
        result = await purchaseSku({
          accountId,
          sku: data.sku,
          isGuest: isGuestAccount(boundLoginType),
          initialBeans: ECONOMY.newUserBeans,
          todayKey: todayKey(),
          context: {
            source: data.source || 'unknown',
            roomId: currentRoomId || '',
          },
        });
      } catch (err) {
        logger.error(`[交易] ${auth.maskId(accountId)} 购买 ${data.sku} 异常:`, err.message);
        sendTo(ws, 'purchaseResult', {
          requestId: data.requestId || '', ok: false, sku: data.sku,
          owned: false, charged: false, priceBeans: 0,
          code: 'PURCHASE_FAILED', message: '购买失败，请稍后重试',
        });
        return;
      }

      if (!result.ok) {
        void loadEntitlementsSnapshot();
        sendTo(ws, 'purchaseResult', {
          requestId: data.requestId || '',
          ok: false,
          sku: result.sku || data.sku,
          owned: false,
          charged: false,
          priceBeans: result.priceBeans || 0,
          code: result.code || 'PURCHASE_FAILED',
          message: result.message || '购买失败',
        });
        return;
      }

      const generation = ++entitlementsGeneration;
      let items = null;
      try {
        items = await entitlementStore.listEntitlements(accountId);
      } catch (err) {
        logger.warn(`[权益] 购买后快照加载失败 ${auth.maskId(accountId)}: ${err.message}`);
      }
      const snapshotCurrent = generation === entitlementsGeneration;
      let entitlements = null;
      if (items && snapshotCurrent) {
        ownedSkus = new Map(items.map(item => [item.sku, Number(item.expiresAt || 0)]));
        entitlements = entitlementPayload(items, ++entitlementsSeq);
      } else {
        ownedSkus.set(result.sku, Number(result.entitlement && result.entitlement.expiresAt) || 0);
      }
      // 所有查询完成后连续入队，中间不得再 await。快照失败也必须结束购买 pending。
      sendTo(ws, 'wallet', {
        wallet: result.wallet,
        accountType: boundLoginType,
        guestAllowedRoomTypes: Array.from(GUEST_ALLOWED_ROOM_TYPES),
        economy: economyPayload(),
        walletSource: 'server',
        economyVersion: ECONOMY.version,
        initialBeans: ECONOMY.newUserBeans,
        serverNow: Date.now(),
      });
      if (entitlements) sendTo(ws, 'entitlements', entitlements);
      else sendTo(ws, 'entitlementsUnavailable', { seq: ++entitlementsSeq, retryAfterMs: 3000 });
      sendTo(ws, 'purchaseResult', {
        requestId: data.requestId || '',
        ok: true,
        sku: result.sku,
        owned: true,
        charged: !!result.charged,
        priceBeans: result.priceBeans,
      });
      logger.info(`[交易] ${auth.maskId(accountId)} 购买 ${result.sku} success charged=${!!result.charged} price=${result.priceBeans}`);
      return;
    }

    // ---- IAP：商品查询 ----
    if (type === 'getIapCatalog') {
      try {
        const cfg = getIapConfig();
        const products = cfg.orderCreateEnabled ? await iapCatalog.getEnabledProducts(undefined) : [];
        sendIap('iapCatalog', type, data.correlationId, {
          catalogVersion: 1,
          items: products.map(p => ({
            skuId:       p.skuId,
            priceFen:    p.priceFen,
            priceText:   `¥${BigInt(p.priceFen) / 100n}`,
            diamonds:    p.platformCoinAmount,
            goodsName:   p.displayName,
            platforms: [
              cfg.androidEnabled && p.enabledAndroid && 'android',
              cfg.iosEnabled && p.enabledIos && 'ios',
            ].filter(Boolean),
          })).filter(item => item.platforms.length > 0),
        });
      } catch (err) {
        sendIapError(type, data.correlationId, err);
      }
      return;
    }

    // ---- IAP：创建订单 ----
    if (type === 'createIapOrder') {
      const accountId = resolveAccountId();
      try {
        const result = await iapOrderService.createOrder({
          accountId,
          loginType: boundLoginType,
          skuId:           String(data.skuId || ''),
          platform:        String(data.os || data.platform || ''),
          clientRequestId: String(data.requestId || ''),
          clientIp,
        });
        sendIap('iapOrderCreated', type, data.correlationId, result);
      } catch (err) {
        sendIapError(type, data.correlationId, err);
      }
      return;
    }

    // ---- IAP：上报客户端支付结果 ----
    if (type === 'reportIapClientResult') {
      const accountId = resolveAccountId();
      try {
        await iapOrderService.reportClientResult(
          accountId,
          String(data.orderId || ''),
          String(data.code ?? ''),
          String(data.message || '').slice(0, 255),
        );
        sendIap('iapClientResultRecorded', type, data.correlationId, { orderId: data.orderId });
      } catch (err) {
        sendIapError(type, data.correlationId, err, 'ORDER_NOT_FOUND');
      }
      return;
    }

    // ---- IAP：查询充值订单 ----
    if (type === 'getIapOrder') {
      const accountId = resolveAccountId();
      try {
        const order = await iapOrderService.getOrderForAccount(accountId, String(data.orderId || ''));
        sendIap('iapOrder', type, data.correlationId, {
          orderId:             order.orderId,
          skuId:               order.skuId,
          status:              order.status,
          purchasedCoins:      order.platformCoinAmount,
          createdAt:           order.createdAt,
          paymentConfirmedAt:  order.paymentConfirmedAt,
        });
      } catch (err) {
        sendIapError(type, data.correlationId, err, 'ORDER_NOT_FOUND');
      }
      return;
    }

    // ---- IAP：查询当前账号可恢复订单 ----
    if (type === 'getPendingIapOrders') {
      const accountId = resolveAccountId();
      try {
        const orders = await iapOrderService.listPendingOrders(accountId);
        sendIap('pendingIapOrders', type, data.correlationId, {
          orders: orders.map(order => ({
            orderId: order.orderId,
            skuId: order.skuId,
            status: order.status,
            purchasedCoins: order.platformCoinAmount,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
          })),
        });
      } catch (err) {
        sendIapError(type, data.correlationId, err);
      }
      return;
    }

    // ---- IAP：查询快手平台币余额 ----
    if (type === 'getPlatformCoinBalance') {
      const accountId = resolveAccountId();
      try {
        if (!iapConfig.platformEnabled) {
          throw Object.assign(new Error('payment unavailable'), { code: 'PAYMENT_UNAVAILABLE' });
        }
        const balance = await platformBalanceService.getBalance({
          accountId,
          loginType: boundLoginType,
          os: String(data.os || ''),
          userIp: clientIp,
        });
        sendIap('platformCoinBalance', type, data.correlationId, balance);
      } catch (err) {
        sendIapError(type, data.correlationId, err);
      }
      return;
    }

    // ---- IAP：平台币兑换商品查询 ----
    if (type === 'getPlatformCoinExchangeCatalog') {
      try {
        // 未认证连接也允许查目录，此时首充按「未领取」展示
        const products = iapConfig.exchangeEnabled
          ? await exchangeCatalog.getExchangeProductsForAccount(boundAccountId)
          : [];
        sendIap('platformCoinExchangeCatalog', type, data.correlationId, {
          catalogVersion: 1,
          items: products,
        });
      } catch (err) {
        sendIapError(type, data.correlationId, err);
      }
      return;
    }

    // ---- IAP：创建平台扣币兑换订单 ----
    if (type === 'createPlatformCoinExchange') {
      const accountId = resolveAccountId();
      try {
        if (!iapConfig.platformEnabled || !iapConfig.exchangeEnabled) {
          throw Object.assign(new Error('exchange disabled'), { code: 'PAYMENT_DISABLED' });
        }
        const result = await platformExchangeService.exchange({
          accountId,
          loginType: boundLoginType,
          exchangeSkuId: String(data.exchangeSkuId || ''),
          clientRequestId: String(data.clientRequestId || ''),
          os: String(data.os || ''),
          userIp: clientIp,
        });
        sendIap('platformCoinExchangeAccepted', type, data.correlationId, result);
      } catch (err) {
        sendIapError(type, data.correlationId, err);
      }
      return;
    }

    // ---- IAP：查询平台扣币兑换订单 ----
    if (type === 'getPlatformCoinExchange') {
      const accountId = resolveAccountId();
      try {
        const result = await platformExchangeService.getOrderForAccount(
          accountId,
          String(data.exchangeOrderId || ''),
        );
        sendIap('platformCoinExchangeResult', type, data.correlationId, result);
      } catch (err) {
        sendIapError(type, data.correlationId, err, 'ORDER_NOT_FOUND');
      }
      return;
    }

    // ---- 快速匹配 ----
    if (type === 'quickMatch') {
      const qNickname = (data.nickname || '玩家').trim().slice(0, 12) || '玩家';
      const qAvatar = data.avatarUrl || '';
      const qRoomType = sanitizeRoomType(data.roomType || DEFAULT_ROOM_TYPE);
      const qTier = getRoomTier(qRoomType);
      const qAccountId = resolveAccountId();
      if (playerId && currentRoomId && rooms.has(currentRoomId)) {
        sendTo(ws, 'error', { code: 'ALREADY_IN_ROOM', message: '你已在房间中，无法重复匹配' });
        return;
      }
      const detachedStaleBlocks = await detachStaleAccountBlocks(qAccountId);
      if (detachedStaleBlocks > 0) {
        logger.info(`[匹配] 账号 ${auth.maskId(qAccountId)} 清理陈旧房间占用 ${detachedStaleBlocks} 个`);
      }
      const occupiedRoom = Array.from(rooms.values()).find(room =>
        Object.values(room.players || {}).some(player => playerBlocksNewSession(player, qAccountId))
      );
      if (occupiedRoom) {
        sendTo(ws, 'error', { code: 'ALREADY_IN_ROOM', message: '该账号已在其他房间中' });
        return;
      }
      if (checkAccountRateLimit(type, qAccountId)) return;
      const existingSession = matchOrchestrator.sessions.getByAccount(qAccountId);
      if (existingSession) {
        matchOrchestrator.resume(qAccountId, ws);
        sendTo(ws, 'matchWaiting', {
          matchRequestId: existingSession.matchRequestId,
          queueLength: matchOrchestrator.queueLength(existingSession.roomType),
          roomType: existingSession.roomType,
          roomName: getRoomTier(existingSession.roomType).name,
          status: existingSession.status,
        });
        return;
      }
      const qGuestReject = guestRoomTypeRejection(boundLoginType, qRoomType);
      if (qGuestReject) {
        sendTo(ws, 'error', { ...qGuestReject, roomType: qTier.type });
        return;
      }
      if (await rejectIfEscapeCd(ws, qAccountId)) return;
      if (!(await hasEnoughBeansToMatch(qAccountId, qRoomType))) {
        sendTo(ws, 'error', {
          message: `${qTier.name}至少需要 ${qTier.minBeansToMatch} 铁豆才能匹配`,
          code: 'INSUFFICIENT_MATCH_BEANS',
          roomType: qTier.type,
          requiredBeans: qTier.minBeansToMatch,
          currentBeans: (await getOrCreateWallet(qAccountId)).beans,
        });
        await sendWalletTo(ws, qAccountId);
        return;
      }
      const { session } = matchOrchestrator.enqueue({
        ws,
        nickname: qNickname,
        avatarUrl: qAvatar,
        accountId: qAccountId,
        loginType: boundLoginType,
        roomType: qTier.type,
        // 匹配资产区间（±30%）：入队时的可用铁豆快照，供 orchestrator 资产带配对
        availableBeans: (await getOrCreateWallet(qAccountId)).availableBeans,
      });
      logger.info(`[匹配] ${qNickname}(${connId}) 进入${qTier.name}队列，当前人数: ${matchOrchestrator.queueLength(qTier.type)}`);
      sendTo(ws, 'matchWaiting', {
        matchRequestId: session.matchRequestId,
        queueLength: matchOrchestrator.queueLength(qTier.type),
        roomType: qTier.type,
        roomName: qTier.name,
        status: session.status,
      });
      await processMatchQueue(qRoomType);
      return;
    }

    // ---- 恢复匹配 ----
    if (type === 'resumeMatch') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const session = matchOrchestrator.resume(accountId, ws);
      if (!session || (data.matchRequestId && data.matchRequestId !== session.matchRequestId)) {
        sendTo(ws, 'matchExpired', { matchRequestId: data.matchRequestId || '' });
        return;
      }
      if (session.status === 'reserved' && session.roomId) {
        const issued = joinReservations.reissue(accountId);
        if (issued) {
          sendTo(ws, 'matchFound', {
            roomId: session.roomId,
            roomType: session.roomType,
            roomName: getRoomTier(session.roomType).name,
            entryFeeBeans: getRoomTier(session.roomType).entryFeeBeans,
            matchRequestId: session.matchRequestId,
            joinTicket: issued.joinTicket,
            joinExpiresAt: issued.expiresAt,
          });
          return;
        }
      }
      sendTo(ws, 'matchWaiting', {
        matchRequestId: session.matchRequestId,
        queueLength: matchOrchestrator.queueLength(session.roomType),
        roomType: session.roomType,
        roomName: getRoomTier(session.roomType).name,
        status: session.status,
      });
      return;
    }

    // ---- 取消匹配 ----
    if (type === 'cancelMatch') {
      const accountId = resolveAccountId();
      removeFromQueue(accountId, data.matchRequestId || '');
      logger.info(`[匹配] ${connId} 取消匹配，队列剩余: ${matchQueueSize()}`);
      return;
    }

    // ---- 创建房间 ----
    if (type === 'createRoom') {
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      const roomType = sanitizeRoomType(data.roomType || DEFAULT_ROOM_TYPE);
      const tier = getRoomTier(roomType);
      const createGuestReject = guestRoomTypeRejection(boundLoginType, roomType);
      if (createGuestReject) {
        sendTo(ws, 'error', { ...createGuestReject, roomType: tier.type });
        return;
      }
      if (await rejectIfEscapeCd(ws, accountId)) return;
      if (!(await hasEnoughBeansToMatch(accountId, roomType))) {
        sendTo(ws, 'error', { message: `${tier.name}至少需要 ${tier.minBeansToMatch} 铁豆才能创建房间` });
        await sendWalletTo(ws, accountId);
        return;
      }
      const roomId = generateRoomId();
      getOrCreateRoom(roomId, roomType);
      sendTo(ws, 'roomCreated', { roomId, roomType: tier.type, roomName: tier.name, entryFeeBeans: tier.entryFeeBeans });
      logger.info(`[房间] 创建 ${tier.name} roomId=${roomId}，by ${connId}，当前房间总数: ${rooms.size}`);
      return;
    }

    // ---- 加入房间 ----
    if (type === 'join') {
      if (playerId && currentRoomId && currentRoomId !== data.roomId && rooms.has(currentRoomId)) {
        sendTo(ws, 'error', { code: 'ALREADY_IN_ROOM', message: '请先离开当前房间' });
        return;
      }
      const roomId = data.roomId;
      const name = (data.nickname || data.playerName || '玩家').trim().slice(0, 12) || '玩家';
      const avatarUrl = data.avatarUrl || '';
      const accountId = resolveAccountId();
      if (checkAccountRateLimit(type, accountId)) return;
      if (!roomId) { sendTo(ws, 'error', { message: '房间号不能为空' }); return; }
      if (await rejectIfEscapeCd(ws, accountId)) return;
      const existingRoom = rooms.get(roomId);
      if (existingRoom?.isMatchmakingRoom) {
        const hasExistingSeat = Object.values(existingRoom.players || {}).some(player =>
          playerBlocksNewSession(player, accountId)
        );
        const session = matchOrchestrator.sessions.getByAccount(accountId);
        if (!hasExistingSeat && (!session || session.roomId !== roomId || session.matchRequestId !== data.matchRequestId)) {
          sendTo(ws, 'error', { code: 'MATCH_RESERVATION_REQUIRED', message: '匹配入场预约无效或已过期' });
          return;
        }
        if (!hasExistingSeat) {
          const consumed = joinReservations.validateAndConsume({
            accountId,
            roomId,
            matchRequestId: data.matchRequestId,
            joinTicket: data.joinTicket,
          });
          if (!consumed.ok) {
            sendTo(ws, 'error', { code: 'INVALID_JOIN_TICKET', message: '匹配入场凭证无效或已过期' });
            return;
          }
          matchOrchestrator.markJoining(accountId);
        }
      }
      const room = existingRoom || getOrCreateRoom(roomId, data.roomType || DEFAULT_ROOM_TYPE);
      const tier = getRoomTierForRoom(room);
      // 房间档位以服务端房间对象为准，避免游客用低档 roomType 参数混入高档房
      const joinGuestReject = guestRoomTypeRejection(boundLoginType, tier.type);
      if (joinGuestReject) {
        sendTo(ws, 'error', { ...joinGuestReject, roomType: tier.type });
        return;
      }

      // check for reconnection /托管恢复（同账号）
      for (const [pid, p] of Object.entries(room.players)) {
        if (playerCanRecoverSeat(p, accountId)) {
          const wasManaged = !!p.autoManaged;
          playerId = pid;
          currentRoomId = roomId;
          clearDisconnectTimer(room, playerId);
          p.connected = true;
          p.autoManaged = false;
          p.autoManagedReason = '';
          p.autoManagedAt = 0;
          p.autoManagedTurns = 0;
          p.ws = ws;
          p.avatarUrl = avatarUrl;
          p.accountId = accountId;
          await syncPlayerBeans(room, playerId);
          sendTo(ws, 'joined', { playerId, seat: p.seat, roomId, roomType: tier.type, roomName: tier.name, entryFeeBeans: tier.entryFeeBeans, wallet: await getOrCreateWallet(accountId), recoveredFromManaged: wasManaged });
          if (VOICE_CHAT.enabled) sendTo(ws, 'voiceConfig', buildVoiceConfigForCapabilities(clientCapabilities));
          void loadEntitlementsSnapshot();
          sendTo(ws, 'state', buildStatePayload(room, playerId));
          if (room.hands[playerId]) sendTo(ws, 'hand', { cards: room.hands[playerId] });
          const action = wasManaged ? 'playerUnmanaged' : 'playerReconnected';
          const label = wasManaged ? '退出托管' : '重连';
          broadcastAll(room, 'notice', { message: `${name} ${label}`, action, actorId: playerId, label });
          await matchStore.appendMatchEvent(room, wasManaged ? 'unmanaged' : 'reconnect', { playerId, recoveredFromManaged: wasManaged }, p);
          broadcastAll(room, 'state');
          return;
        }
      }

      if (!(await hasEnoughBeansToMatch(accountId, tier.type))) {
        sendTo(ws, 'error', { message: `${tier.name}至少需要 ${tier.minBeansToMatch} 铁豆才能进入房间` });
        await sendWalletTo(ws, accountId);
        return;
      }

      const seat = room.seats.findIndex(s => s === null);
      if (seat < 0) { sendTo(ws, 'error', { message: '房间已满' }); return; }

      playerId = `p_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      currentRoomId = roomId;

      room.seats[seat] = playerId;
      const wallet = await getOrCreateWallet(accountId);
      room.players[playerId] = { id: playerId, accountId, name, avatarUrl, seat, ready: !!room.isMatchmakingRoom, beans: wallet.beans, roundDelta: 0, totalDelta: 0, connected: true, controllerType: 'human', isBot: false, autoManaged: false, autoManagedReason: '', autoManagedAt: 0, autoManagedTurns: 0, detachedFromSession: false, exitPenaltyApplied: false, role: null, ws };
      room.handCounts[playerId] = 0;

      if (playerCount(room) === 3) {
        room.phase = 'ready';
        room.message = '请准备';
      } else {
        room.message = `等待三名玩家加入（当前 ${playerCount(room)} 人）`;
      }

      sendTo(ws, 'joined', { playerId, seat, roomId, roomType: tier.type, roomName: tier.name, entryFeeBeans: tier.entryFeeBeans, wallet });
      if (VOICE_CHAT.enabled) sendTo(ws, 'voiceConfig', buildVoiceConfigForCapabilities(clientCapabilities));
      void loadEntitlementsSnapshot();
      if (room.isMatchmakingRoom) {
        matchOrchestrator.markActive(accountId);
        matchOrchestrator.complete(accountId, 'active');
      }
      await matchStore.appendMatchEvent(room, 'join', { playerId, seat, roomId, roomType: tier.type, roomName: tier.name }, room.players[playerId]);
      logger.info(`[加入] ${name}(${connId}) 加入${tier.name}房间 ${roomId}，座位 ${seat}，当前人数: ${playerCount(room)}`);

      for (const p of allPlayers(room)) {
        sendTo(p.ws, 'state', buildStatePayload(room, p.id));
      }
      broadcastAll(room, 'notice', { message: `${name} 加入了房间` });
      if (room.isMatchmakingRoom) await tryStartReadyRoom(room);
      return;
    }

    // ---- 退出房间 ----
    if (type === 'leaveRoom') {
      if (!playerId || !currentRoomId) return;
      const room = rooms.get(currentRoomId);
      if (!room) { playerId = null; currentRoomId = null; sendTo(ws, 'leftRoom', {}); return; }
      const p = room.players[playerId];
      if (!p) { playerId = null; currentRoomId = null; sendTo(ws, 'leftRoom', {}); return; }

      if (room.phase === 'bidding' || room.phase === 'doubling' || room.phase === 'playing') {
        // 主动退出进行中牌局：当前局仍保留旧座位交给托管结算，但必须立刻解除账号占用，
        // 允许用户回大厅后开启下一局匹配；同时该旧座位不可再被重连恢复。
        p.detachedFromSession = true;
        await markManagedPlayer(room, playerId, 'active_leave');
        await sendWalletTo(ws, p.accountId);
        playerId = null;
        currentRoomId = null;
        sendTo(ws, 'leftRoom', { managed: true });
        return;
      }

      // remove player before game starts / after settlement
      clearDisconnectTimer(room, playerId);
      room.seats[p.seat] = null;
      delete room.players[playerId];
      delete room.handCounts[playerId];
      delete room.hands[playerId];

      sendTo(ws, 'leftRoom', {});
      await matchStore.appendMatchEvent(room, 'leave', { playerId, phase: room.phase }, p);

      const remaining = allPlayers(room);
      if (remaining.length === 0) {
        // 无人则解散房间
        clearActionTimer(room);
        rooms.delete(currentRoomId);
        logger.info(`[房间] ${currentRoomId} 已解散（无人离开），剩余房间数: ${rooms.size}`);
      } else {
        if (remaining.length < 3) {
          clearActionTimer(room);
          room.phase = 'waiting';
          room.message = `等待三名玩家加入（当前 ${remaining.length} 人）`;
        }
        broadcastAll(room, 'notice', { message: `${p.name} 离开了房间` });
        broadcastAll(room, 'state');
      }

      playerId = null;
      currentRoomId = null;
      return;
    }

    // ---- 以下需要已加入房间 ----
    if (!playerId) { sendTo(ws, 'error', { message: '请先加入房间' }); return; }
    const room = rooms.get(currentRoomId);
    if (!room) { sendTo(ws, 'error', { message: '房间不存在' }); return; }
    const me = room.players[playerId];
    if (!me) { sendTo(ws, 'error', { message: '你不在房间中' }); return; }

    if (type === 'setReady') {
      if (!(room.phase === 'ready' || room.phase === 'settlement')) return;
      const tier = getRoomTierForRoom(room);
      await syncPlayerBeans(room, playerId);
      if (data.ready === true && me.beans < tier.minBeansToReady) {
        sendTo(ws, 'error', { message: `${tier.name}至少需要 ${tier.minBeansToReady} 铁豆才能准备` });
        broadcastAll(room, 'state');
        return;
      }
      me.ready = data.ready === true;
      await matchStore.appendMatchEvent(room, 'ready', { playerId, ready: me.ready }, me);
      logger.info(`[准备] ${me.name} 在房间 ${currentRoomId} ${me.ready ? '已准备' : '取消准备'}`);
      room.message = '等待所有玩家准备';
      broadcastAll(room, 'state');

      await tryStartReadyRoom(room);
      return;
    }

    if (type === 'bid') {
      const score = Number(data.score);
      logger.info(`[叫地主] ${me.name} score=${score}，房间 ${currentRoomId}`);
      await applyBid(room, playerId, score, false);
      return;
    }

    if (type === 'double') {
      const multiplier = Number(data.multiplier);
      logger.info(`[加倍] ${me.name} multiplier=${multiplier}，房间 ${currentRoomId}`);
      await applyDouble(room, playerId, multiplier, false);
      return;
    }

    if (type === 'playCards') {
      const ids = Array.isArray(data.cardIds) ? data.cardIds : [];
      await applyPlayCards(room, playerId, ids, false);
      return;
    }

    if (type === 'pass') {
      await applyPass(room, playerId, false);
      return;
    }

    if (type === 'syncHand') {
      sendTo(ws, 'hand', { cards: room.hands[playerId] || [] });
      return;
    }

    if (type === 'hint') {
      if (room.phase !== 'playing' || room.currentPlayerId !== playerId) {
        sendTo(ws, 'hintResult', { source: 'none', cardIds: [] });
        return;
      }
      const hintDecisionId = `hint:${room.instanceId}:${Date.now()}`;
      let hintObservation;
      try {
        hintObservation = buildObservation(room, playerId);
      } catch (_) {
        sendTo(ws, 'hintResult', { source: 'none', cardIds: [] });
        return;
      }
      if (hintObservation.phase !== 'playing') {
        sendTo(ws, 'hintResult', { source: 'none', cardIds: [] });
        return;
      }
      const hintRoomMode = room.botDecisionMode || 'active';
      // 真人提示始终尝试 DouZero（active 模式），与机器人决策路由复用同一 client/circuit
      const hintResult = await decisionRouter.resolve(hintObservation, {
        mode: hintRoomMode === 'off' ? 'rule' : 'active',
        decisionId: hintDecisionId,
        deadlineAt: Date.now() + 800,
      }).catch(() => null);
      if (!hintResult || hintResult.type === 'pass') {
        sendTo(ws, 'hintResult', { source: 'rule', cardIds: [] });
        return;
      }
      const source = hintResult.meta?.selectedEngine === 'douzero' ? 'douzero' : 'rule';
      const cardIds = hintResult.type === 'playCards' ? (hintResult.cardIds || []) : [];
      logger.info(`[提示] ${me.name} room=${currentRoomId} source=${source} cards=${cardIds.length}`);
      sendTo(ws, 'hintResult', { source, cardIds });
      return;
    }

    if (type === 'voiceMsg') {
      function rejectVoice (code, message, cooldownMs) {
        sendTo(ws, 'error', { code, message, ...(cooldownMs > 0 ? { cooldownMs } : {}) });
      }

      if (!VOICE_CHAT.enabled) {
        rejectVoice('VOICE_FORBIDDEN_STATE', '语音功能暂不可用');
        return;
      }
      if (hitWindowRateLimit(commandRateBucket, 'voiceMsg', COMMAND_RATE_LIMITS.voiceMsg)
          || hitAccountRateLimit(resolveAccountId(), 'voiceMsg')) {
        rejectVoice('VOICE_RATE_LIMITED', '发送过于频繁，请稍后再试');
        return;
      }
      if (!canPlayerSendVoice(me)) {
        rejectVoice('VOICE_FORBIDDEN_STATE', '当前状态无法发送语音');
        return;
      }

      const cfg = VOICE_BY_ID.get(data.voiceId);
      if (!cfg) {
        rejectVoice('VOICE_NOT_FOUND', '语音不存在或已下线');
        return;
      }

      const now = Date.now();
      const remainingCooldown = Math.max(0, VOICE_CHAT.cooldownMs - (now - lastVoiceSentAt));
      if (remainingCooldown > 0) {
        rejectVoice('VOICE_COOLDOWN', '发送太快了，请稍后再试', remainingCooldown);
        return;
      }

      if (!cfg.free && !(await hasOwnedSku(cfg.sku))) {
        rejectVoice('VOICE_NOT_OWNED', '尚未拥有该语音包');
        return;
      }

      broadcastVoice(room, {
        playerId,
        name: me.name || '',
        voiceId: data.voiceId,
        packId: cfg.packId || '',
        text: cfg.text,
        voiceUrl: cfg.voiceUrl,
        audioKey: cfg.audioKey || '',
        sentAt: now,
      });
      lastVoiceSentAt = now;
      return;
    }
  }

  ws.on('close', async () => {
    // 排队会话按账号保留，重连后可 resumeMatch；仅清空已失效连接引用。
    const queuedSession = boundAccountId ? matchOrchestrator.sessions.getByAccount(boundAccountId) : null;
    if (queuedSession && queuedSession.ws === ws) matchOrchestrator.sessions.update(queuedSession, { ws: null });
    logger.info(`[断开] ${connId} 断开连接，在线: ${wss.clients.size}`);

    if (!playerId || !currentRoomId) return;
    const room = rooms.get(currentRoomId);
    if (!room) return;
    const p = room.players[playerId];
    if (!p) return;

    if (room.phase === 'bidding' || room.phase === 'doubling' || room.phase === 'playing') {
      p.connected = false;
      p.ws = null;
      await matchStore.appendMatchEvent(room, 'disconnect', { playerId, graceMs: ECONOMY.disconnectGraceMs, phase: room.phase }, p);
      clearDisconnectTimer(room, playerId);
      const key = disconnectKey(room, playerId);
      disconnectTimers.set(key, setTimeout(() => {
        if (!rooms.has(currentRoomId)) return;
        const latestRoom = rooms.get(currentRoomId);
        const latestPlayer = latestRoom.players[playerId];
        if (!latestPlayer || latestPlayer.connected || latestPlayer.autoManaged) return;
        markManagedPlayer(latestRoom, playerId, 'disconnect_timeout').catch(err => logger.error('[托管] 断线超时处理失败:', err));
      }, ECONOMY.disconnectGraceMs));
      broadcastAll(room, 'notice', { message: `${p.name} 离线，60 秒内可重连` });
      broadcastAll(room, 'state');
      return;
    }

    // remove player from room
    await matchStore.appendMatchEvent(room, 'leave', { playerId, phase: room.phase, reason: 'socket_close' }, p);
    clearDisconnectTimer(room, playerId);
    room.seats[p.seat] = null;
    delete room.players[playerId];
    delete room.handCounts[playerId];
    delete room.hands[playerId];

    const remaining = allPlayers(room);
    if (remaining.length === 0) {
      clearActionTimer(room);
      rooms.delete(currentRoomId);
      logger.info(`房间 ${currentRoomId} 已解散（无人）`);
    } else {
      if (remaining.length < 3) {
        room.phase = 'waiting';
        room.message = `等待三名玩家加入（当前 ${remaining.length} 人）`;
      }
      broadcastAll(room, 'notice', { message: `${p.name} 离开了房间` });
      broadcastAll(room, 'state');
    }
  });
});

logger.info('按 Ctrl+C 停止服务');
return { httpServer, wss };
}

let iapStaleScanTimer = null;
let platformExchangeRecoveryTimer = null;

function startPlatformExchangeRecovery (config) {
  if (platformExchangeRecoveryTimer || !config.platformEnabled || !config.exchangeEnabled) return;
  const scan = async () => {
    try {
      const result = await platformExchangeService.recoverPending(20);
      if (result.failed > 0) logger.warn(`[IAP] 平台扣币恢复失败 ${result.failed}/${result.scanned}`);
    } catch (err) {
      logger.warn('[IAP] 平台扣币恢复扫描失败:', err.message);
    }
  };
  void scan();
  platformExchangeRecoveryTimer = setInterval(() => { void scan(); }, 5000);
  platformExchangeRecoveryTimer.unref?.();
}

function stopPlatformExchangeRecovery () {
  if (!platformExchangeRecoveryTimer) return;
  clearInterval(platformExchangeRecoveryTimer);
  platformExchangeRecoveryTimer = null;
}

function startIapStaleScanner (config) {
  if (iapStaleScanTimer || !(config.orderCreateEnabled || config.notifyKey)) return;
  const scan = async () => {
    try {
      const affected = await iapOrderStore.stalePendingOrders(Date.now() - config.pendingTtlMs);
      if (affected > 0) logger.info(`[IAP] 已将 ${affected} 笔超时 PENDING 订单转为 STALE`);
    } catch (err) {
      logger.warn('[IAP] PENDING 订单扫描失败:', err.message);
    }
  };
  iapStaleScanTimer = setInterval(() => { void scan(); }, config.staleScanIntervalMs);
  iapStaleScanTimer.unref?.();
}

function stopIapStaleScanner () {
  if (!iapStaleScanTimer) return;
  clearInterval(iapStaleScanTimer);
  iapStaleScanTimer = null;
}

// 语音包权益由永久改为限期：把历史已购但未设有效期（expires_at = 0）的行，
// 按当前目录各档 durationMs 从今天起补算有效期（如 tiezi/tianmei → 7 天）。
// 幂等：新购买都带 expires_at > 0，WHERE expires_at = 0 只会命中历史行，重启不会重复改。
async function migrateLegacyEntitlementExpiry (db) {
  const items = catalog.ITEMS.filter(item => item.type === 'voice_pack' && item.grant && item.grant.durationMs > 0);
  if (!items.length) return;
  const now = Date.now();
  let total = 0;
  for (const item of items) {
    try {
      const result = await db.run(
        'UPDATE user_entitlements SET expires_at = ?, updated_at = ? WHERE sku = ? AND expires_at = 0',
        [now + item.grant.durationMs, now, item.sku]
      );
      const changed = Number(result && result.changes != null ? result.changes : result?.affectedRows || 0);
      if (changed > 0) {
        total += changed;
        logger.info(`[迁移] ${item.sku} 历史永久权益 ${changed} 条已转为 ${item.grant.durationMs / 86400000} 天有效期`);
      }
    } catch (err) {
      logger.warn(`[迁移] ${item.sku} 有效期补算失败: ${err.message}`);
    }
  }
  if (total > 0) logger.info(`[迁移] 共 ${total} 条语音包权益按当前期限补算有效期（从今天起算）`);
}

async function main () {
  checkRequiredEnv();
  try { fs.unlinkSync(READY_FILE); } catch (err) { if (err?.code !== 'ENOENT') throw err; }
  setReady(false);
  const iapConfig = getIapConfig();
  const { httpServer } = startServer();
  await new Promise((resolve, reject) => {
    if (httpServer.address()) return resolve();
    const onListening = () => { cleanup(); resolve(); };
    const onError = err => { cleanup(); reject(err); };
    const cleanup = () => {
      httpServer.off('listening', onListening);
      httpServer.off('error', onError);
    };
    httpServer.once('listening', onListening);
    httpServer.once('error', onError);
  });
  try {
    await initDb();
    const db = getDb();
    await migrateLegacyEntitlementExpiry(db);
    await configCenter.initConfigCenter();
    await require('./persistence/economy-ledger').initEconomyLedger();
    const iapSchemaEnabled = !!(iapConfig.orderCreateEnabled || iapConfig.exchangeEnabled || iapConfig.notifyKey);
    if (iapSchemaEnabled) {
      await iapCatalog.validateCatalogIntegrity();
      await exchangeCatalog.validateExchangeCatalogIntegrity();
    }
    registerReadyCheck(async () => {
      await db.get('SELECT 1');
    });
    setReady(true);
    startIapStaleScanner(iapConfig);
    startPlatformExchangeRecovery(iapConfig);
    logger.info(`[启动] DB 类型: ${DIALECT}`);
    logger.info(`[启动] 持久化数据库: ${db.label}`);
    logger.info(`[启动] 机器人出牌模式: ${decisionRouter.config.mode}`);
    logger.info(`[启动] 匹配资产区间(±30%): ${String(process.env.DDZ_MATCH_ASSET_BAND_ENABLED || 'false').toLowerCase() === 'true' ? '开' : '关'}`);
    fs.writeFileSync(READY_FILE, 'ready\n', { mode: 0o600 });
    logger.info(`[启动] 斗地主服务端已就绪，时间: ${new Date().toLocaleString()}`);
  } catch (err) {
    logger.error('[启动] 数据库初始化失败，进程退出:', err);
    process.exit(1);
  }
}

// 作为模块被 require 时（单测）只导出内部函数，不启动服务和 DB。
if (require.main !== module) {
  module.exports = {
    serializePublicPlayers,
    toPublicPlayer,
    PUBLIC_PLAYER_FIELDS,
    withActionLock,
    hitWindowRateLimit,
    hitAccountRateLimit,
    sweepAccountRateBuckets,
    sweepRooms,
    touchRoom,
    rooms,
    disconnectTimers,
    createRoom,
    COMMAND_RATE_LIMITS,
    IAP_MESSAGE_TYPES,
    commandRateLimitPolicy,
    matchOrchestrator,
    joinReservations,
    maximumBotExposure,
    playerBlocksNewSession,
    playerCanRecoverSeat,
    sanitizeCapabilities,
    canPlayerSendVoice,
    isSkuPurchaseEnabled,
    buildVoiceConfigForCapabilities,
    enabledVoiceContentSkus,
    validateMessage,
    ALLOWED_MESSAGE_TYPES,
    VOICE_CHAT,
    clearActionTimer,
    applyBidUnlocked,
    restoreCurrentActionTimer,
    settlementRetryDelayMs,
    beginSettlement,
    runSettlementAttempt,
  };
} else {
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    setReady(false);
    stopIapStaleScanner();
    stopPlatformExchangeRecovery();
    try { fs.unlinkSync(READY_FILE); } catch (_) {}
    try {
      await closeDb();
      process.exit(0);
    } catch (err) {
      logger.error(`[停止] ${signal} 清理失败:`, err);
      process.exit(1);
    }
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  main().catch(err => {
    try { fs.unlinkSync(READY_FILE); } catch (_) {}
    logger.error('[启动] 服务启动失败:', err);
    process.exit(1);
  });
}
