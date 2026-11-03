const { AsyncLocalStorage } = require('async_hooks');
const fs = require('fs');
const path = require('path');
const logger = require('../logger');

// 持久层强约束：本项目只支持 MySQL / InnoDB。
// 禁止新增 SQLite、本地 .db 文件、双方言分支或 SQLite-only SQL 语法。
const DIALECT = 'mysql';

if (String(process.env.DDZ_DB_DIALECT || 'mysql').toLowerCase() !== 'mysql') {
  throw new Error('Unsupported DDZ_DB_DIALECT: this project is MySQL-only. Use MySQL / InnoDB and remove SQLite configuration.');
}

let provider = null;

function jsonStringify (value) {
  return JSON.stringify(value == null ? null : value);
}

function createMysqlProvider () {
  let pool = null;
  const txStorage = new AsyncLocalStorage();

  function mysqlConfig () {
    return {
      host: process.env.DDZ_MYSQL_HOST || '127.0.0.1',
      port: parseInt(process.env.DDZ_MYSQL_PORT || '3306', 10),
      user: process.env.DDZ_MYSQL_USER || 'root',
      password: process.env.DDZ_MYSQL_PASSWORD || '',
      database: process.env.DDZ_MYSQL_DATABASE || 'ddz',
      waitForConnections: true,
      connectionLimit: parseInt(process.env.DDZ_MYSQL_CONNECTION_LIMIT || '10', 10),
      queueLimit: parseInt(process.env.DDZ_MYSQL_QUEUE_LIMIT || '0', 10),
      connectTimeout: parseInt(process.env.DDZ_MYSQL_CONNECT_TIMEOUT_MS || '5000', 10),
      charset: 'utf8mb4',
      supportBigNumbers: true,
      bigNumberStrings: true,
      ssl: String(process.env.DDZ_MYSQL_SSL || '').toLowerCase() === 'true' ? {} : undefined,
    };
  }

  async function ensurePool () {
    if (pool) return pool;
    let mysql;
    try {
      mysql = require('mysql2/promise');
    } catch (err) {
      throw new Error('mysql2 dependency is required. Please run npm install in server directory.');
    }
    pool = mysql.createPool(mysqlConfig());
    return pool;
  }

  async function query (sql, params = []) {
    const txContext = txStorage.getStore();
    const conn = txContext?.connection || await ensurePool();
    const [rows] = await conn.execute(sql, params);
    return rows;
  }

  async function runSql (sql, params = []) {
    const rows = await query(sql, params);
    return rows;
  }

  return {
    dialect: 'mysql',
    get label () {
      const cfg = mysqlConfig();
      return `${cfg.host}:${cfg.port}/${cfg.database}`;
    },
    async init () {
      await ensurePool();
      // 数据库可能处于自动暂停唤醒中（如 CloudBase 标准版），
      // 首次连接会超时，重试几次等它唤醒。
      const maxAttempts = 5;
      const retryDelayMs = 8000;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await assertMysqlSchemaReady(this);
          return;
        } catch (err) {
          if (err && err.code === 'ER_BAD_DB_ERROR') {
            throw new Error(`MySQL database is not initialized: ${mysqlConfig().database}. Run \`npm run db:init:mysql\` in server directory first.`);
          }
          const isRetryable = err && (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.fatal);
          if (isRetryable && attempt < maxAttempts) {
            logger.warn(`[DB] 连接失败 (${attempt}/${maxAttempts})，${retryDelayMs / 1000}s 后重试: ${err.message}`);
            await new Promise(r => setTimeout(r, retryDelayMs));
            // 重建连接池，旧 pool 可能已损坏
            if (pool) { try { await pool.end(); } catch {} pool = null; }
            await ensurePool();
            continue;
          }
          throw err;
        }
      }
    },
    async close () {
      if (pool) await pool.end();
      pool = null;
    },
    async get (sql, params = []) {
      const rows = await query(sql, params);
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    async all (sql, params = []) {
      const rows = await query(sql, params);
      return Array.isArray(rows) ? rows : [];
    },
    async run (sql, params = []) {
      return runSql(sql, params);
    },
    async transaction (fn) {
      const activeContext = txStorage.getStore();
      if (activeContext?.connection) return fn(this);
      const currentPool = await ensurePool();
      const conn = await currentPool.getConnection();
      try {
        await conn.beginTransaction();
        const result = await txStorage.run({ connection: conn }, () => fn(this));
        await conn.commit();
        return result;
      } catch (err) {
        try { await conn.rollback(); } catch {}
        throw err;
      } finally {
        conn.release();
      }
    },
    isTransactionActive () {
      return !!txStorage.getStore()?.connection;
    },
    async getWalletForUpdate (accountId) {
      return this.get('SELECT * FROM wallets WHERE account_id = ? FOR UPDATE', [accountId]);
    },
    insertIgnoreKeyword: 'INSERT IGNORE',
    greatestZeroExpr (column) { return `GREATEST(0, ${column})`; },
  };
}


