// 自动加载 server/.env（存在时，已注入的 env 不覆盖）：
// 免去 `DDZ_MYSQL_HOST=... npm run db:init:mysql` 的前缀传参，新机器开箱即用。
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

const mysql = require('mysql2/promise');

const { getDb, migrateMysql, migrateIapMysql, assertIapSchemaIntegrity, closeDb } = require('../persistence/db');
const { seedIapProducts } = require('./seed-iap-products');

function mysqlConfigWithoutDatabase () {
  return {
    host: process.env.DDZ_MYSQL_HOST || '127.0.0.1',
    port: parseInt(process.env.DDZ_MYSQL_PORT || '3306', 10),
    user: process.env.DDZ_MYSQL_USER || 'root',
    password: process.env.DDZ_MYSQL_PASSWORD || '',
    waitForConnections: true,
    connectionLimit: 1,
    connectTimeout: parseInt(process.env.DDZ_MYSQL_CONNECT_TIMEOUT_MS || '5000', 10),
    charset: 'utf8mb4',
    ssl: String(process.env.DDZ_MYSQL_SSL || '').toLowerCase() === 'true' ? {} : undefined,
  };
}

async function ensureDatabase () {
  const database = process.env.DDZ_MYSQL_DATABASE || 'ddz';
  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error(`Invalid DDZ_MYSQL_DATABASE: ${database}`);
  }
  const conn = await mysql.createConnection(mysqlConfigWithoutDatabase());
  try {
    await conn.execute(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`);
    console.log(`[MySQL 初始化] 数据库已就绪: ${database}`);
  } finally {
    await conn.end();
  }
}

function shouldEnsureDatabase () {
  // Docker Compose 已由 MySQL 官方镜像根据 MYSQL_DATABASE 创建数据库；
  // 业务账号通常没有 CREATE DATABASE 权限，因此迁移容器只负责建表和种子数据。
  // 保持默认 true，兼容单独用管理员账号初始化一个尚未创建的数据库。
  return String(process.env.DDZ_MYSQL_CREATE_DATABASE || 'true').toLowerCase() !== 'false';
}

// 机器人资金池种子数据：bot 匹配的赔付来源（treasury-store 按场次账户预占敞口）。
// INSERT IGNORE 幂等：已存在的场次账户不覆盖（保留线上余额）。
const BOT_TREASURY_TIERS = ['junior', 'mid', 'master'];
const BOT_TREASURY_BEANS = 10_000_000;

async function seedBotTreasury (db) {
  for (const tier of BOT_TREASURY_TIERS) {
    const accountId = `system::bot_treasury::${tier}`;
    await db.run(`
      INSERT IGNORE INTO accounts (
        account_id, account_type, login_type, kwai_open_id_hash, device_id,
        first_ip, last_ip, login_count, banned, ban_reason, created_at, last_login_at
      ) VALUES (?, 'system_treasury', 'system', '', '', '', '', 0, 0, '', 0, 0)
    `, [accountId]);
    await db.run(`
      INSERT IGNORE INTO wallets (
        account_id, beans, frozen_beans, total_earned, total_spent, total_won,
        total_lost, daily_login_date, share_reward_date, created_at, updated_at, version
      ) VALUES (?, ?, 0, 0, 0, 0, 0, '', '', 0, 0, 1)
    `, [accountId, BOT_TREASURY_BEANS]);
  }
  console.log(`[MySQL 初始化] 机器人资金池已就绪: ${BOT_TREASURY_TIERS.join('/')} 各 ${BOT_TREASURY_BEANS} 豆`);
}

async function main () {
  if (shouldEnsureDatabase()) await ensureDatabase();
  const db = getDb();
  await migrateMysql(db);
  await migrateIapMysql(db);
  await assertIapSchemaIntegrity(db);
  await seedBotTreasury(db);
  await seedIapProducts(db);
  console.log(`[MySQL 初始化] 核心表与 IAP 表已就绪: ${db.label}`);
}

main()
  .catch(err => {
    console.error('[MySQL 初始化] 失败:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
