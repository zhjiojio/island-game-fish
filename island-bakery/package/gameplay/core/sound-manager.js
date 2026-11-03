(function () {
  var AIGCUtils = window.AIGCUtils;

  AIGCUtils.SoundManager = {
    bgmEnabled: true,
    sfxEnabled: true,

    init: function () {
      // 从存档读取设置
      try {
        if (typeof KwaiStorage !== "undefined") {
          var settings = KwaiStorage.getSync("island_bakery_settings");
          if (settings) {
            AIGCUtils.SoundManager.bgmEnabled = settings.bgmEnabled !== false;
            AIGCUtils.SoundManager.sfxEnabled = settings.sfxEnabled !== false;
          }
        }
      } catch (e) {
        console.error("[Sound] Load settings failed:", e);
      }
    },

    playBgm: function (name) {
      if (!AIGCUtils.SoundManager.bgmEnabled) return;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Audio) return;
      KwaiMedia.Audio.playBgm("res/audio/" + name + ".mp3");
    },

    playSfx: function (name) {
      if (!AIGCUtils.SoundManager.sfxEnabled) return;
      if (typeof KwaiMedia === "undefined" || !KwaiMedia.Audio) return;
      KwaiMedia.Audio.playSfx("res/audio/" + name + (name === "bite" ? ".wav" : ".mp3"));
    },

    // 播放收集音效
    playCollect: function () {
      AIGCUtils.SoundManager.playSfx("collect");
    },

    // 播放烘焙音效
    playBake: function () {
      AIGCUtils.SoundManager.playSfx("bake");
    },

    // 播放售卖音效
    playSell: function () {
      AIGCUtils.SoundManager.playSfx("sell");
    },

    // 播放金币音效
    playCoin: function () {
      AIGCUtils.SoundManager.playSfx("coin");
    },

    // 播放升级音效
    playUpgrade: function () {
      AIGCUtils.SoundManager.playSfx("upgrade");
    },

    // 播放防御音效
    playDefense: function () {
      AIGCUtils.SoundManager.playSfx("defense");
    },

    // 播放夜晚音效
    playNight: function () {
      AIGCUtils.SoundManager.playBgm("night");
    },

    // 播放白天音效
    playDay: function () {
      AIGCUtils.SoundManager.playBgm("day");
    },

    // 设置BGM开关
    setBgmEnabled: function (enabled) {
      AIGCUtils.SoundManager.bgmEnabled = enabled;
      if (typeof KwaiMedia !== "undefined" && KwaiMedia.Audio) {
        KwaiMedia.Audio.setBgmEnabled(enabled);
      }
      AIGCUtils.SoundManager.saveSettings();
    },

    // 设置SFX开关
    setSfxEnabled: function (enabled) {
      AIGCUtils.SoundManager.sfxEnabled = enabled;
      AIGCUtils.SoundManager.saveSettings();
    },

    saveSettings: function () {
      try {
        if (typeof KwaiStorage !== "undefined") {
          KwaiStorage.setSync("island_bakery_settings", {
            bgmEnabled: AIGCUtils.SoundManager.bgmEnabled,
            sfxEnabled: AIGCUtils.SoundManager.sfxEnabled,
          });
        }
      } catch (e) {
        console.error("[Sound] Save settings failed:", e);
      }
    },
  };
})();
