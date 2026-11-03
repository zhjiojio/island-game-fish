'use strict';
const fs = require('node:fs');
const path = require('node:path');
function safeId(value) { return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value || ''); }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
module.exports = function createRepository(fixtureDir) {
  return {
    manifest() { return readJson(path.join(fixtureDir, 'runtime-manifest.json')); },
    level(id) { if (!safeId(id)) return null; const file = path.join(fixtureDir, 'levels', id + '.json'); return fs.existsSync(file) ? readJson(file) : null; }
  };
};
