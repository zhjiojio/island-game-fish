(function () {
  window.wxhelper = {
    GetMainCanvas: function (id) {
      if (window.canvas) return window.canvas;
      if (typeof ks !== 'undefined' && ks.createCanvas) {
        var canvas = ks.createCanvas(), listeners = {}, info = ks.getSystemInfoSync();
        window.innerWidth = info.windowWidth; window.innerHeight = info.windowHeight; window.devicePixelRatio = info.pixelRatio || 1;
        // Keep the rect live: folding screens / split view can change the
        // window after load, and a stale rect misplaces every touch.
        canvas.getBoundingClientRect = function () {
          var cur = (typeof ks !== 'undefined' && ks.getSystemInfoSync) ? ks.getSystemInfoSync() : info;
          return { left: 0, top: 0, width: cur.windowWidth, height: cur.windowHeight };
        };
        canvas.addEventListener = function (name, fn) { if (!listeners[name]) listeners[name] = []; listeners[name].push(fn); };
        function forward(name, e) {
          function normalize(p) { return { clientX: p.clientX === undefined ? p.x : p.clientX, clientY: p.clientY === undefined ? p.y : p.clientY }; }
          var event = { touches: (e.touches || []).map(normalize), changedTouches: (e.changedTouches || []).map(normalize), preventDefault: function () {} };
          var list = listeners[name] || []; for (var i = 0; i < list.length; i++) list[i](event);
        }
        ks.onTouchStart(function (e) { forward('touchstart', e); });
        ks.onTouchMove(function (e) { forward('touchmove', e); });
        ks.onTouchEnd(function (e) { forward('touchend', e); });
        if (ks.onTouchCancel) ks.onTouchCancel(function (e) { forward('touchcancel', e); });
        return canvas;
      }
      return window.document.getElementById(id);
    },
    CreateImage: function () { return typeof ks !== 'undefined' && ks.createImage ? ks.createImage() : new window.Image(); },
    GetWindowSize: function () { return { width: window.innerWidth || 375, height: window.innerHeight || 812 }; }
  };
}());
