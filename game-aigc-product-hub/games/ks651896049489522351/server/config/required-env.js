// ============================================================
// 启动必填环境变量校验
// ------------------------------------------------------------
// 部署链路存在两个入口（KNode 的 kcsize、Compose 的 start.sh），
// 校验放在 Node 侧才能同时覆盖，且能在数据库连接超时之前就报出缺失项。
//
// 只校验「漏配后会静默连错目标或降级放行」的变量：
// 已经在业务模块里 throw 的（DDZ_AUTH_SECRET、支付密钥等）不在此重复。
// ============================================================

const MYSQL_REQUIRED = [
  ['DDZ_MYSQL_HOST', '漏配会回落到 127.0.0.1，连接容器自身'],
  ['DDZ_MYSQL_USER', '漏配会回落到 root'],
  ['DDZ_MYSQL_PASSWORD', '漏配会以空口令连接'],
  ['DDZ_MYSQL_DATABASE', '漏配会回落到 ddz，可能写入错误的库'],
];

function isBlank (name) {
  return String(process.env[name] || '').trim() === '';
}

// 本地调试允许走 db.js 的默认值；部署环境必须显式注入。
// 判定依据是认证模式：dev 属于本地与自动化测试场景。
function isDeployment () {
  return String(process.env.DDZ_AUTH_MODE || '').trim().toLowerCase() !== 'dev';
}

function checkEnv () {
  if (!isDeployment()) return;

  const missing = MYSQL_REQUIRED.filter(([name]) => isBlank(name));
  if (missing.length) {
    const detail = missing.map(([name, why]) => `  - ${name}：${why}`).join('\n');
    throw new Error(`[启动] 缺少必填环境变量，拒绝以默认值连接数据库：\n${detail}`);
  }

  // 正式实例应启用 TLS；内网 Proxy 等免 TLS 链路需显式声明 false，
  // 避免因为漏配而在不知情的情况下明文传输。
  if (isBlank('DDZ_MYSQL_SSL')) {
    throw new Error('[启动] 必须显式设置 DDZ_MYSQL_SSL（正式实例 true；内网免 TLS 链路 false）');
  }
}

module.exports = { checkEnv };
