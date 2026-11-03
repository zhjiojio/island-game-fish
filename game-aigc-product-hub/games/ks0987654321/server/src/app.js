'use strict';
const http = require('node:http');
const { URL } = require('node:url');
const env = require('./config/env');
const repository = require('./repositories/fixture-repository')(env.fixtureDir);
const service = require('./services/config-service')(repository);
const health = require('./routes/health');
const configRoute = require('./routes/config')(service, env.allowedOrigin);
function handler(req, res) {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (req.method !== 'GET') { res.writeHead(405, { allow: 'GET' }); res.end(); return; }
    if (pathname === '/health') { health(req, res); return; }
    if (configRoute(req, res, pathname)) return;
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not_found' }));
  } catch (error) { res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'internal_error' })); }
}
const server = http.createServer(handler);
if (require.main === module) server.listen(env.port, env.host, () => console.log('config mock: http://' + env.host + ':' + env.port));
module.exports = { server, handler };
