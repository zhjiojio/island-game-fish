'use strict';

const { getDb } = require('../persistence/db');

const STATUSES = Object.freeze({
  CREATED: 'CREATED',
  DEBITING: 'DEBITING',
  DEBIT_UNKNOWN: 'DEBIT_UNKNOWN',
  DEBIT_REJECTED: 'DEBIT_REJECTED',
  DEBIT_SUCCEEDED: 'DEBIT_SUCCEEDED',
  FULFILLING: 'FULFILLING',
  FULFILLED: 'FULFILLED',
  REVIEW: 'REVIEW',
});

function rowToOrder (row) {
  if (!row) return null;
  return {
    exchangeOrderId: row.exchange_order_id,
    accountId: row.account_id,
    clientRequestId: row.client_request_id,
    requestFingerprint: row.request_fingerprint,
    exchangeSkuId: row.exchange_sku_id,
    cost: String(row.cost),
    grantBeans: String(row.grant_beans),
    bonusBeans: String(row.bonus_beans || 0),
    os: row.os,
    userIp: row.user_ip,
    zoneId: row.zone_id,
    bizNo: row.biz_no,
    productName: row.product_name,
    productInfo: row.product_info,
    productDesc: row.product_desc,
    payPriority: Number(row.pay_priority),
    status: row.status,
    debitAttempts: Number(row.debit_attempts || 0),
    platformCode: row.platform_code || '',
    platformMessage: row.platform_message || '',
    chargeBalanceAfter: row.charge_balance_after == null ? null : String(row.charge_balance_after),
    freeBalanceAfter: row.free_balance_after == null ? null : String(row.free_balance_after),
    beansBalanceAfter: row.beans_balance_after == null ? null : String(row.beans_balance_after),
    debitConfirmedAt: row.debit_confirmed_at == null ? null : Number(row.debit_confirmed_at),
    fulfilledAt: row.fulfilled_at == null ? null : Number(row.fulfilled_at),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

async function getByAccountAndRequestId (accountId, clientRequestId, forUpdate = false) {
  const row = await getDb().get(`
    SELECT * FROM platform_exchange_orders
    WHERE account_id = ? AND client_request_id = ?${forUpdate ? ' FOR UPDATE' : ''}
  `, [accountId, clientRequestId]);
  return rowToOrder(row);
}

async function getById (exchangeOrderId, forUpdate = false) {
  const row = await getDb().get(
    `SELECT * FROM platform_exchange_orders WHERE exchange_order_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
    [exchangeOrderId],
  );
  return rowToOrder(row);
}

async function getBlockingByAccountAndSku (accountId, exchangeSkuId, forUpdate = false) {
  const row = await getDb().get(`
    SELECT * FROM platform_exchange_orders
    WHERE account_id = ? AND exchange_sku_id = ?
      AND status IN ('CREATED', 'DEBITING', 'DEBIT_UNKNOWN', 'DEBIT_SUCCEEDED', 'FULFILLING')
    ORDER BY created_at ASC
    LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}
  `, [accountId, exchangeSkuId]);
  return rowToOrder(row);
}

async function insertOrder (order) {
  const now = Date.now();
  await getDb().run(`
    INSERT INTO platform_exchange_orders
      (exchange_order_id, account_id, client_request_id, request_fingerprint,
       exchange_sku_id, cost, grant_beans, bonus_beans, os, user_ip, zone_id, biz_no,
       product_name, product_info, product_desc, pay_priority, status,
       debit_attempts, platform_code, platform_message, charge_balance_after,
       free_balance_after, beans_balance_after, debit_confirmed_at, fulfilled_at,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATED', 0, '', '', NULL, NULL, NULL, NULL, NULL, ?, ?)
  `, [
    order.exchangeOrderId, order.accountId, order.clientRequestId, order.requestFingerprint,
    order.exchangeSkuId, String(order.cost), String(order.grantBeans), String(order.bonusBeans || 0),
    order.os, order.userIp,
    order.zoneId, order.bizNo, order.productName, order.productInfo, order.productDesc,
    order.payPriority, now, now,
  ]);
}

async function beginDebitAttempt (exchangeOrderId, options = {}) {
  const now = Number(options.now || Date.now());
  const leaseExpiredAt = now - Number(options.leaseMs || 30_000);
  const result = await getDb().run(`
    UPDATE platform_exchange_orders
    SET status = 'DEBITING', debit_attempts = debit_attempts + 1, updated_at = ?
    WHERE exchange_order_id = ?
      AND (
        status = 'CREATED'
        OR status = 'DEBIT_UNKNOWN'
        OR (status = 'DEBITING' AND updated_at <= ?)
      )
  `, [now, exchangeOrderId, leaseExpiredAt]);
  return Number(result?.affectedRows || 0);
}

async function recordDebitResult (exchangeOrderId, status, result = {}) {
  if (![STATUSES.DEBIT_UNKNOWN, STATUSES.DEBIT_REJECTED, STATUSES.DEBIT_SUCCEEDED].includes(status)) {
    throw new Error(`platform-exchange-store: invalid debit status ${status}`);
  }
  const now = Date.now();
  const update = await getDb().run(`
    UPDATE platform_exchange_orders
    SET status = ?, platform_code = ?, platform_message = ?,
        charge_balance_after = ?, free_balance_after = ?,
        debit_confirmed_at = CASE WHEN ? = 'DEBIT_SUCCEEDED' THEN ? ELSE debit_confirmed_at END,
        updated_at = ?
    WHERE exchange_order_id = ? AND status = 'DEBITING'
  `, [
    status, String(result.code || '').slice(0, 64), String(result.message || '').slice(0, 255),
    result.chargeBalance == null ? null : String(result.chargeBalance),
    result.freeBalance == null ? null : String(result.freeBalance),
    status, now, now, exchangeOrderId,
  ]);
  return Number(update?.affectedRows || 0);
}

async function markReview (exchangeOrderId, reason) {
  const result = await getDb().run(`
    UPDATE platform_exchange_orders
    SET status = 'REVIEW', platform_message = ?, updated_at = ?
    WHERE exchange_order_id = ? AND status IN ('CREATED', 'DEBITING', 'DEBIT_UNKNOWN')
  `, [String(reason || '').slice(0, 255), Date.now(), exchangeOrderId]);
  return Number(result?.affectedRows || 0);
}

async function listRecoverable (options = {}) {
  const now = Number(options.now || Date.now());
  const unknownBefore = now - Number(options.retryDelayMs || 5_000);
  const leaseExpiredAt = now - Number(options.leaseMs || 30_000);
  const limit = Math.max(1, Math.min(100, Number(options.limit || 20)));
  const rows = await getDb().all(`
    SELECT * FROM platform_exchange_orders
    WHERE status IN ('DEBIT_SUCCEEDED', 'FULFILLING')
       OR status = 'CREATED'
       OR (status = 'DEBIT_UNKNOWN' AND updated_at <= ?)
       OR (status = 'DEBITING' AND updated_at <= ?)
    ORDER BY updated_at ASC
    LIMIT ${limit | 0}
  `, [unknownBefore, leaseExpiredAt]);
  return rows.map(rowToOrder);
}

async function markFulfilling (exchangeOrderId) {
  const result = await getDb().run(`
    UPDATE platform_exchange_orders SET status = 'FULFILLING', updated_at = ?
    WHERE exchange_order_id = ? AND status = 'DEBIT_SUCCEEDED'
  `, [Date.now(), exchangeOrderId]);
  return Number(result?.affectedRows || 0);
}

async function markFulfilled (exchangeOrderId, beansBalanceAfter) {
  const now = Date.now();
  const result = await getDb().run(`
    UPDATE platform_exchange_orders
    SET status = 'FULFILLED', beans_balance_after = ?, fulfilled_at = ?, updated_at = ?
    WHERE exchange_order_id = ? AND status IN ('DEBIT_SUCCEEDED', 'FULFILLING')
  `, [String(beansBalanceAfter), now, now, exchangeOrderId]);
  return Number(result?.affectedRows || 0);
}

module.exports = {
  STATUSES,
  getByAccountAndRequestId,
  getById,
  getBlockingByAccountAndSku,
  insertOrder,
  beginDebitAttempt,
  recordDebitResult,
  markReview,
  listRecoverable,
  markFulfilling,
  markFulfilled,
};
