const { getDb } = require('./db');
const logger = require('../logger');

// ============================================================
// 账号存储层
// ------------------------------------------------------------
// 与 wallet-store 的职责划分：
//   · accounts  —— 「你是谁」：登录类型、设备、IP、封禁状态
//   · wallets   —— 「你有多少钱」：余额与流水
//
// 拆开的收益：
//   1. 余额是高频写入，身份画像是低频写入，混在一张表里会让
//      每次结算都带上一堆无关列，也更容易触发行锁争用；
//   2. 风控查询（同设备几个号、某 IP 注册了多少账号）可以直接
//      走 accounts 的索引，不必扫钱包表；
//   3. 封禁是身份维度的动作，不该和钱耦合。
// ============================================================

function isReservedAccountId (accountId) {
  const id = String(accountId || '').trim().toLowerCase();
  return id.startsWith('bot::') || id.startsWith('system::');
}

function requireAccountId (accountId) {
  const id = String(accountId || '').trim();
  if (!id) throw new Error('account-store: 缺少 accountId');
  if (isReservedAccountId(id)) throw new Error(`account-store: 拒绝外部记录保留账号 ${id.split('::')[0]}::`);
  return id;
}

function rowToAccount (row) {
  if (!row) return null;
  return {
    accountId: row.account_id,
    accountType: row.account_type || 'user',
    loginType: row.login_type || 'guest',
    kwaiOpenIdHash: row.kwai_open_id_hash || '',
    deviceId: row.device_id || '',
    nickname: row.nickname || '',
    firstIp: row.first_ip || '',
    lastIp: row.last_ip || '',
    loginCount: Number(row.login_count || 0),
    banned: !!Number(row.banned || 0),
    banReason: row.ban_reason || '',
    createdAt: Number(row.created_at || 0),
    lastLoginAt: Number(row.last_login_at || 0),
  };
}

// ============================================================
// 昵称
// ------------------------------------------------------------
// 来源：客户端拿 KwaiOpen.getUserInfo 的结果，在业务消息里自报。
// 服务端的快手 code2session 只给 open_id，拿不到昵称，所以这里没有
// 权威来源，只能存「最近一次上报值」。由此推出两条约束：
//   1. 落库失败绝不能影响主流程（改豆/开局/结算一个都不能被它拖垮）；
//   2. 库里可能还没有 nickname 列（线上由 DBA 补），此时静默跳过，
//      不能让 ER_BAD_FIELD_ERROR 冒到调用方。
// ============================================================
const NICKNAME_MAX_LEN = 32;

/** 清洗上报的昵称：去控制字符与首尾空白，截断到列宽。空串表示不更新。 */
function sanitizeNickname (value) {
  if (typeof value !== 'string') return '';
  // 控制字符（含换行/制表）会破坏后台表格与日志，直接剔除
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return cleaned.slice(0, NICKNAME_MAX_LEN);
}

function isMissingNicknameColumn (err) {
  // 列不存在：ER_BAD_FIELD_ERROR(1054) / 未定义列
  return err && (err.code === 'ER_BAD_FIELD_ERROR' || err.errno === 1054);
}

// 缺列告警只打一次，避免每个玩家上报都刷屏
let nicknameColumnWarned = false;

/**
 * 记录一次昵称上报。调用方无需 await 结果，失败一律吞掉。
 * @returns {Promise<boolean>} 是否真的写入（列为空/无变化时为 false）
 */
async function updateNickname (accountId, rawNickname) {
  const nickname = sanitizeNickname(rawNickname);
  if (!nickname) return false;
  try {
    const result = await getDb().run(
      'UPDATE accounts SET nickname = ? WHERE account_id = ? AND nickname <> ?',
      [nickname, requireAccountId(accountId), nickname]
    );
    return Number(result?.changes ?? result?.affectedRows ?? 0) > 0;
  } catch (err) {
    if (isMissingNicknameColumn(err)) {
      // 列还没补：降级为无操作。上线补列后自动开始生效，无需重启。
      if (!nicknameColumnWarned) {
        nicknameColumnWarned = true;
        logger.warn('[账号] accounts.nickname 列缺失，昵称暂不记录（执行 scripts/migrations/20261022_accounts_nickname.sql）');
      }
      return false;
    }
    logger.warn('[账号] 昵称写入失败:', err.message);
    return false;
  }
}

