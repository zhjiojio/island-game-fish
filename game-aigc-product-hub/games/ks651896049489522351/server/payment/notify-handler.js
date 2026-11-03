// ============================================================
// IAP 支付回调处理器
// ------------------------------------------------------------
// 职责（严格按顺序）：
//   1. 请求体大小限制（调用方已截断，此处二次校验长度）
//   2. Content-Type 校验（只接受 application/x-www-form-urlencoded）
//   3. 解析表单字段（使用 Node 内置 URLSearchParams，不引入外部 body-parser）
//   4. 字段白名单、重复键、空值检查
//   5. app_id 校验（先于数据库操作）
//   6. HMAC 验签（timingSafeEqual）
//   7. open_id 派生 accountId
//   8. 事务：行锁 → 身份验证 → 绑定 platformOrderId → 确认平台充值到账
//   9. 异步写审计日志
//  10. 返回纯文本 "success" 或 "failed"
//
// 安全约束：
//   - 不在日志中打印 open_id、sign、密钥或完整请求体。
//   - 签名错误、未知订单不修改订单状态。
//   - 身份或平台订单号冲突时将订单置 REVIEW。
// ============================================================

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { retryableTransaction, isDuplicateKeyError } = require('../persistence/db');
const iapOrderStore = require('../persistence/iap-order-store');
const { verifyPaymentNotify } = require('./signature');
const { getConfig } = require('./config');
const { deriveKwaiAccountId, normalizeKwaiOpenId } = require('../identity/kwai-account-id');
const kwaiApp = require('../config/kwai-app');
const logger = require('../logger');

// 支付回调事件总线：服务端其他模块可监听 'iapConfirmed' 事件推 socket
const notifyEvents = new EventEmitter();
notifyEvents.setMaxListeners(20);

// 允许出现在回调中的参数白名单（排除 sign）
const ALLOWED_NOTIFY_FIELDS = new Set([
  'open_id', 'app_id', 'third_party_trade_no', 'extension', 'order_id', 'sign',
]);

// 必填字段
const REQUIRED_NOTIFY_FIELDS = ['open_id', 'app_id', 'third_party_trade_no', 'order_id', 'sign'];

/**
 * 解析并校验回调请求体。
 * @param {string} rawBody     — 原始 UTF-8 字符串（调用方已截断）
 * @param {string} contentType — Content-Type 头
 * @returns {{ ok, params?, reason? }}
 */
function parseNotifyBody (rawBody, contentType) {
  const mediaType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (mediaType !== 'application/x-www-form-urlencoded') {
    return { ok: false, reason: 'bad_content_type' };
  }

  let sp;
  try {
    sp = new URLSearchParams(rawBody);
  } catch {
    return { ok: false, reason: 'body_parse_error' };
  }

  // 检测重复键
  const seen = new Set();
  for (const [k] of sp.entries()) {
    if (seen.has(k)) return { ok: false, reason: `duplicate_key:${k}` };
    seen.add(k);
  }

  // 检查未知字段
  for (const k of seen) {
    if (!ALLOWED_NOTIFY_FIELDS.has(k)) return { ok: false, reason: `unknown_field:${k}` };
  }

  const params = {};
  for (const k of seen) params[k] = sp.get(k);

  // 必填字段
  for (const field of REQUIRED_NOTIFY_FIELDS) {
    if (!params[field]) return { ok: false, reason: `missing_field:${field}` };
  }

  // 字段长度上限
  if (String(params.third_party_trade_no || '').length > 128) return { ok: false, reason: 'field_too_long:third_party_trade_no' };
  if (String(params.order_id || '').length > 256) return { ok: false, reason: 'field_too_long:order_id' };
  if (!normalizeKwaiOpenId(params.open_id) || String(params.open_id || '').trim().length > 128) {
    return { ok: false, reason: 'invalid_field:open_id' };
  }

  return { ok: true, params };
}

