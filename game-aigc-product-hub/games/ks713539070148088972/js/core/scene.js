/**
 * core/scene.js — 场景状态机
 * 职责：
 *   - 管理 welcome / home / game 三个「主场景」的切换（go）
 *   - 管理弹窗/浮层类场景的叠加显示（open/close），不丢失下层场景的绘制
 *   - 每个场景有 enter / exit / update / draw 钩子
 *   - 禁止业务场景直接访问其他场景的内部状态
 * 依赖：无（仅事件总线 EventBus）
 * 导出：SceneManager
 *
 * 用法：
 *   SceneManager.register('welcome', WelcomeScene);
 *   SceneManager.go('welcome');              // 主场景切换（welcome/home/game）
 *   SceneManager.open('settings-overlay');   // 打开浮层（叠加在当前主场景/其他浮层之上）
 *   SceneManager.close();                    // 关闭最上层浮层
 *
 * 设计说明（重要）：
 *   go() 只用于三个主场景之间的切换，会清空浮层栈并整体替换 _current。
 *   open()/close() 用于所有「弹窗/浮层」类场景（设置/解锁/结算/战绩等），
 *   它们叠加在主场景之上以栈的形式管理，draw() 会先画主场景再依次画浮层栈，
 *   因此浮层不会导致下层场景背景丢失（历史 bug：浮层曾经也用 go() 实现，
 *   导致整个背景被替换成纯黑，见 rewrite-architecture-doc.md）。
 *   update() 只驱动最上层浮层（浮层打开时冻结其下场景，与旧版单场景机行为一致）。
 */
(function () {
  'use strict';

  /** @type {Object.<string, {enter?, exit?, update?, draw?}>} */
  var _registry = {};
  var _current   = null;
  var _currentId = '';

  /** 浮层栈：[{id, scene}]，栈顶（数组末尾）为当前最上层浮层 */
  var _overlayStack = [];

  var SceneManager = window.SceneManager = {

    /**
     * 注册场景（主场景或浮层场景，注册方式相同，区别仅在于用 go() 还是 open() 呼出）
     * @param {string} id
     * @param {{enter?, exit?, update?, draw?}} scene
     */
    register: function (id, scene) {
      _registry[id] = scene;
    },

    /**
     * 切换主场景（welcome/home/game 之间切换）
     * 会先关闭全部浮层、退出当前主场景，再进入新主场景。
     * @param {string} id
     * @param {*} [params]  透传给 scene.enter(params)
     */
    go: function (id, params) {
      // 主场景切换可能发生在系统弹窗/广告中断触摸之后，旧拖拽状态不能带到新场景。
      if (window.InputManager && InputManager.cancelDrag) InputManager.cancelDrag();
      this.closeAll();

      if (_current && _current.exit) {
        try { _current.exit(); } catch (e) { console.error('[Scene] exit error', _currentId, e); }
      }
      var next = _registry[id];
      if (!next) {
        console.error('[Scene] not registered:', id);
        return;
      }
      _current   = next;
      _currentId = id;
      if (next.enter) {
        try { next.enter(params); } catch (e) { console.error('[Scene] enter error', id, e); }
      }
    },

    /**
     * 打开浮层（叠加在当前主场景/其他浮层之上，不影响下层场景状态与绘制）
     * 所有弹窗/浮层类场景（设置/解锁/结算/战绩等）均应通过此方法呼出。
     * @param {string} id
     * @param {*} [params]  透传给 scene.enter(params)
     */
    open: function (id, params) {
      var next = _registry[id];
      if (!next) {
        console.error('[Scene] not registered:', id);
        return;
      }
      _overlayStack.push({ id: id, scene: next });
      if (next.enter) {
        try { next.enter(params); } catch (e) { console.error('[Scene] enter error', id, e); }
      }
    },

    /** 关闭最上层浮层，露出下方场景（主场景或更下层浮层） */
    close: function () {
      var top = _overlayStack.pop();
      if (!top) return;
      if (top.scene.exit) {
        try { top.scene.exit(); } catch (e) { console.error('[Scene] exit error', top.id, e); }
      }
    },

    /** 关闭全部浮层 */
    closeAll: function () {
      while (_overlayStack.length) this.close();
    },

    /** 每帧 update：仅驱动最上层浮层；无浮层时驱动主场景 */
    update: function (dt) {
      if (_overlayStack.length) {
        var top = _overlayStack[_overlayStack.length - 1];
        if (top.scene.update) {
          try { top.scene.update(dt); } catch (e) { console.error('[Scene] update error', top.id, e); }
        }
        return;
      }
      if (_current && _current.update) {
        try { _current.update(dt); } catch (e) { console.error('[Scene] update error', _currentId, e); }
      }
    },

    /** 每帧 draw：先画主场景，再按栈底→栈顶依次画浮层（保证浮层背景不丢失） */
    draw: function () {
      if (_current && _current.draw) {
        try { _current.draw(); } catch (e) { console.error('[Scene] draw error', _currentId, e); }
      }
      for (var i = 0; i < _overlayStack.length; i++) {
        var o = _overlayStack[i];
        if (o.scene.draw) {
          try { o.scene.draw(); } catch (e) { console.error('[Scene] draw error', o.id, e); }
        }
      }
    },

    /** 当前主场景 id */
    current: function () { return _currentId; },

    /** 当前最上层浮层 id（无浮层时返回 null） */
    topOverlay: function () {
      return _overlayStack.length ? _overlayStack[_overlayStack.length - 1].id : null;
    },

    /** 浮层栈中是否包含指定 id */
    hasOverlay: function (id) {
      for (var i = 0; i < _overlayStack.length; i++) {
        if (_overlayStack[i].id === id) return true;
      }
      return false;
    }
  };
})();
