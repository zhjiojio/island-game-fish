/**
 * kwai-network.js — 快手小游戏网络请求模块（支持 Web 降级）
 *
 * 快手环境：使用 ks.request / ks.downloadFile / ks.uploadFile / ks.connectSocket
 * Web 环境：使用原生 fetch API / WebSocket 降级
 *
 * 使用方式：
 *   KwaiNetwork.request({
 *     url:    'https://api.example.com/game/save',
 *     method: 'POST',
 *     data:   { level: 5, score: 1200 },
 *     header: { 'content-type': 'application/json' },
 *     onSuccess: function(res) { console.log(res.statusCode, res.data); },
 *     onFail:    function(err) { console.warn(err.errMsg); },
 *   });
 *
 *   // 下载文件
 *   KwaiNetwork.downloadFile({
 *     url:       'https://cdn.example.com/patch.zip',
 *     onSuccess: function(res) { console.log(res.tempFilePath); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // 上传文件
 *   KwaiNetwork.uploadFile({
 *     url:       'https://api.example.com/upload',
 *     filePath:  tempFilePath,  // Web 环境下可传 File / Blob 对象
 *     name:      'file',
 *     onSuccess: function(res) { console.log(res.data); },
 *     onFail:    function(err) {},
 *   });
 *
 *   // WebSocket 长连接（返回 SocketTask，两端 API 统一）
 *   var task = KwaiNetwork.connectSocket({
 *     url:       'wss://api.example.com/realtime',
 *     protocols: ['game-v1'],            // 可选
 *     header:    { Authorization: '…' }, // 可选，快手有效；Web 端忽略（浏览器不支持自定义 WS header）
 *     onOpen:    function(res) {
 *       task.send({ data: JSON.stringify({ type: 'login', openId: '…' }) });
 *     },
 *     onMessage: function(res) { console.log(res.data); },
 *     onClose:   function(res) { console.log(res.code, res.reason); },
 *     onError:   function(res) { console.warn(res.errMsg); },
 *   });
 *
 *   // 发送消息（onOpen 触发后才能调用）
 *   task.send({ data: JSON.stringify({ type: 'ping' }) });
 *
 *   // 关闭连接
 *   task.close({ code: 1000, reason: 'game over' });
 *
 * WebSocket 注意事项：
 *   - 快手环境：url 域名须加入后台「socket 合法域名」白名单（与 request 独立）
 *   - 快手环境：最多同时存在 5 个 WebSocket 连接，用完务必 close()
 *   - Web 环境：浏览器原生 WebSocket 不支持自定义 header，header 参数会被忽略
 *   - 两端均推荐在 onClose 里实现指数退避重连（非 code 1000 时触发）
 */

