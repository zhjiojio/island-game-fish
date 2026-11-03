/**
 * matchmaking.js — 随机匹配模块
 *
 * 流程：
 *   1. start()：向服务器发 quickMatch，客户端只展示等待进度
 *   2. 服务器找到房间 → 回包 matchFound { roomId, matchRequestId, joinTicket } → 自动 joinRoom
 *   3. 用户可主动取消；业务补位阈值完全由服务端控制
 *
 * 服务端消息：
 *   客户端发：{ type: 'quickMatch', nickname, avatarUrl }
 *   客户端发：{ type: 'cancelMatch' }
 *   服务端回：{ type: 'matchFound', data: { roomId } }
 *   服务端回：{ type: 'matchWaiting' }（排队中提示，可选）
 *
 * 对外接口：
 *   M3.Matchmaking.start()
 *   M3.Matchmaking.cancel()
 *   M3.Matchmaking.isMatching()
 *   M3.Matchmaking.getCountdown()
 *   M3.Matchmaking.draw()  — 由 render.js drawHomeScreen 末尾调用
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  var NETWORK_FALLBACK = 180;   // 仅用于展示网络异常，不作为业务匹配超时
  var _matching = false;
  var _startTime = 0;
  var _timer = null;
  var _roomType = 'junior';
  var _roomName = '初级场';
  var _matchRequestId = '';
  // join 序号：matchFound 后的 join 有 400ms 延迟，期间若发生取消/重排
  // （如 authOk→matchExpired 自动重新排队），旧 join 必须作废，否则会拿
  // 过期预约去撞新会话的房间，被服务端以 MATCH_RESERVATION_REQUIRED 拒绝。
  var _joinSeq = 0;

  M3.Matchmaking = {
    isMatching: function () { return _matching; },
    getCountdown: function () {
      if (!_matching) return 0;
      return Math.floor((Date.now() - _startTime) / 1000);
    },

    start: function (options) {
      options = options || {};
      if (_matching) return;
      var user = M3.Game.getUser();
      if (!user) { M3.Game.flash('请先登录'); return; }
      _roomType = normalizeRoomType(options.roomType || 'junior');
      _roomName = options.roomName || ({ junior: '初级场', mid: '中级场', master: '大师场' }[_roomType] || '初级场');
      // 铁豆不足 → 提示，不进游戏场景
      if (M3.Game.hasBeansToEnter && !M3.Game.hasBeansToEnter(_roomType)) {
        if (M3.Game.guideEarnBeans) M3.Game.guideEarnBeans(_roomType);
        return;
      }
      // 游客仅可进初级场 → 提示，不进游戏场景
      if (M3.Auth && M3.Auth.isGuest && M3.Auth.isGuest() && _roomType !== 'junior') {
        M3.Game.flash('游客身份仅可进入初级场，请使用快手登录后体验更高场次');
        return;
      }

      _matching = true;
      _startTime = Date.now();

      // 立即进入「房间内等待」视图
      if (M3.Game.enterMatchRoom) M3.Game.enterMatchRoom(_roomType);

      // 确保 socket 已连接
      M3.Network.ensureSocket(user.nickname);

      // 发送快速匹配请求
      M3.Network.send('quickMatch', {
        nickname: user.nickname,
        avatarUrl: user.avatarUrl || '',
        openId: user.openId || '',
        accountId: user.accountId || user.openId || '',
        loginType: user.loginType || '',
        roomType: _roomType,
      });

      // 展示 ticker；不在客户端执行业务超时取消
      _timer = setInterval(function () {
        if (!_matching) { clearInterval(_timer); _timer = null; return; }
        if (M3.Matchmaking.getCountdown() >= NETWORK_FALLBACK && M3.Network.getStatus() !== 'connected') {
          M3.Game.flash('网络连接不稳定，正在尝试恢复匹配…');
          _startTime = Date.now();
        }
      }, 1000);
    },

    cancel: function () {
      if (!_matching) return;
      _matching = false;
      _joinSeq++;   // 作废 matchFound 后尚未发出的 join
      if (_timer) { clearInterval(_timer); _timer = null; }
      M3.Network.send('cancelMatch', { matchRequestId: _matchRequestId });
      _matchRequestId = '';
      if (M3.Game.getScreen && M3.Game.getScreen() === 'game' && M3.Game.goHome) M3.Game.goHome();
      M3.Game.flash('已取消匹配');
    },

    _timeout: function () {
      _matching = false;
      _joinSeq++;
      if (_timer) { clearInterval(_timer); _timer = null; }
      M3.Network.send('cancelMatch', {});
      if (M3.Game.getScreen && M3.Game.getScreen() === 'game' && M3.Game.goHome) M3.Game.goHome();
      M3.Game.flash('暂时匹配不到队友，稍后再试吧～');
    },

    stop: function () {
      if (!_matching) return;
      _matching = false;
      _joinSeq++;
      if (_timer) { clearInterval(_timer); _timer = null; }
    },

    _onMatchFound: function (data) {
      if (!_matching) return;
      if (_timer) { clearInterval(_timer); _timer = null; }
      var roomId = data.roomId;
      var roomType = normalizeRoomType(data.roomType || _roomType || 'junior');
      _matchRequestId = data.matchRequestId || _matchRequestId;
      if (!roomId || !data.joinTicket || !_matchRequestId) { M3.Game.flash('匹配凭证失效，请重试'); return; }
      if (M3.Vibrate) M3.Vibrate.medium();   // 匹配到人：中×1（用户可能切后台，需能感知）
      M3.Game.flash('匹配成功！正在加入房间…');
      var seq = ++_joinSeq;   // 本次 join 的序号；取消/重排会使其失效
      var ticket = data.joinTicket;
      setTimeout(function () {
        if (seq !== _joinSeq) return;   // 已被取消/重新排队作废
        M3.Game.joinRoom(roomId, roomType, {
          matchRequestId: _matchRequestId,
          joinTicket: ticket,
        });
      }, 400);
    },
  };

  function normalizeRoomType(roomType) {
    if (roomType === 'classic') return 'junior';
    if (roomType === 'senior') return 'master';
    return roomType || 'junior';
  }

  // 监听服务器 matchFound 消息
  M3.Network.on('matchFound', function (data) {
    M3.Matchmaking._onMatchFound(data || {});
  });

  // 可选：服务器发 matchWaiting 时更新提示
  M3.Network.on('matchWaiting', function (data) {
    if (data && data.matchRequestId) _matchRequestId = data.matchRequestId;
    if (data && data.roomType) _roomType = normalizeRoomType(data.roomType);
    if (data && data.roomName) _roomName = data.roomName;
  });

  // 连接重建（authOk）时恢复匹配。背景：冷启动 ks.login 完成后必然
  // reconnectForAuth 拆掉旧连接重建（服务端禁止单连接中途换号），若用户
  // 已在匹配中，服务端匹配 session 里记录的还是旧（已死）socket——
  // matchFound 会发往死连接而丢失，客户端永远停在匹配 loading。
  // resumeMatch 让服务端把 session 的 ws 刷新为新连接；若已完成组房
  // （reserved），还会重签 joinTicket 并重发 matchFound，整个恢复无感。
  // 普通断网重连同样经此路径找回排队位置，位置不丢。
  M3.Network.on('authOk', function () {
    if (!_matching) return;
    M3.Network.send('resumeMatch', { matchRequestId: _matchRequestId });
  });

  // resumeMatch 发现当前账号下已无匹配会话：多发生于匹配期间 ks.login
  // 完成、连接以新身份重建（旧会话属于游客/另一账号）。此时以当前身份
  // 自动重新排队继续匹配；若新身份不满足场次要求（如游客进中高级场），
  // start 内会正常拦下提示，不会卡匹配 loading。
  M3.Network.on('matchExpired', function () {
    if (!_matching) return;
    var roomType = _roomType;
    var roomName = _roomName;
    M3.Matchmaking.stop();          // 作废在途 join（_joinSeq++）
    M3.Matchmaking.start({ roomType: roomType, roomName: roomName });
  });

  // 匹配中被服务端拒绝（游客进中高级房 / 铁豆不足 / 已在房间 / 入场
  // 预约或凭证无效 / 房间已满等）→ 取消并回大厅。凭证类错误必须在此
  // 拦截：_onMatchFound 后 _matching 保持 true 等 joined，一旦 join 被
  // 拒且无人停止匹配，loading 会永远盖在屏幕上（表现为「匹配成功却
  // 没进入房间」）。
  M3.Network.on('error', function (data) {
    if (!_matching) return;
    var msg = (data && data.message) || '';
    var code = (data && data.code) || '';
    var matchReject = /游客|GUEST|初级场|铁豆|BEANS|ROOM_FORBIDDEN|ALREADY_IN_ROOM|MATCH_RESERVATION_REQUIRED|INVALID_JOIN_TICKET|匹配入场|入场凭证|凭证无效|凭证已过期|已在.*房间|请先离开|房间已满|无法重复匹配/i.test(msg + ' ' + code);
    if (matchReject) {
      _matching = false;
      _joinSeq++;
      _matchRequestId = '';
      if (_timer) { clearInterval(_timer); _timer = null; }
      if (M3.Game.getScreen && M3.Game.getScreen() === 'game' && M3.Game.goHome) M3.Game.goHome();
      if (msg) M3.Game.flash(msg);
    }
  });

})();
