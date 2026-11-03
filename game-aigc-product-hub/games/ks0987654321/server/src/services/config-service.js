'use strict';
const crypto = require('node:crypto');
function etag(data) { return '"' + crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16) + '"'; }
module.exports = function createService(repository) {
  function result(data) { return data ? { data, etag: etag(data) } : null; }
  return { manifest: () => result(repository.manifest()), level: id => result(repository.level(id)) };
};