(function () {

  var _isKwai = typeof ks !== 'undefined';

  // ─── request ──────────────────────────────────────────────

  function request(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (_isKwai) {
      return ks.request({
        url:          options.url,
        data:         options.data    || {},
        header:       options.header  || { 'content-type': 'application/json' },
        method:       options.method  || 'GET',
        dataType:     options.dataType     || 'json',
        responseType: options.responseType || 'text',
        timeout:      options.timeout      || 10000,
        success: function (res) {
          console.log('[KwaiNetwork]', options.method || 'GET', options.url, res.statusCode);
          onSuccess(res);
        },
        fail: function (err) {
          console.warn('[KwaiNetwork] 请求失败', options.url, err.errMsg);
          onFail(err);
        },
      });
    }

    // Web 降级：fetch
    var method = (options.method || 'GET').toUpperCase();
    var body = undefined;
    if (method !== 'GET' && method !== 'HEAD') {
      body = (typeof options.data === 'string')
        ? options.data
        : JSON.stringify(options.data || {});
    }
    fetch(options.url, {
      method:  method,
      headers: options.header || { 'content-type': 'application/json' },
      body:    body,
      signal:  options.signal || undefined,
    }).then(function (res) {
      var statusCode = res.status;
      var clone = res.clone();
      return clone.text().then(function (text) {
        var data = text;
        try { data = JSON.parse(text); } catch (e) { }
        console.log('[KwaiNetwork]', method, options.url, statusCode);
        onSuccess({ statusCode: statusCode, data: data, header: {} });
      });
    }).catch(function (err) {
      console.warn('[KwaiNetwork] 请求失败', options.url, err.message);
      onFail({ errMsg: err.message || 'fetch failed' });
    });
  }

  // ─── downloadFile ─────────────────────────────────────────

  function downloadFile(options) {
    options = options || {};
    var onSuccess  = options.onSuccess  || function () {};
    var onFail     = options.onFail     || function () {};
    var onProgress = options.onProgress || null;

    if (_isKwai) {
      var task = ks.downloadFile({
        url:    options.url,
        header: options.header || {},
        success: function (res) {
          console.log('[KwaiNetwork] 下载完成', res.tempFilePath);
          onSuccess(res);
        },
        fail: function (err) {
          console.warn('[KwaiNetwork] 下载失败', options.url, err);
          onFail(err);
        },
      });
      if (onProgress && task) task.onProgressUpdate(onProgress);
      return task;
    }

    // Web 降级：fetch → Blob URL
    fetch(options.url, { headers: options.header || {} })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var tempFilePath = URL.createObjectURL(blob);
        console.log('[KwaiNetwork] 下载完成（Web）', tempFilePath);
        onSuccess({ tempFilePath: tempFilePath, statusCode: 200 });
      })
      .catch(function (err) {
        console.warn('[KwaiNetwork] 下载失败', options.url, err.message);
        onFail({ errMsg: err.message || 'download failed' });
      });
  }

  // ─── uploadFile ───────────────────────────────────────────

  function uploadFile(options) {
    options = options || {};
    var onSuccess = options.onSuccess || function () {};
    var onFail    = options.onFail    || function () {};

    if (_isKwai) {
      return ks.uploadFile({
        url:      options.url,
        filePath: options.filePath,
        name:     options.name || 'file',
        header:   options.header || {},
        formData: options.formData || {},
        success: function (res) {
          console.log('[KwaiNetwork] 上传完成', res.statusCode);
          onSuccess(res);
        },
        fail: function (err) {
          console.warn('[KwaiNetwork] 上传失败', options.url, err);
          onFail(err);
        },
      });
    }

    // Web 降级：FormData + fetch
    var formData = new FormData();
    formData.append(options.name || 'file', options.filePath);
    var extraForm = options.formData || {};
    Object.keys(extraForm).forEach(function (k) { formData.append(k, extraForm[k]); });

    fetch(options.url, {
      method:  'POST',
      headers: options.header || {},
      body:    formData,
    }).then(function (res) {
      return res.text().then(function (data) {
        console.log('[KwaiNetwork] 上传完成（Web）', res.status);
        onSuccess({ statusCode: res.status, data: data });
      });
    }).catch(function (err) {
      console.warn('[KwaiNetwork] 上传失败', options.url, err.message);
      onFail({ errMsg: err.message || 'upload failed' });
    });
  }

  function safeLogUrl (url) {
    return String(url || '');
  }

  // ─── connectSocket ────────────────────────────────────────
  //
  // 返回统一 SocketTask 对象：
  //   task.send({ data })
  //   task.close({ code, reason })
  //   task.onOpen(callback)     — 已在 options 里注册的可省略，也可事后再绑
  //   task.onMessage(callback)
  //   task.onClose(callback)
  //   task.onError(callback)
  //
  // 注意：快手侧同一个 task 只能注册一个 onXxx 监听器，重复调用会覆盖旧监听器。
  //       Web 侧行为相同（包装后与快手对齐）。

  var _socketMap = {}; // url → socketTask，防止重复 connect

  function connectSocket(options) {
    options = options || {};

    // 如果已有同 URL 的活跃 socket，直接复用
    var url = options.url || '';
    if (_socketMap[url] && _socketMap[url]._active) {
      return _socketMap[url];
    }

    var onOpen    = options.onOpen    || function () {};
    var onMessage = options.onMessage || function () {};
    var onClose   = options.onClose   || function () {};
    var onError   = options.onError   || function () {};

    if (_isKwai) {
      var ksTask = ks.connectSocket({
        url:        options.url,
        header:     options.header    || {},
        protocols:  options.protocols || [],
        tcpNoDelay: options.tcpNoDelay || false,
        timeout:    options.timeout   || undefined,
      });

      // 统一对外 API（直接透传底层 task）
      //
      // _detached / detach()：快手侧同一个 task 只能注册一个 onXxx 监听器，
      // 且平台没有真正的解绑接口 —— 业务层一旦重建连接，旧 task 的 close
      // 事件仍会迟到回调（曾表现为 reconnectForAuth 后旧连接 onClose 迟到
      // 数秒，把刚建好甚至已认证的新连接误杀，启动期反复「关闭 1000 →
      // 连接成功」风暴）。废弃连接时置 _detached=true，四个事件闭包统一
      // 先判此标志再分发，旧连接的事件不再进入业务状态机。
      var task = {
        _active: true,
        _detached: false,
        send:      function (opts) { ksTask.send(opts); },
        close:     function (opts) {
          // 只废弃自己拥有的 map 槽位：旧 task 迟到的 close 不得把
          // 新一代 task 的复用标记一并打掉（否则下次 connectSocket 会
          // 在已有活跃连接的情况下再建一条）。
          if (_socketMap[url] === task) _socketMap[url]._active = false;
          task._active = false;
          ksTask.close(opts || {});
        },
        // 真正意义的摘钩：此后该 task 的一切平台事件不再回调业务层
        detach:    function () {
          task._detached = true;
          task._active = false;
          if (_socketMap[url] === task) _socketMap[url] = null;
        },
        onOpen:    function (cb)   { ksTask.onOpen(cb); },
        onMessage: function (cb)   { ksTask.onMessage(cb); },
        onClose:   function (cb)   { ksTask.onClose(cb); },
        onError:   function (cb)   { ksTask.onError(cb); },
        _native:   ksTask,
      };

      ksTask.onOpen(function (res) {
        if (task._detached) return;
        console.log('[KwaiNetwork] WS 连接成功', safeLogUrl(options.url));
        onOpen(res);
      });
      ksTask.onMessage(function (res) { if (!task._detached) onMessage(res); });
      ksTask.onClose(function (res) {
        if (task._detached) return;
        console.log('[KwaiNetwork] WS 关闭', res.code, res.reason);
        onClose(res);
      });
      ksTask.onError(function (res) {
        if (task._detached) return;
        console.warn('[KwaiNetwork] WS 错误', res.errMsg);
        onError(res);
      });

      _socketMap[url] = task;
      return task;
    }

    // Web 降级：原生 WebSocket
    // 注意：浏览器 WebSocket 不支持自定义 header，header 参数被忽略
    var ws = options.protocols && options.protocols.length
      ? new WebSocket(options.url, options.protocols)
      : new WebSocket(options.url);

    // 内部监听器列表（支持 onXxx 动态覆盖）
    var _onOpen    = onOpen;
    var _onMessage = onMessage;
    var _onClose   = onClose;
    var _onError   = onError;

    // 与快手侧对齐：_detached 后一切平台事件不再回调业务层（见快手分支注释）
    var task = {
      _active: true,
      _detached: false,
      send: function (opts) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(opts.data);
          if (opts.success) opts.success();
        } else {
          var err = { errMsg: 'WebSocket not open, readyState: ' + ws.readyState };
          console.warn('[KwaiNetwork]', err.errMsg);
          if (opts.fail) opts.fail(err);
        }
      },
      close: function (opts) {
        opts = opts || {};
        if (_socketMap[url] === task) _socketMap[url]._active = false;
        task._active = false;
        try { ws.close(opts.code || 1000, opts.reason || ''); }
        catch (e) { /* 已关闭时 close 可能抛异常，忽略 */ }
        if (opts.success) opts.success();
      },
      detach: function () {
        task._detached = true;
        task._active = false;
        // 浏览器端可直接解绑原生监听
        try { ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null; } catch (e) {}
        if (_socketMap[url] === task) _socketMap[url] = null;
      },
      onOpen:    function (cb) { _onOpen    = cb; },
      onMessage: function (cb) { _onMessage = cb; },
      onClose:   function (cb) { _onClose   = cb; },
      onError:   function (cb) { _onError   = cb; },
      _native:   ws,
    };

    ws.onopen    = function (e)   {
      if (task._detached) return;
      console.log('[KwaiNetwork] WS 连接成功（Web）', safeLogUrl(options.url));
      _onOpen({ header: {} });
    };
    ws.onmessage = function (e)   { if (!task._detached) _onMessage({ data: e.data }); };
    ws.onclose   = function (e)   {
      if (task._detached) return;
      console.log('[KwaiNetwork] WS 关闭（Web）', e.code, e.reason);
      _onClose({ code: e.code, reason: e.reason });
    };
    ws.onerror   = function (e)   {
      if (task._detached) return;
      console.warn('[KwaiNetwork] WS 错误（Web）');
      _onError({ errMsg: 'WebSocket error' });
    };
    _socketMap[url] = task;
    return task;
  }

  window.KwaiNetwork = {
    request:       request,
    downloadFile:  downloadFile,
    uploadFile:    uploadFile,
    connectSocket: connectSocket,
  };

})();
