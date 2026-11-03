'use strict';
module.exports = function health(req, res) {
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ ok: true, service: 'config-mock', version: '1' }));
};
