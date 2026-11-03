// ============================================================
// 认证与身份模块
// ------------------------------------------------------------
// 设计原则：
//   1. 正式环境（strict）以快手登录为唯一入口，游客一律拒绝；
//   2. H5 / 测试环境（dev、mixed）允许游客登录，但游客身份必须由
//      服务端派生，客户端无法凭空构造他人 accountId；
//   3. 所有账号在业务消息之前必须完成 auth 握手，杜绝「建连即白送新手豆」。
//
// 环境变量：
//   DDZ_AUTH_MODE      strict | mixed | dev（缺省 strict，fail-safe）
//   DDZ_AUTH_SECRET    HMAC 密钥，用于派生游客 ID 与签发 sessionToken
//   DDZ_KWAI_APP_ID        快手小游戏 appId      （占位，配置后生效）
//   DDZ_KWAI_APP_SECRET    快手小游戏 appSecret  （占位，配置后生效）
//   DDZ_KWAI_CODE2SESSION_URL  code 换 openId 接口地址（占位）
// ============================================================

const crypto = require('crypto');
const kwaiApp = require('./config/kwai-app');
const { deriveKwaiAccountId } = require('./identity/kwai-account-id');
const logger = require('./logger');

// ---- 认证模式 ----
// strict：仅接受快手登录（code / 有效 token），游客一律拒绝 —— 正式环境
// mixed ：快手登录为主，游客可降级准入 —— 预发 / 灰度
// dev   ：允许游客登录 —— 本地 H5 调试与自动化测试
const AUTH_MODES = new Set(['strict', 'mixed', 'dev']);
const AUTH_MODE = (() => {
  const raw = String(process.env.DDZ_AUTH_MODE || '').trim().toLowerCase();
  // 缺省走最严格模式：宁可本地调试多配一个环境变量，
  // 也不能因为忘记配置而让正式环境敞开游客入口。
  return AUTH_MODES.has(raw) ? raw : 'strict';
})();

const GUEST_LOGIN_ALLOWED = AUTH_MODE !== 'strict';

// ---- HMAC 密钥 ----
// 生产必须显式注入；未注入时随机生成，进程重启后旧 token 全部失效，
// 这在本地调试可接受，但绝不能出现在正式环境，故 strict 模式下强制要求。
const AUTH_SECRET = (() => {
  const raw = String(process.env.DDZ_AUTH_SECRET || '').trim();
  if (raw) return raw;
  if (AUTH_MODE === 'strict') {
    throw new Error('[AUTH] strict 模式必须配置 DDZ_AUTH_SECRET，拒绝以随机密钥启动');
  }
  const generated = crypto.randomBytes(32).toString('hex');
  logger.warn('[AUTH] 未配置 DDZ_AUTH_SECRET，已生成临时密钥（重启后 token 全部失效，仅限本地调试）');
  return generated;
})();

// ---- 快手开放平台配置 ----
// 凭证统一由 config/kwai-app 提供（内置 + 环境变量覆盖），
// 本模块不持有裸密钥常量，避免被日志或调试打印带出。
const KWAI_LOGIN_CONFIGURED = kwaiApp.isConfigured();

// ---- session token 有效期 ----
const SESSION_TTL_MS = parseInt(process.env.DDZ_SESSION_TTL_MS || String(7 * 24 * 3600 * 1000), 10);

// ---- 新账号创建速率限制 ----
// 游客身份虽由服务端派生，但客户端仍可不断更换 deviceId 来刷新号。
// 这里按「IP 维度限制单位时间内新建账号数」，把刷号成本抬起来。
const NEW_ACCOUNT_WINDOW_MS = parseInt(process.env.DDZ_NEW_ACCOUNT_WINDOW_MS || '3600000', 10);
const NEW_ACCOUNT_MAX_PER_IP = parseInt(process.env.DDZ_NEW_ACCOUNT_MAX_PER_IP || '20', 10);

const AUTH_ERRORS = {
  GUEST_FORBIDDEN: 'GUEST_LOGIN_FORBIDDEN',
  INVALID_TOKEN: 'INVALID_SESSION_TOKEN',
  INVALID_CODE: 'INVALID_KWAI_CODE',
  MISSING_CREDENTIAL: 'MISSING_CREDENTIAL',
  KWAI_NOT_CONFIGURED: 'KWAI_LOGIN_NOT_CONFIGURED',
  NEW_ACCOUNT_THROTTLED: 'NEW_ACCOUNT_THROTTLED',
  // token 有效但账号缺支付身份绑定：客户端必须重新走一次 ks.login。
  // 典型成因是后端清过账号数据（本地 token 还在、绑定行已删）。
  IDENTITY_REBIND_REQUIRED: 'IDENTITY_REBIND_REQUIRED',
};

