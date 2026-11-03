(function (global) {
  'use strict';
  var endpoint = global.KwaiAdminAdConfig && global.KwaiAdminAdConfig.identityEndpoint || '';
  var initialized = false, verified = false, account = '', expiresAt = 0, adsEnabled = true;
  var options = null, pending = 0, gesture = null, x = 0, y = 0, radius = 25;
  var identityTimer = null, expiryTimer = null;
  function allowed() { return verified && !!account && Date.now() < expiresAt; }
  function busy() { return !!(options && options.isBusy && options.isBusy()); }
  function redraw() { if (options && options.render) options.render(); }
  function deny() { verified = false; account = ''; expiresAt = 0; adsEnabled = true; gesture = null; redraw(); }
  function verifyIdentity() {
    if (!/^https:\/\/[^\s/]+\//.test(endpoint) || typeof ks === 'undefined' || !ks.login || !ks.request) { deny(); return; }
    var request = ++pending, previous = account;
    verified = false; gesture = null; redraw();
    clearTimeout(identityTimer); clearTimeout(expiryTimer);
    var settled = false;
    function fail() {
      if (settled || request !== pending) return;
      settled = true; clearTimeout(identityTimer); deny();
    }
    identityTimer = setTimeout(fail, 12000);
    try {
      ks.login({
        success: function (login) {
          if (settled || request !== pending) return;
          if (!login || typeof login.code !== 'string' || !login.code) { fail(); return; }
          try {
            ks.request({
              url: endpoint, method: 'POST', header: { 'content-type': 'application/json' },
              data: { code: login.code }, timeout: 10000,
              success: function (response) {
                if (settled || request !== pending) return;
                var data = response && response.data;
                if (!response || response.statusCode !== 200 || !data || data.adminAdControl !== true ||
                    typeof data.accountTag !== 'string' || !/^[a-f0-9]{64}$/.test(data.accountTag) ||
                    typeof data.expiresAt !== 'number' || data.expiresAt <= Date.now()) { fail(); return; }
                settled = true; clearTimeout(identityTimer);
                account = data.accountTag;
                if (account !== previous) adsEnabled = true;
                expiresAt = Math.min(data.expiresAt, Date.now() + 300000); verified = true;
                expiryTimer = setTimeout(function () { if (request === pending) verifyIdentity(); }, expiresAt - Date.now() + 1);
                redraw();
              },
              fail: fail
            });
          } catch (_) { fail(); }
        },
        fail: fail
      });
    } catch (_) { fail(); }
  }
  function init(value) {
    if (initialized) return;
    initialized = true; options = value;
    x = options.width - radius - 8; y = Math.max(24, options.safeTop || 24) + 84;
    verifyIdentity();
    if (typeof ks !== 'undefined' && ks.onHide) ks.onHide(function () { ++pending; clearTimeout(identityTimer); clearTimeout(expiryTimer); verified = false; gesture = null; });
    if (typeof ks !== 'undefined' && ks.onShow) ks.onShow(verifyIdentity);
  }
  function draw() {
    if (!allowed() || !options) return;
    var ctx = options.ctx;
    ctx.save(); ctx.globalAlpha = busy() ? 0.5 : 0.94;
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 7;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#1d211b'; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 1.5; ctx.strokeStyle = adsEnabled ? '#91c48c' : '#edc879'; ctx.stroke();
    ctx.fillStyle = adsEnabled ? '#bfe1b5' : '#f8dfa2';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 11px sans-serif'; ctx.fillText('广告', x, y - 7);
    ctx.font = '700 10px sans-serif'; ctx.fillText(adsEnabled ? '已开启' : '已关闭', x, y + 8);
    ctx.restore();
  }
  function touchStart(px, py) {
    if (!allowed() || Math.pow(px - x, 2) + Math.pow(py - y, 2) > Math.pow(radius + 3, 2)) return false;
    gesture = { x: px, y: py, startX: x, startY: y, moved: false, blocked: busy() };
    return true;
  }
  function touchMove(px, py) {
    if (!gesture) return false;
    if (Math.abs(px - gesture.x) + Math.abs(py - gesture.y) > 8) gesture.moved = true;
    if (gesture.moved) {
      x = Math.max(radius + 4, Math.min(options.width - radius - 4, gesture.startX + px - gesture.x));
      y = Math.max((options.safeTop || 24) + radius, Math.min(options.height - (options.safeBottom || 12) - radius, gesture.startY + py - gesture.y));
      redraw();
    }
    return true;
  }
  function touchEnd(px, py) {
    if (!gesture) return false;
    var previous = gesture; gesture = null;
    if (allowed() && !previous.blocked && !busy() && !previous.moved && Math.abs(px - previous.x) + Math.abs(py - previous.y) <= 8) {
      adsEnabled = !adsEnabled;
      if (!adsEnabled && global.KwaiAd && global.KwaiAd.hideBanner) global.KwaiAd.hideBanner();
    }
    redraw(); return true;
  }
  global.AdminAdControl = Object.freeze({
    init: init, draw: draw, isBypassed: function () { return allowed() && !adsEnabled; },
    touchStart: touchStart, touchMove: touchMove, touchEnd: touchEnd,
    cancelTouch: function () { gesture = null; }
  });
})(typeof GameGlobal !== 'undefined' ? GameGlobal : window);
