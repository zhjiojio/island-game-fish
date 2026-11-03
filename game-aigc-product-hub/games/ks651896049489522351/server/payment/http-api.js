'use strict';

const crypto = require('crypto');
const auth = require('../auth');
const { getDb, retryableTransaction } = require('../persistence/db');
const { lockWalletForUpdate } = require('../persistence/wallet-store');

function createIapHttpHandler (services) {
  const {
    getConfig,
    iapCatalog,
    iapOrderService,
    exchangeCatalog,
    platformBalanceService,
    platformExchangeService,
    mockExchangeClient,   // 可选，mock 模式下注入，用于余额查询反映扣减后值
  } = services;

  const rateBuckets = new Map();
  const rateLimits = {
    products: { windowMs: 10000, max: 5 },
    createOrder: { windowMs: 60000, max: 10 },
    reportResult: { windowMs: 10000, max: 10 },
    getOrder: { windowMs: 10000, max: 12 },
    pendingOrders: { windowMs: 10000, max: 6 },
    balance: { windowMs: 10000, max: 12 },
    exchangeProducts: { windowMs: 10000, max: 5 },
    createExchange: { windowMs: 60000, max: 10 },
    getExchange: { windowMs: 10000, max: 12 },
  };

  function response (status, data) {
    return { handled: true, status, data };
  }

  function formatPriceFen (priceFen) {
    const fen = BigInt(priceFen);
    const yuan = fen / 100n;
    const remainder = fen % 100n;
    return remainder === 0n ? `¥${yuan}` : `¥${yuan}.${remainder.toString().padStart(2, '0')}`;
  }

  const publicErrorMessages = {
    UNAUTHENTICATED: 'authentication required',
    GUEST_PAYMENT_FORBIDDEN: 'guest payment forbidden',
    ORDER_NOT_FOUND: 'order not found',
    SKU_NOT_FOUND: 'sku not found',
    SKU_DISABLED: 'sku disabled',
    IDEMPOTENCY_KEY_REUSED: 'idempotency key reused',
    EXCHANGE_PENDING: 'exchange confirmation pending',
    TOO_MANY_PENDING_ORDERS: 'too many pending orders',
    RATE_LIMITED: 'rate limited',
    ACCOUNT_RATE_LIMITED: 'rate limited',
    PAYMENT_UNAVAILABLE: 'payment unavailable',
    PAYMENT_DISABLED: 'payment disabled',
    INVALID_PLATFORM: 'invalid platform',
    INVALID_REQUEST_ID: 'invalid request id',
    INVALID_CONTENT_TYPE: 'content-type must be application/json',
    INVALID_JSON: 'invalid json body',
    INSUFFICIENT_PLATFORM_BALANCE: 'insufficient platform balance',
  };
  const publicErrors = new Set(Object.keys(publicErrorMessages));

  function errorStatus (code) {
    if (code === 'UNAUTHENTICATED') return 401;
    if (code === 'GUEST_PAYMENT_FORBIDDEN') return 403;
    if (code === 'ORDER_NOT_FOUND' || code === 'SKU_NOT_FOUND') return 404;
    if (code === 'IDEMPOTENCY_KEY_REUSED' || code === 'EXCHANGE_PENDING' || code === 'TOO_MANY_PENDING_ORDERS') return 409;
    if (code === 'RATE_LIMITED' || code === 'ACCOUNT_RATE_LIMITED') return 429;
    if (code === 'PAYMENT_UNAVAILABLE' || code === 'PAYMENT_DISABLED') return 503;
    if (!publicErrors.has(code)) return 500;
    return 400;
  }

  function errorResponse (err, fallback = 'PAYMENT_REQUEST_FAILED') {
    const sourceCode = String(err?.code || fallback);
    const known = publicErrors.has(sourceCode);
    const code = known ? sourceCode : 'PAYMENT_REQUEST_FAILED';
    const message = known ? publicErrorMessages[sourceCode] : 'payment request failed';
    const error = { code, message };
    if (code === 'EXCHANGE_PENDING' && err?.exchangeOrderId) error.exchangeOrderId = String(err.exchangeOrderId);
    return response(errorStatus(sourceCode), { error });
  }

  function authenticate (headers) {
    const authorization = String(headers.authorization || '');
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    const identity = match ? auth.verifySessionToken(match[1]) : null;
    if (!identity) throw Object.assign(new Error('authentication required'), { code: 'UNAUTHENTICATED' });
    // mock 模式下不限制 loginType（Web 调试用户不是 kwai 登录）
    const isMock = !!(process.env.DDZ_MOCK_DIAMOND_BALANCE);
    if (!isMock && identity.loginType !== 'kwai') throw Object.assign(new Error('guest payment forbidden'), { code: 'GUEST_PAYMENT_FORBIDDEN' });
    return identity;
  }

  function requireJson (contentType, rawBody) {
    if (String(contentType || '').split(';')[0].trim().toLowerCase() !== 'application/json') {
      throw Object.assign(new Error('content-type must be application/json'), { code: 'INVALID_CONTENT_TYPE' });
    }
    try {
      const body = rawBody ? JSON.parse(rawBody) : {};
      if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('invalid body');
      return body;
    } catch {
      throw Object.assign(new Error('invalid json body'), { code: 'INVALID_JSON' });
    }
  }

  function idempotencyKey (headers) {
    return String(headers['idempotency-key'] || '').trim();
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
    if (bucket.count > rule.max) throw Object.assign(new Error('rate limited'), { code: 'ACCOUNT_RATE_LIMITED' });
    if (rateBuckets.size > 10000) {
      for (const [bucketKey, value] of rateBuckets) {
        if (now - value.startedAt >= 120000) rateBuckets.delete(bucketKey);
      }
    }
  }

  async function handle (request) {
    const { method, path, query, headers, rawBody, clientIp } = request;
    if (!path.startsWith('/api/v1/iap/') && !path.startsWith('/api/v1/platform-coins/')) return { handled: false };

    // ---- GET /api/v1/iap/products 不需要登录，公开接口 ----
    if (method === 'GET' && path === '/api/v1/iap/products') {
      try {
        const cfg = getConfig();
        const os = String(query.get('os') || 'android');
        const platformEnabled = os === 'android' ? cfg.androidEnabled : (os === 'ios' ? cfg.iosEnabled : true);
        const products = cfg.platformEnabled && cfg.orderCreateEnabled && platformEnabled
          ? await iapCatalog.getEnabledProducts(['android', 'ios'].includes(os) ? os : 'android')
          : await iapCatalog.getEnabledProducts('android'); // 无 os 参数时返回 android 档
        return response(200, { catalogVersion: 1, items: products.map(product => ({
          skuId: product.skuId,
          priceFen: product.priceFen,
          priceText: formatPriceFen(product.priceFen),
          diamonds: product.platformCoinAmount,
          goodsName: product.displayName,
          platforms: ['android', 'ios'].includes(os) ? [os] : ['android'],
        })) });
      } catch (err) {
        return errorResponse(err);
      }
    }

    // ---- GET /api/v1/platform-coins/exchange-products 不需要登录，公开接口 ----
    if (method === 'GET' && path === '/api/v1/platform-coins/exchange-products') {
      try {
        const cfg = getConfig();
        // 该分支在鉴权前命中，带 token 时也要解析出账号，否则首充角标无法按用户失效
        const tokenMatch = /^Bearer\s+(.+)$/i.exec(String(headers.authorization || ''));
        const loose = tokenMatch ? auth.verifySessionToken(tokenMatch[1]) : null;
        const products = cfg.platformEnabled && cfg.exchangeEnabled
          ? await exchangeCatalog.getExchangeProductsForAccount(loose ? loose.accountId : null)
          : [];
        return response(200, { catalogVersion: 1, items: products });
      } catch (err) {
        return errorResponse(err);
      }
    }

    // ── Mock 余额：mock 模式下完全在认证前处理，跳过 loginType 检查
    // 有 token → 轻量验证 token（不检查 loginType），返回动态扣减后余额
    // 无 token → 返回固定初始值（游客/H5 展示用）
    if (method === 'GET' && path === '/api/v1/platform-coins/balance') {
      const mockBalance = process.env.DDZ_MOCK_DIAMOND_BALANCE;
      if (mockBalance && /^\d+$/.test(mockBalance)) {
        const authorization = String(headers.authorization || '');
        const tokenMatch = /^Bearer\s+(.+)$/i.exec(authorization);
        const loosIdentity = tokenMatch ? auth.verifySessionToken(tokenMatch[1]) : null;
        if (loosIdentity) {
          // 有合法 token → 返回动态余额（mock client 跟踪扣减）
          const bal = mockExchangeClient
            ? await mockExchangeClient.getBalance({ accountId: loosIdentity.accountId })
            : { chargeBalance: mockBalance, freeBalance: '0' };
          return response(200, {
            accountId: loosIdentity.accountId,
            chargeBalance: bal.chargeBalance,
            freeBalance: bal.freeBalance,
            balance: String(BigInt(bal.chargeBalance) + BigInt(bal.freeBalance)),
            observedAt: Date.now(),
            stale: false,
          });
        }
        // 无 token → 固定初始值
        return response(200, {
          chargeBalance: mockBalance,
          freeBalance: '0',
          balance: mockBalance,
          observedAt: Date.now(),
          stale: false,
        });
      }
    }

    let identity;
    try {
      identity = authenticate(headers);
    } catch (err) {
      return errorResponse(err, 'UNAUTHENTICATED');
    }

    try {
      const cfg = getConfig();
      let action = '';
      if (path === '/api/v1/iap/orders' && method === 'POST') action = 'createOrder';
      else if (/\/client-result$/.test(path)) action = 'reportResult';
      else if (path === '/api/v1/iap/orders') action = 'pendingOrders';
      else if (path.startsWith('/api/v1/iap/orders/')) action = 'getOrder';
      else if (path === '/api/v1/platform-coins/balance') action = 'balance';
      else if (path === '/api/v1/platform-coins/exchange-products') action = 'exchangeProducts';
      else if (path === '/api/v1/platform-coins/exchange-orders' && method === 'POST') action = 'createExchange';
      else if (path.startsWith('/api/v1/platform-coins/exchange-orders/')) action = 'getExchange';
      enforceRateLimit(identity.accountId, action);

      // ── Mock 直通购买（仅 DDZ_MOCK_DIAMOND_BALANCE 模式）：直接往钱包加钻石 ──
      if (method === 'POST' && path === '/api/v1/iap/mock-buy') {
        if (!mockExchangeClient) {
          return response(403, { error: { code: 'PAYMENT_DISABLED', message: 'mock buy only available in mock mode' } });
        }
        const body = requireJson(headers['content-type'], rawBody);
        const skuId = String(body.skuId || '');
        const prod = await iapCatalog.getProduct(skuId);
        if (!prod) return response(404, { error: { code: 'SKU_NOT_FOUND', message: 'sku not found' } });
        const diamonds = BigInt(prod.platformCoinAmount || 0);
        if (diamonds <= 0n) return response(400, { error: { code: 'INVALID_REQUEST_ID', message: 'no diamonds in this sku' } });
        // 直接给 mockExchangeClient 加余额（充值 = 加钻石）
        mockExchangeClient.credit(identity.accountId, diamonds);
        return response(200, { orderId: `mock_iap_${crypto.randomBytes(8).toString('hex')}`, status: 'FULFILLED', diamondsGranted: String(diamonds) });
      }

      if (method === 'POST' && path === '/api/v1/iap/orders') {
        const body = requireJson(headers['content-type'], rawBody);
        const result = await iapOrderService.createOrder({
          accountId: identity.accountId,
          loginType: identity.loginType,
          skuId: String(body.skuId || ''),
          platform: String(body.os || ''),
          clientRequestId: idempotencyKey(headers),
          clientIp,
        });
        return response(result.idempotent ? 200 : 201, result);
      }

      const clientResultMatch = /^\/api\/v1\/iap\/orders\/([^/]+)\/client-result$/.exec(path);
      if (method === 'POST' && clientResultMatch) {
        const body = requireJson(headers['content-type'], rawBody);
        const orderId = decodeURIComponent(clientResultMatch[1]);
        await iapOrderService.reportClientResult(identity.accountId, orderId, String(body.code || ''), String(body.message || '').slice(0, 255));
        return response(200, { orderId });
      }

      if (method === 'GET' && path === '/api/v1/iap/orders') {
        const orders = await iapOrderService.listPendingOrders(identity.accountId);
        return response(200, { orders: orders.map(order => ({
          orderId: order.orderId,
          skuId: order.skuId,
          status: order.status,
          purchasedCoins: order.platformCoinAmount,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt,
        })) });
      }

      const orderMatch = /^\/api\/v1\/iap\/orders\/([^/]+)$/.exec(path);
      if (method === 'GET' && orderMatch) {
        const order = await iapOrderService.getOrderForAccount(identity.accountId, decodeURIComponent(orderMatch[1]));
        return response(200, {
          orderId: order.orderId,
          skuId: order.skuId,
          status: order.status,
          purchasedCoins: order.platformCoinAmount,
          createdAt: order.createdAt,
          paymentConfirmedAt: order.paymentConfirmedAt,
        });
      }

      if (method === 'GET' && path === '/api/v1/platform-coins/balance') {
        // ---- Mock 余额（优先，反映扣减后的值）----
        if (mockExchangeClient && mockExchangeClient.getBalance) {
          const result = await mockExchangeClient.getBalance({ accountId: identity.accountId });
          return response(200, {
            accountId: identity.accountId,
            chargeBalance: result.chargeBalance,
            freeBalance: result.freeBalance,
            balance: String(BigInt(result.chargeBalance) + BigInt(result.freeBalance)),
            observedAt: Date.now(),
            stale: false,
          });
        }
        if (!cfg.platformEnabled) throw Object.assign(new Error('payment unavailable'), { code: 'PAYMENT_UNAVAILABLE' });
        const balance = await platformBalanceService.getBalance({
          accountId: identity.accountId,
          loginType: identity.loginType,
          os: String(query.get('os') || ''),
          userIp: clientIp,
        });
        return response(200, balance);
      }

      if (method === 'GET' && path === '/api/v1/platform-coins/exchange-products') {
        const products = cfg.platformEnabled && cfg.exchangeEnabled
          ? await exchangeCatalog.getExchangeProductsForAccount(identity.accountId)
          : [];
        return response(200, { catalogVersion: 1, items: products });
      }

      if (method === 'POST' && path === '/api/v1/platform-coins/exchange-orders') {
        if (!cfg.platformEnabled || !cfg.exchangeEnabled) throw Object.assign(new Error('exchange disabled'), { code: 'PAYMENT_DISABLED' });
        const body = requireJson(headers['content-type'], rawBody);
        const exchangeSkuId = String(body.exchangeSkuId || '');

        // ---- Mock 模式：直接扣内存余额 + 写铁豆，不走快手平台 ----
        if (mockExchangeClient) {
          const product = await exchangeCatalog.getExchangeProduct(exchangeSkuId);
          if (!product || !product.enabled) throw Object.assign(new Error('sku not found'), { code: 'SKU_NOT_FOUND' });
          const qty = Math.max(1, Math.floor(Number(body.qty) || 1));
          const cost = BigInt(product.costBalance) * BigInt(qty);
          const balResult = await mockExchangeClient.getBalance({ accountId: identity.accountId });
          if (BigInt(balResult.chargeBalance) < cost) throw Object.assign(new Error('insufficient platform balance'), { code: 'INSUFFICIENT_PLATFORM_BALANCE' });
          const ok = mockExchangeClient.deduct(identity.accountId, cost);
          if (!ok) throw Object.assign(new Error('insufficient platform balance'), { code: 'INSUFFICIENT_PLATFORM_BALANCE' });
          // 直接给铁豆（qty 倍）
          const mockOrderId = `pex_mock_${crypto.randomBytes(8).toString('hex')}`;
          const grantBeans = BigInt(product.grantBeans) * BigInt(qty);
          // mock 不写 platform_exchange_orders，首充资格按到账流水判定
          let bonusBeans = 0n;
          if (product.isFirstCharge && await exchangeCatalog.isFirstChargeAvailable(identity.accountId, exchangeSkuId)) {
            bonusBeans = BigInt(product.firstChargeBonusBeans);
          }
          const totalBeans = grantBeans + bonusBeans;
          await retryableTransaction(async () => {
            await lockWalletForUpdate(identity.accountId, { initialBeans: 0, todayKey: '' });
            const db = getDb();
            const wallet = await db.get('SELECT beans, total_earned FROM wallets WHERE account_id = ? FOR UPDATE', [identity.accountId]);
            const before = BigInt(String(wallet.beans));
            const after = String(before + totalBeans);
            const now2 = Date.now();
            await db.run(
              'UPDATE wallets SET beans = ?, total_earned = total_earned + ?, updated_at = ?, version = version + 1 WHERE account_id = ? AND beans = ?',
              [after, String(totalBeans), now2, identity.accountId, String(before)],
            );
            await db.run(
              `INSERT INTO wallet_ledger (tx_id, account_id, type, amount, balance_before, balance_after, room_id, round_no, match_id, idempotency_key, meta_json, created_at)
               VALUES (?, ?, 'platform_exchange_credit', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)`,
              [`tx_${crypto.randomUUID()}`, identity.accountId, String(totalBeans), String(before), after,
               `mock_exchange:${mockOrderId}`, JSON.stringify({ mockOrderId, skuId: exchangeSkuId, qty, bonusBeans: String(bonusBeans) }), now2],
            );
          }, { attempts: 3 });
          return response(200, {
            exchangeOrderId: mockOrderId,
            status: 'FULFILLED',
            spentBalance: String(cost),
            grantedBeans: String(totalBeans),
            bonusBeans: String(bonusBeans),
            beansBalanceAfter: null,
            idempotent: false,
          });
        }

        const result = await platformExchangeService.exchange({
          accountId: identity.accountId,
          loginType: identity.loginType,
          exchangeSkuId,
          clientRequestId: idempotencyKey(headers),
          os: String(body.os || ''),
          userIp: clientIp,
        });
        return response(result.status === 'FULFILLED' ? 200 : 202, result);
      }

      const exchangeMatch = /^\/api\/v1\/platform-coins\/exchange-orders\/([^/]+)$/.exec(path);
      if (method === 'GET' && exchangeMatch) {
        const orderId = decodeURIComponent(exchangeMatch[1]);
        // mock 订单：直接返回 FULFILLED（POST 时已同步完成，无需轮询）
        if (mockExchangeClient && orderId.startsWith('pex_mock_')) {
          return response(200, { exchangeOrderId: orderId, status: 'FULFILLED', spentBalance: '0', grantedBeans: '0', idempotent: true });
        }
        const result = await platformExchangeService.getOrderForAccount(identity.accountId, orderId);
        return response(result.status === 'FULFILLED' ? 200 : 202, result);
      }

      return response(404, { error: { code: 'NOT_FOUND', message: 'not found' } });
    } catch (err) {
      return errorResponse(err);
    }
  }

  return { handle };
}

module.exports = { createIapHttpHandler };
