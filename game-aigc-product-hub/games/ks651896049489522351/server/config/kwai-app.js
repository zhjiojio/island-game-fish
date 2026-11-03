// ============================================================
// 快手小游戏平台凭证（服务端专属）
// ------------------------------------------------------------
// appId 属于公开标识；appSecret 只能由部署环境以
// DDZ_KWAI_APP_SECRET 注入，严禁写入源码或镜像。
// ============================================================

const BUILTIN_APP_ID = 'ks651896049489522351';

// ---- 身份派生盐 ----
// 【为什么必须与 DDZ_AUTH_SECRET 分开】
// accountId = HMAC(identitySalt, appId + openId)。
// 若复用 DDZ_AUTH_SECRET（token 签名密钥），那么每次轮换签名密钥，
// 同一个快手用户就会被派生成一个全新的 accountId —— 钱包、战绩全部失联。
// 拆开后：签名密钥可自由轮换（代价仅是所有人重新登录），
// 身份盐则长期不变（一旦上线**永远不能改**，改动等同于全量账号迁移）。
const IDENTITY_SALT = 'ddz_kwai_identity_salt_v1_do_not_rotate';

function fromEnv (key) {
  return String(process.env[key] || '').trim();
}

function getAppId () {
  return fromEnv('DDZ_KWAI_APP_ID') || BUILTIN_APP_ID;
}

function getAppSecret () {
  return fromEnv('DDZ_KWAI_APP_SECRET');
}

// 身份盐固定在代码中，禁止通过环境变量覆盖。
// 修改它会改变所有快手用户的内部 accountId 映射。
function getIdentitySalt () {
  return IDENTITY_SALT;
}

function isConfigured () {
  return !!(getAppId() && getAppSecret());
}

// code2session 接口地址。默认值取自快手小游戏官方文档：
//   GET https://open.kuaishou.com/game/minigame/jscode2session
// 注意这是 GET + query 传参，appSecret 会出现在 URL 中，
// 因此调用方**禁止**打印完整 URL（见 auth.js exchangeKwaiCode）。
function getCode2SessionUrl () {
  return fromEnv('DDZ_KWAI_CODE2SESSION_URL')
    || 'https://open.kuaishou.com/game/minigame/jscode2session';
}

function getTimeoutMs () {
  const raw = parseInt(fromEnv('DDZ_KWAI_TIMEOUT_MS') || '5000', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : 5000;
}

module.exports = {
  getAppId,
  getAppSecret,
  getIdentitySalt,
  getCode2SessionUrl,
  getTimeoutMs,
  isConfigured,
};