function getSigningSecret () {
  return AUTH_SECRET;
}

function hmac (input) {
  return crypto.createHmac('sha256', AUTH_SECRET).update(String(input)).digest('hex');
}

function sanitizeToken (value, maxLen = 512) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLen);
}

// deviceId 只允许安全字符，避免污染 accountId / 日志
function sanitizeDeviceId (value) {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[^a-zA-Z0-9_\-:.]/g, '').slice(0, 64);
}

// ---- 游客 accountId 派生 ----
// 关键点：accountId 由「服务端密钥 + deviceId」HMAC 得出，
// 客户端即使知道他人 deviceId 也无法直接指定 accountId，
// 更无法像旧实现那样随手编一个 guest_h5_xxx 就接管他人钱包。
function deriveGuestAccountId (deviceId) {
  return 'guest_' + hmac('guest:' + deviceId).slice(0, 32);
}

// 日志脱敏：只保留前后各 4 位
function maskId (value) {
  const str = String(value || '');
  if (str.length <= 10) return str.slice(0, 4) + '***';
  return str.slice(0, 6) + '***' + str.slice(-4);
}

// ============================================================
// session token：HMAC 签名，无状态校验
// 结构：base64url(payload).hmac  —— payload 内含 accountId / loginType / deviceId / exp
// ============================================================
function base64UrlEncode (obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function base64UrlDecode (str) {
  try {
    return JSON.parse(Buffer.from(str, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function isReservedAccountId (accountId) {
  const id = String(accountId || '').trim().toLowerCase();
  return id.startsWith('bot::') || id.startsWith('system::');
}

function issueSessionToken (identity) {
  if (!identity || isReservedAccountId(identity.accountId)) {
    throw new Error('[AUTH] 拒绝为保留账号命名空间签发 sessionToken');
  }
  const payload = {
    a: identity.accountId,
    t: identity.loginType,
    d: identity.deviceId || '',
    e: Date.now() + SESSION_TTL_MS,
  };
  const body = base64UrlEncode(payload);
  return body + '.' + hmac(body);
}

function verifySessionToken (token) {
  const raw = sanitizeToken(token);
  if (!raw) return null;
  const idx = raw.lastIndexOf('.');
  if (idx <= 0) return null;
  const body = raw.slice(0, idx);
  const sig = raw.slice(idx + 1);
  const expect = hmac(body);
  // 定长比较，避免时序侧信道
  if (sig.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  const payload = base64UrlDecode(body);
  if (!payload || !payload.a || !payload.t) return null;
  if (isReservedAccountId(payload.a)) return null;
  if (typeof payload.e !== 'number' || payload.e < Date.now()) return null;
  return { accountId: payload.a, loginType: payload.t, deviceId: payload.d || '' };
}

// ============================================================
// 快手 code 换 openId
// 未配置 appId/appSecret 时返回 notConfigured，由调用方决定降级还是拒绝。
// ============================================================
async function exchangeKwaiCode (code) {
  if (!KWAI_LOGIN_CONFIGURED) {
    return { ok: false, notConfigured: true, reason: '快手登录未配置 appId/appSecret' };
  }
  const cleanCode = sanitizeToken(code, 256);
  if (!cleanCode) return { ok: false, reason: 'code 为空' };

  // 按官方文档构造：GET + query，grant_type 固定 authorization_code。
  // 【安全】appSecret 出现在 query 中，因此这个 url 变量
  // 绝不能进日志、异常信息或 APM 采集，只能直接交给 fetch。
  const url = kwaiApp.getCode2SessionUrl()
    + '?app_id=' + encodeURIComponent(kwaiApp.getAppId())
    + '&app_secret=' + encodeURIComponent(kwaiApp.getAppSecret())
    + '&js_code=' + encodeURIComponent(cleanCode)
    + '&grant_type=authorization_code';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), kwaiApp.getTimeoutMs());
  try {
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    if (!resp.ok) return { ok: false, reason: `快手接口 HTTP ${resp.status}` };

    let json;
    try {
      json = await resp.json();
    } catch {
      // 非 JSON 响应通常是网关错误页，正文可能含敏感回显，不予记录
      return { ok: false, reason: '快手接口返回非 JSON' };
    }

    // 官方返回：result / msg / open_id / session_key / union_id
    // result 非 1 视为失败；部分网关只返回 open_id 而不带 result，故仅在存在时校验。
    const result = Number(json.result);
    if (Number.isFinite(result) && result !== 1) {
      return { ok: false, reason: `快手接口 result=${result}`, platformResult: result };
    }

    const openId = String(json.open_id || json.openId || '').trim();
    if (!openId) return { ok: false, reason: 'openId 为空', platformResult: result };

    return {
      ok: true,
      openId: openId.slice(0, 128),
      // sessionKey 只回传给调用方做内存保管，禁止落库明文 / 下发客户端
      sessionKey: String(json.session_key || '').slice(0, 256),
      unionId: String(json.union_id || '').slice(0, 128),
    };
  } catch (err) {
    // 【安全】err.message 在部分 fetch 实现中会带上完整请求 URL（含 appSecret），
    // 因此这里只输出归一化后的原因，绝不透传原始错误信息。
    const reason = err && err.name === 'AbortError' ? '快手接口超时' : '快手接口请求失败';
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}

// ============================================================
// 平台 session_key 内存保管
// ------------------------------------------------------------
// 官方要求 session_key 妥善保管且绝不下发前端。当前业务尚未使用
// 登录态签名 / 敏感数据解密，因此不落库（落库需配套 KMS 加密），
// 仅在进程内缓存：进程重启后丢失可接受，下次 ks.login 会重新换取。
// 后续接入签名类能力时，再升级为加密持久化。
// ============================================================
const platformSessionKeys = new Map(); // accountId -> { sessionKey, refreshedAt }

function rememberPlatformSession (accountId, sessionKey) {
  if (!accountId || !sessionKey) return;
  platformSessionKeys.set(accountId, { sessionKey, refreshedAt: Date.now() });
}

// 仅供服务端内部使用。调用方不得将返回值写日志或下发客户端。
function getPlatformSessionKey (accountId) {
  const entry = platformSessionKeys.get(accountId);
  return entry ? entry.sessionKey : '';
}

function hasPlatformSession (accountId) {
  return platformSessionKeys.has(accountId);
}

function forgetPlatformSession (accountId) {
  platformSessionKeys.delete(accountId);
}

// ============================================================
// 新账号创建速率限制（IP 维度）
// ============================================================
const newAccountBuckets = new Map(); // ip -> { windowStart, count }

function hitNewAccountLimit (ip, now = Date.now()) {
  if (!ip) return false;
  let state = newAccountBuckets.get(ip);
  if (!state || now - state.windowStart >= NEW_ACCOUNT_WINDOW_MS) {
    state = { windowStart: now, count: 0 };
    newAccountBuckets.set(ip, state);
  }
  state.count += 1;
  return state.count > NEW_ACCOUNT_MAX_PER_IP;
}

function sweepNewAccountBuckets (now = Date.now()) {
  let removed = 0;
  for (const [ip, state] of newAccountBuckets) {
    if (now - state.windowStart > NEW_ACCOUNT_WINDOW_MS * 2) {
      newAccountBuckets.delete(ip);
      removed += 1;
    }
  }
  return removed;
}

// ============================================================
// 认证主入口
// data：客户端 auth 帧 { intent?, sessionToken?, code?, deviceId?, ... }
// context：{ ip, isKnownAccount }  isKnownAccount 用于判断是否属于「新建账号」
// 返回：{ ok, identity?, token?, code?, reason? }
//
// 【intent 机制】
// 旧实现固定按 token → code → 游客 的顺序试探，导致一个严重问题：
// 用户手里握着旧的游客 token 去点快手登录时，服务端会先认下游客 token
// 直接返回，本次 code 根本不会被消费 —— 用户永远登不上快手号。
// 现在由客户端显式声明意图，服务端不再猜。
async function authenticate (data = {}, context = {}) {
  const deviceId = sanitizeDeviceId(data.deviceId);
  const ip = context.ip || '';
  const code = sanitizeToken(data.code, 256);
  const token = sanitizeToken(data.sessionToken);

  // 无 intent 的旧客户端：按「有 code 就当快手登录」推断，保证升级期兼容。
  let intent = String(data.intent || '').trim().toLowerCase();
  if (!intent) intent = code ? 'kwai_login' : (token ? 'resume' : 'guest');

  // ---- 路径 1：快手登录（code 换 openId）----
  // 该意图下无条件优先处理 code，忽略任何随包带来的旧 token。
  if (intent === 'kwai_login') {
    if (!code) {
      return { ok: false, code: AUTH_ERRORS.MISSING_CREDENTIAL, reason: '缺少快手登录 code' };
    }
    const result = await exchangeKwaiCode(code);
    if (result.ok) {
      const accountId = deriveKwaiAccountId(result.openId);
      // 明文 openId 仅通过内部认证结果交给入口层完成支付身份绑定；
      // 入口层必须逐字段构造公开 DTO，禁止透传整个 identity。
      const identity = {
        accountId,
        loginType: 'kwai',
        deviceId,
        openIdHash: hmac('openid:' + result.openId).slice(0, 32),
        platformOpenId: result.openId,
      };
      // session_key 内存保管，不入 identity——避免随 authOk 或日志泄露。
      rememberPlatformSession(accountId, result.sessionKey);
      return { ok: true, identity, token: issueSessionToken(identity), renewed: true };
    }
    if (result.notConfigured) {
      return { ok: false, code: AUTH_ERRORS.KWAI_NOT_CONFIGURED, reason: '快手登录尚未配置，暂无法登录' };
    }
    // code 校验失败属于明确的登录失败，任何模式都不降级为游客，
    // 否则攻击者只要发一个垃圾 code 就能绕到游客通道。
    return { ok: false, code: AUTH_ERRORS.INVALID_CODE, reason: '快手登录校验失败：' + result.reason };
  }

  // ---- 路径 2：token 续期复用，不重复走平台登录 ----
  if (intent === 'resume') {
    const payload = token ? verifySessionToken(token) : null;
    if (payload) {
      // strict 模式下即便持有合法 token，游客身份同样不予放行，
      // 避免「先在 dev 模式拿 token、再拿到正式环境使用」的越权路径。
      if (payload.loginType === 'guest' && !GUEST_LOGIN_ALLOWED) {
        return { ok: false, code: AUTH_ERRORS.GUEST_FORBIDDEN, reason: '正式环境不支持游客登录，请使用快手登录' };
      }
      return {
        ok: true,
        identity: { accountId: payload.accountId, loginType: payload.loginType, deviceId: payload.deviceId || deviceId },
        token,
        renewed: false,
      };
    }
    // token 失效：明确告知客户端，由它决定是重新 ks.login 还是走游客，
    // 不在服务端静默降级——否则快手用户会莫名其妙变成另一个游客账号。
    return { ok: false, code: AUTH_ERRORS.INVALID_TOKEN, reason: '登录态已失效，请重新登录' };
  }

  // ---- 路径 3：游客登录 ----
  if (!GUEST_LOGIN_ALLOWED) {
    return { ok: false, code: AUTH_ERRORS.GUEST_FORBIDDEN, reason: '正式环境不支持游客登录，请使用快手登录' };
  }

  // 游客意图下仍允许复用已有游客 token，避免每次启动都新建账号。
  if (token) {
    const payload = verifySessionToken(token);
    if (payload && payload.loginType === 'guest') {
      return {
        ok: true,
        identity: { accountId: payload.accountId, loginType: 'guest', deviceId: payload.deviceId || deviceId },
        token,
        renewed: false,
      };
    }
  }

  if (!deviceId) {
    return { ok: false, code: AUTH_ERRORS.MISSING_CREDENTIAL, reason: '缺少 deviceId，无法创建游客身份' };
  }

  const accountId = deriveGuestAccountId(deviceId);
  // 仅对「首次出现的账号」计入新建配额，老账号重连不受影响
  if (!context.isKnownAccount && hitNewAccountLimit(ip)) {
    return { ok: false, code: AUTH_ERRORS.NEW_ACCOUNT_THROTTLED, reason: '新账号创建过于频繁，请稍后再试' };
  }

  const identity = { accountId, loginType: 'guest', deviceId };
  return { ok: true, identity, token: issueSessionToken(identity), renewed: true };
}

module.exports = {
  AUTH_MODE,
  GUEST_LOGIN_ALLOWED,
  KWAI_LOGIN_CONFIGURED,
  SESSION_TTL_MS,
  AUTH_ERRORS,
  isReservedAccountId,
  authenticate,
  getSigningSecret,
  issueSessionToken,
  verifySessionToken,
  deriveGuestAccountId,
  deriveKwaiAccountId,
  exchangeKwaiCode,
  rememberPlatformSession,
  getPlatformSessionKey,
  hasPlatformSession,
  forgetPlatformSession,
  sanitizeDeviceId,
  hitNewAccountLimit,
  sweepNewAccountBuckets,
  maskId,
};
