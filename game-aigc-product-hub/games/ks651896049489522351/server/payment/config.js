// ============================================================
// IAP 支付配置
// ------------------------------------------------------------
// IAP、Android/iOS 售卖和平台币兑换始终启用；仅支付密钥由环境注入。
// ============================================================

function fromEnv (key, fallback = '') {
  return String(process.env[key] || '').trim() || fallback;
}

function loadConfig () {
  const platformEnabled = true;
  const orderCreateEnabled = true;
  const fulfillmentPaused = false;
  const androidEnabled = true;
  const iosEnabled = true;
  const exchangeEnabled = true;

  const paySignKey = fromEnv('DDZ_KWAI_PAY_SIGN_KEY');
  const notifyKey = fromEnv('DDZ_KWAI_PAY_NOTIFY_KEY');
  const prevNotifyKey = fromEnv('DDZ_KWAI_PAY_PREVIOUS_NOTIFY_KEY');
  const serverId = 'ddz1';
  const notifyPath = '/api/v1/payments/kwai/notify';
  const platformBaseUrl = 'https://allin.kuaishoupay.com';
  const platformAccessToken = '';
  const platformBalancePath = '/api/kpay/minigame/balance';
  const platformPayPath = '/api/kpay/minigame/pay';
  const platformTimeoutMs = 5000;
  const platformPayPriority = 1;
  const platformImmediateAttempts = 2;
  const bodyLimitBytes = 16384;
  const trustedProxyIps = fromEnv('DDZ_TRUSTED_PROXY_IPS').split(',').map(value => value.trim()).filter(Boolean);
  const maxPendingPerAccount = 3;
  const createRatePerMinute = 10;
  const pendingTtlMs = 15 * 60 * 1000;
  const staleScanIntervalMs = 60 * 1000;

  if (!paySignKey) throw new Error('[IAP] 必须配置 DDZ_KWAI_PAY_SIGN_KEY');
  if (!notifyKey) throw new Error('[IAP] 必须配置 DDZ_KWAI_PAY_NOTIFY_KEY');

  return {
    platformEnabled,
    orderCreateEnabled,
    fulfillmentPaused,
    androidEnabled,
    iosEnabled,
    exchangeEnabled,
    paySignKey,
    notifyKey,
    prevNotifyKey,
    serverId,
    notifyPath,
    platformBaseUrl,
    platformAccessToken,
    platformBalancePath,
    platformPayPath,
    platformTimeoutMs,
    platformPayPriority,
    platformImmediateAttempts,
    bodyLimitBytes,
    trustedProxyIps,
    maxPendingPerAccount,
    createRatePerMinute,
    pendingTtlMs,
    staleScanIntervalMs,
  };
}

let _cfg = null;

function getConfig () {
  if (!_cfg) _cfg = loadConfig();
  return _cfg;
}

// 仅测试环境用于重置缓存
function _resetConfig () { _cfg = null; }

module.exports = { getConfig, _resetConfig };
