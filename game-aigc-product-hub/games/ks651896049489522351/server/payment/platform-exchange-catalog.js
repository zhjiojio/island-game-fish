// ============================================================
// 平台币兑换商品 Catalog
// ============================================================

const { getDb } = require('../persistence/db');

const PRODUCT_TAGS = ['normal', 'recommend', 'hot'];

const CACHE_TTL_MS = 30_000;
let _cache = null;
let _cacheAt = 0;

function rowToExchangeProduct (row) {
  return {
    exchangeSkuId: row.exchange_sku_id,
    platformProductId: String(row.platform_product_id),
    platformProductType: Number(row.platform_product_type),
    displayName: row.display_name,
    costBalance: String(row.cost_balance),
    grantBeans: String(row.grant_beans),
    enabled: row.enabled === 1 || row.enabled === true,
    displayOrder: Number(row.display_order),
    version: Number(row.version || 1),
    productTag: PRODUCT_TAGS.includes(row.product_tag) ? row.product_tag : 'normal',
    isFirstCharge: row.is_first_charge === 1 || row.is_first_charge === true,
    firstChargeBonusBeans: String(row.first_charge_bonus_beans || 0),
  };
}

// 「首充」是用户在该档位的一次性资格。判定口径统一用 wallet_ledger 的到账流水，
// 因为 mock 链路不写 platform_exchange_orders，只有流水是两条链路共同的发放事实。
async function getFirstChargeClaimedSkuIds (accountId) {
  if (!accountId) return new Set();
  const rows = await getDb().all(`
    SELECT DISTINCT JSON_UNQUOTE(JSON_EXTRACT(meta_json, '$.skuId')) AS sku_id
    FROM wallet_ledger
    WHERE account_id = ? AND type = 'platform_exchange_credit'
  `, [accountId]);
  return new Set(rows.map(row => row.sku_id).filter(Boolean));
}

async function isFirstChargeAvailable (accountId, exchangeSkuId) {
  const row = await getDb().get(`
    SELECT 1 AS hit FROM wallet_ledger
    WHERE account_id = ? AND type = 'platform_exchange_credit'
      AND JSON_UNQUOTE(JSON_EXTRACT(meta_json, '$.skuId')) = ?
    LIMIT 1
  `, [accountId, exchangeSkuId]);
  return !row;
}

// 下发视图：首充角标按账号动态失效，失效后只保留 product_tag 本身的样式
async function getExchangeProductsForAccount (accountId) {
  const products = await getEnabledExchangeProducts();
  if (!products.some(p => p.isFirstCharge)) return products.map(p => toPublicProduct(p, true));
  const claimed = await getFirstChargeClaimedSkuIds(accountId);
  return products.map(p => toPublicProduct(p, claimed.has(p.exchangeSkuId)));
}

function toPublicProduct (product, firstChargeClaimed = false) {
  const firstCharge = product.isFirstCharge && !firstChargeClaimed;
  return {
    exchangeSkuId: product.exchangeSkuId,
    displayName: product.displayName,
    costBalance: product.costBalance,
    grantBeans: product.grantBeans,
    displayOrder: product.displayOrder,
    productTag: product.productTag,
    firstCharge,
    bonusBeans: firstCharge ? product.firstChargeBonusBeans : '0',
  };
}

async function getAllExchangeProducts () {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;
  const rows = await getDb().all(
    'SELECT * FROM platform_exchange_products ORDER BY display_order ASC', [],
  );
  _cache = rows.map(rowToExchangeProduct);
  _cacheAt = now;
  return _cache;
}

async function getEnabledExchangeProducts () {
  const all = await getAllExchangeProducts();
  return all.filter(p => p.enabled);
}

async function getExchangeProduct (exchangeSkuId) {
  const all = await getAllExchangeProducts();
  return all.find(p => p.exchangeSkuId === exchangeSkuId) || null;
}

async function validateExchangeCatalogIntegrity () {
  const rows = await getDb().all('SELECT * FROM platform_exchange_products', []);
  const errors = [];
  for (const row of rows) {
    const p = rowToExchangeProduct(row);
    if (!/^\d+$/.test(p.platformProductId) || BigInt(p.platformProductId) <= 0n) {
      errors.push(`${p.exchangeSkuId}: platform_product_id must be positive`);
    }
    if (![0, 1, 2].includes(p.platformProductType)) {
      errors.push(`${p.exchangeSkuId}: platform_product_type must be 0, 1 or 2`);
    }
    if (BigInt(p.grantBeans) !== BigInt(p.costBalance) * 1000n) {
      errors.push(`${p.exchangeSkuId}: grant_beans must equal cost_balance * 1000`);
    }
    if (!PRODUCT_TAGS.includes(p.productTag)) {
      errors.push(`${p.exchangeSkuId}: product_tag must be one of ${PRODUCT_TAGS.join(', ')}`);
    }
    if (p.isFirstCharge && BigInt(p.firstChargeBonusBeans) <= 0n) {
      errors.push(`${p.exchangeSkuId}: first_charge_bonus_beans must be positive when is_first_charge is set`);
    }
  }
  if (errors.length) throw new Error('[exchange-catalog] integrity check failed:\n' + errors.join('\n'));
}

function invalidateCache () { _cache = null; _cacheAt = 0; }

module.exports = {
  getAllExchangeProducts,
  getEnabledExchangeProducts,
  getExchangeProductsForAccount,
  getExchangeProduct,
  isFirstChargeAvailable,
  validateExchangeCatalogIntegrity,
  invalidateCache,
};
