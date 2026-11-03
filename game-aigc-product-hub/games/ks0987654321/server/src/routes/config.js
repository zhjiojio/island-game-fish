'use strict';
function send(req, res, found, origin) {
  if (!found) { res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': origin }); res.end(JSON.stringify({ error: 'not_found' })); return; }
  if (req.headers['if-none-match'] === found.etag) { res.writeHead(304, { etag: found.etag, 'access-control-allow-origin': origin }); res.end(); return; }
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=60', etag: found.etag, 'access-control-allow-origin': origin });
  res.end(JSON.stringify(found.data));
}
module.exports = function configRoute(service, origin) {
  return function route(req, res, pathname) {
    if (pathname === '/v1/games/ks0987654321/runtime-manifest') { send(req, res, service.manifest(), origin); return true; }
    const match = pathname.match(/^\/v1\/games\/ks0987654321\/levels\/([a-zA-Z0-9._-]+)$/);
    if (match) { send(req, res, service.level(match[1]), origin); return true; }
    return false;
  };
};
