/**
 * kwai-network.js — 快手小游戏网络请求模块（对外导出精简版，仅保留 downloadFile）
 *
 * 本文件为对外导出覆盖版本，由 build-devkit.sh 在同步 Template/ 后用其覆盖
 * devkit Template/kwaiOpenApi/kwai-network.js。内部完整版（含 request/uploadFile/
 * connectSocket）维护于 skills/agw-scaffold/Template/kwaiOpenApi/kwai-network.js，
 * 不对外提供，禁止在此补回。
 *
 * 快手环境：使用 ks.downloadFile
 * Web 环境：使用 fetch 降级为 Blob URL
 *
 * 使用方式：
 *   KwaiNetwork.downloadFile({
 *     url:       'https://cdn.example.com/patch.zip',
 *     onSuccess: function(res) { console.log(res.tempFilePath); },
 *     onFail:    function(err) {},
 *   });
 */

(function () {

  var _isKwai = typeof ks !== 'undefined';

  // ─── downloadFile ─────────────────────────────────────────

  function downloadFile(options) {
    options = options || {};
    var onSuccess  = options.onSuccess  || function () {};
    var onFail     = options.onFail     || function () {};
    var onProgress = options.onProgress || null;

    if (_isKwai) {
      var task = ks.downloadFile({
        url:    options.url,
        header: options.header || {},
        success: function (res) {
          console.log('[KwaiNetwork] 下载完成', res.tempFilePath);
          onSuccess(res);
        },
        fail: function (err) {
          console.warn('[KwaiNetwork] 下载失败', options.url, err);
          onFail(err);
        },
      });
      if (onProgress && task) task.onProgressUpdate(onProgress);
      return task;
    }

    // Web 降级：fetch → Blob URL
    fetch(options.url, { headers: options.header || {} })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        var tempFilePath = URL.createObjectURL(blob);
        console.log('[KwaiNetwork] 下载完成（Web）', tempFilePath);
        onSuccess({ tempFilePath: tempFilePath, statusCode: 200 });
      })
      .catch(function (err) {
        console.warn('[KwaiNetwork] 下载失败', options.url, err.message);
        onFail({ errMsg: err.message || 'download failed' });
      });
  }

  window.KwaiNetwork = {
    downloadFile: downloadFile,
  };

})();
