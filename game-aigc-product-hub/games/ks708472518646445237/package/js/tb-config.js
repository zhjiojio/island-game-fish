// js/tb-config.js — 提艾默酒吧·店长争夺战 · 全局配置与 CDN 资源基址
// 说明：快手小游戏为 Canvas 运行时，无 DOM。所有素材统一走 CDN，
//       由 tb-loader.js 负责 wx.downloadFile 缓存后交给 wx.createVideo / wx.createImage 使用。
(function () {
  var M3 = window.M3;

  // 2026-08-13 lihui26 更新：新桶 ks708472518646445237 存放我们新上传的 41 个素材；
  //   代码引用中未新增的 shot（opening/shot-02/10/14/17-20/25-29 等）仍回退老桶 ks654429322415476022。
  var CDN_NEW = 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks708472518646445237/';
  var CDN_OLD = 'https://p4-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks654429322415476022/';
  // 已迁移到新桶的资源白名单（去掉 assets/ 前缀后的 basename 匹配）
  var NEW_BASENAMES = {
    // videos
    'shot-05-beer-girl-full-v1-web.mp4':1,'shot-07-bartender-full-v1-web.mp4':1,'shot-08-singer-full-v1-web.mp4':1,'shot-09-dancer-full-v1-web.mp4':1,
    'shot-11a-beer-cheer-v1-web.mp4':1,'shot-11b-dancer-yoga-v1-web.mp4':1,'shot-11c-singer-chef-v1-web.mp4':1,'shot-11d-bartender-biker-v1-web.mp4':1,
    'shot-13a-beer-reveal-v1-web.mp4':1,'shot-13b-bartender-reveal-v1-web.mp4':1,'shot-13c-singer-reveal-v1-web.mp4':1,'shot-13d-dancer-reveal-v1-web.mp4':1,
    'shot-15-beer-dressing-room-v1-web.mp4':1,'shot-16-bartender-base-v1-web.mp4':1,'shot-16-dancer-base-v1-web.mp4':1,'shot-16-singer-base-v1-web.mp4':1,
    'shot-21-threat-lineup-v1-web.mp4':1,'shot-22-human-bar-v1-web.mp4':1,'shot-23-body-letter-v1-web.mp4':1,'shot-24-split-rps-v1-web.mp4':1,
    'shot-27-final-sprint-v1-web.mp4':1,'shot-30-coronation-v1-web.mp4':1,
    // keyframes
    'shot-05-beer-girl-v1-crop.png':1,'shot-07a-bartender-flair-v1.png':1,'shot-08a-singer-mic-v1.png':1,'shot-09a-dancer-backlight-v1.png':1,
    'shot-11a-beer-cheer-v1.png':1,'shot-13a-beer-reveal-v1.png':1,'shot-13b-bartender-reveal-v1.png':1,'shot-13c-singer-reveal-v1.png':1,'shot-13d-dancer-reveal-v1.png':1,
    'shot-15-beer-base-v1.png':1,'shot-16-bartender-base-v1.png':1,'shot-16-dancer-base-v1.png':1,'shot-16-singer-base-v1.png':1,
    'shot-21-threat-lineup-v1.png':1,'shot-22-human-bar-v1.png':1,'shot-23-body-letter-v1.png':1,'shot-24-split-rps-v1.png':1,
    'shot-27-final-sprint-v1.png':1,'shot-30-coronation-v1.png':1,
    // v1.0.10 高清头像 + 感谢首帧（新桶 ks708472518646445237）
    'avatar-pijiu-v2.png':1,'avatar-tiaojiu-v2.png':1,'avatar-zhuchang-v2.png':1,'avatar-lingwu-v2.png':1,
    'thanks-pijiu-v1.png':1,'thanks-tiaojiu-v1.png':1,'thanks-zhuchang-v1.png':1,'thanks-lingwu-v1.png':1,
    // v1.0.10 感谢视频
    'thanks-pijiu-v1-web.mp4':1,'thanks-tiaojiu-v1-web.mp4':1,'thanks-zhuchang-v1-web.mp4':1,'thanks-lingwu-v1-web.mp4':1
  };
  var CDN = CDN_NEW; // 默认主桶（兼容旧代码引用 M3.Config.CDN）

  M3.Config = {
    // 资源基址：本地相对路径（如 assets/video/xxx.mp4）会被拼成 CDN 绝对地址
    CDN: CDN,

    // 2026-08-14 商业化策略：移除自然增长，仅通过看广告获得星光。
    STAR_RATE: 0,          // 保留字段兼容旧代码；tick 不再产出
    STAR_TICK_MS: 3000,    // 保留字段兼容旧代码
    // 初始见面礼（唯一免费星光来源）
    STAR_INIT: 100,
    STAR_MAX: 9999,        // 移除自然增长后不再需要压制上限
    // 观看一次激励视频的星光奖励
    AD_REWARD: 300,
    // 单次启动允许的激励视频观看次数上限
    AD_MAX_VIEW: 8,
    OUTFIT_COST: { accessory: 300, clothes: 800, prop: 500 },
    OUTFIT_UNLOCK_COST: 100,
    OTHER_ROOM_MULT: 1.5,

    // 原项目四幕双轨声场：BGM 与酒吧环境声持续循环，对白期间自动压低。
    SOUNDSCAPE: {
      opening:  { bgm: 'media/soundscape/opening-bgm.mp3',  ambient: null },
      showcase: { bgm: 'media/soundscape/showcase-bgm.mp3', ambient: null },
      pk:       { bgm: 'media/soundscape/pk-bgm.mp3',       ambient: null },
      finale:   { bgm: 'media/soundscape/finale-bgm.mp3',   ambient: null }
    },

    // 主题色
    COLOR: {
      gold:    '#ffd876',
      goldDim: '#c98b28',
      text:    '#ffffff',
      sub:     'rgba(255,255,255,.62)',
      pink:    '#ff5c8a',
      purple:  '#8b5cf6',
      cyan:    '#22d3ee',
      panel:   'rgba(12,8,20,.72)',
      line:    'rgba(255,216,118,.55)'
    },

    // 名次徽章配色
    RANK_COLOR: ['#ffd876', '#d8dae6', '#d9955a', '#7c7f92']
  };

  // 将资源相对路径解析为 CDN 绝对地址；已是 http(s) 的原样返回。
  // 注意：CDN 上传时 assets/ 前缀被去掉，因此这里同步剥离，
  //       assets/video/x.mp4 → <CDN>/video/x.mp4
  M3.Config.url = function (file) {
    if (!file) return '';
    if (/^https?:\/\//.test(file)) return file;
    if (/^media\//.test(file)) return file;
    var rel = String(file).replace(/^\.?\//, '').replace(/^assets\//, '');
    // 白名单命中 → 新桶；否则回退老桶
    var base = rel.split('/').pop();
    return (NEW_BASENAMES[base] ? CDN_NEW : CDN_OLD) + rel;
  };
})();
