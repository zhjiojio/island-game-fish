(function () {
  var M3 = window.M3 = window.M3 || {};
  var C = M3.Config;

  // ---- WebSocket 联机客户端 ----
  var _ws = null;
  var _reconnectTimer = 0;
  var _reconnectAttempts = 0;
  var _lastName = '', _lastRoom = '', _lastAvatar = '', _lastOpenId = '', _lastAccountId = '', _lastRoomType = '';
  var _lastMatchRequestId = '', _lastJoinTicket = '';
  var _messageHandlers = {};
  var _pendingPayloads = [];
  var _status = 'disconnected'; // disconnected | connecting | connected
  var _authData = null;
  // 认证状态。服务端要求 auth 握手完成前不得发送任何业务消息，
  // 未认证期间业务包一律排队，authOk 到达后再统一 flush。
  var _authed = false;
  // 本次 auth 握手使用的身份类型，用于 authFail 时精确清除对应 token
  var _lastAuthIntentType = '';
  var _pingTimer = 0;
  var _pongTimeout = 0;
  var _intentionalClose = false;

  // 身份重绑自愈（服务端回 IDENTITY_REBIND_REQUIRED 时使用）。
  // _rebindPending 用于压制 _handleClose 里的自动重连：此刻 kwai token 刚被清掉，
  // 照常重连会以游客身份握手，用户看到的是游客钱包，比直接报错更糟。
  // 必须等重新 ks.login 完成后由 reconnectForAuth 主动重建连接。
  var _rebindPending = false;
  var _rebindRetry = 0;      // 单次会话内最多自愈 1 次，防止服务端持续拒绝时无限循环
  var _rebindTimer = 0;
  var REBIND_TIMEOUT_MS = 10000;
  // 重绑期间 _handleClose 不重连。若重建后的连接一直拿不到 authOk（连不上/服务端异常），
  // 没有这个看门狗就会永久卡在「既不重连也不报错」的状态。
  var REBIND_WATCHDOG_MS = 15000;

  function _startPing () {
    _stopPing();
    _pingTimer = setInterval(function () {
      if (_status !== 'connected') return;
      _wsSend({ type: 'ping' });
      _pongTimeout = setTimeout(function () {
        // 10s 没收到 pong，视为断开
        if (_status === 'connected') {
          _handleClose();
        }
      }, 10000);
    }, 30000);
  }

  function _stopPing () {
    if (_pingTimer) { clearInterval(_pingTimer); _pingTimer = 0; }
    if (_pongTimeout) { clearTimeout(_pongTimeout); _pongTimeout = 0; }
  }

  M3.Network = {
    getStatus: function () { return _status; },
    getAuthData: function () { return _authData; },

    ensureSocket: function (name) {
      if (_ws && (_status === 'connected' || _status === 'connecting')) return;
      _lastName = name;
      _intentionalClose = false;
      _doConnect(null);
    },

    // 拿到快手 code 后强制重建连接。
    // 服务端禁止单连接中途换号（正确的安全设计），因此若当前连接已以
    // 游客身份认证完成，光设置 pendingCode 不会生效——必须断开后重走 auth 握手。
    reconnectForAuth: function (name) {
      if (name) _lastName = name;
      _intentionalClose = false;
      _authed = false;
      _pendingPayloads = [];
      _stopPing();
      clearTimeout(_reconnectTimer);
      _reconnectAttempts = 0;
      if (_ws) {
        // 先摘钩再关闭。快手侧监听器注册在底层 ksTask 上且无法解绑，
        // 旧连接的 close 事件若仍回调 _handleClose，会把刚同步建好的
        // 新连接（甚至已认证完成的）误杀，再触发一轮重连+全量同步，
        // 表现为启动期反复「WS 关闭 1000 → WS 连接成功」风暴。
        var old = _ws;
        _ws = null;
        try {
          if (old.detach) old.detach();   // 统一封装：事件静默，不再进状态机
        } catch (e) {}
        try { old.close(); } catch (e) {}
      }
      _status = 'disconnected';
      _doConnect(null);
    },

    joinRoom: function (name, roomId, avatarUrl, openId, roomType, accountId, matchReservation) {
      _lastName = name;
      _lastRoom = roomId;
      _lastAvatar = avatarUrl || '';
      _lastOpenId = openId || '';
      _lastAccountId = accountId || _lastOpenId || _lastAccountId || '';
      _lastRoomType = roomType || _lastRoomType || '';
      if (matchReservation) {
        _lastMatchRequestId = matchReservation.matchRequestId || '';
        _lastJoinTicket = matchReservation.joinTicket || '';
      }
      _intentionalClose = false;
      var payload = { type: 'join', nickname: name, roomId: roomId, avatarUrl: _lastAvatar, openId: _lastOpenId, accountId: _lastAccountId };
      if (_lastRoomType) payload.roomType = _lastRoomType;
      if (_lastMatchRequestId) payload.matchRequestId = _lastMatchRequestId;
      if (_lastJoinTicket) payload.joinTicket = _lastJoinTicket;
      if (!_ws || _status !== 'connected') {
        _doConnect(payload);
      } else {
        _wsSend(payload);
      }
    },

    send: function (type, data) {
      var payload = { type: type };
      if (data) {
        var keys = Object.keys(data);
        for (var i = 0; i < keys.length; i++) {
          payload[keys[i]] = data[keys[i]];
        }
      }
      _wsSend(payload);
    },

    sendRaw: function (payload) {
      _wsSend(payload);
    },

    disconnect: function () {
      _intentionalClose = true;
      _stopPing();
      clearTimeout(_reconnectTimer);
      _lastName = ''; _lastRoom = ''; _lastAvatar = ''; _lastOpenId = ''; _lastAccountId = ''; _lastRoomType = '';
      _lastMatchRequestId = ''; _lastJoinTicket = '';
      _pendingPayloads = [];
      if (_ws) {
        // 主动断开同样先摘钩（detach）：退出登录后旧连接的事件
        // 不得再触发 _handleClose / 自动重连
        var old = _ws;
        _ws = null;
        try {
          if (old.detach) old.detach();
        } catch (e) {}
        try { old.close(); } catch (e) {}
      }
      _status = 'disconnected';
    },

    clearRoom: function () {
      _lastRoom = '';
      _lastRoomType = '';
      _lastMatchRequestId = '';
      _lastJoinTicket = '';
    },

    on: function (msgType, handler) {
      if (!_messageHandlers[msgType]) _messageHandlers[msgType] = [];
      _messageHandlers[msgType].push(handler);
    },

    off: function (msgType, handler) {
      var handlers = _messageHandlers[msgType];
      if (!handlers) return;
      var idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    },
  };

  function _flushPending () {
    if (!_ws || _status !== 'connected' || !_authed) return;
    var list = _pendingPayloads.splice(0, _pendingPayloads.length);
    for (var i = 0; i < list.length; i++) _wsSend(list[i]);
  }

  function _wsSend(payload) {
    // auth / ping 属于握手与保活，不受认证闸门限制；
    // 其余业务消息在 authOk 之前一律排队，避免被服务端以 1008 断连。
    if (_ws && _status === 'connected' && !_authed
        && payload.type !== 'auth' && payload.type !== 'ping') {
      M3.log('NET', 'send QUEUE (unauthed)', { type: payload.type });
      _pendingPayloads.push(payload);
      return;
    }
    if (!_ws || _status !== 'connected') {
      M3.log('NET', 'send QUEUE', { status: _status, type: payload.type });
      _pendingPayloads.push(payload);
      return;
    }
    M3.log('NET', 'send', payload);
    var raw = JSON.stringify(payload);
    try {
      if (typeof _ws.readyState === 'number') {
        _ws.send(raw);
      } else {
        _ws.send({ data: raw });
      }
    } catch (e) {
      M3.log('NET', 'send ERR', e.message);
    }
  }

  function _doConnect (payload) {
    _status = 'connecting';
    var serverUrl = C.SERVER_URL;

    if (typeof KwaiNetwork !== 'undefined' && KwaiNetwork.connectSocket) {
      _ws = KwaiNetwork.connectSocket({
        url: serverUrl,
        onOpen: function () {
          _onSocketOpen(payload);
        },
        onMessage: function (res) {
          try { _handleMessage(JSON.parse(res.data)); } catch (e) {}
        },
        onClose: function () {
          _handleClose();
        },
        onError: function () {
          _handleClose();
        },
      });
      // socketMap 复用时，只有底层 socket 已真正 OPEN 才手动补状态。
      // Web 降级的 task 创建后即 _active=true，但此时 readyState 仍可能是 CONNECTING，不能提前发送。
      var nativeReady = _ws && _ws._native && typeof _ws._native.readyState === 'number' ? _ws._native.readyState : null;
      if (_ws && _ws._active && _status !== 'connected' && nativeReady === 1) {
        _onSocketOpen(payload);
      }
    } else if (typeof WebSocket !== 'undefined') {
      _ws = new WebSocket(serverUrl);
      _ws.onopen = function () {
        _onSocketOpen(payload);
      };
      _ws.onmessage = function (e) {
        try { _handleMessage(JSON.parse(e.data)); } catch (err) {}
      };
      _ws.onclose = function () { _handleClose(); };
      _ws.onerror = function () { _handleClose(); };
    }
  }

  // 连接建立后的统一入口：必须先完成 auth 握手，再放行业务消息。
  // payload（如重连时的 join）不直接发送，而是入队等 authOk 后 flush。
  function _onSocketOpen (payload) {
    _status = 'connected';
    _authed = false;
    if (_reconnectAttempts > 0 && M3.Vibrate) M3.Vibrate.err();   // 重连成功：中×2（错误语义收尾）
    _reconnectAttempts = 0;
    _startPing();
    if (payload) _pendingPayloads.push(payload);
    if (M3.Auth && M3.Auth.buildAuthPayload) {
      var authPayload = M3.Auth.buildAuthPayload();
      // 记住本次使用的身份类型，以便 authFail 时只清对应的 token
      _lastAuthIntentType = authPayload.intent === 'guest' ? 'guest'
        : (authPayload.intent === 'kwai_login' ? '' : 'kwai');
      _wsSend(authPayload);
    }
  }

  function _handleMessage (msg) {
    // 心跳响应（不打日志避免刷屏）
    if (msg.type === 'pong') {
      if (_pongTimeout) { clearTimeout(_pongTimeout); _pongTimeout = 0; }
      return;
    }
    if (msg.type === 'joined') {
      _lastJoinTicket = '';
    }
    // 认证成功：记录身份、落库 token，并放行此前排队的业务消息
    if (msg.type === 'authOk') {
      _authed = true;
      _authData = msg.data || null;
      _rebindPending = false;
      clearTimeout(_rebindTimer);
      _rebindTimer = 0;
      if (msg.data && msg.data.loginType === 'kwai') _rebindRetry = 0;
      if (M3.Auth && M3.Auth.applyAuthResult) M3.Auth.applyAuthResult(msg.data);
      _flushPending();
    }
    // 认证失败：只清掉本次实际使用的那份 token，避免误删另一种身份的登录态
    if (msg.type === 'authFail') {
      _authed = false;
      _authData = null;
      _pendingPayloads = [];
      var failedType = (msg.data && msg.data.loginType) || _lastAuthIntentType;
      if (M3.Auth && M3.Auth.clearSession) M3.Auth.clearSession(failedType);
      // 服务端判定本地 token 对应的账号已缺支付绑定（后端清过数据）：
      // 光清 token 不够，接着的自动重连会以游客身份握手，用户直接掉进游客钱包。
      // 这里接管重连，先重新 ks.login 重建绑定。
      if (msg.data && msg.data.code === 'IDENTITY_REBIND_REQUIRED') {
        _startIdentityRebind();
      }
    }

    M3.log('NET', 'recv', msg);
    var handlers = _messageHandlers[msg.type];
    if (handlers) {
      for (var i = 0; i < handlers.length; i++) {
        // 单个 handler 抛异常不应中断同消息的其他 handler（曾表现为 authOk 后续逻辑静默丢失）
        try { handlers[i](msg.data); }
        catch (e) { console.error('[NET] handler error', msg.type, i, e); }
      }
    }
  }

  function _handleClose () {
    _status = 'disconnected';
    _authed = false;
    _authData = null;
    _stopPing();
    if (_ws) {
      try { _ws.close(); } catch (e) {}
      _ws = null;
    }

    // 主动断开不重连
    if (_intentionalClose) return;

    if (M3.Vibrate) M3.Vibrate.err();   // 网络断开：中×2（错误语义）

    // 身份重绑进行中：此刻 kwai token 已被清掉，按普通流程重连会以游客身份握手，
    // 用户会看到一份空钱包。重连一律由 _startIdentityRebind 接管。
    if (_rebindPending) return;

    _scheduleReconnect();
  }

  function _scheduleReconnect (delay) {
    clearTimeout(_reconnectTimer);
    if (typeof delay !== 'number') delay = Math.min(1000 * Math.pow(2, _reconnectAttempts), 15000);
    _reconnectAttempts++;
    _reconnectTimer = setTimeout(function () {
      if (!_lastName) return;
      // 如果在房间内，重连时发送 join 回到房间
      if (_lastRoom) {
        M3.Network.joinRoom(_lastName, _lastRoom, _lastAvatar, _lastOpenId, _lastRoomType, _lastAccountId, {
          matchRequestId: _lastMatchRequestId,
          joinTicket: _lastJoinTicket,
        });
      } else {
        M3.Network.ensureSocket(_lastName);
      }
    }, delay);
  }

  // 服务端回 IDENTITY_REBIND_REQUIRED：本地 token 仍有效，但它对应的账号在
  // 服务端已失去支付身份绑定（多因后端清过数据）。token 无法补写绑定，
  // 必须重新走一次 ks.login，用 code 让服务端重建。
  //
  // 只自愈一次：若重新登录后服务端仍拒绝，说明是配置/数据层面的问题，
  // 继续重试只会把用户锁在一个反复断连的循环里，此时退回普通重连。
  function _startIdentityRebind () {
    if (_rebindPending) return;
    if (_rebindRetry >= 1) {
      console.warn('[NET] 身份重绑已尝试过，放弃自愈，按当前身份重连');
      _scheduleReconnect();
      return;
    }
    _rebindPending = true;
    _rebindRetry++;
    console.log('[NET] 服务端要求重新登录以重建支付绑定');

    var settled = false;
    function finish (ok) {
      if (settled) return;
      settled = true;
      clearTimeout(_rebindTimer);
      if (!ok) {
        _rebindPending = false;
        _rebindTimer = 0;
        _scheduleReconnect();
        return;
      }
      // 成功时无需再重建连接：kwai-login.js 拿到 code 后已在同一条成功分支里
      // 调过 reconnectForAuth，这里再调一次会把刚建好的 socket 拆掉重来。
      // 但重建后的连接若一直拿不到 authOk（连不上、服务端异常），
      // 因为没有普通重连兜底，会永久卡住，所以挂一个看门狗解除压制。
      _rebindTimer = setTimeout(function () {
        _rebindTimer = 0;
        if (_authed || !_rebindPending) return;
        console.warn('[NET] 重绑后未认证成功，恢复普通重连');
        _rebindPending = false;
        _reconnectAttempts = 0;
        _scheduleReconnect();
      }, REBIND_WATCHDOG_MS);
    }

    _rebindTimer = setTimeout(function () { finish(false); }, REBIND_TIMEOUT_MS);

    if (typeof KwaiLogin === 'undefined' || !KwaiLogin.init) {
      console.warn('[NET] KwaiLogin 不可用，无法自愈身份重绑');
      finish(false);
      return;
    }
    KwaiLogin.init({
      forceRelogin: true,
      onSuccess: function () { finish(true); },
      onFail: function () {
        console.warn('[NET] 重新登录失败，按当前身份重连');
        finish(false);
      },
    });
  }
})();