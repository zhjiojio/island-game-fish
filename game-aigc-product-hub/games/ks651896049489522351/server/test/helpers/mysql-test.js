// MySQL 测试基建：每个测试文件一个独立数据库（ddz_test_<pid>），用完即 DROP。
// node --test 为每个测试文件 spawn 独立进程，pid 天然隔离并发文件，互不干扰。
//
// 用法（必须在本模块之后才能 require('../../persistence/db')，env 要先于单例创建）：
//   const { setupMysqlTest, teardownMysqlTest } = require('./helpers/mysql-test');
//   let ready = false;
//   test.before(async () => { try { await setupMysqlTest(); ready = true; } catch (e) { console.log('[SKIP] MySQL 测试环境不可用:', e.message); } });
//   test.after(async () => { if (ready) await teardownMysqlTest(); });
//   test('...', async (t) => { if (!ready) return t.skip('MySQL 测试环境不可用'); ... });
'use strict';

process.env.DDZ_MYSQL_HOST = process.env.DDZ_MYSQL_HOST || '127.0.0.1';
process.env.DDZ_MYSQL_PORT = process.env.DDZ_MYSQL_PORT || '3306';
process.env.DDZ_MYSQL_USER = process.env.DDZ_MYSQL_USER || 'root';
// 密码不设默认：沿用调用方注入的 DDZ_MYSQL_PASSWORD

const DB_NAME = `ddz_test_${process.pid}`;
process.env.DDZ_MYSQL_DATABASE = DB_NAME;

const mysql = require('mysql2/promise');

function rootConfig () {
  return {
    host: process.env.DDZ_MYSQL_HOST,
    port: parseInt(process.env.DDZ_MYSQL_PORT, 10),
    user: process.env.DDZ_MYSQL_USER,
    password: process.env.DDZ_MYSQL_PASSWORD || '',
    connectTimeout: parseInt(process.env.DDZ_MYSQL_CONNECT_TIMEOUT_MS || '5000', 10),
  };
}

// 建独立库 + 建全部核心表（migrateMysql）。失败向上抛，由调用方决定 skip。
async function setupMysqlTest () {
  const conn = await mysql.createConnection(rootConfig());
  try {
    await conn.execute(
      `CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` DEFAULT CHARACTER SET utf8mb4 DEFAULT COLLATE utf8mb4_unicode_ci`
    );
  } finally {
    await conn.end();
  }
  const dbm = require('../../persistence/db');
  const db = dbm.getDb();
  await dbm.migrateMysql(db);
  await dbm.migrateIapMysql(db);
  await dbm.assertIapSchemaIntegrity(db);
  return dbm;
}

// 关闭连接池并 DROP 独立库（幂等）。
async function teardownMysqlTest () {
  const dbm = require('../../persistence/db');
  try { await dbm.closeDb(); } catch {}
  const conn = await mysql.createConnection(rootConfig());
  try {
    await conn.execute(`DROP DATABASE IF EXISTS \`${DB_NAME}\``);
  } finally {
    await conn.end();
  }
}

module.exports = { setupMysqlTest, teardownMysqlTest, DB_NAME };
