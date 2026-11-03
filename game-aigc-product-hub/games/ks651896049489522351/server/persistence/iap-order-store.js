// ============================================================
// IAP 订单持久化
// ------------------------------------------------------------
// 只负责数据存取，不含业务校验或签名逻辑。
// 调用方必须保证已在事务内，且对 iap_orders 行持有 FOR UPDATE 锁时，
// 再调用状态转换方法。
// ============================================================

const { getDb, retryableTransaction } = require('./db');
const logger = require('../logger');

const ORDER_STATUSES = {
  PENDING:           'PENDING',
  STALE:             'STALE',
  PAYMENT_CONFIRMED: 'PAYMENT_CONFIRMED',
  REVIEW:            'REVIEW',
};

function nowMs () { return Date.now(); }

function rowToOrder (row) {
  if (!row) return null;
  return {
    orderId:            row.order_id,
    accountId:          row.account_id,
    clientRequestId:    row.client_request_id,
    skuId:              row.sku_id,
    platform:           row.platform,
    zoneId:             row.zone_id,
    currencyType:       row.currency_type,
    buyQuantity:        String(row.buy_quantity),
    priceFen:           String(row.price_fen),
    platformCoinAmount:      String(row.grant_diamonds),
    productType:        row.product_type == null ? null : Number(row.product_type),
    requestFingerprint: row.request_fingerprint || '',
    goodsCategory:      row.goods_category || '',
    goodsName:          row.goods_name || '',
    extension:          row.extension || '',
    status:             row.status,
    platformOrderId:    row.platform_order_id || null,
    clientResultCode:   row.client_result_code || '',
    notifyCount:        Number(row.notify_count || 0),
    lastNotifyAt:       row.last_notify_at == null ? null : Number(row.last_notify_at),
    paymentConfirmedAt: row.payment_confirmed_at == null ? null : Number(row.payment_confirmed_at),
    createdAt:          Number(row.created_at),
    updatedAt:          Number(row.updated_at),
  };
}

async function getOrder (orderId) {
  const row = await getDb().get('SELECT * FROM iap_orders WHERE order_id = ?', [orderId]);
  return rowToOrder(row);
}

async function getOrderForUpdate (orderId) {
  const row = await getDb().get('SELECT * FROM iap_orders WHERE order_id = ? FOR UPDATE', [orderId]);
  return rowToOrder(row);
}

async function getOrderByAccountAndRequestId (accountId, clientRequestId) {
  const row = await getDb().get(
    'SELECT * FROM iap_orders WHERE account_id = ? AND client_request_id = ?',
    [accountId, clientRequestId],
  );
  return rowToOrder(row);
}

/**
 * 查询某账号指定状态的订单数量（用于创建订单限流）。
 */
async function countPendingOrders (accountId) {
  const row = await getDb().get(
    'SELECT COUNT(*) AS cnt FROM iap_orders WHERE account_id = ? AND status = ?',
    [accountId, ORDER_STATUSES.PENDING],
  );
  return Number(row?.cnt || 0);
}

/**
 * 插入新订单（调用方确保已在事务内）。
 * 返回 { order, isDuplicate }：
 *   - isDuplicate=true 说明撞了唯一键，调用方应在新事务中读取已有订单。
 */
async function insertOrder (orderData) {
  const now = nowMs();
  await getDb().run(`
    INSERT INTO iap_orders (
      order_id, account_id, client_request_id, sku_id, platform, zone_id,
      currency_type, buy_quantity, price_fen, grant_diamonds, product_type,
      request_fingerprint, goods_category, goods_name, extension,
      status, platform_order_id, client_result_code, client_result_message,
      notify_count, last_notify_at, payment_confirmed_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', NULL, '', '', 0, NULL, NULL, ?, ?)
  `, [
    orderData.orderId,
    orderData.accountId,
    orderData.clientRequestId,
    orderData.skuId,
    orderData.platform,
    orderData.zoneId,
    orderData.currencyType || 'CNY',
    orderData.buyQuantity,
    orderData.priceFen,
    orderData.platformCoinAmount,
    orderData.productType == null ? null : orderData.productType,
    orderData.requestFingerprint || '',
    orderData.goodsCategory || '',
    orderData.goodsName || '',
    orderData.extension || '',
    now,
    now,
  ]);
}

/**
 * 绑定平台订单号（条件更新，仅当 platform_order_id 为 NULL 时）。
 * 返回 affectedRows。
 */
async function bindPlatformOrderId (orderId, platformOrderId) {
  const result = await getDb().run(
    'UPDATE iap_orders SET platform_order_id = ?, updated_at = ? WHERE order_id = ? AND platform_order_id IS NULL',
    [platformOrderId, nowMs(), orderId],
  );
  return Number(result?.affectedRows ?? 0);
}

/**
 * 将订单状态转为 FULFILLED（只接受 PENDING 或 STALE 的订单）。
 * 调用方必须已在事务内并持有 FOR UPDATE 行锁。
 */
async function confirmPayment (orderId, platformOrderId) {
  const now = nowMs();
  const result = await getDb().run(`
    UPDATE iap_orders
    SET status = 'PAYMENT_CONFIRMED',
        payment_confirmed_at = ?,
        notify_count = notify_count + 1,
        last_notify_at = ?,
        updated_at = ?
    WHERE order_id = ? AND status IN ('PENDING', 'STALE')
  `, [now, now, now, orderId]);
  return Number(result?.affectedRows ?? 0);
}

