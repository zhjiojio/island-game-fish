// 网页端公网对战：通过 WebSocket 房间服务同步玩家状态
(function () {
  var root = (typeof GameGlobal !== 'undefined') ? GameGlobal
    : (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
    : (typeof self !== 'undefined') ? self : {};
  var ZY = root.ZY = root.ZY || {};

  var Online = {};
  var socket = null;
  var lastSnapshotAt = 0;
  var dirty = false;
  var finishedLocal = null;
  var finishedPeer = null;

  var state = {
    supported: typeof WebSocket !== 'undefined',
    connected: false,
    connecting: false,
    active: false,
    roomId: null,
    playerId: null,
    mapIndex: null,
    status: '',
    peerName: '',
    peerConnected: false,
    peerSnapshot: null,
    wsUrl: ''
  };

  function toast(text) {
    if (ZY.UI && ZY.UI.toast) ZY.UI.toast(text);
  }

  function isEnabled() {
    return !!(ZY.C && ZY.C.FEATURES && ZY.C.FEATURES.onlineBattle);
  }

  function send(type, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: type, payload: payload || {}, sentAt: Date.now() }));
    return true;
  }

  function getParam(name) {
    if (typeof location === 'undefined') return null;
    var params = new URLSearchParams(location.search);
    return params.get(name);
  }

  function resolveWsUrl() {
    var explicit = getParam('ws');
    if (explicit) return explicit;
    if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
      var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return proto + '//' + location.host + '/ws';
    }
    return 'ws://127.0.0.1:8787/ws';
  }

  function playerName() {
    if (ZY.UI && ZY.C && ZY.UI.currentAvatar) {
      var avatar = ZY.UI.currentAvatar();
      return ZY.C.AVATAR_LABELS[avatar] || '玩家';
    }
    return '玩家';
  }

  function closeSocket() {
    if (!socket) return;
    socket.onopen = null;
    socket.onclose = null;
    socket.onerror = null;
    socket.onmessage = null;
    try { socket.close(); } catch (e) {}
    socket = null;
  }

  function resetMatchState() {
    lastSnapshotAt = 0;
    dirty = false;
    finishedLocal = null;
    finishedPeer = null;
    state.peerSnapshot = null;
  }

  function resetRoomState() {
    state.active = false;
    state.roomId = null;
    state.playerId = null;
    state.mapIndex = null;
    state.status = '';
    state.peerName = '';
    state.peerConnected = false;
    state.peerSnapshot = null;
    state.wsUrl = '';
  }

  function connectAndSend(firstMessage) {
    if (!isEnabled()) {
      toast('公网对战暂未开放');
      return;
    }
    if (!state.supported) {
      toast('当前环境不支持公网对战');
      return;
    }
    closeSocket();
    resetMatchState();
    resetRoomState();
    state.connected = false;
    state.connecting = true;
    state.status = '正在连接对战服务...';
    state.wsUrl = resolveWsUrl();

    socket = new WebSocket(state.wsUrl);
    socket.onopen = function () {
      state.connected = true;
      state.connecting = false;
      socket.send(JSON.stringify(firstMessage));
    };
    socket.onerror = function () {
      state.status = '对战服务连接失败';
      toast('连接失败，请确认对战服务已启动');
    };
    socket.onclose = function () {
      state.connected = false;
      state.connecting = false;
      if (state.active) {
        state.status = '连接已断开';
        state.peerConnected = false;
      }
    };
    socket.onmessage = function (event) {
      try {
        handleMessage(JSON.parse(event.data));
      } catch (e) {
        state.status = '收到无效服务消息';
      }
    };
  }

  Online.startFromPrompt = function () {
    if (!isEnabled()) {
      toast('公网对战暂未开放');
      return;
    }
    if (typeof prompt === 'undefined') {
      toast('请在浏览器中使用公网对战');
      return;
    }
    var value = prompt('输入房间码加入；留空创建新房间');
    if (value === null) return;
    var roomId = value.trim().toUpperCase();
    if (roomId) {
      Online.join(roomId);
    } else {
      Online.create();
    }
  };

  Online.create = function () {
    connectAndSend({ type: 'create', name: playerName() });
  };

  Online.join = function (roomId) {
    var cleanRoomId = String(roomId || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(cleanRoomId)) {
      toast('房间码格式不正确');
      return;
    }
    connectAndSend({ type: 'join', roomId: cleanRoomId, name: playerName() });
  };

  function handleMessage(message) {
    if (message.type === 'hello') return;
    if (message.type === 'room_created') {
      state.roomId = message.roomId;
      state.playerId = message.playerId;
      state.mapIndex = message.mapIndex;
      state.status = '房间 ' + message.roomId + ' 已创建，等待对手加入';
      toast('房间码：' + message.roomId);
      return;
    }
    if (message.type === 'room_joined') {
      state.roomId = message.roomId;
      state.playerId = message.playerId;
      state.mapIndex = message.mapIndex;
      state.peerName = message.peerName || '对手';
      state.peerConnected = true;
      state.status = '已加入房间 ' + message.roomId;
      return;
    }
    if (message.type === 'peer_joined') {
      state.peerName = message.peerName || '对手';
      state.peerConnected = true;
      state.status = '对手已加入，准备开局';
      toast('对手已加入');
      return;
    }
    if (message.type === 'match_start') {
      state.active = true;
      state.roomId = message.roomId;
      state.playerId = message.playerId;
      state.mapIndex = message.mapIndex;
      state.status = '公网对战中';
      state.peerConnected = true;
      if (ZY.Main && ZY.Main.newOnlineGame) ZY.Main.newOnlineGame(message.mapIndex);
      markDirty();
      return;
    }
    if (message.type === 'snapshot') {
      state.peerSnapshot = normalizeSnapshot(message.payload);
      applyPeerSnapshot();
      return;
    }
    if (message.type === 'game_over') {
      finishedPeer = normalizeFinish(message.payload);
      resolveOnlineResult();
      return;
    }
    if (message.type === 'peer_left') {
      state.peerConnected = false;
      state.status = '对手已离开';
      if (state.active && ZY.G && ZY.G.scene !== 'over' && ZY.Main && ZY.Main.finishMatch) {
        ZY.Main.finishMatch(true, { onlineReason: 'peer_left' });
      }
      return;
    }
    if (message.type === 'error') {
      state.status = message.message || '对战服务错误';
      toast(state.status);
    }
  }

  function cloneUnit(unit, side) {
    if (!unit || typeof unit !== 'object') return null;
    var out = {};
    ['kind', 'ch', 'name', 'half', 'pairedKey', 'lv', 'cd', 'attackT'].forEach(function (key) {
      if (unit[key] !== undefined) out[key] = unit[key];
    });
    if (out.kind === 'g') out.side = side;
    return out;
  }

  function mirrorKey(key) {
    var parts = String(key).split('_');
    if (parts.length !== 2) return null;
    var c = parseInt(parts[0], 10);
    var r = parseInt(parts[1], 10);
    if (!Number.isFinite(c) || !Number.isFinite(r)) return null;
    return (ZY.Map.COLS - 1 - c) + '_' + (ZY.Map.ROWS - 1 - r);
  }

  function mirrorUnits(units) {
    var out = {};
    var keyMap = {};
    Object.keys(units || {}).forEach(function (key) {
      var mirrored = mirrorKey(key);
      if (mirrored) keyMap[key] = mirrored;
    });
    Object.keys(keyMap).forEach(function (key) {
      var unit = cloneUnit(units[key], 'e');
      if (!unit) return;
      if (unit.pairedKey && keyMap[unit.pairedKey]) unit.pairedKey = keyMap[unit.pairedKey];
      out[keyMap[key]] = unit;
    });
    return out;
  }

  function normalizeSnapshot(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return {
      hearts: clampInt(payload.hearts, 0, ZY.C.ECON.hearts),
      mantou: clampInt(payload.mantou, 0, 9999),
      wave: clampInt(payload.wave, 0, ZY.C.MAX_WAVE),
      waveState: typeof payload.waveState === 'string' ? payload.waveState.slice(0, 16) : '',
      restTimer: Number.isFinite(payload.restTimer) ? Math.max(0, payload.restTimer) : 0,
      units: payload.units && typeof payload.units === 'object' ? payload.units : {},
      bench: Array.isArray(payload.bench) ? payload.bench.slice(0, ZY.C.ECON.benchSize) : [],
      time: Number.isFinite(payload.time) ? Math.max(0, payload.time) : 0
    };
  }

  function normalizeFinish(payload) {
    if (!payload || typeof payload !== 'object') return null;
    return {
      hearts: clampInt(payload.hearts, 0, ZY.C.ECON.hearts),
      wave: clampInt(payload.wave, 0, ZY.C.MAX_WAVE),
      time: Number.isFinite(payload.time) ? Math.max(0, payload.time) : 0,
      reason: typeof payload.reason === 'string' ? payload.reason : 'unknown'
    };
  }

  function clampInt(value, min, max) {
    var n = parseInt(value, 10);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  function extractLocalSnapshot() {
    var G = ZY.G;
    if (!G || !G.p) return null;
    return {
      hearts: G.p.hearts,
      mantou: G.p.mantou,
      wave: G.wave || 0,
      waveState: G.waveState || '',
      restTimer: G.restTimer || 0,
      units: G.p.units || {},
      bench: G.p.bench || [],
      time: G.time || 0
    };
  }

  function applyPeerSnapshot() {
    var G = ZY.G;
    var snapshot = state.peerSnapshot;
    if (!G || !snapshot || !G.e) return;
    G.e.hearts = snapshot.hearts;
    G.e.mantou = snapshot.mantou;
    G.e.units = mirrorUnits(snapshot.units);
    G.e.bench = snapshot.bench.map(function (unit) { return cloneUnit(unit, 'e'); });
    G.onlinePeer = {
      hearts: snapshot.hearts,
      wave: snapshot.wave,
      waveState: snapshot.waveState,
      restTimer: snapshot.restTimer,
      time: snapshot.time
    };
  }

  function markDirty() {
    dirty = true;
  }
  Online.markDirty = markDirty;

  Online.update = function (dt) {
    if (!state.active || !state.connected || !ZY.G || ZY.G.scene !== 'play') return;
    lastSnapshotAt += dt;
    if (!dirty && lastSnapshotAt < 0.3) return;
    lastSnapshotAt = 0;
    dirty = false;
    send('snapshot', extractLocalSnapshot());
  };

  Online.onLocalMatchEnd = function (reason) {
    if (!state.active || !ZY.G) return false;
    var G = ZY.G;
    finishedLocal = {
      hearts: Math.max(0, G.p.hearts),
      wave: G.wave || 0,
      time: G.time || 0,
      reason: reason || (G.p.hearts <= 0 ? 'hearts' : 'finish')
    };
    send('game_over', finishedLocal);
    return resolveOnlineResult();
  };

  function resolveOnlineResult() {
    var G = ZY.G;
    if (!state.active || !G || !ZY.Main || !ZY.Main.finishMatch) return false;

    if (finishedLocal && finishedLocal.hearts <= 0) {
      ZY.Main.finishMatch(false, { onlineReason: finishedLocal.reason });
      return true;
    }
    if (finishedPeer && finishedPeer.hearts <= 0) {
      ZY.Main.finishMatch(true, { onlineReason: finishedPeer.reason });
      return true;
    }
    if (!finishedLocal || !finishedPeer) {
      if (finishedLocal && G.scene === 'play') G.scene = 'online_wait';
      return false;
    }

    var localScore = finishedLocal.hearts * 1000 + finishedLocal.wave * 10 - finishedLocal.time / 1000;
    var peerScore = finishedPeer.hearts * 1000 + finishedPeer.wave * 10 - finishedPeer.time / 1000;
    ZY.Main.finishMatch(localScore >= peerScore, { onlineReason: 'score' });
    return true;
  }

  Online.leave = function () {
    if (state.connected) send('leave', { reason: 'user_leave' });
    closeSocket();
    resetMatchState();
    resetRoomState();
    state.active = false;
    state.connected = false;
    state.connecting = false;
    state.peerConnected = false;
    state.status = '';
  };

  Online.isActive = function () { return state.active; };
  Online.isConnected = function () { return state.connected; };
  Online.shouldSkipOpponentSimulation = function () { return state.active; };
  Online.state = function () { return state; };

  ZY.Online = Online;
})();
