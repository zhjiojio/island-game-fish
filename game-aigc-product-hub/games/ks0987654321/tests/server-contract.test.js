'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server/src/app');
let base;
test.before(async () => { await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port; });
test.after(async () => { await new Promise(resolve => server.close(resolve)); });
test('health endpoint', async () => { const res = await fetch(base + '/health'); assert.equal(res.status, 200); assert.equal((await res.json()).ok, true); });
test('runtime manifest and level contract', async () => {
  const manifestRes = await fetch(base + '/v1/games/ks0987654321/runtime-manifest');
  assert.equal(manifestRes.status, 200); assert.ok(manifestRes.headers.get('etag'));
  const manifest = await manifestRes.json(); assert.equal(manifest.deckRules.deckSize, 5); assert.equal(manifest.presentation.themeId, 'coral-fantasy'); assert.equal(manifest.presentation.copy.homeTitle, '珊瑚防线'); assert.equal(manifest.cards.length, 6);
  const levelRes = await fetch(base + '/v1/games/ks0987654321/levels/neutral-level-1');
  assert.equal(levelRes.status, 200); const level = await levelRes.json(); assert.equal(level.schemaVersion, 5); assert.equal(level.template, 'fixed-path-v1'); assert.equal(level.uiName, '珊瑚前哨'); assert.equal(level.map.theme, 'coral-fantasy'); assert.ok(level.map.presentation);
});
