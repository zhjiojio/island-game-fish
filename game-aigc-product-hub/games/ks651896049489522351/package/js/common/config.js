(function () {
  var M3 = window.M3 = window.M3 || {};


  // ---- 服务端地址配置 ----
  // WS_PORT：本地/局域网联调时的 WebSocket 端口（server/index.js 默认 8080）
  // FALLBACK_SERVER_URL：无 location 的环境（如快手小游戏）使用的地址。
  //   默认指向 localhost，保证本地开箱即用、不需修改任何代码；
  //   上线前改为真实线上地址（如 wss://ddz.example.com），
  //   或在入口处设置 window.__DDZ_SERVER_URL__ 做构建期注入。
  var WS_PORT = 8080;
  var FALLBACK_SERVER_URL = 'ws://localhost:' + WS_PORT;

  // ---- 游戏常量 ----
  M3.Config = {
    // 花色
    SUITS: ['spades', 'hearts', 'clubs', 'diamonds'],
    SUIT_SYMBOLS: { spades: '♠', hearts: '♥', clubs: '♣', diamonds: '♦' },
    SUIT_COLORS: { spades: 'black', hearts: 'red', clubs: 'black', diamonds: 'red' },

    // 牌面标签
    RANK_LABELS: { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: '小王', 17: '大王' },

    // WebSocket 服务器地址。
    // 原先硬编码内网 IP（ws://172.23.176.75:8080），导致每次联调都要改这一行、
    // 反复污染 git diff。现改为按运行环境自动推导：
    //   1) window.__DDZ_SERVER_URL__  —— 显式覆盖（调试或构建期注入优先）
    //   2) H5 浏览器                  —— 复用当前页面 host，自动匹配 ws/wss
    //   3) 快手小游戏等无 location 环境 —— 回落 FALLBACK_SERVER_URL（默认 localhost）
    SERVER_URL: (function () {
      if (typeof window !== 'undefined' && window.__DDZ_SERVER_URL__) {
        return window.__DDZ_SERVER_URL__;
      }
      var loc = (typeof location !== 'undefined') ? location : null;
      if (loc && loc.hostname) {
        var proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
        // 本地/局域网调试：H5 页面与 WebSocket 同机，仅端口不同
        return proto + '//' + loc.hostname + ':' + WS_PORT;
        // return "wss://minigame-test-service-302524-11-1474645456.sh.run.tcloudbase.com";
      }
      return FALLBACK_SERVER_URL;
    })(),

    HTTP_SERVER_URL: (function () {
      if (typeof window !== 'undefined' && window.__DDZ_HTTP_SERVER_URL__) return window.__DDZ_HTTP_SERVER_URL__;
      var wsUrl = (typeof window !== 'undefined' && window.__DDZ_SERVER_URL__) || '';
      if (!wsUrl && typeof location !== 'undefined' && location.hostname) {
        return (location.protocol === 'https:' ? 'https:' : 'http:') + '//' + location.hostname + ':' + WS_PORT;
      }
      wsUrl = wsUrl || FALLBACK_SERVER_URL;
      return wsUrl.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:');
    })(),

    // 颜色主题
    C: {
      bg1: '#082a1c', bg2: '#0f4432',
      panel: 'rgba(6,36,24,.88)', panelBorder: 'rgba(42,166,120,.55)',
      cardWhite: '#fcfcf9', cardRed: '#dc2626', cardBlack: '#1a1a1a',
      gold: '#f59e0b', goldL: '#fcd34d', goldD: '#b45309',
      btnGreen: '#059669', btnGreenL: '#10b981',
      btnRed: '#b91c1c', btnRedL: '#ef4444',
      btnGray: '#334155', btnGrayL: '#475569',
      textWhite: '#f1f5f9', textMuted: '#94a3b8',
      textBright: '#fef3c7',
      selectedGlow: 'rgba(251,191,36,.4)',
    },

    // 字体
    FONT: '"PingFang SC","Microsoft YaHei","Noto Sans SC",sans-serif',
  };

  // 调试开关
  M3.DEBUG = false;
  M3.log = function (tag, msg, data) {
    if (!M3.DEBUG) return;
    var args = ['[DDZ:' + tag + ']'];
    if (msg) args.push(msg);
    if (data !== undefined) args.push(JSON.stringify(data));
    console.log.apply(console, args);
  };
})();