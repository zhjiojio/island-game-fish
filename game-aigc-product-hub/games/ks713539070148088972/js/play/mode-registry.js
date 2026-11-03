/**
 * play/mode-registry.js — 玩法模式注册表
 * 职责：
 *   - 注册所有玩法模式（ModeRegistry.register）
 *   - 按 mode id 创建对应的玩法实例（ModeRegistry.create）
 *   - 新增玩法：只需创建 modes/{id}.js 并在此注册，无需改 play.js
 * 依赖：CONFIG（GAMEPLAY_MODES 配置）
 * 导出：ModeRegistry
 *
 * 模式接口约定（每个 mode 对象需实现）：
 *   mode.hitTest(cx, cy, hits) → { hit: boolean, oddIdx: number }
 *   mode.onCorrect(oddIdx, cx, cy)
 *   mode.draw(state)
 *   mode.update(dt)         （可选）
 *   mode.showNarrative(text)（可选，story 专用）
 */
(function () {
  'use strict';

  /** @type {Object.<string, Function>} id → 构造函数 */
  var _registry = {};

  var ModeRegistry = window.ModeRegistry = {

    /**
     * 注册玩法模式
     * @param {string} id          CONFIG.GAMEPLAY_MODES 里的 id
     * @param {Function} ModeClass  new ModeClass(level, theme) 创建实例
     */
    register: function (id, ModeClass) {
      _registry[id] = ModeClass;
    },

    /**
     * 创建玩法实例
     * @param {string} id
     * @param {object} level
     * @param {object} theme
     * @returns {object}  mode 实例
     */
    create: function (id, level, theme) {
      var Cls = _registry[id];
      if (!Cls) {
        console.error('[ModeRegistry] unregistered mode:', id);
        return null;
      }
      return new Cls(level, theme);
    },

    /**
     * 获取玩法自己的资源分组。每组是一个资源数组，数组顺序就是加载优先级。
     * 玩法只负责理解自己的关卡字段，PlayController 负责统一去重和加载。
     */
    getAssetGroups: function (id, level, theme) {
      var Cls = _registry[id];
      if (!Cls || typeof Cls.collectAssetGroups !== 'function') return null;
      return Cls.collectAssetGroups(level, theme);
    },

    /** 获取所有已注册模式 id 列表 */
    list: function () {
      return Object.keys(_registry);
    }
  };
})();
