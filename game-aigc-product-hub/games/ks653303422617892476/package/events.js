"use strict";

/**
 * 事件总线 - 供游戏各模块之间通信
 * EventsManager: on / once / off / emit
 */
var events = [];
var EventsManager = {
  on: function on(eventName, callback) {
    events.push({ eventName: eventName, callback: callback, once: false });
  },
  once: function once(eventName, callback) {
    events.push({ eventName: eventName, callback: callback, once: true });
  },
  off: function off(eventName, callback) {
    events.forEach(function (item, index) {
      if (item.eventName === eventName) {
        if (!callback || item.callback === callback) {
          events.splice(index, 1);
        }
      }
    });
  },
  emit: function emit(eventName) {
    for (var _len = arguments.length, args = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      args[_key - 1] = arguments[_key];
    }
    var res = [];
    var indexs = [];
    events.forEach(function (item, index) {
      if (item.eventName === eventName) {
        res.push(item.callback.apply(item, args));
        if (item.once) { indexs.unshift(index); }
      }
    });
    indexs.forEach(function (value) { events.splice(value, 1); });
    return res;
  }
};
GameGlobal.events = EventsManager;