const REQUIRED_MYSQL_TABLES = [
  'accounts',
  'wallets',
  'wallet_ledger',
  'user_entitlements',
  'reward_claims',
  'game_matches',
  'game_match_events',
  'game_match_participants',
  'bot_match_stats',
  'bot_human_pair_stats',
  'bot_quota_reservations',
  'bot_treasury_reservations',
];

const IAP_MYSQL_TABLES = [
  'iap_products',
  'iap_orders',
  'iap_notify_logs',
  'platform_exchange_products',
  'kwai_identity_bindings',
  'platform_exchange_orders',
  'platform_coin_balance_cache',
];

function isIapSchemaRequired () {
  return true;
}

const IAP_REQUIRED_COLUMNS = {
  iap_products: [
    'sku_id', 'display_name', 'price_fen', 'currency_type', 'buy_quantity', 'grant_diamonds',
    'goods_category', 'product_type', 'enabled_android', 'enabled_ios', 'display_order', 'version',
    'created_at', 'updated_at',
  ],
  iap_orders: [
    'order_id', 'account_id', 'client_request_id', 'sku_id', 'platform', 'zone_id',
    'currency_type', 'buy_quantity', 'price_fen', 'grant_diamonds', 'product_type',
    'request_fingerprint', 'goods_category', 'goods_name', 'extension', 'status',
    'platform_order_id', 'client_result_code', 'client_result_message', 'notify_count',
    'last_notify_at', 'payment_confirmed_at', 'created_at', 'updated_at',
  ],
  iap_notify_logs: [
    'log_id', 'received_at', 'order_id_prefix', 'platform_order_hash', 'app_id',
    'verify_result', 'process_result', 'error_class', 'http_status', 'duration_ms', 'created_at',
  ],
  platform_exchange_products: [
    'exchange_sku_id', 'platform_product_id', 'platform_product_type', 'display_name',
    'cost_balance', 'grant_beans', 'enabled', 'display_order', 'version',
    'product_tag', 'is_first_charge', 'first_charge_bonus_beans', 'created_at', 'updated_at',
  ],
  kwai_identity_bindings: ['account_id', 'open_id', 'created_at', 'updated_at'],
  platform_exchange_orders: [
    'exchange_order_id', 'account_id', 'client_request_id', 'request_fingerprint',
    'exchange_sku_id', 'cost', 'grant_beans', 'bonus_beans', 'os', 'user_ip', 'zone_id', 'biz_no',
    'product_name', 'product_info', 'product_desc', 'pay_priority', 'status',
    'debit_attempts', 'platform_code', 'platform_message', 'charge_balance_after',
    'free_balance_after', 'beans_balance_after', 'debit_confirmed_at', 'fulfilled_at',
    'created_at', 'updated_at',
  ],
  platform_coin_balance_cache: [
    'account_id', 'os', 'zone_id', 'charge_balance', 'free_balance', 'observed_at',
  ],
};

const IAP_REQUIRED_COLUMN_TYPES = {
  'iap_products.price_fen': 'bigint',
  'iap_products.buy_quantity': 'bigint',
  'iap_products.grant_diamonds': 'bigint',
  'iap_orders.buy_quantity': 'bigint',
  'iap_orders.price_fen': 'bigint',
  'iap_orders.grant_diamonds': 'bigint',
  'platform_exchange_products.cost_balance': 'bigint',
  'platform_exchange_products.grant_beans': 'bigint',
  'platform_exchange_products.platform_product_id': 'bigint',
  'platform_exchange_products.first_charge_bonus_beans': 'bigint',
  'platform_exchange_orders.cost': 'bigint',
  'platform_exchange_orders.grant_beans': 'bigint',
  'platform_exchange_orders.bonus_beans': 'bigint',
  'platform_coin_balance_cache.charge_balance': 'bigint',
  'platform_coin_balance_cache.free_balance': 'bigint',
};

