// ============================================================
// IAP 签名工具
// ------------------------------------------------------------
// 仅提供两个公开方法：
//   signGamePayment(params, key)       — 生成下单签名
//   verifyPaymentNotify(params, key)   — 验证平台回调签名
//
// 快手签名规则（下单与回调相同算法）：
//   1. 去除值为空字符串或 null/undefined 的字段；
//   2. 按参数名 ASCII 字典序升序排列；
//   3. 拼接为 key=value&key=value；
//   4. 以 HMAC-SHA256 + payKey 计算，输出小写十六进制。
//
// 安全要求：
//   - 本模块不打印任何参数或密钥；
//   - HMAC 比较使用 timingSafeEqual 防止时序攻击。
// ============================================================

const crypto = require('crypto');

function buildSignString (params) {
  return Object.keys(params)
    .filter(k => {
      const v = params[k];
      return v !== null && v !== undefined && v !== '';
    })
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
}

function hmacHex (str, key) {
  return crypto.createHmac('sha256', key).update(str).digest('hex');
}

/**
 * 生成下单签名。
 * @param {Object} params  — 下单参数对象（会排除 sign / goods_category / goods_name / product_type 等非签名字段后由调用方传入）
 * @param {string} key     — 支付密钥 DDZ_KWAI_PAY_SIGN_KEY
 * @returns {string}       — 小写十六进制签名
 */
function signGamePayment (params, key) {
  if (!key) throw new Error('[signature] paySignKey is required');
  const str = buildSignString(params);
  return hmacHex(str, key);
}

/**
 * 验证平台回调签名（支持新旧双密钥滚动）。
 * params 应为完整回调参数对象（包含 sign 字段）。
 * 函数内部提取 params.sign 作为待验证签名，并在计算参考签名时排除 sign 字段。
 * @param {Object} params      — 完整回调参数（含 sign）
 * @param {string} currentKey  — 当前回调密钥
 * @param {string} [prevKey]   — 轮换期间的旧密钥（可选）
 * @returns {boolean}
 */
function verifyPaymentNotify (params, currentKey, prevKey) {
  if (!currentKey) return false;
  const actual = String(params.sign || '');
  if (!actual) return false;
  const paramsForSign = Object.fromEntries(
    Object.entries(params).filter(([k]) => k !== 'sign'),
  );
  const str = buildSignString(paramsForSign);
  const expected = hmacHex(str, currentKey);
  if (actual.length !== expected.length) {
    if (!prevKey) return false;
    const prevExpected = hmacHex(str, prevKey);
    if (actual.length !== prevExpected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(prevExpected));
  }
  const match = crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  if (match) return true;
  if (!prevKey) return false;
  const prevExpected = hmacHex(str, prevKey);
  if (actual.length !== prevExpected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(prevExpected));
}

module.exports = { signGamePayment, verifyPaymentNotify, buildSignString };
