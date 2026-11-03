/**
 * subpackages/ingame/game.js — 分包「ingame」入口
 *
 * 内容：牌局图片（card-atlas 等）、局内 BGM（bgm_room.mp3）、
 *       局内 Spine 特效（sandaiyi / feiji / wangzha / zhadan / spring）。
 *
 * ks.loadSubpackage({ name: 'ingame' }) 下载完成后本文件自动执行一次。
 * 本项目业务代码全部在主包（挂 window 全局），分包内仅资源，
 * 这里不做任何注册/加载逻辑；资源访问与下载等待由主包
 * js/common/subpackage.js 的门禁统一处理。
 */
(function () {
  // 资源包：无代码，无需注册。
})();
