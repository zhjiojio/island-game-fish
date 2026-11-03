'use strict';

const crypto = require('crypto');
const identityStore = require('../identity/kwai-identity-store');
const { createPlatformClient } = require('./platform-client');

function buildZoneId (accountId, options = {}) {
  const namespace = String(options.namespace || process.env.DDZ_KWAI_PLATFORM_IAP_ZONE_NAMESPACE || 'ddz1');
  const digest = crypto.createHash('sha256')
    .update(`v1:${namespace}:${String(accountId || '').trim()}`)
    .digest('hex').slice(0, 24);
  return `${namespace}_${digest}`;
}

function createPlatformBalanceService (options = {}) {
  const client = options.client || createPlatformClient(options.clientOptions);
  const identities = options.identityStore || identityStore;
  const database = options.db || require('../persistence/db').getDb();

  return {
    async getBalance ({ accountId, loginType, os, userIp }) {
      if (loginType && loginType !== 'kwai') {
        throw Object.assign(new Error('guest payment forbidden'), { code: 'GUEST_PAYMENT_FORBIDDEN' });
      }
      if (!['android', 'ios'].includes(os)) {
        throw Object.assign(new Error('invalid platform'), { code: 'INVALID_PLATFORM' });
      }
      const openId = await identities.requireOpenIdForAccount(accountId);
      const result = await client.getBalance({
        openId,
        zoneId: buildZoneId(accountId, options),
        os,
        userIp: String(userIp || ''),
      });
      const chargeBalance = String(result?.chargeBalance ?? '');
      const freeBalance = String(result?.freeBalance ?? '');
      if (!/^\d+$/.test(chargeBalance) || !/^\d+$/.test(freeBalance)) {
        throw Object.assign(new Error('invalid platform balance'), { code: 'PLATFORM_INVALID_RESPONSE' });
      }
      const observedAt = Date.now();
      const zoneId = buildZoneId(accountId, options);
      await database.run(`
        INSERT INTO platform_coin_balance_cache
          (account_id, os, zone_id, charge_balance, free_balance, observed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE charge_balance = VALUES(charge_balance),
          free_balance = VALUES(free_balance), observed_at = VALUES(observed_at)
      `, [accountId, os, zoneId, chargeBalance, freeBalance, observedAt]);
      return {
        accountId,
        chargeBalance,
        freeBalance,
        balance: String(BigInt(chargeBalance) + BigInt(freeBalance)),
        observedAt,
        stale: false,
      };
    },
  };
}

module.exports = { buildZoneId, createPlatformBalanceService };