/**
 * 将订单置为 REVIEW（身份或平台订单号冲突）。
 * 使用独立可提交事务，不依赖调用方的事务上下文。
 */
async function markOrderReview (orderId, reason) {
  return retryableTransaction(async () => {
    const result = await getDb().run(`
      UPDATE iap_orders SET status = 'REVIEW', client_result_message = ?, updated_at = ?
      WHERE order_id = ? AND status NOT IN ('PAYMENT_CONFIRMED', 'REVIEW')
    `, [String(reason || '').slice(0, 255), nowMs(), orderId]);
    if (Number(result?.affectedRows ?? 0) === 1) return 'updated';
    const order = await getOrderForUpdate(orderId);
    if (!order) throw new Error('review_order_not_found');
    if (order.status === 'REVIEW') return 'already_review';
    if (order.status === 'PAYMENT_CONFIRMED') return 'superseded_by_confirmation';
    throw new Error(`review_persist_failed:${order.status}`);
  }, { attempts: 2 });
}

/**
 * 记录客户端上报的支付观察结果。
 * 若 code 为 USER_CANCELLED 或 PLATFORM_FAIL，同时将 PENDING 订单转为 STALE，
 * 释放该账号的 pending 限额，让用户可以立即重新购买。
 * （STALE 订单仍可被快手回调升为 PAYMENT_CONFIRMED，不影响真实扣款后的到账）
 */
async function recordClientResult (orderId, code, message) {
  const releaseOnCodes = ['USER_CANCELLED', 'PLATFORM_FAIL'];
  const shouldRelease = releaseOnCodes.includes(String(code));

  if (shouldRelease) {
    await getDb().run(`
      UPDATE iap_orders
      SET status = 'STALE',
          client_result_code = ?,
          client_result_message = ?,
          updated_at = ?
      WHERE order_id = ? AND status = 'PENDING'
    `, [
      String(code).slice(0, 32),
      String(message || '').slice(0, 255),
      nowMs(),
      orderId,
    ]);
  } else {
    await getDb().run(`
      UPDATE iap_orders
      SET client_result_code = ?, client_result_message = ?, updated_at = ?
      WHERE order_id = ?
    `, [
      String(code || '').slice(0, 32),
      String(message || '').slice(0, 255),
      nowMs(),
      orderId,
    ]);
  }
}

/**
 * 将超过有效期的 PENDING 订单批量转为 STALE（解除创建限额）。
 * @param {number} thresholdMs — 订单创建时间早于此值则转 STALE
 * @returns {number} 受影响行数
 */
async function stalePendingOrders (thresholdMs) {
  const result = await getDb().run(`
    UPDATE iap_orders SET status = 'STALE', updated_at = ?
    WHERE status = 'PENDING' AND created_at < ?
  `, [nowMs(), thresholdMs]);
  return Number(result?.affectedRows ?? 0);
}

/**
 * 查询账号最近的订单列表（供查单接口）。
 */
async function listOrdersByAccount (accountId, limit = 20) {
  const rows = await getDb().all(
    'SELECT * FROM iap_orders WHERE account_id = ? ORDER BY created_at DESC LIMIT ?',
    [accountId, limit],
  );
  return rows.map(rowToOrder);
}

/**
 * 查询当前账号可恢复的未完成订单。账号条件必须保留在 SQL 中，避免跨账号泄露。
 */
async function listPendingOrdersByAccount (accountId, limit = 20) {
  const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));
  const rows = await getDb().all(`
    SELECT * FROM iap_orders
    WHERE account_id = ? AND status IN ('PENDING', 'STALE', 'REVIEW')
    ORDER BY created_at DESC LIMIT ${safeLimit}
  `, [accountId]);
  return rows.map(rowToOrder);
}

/**
 * 写回调审计日志（独立路径，失败不回滚发钻事务）。
 */
async function insertNotifyLog (log) {
  const now = nowMs();
  try {
    await getDb().run(`
      INSERT INTO iap_notify_logs
        (log_id, received_at, order_id_prefix, platform_order_hash,
         app_id, verify_result, process_result, error_class, http_status, duration_ms, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      log.logId || `nlog_${now}_${Math.random().toString(36).slice(2, 8)}`,
      log.receivedAt || now,
      String(log.orderIdPrefix || '').slice(0, 32),
      String(log.platformOrderHash || '').slice(0, 64),
      String(log.appId || '').slice(0, 64),
      String(log.verifyResult || '').slice(0, 32),
      String(log.processResult || '').slice(0, 32),
      String(log.errorClass || '').slice(0, 64),
      Number(log.httpStatus || 200),
      Number(log.durationMs || 0),
      now,
    ]);
  } catch (err) {
    // 审计日志写入失败不影响主链路
    // eslint-disable-next-line no-console
    logger.warn('[iap-order-store] notify log write failed:', err.message);
  }
}

module.exports = {
  ORDER_STATUSES,
  getOrder,
  getOrderForUpdate,
  getOrderByAccountAndRequestId,
  countPendingOrders,
  insertOrder,
  bindPlatformOrderId,
  confirmPayment,
  markOrderReview,
  recordClientResult,
  stalePendingOrders,
  listOrdersByAccount,
  listPendingOrdersByAccount,
  insertNotifyLog,
};
