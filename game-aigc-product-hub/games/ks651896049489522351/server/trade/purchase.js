const { transaction, isDuplicateKeyError } = require('../persistence/db');
const walletStore = require('../persistence/wallet-store');
const entitlementStore = require('../persistence/entitlement-store');
const catalog = require('./catalog');

const PURCHASE_TRANSACTION_ATTEMPTS = 4;

function businessFailure (sku, code, message, extra = {}) {
  return { ok: false, sku, owned: false, charged: false, priceBeans: 0, code, message, ...extra };
}

function isRetryableTransactionError (err) {
  return !!err && (
    err.code === 'ER_LOCK_DEADLOCK' ||
    err.errno === 1213 ||
    err.sqlState === '40001'
  );
}

function retryDelay (attempt) {
  return new Promise(resolve => setTimeout(resolve, attempt * 10 + Math.floor(Math.random() * 10)));
}

async function purchaseSku (input) {
  const accountId = String(input.accountId || '').trim();
  const sku = String(input.sku || '').trim();
  if (!accountId) throw new Error('purchase: accountId required');

  let item;
  try {
    item = catalog.requireItem(sku);
  } catch (err) {
    return businessFailure(sku, err.code || 'SKU_NOT_FOUND', err.message);
  }
  const idempotencyKey = catalog.buildPurchaseIdempotencyKey(accountId, sku);
  const context = input.context || {};
  try {
    for (let attempt = 1; attempt <= PURCHASE_TRANSACTION_ATTEMPTS; attempt += 1) {
      try {
        return await transaction(async () => {
          const wallet = await walletStore.lockWalletForUpdate(accountId, {
            initialBeans: Number(input.initialBeans || 0),
            todayKey: String(input.todayKey || ''),
          });
          const existing = await entitlementStore.getEntitlement(accountId, sku);
          if (existing && !entitlementStore.isExpired(existing)) {
            return {
              ok: true, sku, owned: true, charged: false,
              priceBeans: existing.priceBeans, wallet, entitlement: existing, idempotent: true,
            };
          }
          // 旧的永久/限期权益已到期：删除旧行后按当前目录重新授权并正常扣费
          if (existing) {
            await entitlementStore.deleteEntitlement(accountId, sku);
          }

          let debit = null;
          if (item.priceBeans > 0) {
            if (wallet.availableBeans < item.priceBeans) {
              return businessFailure(sku, 'INSUFFICIENT_BEANS', '铁豆不足', {
                priceBeans: item.priceBeans, availableBeans: wallet.availableBeans, wallet,
              });
            }
            debit = await walletStore.debitWalletExact(accountId, item.priceBeans, 'sku_purchase', {
              idempotencyKey,
              meta: { sku, type: item.type, payment: item.payment, ...context },
              roomId: context.roomId || null,
              walletLocked: true,
            });
          }

          // 有效期取目录配置（每档独立 durationMs），0 = 永久
          const durationMs = Number(item.grant && item.grant.durationMs) || 0;
          const entitlement = await entitlementStore.insertEntitlement({
            accountId,
            sku,
            kind: item.type,
            source: item.priceBeans > 0 ? 'purchase' : 'free_claim',
            priceBeans: item.priceBeans,
            expiresAt: durationMs > 0 ? Date.now() + durationMs : 0,
            meta: context,
          });
          return {
            ok: true, sku, owned: true, charged: item.priceBeans > 0,
            priceBeans: item.priceBeans,
            wallet: debit ? debit.wallet : wallet,
            entitlement,
            idempotencyKey,
            idempotent: false,
          };
        });
      } catch (err) {
        if (!isRetryableTransactionError(err) || attempt === PURCHASE_TRANSACTION_ATTEMPTS) throw err;
        // transaction() 已完成回滚并释放连接；只重试完整购买事务，禁止重试单条资金写入。
        await retryDelay(attempt);
      }
    }
    throw new Error('purchase_transaction_attempts_exhausted');
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    // 唯一冲突必须先让最外层事务完整回滚，再在事务外重读。
    const existing = await entitlementStore.getEntitlement(accountId, sku);
    // 权益未过期才算幂等命中；已到期的旧行不能当作「已拥有」返回
    // （罕见并发：删除旧行与并发插入撞键），走通用失败让客户端重试。
    if (!existing || entitlementStore.isExpired(existing)) throw err;
    return {
      ok: true, sku, owned: true, charged: false,
      priceBeans: existing.priceBeans,
      wallet: await walletStore.getWallet(accountId),
      entitlement: existing,
      idempotent: true,
    };
  }
}

module.exports = { purchaseSku };
