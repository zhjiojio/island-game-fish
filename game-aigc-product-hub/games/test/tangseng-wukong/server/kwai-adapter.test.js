const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const projectRoot = path.resolve(__dirname, '..');
const adapterPath = path.join(projectRoot, 'kwaiadapter.js');
const gameEntryPath = path.join(projectRoot, 'game.js');

test('loads the Kuaishou adapter before all game modules', () => {
  const gameEntry = fs.readFileSync(gameEntryPath, 'utf8');
  const requires = Array.from(gameEntry.matchAll(/require\(['"](.+?)['"]\)/g), match => match[1]);

  assert.equal(requires[0], './kwaiadapter.js');
});

test('exposes the Kuaishou API through the wx compatibility name', () => {
  assert.ok(fs.existsSync(adapterPath), 'kwaiadapter.js must exist in the game root');

  const source = fs.readFileSync(adapterPath, 'utf8');
  const ks = {};
  const sandbox = { ks };
  sandbox.GameGlobal = sandbox;

  vm.runInNewContext(source, sandbox, { filename: adapterPath });

  assert.equal(sandbox.wx, ks);
  assert.equal(typeof sandbox.wx.onMessage, 'function');
  assert.equal(typeof sandbox.wx.getOpenDataContext, 'function');
});
