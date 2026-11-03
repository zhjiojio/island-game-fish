// IAP 商品档位种子（充值 iap_products + 兑换 platform_exchange_products）
//
// 背景：档位是数据库业务数据，不随 git 走，多机开发时新库 init 后商城档位为空。
// 现固化为 seed 数据随仓库分发，新机器跑一次 npm run db:init:mysql 即齐。
//
// 用法：
//   npm run db:init:mysql                    // init 流程自动播种（幂等，不覆盖已有行）
//   npm run db:seed:iap                      // 单独重播（同上）
//   npm run db:seed:iap -- --resync          // 以 seed 文件为准强制覆盖（admin 改动会被拉回 seed 版本）
//   npm run db:seed:iap -- --export          // 从当前库导出，覆盖 data/iap-products.json（固化 admin 改动用）
//
// 日常改档位流程：admin 后台调整 → `npm run db:seed:iap -- --export` 固化 → git 提交
// → 其他机器 `git pull` 后跑 `npm run db:init:mysql`（或 --resync 强制同步）。
//
// 语义说明：
//   默认 INSERT IGNORE —— 已存在的档位不覆盖（保留各环境自己的调整/开关）；
//   --resync 用 ON DUPLICATE KEY UPDATE —— seed 文件是唯一真相源，强制拉齐。
//
// 注：脚本启动时自动加载同目录上级的 server/.env（存在时），已注入的 env 不覆盖。

(function loadDotEnv () {
  try {
    const fs = require('fs');
    const path = require('path');
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
      for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
      }
    }
  } catch (e) { /* ignore */ }
})();

const fs = require('fs');
const path = require('path');
const { getDb, closeDb } = require('../persistence/db');

const DATA_PATH = path.join(__dirname, 'data', 'iap-products.json');

function loadSeedData () {
  if (!fs.existsSync(DATA_PATH)) return { iapProducts: [], exchangeProducts: [] };
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
}

// ── 播种 ────────────────────────────────────────────────────────────────────
const IAP_COLUMNS = [
  'sku_id', 'display_name', 'price_fen', 'currency_type', 'buy_quantity',
  'grant_diamonds', 'goods_category', 'product_type', 'enabled_android',
  'enabled_ios', 'display_order', 'version',
];
const EXCHANGE_COLUMNS = [
  'exchange_sku_id', 'platform_product_id', 'platform_product_type', 'display_name',
  'cost_balance', 'grant_beans', 'enabled', 'display_order', 'version',
  'product_tag', 'is_first_charge', 'first_charge_bonus_beans',
];

async function seedIapProducts (db, options = {}) {
  const resync = !!options.resync;
  const { iapProducts = [], exchangeProducts = [] } = loadSeedData();
  if (!iapProducts.length && !exchangeProducts.length) {
    console.log('[IAP seed] data/iap-products.json 为空，跳过（先 --export 生成）');
    return { iap: 0, exchange: 0 };
  }

  const now = Date.now();
  const insertOne = async (table, columns, row) => {
    const placeholders = columns.map(() => '?').join(', ');
    const values = columns.map(c => row[c]);
    values.push(now, now);   // created_at / updated_at
    const verb = resync
      ? `INSERT INTO ${table} (${columns.join(', ')}, created_at, updated_at)
         VALUES (${placeholders}, ?, ?)
         ON DUPLICATE KEY UPDATE ${columns.map(c => `${c} = VALUES(${c})`).join(', ')}, updated_at = VALUES(updated_at)`
      : `INSERT IGNORE INTO ${table} (${columns.join(', ')}, created_at, updated_at)
         VALUES (${placeholders}, ?, ?)`;
    await db.run(verb, values);
  };

  for (const row of iapProducts) await insertOne('iap_products', IAP_COLUMNS, row);
  for (const row of exchangeProducts) await insertOne('platform_exchange_products', EXCHANGE_COLUMNS, row);
  console.log(`[IAP seed] 播种完成: 充值档位 ${iapProducts.length} 条, 兑换档位 ${exchangeProducts.length} 条 (${resync ? 'resync 覆盖' : 'INSERT IGNORE 幂等'})`);
  return { iap: iapProducts.length, exchange: exchangeProducts.length };
}

// ── 导出（固化 admin 改动）─────────────────────────────────────────────────
async function exportIapProducts (db) {
  const iapProducts = await db.all('SELECT * FROM iap_products ORDER BY display_order');
  const exchangeProducts = await db.all('SELECT * FROM platform_exchange_products ORDER BY display_order');
  const pick = (rows, cols) => rows.map(r => {
    const out = {};
    for (const c of cols) out[c] = r[c];
    return out;
  });
  const data = {
    // 充值档位（快手 IAP 钻石 SKU）
    iapProducts: pick(iapProducts, IAP_COLUMNS),
    // 平台币兑换铁豆档位
    exchangeProducts: pick(exchangeProducts, EXCHANGE_COLUMNS),
  };
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + '\n');
  console.log(`[IAP seed] 已导出 ${iapProducts.length} 充值 + ${exchangeProducts.length} 兑换 → ${DATA_PATH}`);
}

// ── CLI ────────────────────────────────────────────────────────────────────
async function main () {
  const mode = process.argv[2] || '';
  const db = getDb();
  try {
    if (mode === '--export') {
      await exportIapProducts(db);
    } else {
      await seedIapProducts(db, { resync: mode === '--resync' });
    }
  } finally {
    await closeDb();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error('[IAP seed] 失败:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { seedIapProducts };
