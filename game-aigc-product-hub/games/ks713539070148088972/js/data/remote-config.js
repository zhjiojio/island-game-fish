/**
 * data/remote-config.js — 远程关卡配置加载器
 * 职责：
 *   - 拉取远程 JSON（唯一配置来源，无本地 baseline）
 *   - 超时/失败 → 重试（最多 3 次），最终失败 → 空态 UI + 重试按钮
 *   - 支持回调注册（remoteLevelsReady）
 *   - hiddenIdxRanges 运行时过滤
 * 依赖：CONFIG, Storage
 * 导出：RemoteConfig
 *
 * 状态流转：idle → loading → success / error / timeout
 */
(function () {
  'use strict';

  var _status    = 'idle';     // idle | loading | success | error | timeout
  var _callbacks = [];
  var _retryCount = 0;
  var MAX_RETRY   = 3;

  /** 解析后的原始数据（未过滤） */
  var _raw = null;

  var RemoteConfig = window.RemoteConfig = {

    /** 当前状态 */
    status: function () { return _status; },

    /** themes 数组（已过滤 hidden） @type {object[]} */
    themes:     [],
    /** levels 数组（已过滤 hiddenIdxRanges） @type {object[]} */
    levels:     [],
    /** props 元数据 @type {object} */
    props:      {},
    /**
     * 提示/吐槽类文案 @type {string[]}
     * 注：远程 JSON 里这个字段历史上叫 laotieLines（"老铁眼真尖"这个产品自己的
     * 命名），换游戏后这个措辞不通用，这里对外暴露成中性的 tauntLines；解析时
     * 优先读新字段名 tauntLines，读不到再兼容旧的 laotieLines，避免线上现存的
     * 远程 JSON（还没来得及改字段名）突然失效。
     */
    tauntLines: [],

    /**
     * 开始加载远程配置
     * @param {Function} [onReady]  成功后回调（也可用 onReady 单独注册）
     */
    load: function (onReady) {
      if (onReady) _callbacks.push(onReady);
      if (_status === 'success') {
        if (onReady) onReady(null, this);
        return;
      }
      if (_status === 'loading') return;
      _status = 'loading';

      // 本地 Mock 模式：跳过远程请求，直接使用 window.MOCK_LEVELS_CONFIG
      if (CONFIG.USE_MOCK_CONFIG) {
        if (window.MOCK_LEVELS_CONFIG) {
          console.warn('[RemoteConfig] USE_MOCK_CONFIG=true，使用本地 mock 配置（生产环境请勿开启）');
          this._onSuccess(window.MOCK_LEVELS_CONFIG);
        } else {
          console.error('[RemoteConfig] CONFIG.USE_MOCK_CONFIG=true 但未找到 window.MOCK_LEVELS_CONFIG，' +
            '请确认已加载 data/mock-levels-config.js');
          this._onFail(new Error('mock config not found'));
        }
        return;
      }

      this._fetch();
    },

    /**
     * 注册就绪回调（加载完成时立即触发，若已完成立即调用）
     * @param {Function} cb  function(err, remoteConfig)
     */
    onReady: function (cb) {
      if (_status === 'success') { cb(null, this); return; }
      if (_status === 'error' || _status === 'timeout') { cb(new Error(_status), null); return; }
      _callbacks.push(cb);
    },

    /** 手动重试（失败后显示重试按钮时调用） */
    retry: function () {
      _retryCount = 0;
      _status = 'idle';
      this.load();
    },

    /** @private */
    _fetch: function () {
      var self = this;
      var url  = CONFIG.REMOTE_CONFIG_URL + '?_t=' + Date.now();
      var timeout = CONFIG.REMOTE_CONFIG_TIMEOUT;

      var done = false;
      var timer = setTimeout(function () {
        if (done) return;
        done = true;
        self._onFail(new Error('timeout'));
      }, timeout);

      // 优先使用 ks.request，fallback fetch
      function doRequest(url, cb) {
        if (typeof ks !== 'undefined' && ks.request) {
          ks.request({
            url: url,
            method: 'GET',
            header: { 'Cache-Control': 'no-cache' },
            success: function (res) { cb(null, res.data); },
            fail:    function (err) { cb(err); }
          });
        } else if (typeof fetch !== 'undefined') {
          fetch(url, { cache: 'no-cache' })
            .then(function (r) { return r.json(); })
            .then(function (data) { cb(null, data); })
            .catch(function (e) { cb(e); });
        } else {
          var xhr = new XMLHttpRequest();
          xhr.open('GET', url);
          xhr.setRequestHeader('Cache-Control', 'no-cache');
          xhr.onload = function () {
            try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb(e); }
          };
          xhr.onerror = function () { cb(new Error('xhr error')); };
          xhr.send();
        }
      }

      doRequest(url, function (err, data) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err || !data) {
          self._onFail(err || new Error('empty response'));
        } else {
          self._onSuccess(data);
        }
      });
    },

    /** @private */
    _onSuccess: function (data) {
      this._parse(data);
      _status = 'success';
      _raw    = data;
      var self = this;
      _callbacks.forEach(function (cb) {
        try { cb(null, self); } catch (e) {}
      });
      _callbacks = [];
      console.info('[RemoteConfig] loaded:', this.themes.length, 'themes,', this.levels.length, 'levels');
    },

    /** @private */
    _onFail: function (err) {
      _retryCount++;
      console.warn('[RemoteConfig] load failed (attempt ' + _retryCount + '):', err);
      if (_retryCount < MAX_RETRY) {
        // 指数退避重试
        var self = this;
        setTimeout(function () { self._fetch(); }, Math.pow(2, _retryCount) * 1000);
      } else {
        _status = err && err.message === 'timeout' ? 'timeout' : 'error';
        var errObj = err;
        _callbacks.forEach(function (cb) {
          try { cb(errObj, null); } catch (e) {}
        });
        _callbacks = [];
      }
    },

    /** @private 解析并校验 JSON 数据 */
    _parse: function (data) {
      var self = this;

      // 提取 hiddenIdxRanges
      var hiddenRanges = data.hiddenIdxRanges || [];

      // themes
      // 注：theme.cover 现在是可选字段——CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover
      // 开启时（美女模板默认开启），卡片封面改用 getThemeCoverSrc() 取该主题第一关
      // 的场景图，不再强制要求远程下发 cover 链接；未开启该配置的老模版仍走 cover。
      var useFirstLevelScene = !!(window.CONFIG && CONFIG.TEMPLATE && CONFIG.TEMPLATE.home &&
        CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover);
      this.themes = (data.themes || []).filter(function (t) {
        if (!t || typeof t.id === 'undefined') return false;
        if (useFirstLevelScene) return true;
        return typeof t.cover === 'string' && t.cover.indexOf('http') === 0;
      });

      // levels（过滤 hiddenIdxRanges）
      this.levels = (data.levels || []).filter(function (lv) {
        if (!lv || typeof lv.idx === 'undefined') return false;
        for (var i = 0; i < hiddenRanges.length; i++) {
          var range = hiddenRanges[i];
          if (lv.idx >= range[0] && lv.idx <= range[1]) return false;
        }
        return true;
      });

      // props
      this.props = data.props || {};

      // tauntLines（兼容旧字段名 laotieLines）
      this.tauntLines = data.tauntLines || data.laotieLines || [];

      // 版本号
      this.version = data.version || '';
    },

    /**
     * 按 themeId 获取该主题的关卡列表（按 idx 排序）
     * @param {number|string} themeId
     * @returns {object[]}
     */
    getLevelsByTheme: function (themeId) {
      var id = parseInt(themeId, 10);
      return this.levels
        .filter(function (lv) { return lv.themeId === id; })
        .sort(function (a, b) { return a.idx - b.idx; });
    },

    /**
     * 按全局 idx 查找关卡
     * @param {number} idx
     * @returns {object|null}
     */
    getLevelByIdx: function (idx) {
      for (var i = 0; i < this.levels.length; i++) {
        if (this.levels[i].idx === idx) return this.levels[i];
      }
      return null;
    },

    /**
     * 按 themeId 查找主题
     * @param {number|string} id
     * @returns {object|null}
     */
    getTheme: function (id) {
      var tid = parseInt(id, 10);
      for (var i = 0; i < this.themes.length; i++) {
        if (this.themes[i].id === tid) return this.themes[i];
      }
      return null;
    },

    /**
     * 取主题专属 BGM CDN 地址。
     * 主题字段直接填写完整 URL，文件名/扩展名不做任何假设：
     * { "bgm": "https://cdn.example.com/任意文件名" }
     */
    getThemeBgmSrc: function (theme) {
      if (!theme) return null;
      var bgm = typeof theme.bgm === 'string' ? theme.bgm.trim() : '';
      // 只接受带有效主机部分的 http(s) URL；非法值/空值由调用方回退默认 BGM。
      if (!/^https?:\/\/[^\s/?#]+(?:[/?#][^\s]*)?$/i.test(bgm)) return null;
      return bgm;
    },

    /**
     * 取某主题用作卡片封面的图片 src。
     * CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover 开启时（美女模板默认开启），
     * 直接取该主题第一关（按 idx 排序）的场景图，按玩法区分主图字段，与
     * play.js _collectLevelSrcs 的字段来源保持一致：
     *   hidden/hunt/story → level.scene
     *   spot              → level.sceneA
     *   dressup           → level.characters[0].result（换装完成图，找不到再退回 .scene）
     * 未开启该配置或取不到时，回退到远程下发的 theme.cover。
     * @param {object} theme
     * @returns {string|null}
     */
    getThemeCoverSrc: function (theme) {
      if (!theme) return null;
      var useFirstLevelScene = !!(window.CONFIG && CONFIG.TEMPLATE && CONFIG.TEMPLATE.home &&
        CONFIG.TEMPLATE.home.useFirstLevelSceneAsCover);
      if (useFirstLevelScene) {
        var levels = this.getLevelsByTheme(theme.id);
        var firstLevel = levels && levels[0];
        if (firstLevel) {
          if (firstLevel.mode === 'spot' && firstLevel.sceneA) return firstLevel.sceneA;
          if (firstLevel.mode === 'dressup' && firstLevel.characters && firstLevel.characters[0]) {
            return firstLevel.characters[0].result || firstLevel.characters[0].scene || null;
          }
          // 拼图主题的 completeImage 通常配置在关卡上，不一定配置在 theme 上；
          // 主题没有 completeImage 时必须回退到主题自身的 cover，不能直接返回 null。
          if (firstLevel.mode === 'puzzle') {
            return firstLevel.completeImage || theme.completeImage || theme.cover || null;
          }
          if (firstLevel.scene) return firstLevel.scene;
        }
      }
      return theme.cover || null;
    }
  };
})();
