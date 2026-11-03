'use strict';

// open_id 按产品决策明文持久化；本模块不提供批量列表或 DTO 映射，调用方
// 只能按内部 accountId 获取平台调用凭据，并且不得记录返回值。
const { getDb } = require('../persistence/db');
const { normalizeKwaiOpenId } = require('./kwai-account-id');

function requireAccountId (accountId) {
  const value = String(accountId || '').trim();
  if (!value) throw new Error('kwai-identity-store: accountId required');
  return value;
}

function requireOpenId (openId) {
  const value = normalizeKwaiOpenId(openId);
  if (!value) throw new Error('kwai-identity-store: openId required');
  return value;
}

async function putOpenId (accountId, openId) {
  const id = requireAccountId(accountId);
  const value = requireOpenId(openId);
  const now = Date.now();
  await getDb().run(`
    INSERT INTO kwai_identity_bindings (account_id, open_id, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE open_id = VALUES(open_id), updated_at = VALUES(updated_at)
  `, [id, value, now, now]);
}

async function getOpenId (accountId) {
  const row = await getDb().get(
    'SELECT open_id FROM kwai_identity_bindings WHERE account_id = ?',
    [requireAccountId(accountId)],
  );
  return row ? String(row.open_id) : null;
}

async function requireOpenIdForAccount (accountId) {
  const openId = await getOpenId(accountId);
  if (!openId) {
    throw Object.assign(new Error('kwai identity binding not found'), { code: 'KWAI_IDENTITY_NOT_BOUND' });
  }
  return openId;
}

module.exports = { putOpenId, getOpenId, requireOpenIdForAccount };
