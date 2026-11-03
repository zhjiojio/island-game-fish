'use strict';

const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const DEFAULT_PORT = 8787;
const DEFAULT_HOST = '0.0.0.0';
const MAX_MESSAGE_BYTES = 16 * 1024;
const ROOM_TTL_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 1000;
const ROOM_ID_PATTERN = /^[A-Z0-9]{4,8}$/;
const PUBLIC_ROOT = path.resolve(__dirname, '..');

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wav': 'audio/wav',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

const FORBIDDEN_STATIC_DIRS = new Set([
  '.git',
  '.github',
  '.uploads',
  'node_modules',
  'server',
  'sim',
  'tools',
  'tmp'
]);

function now() {
  return Date.now();
}

function sendJson(socket, payload) {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify(payload));
}

function parseMessage(data) {
  const text = data.toString('utf8');
  if (Buffer.byteLength(text, 'utf8') > MAX_MESSAGE_BYTES) {
    throw new Error('消息过大');
  }
  const message = JSON.parse(text);
  if (!message || typeof message !== 'object' || typeof message.type !== 'string') {
    throw new Error('消息格式无效');
  }
  return message;
}

function sanitizeName(value) {
  if (typeof value !== 'string') return '玩家';
  const cleaned = value.trim().replace(/[^\p{Script=Han}\p{L}\p{N}_ -]/gu, '');
  return cleaned.slice(0, 16) || '玩家';
}

function normalizeRoomId(value) {
  if (typeof value !== 'string') return null;
  const roomId = value.trim().toUpperCase();
  return ROOM_ID_PATTERN.test(roomId) ? roomId : null;
}

function generateRoomId(existingRooms) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const roomId = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
    if (!existingRooms.has(roomId)) return roomId;
  }
  throw new Error('无法创建房间码');
}

function randomMapIndex() {
  return crypto.randomInt(0, 5);
}

function sanitizeForwardPayload(message) {
  return {
    type: message.type,
    payload: message.payload && typeof message.payload === 'object' ? message.payload : {},
    sentAt: Number.isFinite(message.sentAt) ? message.sentAt : now()
  };
}

function safeResolveStaticPath(urlPath) {
  let rawPath;
  try {
    rawPath = decodeURIComponent(urlPath.split('?')[0]);
  } catch (error) {
    return null;
  }
  const cleanPath = rawPath === '/' ? '/index.html' : rawPath;
  const parts = cleanPath.split('/').filter(Boolean);
  if (parts.some((part) => part === '..' || FORBIDDEN_STATIC_DIRS.has(part))) return null;
  const filePath = path.resolve(PUBLIC_ROOT, ...parts);
  return filePath.startsWith(PUBLIC_ROOT + path.sep) || filePath === PUBLIC_ROOT ? filePath : null;
}

class OnlineRoomServer {
  constructor(options = {}) {
    this.rooms = new Map();
    this.server = options.server || http.createServer((req, res) => this.serveStatic(req, res));
    this.wss = new WebSocketServer({
      server: this.server,
      path: options.wsPath || '/ws',
      maxPayload: MAX_MESSAGE_BYTES
    });
    this.cleanupTimer = null;
    this.wss.on('connection', (socket) => this.handleConnection(socket));
  }

