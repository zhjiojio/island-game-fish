/**
 * asset-manager.js — 统一资源管理器（引用计数 + 双端适配）
 *
 *   ① 所有资源统一经 AIGCUtils.AssetManager 管理（目前仅管理 image）
 *   ② 引用计数：acquire() +1, release() -1，归零销毁
 *   ③ 分组释放：releaseGroup(label) 批量清理（切场景用）
 *   ④ 双端适配：快手 ks.createImage / ks.createInnerAudioContext
 *
 * 使用方式：
 *
 *   // 获取资源（引用计数 +1）
 *   var h = AIGCUtils.AssetManager.acquire('image', 'bg', 'asset/image/bg.png', 'scene:home');
 *   // h.resource → Image 对象，h.release() → 引用 -1
 *
 *   // 纯读取（不改变引用计数）
 *   var img = AIGCUtils.AssetManager.get('bg');
 *
 *   // 切场景释放
 *   AIGCUtils.AssetManager.releaseGroup('scene:home');
 *
 *   // 控制台调试
 *   AIGCUtils.AssetManager.stats()     // → { total, loaded, refs, created, destroyed }
 *   AIGCUtils.AssetManager.logStats()  // 带格式输出
 *   AIGCUtils.AssetManager.getState('bg')  // 单个资源详情
 */
(function () {
  var AIGCUtils = window.AIGCUtils = window.AIGCUtils || {};

  // ── 双端检测 ─────────────────────────────────────────────────
  var _isKwai = typeof ks !== 'undefined';

 function _createImage() {
    if (_isKwai) {
      try { return ks.createImage(); } catch (e) {}
   }
    return new Image();
  }

  function _destroyImage(img) {
    try { img.src = ''; } catch (e) {}
  }

  // ── 资源记录 ─────────────────────────────────────────────────
  var _registry = {};
  var _totalCreated = 0;
  var _totalDestroyed = 0;

  function _ensure(key, type, src) {
    if (_registry[key]) return _registry[key];
    var entry = {
      type: type,
      src: src,
      key: key,
      resource: null,
      refCount: 0,
      groups: [],
      loaded: false,
      onLoad: []
    };
    if (type === 'image') {
      entry.resource = _createImage();
      entry.resource.onload = function () {
        entry.loaded = true;
        var cbs = entry.onLoad;
        entry.onLoad = [];
        for (var i = 0; i < cbs.length; i++) cbs[i](entry.resource);
      };
      entry.resource.onerror = function () {
        entry.loaded = false;
      };
      if (AIGCUtils.ResourceLoader) {
        AIGCUtils.ResourceLoader.resolve(src, function (realSrc) { entry.resource.src = realSrc; });
      } else {
        entry.resource.src = src;
      }
    } else {
      return null;
    }
    _totalCreated++;
    _registry[key] = entry;
    return entry;
  }

  function _destroy(entry) {
    if (!entry || !entry.resource) return;
    _totalDestroyed++;
    try {
      if (entry.type === 'image') _destroyImage(entry.resource);
    } catch (e) {}
    entry.resource = null;
    entry.loaded = false;
  }

  // ── 公开 API ─────────────────────────────────────────────────
  AIGCUtils.AssetManager = {
    acquire: function (type, key, src, group) {
      var entry = _ensure(key, type, src);
      if (!entry) return null;
      entry.refCount++;
      if (group && entry.groups.indexOf(group) === -1) entry.groups.push(group);
      var self = this;
      return {
        resource: entry.resource,
        release: function () { self.release(key); }
      };
    },

    release: function (key) {
      var entry = _registry[key];
      if (!entry) return;
      entry.refCount = Math.max(0, entry.refCount - 1);
      if (entry.refCount <= 0) {
        _destroy(entry);
        delete _registry[key];
      }
    },

    releaseGroup: function (group) {
      var keys = Object.keys(_registry);
      for (var i = 0; i < keys.length; i++) {
        var entry = _registry[keys[i]];
        if (entry && entry.groups.indexOf(group) !== -1) {
          this.release(keys[i]);
        }
      }
    },

    get: function (key) {
      var entry = _registry[key];
      return (entry && entry.resource) ? entry.resource : null;
    },

    loaded: function (key) {
      var entry = _registry[key];
      return !!(entry && entry.loaded);
    },

    ready: function (key) {
      var self = this;
      return new Promise(function (resolve) {
        var entry = _registry[key];
        if (!entry) { resolve(null); return; }
        if (entry.loaded) { resolve(entry.resource); return; }
        entry.onLoad.push(function (res) { resolve(res); });
      });
    },

    preload: function (items) {
      var self = this;
      var handles = [];
      var promises = [];
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        var h = self.acquire(item.type, item.key, item.src, 'preload');
        if (h) {
          handles.push(h);
          promises.push(self.ready(item.key));
        }
      }
      return Promise.all(promises).then(function () {
        return handles;
      });
    },

    getState: function (key) {
      var entry = _registry[key];
      if (!entry) return null;
      return {
        type: entry.type,
        src: entry.src,
        loaded: entry.loaded,
        refCount: entry.refCount,
        groups: entry.groups.slice(),
      };
    },

    stats: function () {
      var keys = Object.keys(_registry);
      var total = keys.length;
      var loaded = 0;
      var byType = {};
      var totalRefs = 0;
      for (var i = 0; i < keys.length; i++) {
        var e = _registry[keys[i]];
        if (e.loaded) loaded++;
        byType[e.type] = (byType[e.type] || 0) + 1;
        totalRefs += e.refCount;
      }
      return {
        total: total,
        loaded: loaded,
        byType: byType,
        totalRefs: totalRefs,
        keys: keys,
        created: _totalCreated,
        destroyed: _totalDestroyed,
      };
    },

    logStats: function () {
      var s = this.stats();
      var lines = [];
      lines.push('══════ 资源统计 ══════');
      lines.push('  资源数: ' + s.total + ' (' + s.loaded + ' 已加载)');
      lines.push('  引用数: ' + s.totalRefs);
      lines.push('  创建: ' + s.created + ' | 销毁: ' + s.destroyed);
      var typeNames = { image: '图片', audio: '音频', font: '字体' };
      for (var t in s.byType) {
        lines.push('  ' + (typeNames[t] || t) + ': ' + s.byType[t]);
      }
      if (s.keys.length) {
        lines.push('  明细:');
        for (var ki = 0; ki < s.keys.length; ki++) {
          var e = _registry[s.keys[ki]];
          var icon = e.loaded ? '\u2713' : '\u2717';
          lines.push('    ' + s.keys[ki] + ' 引用=' + e.refCount + ' ' + icon + ' [' + (e.groups.join(',') || '-') + ']');
        }
      }
      lines.push('═══════════════════════');
      console.log(lines.join('\n'));
    },

    destroyAll: function () {
      var keys = Object.keys(_registry);
      for (var i = 0; i < keys.length; i++) {
        _destroy(_registry[keys[i]]);
        delete _registry[keys[i]];
      }
      _registry = {};
    }
  };
})();
