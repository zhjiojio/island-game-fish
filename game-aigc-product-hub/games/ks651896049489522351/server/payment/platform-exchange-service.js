'use strict';

const crypto = require('crypto');
const { getDb, retryableTransaction } = require('../persistence/db');
const { lockWalletForUpdate } = require('../persistence/wallet-store');
const { getExchangeProduct, isFirstChargeAvailable } = require('./platform-exchange-catalog');
const identityStore = require('../identity/kwai-identity-store');
const exchangeStore = require('./platform-exchange-store');
const { createPlatformClient } = require('./platform-client');
const { buildZoneId } = require('./platform-balance-service');
const logger = require('../logger');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MYSQL_BIGINT = 9_223_372_036_854_775_807n;
const DEFAULT_DEBIT_LEASE_MS = 30_000;
const DEFAULT_UNKNOWN_RETRY_MS = 5_000;
const DEFAULT_RECONCILE_WINDOW_MS = 48 * 60 * 60 * 1000;

function buildFingerprint (exchangeSkuId, os) {
  return crypto.createHash('sha256').update(`v2:platform-exchange:${exchangeSkuId}:${os}`).digest('hex').slice(0, 32);
}

function buildStableIds (accountId, clientRequestId) {
  const digest = crypto.createHash('sha256')
    .update(`v1:${accountId}:${clientRequestId}`).digest('hex').slice(0, 32);
  return { exchangeOrderId: `pex_${digest}`, bizNo: `pex${digest}` };
}

function publicOrder (order, idempotent = false) {
  const fulfilled = order.status === exchangeStore.STATUSES.FULFILLED;
  return {
    exchangeOrderId: order.exchangeOrderId,
    status: order.status,
    spentBalance: fulfilled ? String(order.cost) : '0',
    grantedBeans: fulfilled ? String(BigInt(order.grantBeans) + BigInt(order.bonusBeans || 0)) : '0',
    bonusBeans: fulfilled ? String(order.bonusBeans || 0) : '0',
    beansBalanceAfter: order.beansBalanceAfter,
    idempotent,
  };
}