async function getAccount (accountId) {
  const row = await getDb().get(
    'SELECT * FROM accounts WHERE account_id = ?',
    [requireAccountId(accountId)]
  );
  return rowToAccount(row);
}

/**
 * 记录一次登录。首次登录创建账号，后续登录只更新易变字段。
 *
 * 注意 first_ip 不参与更新：它是注册来源的取证信息，
 * 一旦被后续登录覆盖，批量注册的溯源线索就断了。
 *
 * @returns {{account: object, isNew: boolean}}
 */
async function recordLogin (accountId, info = {}) {
  const id = requireAccountId(accountId);
  const now = Date.now();
  const db = getDb();

  const existing = await db.get('SELECT * FROM accounts WHERE account_id = ?', [id]);

  // 新账号走 upsert 而非 SELECT-then-INSERT：同一账号的两条连接可能
  // 在「都查到不存在」后同时 INSERT，撞 account_id 主键。
  // ON DUPLICATE KEY UPDATE 让后到者退化为登录计数，不会报错。
  const result = await db.run(
    `INSERT INTO accounts
       (account_id, account_type, login_type, kwai_open_id_hash, device_id,
        first_ip, last_ip, login_count, banned, ban_reason,
        created_at, last_login_at)
     VALUES (?, 'user', ?, ?, ?, ?, ?, 1, 0, '', ?, ?)
     ON DUPLICATE KEY UPDATE
       last_ip = VALUES(last_ip),
       login_count = login_count + 1,
       last_login_at = VALUES(last_login_at),
       login_type = VALUES(login_type)`,
    [
      id,
      String(info.loginType || (existing && existing.login_type) || 'guest'),
      String(info.kwaiOpenIdHash || (existing && existing.kwai_open_id_hash) || ''),
      String(info.deviceId || (existing && existing.device_id) || ''),
      String(info.ip || (existing && existing.first_ip) || ''),
      String(info.ip || (existing && existing.last_ip) || ''),
      existing ? existing.created_at : now,
      now,
    ]
  );
  // affectedRows：插入=1，命中重复键更新=2，值完全未变=0
  const created = Number(result?.changes ?? result?.affectedRows ?? 0) === 1;
  return { account: await getAccount(id), isNew: created };
}

async function isBanned (accountId) {
  const row = await getDb().get(
    'SELECT banned, ban_reason FROM accounts WHERE account_id = ?',
    [requireAccountId(accountId)]
  );
  if (!row) return { banned: false, reason: '' };
  return { banned: !!Number(row.banned || 0), reason: row.ban_reason || '' };
}

async function setBanned (accountId, banned, reason = '') {
  await getDb().run(
    'UPDATE accounts SET banned = ?, ban_reason = ? WHERE account_id = ?',
    [banned ? 1 : 0, String(reason).slice(0, 255), requireAccountId(accountId)]
  );
}

/** 风控用：同一设备派生出的账号数。异常值意味着有人在批量刷号。 */
async function countAccountsByDevice (deviceId) {
  const key = String(deviceId || '').trim();
  if (!key) return 0;
  const row = await getDb().get(
    'SELECT COUNT(*) AS n FROM accounts WHERE device_id = ?',
    [key]
  );
  return Number((row && row.n) || 0);
}

/** 风控用：某 IP 在指定时间点之后注册的账号数。 */
async function countNewAccountsByIp (ip, sinceMs) {
  const key = String(ip || '').trim();
  if (!key) return 0;
  const row = await getDb().get(
    'SELECT COUNT(*) AS n FROM accounts WHERE first_ip = ? AND created_at >= ?',
    [key, Number(sinceMs || 0)]
  );
  return Number((row && row.n) || 0);
}

module.exports = {
  isReservedAccountId,
  getAccount,
  recordLogin,
  updateNickname,
  sanitizeNickname,
  isBanned,
  setBanned,
  countAccountsByDevice,
  countNewAccountsByIp,
};
