(function () {
  var M3 = window.M3 = window.M3 || {};

  // ───────────────────────────────────────────────────────────────────────────
  // compliance.js — 合规接口预留层
  //
  // 依据 docs/game-privacy.md §2.1，快手小游戏提审强制要求预留以下四项能力。
  // 本文件只做「预留 + 防御式调用」，不主动弹窗打断玩家：
  //   1. 隐私政策       PRIVACY_POLICY_URL
  //   2. 实名认证       requestRealNameAuth
  //   3. 防沉迷        getAntiAddictionInfo
  //   4. 客服入口       openCustomerServicePage
  //
  // 所有调用都包裹 typeof 检查，非快手环境（H5 调试）静默降级，不抛异常。
  // ───────────────────────────────────────────────────────────────────────────

  // 隐私政策地址（提审前需替换为真实备案地址）
  var PRIVACY_POLICY_URL = '';

  // 实名认证 / 防沉迷状态缓存
  var _realNameVerified = false;
  var _antiAddiction    = null;   // { isMinor: bool, remainSeconds: number } | null

  function _hasKs() {
    return typeof ks !== 'undefined' && ks;
  }

  // ── 1. 隐私政策 ────────────────────────────────────────────────────────────
  function getPrivacyPolicyUrl() {
    return PRIVACY_POLICY_URL;
  }

  /**
   * 打开隐私政策页面。URL 未配置时不做任何动作，避免打开空白页。
   */
  function openPrivacyPolicy() {
    if (!PRIVACY_POLICY_URL) {
      console.warn('[Compliance] PRIVACY_POLICY_URL 未配置，提审前必须补齐');
      return;
    }
    if (_hasKs() && typeof ks.openWebView === 'function') {
      ks.openWebView({ url: PRIVACY_POLICY_URL });
      return;
    }
    console.warn('[Compliance] 非快手环境，跳过隐私政策跳转');
  }

  // ── 2. 实名认证 ────────────────────────────────────────────────────────────
  /**
   * 请求实名认证。平台未下发该能力时按「已通过」降级，不阻塞游戏启动。
   * @param {Function} [onDone] - 回调，参数为 boolean（是否已实名）
   */
  function requestRealNameAuth(onDone) {
    if (!_hasKs() || typeof ks.requestRealNameAuth !== 'function') {
      console.warn('[Compliance] 实名认证接口不可用，降级放行');
      _realNameVerified = true;
      if (onDone) onDone(true);
      return;
    }
    ks.requestRealNameAuth({
      success: function () {
        _realNameVerified = true;
        if (onDone) onDone(true);
      },
      fail: function (err) {
        console.warn('[Compliance] 实名认证失败', err && err.errMsg);
        _realNameVerified = false;
        if (onDone) onDone(false);
      },
    });
  }

  function isRealNameVerified() {
    return _realNameVerified;
  }

  // ── 3. 防沉迷 ──────────────────────────────────────────────────────────────
  /**
   * 拉取防沉迷信息。仅记录状态，具体限制策略由平台侧统一拦截。
   * @param {Function} [onDone] - 回调，参数为防沉迷信息对象或 null
   */
  function getAntiAddictionInfo(onDone) {
    if (!_hasKs() || typeof ks.getAntiAddictionInfo !== 'function') {
      console.warn('[Compliance] 防沉迷接口不可用，跳过');
      if (onDone) onDone(null);
      return;
    }
    ks.getAntiAddictionInfo({
      success: function (res) {
        _antiAddiction = res || null;
        if (onDone) onDone(_antiAddiction);
      },
      fail: function (err) {
        console.warn('[Compliance] 防沉迷信息获取失败', err && err.errMsg);
        if (onDone) onDone(null);
      },
    });
  }

  function isMinor() {
    return !!(_antiAddiction && _antiAddiction.isMinor);
  }

  // ── 4. 客服入口 ────────────────────────────────────────────────────────────
  function openCustomerServicePage() {
    if (_hasKs() && typeof ks.openCustomerServicePage === 'function') {
      ks.openCustomerServicePage({
        fail: function (err) {
          console.warn('[Compliance] 客服页面打开失败', err && err.errMsg);
        },
      });
      return;
    }
    console.warn('[Compliance] 非快手环境，跳过客服入口');
  }

  // ── 统一初始化（由 main.js 在登录后调用一次） ───────────────────────────────
  function init() {
    requestRealNameAuth();
    getAntiAddictionInfo();
  }

  M3.Compliance = {
    init:                     init,
    PRIVACY_POLICY_URL:       PRIVACY_POLICY_URL,
    getPrivacyPolicyUrl:      getPrivacyPolicyUrl,
    openPrivacyPolicy:        openPrivacyPolicy,
    requestRealNameAuth:      requestRealNameAuth,
    isRealNameVerified:       isRealNameVerified,
    getAntiAddictionInfo:     getAntiAddictionInfo,
    isMinor:                  isMinor,
    openCustomerServicePage:  openCustomerServicePage,
  };
})();