const IAP_REQUIRED_UNIQUE_INDEXES = {
  iap_products: { PRIMARY: ['sku_id'] },
  iap_orders: {
    PRIMARY: ['order_id'],
    uniq_iap_account_request: ['account_id', 'client_request_id'],
    uniq_iap_platform_order: ['platform_order_id'],
  },
  iap_notify_logs: { PRIMARY: ['log_id'] },
  platform_exchange_products: { PRIMARY: ['exchange_sku_id'] },
  kwai_identity_bindings: {
    PRIMARY: ['account_id'],
    uniq_kwai_identity_open_id: ['open_id'],
  },
  platform_exchange_orders: {
    PRIMARY: ['exchange_order_id'],
    uniq_platform_exchange_biz_no: ['biz_no'],
    uniq_platform_exchange_account_request: ['account_id', 'client_request_id'],
  },
  platform_coin_balance_cache: { PRIMARY: ['account_id', 'os', 'zone_id'] },
};

const IAP_REQUIRED_CHECKS = {
  iap_products: [
    'price_fen>0', 'buy_quantity>0', 'grant_diamonds>0',
    'price_fen=buy_quantity*10', 'grant_diamonds=buy_quantity',
  ],
  iap_orders: [
    'buy_quantity>0', 'grant_diamonds>0', 'price_fen>0',
    'price_fen=buy_quantity*10', 'grant_diamonds=buy_quantity',
  ],
  platform_exchange_products: [
    'platform_product_id>0', 'cost_balance>0', 'grant_beans>0', 'grant_beans=cost_balance*1000',
  ],
  platform_exchange_orders: [
    'cost>0', 'grant_beans>0', 'pay_priority=1',
    'charge_balance_afterisnullorcharge_balance_after>=0',
    'free_balance_afterisnullorfree_balance_after>=0',
    'beans_balance_afterisnullorbeans_balance_after>=0',
  ],
  platform_coin_balance_cache: ['charge_balance>=0', 'free_balance>=0'],
};

function schemaValue (row, lower, upper) {
  return row[lower] ?? row[upper];
}

