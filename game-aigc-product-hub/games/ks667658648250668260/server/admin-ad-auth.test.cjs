'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createHandler } = require('./admin-ad-auth.cjs');

const ADMINS = ['120592009db29834aa07fb38a13cde0a4d', '120592009db29834aa07fb38a116ec6f9b'];
const FIXED_NOW = 1800000000000;
const MOCK_SECRET = 'unit-test-secret-not-a-real-credential';

async function fixture(t, overrides = {}) {
  const calls = [];
  const handler = createHandler({
    appId: 'test-game', appSecret: MOCK_SECRET, now: () => FIXED_NOW,
    exchangeCode: async (args) => {
      calls.push(args);
      return { result: 1, open_id: args.code === 'admin-2' ? ADMINS[1] : args.code === 'admin-1' ? ADMINS[0] : 'ordinary-player', session_key: 'must-stay-on-server' };
    },
    ...overrides,
  });
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    calls,
    request: (body, options = {}) => new Promise((resolve, reject) => {
      const data = options.raw ?? JSON.stringify(body);
      const req = http.request({
        hostname: '127.0.0.1', port: server.address().port, path: '/admin/ad-auth', method: 'POST',
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
        response.on('error', reject);
      });
      req.on('error', reject);
      req.end(data);
    }),
  };
}

test('both exact admins receive distinct stable opaque tags and a five-minute lease', async (t) => {
  const f = await fixture(t);
  const results = [];
  for (const code of ['admin-1', 'admin-2', 'admin-1']) {
    const result = await f.request({ code });
    assert.equal(result.status, 200);
    assert.equal(result.body.adminAdControl, true);
    assert.match(result.body.accountTag, /^[a-f0-9]{64}$/);
    assert.equal(result.body.expiresAt, FIXED_NOW + 300000);
    assert.deepEqual(Object.keys(result.body).sort(), ['accountTag', 'adminAdControl', 'expiresAt']);
    const serialized = JSON.stringify(result.body);
    assert.ok(!serialized.includes('must-stay-on-server'));
    assert.ok(!serialized.includes(MOCK_SECRET));
    for (const admin of ADMINS) assert.ok(!serialized.includes(admin));
    assert.match(result.headers['cache-control'], /no-store/);
    results.push(result.body);
  }
  assert.notEqual(results[0].accountTag, results[1].accountTag);
  assert.equal(results[0].accountTag, results[2].accountTag);
  assert.equal(f.calls[0].code, 'admin-1');
});

test('ordinary players receive no admin capability or account tag', async (t) => {
  const f = await fixture(t);
  const result = await f.request({ code: 'ordinary' });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { adminAdControl: false });
});

test('client openid, admin flags, invalid JSON, and invalid code cannot identify an administrator', async (t) => {
  const f = await fixture(t);
  for (const body of [
    { openid: ADMINS[0] }, { code: 'ordinary', open_id: ADMINS[0] },
    { code: 'ordinary', adminAdControl: true }, { code: '' }, { code: 'a b' },
    { code: 123 }, null, [], { code: 'x'.repeat(1025) },
  ]) {
    const result = await f.request(body);
    assert.equal(result.status, 400);
    assert.deepEqual(result.body, { adminAdControl: false });
  }
  assert.equal((await f.request({}, { raw: '{' })).status, 400);
  assert.equal(f.calls.length, 0);
});

test('platform success must be numeric 1 with an exact open_id match', async (t) => {
  for (const platform of [
    null, {}, { result: 0, open_id: ADMINS[0] }, { result: '1', open_id: ADMINS[0] },
    { result: 400, open_id: ADMINS[0] }, { result: 1 }, { result: 1, open_id: '' },
  ]) {
    const f = await fixture(t, { exchangeCode: async () => platform });
    const result = await f.request({ code: 'valid' });
    assert.equal(result.status, 502);
    assert.deepEqual(result.body, { adminAdControl: false });
  }
  const f = await fixture(t, { exchangeCode: async () => ({ result: 1, open_id: ADMINS[0] + 'x' }) });
  assert.deepEqual((await f.request({ code: 'valid' })).body, { adminAdControl: false });
});

test('upstream exception and timeout fail closed without leaking platform details', async (t) => {
  const failed = await fixture(t, { exchangeCode: async () => { throw new Error(MOCK_SECRET); } });
  assert.deepEqual((await failed.request({ code: 'valid' })).body, { adminAdControl: false });
  let signal;
  const stalled = await fixture(t, { upstreamTimeoutMs: 20, exchangeCode: (args) => { signal = args.signal; return new Promise(() => {}); } });
  const result = await stalled.request({ code: 'valid' });
  assert.equal(result.status, 504);
  assert.equal(signal.aborted, true);
  assert.deepEqual(result.body, { adminAdControl: false });
});

test('missing server configuration, wrong routes, methods, content types, and large bodies are rejected', async (t) => {
  const missing = await fixture(t, { appSecret: '' });
  assert.equal((await missing.request({ code: 'valid' })).status, 503);
  const f = await fixture(t);
  assert.equal((await f.request({}, { method: 'GET' })).status, 405);
  assert.equal((await f.request({}, { path: '/other' })).status, 404);
  assert.equal((await f.request({}, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await f.request({}, { raw: 'x'.repeat(3000) })).status, 413);
  const chunked = await f.request({}, { raw: 'x'.repeat(3000), headers: { 'transfer-encoding': 'chunked' } });
  assert.equal(chunked.status, 413);
  assert.match(chunked.headers['cache-control'], /no-store/);
  assert.equal(f.calls.length, 0);
});
