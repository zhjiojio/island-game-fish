const { getDb, transaction, retryableTransaction, isTransactionActive, isDuplicateKeyError, isRetryableTransactionError, jsonStringify } = require('./db');

const WALLET_TRANSACTION_ATTEMPTS = 4;

// 账号 ID 必须由调用方（auth 握手结果）显式给出。
// 历史实现回落到公共账号 'guest_unknown'，会让所有漏传的调用共享同一个钱包，
// 既污染账本也掩盖上层 bug，因此改为直接抛错暴露问题。
function isReservedAccountId (accountId) {
  const id = String(accountId || '').trim().toLowerCase();
  return id.startsWith('bot::') || id.startsWith('system::');
}

function requireAccountId (accountId) {
  const id = String(accountId || '').trim();
  if (!id) throw new Error('wallet-store: 缺少 accountId');
  if (isReservedAccountId(id)) throw new Error(`wallet-store: 拒绝保留账号命名空间 ${id.split('::')[0]}::`);
  return id;
}

function nowMs () {
  return Date.now();
}

function txId () {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// 幂等写入包装器
// ------------------------------------------------------------
// 为什么不能「先 SELECT 查存在、再 INSERT」：
//   两个并发事务会同时查到「流水不存在」，于是双双执行 INSERT，
//   后者撞上 wallet_ledger.idempotency_key 唯一约束抛异常。
//   典型场景是三名玩家同时触发开局冻结。
//
//   这个 check-then-act 窗口在 MySQL 下真实存在（连接池真并发）；
//   SQLite 因为事务走全局串行队列而侥幸没暴露 —— 但代码是错的。
//
// 正确做法：把唯一索引当作唯一真相来源。先乐观查一次（命中就省一次
// 写入尝试），真正的兜底是捕获唯一冲突 —— 冲突意味着别人已经写成功，
// 直接按「幂等命中」返回既有流水即可，绝不重复扣款。
// ============================================================

/**
 * @param {string} key       幂等键
 * @param {Function} onHit   已存在既有流水时的返回值构造器 (row) => result
 * @param {Function} onWrite 首次写入的业务逻辑 (database) => result
 */
async function idempotentWrite (key, onHit, onWrite) {
  if (!isTransactionActive()) {
    for (let attempt = 1; attempt <= WALLET_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await idempotentWriteInTransaction(key, onHit, onWrite);
      } catch (err) {
        if (!isRetryableTransactionError(err) || attempt === WALLET_TRANSACTION_ATTEMPTS) throw err;
        await new Promise(resolve => setTimeout(resolve, attempt * 10 + Math.floor(Math.random() * 10)));
      }
    }
    throw new Error('idempotent_write_attempts_exhausted');
  }
  return idempotentWriteInTransaction(key, onHit, onWrite);
}