function normalizeCheckClause (clause) {
  return String(clause || '').toLowerCase().replace(/[`\s()]/g, '');
}

async function assertIapSchemaIntegrity (db) {
  const tableRows = await db.all(`
    SELECT TABLE_NAME AS table_name, ENGINE AS engine
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (${IAP_MYSQL_TABLES.map(() => '?').join(', ')})
  `, IAP_MYSQL_TABLES);
  const tables = new Map(tableRows.map(row => [schemaValue(row, 'table_name', 'TABLE_NAME'), row]));
  for (const table of IAP_MYSQL_TABLES) {
    const row = tables.get(table);
    if (!row) throw new Error(`IAP schema missing table: ${table}`);
    if (String(schemaValue(row, 'engine', 'ENGINE')).toUpperCase() !== 'INNODB') {
      throw new Error(`IAP table must use InnoDB: ${table}`);
    }
  }

  const columnRows = await db.all(`
    SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name,
           DATA_TYPE AS data_type, IS_NULLABLE AS is_nullable
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (${Object.keys(IAP_REQUIRED_COLUMNS).map(() => '?').join(', ')})
  `, Object.keys(IAP_REQUIRED_COLUMNS));
  const columns = new Map(columnRows.map(row => [
    `${schemaValue(row, 'table_name', 'TABLE_NAME')}.${schemaValue(row, 'column_name', 'COLUMN_NAME')}`,
    row,
  ]));
  for (const [table, names] of Object.entries(IAP_REQUIRED_COLUMNS)) {
    for (const name of names) {
      const key = `${table}.${name}`;
      const row = columns.get(key);
      if (!row) throw new Error(`IAP schema missing column: ${key}`);
      const requiredType = IAP_REQUIRED_COLUMN_TYPES[key];
      if (requiredType && String(schemaValue(row, 'data_type', 'DATA_TYPE')).toLowerCase() !== requiredType) {
        throw new Error(`IAP schema invalid column type: ${key}`);
      }
      if (requiredType && String(schemaValue(row, 'is_nullable', 'IS_NULLABLE')).toUpperCase() !== 'NO') {
        throw new Error(`IAP schema money column must be NOT NULL: ${key}`);
      }
    }
  }

  const indexRows = await db.all(`
    SELECT TABLE_NAME AS table_name, INDEX_NAME AS index_name, NON_UNIQUE AS non_unique,
           SEQ_IN_INDEX AS seq_in_index, COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (${Object.keys(IAP_REQUIRED_UNIQUE_INDEXES).map(() => '?').join(', ')})
  `, Object.keys(IAP_REQUIRED_UNIQUE_INDEXES));
  const uniqueIndexes = new Map();
  for (const row of indexRows) {
    if (Number(schemaValue(row, 'non_unique', 'NON_UNIQUE')) !== 0) continue;
    const key = `${schemaValue(row, 'table_name', 'TABLE_NAME')}.${schemaValue(row, 'index_name', 'INDEX_NAME')}`;
    if (!uniqueIndexes.has(key)) uniqueIndexes.set(key, []);
    uniqueIndexes.get(key).push({
      position: Number(schemaValue(row, 'seq_in_index', 'SEQ_IN_INDEX')),
      column: schemaValue(row, 'column_name', 'COLUMN_NAME'),
    });
  }
  for (const [table, indexes] of Object.entries(IAP_REQUIRED_UNIQUE_INDEXES)) {
    for (const [name, expectedColumns] of Object.entries(indexes)) {
      const actual = (uniqueIndexes.get(`${table}.${name}`) || [])
        .sort((a, b) => a.position - b.position)
        .map(item => item.column);
      if (actual.join(',') !== expectedColumns.join(',')) {
        throw new Error(`IAP schema invalid unique index: ${table}.${name}`);
      }
    }
  }

  const checkRows = await db.all(`
    SELECT tc.TABLE_NAME AS table_name, cc.CHECK_CLAUSE AS check_clause
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
    JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
      ON cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
     AND cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
    WHERE tc.CONSTRAINT_SCHEMA = DATABASE()
      AND tc.CONSTRAINT_TYPE = 'CHECK'
      AND tc.TABLE_NAME IN (${Object.keys(IAP_REQUIRED_CHECKS).map(() => '?').join(', ')})
  `, Object.keys(IAP_REQUIRED_CHECKS));
  const checks = new Map();
  for (const row of checkRows) {
    const table = schemaValue(row, 'table_name', 'TABLE_NAME');
    if (!checks.has(table)) checks.set(table, []);
    checks.get(table).push(normalizeCheckClause(schemaValue(row, 'check_clause', 'CHECK_CLAUSE')));
  }
  for (const [table, expectedClauses] of Object.entries(IAP_REQUIRED_CHECKS)) {
    const actualClauses = checks.get(table) || [];
    for (const expected of expectedClauses) {
      if (!actualClauses.some(actual => actual === expected)) {
        throw new Error(`IAP schema missing check constraint: ${table}.${expected}`);
      }
    }
  }
}

const REQUIRED_MYSQL_COLUMNS = {
  accounts: ['account_type'],
  game_matches: ['has_bots', 'human_count', 'bot_count', 'bot_mode', 'bot_strategy_version'],
};

async function assertMysqlSchemaReady (db) {
  const requiredTables = REQUIRED_MYSQL_TABLES.concat(
    isIapSchemaRequired() ? IAP_MYSQL_TABLES : [],
  );
  const placeholders = requiredTables.map(() => '?').join(', ');
  const rows = await db.all(`
    SELECT TABLE_NAME AS table_name
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN (${placeholders})
  `, requiredTables);
  const existing = new Set(rows.map(row => row.table_name || row.TABLE_NAME));
  const missing = requiredTables.filter(name => !existing.has(name));
  if (missing.length > 0) {
    throw new Error(`MySQL schema is not initialized. Missing tables: ${missing.join(', ')}. Run \`npm run db:init:mysql\` in server directory first.`);
  }
  if (isIapSchemaRequired()) await assertIapSchemaIntegrity(db);

  const requiredColumnNames = Object.values(REQUIRED_MYSQL_COLUMNS).flat();
  const columnPlaceholders = requiredColumnNames.map(() => '?').join(', ');
  const columnRows = await db.all(`
    SELECT TABLE_NAME AS table_name, COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('accounts', 'game_matches')
      AND COLUMN_NAME IN (${columnPlaceholders})
  `, requiredColumnNames);
  const existingColumns = new Set(columnRows.map(row =>
    `${row.table_name || row.TABLE_NAME}.${row.column_name || row.COLUMN_NAME}`));
  const missingColumns = [];
  for (const [table, columns] of Object.entries(REQUIRED_MYSQL_COLUMNS)) {
    for (const column of columns) {
      if (!existingColumns.has(`${table}.${column}`)) missingColumns.push(`${table}.${column}`);
    }
  }
  if (missingColumns.length > 0) {
    throw new Error(`MySQL schema migration is incomplete. Missing columns: ${missingColumns.join(', ')}. Ask DBA to apply scripts/migrations/20260810_bot_matchmaking_p0.sql.`);
  }
}

