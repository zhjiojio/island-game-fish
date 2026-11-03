// ============================================================
// IAP 充值商品 Catalog
// ------------------------------------------------------------
// 从 MySQL 读取 iap_products，提供短时只读缓存（默认 30 秒）。
// 更新商品时主动调用 invalidateCache() 使缓存失效。
// 缓存失效或数据库异常时 fail-closed：抛出异常，不使用客户端数据兜底。
// ============================================================

const { getDb } = require('../persistence/db');

const CACHE_TTL_MS = 30_000;

let _cache = null;
let _cacheAt = 0;

function rowToProduct (row) {
  return {
    skuId:          row.sku_id,
    displayName:    row.display_name,
    priceFen:       String(row.price_fen),
    currencyType:   row.currency_type,
    buyQuantity:    String(row.buy_quantity),
    platformCoinAmount: String(row.grant_diamonds),
    goodsCategory:  row.goods_category || '',
    productType:    Number(row.product_type),
    enabledAndroid: row.enabled_android === 1 || row.enabled_android === true,
    enabledIos:     row.enabled_ios === 1 || row.enabled_ios === true,
    displayOrder:   Number(row.display_order),
    version:        Number(row.version || 1),
  };
}

async function fetchFromDb () {
  const rows = await getDb().all(
    'SELECT * FROM iap_products ORDER BY display_order ASC',
    [],
  );
  return rows.map(rowToProduct);
}

async function getAllProducts () {
  const now = Date.now();
  if (_cache && now - _cacheAt < CACHE_TTL_MS) return _cache;
  const products = await fetchFromDb();
  _cache = products;
  _cacheAt = now;
  return products;
}

async function getEnabledProducts (platform) {
  const all = await getAllProducts();
  return all.filter(p => {
    if (platform === 'android') return p.enabledAndroid;
    if (platform === 'ios')     return p.enabledIos;
    return p.enabledAndroid || p.enabledIos;
  });
}

async function getProduct (skuId) {
  const all = await getAllProducts();
  return all.find(p => p.skuId === skuId) || null;
}

/**
 * 严格校验商品快照一致性（启动时及商品变更时调用）。
 * price_fen = buy_quantity × 10，充值确认数量 = buy_quantity，currency_type = CNY。
 */
async function validateCatalogIntegrity () {
  const products = await fetchFromDb();
  const errors = [];
  for (const p of products) {
    const priceFen = BigInt(p.priceFen);
    const buyQuantity = BigInt(p.buyQuantity);
    const platformCoinAmount = BigInt(p.platformCoinAmount);
    if (p.currencyType !== 'CNY') errors.push(`${p.skuId}: currency_type must be CNY`);
    // if (priceFen !== buyQuantity * 10n) errors.push(`${p.skuId}: price_fen mismatch`);
    if (platformCoinAmount !== buyQuantity) errors.push(`${p.skuId}: platform coin amount mismatch`);
    if (priceFen <= 0n) errors.push(`${p.skuId}: price_fen must be positive`);
    if ((p.enabledAndroid || p.enabledIos) && !p.goodsCategory) errors.push(`${p.skuId}: goods_category is required when enabled`);
  }
  if (errors.length) throw new Error('[catalog] integrity check failed:\n' + errors.join('\n'));
  return products;
}

function invalidateCache () {
  _cache = null;
  _cacheAt = 0;
}

module.exports = {
  getAllProducts,
  getEnabledProducts,
  getProduct,
  validateCatalogIntegrity,
  invalidateCache,
};