async function idempotentWriteInTransaction (key, onHit, onWrite) {
  // 第一次尝试：乐观预检 + 写入，全程在同一事务内。
  try {
    return await transaction(async () => {
      const database = getDb();
      // 绝大多数重复请求在这里就命中，省掉一次注定失败的写入
      const existing = await database.get(
        'SELECT * FROM wallet_ledger WHERE idempotency_key = ?', [key]);
      if (existing) return onHit(existing);
      return await onWrite(database);
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // 走到这里说明：预检时还没有记录，但写入时撞了唯一约束，
    // 即另一个并发事务在这个窗口内先提交了同一幂等键。
    //
    // 注意必须在「事务外」处理：冲突已让上面那个事务回滚，
    // 在它内部再查询既读不到已提交的数据，也可能因连接状态失效而报错。
    // 所以让它先彻底回滚，再用一个新事务去读那笔已生效的流水。
  }

  return transaction(async () => {
    const database = getDb();
    const row = await database.get(
      'SELECT * FROM wallet_ledger WHERE idempotency_key = ?', [key]);
    // 冲突却查不到记录 —— 撞的不是幂等键（可能是 tx_id 等其他唯一索引）。
    // 这类问题不能静默吞掉，必须暴露出来。
    if (!row) throw new Error(`idempotent_conflict_unresolved:${key}`);
    return onHit(row);
  });
}

function rowToWallet (row) {
  if (!row) return null;
  const beans = Number(row.beans || 0);
  const frozenBeans = Number(row.frozen_beans || 0);
  return {
    accountId: row.account_id,
    beans,
    frozenBeans,
    availableBeans: Math.max(0, beans - frozenBeans),
    totalEarned: Number(row.total_earned || 0),
    totalSpent: Number(row.total_spent || 0),
    totalWon: Number(row.total_won || 0),
    totalLost: Number(row.total_lost || 0),
    dailyLoginDate: row.daily_login_date || '',
    shareRewardDate: row.share_reward_date || '',
    escapeCdUntil: Number(row.escape_cd_until || 0),
    createdAt: Number(row.created_at || 0),
    updatedAt: Number(row.updated_at || 0),
    version: Number(row.version || 1),
  };
}

// 逃跑 CD：记到期时间戳（1 小时滚动窗口，从逃跑时刻起算）
async function setEscapeCdUntil (accountId, untilMs) {
  const id = requireAccountId(accountId);
  await getDb().run(
    'UPDATE wallets SET escape_cd_until = ?, updated_at = ?, version = version + 1 WHERE account_id = ?',
    [Math.max(0, Number(untilMs) || 0), nowMs(), id],
  );
}

async function getEscapeCdRemainingMs (accountId, now = Date.now()) {
  const wallet = await getWallet(accountId);
  if (!wallet) return 0;
  return Math.max(0, wallet.escapeCdUntil - now);
}

async function getWallet (accountId) {
  const row = await getDb().get('SELECT * FROM wallets WHERE account_id = ?', [accountId]);
  return rowToWallet(row);
}

async function getWalletForUpdate (accountId) {
  const row = await getDb().getWalletForUpdate(accountId);
  return rowToWallet(row);
}

// 建钱包（幂等）。返回 created 表示本次调用是否真的插入了行。
//
// 【为什么不用 INSERT IGNORE】
// InnoDB 下 INSERT IGNORE 撞唯一键时只对已存在记录持 S 锁，随后的
// SELECT ... FOR UPDATE 需要升级为 X 锁；两个并发事务各持 S 互等 X，
// 就是死锁。新账号首次 bootstrap 会并发触发 3 条建钱包路径
// （每日登录 / 新手礼包 / 广告次数），必现 1213。
// ON DUPLICATE KEY UPDATE 直接取 X 锁，天然串行化。
//
// 【为什么需要 created】
// 首充流水只能由真正的创建者写。此前靠 wallet_ledger.idempotency_key
// 唯一键兜底，看似正确，但那是事后补救，且每次并发都会多一次冲突回滚。
const CREATE_WALLET_SQL = `
  INSERT INTO wallets (
    account_id, beans, frozen_beans, total_earned, total_spent, total_won, total_lost,
    daily_login_date, share_reward_date, created_at, updated_at, version
  ) VALUES (?, ?, 0, ?, 0, 0, 0, ?, '', ?, ?, 1)
  ON DUPLICATE KEY UPDATE account_id = account_id
`;

async function createWallet (accountId, initialBeans, todayKey) {
  const now = nowMs();
  const inserted = await getDb().run(CREATE_WALLET_SQL, [accountId, initialBeans, initialBeans, todayKey, now, now]);
  const created = Number(inserted?.changes ?? inserted?.affectedRows ?? 0) > 0;
  return { wallet: await getWalletForUpdate(accountId), created };
}

async function insertInitialGrantLedger (accountId, amount) {
  if (amount <= 0) return;
  const now = nowMs();
  await getDb().run(`
    ${getDb().insertIgnoreKeyword} INTO wallet_ledger (
      tx_id, account_id, type, amount, balance_before, balance_after,
      room_id, round_no, match_id, idempotency_key, meta_json, created_at
    ) VALUES (?, ?, 'new_user_grant', ?, 0, ?, NULL, NULL, NULL, ?, ?, ?)
  `, [txId(), accountId, amount, amount, `new_user_grant:${accountId}`, jsonStringify({ source: 'wallet_create' }), now]);
}

// 进程内单飞表：同一账号的建钱包事务只跑一次，其余并发调用合流等待。
// 与数据库层锁互补——这里省掉的是无谓的锁竞争和冲突回滚。
const walletCreateInflight = new Map(); // accountId -> Promise<wallet>

async function getOrCreateWallet (accountId, options = {}) {
  const id = requireAccountId(accountId);
  const initialBeans = options.initialBeans || 0;
  const todayKey = options.todayKey || '';
  const existing = await getWallet(id);
  if (existing) return existing;

  const inflight = walletCreateInflight.get(id);
  if (inflight) return inflight;

  const task = retryableTransaction(async () => {
    const { wallet, created } = await createWallet(id, initialBeans, todayKey);
    if (created) await insertInitialGrantLedger(id, initialBeans);
    return wallet;
  }, { attempts: WALLET_TRANSACTION_ATTEMPTS });

  walletCreateInflight.set(id, task);
  const clear = () => walletCreateInflight.delete(id);
  task.then(clear, clear);
  return task;
}

async function ensureWalletForUpdate (id, initialBeans = 0, todayKey = '') {
  const { wallet, created } = await createWallet(id, initialBeans, todayKey);
  if (created) await insertInitialGrantLedger(id, initialBeans);
  return wallet;
}

async function lockWalletForUpdate (accountId, options = {}) {
  const id = requireAccountId(accountId);
  const initialBeans = Number(options.initialBeans || 0);
  const todayKey = String(options.todayKey || '');
  if (!Number.isSafeInteger(initialBeans) || initialBeans < 0) throw new Error('wallet-store: invalid_initial_beans');
  const { wallet, created } = await createWallet(id, initialBeans, todayKey);
  if (created) await insertInitialGrantLedger(id, initialBeans);
  if (!wallet) throw new Error(`wallet_lock_failed:${id}`);
  return wallet;
}

async function debitWalletExact (accountId, amount, type, options = {}) {
  const id = requireAccountId(accountId);
  const debit = Number(amount);
  if (!Number.isSafeInteger(debit) || debit <= 0) throw new Error('wallet-store: debit amount must be a positive safe integer');
  if (!options.walletLocked) throw new Error('wallet-store: debitWalletExact requires walletLocked=true');
  const idempotencyKey = String(options.idempotencyKey || '').trim();
  if (!idempotencyKey) throw new Error('wallet-store: debitWalletExact requires idempotencyKey');
  const database = getDb();
  const existing = await database.get('SELECT * FROM wallet_ledger WHERE idempotency_key = ?', [idempotencyKey]);
  if (existing) {
    return {
      wallet: await getWallet(id), actual: Number(existing.amount || 0),
      before: Number(existing.balance_before || 0), after: Number(existing.balance_after || 0), idempotent: true,
    };
  }
  const wallet = await getWalletForUpdate(id);
  if (!wallet) throw new Error(`wallet_not_found:${id}`);
  if (wallet.availableBeans < debit) {
    const err = new Error('insufficient_available_beans');
    err.code = 'INSUFFICIENT_BEANS';
    err.availableBeans = wallet.availableBeans;
    throw err;
  }
  const before = wallet.beans;
  const after = before - debit;
  const now = nowMs();
  await database.run(`
    UPDATE wallets
    SET beans = ?, total_spent = total_spent + ?, updated_at = ?, version = version + 1
    WHERE account_id = ?
  `, [after, debit, now, id]);
  await database.run(`
    INSERT INTO wallet_ledger (
      tx_id, account_id, type, amount, balance_before, balance_after,
      room_id, round_no, match_id, idempotency_key, meta_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    txId(), id, type, -debit, before, after,
    options.roomId || null, Number.isInteger(options.roundNo) ? options.roundNo : null,
    options.matchId || null, idempotencyKey, jsonStringify(options.meta || {}), now,
  ]);
  const result = { wallet: await getWallet(id), actual: -debit, before, after, idempotent: false };
  if (result.actual !== -debit) throw new Error(`wallet_exact_debit_mismatch:${id}:${debit}:${result.actual}`);
  return result;
}

async function applyWalletDelta (accountId, amount, type, options = {}) {
  const id = requireAccountId(accountId);
  const idempotencyKey = options.idempotencyKey || `${type}:${id}:${options.matchId || ''}:${options.roomId || ''}:${options.roundNo || ''}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
  const allowCreate = options.allowCreate !== false;
  const meta = options.meta || {};

  const onHit = async (row) => ({
    wallet: await getWallet(id),
    actual: Number(row.amount || 0),
    before: Number(row.balance_before || 0),
    after: Number(row.balance_after || 0),
    idempotent: true,
  });

  return idempotentWrite(idempotencyKey, onHit, async (database) => {

    let wallet = await getWalletForUpdate(id);
    if (!wallet) {
      if (!allowCreate) throw new Error(`wallet_not_found:${id}`);
      wallet = (await createWallet(id, 0, '')).wallet;
    }

    const before = wallet.beans;
    const frozenBefore = wallet.frozenBeans || 0;
    const minBalance = options.allowFrozenCoverage ? 0 : frozenBefore;
    const next = amount < 0 ? Math.max(minBalance, before + amount) : Math.max(0, before + amount);
    const actual = next - before;
    const now = nowMs();
    const totalEarnedInc = actual > 0 ? actual : 0;
    const totalSpentInc = actual < 0 ? -actual : 0;
    const totalWonInc = type === 'game_win' && actual > 0 ? actual : 0;
    const totalLostInc = type === 'game_lose' && actual < 0 ? -actual : 0;

    await database.run(`
      UPDATE wallets
      SET beans = ?,
          total_earned = total_earned + ?,
          total_spent = total_spent + ?,
          total_won = total_won + ?,
          total_lost = total_lost + ?,
          updated_at = ?,
          version = version + 1
      WHERE account_id = ?
    `, [next, totalEarnedInc, totalSpentInc, totalWonInc, totalLostInc, now, id]);

    await database.run(`
      INSERT INTO wallet_ledger (
        tx_id, account_id, type, amount, balance_before, balance_after,
        room_id, round_no, match_id, idempotency_key, meta_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      txId(),
      id,
      type,
      actual,
      before,
      next,
      options.roomId || null,
      Number.isInteger(options.roundNo) ? options.roundNo : null,
      options.matchId || null,
      idempotencyKey,
      jsonStringify(meta),
      now,
    ]);

    return { wallet: await getWallet(id), actual, before, after: next, idempotent: false };
  });
}

async function insertFreezeLedger (database, id, type, amount, before, after, idempotencyKey, options = {}) {
  await database.run(`
    INSERT INTO wallet_ledger (
      tx_id, account_id, type, amount, balance_before, balance_after,
      room_id, round_no, match_id, idempotency_key, meta_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    txId(),
    id,
    type,
    amount,
    before,
    after,
    options.roomId || null,
    Number.isInteger(options.roundNo) ? options.roundNo : null,
    options.matchId || null,
    idempotencyKey,
    jsonStringify(options.meta || {}),
    nowMs(),
  ]);
}

async function freezeWalletBeans (accountId, amount, options = {}) {
  const id = requireAccountId(accountId);
  const freezeAmount = Math.max(0, amount || 0);
  const idempotencyKey = options.idempotencyKey || `wallet_freeze:${id}:${options.matchId || ''}:${options.roomId || ''}:${options.roundNo || ''}:${freezeAmount}`;
  const onHit = async (row) => ({
    wallet: await getWallet(id), actual: Number(row.amount || 0), idempotent: true,
  });

  return idempotentWrite(idempotencyKey, onHit, async (database) => {
    const wallet = await ensureWalletForUpdate(id);
    const available = Math.max(0, wallet.availableBeans || 0);
    const actual = Math.min(freezeAmount, available);
    if (actual <= 0) return { wallet, actual: 0, idempotent: false };
    await database.run('UPDATE wallets SET frozen_beans = frozen_beans + ?, updated_at = ?, version = version + 1 WHERE account_id = ?', [actual, nowMs(), id]);
    await insertFreezeLedger(database, id, 'wallet_freeze', 0, wallet.beans, wallet.beans, idempotencyKey, {
      ...options,
      meta: { freezeAmount: actual, frozenBefore: wallet.frozenBeans || 0, frozenAfter: (wallet.frozenBeans || 0) + actual, ...(options.meta || {}) },
    });
    return { wallet: await getWallet(id), actual, idempotent: false };
  });
}

async function unfreezeWalletBeans (accountId, amount, options = {}) {
  const id = requireAccountId(accountId);
  const unfreezeAmount = Math.max(0, amount || 0);
  const idempotencyKey = options.idempotencyKey || `wallet_unfreeze:${id}:${options.matchId || ''}:${options.roomId || ''}:${options.roundNo || ''}:${unfreezeAmount}`;
  const onHit = async (row) => ({
    wallet: await getWallet(id), actual: Number(row.amount || 0), idempotent: true,
  });

  return idempotentWrite(idempotencyKey, onHit, async (database) => {
    const wallet = await ensureWalletForUpdate(id);
    const actual = Math.min(unfreezeAmount, wallet.frozenBeans || 0);
    if (actual <= 0) return { wallet, actual: 0, idempotent: false };
    await database.run(`UPDATE wallets SET frozen_beans = ${database.greatestZeroExpr('frozen_beans - ?')}, updated_at = ?, version = version + 1 WHERE account_id = ?`, [actual, nowMs(), id]);
    await insertFreezeLedger(database, id, 'wallet_unfreeze', 0, wallet.beans, wallet.beans, idempotencyKey, {
      ...options,
      meta: { unfreezeAmount: actual, frozenBefore: wallet.frozenBeans || 0, frozenAfter: Math.max(0, (wallet.frozenBeans || 0) - actual), ...(options.meta || {}) },
    });
    return { wallet: await getWallet(id), actual, idempotent: false };
  });
}

async function consumeFrozenBeans (accountId, amount, type, options = {}) {
  const id = requireAccountId(accountId);
  const consumeAmount = Math.max(0, amount || 0);
  const idempotencyKey = options.idempotencyKey || `${type || 'consume_frozen'}:${id}:${options.matchId || ''}:${options.roomId || ''}:${options.roundNo || ''}:${consumeAmount}`;
  const onHit = async (row) => ({
    wallet: await getWallet(id), actual: Number(row.amount || 0), idempotent: true,
  });

  return idempotentWrite(idempotencyKey, onHit, async (database) => {
    const wallet = await ensureWalletForUpdate(id);
    const actual = Math.min(consumeAmount, wallet.beans, wallet.frozenBeans || 0);
    if (actual <= 0) return { wallet, actual: 0, idempotent: false };
    const before = wallet.beans;
    const after = Math.max(0, before - actual);
    await database.run(`
      UPDATE wallets
      SET beans = ?,
          frozen_beans = ${database.greatestZeroExpr('frozen_beans - ?')},
          total_spent = total_spent + ?,
          updated_at = ?,
          version = version + 1
      WHERE account_id = ?
    `, [after, actual, actual, nowMs(), id]);
    await insertFreezeLedger(database, id, type || 'consume_frozen', -actual, before, after, idempotencyKey, {
      ...options,
      meta: { consumeFrozenAmount: actual, frozenBefore: wallet.frozenBeans || 0, frozenAfter: Math.max(0, (wallet.frozenBeans || 0) - actual), ...(options.meta || {}) },
    });
    return { wallet: await getWallet(id), actual: -actual, before, after, idempotent: false };
  });
}

async function claimDailyRewardIfAllowed (accountId, rewardType, amount, todayKey, options = {}) {
  const id = requireAccountId(accountId);
  const maxClaimsPerDay = Math.max(1, options.maxClaimsPerDay || 1);
  const ledgerType = options.ledgerType || rewardType;
  const meta = options.meta || {};

  // 写钱包的事务必须是 retryableTransaction：InnoDB 死锁/锁等待超时会主动
  // 回滚整段事务，只有重跑才能救回来。裸 transaction 会让一次并发抖动
  // 直接把接口打成 500（新账号首次 bootstrap 曾因此稳定报错）。
  return retryableTransaction(async () => {
    await ensureWalletForUpdate(id);
    const database = getDb();
    const claim = await database.get('SELECT * FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?', [id, rewardType, todayKey]);
    if (claim && Number(claim.claim_count || 0) >= maxClaimsPerDay) {
      return { claimed: false, wallet: await getWallet(id), amount: 0, claimCount: Number(claim.claim_count || 0), maxClaimsPerDay, totalAmount: Number(claim.total_amount || 0) };
    }

    const nextCount = claim ? Number(claim.claim_count || 0) + 1 : 1;
    const now = nowMs();
    const ret = await applyWalletDelta(id, amount, ledgerType, {
      idempotencyKey: options.idempotencyKey || `${rewardType}:${id}:${todayKey}:${nextCount}`,
      meta: { date: todayKey, rewardType, claimCount: nextCount, maxClaimsPerDay, ...meta },
    });

    if (claim) {
      await database.run(`
        UPDATE reward_claims
        SET claim_count = ?, total_amount = total_amount + ?, updated_at = ?
        WHERE account_id = ? AND reward_type = ? AND claim_date = ?
      `, [nextCount, ret.actual, now, id, rewardType, todayKey]);
    } else {
      await database.run(`
        INSERT INTO reward_claims (
          account_id, reward_type, claim_date, claim_count, total_amount, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, rewardType, todayKey, nextCount, ret.actual, now, now]);
    }

    return { claimed: ret.actual > 0, wallet: ret.wallet, amount: ret.actual, claimCount: nextCount, maxClaimsPerDay, totalAmount: Number(claim ? claim.total_amount : 0) + ret.actual };
  });
}

async function claimTieredDailyRewardIfAllowed (accountId, rewardType, todayKey, options = {}) {
  const id = requireAccountId(accountId);
  const maxClaimsPerDay = Math.max(1, options.maxClaimsPerDay || 1);
  const dailyCapAmount = Math.max(0, options.dailyCapAmount || 0);
  const amountForCount = options.amountForCount || (() => 0);
  const ledgerType = options.ledgerType || rewardType;
  const meta = options.meta || {};

  return retryableTransaction(async () => {
    await ensureWalletForUpdate(id);
    const database = getDb();
    const claim = await database.get('SELECT * FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?', [id, rewardType, todayKey]);
    const claimCount = claim ? Number(claim.claim_count || 0) : 0;
    const totalAmount = claim ? Number(claim.total_amount || 0) : 0;
    if (claimCount >= maxClaimsPerDay || (dailyCapAmount > 0 && totalAmount >= dailyCapAmount)) {
      return { claimed: false, wallet: await getWallet(id), amount: 0, claimCount, maxClaimsPerDay, totalAmount, dailyCapAmount };
    }

    const nextCount = claimCount + 1;
    const configuredAmount = Math.max(0, amountForCount(nextCount) || 0);
    const amount = dailyCapAmount > 0 ? Math.min(configuredAmount, Math.max(0, dailyCapAmount - totalAmount)) : configuredAmount;
    if (amount <= 0) {
      return { claimed: false, wallet: await getWallet(id), amount: 0, claimCount, maxClaimsPerDay, totalAmount, dailyCapAmount };
    }

    const now = nowMs();
    const ret = await applyWalletDelta(id, amount, ledgerType, {
      idempotencyKey: options.idempotencyKey || `${rewardType}:${id}:${todayKey}:${nextCount}`,
      meta: { date: todayKey, rewardType, claimCount: nextCount, maxClaimsPerDay, dailyCapAmount, ...meta },
    });

    if (claim) {
      await database.run(`
        UPDATE reward_claims
        SET claim_count = ?, total_amount = total_amount + ?, updated_at = ?
        WHERE account_id = ? AND reward_type = ? AND claim_date = ?
      `, [nextCount, ret.actual, now, id, rewardType, todayKey]);
    } else {
      await database.run(`
        INSERT INTO reward_claims (
          account_id, reward_type, claim_date, claim_count, total_amount, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [id, rewardType, todayKey, nextCount, ret.actual, now, now]);
    }

    return { claimed: ret.actual > 0, wallet: ret.wallet, amount: ret.actual, claimCount: nextCount, maxClaimsPerDay, totalAmount: totalAmount + ret.actual, dailyCapAmount };
  });
}

// 只读查询某账号某奖励类型今日的领取状态（不产生任何写入）
async function getDailyRewardStatus (accountId, rewardType, todayKey) {
  const id = requireAccountId(accountId);
  // 这里绝不能建钱包：本函数被 bootstrap 的 Promise.all 并发调用，
  // 一旦它抢在 getOrCreateWallet(initialBeans) 之前插行，就会按 0 豆建出钱包，
  // 新账号因此永久拿不到新手赠送（且不会再有补发入口）。
  // 钱包不存在时，「今日领取次数」的正确答案本来就是 0。
  const claim = await getDb().get(
    'SELECT claim_count, total_amount FROM reward_claims WHERE account_id = ? AND reward_type = ? AND claim_date = ?',
    [id, rewardType, todayKey]
  );
  return {
    claimCount: claim ? Number(claim.claim_count || 0) : 0,
    totalAmount: claim ? Number(claim.total_amount || 0) : 0,
  };
}

async function claimDailyLoginIfNeeded (accountId, amount, todayKey) {
  const id = requireAccountId(accountId);
  return retryableTransaction(async () => {
    const wallet = await ensureWalletForUpdate(id);
    if (wallet.dailyLoginDate === todayKey) return { claimed: false, wallet, amount: 0 };
    const ret = await claimDailyRewardIfAllowed(id, 'daily_login', amount, todayKey, {
      ledgerType: 'daily_login',
      meta: { source: 'wallet_sync' },
    });
    if (ret.claimed || ret.claimCount > 0) {
      await getDb().run('UPDATE wallets SET daily_login_date = ?, updated_at = ?, version = version + 1 WHERE account_id = ?', [todayKey, nowMs(), id]);
    }
    return { claimed: ret.claimed, wallet: await getWallet(id), amount: ret.amount };
  });
}

async function claimShareRewardIfNeeded (accountId, amount, todayKey) {
  const id = requireAccountId(accountId);
  const ret = await claimDailyRewardIfAllowed(id, 'share_reward', amount, todayKey, {
    ledgerType: 'share_reward',
    meta: { source: 'share_task' },
  });
  if (ret.claimed || ret.claimCount > 0) {
    await retryableTransaction(async () => {
      await getDb().run('UPDATE wallets SET share_reward_date = ?, updated_at = ?, version = version + 1 WHERE account_id = ?', [todayKey, nowMs(), id]);
    });
    ret.wallet = await getWallet(id);
  }
  return { claimed: ret.claimed, wallet: ret.wallet, amount: ret.amount };
}

module.exports = {
  isReservedAccountId,
  getWallet,
  getWalletForUpdate,
  getOrCreateWallet,
  lockWalletForUpdate,
  debitWalletExact,
  applyWalletDelta,
  freezeWalletBeans,
  unfreezeWalletBeans,
  consumeFrozenBeans,
  claimDailyRewardIfAllowed,
  claimTieredDailyRewardIfAllowed,
  getDailyRewardStatus,
  claimDailyLoginIfNeeded,
  claimShareRewardIfNeeded,
  setEscapeCdUntil,
  getEscapeCdRemainingMs,
};
