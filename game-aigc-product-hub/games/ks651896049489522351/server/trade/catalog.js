'use strict';

// 语音包有效期：7 天（毫秒）。每档 durationMs 独立配置，
// 后续要为某个语音包单独调整期限时只改对应一行即可。
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const ITEMS = [
  // 与 game-ai/voice-config.js 的 PACKS 一一对应（服务端启动时强校验 sku 对齐）
  // grant.durationMs：购买后的有效期；0 = 永久（免费默认包）。
  { sku: 'voice_pack:default', type: 'voice_pack', priceBeans: 0, payment: 'beans', saleEnabled: true, promoLabel: '免费', grant: { kind: 'entitlement', sku: 'voice_pack:default', durationMs: 0 } },
  { sku: 'voice_pack:tiezi', type: 'voice_pack', priceBeans: 100, payment: 'beans', saleEnabled: true, promoLabel: '', grant: { kind: 'entitlement', sku: 'voice_pack:tiezi', durationMs: SEVEN_DAYS_MS } },
  { sku: 'voice_pack:tianmei', type: 'voice_pack', priceBeans: 100, payment: 'beans', saleEnabled: true, promoLabel: '', grant: { kind: 'entitlement', sku: 'voice_pack:tianmei', durationMs: SEVEN_DAYS_MS } },
];

const SKU_PATTERN = /^[a-zA-Z0-9_:-]+$/;
const SUPPORTED_TYPES = new Set(['voice_pack']);
const SUPPORTED_PAYMENTS = new Set(['beans']);
const SUPPORTED_GRANTS = new Set(['entitlement']);
const bySku = new Map();

function validateItem (item) {
  if (!item || typeof item !== 'object') throw new Error('catalog_item_required');
  if (!item.sku || item.sku.length > 64 || !SKU_PATTERN.test(item.sku)) throw new Error(`catalog_invalid_sku:${item.sku || ''}`);
  if (bySku.has(item.sku)) throw new Error(`catalog_duplicate_sku:${item.sku}`);
  if (!SUPPORTED_TYPES.has(item.type)) throw new Error(`catalog_invalid_type:${item.sku}`);
  if (!Number.isSafeInteger(item.priceBeans) || item.priceBeans < 0) throw new Error(`catalog_invalid_price:${item.sku}`);
  if (!SUPPORTED_PAYMENTS.has(item.payment)) throw new Error(`catalog_invalid_payment:${item.sku}`);
  if (!item.grant || !SUPPORTED_GRANTS.has(item.grant.kind) || item.grant.sku !== item.sku) throw new Error(`catalog_invalid_grant:${item.sku}`);
  if (!Number.isSafeInteger(item.grant.durationMs) || item.grant.durationMs < 0) throw new Error(`catalog_invalid_duration:${item.sku}`);
}

for (const item of ITEMS) {
  validateItem(item);
  bySku.set(item.sku, Object.freeze({ ...item, grant: Object.freeze({ ...item.grant }) }));
}

function get (sku) {
  return bySku.get(String(sku || '')) || null;
}

function requireItem (sku) {
  const item = get(sku);
  if (!item) {
    const err = new Error('商品不存在');
    err.code = 'SKU_NOT_FOUND';
    throw err;
  }
  if (!item.saleEnabled) {
    const err = new Error('商品已停止售卖');
    err.code = 'SKU_DISABLED';
    throw err;
  }
  return item;
}

function listPublicItems () {
  return Array.from(bySku.values()).map(item => ({
    sku: item.sku,
    type: item.type,
    priceBeans: item.priceBeans,
    promoLabel: item.promoLabel || '',
    saleEnabled: !!item.saleEnabled,
  }));
}

function buildPurchaseIdempotencyKey (accountId, sku) {
  const key = `purchase:${sku}:${accountId}`;
  if (key.length > 255) throw new Error('purchase_idempotency_key_too_long');
  return key;
}

module.exports = { ITEMS, get, requireItem, listPublicItems, buildPurchaseIdempotencyKey };
