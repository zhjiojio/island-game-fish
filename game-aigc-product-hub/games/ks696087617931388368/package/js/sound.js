/**
 * sound.js — 游戏音效统一入口
 *
 * 音频通过标准模块 api/kwai-media.js（KwaiMedia.Audio）播放：
 *   M3.Sound.play('click');
 *
 * 事件映射（音频文件在 package/audio/，源自用户提供的音效包）：
 *   click      点击           ← 点击.mp3（按钮反馈）
 *   carStart   汽车启动       ← 汽车启动.mp3（排队车进位上车）
 *   win        成功弹窗       ← 成功弹窗.mp3（过关弹窗）
 *   fail       失败           ← 失败.mp3（本关失败、可复活弹窗）
 *   lose       输了           ← 输了.mp3（最终失败弹窗）
 *   popupFail  弹窗失败       ← 弹窗失败.mp3（广告未完成等领取失败）
 *   error      错误           ← 错误.mp3（无效操作，如车位已满）
 *
 * 设置面板开关（progress.settings，从上到下：声音/震动/音乐）：
 *   settings[0] 声音 → 音效开关（通过 KwaiMedia.Audio.setSfxEnabled 同步）
 *   settings[1] 震动 → game.js haptic() 内部判断
 *   settings[2] 音乐 → BGM 开关（通过 KwaiMedia.Audio.setBgmEnabled 同步）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};
  var files = {
    click: 'audio/click.mp3',
    carStart: 'audio/car-start.mp3',
    win: 'audio/win.mp3',
    fail: 'audio/fail.mp3',
    lose: 'audio/lose.mp3',
    popupFail: 'audio/popup-fail.mp3',
    error: 'audio/error.mp3'
  };
  M3.Sound = {
    play: function (name) {
      var audio = window.KwaiMedia && window.KwaiMedia.Audio;
      if (!audio || !files[name]) return;
      audio.playSfx(files[name]);
    }
  };
}());
