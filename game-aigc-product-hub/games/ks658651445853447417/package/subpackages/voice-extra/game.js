// voice-extra 子包入口 v1.2.9
// 子包加载成功后自动执行，标记已加载状态供主包消费
// ⭐ v1.2.9 子包内容：
//   - kuergou/lala/longaotian/xiaoshuai/liuhaoguaizai 全部音频
//   - xiaomei 的 remaining_1/2/3_a/b/c.mp3（CDN 无此文件，保留本包）
window._subpkgLoaded = window._subpkgLoaded || {};
window._subpkgLoaded['voice-extra'] = true;
console.log('[SUBPKG] voice-extra 已加载（含所有角色 remaining_* 音频）');
