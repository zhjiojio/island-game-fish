(function () {
  'use strict';
  var stage = document.getElementById('game'), canvas = document.getElementById('canvas');
  window.GameGlobal = window; window.canvas = canvas;
  function media(element) {
    var api = {};
    ['src', 'volume', 'muted', 'loop', 'playbackRate', 'autoplay'].forEach(function (key) {
      Object.defineProperty(api, key, { get: function () { return element[key]; }, set: function (value) { element[key] = value; } });
    });
    api.play = function () { var result = element.play(); if (result && result.catch) result.catch(function () {}); };
    api.pause = function () { element.pause(); };
    api.stop = function () { element.pause(); element.currentTime = 0; };
    api.seek = function (time) { element.currentTime = time; };
    api.destroy = function () { element.pause(); element.removeAttribute('src'); element.load(); element.remove(); };
    ['Play', 'Pause', 'Ended', 'Error', 'Canplay', 'Waiting', 'Seeking', 'Seeked'].forEach(function (name) {
      api['on' + name] = function (callback) { element.addEventListener(name.toLowerCase(), callback); };
    });
    api.onTimeUpdate = function (callback) { element.addEventListener('timeupdate', function () { callback({ position: element.currentTime, currentTime: element.currentTime, duration: element.duration }); }); };
    Object.defineProperty(api, 'duration', { get: function () { return element.duration; } });
    Object.defineProperty(api, 'currentTime', { get: function () { return element.currentTime; } });
    return api;
  }
  function touch(type, handler) {
    canvas.addEventListener(type, function (event) {
      if (type === 'pointermove' && !event.buttons) return;
      if (type === 'pointerdown') canvas.setPointerCapture(event.pointerId);
      var box = canvas.getBoundingClientRect();
      var point = { clientX: event.clientX - box.left, clientY: event.clientY - box.top };
      handler({ touches: type === 'pointerup' ? [] : [point], changedTouches: [point] });
    });
  }
  window.wx = {
    getSystemInfoSync: function () { return { windowWidth: stage.clientWidth, windowHeight: stage.clientHeight, screenWidth: stage.clientWidth, screenHeight: stage.clientHeight, pixelRatio: Math.min(devicePixelRatio || 1, 2), platform: 'web', safeArea: { top: 24, bottom: stage.clientHeight - 12 } }; },
    createImage: function () { return new Image(); },
    createInnerAudioContext: function () { return media(new Audio()); },
    createVideo: function (config) {
      var video = document.createElement('video'); video.playsInline = true; video.setAttribute('playsinline', '');
      video.muted = !!config.muted; video.autoplay = !!config.autoplay; video.src = config.src; video.loop = !!config.loop;
      stage.insertBefore(video, canvas);
      var api = media(video);
      if (config.autoplay) setTimeout(api.play, 0);
      return api;
    },
    getStorageSync: function (key) { var value = localStorage.getItem(key); try { return JSON.parse(value); } catch (_) { return value; } },
    setStorageSync: function (key, value) { localStorage.setItem(key, JSON.stringify(value)); },
    removeStorageSync: function (key) { localStorage.removeItem(key); },
    onTouchStart: function (callback) { touch('pointerdown', callback); },
    onTouchMove: function (callback) { touch('pointermove', callback); },
    onTouchEnd: function (callback) { touch('pointerup', callback); },
    onTouchCancel: function (callback) { touch('pointercancel', callback); },
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    onError: function (callback) { window.addEventListener('error', function (event) { callback(event.error || event.message); }); },
    onUnhandledRejection: function (callback) { window.addEventListener('unhandledrejection', callback); },
    setInnerAudioOption: function () {},
    onShow: function () {}, onHide: function () {}, onMemoryWarning: function () {},
    vibrateShort: function () {}, setKeepScreenOn: function () {}
  };
})();
