'use strict';

const kwaiApp = require('../config/kwai-app');
const { getConfig } = require('./config');
const { signGamePayment } = require('./signature');
const { getAccessToken: _getAccessToken } = require('./access-token');

const BALANCE_SIGN_FIELDS = Object.freeze(['open_id', 'app_id', 'zone_id', 'os', 'user_ip', 'ts', 'extension']);
const PAY_SIGN_FIELDS = Object.freeze([
  'open_id', 'app_id', 'zone_id', 'os', 'ts', 'user_ip', 'amount', 'pay_priority',
  'biz_no', 'product_name', 'product_info', 'product_desc', 'extension',
]);

class PlatformClientError extends Error {
  constructor (message, options = {}) {
    super(message);
    this.name = 'PlatformClientError';
    this.code = options.code || 'PLATFORM_ERROR';
    this.retryable = options.retryable === true;
    this.status = options.status == null ? null : Number(options.status);
    // 禁止保存请求体或 URL，二者可能含 open_id / access token。
  }
}

function positiveMs (value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function platformResultCode (body) {
  return body?.code;
}

function isExplicitSuccess (body) {
  return platformResultCode(body) === 1;
}

function isExplicitRejection (body) {
  const code = platformResultCode(body);
  return (typeof code === 'number' && Number.isFinite(code) && code !== 1) ||
    (typeof code === 'string' && /^-?\d+$/.test(code) && code !== '1');
}

function signedParams (values, fields, key) {
  const params = {};
  for (const field of fields) {
    const value = values[field];
    if (value !== null && value !== undefined && value !== '') params[field] = value;
  }
  return { ...params, sign: signGamePayment(params, key) };
}

function createPlatformClient (options = {}) {
  const fetchImpl = options.fetch || globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new Error('platform-client: fetch is unavailable');
  const cfg = options.config || getConfig();
  const baseUrl = String(options.baseUrl || cfg.platformBaseUrl).replace(/\/+$/, '');
  const timeoutMs = positiveMs(options.timeoutMs || cfg.platformTimeoutMs, 5000);
  const appId = String(options.appId || kwaiApp.getAppId()).trim();
  // accessToken：优先用注入值（测试/静态配置），否则动态获取
  const staticToken = String(options.accessToken || cfg.platformAccessToken || '').trim();
  const getToken = options.getAccessToken || (staticToken ? () => Promise.resolve(staticToken) : _getAccessToken);
  const signKey = String(options.signKey || cfg.paySignKey).trim();
  const paths = {
    balance: options.balancePath || cfg.platformBalancePath,
    pay: options.payPath || cfg.platformPayPath,
  };

  function assertConfigured (accessToken) {
    if (!appId || !accessToken || !signKey) {
      throw new PlatformClientError('platform payment is not configured', {
        code: 'PAYMENT_UNAVAILABLE', retryable: false,
      });
    }
  }

  async function request (method, path, params) {
    const accessToken = await getToken();
    assertConfigured(accessToken);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const encoded = new URLSearchParams({ access_token: accessToken, ...params }).toString();
    let response;
    try {
      response = await fetchImpl(method === 'GET' ? `${baseUrl}${path}?${encoded}` : baseUrl + path, {
        method,
        headers: method === 'POST' ? { 'content-type': 'application/x-www-form-urlencoded' } : undefined,
        body: method === 'POST' ? encoded : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const timeout = err?.name === 'AbortError';
      throw new PlatformClientError(timeout ? 'platform request timed out' : 'platform request failed', {
        code: timeout ? 'PLATFORM_TIMEOUT' : 'PLATFORM_NETWORK_ERROR',
        retryable: true,
      });
    } finally {
      clearTimeout(timer);
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new PlatformClientError('invalid platform response', {
        code: 'PLATFORM_INVALID_RESPONSE', status: response.status, retryable: response.status >= 500,
      });
    }
    if (!response.ok) {
      throw new PlatformClientError('platform request failed', {
        code: 'PLATFORM_HTTP_ERROR', status: response.status,
        retryable: response.status === 429 || response.status >= 500,
      });
    }
    return body;
  }

  return {
    async getBalance ({ openId, zoneId, os, userIp, extension = '' }) {
      const params = signedParams({
        open_id: openId,
        app_id: appId,
        zone_id: zoneId,
        os,
        user_ip: userIp,
        ts: Date.now(),
        extension,
      }, BALANCE_SIGN_FIELDS, signKey);
      const body = await request('GET', paths.balance, params);
      if (!isExplicitSuccess(body)) {
        throw new PlatformClientError('platform balance rejected', {
          code: String(platformResultCode(body) ?? 'PLATFORM_BALANCE_REJECTED'), retryable: false,
        });
      }
      const chargeBalance = body.data?.chargeBalance;
      const freeBalance = body.data?.freeBalance;
      if (!/^\d+$/.test(String(chargeBalance ?? '')) || !/^\d+$/.test(String(freeBalance ?? ''))) {
        throw new PlatformClientError('invalid platform balance', { code: 'PLATFORM_INVALID_RESPONSE' });
      }
      return { chargeBalance: String(chargeBalance), freeBalance: String(freeBalance) };
    },

    async pay ({ openId, zoneId, os, userIp, bizNo, amount, payPriority, productName, productInfo, productDesc, extension = '' }) {
      const params = signedParams({
        open_id: openId,
        app_id: appId,
        zone_id: zoneId,
        os,
        ts: Date.now(),
        user_ip: userIp,
        amount: String(amount),
        pay_priority: payPriority,
        biz_no: bizNo,
        product_name: productName,
        product_info: typeof productInfo === 'string' ? productInfo : JSON.stringify(productInfo),
        product_desc: productDesc,
        extension,
      }, PAY_SIGN_FIELDS, signKey);
      const body = await request('POST', paths.pay, params);
      if (!isExplicitSuccess(body) && !isExplicitRejection(body)) {
        throw new PlatformClientError('invalid platform pay response', {
          code: 'PLATFORM_INVALID_RESPONSE', retryable: true,
        });
      }
      const chargeBalance = body.data?.chargeBalance;
      const freeBalance = body.data?.freeBalance;
      return {
        success: isExplicitSuccess(body),
        code: String(platformResultCode(body) ?? ''),
        message: String(body.msg ?? '').slice(0, 255),
        chargeBalance: /^\d+$/.test(String(chargeBalance ?? '')) ? String(chargeBalance) : null,
        freeBalance: /^\d+$/.test(String(freeBalance ?? '')) ? String(freeBalance) : null,
      };
    },
  };
}

module.exports = {
  BALANCE_SIGN_FIELDS,
  PAY_SIGN_FIELDS,
  createPlatformClient,
  PlatformClientError,
  isExplicitSuccess,
};
