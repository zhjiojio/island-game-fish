(function () {
  'use strict';
  var M3 = window.M3 = window.M3 || {};

  // ============================================================
  // IAP — 极简版
  // ------------------------------------------------------------
  // 职责：
  //   1. buy(skuId)  → HTTP 建单 → KwaiPayment.requestPayment → HTTP 上报结果 → syncDiamond
  //   2. exchange    → HTTP 建单 → 轮询直到 FULFILLED / REJECTED
  //   3. syncWallet  → HTTP 查余额 → DiamondWallet.apply
  //
  // 删除：本地 pending 队列、KwaiStorage 持久化、轮询补单、stash 逻辑
  // 保留：exchange 流程（scene-diamond-exchange 在用）、getState() 兼容接口
  // ============================================================

  var EXCHANGE_KEY_PREFIX = 'ddz_iap_exchange_v2:';
  // 意图超过 10 分钟无进展视为陈旧：无 orderId（服务端从未受理）的陈旧意图
  // 直接丢弃，否则会永久卡死新的兑换请求（exchange() 见 state.exchange 即拒）
  var EXCHANGE_STALE_MS = 10 * 60 * 1000;

  var state = {
    accountId: '', epoch: 0, authed: false, paymentEnabled: false,
    flow: 'IDLE',        // IDLE | CATALOG_LOADING | READY | CREATING_ORDER | REQUESTING_PAYMENT | CONFIRMING_RESULT | FULFILLED | USER_CANCELLED | PAYMENT_FAILED | SERVICE_ERROR
    catalog: [], exchangeCatalog: [],
    active: null,        // 当前进行中的购买任务（同时只允许一笔）
    exchange: null,
    exchangeStatus: 'IDLE', exchangeError: '',
    error: '',
  };

  var exchangeTimer = 0;
  var exchangeQueryBusy = false;
  var _orderCreating = false;  // createIapOrder HTTP 请求飞出到响应回来期间为 true，防止重复建单
  var _pendingExchangeSkuId = '';  // 充值后自动兑换的 exchangeSkuId
  var _pendingExchangeQty   = 1;   // 充值后自动兑换的数量
  var _exchangeDoneHook     = null;  // 兑换到账（含到账弹窗关闭）后的一次性回调

  // ---- 工具 ----
  function now () { return Date.now(); }
  function uuid () {
    var bytes = [], i;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var raw = new Uint8Array(16); crypto.getRandomValues(raw);
      for (i = 0; i < raw.length; i++) bytes.push(raw[i]);
    } else {
      for (i = 0; i < 16; i++) bytes.push(Math.floor(Math.random() * 256));
    }
    bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
    function hex (n) { return (n + 256).toString(16).slice(1); }
    var s = ''; for (i = 0; i < 16; i++) s += hex(bytes[i]);
    return s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
  }
  function identity () { return M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null; }
  function paymentPlatform () { return typeof KwaiPayment !== 'undefined' ? KwaiPayment.getPlatform() : ''; }
  function canUsePayment () {
    var id = identity();
    return !!(state.authed && state.paymentEnabled && id && id.loginType === 'kwai' &&
      id.accountId === state.accountId && typeof KwaiPayment !== 'undefined' && KwaiPayment.isAvailable() && paymentPlatform());
  }
  function capture () { return { accountId: state.accountId, epoch: state.epoch }; }
  function same (cap) { return !!cap && cap.accountId === state.accountId && cap.epoch === state.epoch; }

  // ---- HTTP 请求（走 M3.IapHttp，iap-http.js 提供）----
  function send (type, data, cb) {
    if (!M3.IapHttp || !M3.IapHttp.request) {
      if (cb) cb({ code: 'PAYMENT_HTTP_UNAVAILABLE', message: '支付 HTTP 客户端不可用' }, null);
      return;
    }
    var cap = capture();
    M3.IapHttp.request(type, data || {}).then(function (result) {
      if (cb && same(cap)) cb(null, result || {});
    }, function (err) {
      if (!same(cap)) return;
      var error = {
        code: err && err.code || 'SERVICE_ERROR', message: String(err && err.message || '服务暂不可用'),
        exchangeOrderId: String(err && err.exchangeOrderId || '')
      };
      if (cb) cb(error, null);
    });
  }

  // ---- 钻石余额同步 ----
  // 同一 capture 的余额请求在途时去抖：authOk 链上 bindAccount 与 main.js 的
  // authOk handler 会在同一 tick 各调一次 syncDiamond，此前每次认证都打 3 次
  // balance HTTP（bindAccount 内还连调两次），重连风暴下连环 429（ACCOUNT_RATE_LIMITED）。
  var _balanceInFlight = null;
  function syncDiamond () {
    // 只要已认证就同步；mock 模式下服务端对非快手用户同样返回余额
    if (!state.authed) {
      console.log('[IAP] syncDiamond skip: not authed');
      return;
    }
    var cap = capture();
    if (_balanceInFlight && same(_balanceInFlight)) return;
    _balanceInFlight = cap;
    M3.DiamondWallet.setSyncing(true, state.accountId, state.epoch);
    send('getPlatformCoinBalance', { os: paymentPlatform() }, function (err, data) {
      if (_balanceInFlight === cap) _balanceInFlight = null;
      if (err) {
        console.warn('[IAP] getPlatformCoinBalance err:', err.code, err.message);
        M3.DiamondWallet.setError(err.message, state.accountId, state.epoch);
      } else {
        console.log('[IAP] getPlatformCoinBalance ok:', data && data.balance);
        M3.DiamondWallet.apply(data, state.accountId, state.epoch);
      }
    });
  }

  // ---- exchange 持久化（跨进程恢复未完成兑换）----
  function exchangeKey (accountId) { return EXCHANGE_KEY_PREFIX + accountId; }
  function rawStorageGet (storageKey) {
    try {
      var value = typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync ? KwaiStorage.getSync(storageKey)
        : (typeof localStorage !== 'undefined' ? localStorage.getItem(storageKey) : '');
      if (typeof value === 'string') value = value ? JSON.parse(value) : null;
      return value;
    } catch (e) { return null; }
  }
  function rawStoragePut (storageKey, value) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.setSync) KwaiStorage.setSync(storageKey, value);
      else if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, JSON.stringify(value));
    } catch (e) { }
  }
  function rawStorageRemove (storageKey) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.removeSync) KwaiStorage.removeSync(storageKey);
      else if (typeof localStorage !== 'undefined') localStorage.removeItem(storageKey);
    } catch (e) { }
  }
  function persistExchange () {
    if (!state.accountId || !state.exchange) return false;
    try {
      rawStoragePut(exchangeKey(state.accountId), {
        clientRequestId: state.exchange.clientRequestId,
        exchangeOrderId: state.exchange.exchangeOrderId || '',
        exchangeSkuId: state.exchange.exchangeSkuId,
        qty: state.exchange.qty || 1,
        createdAt: state.exchange.createdAt || now(),
      });
      return true;
    } catch (e) { return false; }
  }
  function clearExchangeIntent (accountId) {
    try { rawStorageRemove(exchangeKey(accountId)); } catch (e) { }
  }
  function restoreExchange (accountId) {
    try {
      var value = rawStorageGet(exchangeKey(accountId));
      if (!value || !value.clientRequestId || !value.exchangeSkuId) return null;
      return {
        clientRequestId: String(value.clientRequestId), exchangeOrderId: String(value.exchangeOrderId || ''),
        exchangeSkuId: String(value.exchangeSkuId), qty: Math.max(1, Number(value.qty) || 1),
        createdAt: Number(value.createdAt) || now(), capture: capture(), applied: false
      };
    } catch (e) { return null; }
  }

  // ---- IAP 未完成订单复用（防取消堆积 PENDING）----
  // 背景：快手支付取消无服务端回调，用户「点购买→取消」每轮留 1 笔 PENDING；
  // 服务端每账号 PENDING 上限 3 笔，连取消 3 次后创建被 409 拒绝（锁 15 分钟）。
  // 对策：按 accountId+skuId 缓存未完成订单的 requestId，再次购买同商品时复用
  // ——服务端幂等直接返回同一笔订单继续拉起支付，反复取消始终只占 1 个名额。
  // 支付成功清缓存；TTL 30 分钟（服务端 PENDING 15 分钟转 STALE 后 notify 仍受理，
  // STALE 单可继续支付，窗口留余量）；平台（os）不一致不安全复用。
  var IAP_RETRY_KEY_PREFIX = 'ddz_iap_retry_';
  var IAP_RETRY_TTL_MS = 30 * 60 * 1000;
  function iapRetryKey (accountId, skuId) { return IAP_RETRY_KEY_PREFIX + accountId + '_' + skuId; }
  function saveIapRetry (task) {
    if (!task || !task.requestId || !task.skuId || !task.capture || !task.capture.accountId) return;
    try {
      rawStoragePut(iapRetryKey(task.capture.accountId, task.skuId), {
        requestId: String(task.requestId), skuId: String(task.skuId),
        os: String(task.os || ''), createdAt: now(),
      });
    } catch (e) { }
  }
  function loadIapRetry (accountId, skuId, os) {
    if (!accountId || !skuId) return null;
    try {
      var v = rawStorageGet(iapRetryKey(accountId, skuId));
      if (!v || !v.requestId) return null;
      if (now() - (Number(v.createdAt) || 0) > IAP_RETRY_TTL_MS) {
        rawStorageRemove(iapRetryKey(accountId, skuId));
        return null;
      }
      if (String(v.os || '') !== String(os || '')) return null;
      return { requestId: String(v.requestId) };
    } catch (e) { return null; }
  }
  function clearIapRetry (task) {
    if (!task || !task.capture || !task.capture.accountId || !task.skuId) return;
    try { rawStorageRemove(iapRetryKey(task.capture.accountId, task.skuId)); } catch (e) { }
  }

  // ---- exchange 业务逻辑 ----
  function finishExchange (task, data) {
    if (!same(task.capture) || state.exchange !== task || task.applied) return;
    task.applied = true;
    clearTimeout(exchangeTimer); clearExchangeIntent(task.capture.accountId); state.exchange = null;
    state.exchangeStatus = 'FULFILLED'; state.exchangeError = '';
    // 兼容服务端字段 grantedBeans / beansGranted
    var beans = Number(data.grantedBeans || data.beansGranted || 0);
    // 到账后置钩子（豆子不足弹窗用于自动进场）：只在到账弹窗关闭后触发一次
    var doneHook = _exchangeDoneHook; _exchangeDoneHook = null;
    if (beans > 0 && M3.SceneBeanReward && M3.SceneBeanReward.show) {
      M3.SceneBeanReward.show(beans, doneHook);
    } else if (beans > 0 && M3.Game && M3.Game.applyBeanReward) {
      M3.Game.applyBeanReward(beans);
      if (doneHook) doneHook();
    } else if (doneHook) {
      doneHook();
    }
    syncDiamond();
    if (M3.Game && M3.Game.syncWallet) M3.Game.syncWallet();
  }
  function rejectExchange (task, data) {
    if (!same(task.capture) || state.exchange !== task) return;
    clearTimeout(exchangeTimer); clearExchangeIntent(task.capture.accountId); state.exchange = null;
    state.exchangeStatus = 'REJECTED'; state.exchangeError = String(data && (data.message || data.reason) || '兑换未成功');
    _exchangeDoneHook = null;   // 兑换失败不自动进场
  }
  function scheduleExchangePoll (task, delay) {
    clearTimeout(exchangeTimer);
    exchangeTimer = setTimeout(function () { if (same(task.capture) && state.exchange === task) queryExchange(task); }, delay || 0);
  }
  function handleExchangeResult (task, data) {
    if (!same(task.capture) || state.exchange !== task) return;
    var status = String(data && data.status || 'PENDING');
    if (status === 'FULFILLED') { finishExchange(task, data || {}); return; }
    if (status === 'DEBIT_REJECTED' || status === 'REJECTED') { rejectExchange(task, data || {}); return; }
    if (status === 'DEBIT_UNKNOWN') {
      state.exchangeStatus = 'DEBIT_UNKNOWN';
      state.exchangeError = '扣款结果确认中，将继续查询原订单';
    } else if (status === 'REVIEW') {
      state.exchangeStatus = 'REVIEW';
      state.exchangeError = '兑换结果需人工确认，请勿重复操作';
      return;
    } else {
      state.exchangeStatus = 'PENDING'; state.exchangeError = '';
    }
    scheduleExchangePoll(task, status === 'DEBIT_UNKNOWN' ? 5000 : 2000);
  }
  function queryExchange (task) {
    if (!task || !task.exchangeOrderId || !same(task.capture) || state.exchange !== task || exchangeQueryBusy) return false;
    exchangeQueryBusy = true;
    send('getPlatformCoinExchange', { exchangeOrderId: task.exchangeOrderId }, function (err, data) {
      exchangeQueryBusy = false;
      if (!same(task.capture) || state.exchange !== task) return;
      if (err) { state.exchangeStatus = 'RETRY_REQUIRED'; state.exchangeError = err.message || '兑换结果未确认，请查询原订单'; return; }
      handleExchangeResult(task, data);
    });
    return true;
  }
  function requestExchange (task) {
    if (!task || !same(task.capture) || task.exchangeOrderId) return false;
    state.exchangeStatus = 'CREATING'; state.exchangeError = '';
    var os = typeof KwaiPayment !== 'undefined' ? KwaiPayment.getPlatform() : '';
    send('createPlatformCoinExchange', { clientRequestId: task.clientRequestId, exchangeSkuId: task.exchangeSkuId, qty: task.qty || 1, os: os }, function (err, data) {
      if (!same(task.capture) || state.exchange !== task) return;
      clearTimeout(exchangeTimer);
      if (err) {
        if (err.code === 'EXCHANGE_PENDING' && err.exchangeOrderId) {
          task.exchangeOrderId = err.exchangeOrderId;
          if (!persistExchange()) { state.exchangeStatus = 'RETRY_REQUIRED'; return; }
          state.exchangeStatus = 'ACCEPTED'; state.exchangeError = '发现未完成兑换，正在查询原订单';
          scheduleExchangePoll(task, 0); return;
        }
        // 余额不足：弹充值引导弹窗，充值到账后自动兑换
        if (err.code === 'INSUFFICIENT_PLATFORM_BALANCE') {
          // 清除本次兑换意图（充值后会重新发起）
          clearTimeout(exchangeTimer); clearExchangeIntent(task.capture.accountId);
          state.exchange = null; state.exchangeStatus = 'IDLE'; state.exchangeError = '';
          syncDiamond();
          // 挂起自动兑换意图，充值成功后（_onServerIapConfirmed）触发
          _pendingExchangeSkuId = task.exchangeSkuId;
          _pendingExchangeQty   = task.qty || 1;
          // 弹钻石不足弹窗
          if (M3.SceneInsufficientDiamondPopup) {
            var dw = M3.DiamondWallet && M3.DiamondWallet.getState ? M3.DiamondWallet.getState() : { balance: '0' };
            var bal = Number(dw.balance) || 0;
            var totalCost = (Number(task.qty) || 1) * (Number(
              (function () {
                var c = M3.Iap && M3.Iap.getState ? M3.Iap.getState().exchangeCatalog : [];
                for (var ci = 0; ci < c.length; ci++) if (c[ci].exchangeSkuId === task.exchangeSkuId) return c[ci].costBalance;
                return 0;
              })()
            ) || 0);
            var deficit = Math.max(1, totalCost - bal);
            var catalog = M3.Iap && M3.Iap.getState ? M3.Iap.getState().catalog : [];
            var bestSku = null; var bestDiff = Infinity;
            for (var si = 0; si < catalog.length; si++) {
              var d = Math.abs(Number(catalog[si].diamonds || 0) - deficit);
              if (d < bestDiff) { bestDiff = d; bestSku = catalog[si]; }
            }
            var exItem = null;
            var exCatalog = M3.Iap.getState().exchangeCatalog;
            for (var ei = 0; ei < exCatalog.length; ei++) if (exCatalog[ei].exchangeSkuId === task.exchangeSkuId) { exItem = exCatalog[ei]; break; }
            M3.SceneInsufficientDiamondPopup.show({ deficit: deficit, iapSku: bestSku, exchangeItem: exItem });
          }
          return;
        }
        state.exchangeStatus = 'RETRY_REQUIRED'; state.exchangeError = err.message || '兑换受理失败，请重试原请求'; return;
      }
      task.exchangeOrderId = String(data.exchangeOrderId || '');
      if (!task.exchangeOrderId) { state.exchangeStatus = 'RETRY_REQUIRED'; state.exchangeError = '兑换订单受理异常，请重试原请求'; return; }
      if (!persistExchange()) { state.exchangeStatus = 'RETRY_REQUIRED'; return; }
      // POST 直接返回 FULFILLED（mock 模式同步完成），无需再轮询
      if (String(data.status || '') === 'FULFILLED') { handleExchangeResult(task, data); return; }
      state.exchangeStatus = 'ACCEPTED'; state.exchangeError = '';
      scheduleExchangePoll(task, 0);
    });
    clearTimeout(exchangeTimer);
    exchangeTimer = setTimeout(function () {
      if (same(task.capture) && state.exchange === task && !task.exchangeOrderId) {
        state.exchangeStatus = 'RETRY_REQUIRED'; state.exchangeError = '兑换受理未确认，请重试原请求';
      }
    }, 10000);
    return true;
  }

  // ---- 账号绑定 / 重置 ----
  function bindAccount (data) {
    var accountId = String(data && data.accountId || '');
    if (!accountId) return;
    var paymentEnabled = data && data.loginType === 'kwai';
    var changed = accountId !== state.accountId || paymentEnabled !== state.paymentEnabled;
    if (changed) {
      clearTimeout(exchangeTimer); exchangeQueryBusy = false; _orderCreating = false;
      state.epoch++;
      state.accountId = accountId; state.paymentEnabled = paymentEnabled;
      state.active = null;
      state.exchange = null; state.exchangeStatus = 'IDLE'; state.exchangeError = '';
      state.flow = 'IDLE'; state.catalog = []; state.exchangeCatalog = []; state.error = '';
      M3.DiamondWallet.resetForAccount(accountId, state.epoch);
      // 兑换恢复不依赖 paymentEnabled：纯 HTTP 流程，Web/guest 也可查询原订单
      state.exchange = restoreExchange(accountId);
      // 无 orderId（未受理）且陈旧的意图：直接丢弃，避免永久卡死新兑换
      if (state.exchange && !state.exchange.exchangeOrderId &&
          (!state.exchange.createdAt || now() - state.exchange.createdAt > EXCHANGE_STALE_MS)) {
        clearExchangeIntent(accountId);
        state.exchange = null;
      }
      if (state.exchange) {
        state.exchange.capture = capture();
        state.exchangeStatus = state.exchange.exchangeOrderId ? 'ACCEPTED' : 'RETRY_REQUIRED';
        state.exchangeError = state.exchange.exchangeOrderId ? '发现未完成兑换，正在查询原订单' : '发现未受理兑换，请重试原请求';
      }
    }
    state.authed = true;
    // mock 模式下无论 paymentEnabled 是否开启，都同步钻石余额
    syncDiamond();
    // 目录预热：豆子不足弹窗 / 商城在主页即可能用到，不能等打开商城才加载
    //（充值档 loadCatalog 此前只在豆不足弹窗与商城局部操作时才被调，
    //  刷新后停在主页时 catalog 恒空，商城钻石 tab 显示「暂无可购买商品」）
    if (M3.Iap && M3.Iap.loadExchangeCatalog) M3.Iap.loadExchangeCatalog();
    if (M3.Iap && M3.Iap.loadCatalog) M3.Iap.loadCatalog();
    // 兑换轮询恢复同样不依赖 paymentEnabled（纯 HTTP）
    if (state.exchange) {
      state.exchange.capture = capture();
      if (state.exchange.exchangeOrderId) {
        state.exchangeStatus = 'ACCEPTED'; state.exchangeError = '发现未完成兑换，正在查询原订单';
        scheduleExchangePoll(state.exchange, 0);
      } else {
        state.exchangeStatus = 'RETRY_REQUIRED'; state.exchangeError = '发现未受理兑换，请重试原请求';
      }
    }
    // 此前这里 paymentEnabled 分支还紧挨着再调一次 syncDiamond()——与上面
    // 无条件那次完全重复（syncDiamond 已有在途去抖），已删除。
  }
  function resetAuth () {
    state.epoch++; state.authed = false; state.paymentEnabled = false;
    state.active = null; state.exchange = null; state.exchangeStatus = 'IDLE'; state.exchangeError = '';
    state.catalog = []; state.exchangeCatalog = []; state.flow = 'IDLE'; state.error = '';
    clearTimeout(exchangeTimer); exchangeQueryBusy = false; _orderCreating = false;
    M3.DiamondWallet.resetForAccount(state.accountId, state.epoch);
  }

  // ---- 公开接口 ----
  M3.Iap = {
    getState: function () {
      return {
        accountId: state.accountId, epoch: state.epoch, flow: state.flow,
        catalog: state.catalog.slice(), exchangeCatalog: state.exchangeCatalog.slice(),
        active: state.active, pending: [],  // pending 保留字段兼容旧代码，始终为空
        exchangePending: !!state.exchange, exchangeStatus: state.exchangeStatus,
        exchangeError: state.exchangeError, error: state.error, storageError: false,
      };
    },
    newId: uuid,

    loadCatalog: function () {
      if (!state.authed) return false;
      state.flow = 'CATALOG_LOADING';
      var os = paymentPlatform() || 'android';
      send('getIapCatalog', { os: os }, function (err, data) {
        if (err) { state.flow = canUsePayment() ? 'SERVICE_ERROR' : 'IDLE'; return; }
        state.catalog = (data.items || []).slice();
        state.flow = canUsePayment() ? 'READY' : 'IDLE';
      });
      return true;
    },

    // ---- 核心购买流程 ----
    // 1. HTTP createIapOrder（幂等，服务端建单并返回 paymentParams + orderId）
    // 2. KwaiPayment.requestPayment（调起平台支付）
    // 3. HTTP reportIapClientResult（上报 success/cancel/fail）
    // 4. success 时 syncDiamond
    buy: function (skuId) {
      var os = paymentPlatform();
      if (state.active || _orderCreating) return false;

      // ── 非快手平台（Web/Mock 模式）：直通购买，服务端直接加钻石 ──
      if (!canUsePayment()) {
        if (!state.authed) return false;
        var product = null, i;
        for (i = 0; i < state.catalog.length; i++) if (state.catalog[i].skuId === skuId) product = state.catalog[i];
        if (!product) return false;
        var mockTask = { requestId: uuid(), skuId: skuId, os: 'mock', orderId: '', capture: capture() };
        state.active = mockTask; state.flow = 'CREATING_ORDER';
        _orderCreating = true;
        send('mockBuyIapOrder', { requestId: mockTask.requestId, skuId: mockTask.skuId }, function (err, data) {
          _orderCreating = false;
          if (!same(mockTask.capture) || state.active !== mockTask) return;
          if (err) {
            console.error('[IAP][mock] mockBuyIapOrder err:', err.code, err.message);
            state.active = null; state.flow = 'SERVICE_ERROR'; return;
          }
          console.log('[IAP][mock] direct buy fulfilled, diamonds=' + (data && data.diamondsGranted));
          state.active = null; state.flow = 'FULFILLED';
          // 模拟 iapConfirmed，走与快手端相同的后续逻辑（syncDiamond + 自动兑换）
          if (M3.Iap && M3.Iap._onServerIapConfirmed) {
            M3.Iap._onServerIapConfirmed({ orderId: data && data.orderId || '', diamondsGranted: data && data.diamondsGranted || '0' });
          }
        });
        return true;
      }

      // ── 快手平台：正常支付流程 ──
      var product2 = null, j;
      for (j = 0; j < state.catalog.length; j++) if (state.catalog[j].skuId === skuId) product2 = state.catalog[j];
      if (!product2 || !product2.platforms || product2.platforms.indexOf(os) < 0) return false;

      // 复用未完成的同商品订单：取消支付后再点同商品继续支付原单，
      // 不新增 PENDING（服务端每账号上限 3 笔，防取消堆积触发 409）
      var reuse = state.accountId ? loadIapRetry(state.accountId, skuId, os) : null;
      var task = { requestId: (reuse && reuse.requestId) || uuid(), skuId: skuId, os: os, orderId: '', capture: capture() };
      state.active = task; state.flow = 'CREATING_ORDER';
      _orderCreating = true;

      send('createIapOrder', { requestId: task.requestId, skuId: task.skuId, os: task.os }, function (err, data) {
        _orderCreating = false;
        if (!same(task.capture) || state.active !== task) return;
        if (err) {
          console.error('[IAP] createIapOrder err:', err.code, err.message);
          state.active = null;
          if (err.code === 'TOO_MANY_PENDING_ORDERS') {
            // 专项提示：用户被未支付订单数限制（多为反复取消堆积），静默失败用户无法理解
            state.flow = 'TOO_MANY_PENDING';
            state.error = '支付取消次数过多，请约 15 分钟后再试';
            if (M3.Game && M3.Game.flash) M3.Game.flash(state.error);
            return;
          }
          state.flow = 'SERVICE_ERROR';
          return;
        }

        task.orderId = String(data.orderId || '');
        var paymentParams = data.paymentParams;
        console.log('[IAP] createIapOrder ok orderId=' + task.orderId + ' paymentParams=' + (paymentParams ? JSON.stringify(paymentParams) : 'null'));
        if (!paymentParams) { state.active = null; state.flow = 'SERVICE_ERROR'; return; }

        state.flow = 'REQUESTING_PAYMENT';
        saveIapRetry(task);   // 记录/滚动复用窗口（幂等命中返回原单同样走到这里）
        console.log('[IAP] calling KwaiPayment.requestPayment');
        KwaiPayment.requestPayment(paymentParams).then(function (result) {
          onPaymentResult(task, result);
        }, function (e) {
          onPaymentResult(task, { outcome: 'unknown', code: 'PROMISE_REJECTED', message: e && e.message });
        });
      });
      return true;
    },

    syncWallet: syncDiamond,

    loadExchangeCatalog: function () {
      if (!state.authed) return false;
      state.error = '';
      send('getPlatformCoinExchangeCatalog', {}, function (err, data) {
        if (err) { state.error = err.message || '兑换商品加载失败'; return; }
        state.exchangeCatalog = (data && data.items || []).slice();
      });
      return true;
    },

    exchange: function (exchangeSkuId, qty) {
      // 兑换是纯 HTTP 流程（建单→轮询），不依赖 KwaiPayment，Web 同样可用
      // 陈旧的未受理任务（无 orderId 超 10 分钟）自动清理，避免永久卡死新兑换
      if (state.exchange && !state.exchange.exchangeOrderId &&
          (!state.exchange.createdAt || now() - state.exchange.createdAt > EXCHANGE_STALE_MS)) {
        var staleAcc = state.exchange.capture ? state.exchange.capture.accountId : state.accountId;
        clearTimeout(exchangeTimer);
        clearExchangeIntent(staleAcc);
        state.exchange = null; state.exchangeStatus = 'IDLE'; state.exchangeError = '';
      }
      if (state.exchange || !state.authed) return false;
      var quantity = Math.max(1, Math.floor(Number(qty) || 1));
      var task = {
        clientRequestId: uuid(), exchangeOrderId: '', exchangeSkuId: String(exchangeSkuId || ''),
        qty: quantity, createdAt: now(), capture: capture(), applied: false
      };
      state.exchange = task; state.exchangeStatus = 'CREATING'; state.exchangeError = '';
      if (!persistExchange()) { state.exchange = null; state.exchangeStatus = 'IDLE'; return false; }
      return requestExchange(task);
    },

    // 兼容旧 scene-diamond-store 调用：原有补单/重试逻辑已移除，改为重新同步余额
    recover: function () { if (state.authed) syncDiamond(); },
    retryCreate: function () { return false; },
    refresh: function () { if (state.authed) { state.error = ''; syncDiamond(); } },

    retryExchange: function () {
      if (!state.exchange || !state.authed || state.exchangeStatus !== 'RETRY_REQUIRED') return false;
      // 陈旧的未受理任务不允许 retry（重复发送有重复扣款风险），重新点兑换会自动清理
      if (!state.exchange.exchangeOrderId &&
          (!state.exchange.createdAt || now() - state.exchange.createdAt > EXCHANGE_STALE_MS)) return false;
      state.exchange.capture = capture();
      if (!persistExchange()) return false;
      return state.exchange.exchangeOrderId ? queryExchange(state.exchange) : requestExchange(state.exchange);
    },

    // 充值后自动兑换：在钻石不足弹窗点「立即充值」时设置
    // 充值后自动兑换：在钻石不足弹窗点「立即充值」时设置（qty 已由 INSUFFICIENT_PLATFORM_BALANCE 回调设好）
    _setPendingExchangeAfterBuy: function (exchangeSkuId, qty) {
      _pendingExchangeSkuId = String(exchangeSkuId || '');
      if (qty != null) _pendingExchangeQty = Math.max(1, Number(qty) || 1);
    },

    // 兑换到账后的一次性回调（豆子不足弹窗用于到账弹窗关闭后自动进场）
    _setExchangeDoneHook: function (fn) {
      _exchangeDoneHook = typeof fn === 'function' ? fn : null;
    },

    // 服务端确认快手充值到账（iapConfirmed socket 消息）
    _onServerIapConfirmed: function (data) {
      // 购买成功弹窗（仅无自动兑换挂起时弹；有挂起时 exchange 流程走完后另行处理）
      var granted = Number(data && data.diamondsGranted) || 0;
      if (granted > 0 && !_pendingExchangeSkuId) {
        if (M3.SceneBeanReward && M3.SceneBeanReward.show) {
          M3.SceneBeanReward.show(granted, null, 'diamond');
        }
      }
      // 余额刷新
      syncDiamond();
      // 触发挂起的自动兑换（带数量）
      if (_pendingExchangeSkuId) {
        var pendingSkuId = _pendingExchangeSkuId;
        var pendingQty   = _pendingExchangeQty || 1;
        _pendingExchangeSkuId = '';
        _pendingExchangeQty   = 1;
        setTimeout(function () {
          console.log('[IAP] auto-exchange after iapConfirmed, skuId=' + pendingSkuId + ' qty=' + pendingQty);
          if (M3.Iap && M3.Iap.exchange) M3.Iap.exchange(pendingSkuId, pendingQty);
        }, 300);
      }
    },

    // handleError：兼容 main.js 的 error 事件路由（HTTP 模式下通常不触发，保留兼容）
    handleError: function (data) {
      var command = data && data.commandType;
      var iapCommands = {
        createIapOrder: 1, reportIapClientResult: 1, getIapCatalog: 1,
        getPlatformCoinBalance: 1, getPlatformCoinExchangeCatalog: 1, createPlatformCoinExchange: 1, getPlatformCoinExchange: 1
      };
      if (!iapCommands[command]) return false;
      if ((command === 'createPlatformCoinExchange' || command === 'getPlatformCoinExchange') && state.exchange) {
        clearTimeout(exchangeTimer);
        state.exchangeStatus = 'RETRY_REQUIRED';
        state.exchangeError = String(data.message || (state.exchange.exchangeOrderId ? '兑换结果未确认，请查询原订单' : '兑换受理失败，请重试原请求'));
      }
      if (command === 'createIapOrder') state.flow = 'SERVICE_ERROR';
      return true;
    },

    detachCurrentAccount: function () {
      var old = state.accountId;
      if (M3.SceneDiamondExchange && M3.SceneDiamondExchange.hide) M3.SceneDiamondExchange.hide();
      if (M3.SceneDiamondStore && M3.SceneDiamondStore.hide) M3.SceneDiamondStore.hide();
      state.epoch++; state.authed = false; state.paymentEnabled = false; state.active = null; state.exchange = null;
      state.exchangeStatus = 'IDLE'; state.exchangeError = '';
      clearTimeout(exchangeTimer); exchangeQueryBusy = false; _orderCreating = false;
      state.accountId = ''; state.catalog = []; state.exchangeCatalog = []; state.flow = 'IDLE'; state.error = '';
      return old;
    },

    // bootstrap 桥接去重用：IAP 是否已绑定到该账号。
    // game.js 的 _applyBootstrapResponse 曾对每次 bootstrap 回包都触发一次
    // bindAccount（balance + exchange-products），与 WS authOk 的订阅重复，
    // 一次启动连环 3-5 次；已绑定同账号则由调用方跳过。
    isBoundTo: function (accountId) {
      return !!(state.authed && accountId && state.accountId === accountId);
    },

    // WebSocket authOk/authFail 路由（M3.Network.on 仍在 main.js 订阅）
    _handle: function (type, data) {
      if (type === 'authOk') bindAccount(data);
      else if (type === 'authFail') resetAuth();
    },
  };

  // ---- 支付结果处理（内部）----
  function onPaymentResult (task, result) {
    if (!same(task.capture) || state.active !== task) return;
    var outcome = result.outcome; // 'success' | 'cancel' | 'fail' | 'unknown'
    var code = String(result.code || outcome || 'UNKNOWN');
    var message = String(result.message || '').slice(0, 255);

    // 立即释放 active，让用户可以再次点击
    state.active = null;
    state.flow = outcome === 'success' ? 'CONFIRMING_RESULT'
      : outcome === 'cancel' ? 'USER_CANCELLED'
        : 'PAYMENT_FAILED';

    // 上报结果给服务端（fire-and-forget，失败不影响体验）
    if (task.orderId) {
      send('reportIapClientResult', { orderId: task.orderId, code: code, message: message });
    }

    if (outcome === 'success') {
      state.flow = 'FULFILLED';
      clearIapRetry(task);   // 已支付完成：清掉复用缓存，防止对已支付单重复拉起收银台
      syncDiamond();
      // 注意：自动兑换等服务端 iapConfirmed 推送后再触发（_onServerIapConfirmed）
      // 此处不触发，避免余额还未到账就发起兑换
    }
  }

  // ---- 挂载 authOk/authFail 监听 ----
  if (M3.Network && M3.Network.on) {
    M3.Network.on('authOk', function (data) { M3.Iap._handle('authOk', data || {}); });
    M3.Network.on('authFail', function (data) { M3.Iap._handle('authFail', data || {}); });
    var currentAuthData = M3.Network.getAuthData && M3.Network.getAuthData();
    if (currentAuthData) bindAccount(currentAuthData);
  }
})();