async function migrateMysql (db) {
  await db.run(`CREATE TABLE IF NOT EXISTS accounts (
    account_id VARCHAR(128) PRIMARY KEY,
    account_type VARCHAR(32) NOT NULL DEFAULT 'user',
    login_type VARCHAR(32) NOT NULL DEFAULT 'guest',
    kwai_open_id_hash VARCHAR(128) NOT NULL DEFAULT '',
    device_id VARCHAR(128) NOT NULL DEFAULT '',
    first_ip VARCHAR(64) NOT NULL DEFAULT '',
    last_ip VARCHAR(64) NOT NULL DEFAULT '',
    login_count BIGINT NOT NULL DEFAULT 0,
    banned TINYINT NOT NULL DEFAULT 0,
    ban_reason VARCHAR(255) NOT NULL DEFAULT '',
    nickname VARCHAR(64) NOT NULL DEFAULT '',
    created_at BIGINT NOT NULL,
    last_login_at BIGINT NOT NULL DEFAULT 0,
    INDEX idx_accounts_type (account_type),
    INDEX idx_accounts_device (device_id),
    INDEX idx_accounts_openid (kwai_open_id_hash)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS wallets (
    account_id VARCHAR(128) PRIMARY KEY,
    beans BIGINT NOT NULL,
    frozen_beans BIGINT NOT NULL DEFAULT 0,
    total_earned BIGINT NOT NULL DEFAULT 0,
    total_spent BIGINT NOT NULL DEFAULT 0,
    total_won BIGINT NOT NULL DEFAULT 0,
    total_lost BIGINT NOT NULL DEFAULT 0,
    daily_login_date VARCHAR(16) NOT NULL DEFAULT '',
    share_reward_date VARCHAR(16) NOT NULL DEFAULT '',
    escape_cd_until BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    version BIGINT NOT NULL DEFAULT 1,
    CHECK (beans >= 0),
    CHECK (frozen_beans >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // 历史库补列：逃跑 CD（1 小时滚动窗口）到期时间戳
  await ensureIapColumn(db, 'wallets', 'escape_cd_until', 'BIGINT NOT NULL DEFAULT 0');

  // 历史库补列：玩家昵称（客户端自报，仅用于后台按昵称检索，非权威身份字段）
  // 不加索引：后台按 LIKE '%kw%' 模糊匹配，前导通配符走不了 B+Tree。
  await ensureIapColumn(db, 'accounts', 'nickname', "VARCHAR(64) NOT NULL DEFAULT ''");

  await db.run(`CREATE TABLE IF NOT EXISTS wallet_ledger (
    tx_id VARCHAR(128) PRIMARY KEY,
    account_id VARCHAR(128) NOT NULL,
    type VARCHAR(64) NOT NULL,
    amount BIGINT NOT NULL,
    balance_before BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    room_id VARCHAR(64),
    round_no INT,
    match_id VARCHAR(160),
    idempotency_key VARCHAR(255) NOT NULL UNIQUE,
    meta_json TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    INDEX idx_wallet_ledger_account_created (account_id, created_at),
    INDEX idx_wallet_ledger_match (match_id),
    CONSTRAINT fk_wallet_ledger_account FOREIGN KEY (account_id) REFERENCES wallets(account_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS user_entitlements (
    account_id VARCHAR(128) NOT NULL,
    sku VARCHAR(64) NOT NULL,
    kind VARCHAR(64) NOT NULL,
    source VARCHAR(32) NOT NULL,
    price_beans BIGINT NOT NULL DEFAULT 0,
    granted_at BIGINT NOT NULL,
    expires_at BIGINT NOT NULL DEFAULT 0,
    meta_json TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (account_id, sku),
    INDEX idx_user_entitlements_sku (sku),
    INDEX idx_user_entitlements_granted (granted_at),
    CONSTRAINT fk_user_entitlements_account FOREIGN KEY (account_id) REFERENCES wallets(account_id),
    CHECK (price_beans >= 0)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS reward_claims (
    account_id VARCHAR(128) NOT NULL,
    reward_type VARCHAR(64) NOT NULL,
    claim_date VARCHAR(32) NOT NULL,
    claim_count INT NOT NULL DEFAULT 0,
    total_amount BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (account_id, reward_type, claim_date),
    INDEX idx_reward_claims_type_date (reward_type, claim_date),
    CONSTRAINT fk_reward_claims_account FOREIGN KEY (account_id) REFERENCES wallets(account_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS player_stats (
    account_id VARCHAR(128) PRIMARY KEY,
    spring_count INT NOT NULL DEFAULT 0,
    bomb_count INT NOT NULL DEFAULT 0,
    max_multiplier INT NOT NULL DEFAULT 0,
    total_games INT NOT NULL DEFAULT 0,
    total_wins INT NOT NULL DEFAULT 0,
    cur_streak INT NOT NULL DEFAULT 0,
    max_streak INT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL,
    CONSTRAINT fk_player_stats_account FOREIGN KEY (account_id) REFERENCES wallets(account_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS game_matches (
    match_id VARCHAR(160) PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL,
    round_no INT NOT NULL,
    status VARCHAR(32) NOT NULL,
    player_ids_json TEXT NOT NULL,
    account_ids_json TEXT NOT NULL,
    dealer_player_id VARCHAR(128),
    winner_team VARCHAR(32),
    winner_ids_json TEXT NOT NULL,
    base_bet BIGINT NOT NULL DEFAULT 0,
    bid_score INT NOT NULL DEFAULT 0,
    multiplier INT NOT NULL DEFAULT 1,
    spring TINYINT NOT NULL DEFAULT 0,
    requested_deltas_json TEXT NOT NULL,
    deltas_json TEXT NOT NULL,
    balances_json TEXT NOT NULL,
    has_bots TINYINT NOT NULL DEFAULT 0,
    human_count INT NOT NULL DEFAULT 3,
    bot_count INT NOT NULL DEFAULT 0,
    bot_mode VARCHAR(32),
    bot_strategy_version VARCHAR(64),
    config_version INT NOT NULL DEFAULT 0,
    multiplier_breakdown_json TEXT NULL,
    started_at BIGINT NOT NULL,
    settled_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE KEY uniq_room_round (room_id, round_no),
    INDEX idx_game_matches_room_round (room_id, round_no),
    INDEX idx_game_matches_status (status),
    INDEX idx_game_matches_bot_started (has_bots, started_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS game_match_participants (
    match_id VARCHAR(160) NOT NULL,
    player_id VARCHAR(128) NOT NULL,
    account_id VARCHAR(128) NOT NULL,
    seat INT NOT NULL,
    role VARCHAR(32),
    is_bot TINYINT NOT NULL DEFAULT 0,
    controller_type VARCHAR(32) NOT NULL,
    persona_id VARCHAR(64),
    tax_amount BIGINT NULL,
    gross_delta BIGINT NULL,
    net_delta BIGINT NULL,
    balance_after BIGINT NULL,
    room_type VARCHAR(32) NULL,
    win_result VARCHAR(8) NULL,
    entry_fee_beans BIGINT NULL,
    balance_before BIGINT NULL,
    joined_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (match_id, player_id),
    INDEX idx_gmp_account_created (account_id, created_at),
    INDEX idx_gmp_match_bot (match_id, is_bot),
    INDEX idx_gmp_account_match (account_id, match_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS bot_match_stats (
    account_id VARCHAR(128) NOT NULL,
    stat_date VARCHAR(16) NOT NULL,
    match_count INT NOT NULL DEFAULT 0,
    solo_bot_match_count INT NOT NULL DEFAULT 0,
    duo_bot_match_count INT NOT NULL DEFAULT 0,
    win_count INT NOT NULL DEFAULT 0,
    lose_count INT NOT NULL DEFAULT 0,
    net_gain BIGINT NOT NULL DEFAULT 0,
    positive_gain_total BIGINT NOT NULL DEFAULT 0,
    reserved_positive_gain BIGINT NOT NULL DEFAULT 0,
    reserved_match_count INT NOT NULL DEFAULT 0,
    consecutive_bot_matches INT NOT NULL DEFAULT 0,
    last_match_at BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (account_id, stat_date),
    INDEX idx_bot_match_stats_date_gain (stat_date, net_gain),
    INDEX idx_bot_match_stats_updated (updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS bot_human_pair_stats (
    pair_key VARCHAR(300) NOT NULL,
    stat_date VARCHAR(16) NOT NULL,
    account_id_low VARCHAR(128) NOT NULL,
    account_id_high VARCHAR(128) NOT NULL,
    match_count INT NOT NULL DEFAULT 0,
    net_transfer BIGINT NOT NULL DEFAULT 0,
    last_match_at BIGINT NOT NULL DEFAULT 0,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (pair_key, stat_date),
    INDEX idx_bhps_accounts_date (account_id_low, account_id_high, stat_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS bot_quota_reservations (
    reservation_id VARCHAR(160) NOT NULL,
    match_request_id VARCHAR(160) NOT NULL,
    match_id VARCHAR(160),
    account_id VARCHAR(128) NOT NULL,
    stat_date VARCHAR(16) NOT NULL,
    reserved_positive_gain BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    activated_at BIGINT,
    released_at BIGINT,
    settled_at BIGINT,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (reservation_id),
    UNIQUE KEY uniq_bqr_request_account (match_request_id, account_id),
    INDEX idx_bqr_account_date_status (account_id, stat_date, status),
    INDEX idx_bqr_status_updated (status, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS bot_treasury_reservations (
    reservation_id VARCHAR(160) NOT NULL,
    match_request_group_id VARCHAR(160) NOT NULL,
    match_id VARCHAR(160),
    room_id VARCHAR(64) NOT NULL,
    room_type VARCHAR(32) NOT NULL,
    treasury_account_id VARCHAR(128) NOT NULL,
    reserved_exposure BIGINT NOT NULL,
    actual_treasury_delta BIGINT,
    status VARCHAR(32) NOT NULL,
    created_at BIGINT NOT NULL,
    activated_at BIGINT,
    released_at BIGINT,
    settled_at BIGINT,
    updated_at BIGINT NOT NULL,
    PRIMARY KEY (reservation_id),
    UNIQUE KEY uniq_btr_request_group (match_request_group_id),
    INDEX idx_btr_treasury_status (treasury_account_id, status),
    INDEX idx_btr_status_updated (status, updated_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await db.run(`CREATE TABLE IF NOT EXISTS game_match_events (
    event_id VARCHAR(200) PRIMARY KEY,
    match_id VARCHAR(160),
    room_id VARCHAR(64) NOT NULL,
    round_no INT NOT NULL,
    seq INT NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    actor_player_id VARCHAR(128),
    actor_account_id VARCHAR(128),
    payload_json TEXT NOT NULL,
    created_at BIGINT NOT NULL,
    UNIQUE KEY uniq_match_seq (match_id, seq),
    INDEX idx_game_match_events_match_seq (match_id, seq),
    INDEX idx_game_match_events_room_round (room_id, round_no)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

async function applySqlFile (db, filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = sql
    .split(';')
    .map(statement => statement.replace(/^\s*--.*$/gm, '').trim())
    .filter(Boolean);
  for (const statement of statements) await db.run(statement);
}

const IAP_HARDENING_CHECKS = [
  ['iap_orders', 'chk_iap_orders_price_quantity', 'price_fen = buy_quantity * 10'],
  ['iap_orders', 'chk_iap_orders_grant_quantity', 'grant_diamonds = buy_quantity'],
];

async function applyIapHardeningMigration (db) {
  const rows = await db.all(`
    SELECT TABLE_NAME AS table_name, CONSTRAINT_NAME AS constraint_name
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_TYPE = 'CHECK'
  `);
  const existing = new Set(rows.map(row =>
    `${schemaValue(row, 'table_name', 'TABLE_NAME')}.${schemaValue(row, 'constraint_name', 'CONSTRAINT_NAME')}`));
  for (const [table, name, clause] of IAP_HARDENING_CHECKS) {
    if (existing.has(`${table}.${name}`)) continue;
    await db.run(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${clause})`);
  }
}

async function ensureIapColumn (db, table, column, definition) {
  const row = await db.get(`
    SELECT COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
  `, [table, column]);
  if (!row) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

async function migrateLegacyExchangeProducts (db) {
  const row = await db.get(`
    SELECT TABLE_NAME AS table_name
    FROM INFORMATION_SCHEMA.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diamond_exchange_products'
  `);
  if (!row) return;
  const columns = await db.all(`
    SELECT COLUMN_NAME AS column_name
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'diamond_exchange_products'
  `);
  const columnNames = new Set(columns.map(column => schemaValue(column, 'column_name', 'COLUMN_NAME')));
  if (!columnNames.has('platform_product_id')) {
    await db.run(`
      UPDATE platform_exchange_products target
      JOIN diamond_exchange_products legacy USING (exchange_sku_id)
      SET target.display_name = legacy.display_name,
          target.cost_balance = legacy.cost_diamonds,
          target.grant_beans = legacy.grant_beans,
          target.enabled = legacy.enabled,
          target.display_order = legacy.display_order,
          target.version = legacy.version,
          target.updated_at = legacy.updated_at
    `);
    return;
  }
  const platformProductType = columnNames.has('platform_product_type') ? 'platform_product_type' : '0';
  await db.run(`
    INSERT IGNORE INTO platform_exchange_products
      (exchange_sku_id, platform_product_id, platform_product_type, display_name,
       cost_balance, grant_beans, enabled, display_order, version, created_at, updated_at)
    SELECT exchange_sku_id, platform_product_id, ${platformProductType}, display_name,
           cost_diamonds, grant_beans, enabled, display_order, version, created_at, updated_at
    FROM diamond_exchange_products
  `);
}

async function migrateIapMysql (db) {
  const migrationDir = path.join(__dirname, '..', 'scripts', 'migrations');
  await applySqlFile(db, path.join(migrationDir, '20260904_iap_diamonds.sql'));
  await ensureIapColumn(db, 'iap_orders', 'payment_confirmed_at', 'BIGINT NULL DEFAULT NULL AFTER last_notify_at');
  await migrateLegacyExchangeProducts(db);
  await applyIapHardeningMigration(db);
  await applySqlFile(db, path.join(migrationDir, '20260907_platform_managed_iap.sql'));
  await ensureIapColumn(db, 'platform_exchange_products', 'product_tag',
    "VARCHAR(16) NOT NULL DEFAULT 'normal' AFTER version");
  await ensureIapColumn(db, 'platform_exchange_products', 'is_first_charge',
    'TINYINT NOT NULL DEFAULT 0 AFTER product_tag');
  await ensureIapColumn(db, 'platform_exchange_products', 'first_charge_bonus_beans',
    'BIGINT NOT NULL DEFAULT 0 AFTER is_first_charge');
  await ensureIapColumn(db, 'platform_exchange_orders', 'bonus_beans',
    'BIGINT NOT NULL DEFAULT 0 AFTER grant_beans');
  await applySqlFile(db, path.join(migrationDir, '20260921_enable_iap_and_coin_exchange.sql'));
}

function getProvider () {
  if (provider) return provider;
  provider = createMysqlProvider();
  return provider;
}

async function initDb () {
  await getProvider().init();
}

async function closeDb () {
  if (provider) await provider.close();
}

function getDb () {
  return getProvider();
}

function transaction (fn) {
  return getProvider().transaction(fn);
}

function isTransactionActive () {
  return !!getProvider().isTransactionActive?.();
}

/**
 * 判断错误是否为「唯一约束冲突」。
 * MySQL：1062 / ER_DUP_ENTRY
 */
function isDuplicateKeyError (err) {
  if (!err) return false;
  if (err.code === 'ER_DUP_ENTRY' || err.errno === 1062) return true;
  return false;
}

/**
 * 判断事务是否可以整段重试。
 * MySQL/InnoDB 在死锁或锁等待超时时会主动回滚当前事务，调用方必须重跑完整事务。
 */
function isRetryableTransactionError (err) {
  if (!err) return false;
  if (err.code === 'ER_LOCK_DEADLOCK' || err.errno === 1213) return true;
  if (err.code === 'ER_LOCK_WAIT_TIMEOUT' || err.errno === 1205) return true;
  if (err.sqlState === '40001') return true;
  return false;
}

function retryDelay (attempt) {
  return new Promise(resolve => setTimeout(resolve, attempt * 10 + Math.floor(Math.random() * 10)));
}

async function retryableTransaction (fn, options = {}) {
  if (isTransactionActive()) return transaction(fn);
  const attempts = Math.max(1, Number(options.attempts || 4));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await transaction(fn);
    } catch (err) {
      if (!isRetryableTransactionError(err) || attempt === attempts) throw err;
      await retryDelay(attempt);
    }
  }
  throw new Error('retryable_transaction_attempts_exhausted');
}

module.exports = {
  getDb,
  initDb,
  closeDb,
  transaction,
  retryableTransaction,
  isTransactionActive,
  isDuplicateKeyError,
  isRetryableTransactionError,
  jsonStringify,
  DIALECT,
  migrateMysql,
  migrateIapMysql,
  assertMysqlSchemaReady,
  assertIapSchemaIntegrity,
  applySqlFile,
};
