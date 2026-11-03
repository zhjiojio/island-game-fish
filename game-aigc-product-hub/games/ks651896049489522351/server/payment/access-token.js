'use strict';

// ============================================================
// 快手平台 access_token 自动获取与缓存管理
// ------------------------------------------------------------
// 文档：https://open.kuaishou.com/docs/develop/server/getAccessToken.html
// - token 有效期约 48 小时（expires_in 秒）
// - 未过期时重新申请，新老 token 同时有效
// - 提前 5 分钟刷新，避免使用中过期
// ============================================================

const kwaiApp = require('../config/kwai-app');
const logger = require('../logger');

const TOKEN_URL = 'https://open.kuaishou.com/oauth2/access_token';
const REFRESH_AHEAD_MS = 5 * 60 * 1000; // 过期前 5 分钟提前刷

let _cache = null; // { token, expiresAt }
let _inflight = null; // Promise，防止并发重复请求

async function fetchToken () {
  const appId     = kwaiApp.getAppId();
  const appSecret = kwaiApp.getAppSecret();

  // scope=game_pay 为小游戏支付权限（小游戏文档要求，与小程序版本的区别）
  const url = `${TOKEN_URL}?app_id=${encodeURIComponent(appId)}&app_secret=${encodeURIComponent(appSecret)}&grant_type=client_credentials&scope=game_pay`;

  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  } catch (err) {
    throw Object.assign(new Error('access_token 请求失败: ' + (err?.message || err)), { code: 'TOKEN_NETWORK_ERROR' });
  }

  let body;
  try { body = await response.json(); } catch {
    throw Object.assign(new Error('access_token 响应解析失败'), { code: 'TOKEN_INVALID_RESPONSE' });
  }

  if (body.result !== 1 || !body.access_token) {
    throw Object.assign(
      new Error(`access_token 获取失败: result=${body.result}`),
      { code: 'TOKEN_API_ERROR', result: body.result }
    );
  }

  const expiresIn = Number(body.expires_in) || 7200; // 默认 2h（小游戏支付 token）
  return {
    token: String(body.access_token),
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

/**
 * 获取当前有效的 access_token。
 * 内部自动缓存与刷新，并发安全（多个调用者共享同一个 inflight 请求）。
 */
async function getAccessToken () {
  // 缓存有效且不在刷新窗口内，直接返回
  if (_cache && Date.now() < _cache.expiresAt - REFRESH_AHEAD_MS) {
    return _cache.token;
  }

  // 有正在进行中的请求，等它完成
  if (_inflight) return _inflight;

  _inflight = fetchToken()
    .then(result => {
      _cache = result;
      _inflight = null;
      return result.token;
    })
    .catch(err => {
      _inflight = null;
      // 若缓存仍在有效期内（刷新提前失败），先用旧 token 兜底
      if (_cache && Date.now() < _cache.expiresAt) {
        logger.warn('[access-token] 刷新失败，继续使用旧 token:', err.message);
        return _cache.token;
      }
      throw err;
    });

  return _inflight;
}

/** 主动清除缓存（测试 / 强制刷新用）*/
function invalidate () {
  _cache = null;
  _inflight = null;
}

module.exports = { getAccessToken, invalidate };
