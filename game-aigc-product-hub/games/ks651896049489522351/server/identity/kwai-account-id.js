// ============================================================
// 快手账号 ID 稳定派生
// ------------------------------------------------------------
// 唯一入口：整个服务中所有需要把 open_id 映射到内部 accountId 的地方
// 都必须调用本模块，包括：
//   - auth.js 快手登录路径
//   - payment/notify-handler.js 支付回调
//
// 派生规则：HMAC-SHA256(identitySalt, "kwai:" + appId + ":" + openId)
// 取前 32 个十六进制字符，前缀 "ks_"。
//
// 【不可变约束】identitySalt 一旦在生产环境投入使用就永远不可更换。
// 更换 salt 等同于把所有快手用户映射到新 accountId——钱包、战绩全部失联。
// ============================================================

const crypto = require('crypto');
const kwaiApp = require('../config/kwai-app');

function normalizeKwaiOpenId (openId) {
  return String(openId || '').trim().slice(0, 128);
}

function deriveKwaiAccountId (openId) {
  const salt = kwaiApp.getIdentitySalt();
  return 'ks_' + crypto.createHmac('sha256', salt)
    .update('kwai:' + kwaiApp.getAppId() + ':' + normalizeKwaiOpenId(openId))
    .digest('hex').slice(0, 32);
}

module.exports = {
  normalizeKwaiOpenId,
  deriveKwaiAccountId,
};