function createPlatformExchangeService (options = {}) {
  const client = options.client || createPlatformClient(options.clientOptions);
  const store = options.store || exchangeStore;
  const identities = options.identityStore || identityStore;
  const catalog = options.catalog || { getExchangeProduct, isFirstChargeAvailable };
  const maxPayAttempts = Math.max(1, Math.min(5, Number(options.maxPayAttempts || require('./config').getConfig().platformImmediateAttempts)));
  const payPriority = Number(options.payPriority ?? require('./config').getConfig().platformPayPriority);
  if (payPriority !== 1) throw new Error('platform-exchange-service: payPriority must be 1');
  const debitLeaseMs = Math.max(1000, Number(options.debitLeaseMs || DEFAULT_DEBIT_LEASE_MS));
  const unknownRetryMs = Math.max(1000, Number(options.unknownRetryMs || DEFAULT_UNKNOWN_RETRY_MS));
  const reconcileWindowMs = Math.max(60_000, Number(options.reconcileWindowMs || DEFAULT_RECONCILE_WINDOW_MS));
  const fulfillmentPaused = options.fulfillmentPaused === true;
  const lockBeansWallet = options.lockWalletForUpdate || lockWalletForUpdate;
  const database = options.db || getDb();
  const runTransaction = options.retryableTransaction || retryableTransaction;

  async function ensureOrder (input) {
    const fingerprint = buildFingerprint(input.exchangeSkuId, input.os);
    let existing = await store.getByAccountAndRequestId(input.accountId, input.clientRequestId);
    if (existing) {
      if (existing.requestFingerprint !== fingerprint) {
        throw Object.assign(new Error('idempotency key reused'), { code: 'IDEMPOTENCY_KEY_REUSED' });
      }
      return { order: existing, existing: true };
    }

    const product = await catalog.getExchangeProduct(input.exchangeSkuId);
    if (!product) throw Object.assign(new Error('sku not found'), { code: 'SKU_NOT_FOUND' });
    if (!product.enabled) throw Object.assign(new Error('sku disabled'), { code: 'SKU_DISABLED' });
    const cost = String(product.costBalance);
    if (!/^\d+$/.test(cost) || BigInt(cost) <= 0n || !/^\d+$/.test(String(product.grantBeans))) {
      throw Object.assign(new Error('invalid exchange product'), { code: 'SKU_INVALID' });
    }
    const ids = buildStableIds(input.accountId, input.clientRequestId);
    const orderData = {
      ...ids,
      accountId: input.accountId,
      clientRequestId: input.clientRequestId,
      requestFingerprint: fingerprint,
      exchangeSkuId: input.exchangeSkuId,
      cost,
      grantBeans: String(product.grantBeans),
      os: input.os,
      userIp: String(input.userIp || ''),
      zoneId: buildZoneId(input.accountId, options),
      productName: product.displayName,
      productInfo: JSON.stringify([{
        product_id: Number(product.platformProductId),
        product_num: 1,
        product_type: product.platformProductType,
      }]),
      productDesc: `exchange:${product.exchangeSkuId}`,
      payPriority,
      bonusBeans: '0',
    };
    await runTransaction(async () => {
      const account = await database.get('SELECT account_id FROM accounts WHERE account_id = ? FOR UPDATE', [input.accountId]);
      if (!account) throw Object.assign(new Error('account not found'), { code: 'UNAUTHENTICATED' });
      const locked = await store.getByAccountAndRequestId(input.accountId, input.clientRequestId, true);
      if (!locked) {
        const blocking = typeof store.getBlockingByAccountAndSku === 'function'
          ? await store.getBlockingByAccountAndSku(input.accountId, input.exchangeSkuId, true)
          : null;
        if (blocking) {
          throw Object.assign(new Error('exchange confirmation pending'), {
            code: 'EXCHANGE_PENDING', exchangeOrderId: blocking.exchangeOrderId,
          });
        }
        // 首充资格在下单时锁定并落到订单行，之后的重放/补偿都按订单上的额度发放。
        // 账号行已 FOR UPDATE，且同 sku 在途单会被 blocking 拦掉，不会重复领取。
        if (product.isFirstCharge && await catalog.isFirstChargeAvailable(input.accountId, input.exchangeSkuId)) {
          orderData.bonusBeans = String(product.firstChargeBonusBeans);
        }
        await store.insertOrder(orderData);
      }
    });
    existing = await store.getByAccountAndRequestId(input.accountId, input.clientRequestId);
    if (!existing) throw new Error('platform exchange order create failed');
    if (existing.requestFingerprint !== fingerprint) {
      throw Object.assign(new Error('idempotency key reused'), { code: 'IDEMPOTENCY_KEY_REUSED' });
    }
    return { order: existing, existing: false };
  }

  async function commitCredit (exchangeOrderId) {
    return runTransaction(async () => {
      const order = await store.getById(exchangeOrderId, true);
      if (!order) throw Object.assign(new Error('exchange order not found'), { code: 'ORDER_NOT_FOUND' });
      if (order.status === exchangeStore.STATUSES.FULFILLED) return publicOrder(order, true);
      if (![exchangeStore.STATUSES.DEBIT_SUCCEEDED, exchangeStore.STATUSES.FULFILLING].includes(order.status)) {
        throw Object.assign(new Error('platform debit not confirmed'), { code: order.status });
      }
      if (order.status === exchangeStore.STATUSES.DEBIT_SUCCEEDED) await store.markFulfilling(order.exchangeOrderId);

      await lockBeansWallet(order.accountId, { initialBeans: 0, todayKey: '' });
      const db = database;
      const ledgerKey = `platform_exchange_credit:${order.exchangeOrderId}`;
      const existingLedger = await db.get('SELECT * FROM wallet_ledger WHERE idempotency_key = ?', [ledgerKey]);
      let after;
      if (existingLedger) {
        after = String(existingLedger.balance_after);
      } else {
        const wallet = await db.get('SELECT beans, total_earned FROM wallets WHERE account_id = ? FOR UPDATE', [order.accountId]);
        const before = BigInt(String(wallet.beans));
        // 首充赠送与兑换本体一次入账，避免两笔流水下只成功一半
        const grant = BigInt(order.grantBeans) + BigInt(order.bonusBeans || 0);
        const totalEarned = BigInt(String(wallet.total_earned));
        if (before + grant > MAX_MYSQL_BIGINT || totalEarned + grant > MAX_MYSQL_BIGINT) {
          throw Object.assign(new Error('beans overflow'), { code: 'PAYMENT_UNAVAILABLE' });
        }
        after = String(before + grant);
        const now = Date.now();
        const update = await db.run(`
          UPDATE wallets SET beans = ?, total_earned = total_earned + ?, updated_at = ?, version = version + 1
          WHERE account_id = ? AND beans = ?
        `, [after, String(grant), now, order.accountId, String(before)]);
        if (Number(update?.affectedRows || 0) !== 1) {
          throw new Error('platform exchange wallet update lost');
        }
        await db.run(`
          INSERT INTO wallet_ledger
            (tx_id, account_id, type, amount, balance_before, balance_after,
             room_id, round_no, match_id, idempotency_key, meta_json, created_at)
          VALUES (?, ?, 'platform_exchange_credit', ?, ?, ?, NULL, NULL, NULL, ?, ?, ?)
        `, [
          `tx_${crypto.randomUUID()}`, order.accountId, String(grant), String(before), after,
          ledgerKey, JSON.stringify({
            exchangeOrderId: order.exchangeOrderId,
            skuId: order.exchangeSkuId,
            grantBeans: String(order.grantBeans),
            bonusBeans: String(order.bonusBeans || 0),
          }), now,
        ]);
      }
      await store.markFulfilled(order.exchangeOrderId, after);

      // 钻石流水：兑换扣钻（幂等；平台托管余额观察值取本地缓存）
      try {
        const { recordDiamondLedger } = require('../persistence/economy-ledger');
        await recordDiamondLedger({
          accountId: order.accountId,
          direction: 'out',
          delta: -Number(order.cost || 0),
          source: 'exchange_deduct',
          skuId: order.exchangeSkuId || null,
          platform: order.os || null,
          balanceAfter: null,
          idempotencyKey: `diamond_exchange:${order.exchangeOrderId}`,
        }, db);
      } catch (ledgerErr) {
        logger.error('[exchange] diamond_ledger 写入失败:', ledgerErr.message);
      }

      return publicOrder(await store.getById(order.exchangeOrderId, true), existingLedger != null);
    }, { attempts: 4 });
  }

  async function persistDebitResult (order, status, result) {
    const updated = await store.recordDebitResult(order.exchangeOrderId, status, result);
    if (updated === 1 || updated === undefined) return store.getById(order.exchangeOrderId);
    const current = await store.getById(order.exchangeOrderId);
    if (!current) throw Object.assign(new Error('exchange order not found'), { code: 'ORDER_NOT_FOUND' });
    return current;
  }

  async function debitAndFulfill (order, immediateAttempts) {
    if (order.status === exchangeStore.STATUSES.FULFILLED) return publicOrder(order, true);
    if (order.status === exchangeStore.STATUSES.DEBIT_SUCCEEDED || order.status === exchangeStore.STATUSES.FULFILLING) {
      return commitCredit(order.exchangeOrderId);
    }
    if (order.status === exchangeStore.STATUSES.DEBIT_REJECTED || order.status === exchangeStore.STATUSES.REVIEW) {
      return publicOrder(order, true);
    }
    if (fulfillmentPaused) {
      throw Object.assign(new Error('platform exchange paused'), { code: 'PAYMENT_UNAVAILABLE' });
    }
    const currentTime = Date.now();
    if (currentTime - order.createdAt >= reconcileWindowMs) {
      if (typeof store.markReview === 'function') await store.markReview(order.exchangeOrderId, 'platform debit unresolved after reconcile window');
      return publicOrder(await store.getById(order.exchangeOrderId), true);
    }
    if (order.status === exchangeStore.STATUSES.DEBIT_UNKNOWN && currentTime - order.updatedAt < unknownRetryMs) {
      return publicOrder(order, true);
    }
    if (order.status === exchangeStore.STATUSES.DEBITING && currentTime - order.updatedAt < debitLeaseMs) {
      return publicOrder(order, true);
    }

    const openId = await identities.requireOpenIdForAccount(order.accountId);
    for (let attempt = 0; attempt < immediateAttempts; attempt += 1) {
      const claimed = await store.beginDebitAttempt(order.exchangeOrderId, { leaseMs: debitLeaseMs });
      if (claimed !== 1) return publicOrder(await store.getById(order.exchangeOrderId), true);
      let result;
      try {
        result = await client.pay({
          openId,
          zoneId: order.zoneId,
          os: order.os,
          userIp: order.userIp,
          bizNo: order.bizNo,
          amount: order.cost,
          payPriority: order.payPriority,
          productName: order.productName,
          productInfo: order.productInfo,
          productDesc: order.productDesc,
        });
      } catch (err) {
        order = await persistDebitResult(order, exchangeStore.STATUSES.DEBIT_UNKNOWN, {
          code: err?.code || 'PLATFORM_ERROR', message: err?.message,
        });
        if (err?.retryable === true && attempt + 1 < immediateAttempts) continue;
        return publicOrder(order, true);
      }
      const status = result?.success === true
        ? exchangeStore.STATUSES.DEBIT_SUCCEEDED
        : exchangeStore.STATUSES.DEBIT_REJECTED;
      order = await persistDebitResult(order, status, result);
      if (order.status === exchangeStore.STATUSES.DEBIT_SUCCEEDED || order.status === exchangeStore.STATUSES.FULFILLING) {
        return commitCredit(order.exchangeOrderId);
      }
      return publicOrder(order, true);
    }
    return publicOrder(await store.getById(order.exchangeOrderId), true);
  }

  async function exchange (input) {
    if (input.loginType !== 'kwai') {
      throw Object.assign(new Error('guest payment forbidden'), { code: 'GUEST_PAYMENT_FORBIDDEN' });
    }
    if (!UUID_RE.test(String(input.clientRequestId || ''))) {
      throw Object.assign(new Error('invalid request id'), { code: 'INVALID_REQUEST_ID' });
    }
    if (!['android', 'ios'].includes(input.os)) {
      throw Object.assign(new Error('invalid platform'), { code: 'INVALID_PLATFORM' });
    }
    const ensured = await ensureOrder(input);
    return debitAndFulfill(ensured.order, ensured.existing ? 1 : maxPayAttempts);
  }

  async function getOrderForAccount (accountId, exchangeOrderId) {
    const order = await store.getById(exchangeOrderId);
    if (!order || order.accountId !== accountId) {
      throw Object.assign(new Error('exchange order not found'), { code: 'ORDER_NOT_FOUND' });
    }
    return debitAndFulfill(order, 1);
  }

  async function recoverPending (limit = 20) {
    if (typeof store.listRecoverable !== 'function') return { scanned: 0, failed: 0 };
    const orders = await store.listRecoverable({ limit, retryDelayMs: unknownRetryMs, leaseMs: debitLeaseMs });
    let failed = 0;
    for (const order of orders) {
      try {
        await debitAndFulfill(order, 1);
      } catch {
        failed += 1;
      }
    }
    return { scanned: orders.length, failed };
  }

  return { exchange, getOrderForAccount, commitCredit, recoverPending };
}

module.exports = { createPlatformExchangeService, buildFingerprint, buildStableIds };
