'use strict';

const assert = require('assert');
const test = require('node:test');
const WebSocket = require('ws');
const { createOnlineServer } = require('./online-server');

function createMessageReader(socket) {
  const queue = [];
  const waiters = [];

  function resolveWaiters() {
    for (let waiterIndex = waiters.length - 1; waiterIndex >= 0; waiterIndex -= 1) {
      const waiter = waiters[waiterIndex];
      const messageIndex = queue.findIndex((message) => message.type === waiter.expectedType);
      if (messageIndex < 0) continue;
      const message = queue.splice(messageIndex, 1)[0];
      clearTimeout(waiter.timer);
      waiters.splice(waiterIndex, 1);
      waiter.resolve(message);
    }
  }

  socket.on('message', (data) => {
    queue.push(JSON.parse(data.toString('utf8')));
    resolveWaiters();
  });

  return {
    waitFor(expectedType) {
      return new Promise((resolve, reject) => {
        const messageIndex = queue.findIndex((message) => message.type === expectedType);
        if (messageIndex >= 0) {
          resolve(queue.splice(messageIndex, 1)[0]);
          return;
        }
        const waiter = {
          expectedType,
          resolve,
          timer: setTimeout(() => {
            const index = waiters.indexOf(waiter);
            if (index >= 0) waiters.splice(index, 1);
            reject(new Error(`等待 ${expectedType} 超时`));
          }, 2000)
        };
        waiters.push(waiter);
      });
    }
  };
}

function openClient(port) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const reader = createMessageReader(socket);
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve({ socket, reader }));
    socket.once('error', reject);
  });
}

async function withServer(run) {
  const server = createOnlineServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.server.address().port;
  try {
    await run(port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('creates a room, joins a peer, starts a shared match, and relays snapshots', async () => {
  await withServer(async (port) => {
    const hostClient = await openClient(port);
    const guestClient = await openClient(port);
    const host = hostClient.socket;
    const guest = guestClient.socket;
    const hostReader = hostClient.reader;
    const guestReader = guestClient.reader;
    await hostReader.waitFor('hello');
    await guestReader.waitFor('hello');

    host.send(JSON.stringify({ type: 'create', name: '悟空' }));
    const created = await hostReader.waitFor('room_created');
    assert.match(created.roomId, /^[A-Z0-9]{4,8}$/);
    assert.strictEqual(created.playerId, 'a');

    guest.send(JSON.stringify({ type: 'join', roomId: created.roomId, name: '唐三' }));
    const joined = await guestReader.waitFor('room_joined');
    assert.strictEqual(joined.roomId, created.roomId);
    assert.strictEqual(joined.mapIndex, created.mapIndex);

    const hostStart = await hostReader.waitFor('match_start');
    const guestStart = await guestReader.waitFor('match_start');
    assert.strictEqual(hostStart.mapIndex, guestStart.mapIndex);

    const snapshot = { hearts: 2, wave: 3, units: { '1_8': { kind: 's', ch: '刀', lv: 2 } } };
    host.send(JSON.stringify({ type: 'snapshot', payload: snapshot, sentAt: 123 }));
    const relayed = await guestReader.waitFor('snapshot');
    assert.strictEqual(relayed.from, 'a');
    assert.deepStrictEqual(relayed.payload, snapshot);

    host.close();
    guest.close();
  });
});

test('rejects a third player when a room is full', async () => {
  await withServer(async (port) => {
    const hostClient = await openClient(port);
    const guestClient = await openClient(port);
    const extraClient = await openClient(port);
    const host = hostClient.socket;
    const guest = guestClient.socket;
    const extra = extraClient.socket;
    const hostReader = hostClient.reader;
    const guestReader = guestClient.reader;
    const extraReader = extraClient.reader;
    await hostReader.waitFor('hello');
    await guestReader.waitFor('hello');
    await extraReader.waitFor('hello');

    host.send(JSON.stringify({ type: 'create', name: 'A' }));
    const created = await hostReader.waitFor('room_created');
    guest.send(JSON.stringify({ type: 'join', roomId: created.roomId, name: 'B' }));
    await guestReader.waitFor('room_joined');

    extra.send(JSON.stringify({ type: 'join', roomId: created.roomId, name: 'C' }));
    const error = await extraReader.waitFor('error');
    assert.strictEqual(error.message, '房间已满');

    host.close();
    guest.close();
    extra.close();
  });
});

test('notifies the remaining player when a peer leaves', async () => {
  await withServer(async (port) => {
    const hostClient = await openClient(port);
    const guestClient = await openClient(port);
    const host = hostClient.socket;
    const guest = guestClient.socket;
    const hostReader = hostClient.reader;
    const guestReader = guestClient.reader;
    await hostReader.waitFor('hello');
    await guestReader.waitFor('hello');

    host.send(JSON.stringify({ type: 'create', name: 'A' }));
    const created = await hostReader.waitFor('room_created');
    guest.send(JSON.stringify({ type: 'join', roomId: created.roomId, name: 'B' }));
    await guestReader.waitFor('room_joined');
    await hostReader.waitFor('match_start');

    guest.close();
    const peerLeft = await hostReader.waitFor('peer_left');
    assert.strictEqual(peerLeft.roomId, created.roomId);

    host.close();
  });
});
