// 私房视频子包入口。容器会在 loadSubpackage 成功前自动执行本文件一次。
// 【铁律】不要在这里做需要立即触发的业务逻辑 —— 只做「我已就绪」的标记，
// 主包侧靠这个标记 + success 回调双重确认后才去 createVideo。
window.__PD_BOUDOIR_READY = true;
