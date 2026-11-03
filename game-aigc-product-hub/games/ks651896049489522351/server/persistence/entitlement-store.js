const { getDb, jsonStringify } = require('./db');

function requireId (value, field, maxLen) {
  const text = String(value || '').trim();
  if (!text || text.length > maxLen) throw new Error(`entitlement-store: invalid_${field}`);
  return text;
}

function rowToEntitlement (row) {
  if (!row) return null;
  return {
    accountId: row.account_id,
    sku: row.sku,
    kind: row.kind,
    source: row.source,
    priceBeans: Number(row.price_beans || 0),
    grantedAt: Number(row.granted_at || 0),
    expiresAt: Number(row.expires_at || 0),
    metaJson: row.meta_json || '{}',
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
  };
}

// 有效期判定：expiresAt = 0 表示永久；> 0 且已过当前时间即到期
function isExpired (entitlement, nowMs) {
  if (!entitlement) return true;
  const expiresAt = Number(entitlement.expiresAt || 0);
  return expiresAt > 0 && expiresAt <= (nowMs == null ? Date.now() : nowMs);
}

async function getEntitlement (accountId, sku) {
  const row = await getDb().get(
    'SELECT * FROM user_entitlements WHERE account_id = ? AND sku = ?',
    [requireId(accountId, 'account_id', 128), requireId(sku, 'sku', 64)]
  );
  return rowToEntitlement(row);
}

// 有效（未过期）的权益列表：到期行不下发，客户端所有权快照天然排除过期包
async function listEntitlements (accountId) {
  const rows = await getDb().all(
    'SELECT * FROM user_entitlements WHERE account_id = ? ORDER BY granted_at ASC, sku ASC',
    [requireId(accountId, 'account_id', 128)]
  );
  const now = Date.now();
  return rows.map(rowToEntitlement).filter(item => !isExpired(item, now));
}

async function hasEntitlement (accountId, sku) {
  return !isExpired(await getEntitlement(accountId, sku));
}

// 删除权益行（过期后重新购买时清旧记录；表主键为 (account_id, sku)）
async function deleteEntitlement (accountId, sku) {
  await getDb().run(
    'DELETE FROM user_entitlements WHERE account_id = ? AND sku = ?',
    [requireId(accountId, 'account_id', 128), requireId(sku, 'sku', 64)]
  );
}

// 直接改有效期（管理员后台用；expiresAt=0 即永久）
async function setEntitlementExpiry (accountId, sku, expiresAt) {
  const expiry = Number(expiresAt || 0);
  if (!Number.isSafeInteger(expiry) || expiry < 0) throw new Error('entitlement-store: invalid_expires_at');
  await getDb().run(
    'UPDATE user_entitlements SET expires_at = ?, updated_at = ? WHERE account_id = ? AND sku = ?',
    [expiry, Date.now(), requireId(accountId, 'account_id', 128), requireId(sku, 'sku', 64)]
  );
  return getEntitlement(accountId, sku);
}

async function insertEntitlement (input) {
  const accountId = requireId(input.accountId, 'account_id', 128);
  const sku = requireId(input.sku, 'sku', 64);
  const kind = requireId(input.kind, 'kind', 64);
  const source = requireId(input.source, 'source', 32);
  const priceBeans = Number(input.priceBeans || 0);
  if (!Number.isSafeInteger(priceBeans) || priceBeans < 0) throw new Error('entitlement-store: invalid_price_beans');
  const now = Number(input.grantedAt || Date.now());
  const expiresAt = Number(input.expiresAt || 0);
  await getDb().run(`
    INSERT INTO user_entitlements (
      account_id, sku, kind, source, price_beans, granted_at, expires_at,
      meta_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [accountId, sku, kind, source, priceBeans, now, expiresAt, jsonStringify(input.meta || {}), now, now]);
  return getEntitlement(accountId, sku);
}

module.exports = {
  rowToEntitlement,
  isExpired,
  getEntitlement,
  listEntitlements,
  hasEntitlement,
  insertEntitlement,
  deleteEntitlement,
  setEntitlementExpiry,
};
