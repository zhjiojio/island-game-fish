(function () {
  var cache = {}, groups = {}, M3 = window.M3;
  function release(key) {
    var item = cache[key];
    if (!item) return;
    item.refs = Math.max(0, item.refs - 1);
    if (!item.refs) { item.resource.onload = null; item.resource.onerror = null; delete cache[key]; }
  }
  function acquire(type, key, src, group) {
    if (type !== 'image') throw new Error('不支持的资源类型');
    var item = cache[key], live = true;
    if (!item) {
      item = { resource: window.wxhelper.CreateImage(), refs: 0, state: 'loading' };
      cache[key] = item;
      item.resource.onload = function () { item.state = 'loaded'; };
      item.resource.onerror = function () { item.state = 'failed'; };
      if (item.resource.complete && item.resource.naturalWidth) item.state = 'loaded';
      item.resource.src = src;
    }
    item.refs++;
    var handle = { resource: item.resource, release: function () { if (live) { live = false; release(key); } } };
    if (group) { if (!groups[group]) groups[group] = []; groups[group].push(handle); }
    return handle;
  }
  M3.AssetManager = {
    acquire: acquire,
    get: function (key) { return cache[key] && cache[key].state === 'loaded' ? cache[key].resource : null; },
    getState: function (key) { return cache[key] ? cache[key].state : 'missing'; },
    releaseGroup: function (group) { var list = groups[group] || []; for (var i = 0; i < list.length; i++) list[i].release(); delete groups[group]; },
    stats: function () {
      var total = 0, loaded = 0, failed = 0, refs = 0;
      for (var key in cache) { total++; refs += cache[key].refs; if (cache[key].state === 'loaded') loaded++; if (cache[key].state === 'failed') failed++; }
      return { total: total, loaded: loaded, failed: failed, refs: refs };
    }
  };
}());
