(function () {
  window.KwaiStorage = {
    get: function (key) {
      try {
        var v = typeof ks !== 'undefined' && ks.getStorageSync ? ks.getStorageSync(key) : JSON.parse(window.localStorage.getItem(key));
        // Some iOS containers return frozen native-backed objects from
        // getStorageSync; round-trip so callers can freely assign to it.
        if (v && typeof v === 'object') return JSON.parse(JSON.stringify(v));
        return v;
      } catch (error) { return null; }
    },
    set: function (key, value) {
      try {
        if (typeof ks !== 'undefined' && ks.setStorageSync) ks.setStorageSync(key, value);
        else window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) { return false; }
    }
  };
}());