  listen(port = DEFAULT_PORT, host = DEFAULT_HOST, callback) {
    this.cleanupTimer = setInterval(() => this.cleanupRooms(), CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
    this.server.listen(port, host, callback);
  }

  close(callback) {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    for (const room of this.rooms.values()) {
      for (const player of Object.values(room.players)) {
        if (player && player.socket.readyState === player.socket.OPEN) {
          player.socket.terminate();
        }
      }
    }
    this.rooms.clear();
    this.wss.close(() => this.server.close(callback));
  }

  serveStatic(req, res) {
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405);
      res.end('Method not allowed');
      return;
    }
    if (!req.url || req.url.startsWith('/ws')) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const filePath = safeResolveStaticPath(req.url);
    if (!filePath) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    const fs = require('fs');
    fs.stat(filePath, (statError, stats) => {
      if (statError || !stats.isFile()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  }

  handleConnection(socket) {
    socket.roomId = null;
    socket.playerId = null;
    socket.lastSeenAt = now();

    socket.on('message', (data) => {
      try {
        const message = parseMessage(data);
        socket.lastSeenAt = now();
        this.handleMessage(socket, message);
      } catch (error) {
        sendJson(socket, { type: 'error', message: error.message || '消息处理失败' });
      }
    });

    socket.on('close', () => this.handleDisconnect(socket));
    sendJson(socket, { type: 'hello', serverTime: now() });
  }

  handleMessage(socket, message) {
    if (message.type === 'create') {
      this.createRoom(socket, message);
      return;
    }
    if (message.type === 'join') {
      this.joinRoom(socket, message);
      return;
    }
    if (message.type === 'ping') {
      sendJson(socket, { type: 'pong', serverTime: now() });
      return;
    }
    if (!socket.roomId || !socket.playerId) {
      sendJson(socket, { type: 'error', message: '尚未进入房间' });
      return;
    }
    if (!['ready', 'snapshot', 'game_over', 'leave'].includes(message.type)) {
      sendJson(socket, { type: 'error', message: '不支持的消息类型' });
      return;
    }
    this.forwardToPeer(socket, sanitizeForwardPayload(message));
    if (message.type === 'leave') socket.close(1000, 'left room');
  }

  createRoom(socket, message) {
    if (socket.roomId) {
      sendJson(socket, { type: 'error', message: '已经在房间中' });
      return;
    }
    const roomId = generateRoomId(this.rooms);
    const room = {
      id: roomId,
      createdAt: now(),
      updatedAt: now(),
      mapIndex: randomMapIndex(),
      players: {
        a: { id: 'a', name: sanitizeName(message.name), socket },
        b: null
      }
    };
    socket.roomId = roomId;
    socket.playerId = 'a';
    this.rooms.set(roomId, room);
    sendJson(socket, {
      type: 'room_created',
      roomId,
      playerId: 'a',
      mapIndex: room.mapIndex
    });
  }

  joinRoom(socket, message) {
    if (socket.roomId) {
      sendJson(socket, { type: 'error', message: '已经在房间中' });
      return;
    }
    const roomId = normalizeRoomId(message.roomId);
    if (!roomId || !this.rooms.has(roomId)) {
      sendJson(socket, { type: 'error', message: '房间不存在' });
      return;
    }
    const room = this.rooms.get(roomId);
    if (room.players.b) {
      sendJson(socket, { type: 'error', message: '房间已满' });
      return;
    }
    room.players.b = { id: 'b', name: sanitizeName(message.name), socket };
    room.updatedAt = now();
    socket.roomId = roomId;
    socket.playerId = 'b';

    sendJson(socket, {
      type: 'room_joined',
      roomId,
      playerId: 'b',
      mapIndex: room.mapIndex,
      peerName: room.players.a.name
    });
    sendJson(room.players.a.socket, {
      type: 'peer_joined',
      roomId,
      peerName: room.players.b.name
    });
    this.startMatch(room);
  }

  startMatch(room) {
    const startsAt = now() + 1200;
    for (const player of Object.values(room.players)) {
      if (!player) continue;
      sendJson(player.socket, {
        type: 'match_start',
        roomId: room.id,
        playerId: player.id,
        mapIndex: room.mapIndex,
        startsAt
      });
    }
  }

  forwardToPeer(socket, message) {
    const room = this.rooms.get(socket.roomId);
    if (!room) return;
    room.updatedAt = now();
    const peerId = socket.playerId === 'a' ? 'b' : 'a';
    const peer = room.players[peerId];
    if (!peer) {
      sendJson(socket, { type: 'waiting_for_peer' });
      return;
    }
    sendJson(peer.socket, {
      ...message,
      from: socket.playerId,
      roomId: room.id
    });
  }

  handleDisconnect(socket) {
    if (!socket.roomId || !socket.playerId) return;
    const room = this.rooms.get(socket.roomId);
    if (!room) return;
    const player = room.players[socket.playerId];
    if (player && player.socket === socket) {
      room.players[socket.playerId] = null;
    }
    const peer = room.players[socket.playerId === 'a' ? 'b' : 'a'];
    if (peer) {
      sendJson(peer.socket, { type: 'peer_left', roomId: room.id });
      room.updatedAt = now();
    } else {
      this.rooms.delete(room.id);
    }
  }

  cleanupRooms() {
    const expiresBefore = now() - ROOM_TTL_MS;
    for (const [roomId, room] of this.rooms.entries()) {
      const hasOpenPlayer = Object.values(room.players).some(
        (player) => player && player.socket.readyState === player.socket.OPEN
      );
      if (!hasOpenPlayer || room.updatedAt < expiresBefore) {
        this.rooms.delete(roomId);
      }
    }
  }
}

function createOnlineServer(options) {
  return new OnlineRoomServer(options);
}

if (require.main === module) {
  const port = Number.parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
  const host = process.env.HOST || DEFAULT_HOST;
  const onlineServer = createOnlineServer();
  onlineServer.listen(port, host, () => {
    console.log(`悟空与唐僧公网对战服务已启动: http://${host}:${port}`);
    console.log('浏览器打开该地址，或静态站追加 ?ws=wss://你的域名/ws 连接此服务。');
  });
}

module.exports = {
  OnlineRoomServer,
  createOnlineServer
};
