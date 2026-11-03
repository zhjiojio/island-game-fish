/**
 * scene-settings.js — 音频设置配置（读写存储 + 应用到 KwaiMedia）
 *
 * 弹窗 UI 已并入 scene-profile.js 的「设置」Tab；本模块只保留配置逻辑，
 * 供 main.js 启动、game.js、scene-profile.js 开关切换时调用。
 *
 * 存储键：
 *   ddz_bgm_enabled   "1" | "0"
 *   ddz_sfx_enabled   "1" | "0"
 *
 * 默认值：bgm enabled, sfx enabled
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // ── 存储 ─────────────────────────────────────────────────────────
  var KEYS = {
    bgmEnabled: 'ddz_bgm_enabled',
    sfxEnabled: 'ddz_sfx_enabled',
  };
  var DEFAULTS = { bgmEnabled: true, sfxEnabled: true };

  function readStorage(key) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.getSync) return KwaiStorage.getSync(key);
      if (typeof localStorage !== 'undefined') return localStorage.getItem(key);
    } catch (e) {}
    return null;
  }
  function writeStorage(key, value) {
    try {
      if (typeof KwaiStorage !== 'undefined' && KwaiStorage.setSync) KwaiStorage.setSync(key, value);
      else if (typeof localStorage !== 'undefined') localStorage.setItem(key, value);
    } catch (e) {}
  }

  function loadConfig() {
    var cfg = {};
    var v = readStorage(KEYS.bgmEnabled);
    cfg.bgmEnabled = (v != null && v !== '') ? !!(+v) : DEFAULTS.bgmEnabled;
    v = readStorage(KEYS.sfxEnabled);
    cfg.sfxEnabled = (v != null && v !== '') ? !!(+v) : DEFAULTS.sfxEnabled;
    return cfg;
  }

  var _cfg = loadConfig();

  function saveConfig() {
    writeStorage(KEYS.bgmEnabled, _cfg.bgmEnabled ? '1' : '0');
    writeStorage(KEYS.sfxEnabled, _cfg.sfxEnabled ? '1' : '0');
  }

  // 首次进入时立即持久化默认配置
  if (!readStorage(KEYS.bgmEnabled)) {
    saveConfig();
  }

  // ── 应用配置到音频引擎（只控制开关）──────────────────────────────
  function applyConfig() {
    if (typeof KwaiMedia === 'undefined' || !KwaiMedia.Audio) return;
    var A = KwaiMedia.Audio;
    if (A.setBgmEnabled) A.setBgmEnabled(_cfg.bgmEnabled);
    if (A.setSfxEnabled) A.setSfxEnabled(_cfg.sfxEnabled);
  }

  // 开关切换入口：更新内存配置并立即应用到音频引擎。
  function setToggle(key, val) {
    if (!(key in KEYS)) return false;
    _cfg[key] = !!val;
    saveConfig();
    applyConfig();
    return true;
  }

  // ── 公开接口 ────────────────────────────────────────────────────
  M3.SceneSettings = {
    applyConfig: applyConfig,
    setToggle: setToggle,
    getConfig: function () { return Object.assign({}, _cfg); },
  };
})();
