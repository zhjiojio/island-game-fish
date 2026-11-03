// ============================================================
// IAP 订单服务
// ------------------------------------------------------------
// 负责：创建订单（含幂等）、限流、查单、记录客户端观察结果。
// 签名由 payment/signature.js 负责，持久化由 persistence/iap-order-store.js 负责。
// ============================================================

const crypto = require('crypto');
const { getDb, retryableTransaction } = require('../persistence/db');
const iapOrderStore = require('../persistence/iap-order-store');
const { getConfig } = require('./config');
const { getProduct } = require('./catalog');
const { signGamePayment } = require('./signature');
const { buildZoneId } = require('./platform-balance-service');

// ---- 订单号生成 ----
// 前缀 iap_ + 时间（ms）+ 随机，不使用自增 ID 避免暴露交易规模。
function generateOrderId () {
  return `iap_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

// ---- 请求指纹 ----
// 同账号同 requestId 但 skuId / platform / 协议版本不同时返回 IDEMPOTENCY_KEY_REUSED。
function buildFingerprint (skuId, platform) {
  return crypto.createHash('sha256')
    .update(`v1:real:${skuId}:${platform}`)
    .digest('hex').slice(0, 32);
}

// ---- 账号维度创建频率限流（进程内，多实例各自独立） ----
const _rateBuckets = new Map(); // accountId -> { windowStart, count }

function hitCreateRateLimit (accountId, now = Date.now()) {
  const cfg = getConfig();
  const windowMs = 60_000;
  const maxPerWindow = cfg.createRatePerMinute;
  let bucket = _rateBuckets.get(accountId);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    bucket = { windowStart: now, count: 0 };
    _rateBuckets.set(accountId, bucket);
  }
  bucket.count += 1;
  return bucket.count > maxPerWindow;
}

function sweepRateBuckets (now = Date.now()) {
  for (const [k, b] of _rateBuckets) {
    if (now - b.windowStart > 120_000) _rateBuckets.delete(k);
  }
}

// ---- 核心接口 ----

/**
 * 创建 IAP 订单。
 * @param {Object} opts
 *   accountId, loginType, skuId, platform (android|ios), clientRequestId, clientIp
 * @returns {{ orderId, status, paymentParams }} 或抛出带 code 的错误
 */
async function createOrder (opts) {
  const cfg = getConfig();
  const { accountId, loginType, skuId, platform, clientRequestId } = opts;

  // ---- 前置校验 ----
  if (loginType !== 'kwai') {
    throw Object.assign(new Error('guest payment forbidden'), { code: 'GUEST_PAYMENT_FORBIDDEN' });
  }
  if (!['android', 'ios'].includes(platform)) {
    throw Object.assign(new Error('invalid platform'), { code: 'INVALID_PLATFORM' });
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clientRequestId)) {
    throw Object.assign(new Error('invalid request id'), { code: 'INVALID_REQUEST_ID' });
  }

  const existing = await iapOrderStore.getOrderByAccountAndRequestId(accountId, clientRequestId);
  if (existing) {
    const fp = buildFingerprint(skuId, platform);
    if (existing.requestFingerprint !== fp) {
      throw Object.assign(new Error('idempotency key reused'), { code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    const response = buildOrderResponse(existing, cfg);
    response.idempotent = true;
    return response;
  }

  if (!cfg.orderCreateEnabled) {
    throw Object.assign(new Error('payment unavailable'), { code: 'PAYMENT_UNAVAILABLE' });
  }
  if (platform === 'android' && !cfg.androidEnabled) {
    throw Object.assign(new Error('android payment disabled'), { code: 'PAYMENT_DISABLED' });
  }
  if (platform === 'ios' && !cfg.iosEnabled) {
    throw Object.assign(new Error('ios payment disabled'), { code: 'PAYMENT_DISABLED' });
  }

  // ---- 频率限流（测试期间暂时禁用）----
  // if (hitCreateRateLimit(accountId)) {
  //   throw Object.assign(new Error('rate limited'), { code: 'ACCOUNT_RATE_LIMITED' });
  // }

  // ---- 商品校验 ----
  const product = await getProduct(skuId);
  if (!product) {
    throw Object.assign(new Error('sku not found'), { code: 'SKU_NOT_FOUND' });
  }
  if (platform === 'android' && !product.enabledAndroid) {
    throw Object.assign(new Error('sku disabled'), { code: 'SKU_DISABLED' });
  }
  if (platform === 'ios' && !product.enabledIos) {
    throw Object.assign(new Error('sku disabled'), { code: 'SKU_DISABLED' });
  }

  // ---- 写入订单（账号锁保证 PENDING 上限在并发下生效）----
  const orderId = generateOrderId();
  const zoneId = buildZoneId(accountId, { namespace: cfg.serverId });
  const fingerprint = buildFingerprint(skuId, platform);
  const orderData = {
    orderId,
    accountId,
    clientRequestId,
    skuId: product.skuId,
    platform,
    zoneId,
    currencyType: product.currencyType,
    buyQuantity: product.buyQuantity,
    priceFen: product.priceFen,
    platformCoinAmount: product.platformCoinAmount,
    productType: platform === 'ios' ? product.productType : null,
    requestFingerprint: fingerprint,
    goodsCategory: product.goodsCategory,
    goodsName: product.displayName,
    extension: '',
  };

  let finalOrder = await retryableTransaction(async () => {
    const account = await getDb().get('SELECT account_id FROM accounts WHERE account_id = ? FOR UPDATE', [accountId]);
    if (!account) throw Object.assign(new Error('account not found'), { code: 'UNAUTHENTICATED' });

    const existingInLock = await iapOrderStore.getOrderByAccountAndRequestId(accountId, clientRequestId);
    if (existingInLock) {
      if (existingInLock.requestFingerprint !== fingerprint) {
        throw Object.assign(new Error('idempotency key reused'), { code: 'IDEMPOTENCY_KEY_REUSED' });
      }
      return existingInLock;
    }

    // ---- 最大 pending 订单数限制 ----
    const pendingCount = await iapOrderStore.countPendingOrders(accountId);
    if (pendingCount >= cfg.maxPendingPerAccount) {
      throw Object.assign(new Error('too many pending orders'), { code: 'TOO_MANY_PENDING_ORDERS' });
    }

    await iapOrderStore.insertOrder(orderData);
    return iapOrderStore.getOrder(orderId);
  });

  if (!finalOrder) throw new Error('order_create_failed');
  const response = buildOrderResponse(finalOrder, cfg);
  response.idempotent = finalOrder.orderId !== orderId;
  return response;
}

function buildOrderResponse (order, cfg) {
  const signParams = {
    zone_id:               order.zoneId,
    os:                    order.platform,
    currency_type:         order.currencyType,
    buy_quantity:          Number(order.buyQuantity),   // 必须是 int
    third_party_trade_no:  order.orderId,
  };
  if (order.extension) signParams.extension = order.extension;

  // goods_category: 10017 = 货币/一级货币（钻石等充值货币）
  const goodsCategory = '10017';
  const paymentParams = { ...signParams, goods_category: goodsCategory, goods_name: order.goodsName,
    sign: signGamePayment(signParams, cfg.paySignKey) };
  if (order.platform === 'ios' && order.productType != null) {
    paymentParams.product_type = order.productType;
  }

    return {
    orderId:        order.orderId,
    status:         order.status,
    platformCoinAmount:  order.platformCoinAmount,
    paymentParams,
  };
}

/**
 * 查询当前账号自己的订单。
 */
async function getOrderForAccount (accountId, orderId) {
  const order = await iapOrderStore.getOrder(orderId);
  if (!order) {
    throw Object.assign(new Error('order not found'), { code: 'ORDER_NOT_FOUND' });
  }
  if (order.accountId !== accountId) {
    throw Object.assign(new Error('order not found'), { code: 'ORDER_NOT_FOUND' });
  }
  return order;
}

/**
 * 记录客户端支付观察结果（不发钻，不改状态）。
 */
async function reportClientResult (accountId, orderId, code, message) {
  const order = await iapOrderStore.getOrder(orderId);
  if (!order || order.accountId !== accountId) {
    throw Object.assign(new Error('order not found'), { code: 'ORDER_NOT_FOUND' });
  }
  await iapOrderStore.recordClientResult(orderId, code, message);
}

/**
 * 查询账号最近订单列表。
 */
async function listOrders (accountId, limit = 20) {
  return iapOrderStore.listOrdersByAccount(accountId, limit);
}

/**
 * 查询当前账号所有可恢复订单，不接受客户端提供账号标识。
 */
async function listPendingOrders (accountId, limit = 20) {
  return iapOrderStore.listPendingOrdersByAccount(accountId, limit);
}

module.exports = {
  createOrder,
  getOrderForAccount,
  reportClientResult,
  listOrders,
  listPendingOrders,
  sweepRateBuckets,
  buildFingerprint,
};