function hashAuditValue (value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

async function confirmOrderAtomic ({ accountId, orderId, platformOrderId, requiredExtension, logMeta }) {
  return retryableTransaction(async () => {
    const order = await iapOrderStore.getOrderForUpdate(orderId);
    if (!order) throw Object.assign(new Error('order_not_found'), { _notifyCode: 'order_not_found' });
    if (order.accountId !== accountId) {
      throw Object.assign(new Error('account_mismatch'), { _notifyCode: 'account_mismatch', _setReview: true });
    }
    if (order.extension !== requiredExtension) {
      throw Object.assign(new Error('extension_mismatch'), { _notifyCode: 'extension_mismatch', _setReview: true });
    }
    if (order.platformOrderId && order.platformOrderId !== platformOrderId) {
      throw Object.assign(new Error('platform_order_conflict'), { _notifyCode: 'platform_order_conflict', _setReview: true });
    }
    if (order.status === 'PAYMENT_CONFIRMED') {
      if (logMeta) logMeta.platformOrderHash = hashAuditValue(platformOrderId);
      return order;
    }
    if (order.status === 'REVIEW') throw Object.assign(new Error('order_review'), { _notifyCode: 'order_review' });
    if (order.status !== 'PENDING' && order.status !== 'STALE') {
      throw Object.assign(new Error('unexpected_status:' + order.status), { _notifyCode: 'unexpected_status' });
    }
    if (!order.platformOrderId) {
      const bound = await iapOrderStore.bindPlatformOrderId(orderId, platformOrderId);
      if (bound !== 1) throw Object.assign(new Error('platform_order_bind_conflict'), { _notifyCode: 'platform_order_conflict' });
    }
    const affected = await iapOrderStore.confirmPayment(orderId, platformOrderId);
    if (affected !== 1) throw Object.assign(new Error('confirm_update_conflict'), { _notifyCode: 'confirm_conflict' });
    if (logMeta) logMeta.platformOrderHash = hashAuditValue(platformOrderId);
    return order;
  }, { attempts: 4 });
}

/**
 * 主入口：处理平台支付回调。
 * @param {string} rawBody
 * @param {string} contentType
 * @returns {{ httpStatus: 200, text: 'success'|'failed', logMeta }}
 */
async function handleNotify (rawBody, contentType) {
  const startAt = Date.now();
  const logMeta = {
    receivedAt: startAt,
    orderIdPrefix: '',
    platformOrderHash: '',
    appId: '',
    verifyResult: 'pending',
    processResult: 'pending',
    errorClass: '',
    httpStatus: 200,
    durationMs: 0,
  };

  function done (text, errorClass = '') {
    logMeta.processResult = text;
    logMeta.errorClass    = errorClass;
    logMeta.durationMs    = Date.now() - startAt;
    logMeta.httpStatus    = 200; // 平台要求 HTTP 200，以 body 区分 success/failed
    iapOrderStore.insertNotifyLog(logMeta).catch(() => {});
    return { httpStatus: 200, text };
  }

  // ---- 步骤 1-4：解析 ----
  if (String(rawBody || '').length > (getConfig().bodyLimitBytes || 16384)) {
    logMeta.verifyResult = 'body_too_large';
    return done('failed', 'body_too_large');
  }

  const parsed = parseNotifyBody(rawBody, contentType);
  if (!parsed.ok) {
    logMeta.verifyResult = parsed.reason;
    return done('failed', 'parse_error');
  }

  const { params } = parsed;
  logMeta.appId         = String(params.app_id || '').slice(0, 64);
  logMeta.orderIdPrefix = String(params.third_party_trade_no || '').slice(0, 32);

  // ---- 步骤 5：app_id 校验 ----
  if (params.app_id !== kwaiApp.getAppId()) {
    logMeta.verifyResult = 'app_id_mismatch';
    return done('failed', 'app_id_mismatch');
  }

  // ---- 步骤 6：HMAC 验签 ----
  const cfg = getConfig();
  const sigOk = verifyPaymentNotify(params, cfg.notifyKey, cfg.prevNotifyKey);
  logMeta.verifyResult = sigOk ? 'ok' : 'sig_fail';
  if (!sigOk) {
    logger.warn('[notify] 验签失败，orderIdPrefix=', logMeta.orderIdPrefix);
    return done('failed', 'sig_fail');
  }

  // ---- 步骤 7：派生 accountId ----
  const callbackAccountId = deriveKwaiAccountId(params.open_id);

  // ---- 步骤 8：事务发钻 ----
  const orderId         = params.third_party_trade_no;
  const platformOrderId = String(params.order_id);

  if (cfg.fulfillmentPaused) {
    logMeta.processResult = 'fulfillment_paused';
    return done('failed', 'fulfillment_paused');
  }

  try {
    const order = await confirmOrderAtomic({
      accountId: callbackAccountId,
      orderId,
      platformOrderId,
      requiredExtension: String(params.extension || ''),
      logMeta,
    });

    // 通知其他模块：充值已到账，可向客户端推送
    notifyEvents.emit('iapConfirmed', {
      accountId: callbackAccountId,
      orderId,
      diamondsGranted: order ? String(order.platformCoinAmount || order.grant_diamonds || 0) : '0',
    });

    // 钻石流水：充值到账（幂等，重放安全）
    try {
      const { recordDiamondLedger } = require('../persistence/economy-ledger');
      await recordDiamondLedger({
        accountId: callbackAccountId,
        direction: 'in',
        delta: Number(order?.grant_diamonds ?? order?.platformCoinAmount ?? 0),
        source: 'iap_recharge',
        skuId: order?.sku_id || null,
        platform: order?.platform || null,
        idempotencyKey: `diamond_iap:${orderId}`,
      });
    } catch (ledgerErr) {
      logger.error('[notify] diamond_ledger 写入失败:', ledgerErr.message);
    }

    return done('success');
  } catch (err) {
    const duplicateMessage = `${err.message || ''} ${err.sqlMessage || ''}`;
    if (isDuplicateKeyError(err) && duplicateMessage.includes('uniq_iap_platform_order')) {
      err._notifyCode = 'platform_order_conflict';
      err._setReview = true;
    }
    const code = err._notifyCode || 'internal_error';
    logMeta.processResult = 'failed';
    logMeta.errorClass = code;

    if (err._setReview) {
      try {
        const reviewResult = await iapOrderStore.markOrderReview(orderId, code);
        if (reviewResult === 'superseded_by_confirmation') {
          return done('failed', 'review_superseded_by_confirmation');
        }
      } catch (reviewErr) {
        logger.error('[notify] markOrderReview failed:', reviewErr.message);
        return done('failed', 'review_persist_failed');
      }
      logger.error(`[notify] P0 账户安全告警 order=${orderId} code=${code}`);
    } else if (code !== 'order_not_found' && code !== 'order_review') {
      logger.warn(`[notify] order=${orderId} code=${code} msg=${err.message}`);
    }

    return done('failed', code);
  }
}

module.exports = { handleNotify, parseNotifyBody, confirmOrderAtomic, notifyEvents };
