# v90.12 / Telemetry v93 验证结果

日期：2026-09-08；源目录：/Users/fat/weihunqi。

## 已通过

- make build：剧情、registry、字幕与 Scene manifest 生成；374 节点、243 选项。
- test-telemetry.cjs：Scene 唯一性、11 退役 ID、旧号保留、全量选项映射、启动内去重、固定首选与实际执行分离、选项可见性、前后台计时、章节归属、图片等待、周期分片、256 槽耗尽、明确失败重试、无回调不重试、字段大小及管理员跳过标记。
- test-chapter-home.js / test-home-motion.js / test-chapter-links.js：9 章节入口、卡片资源、解锁与取消、单一存档、滚动、转场链接及 EP03 支线归属。
- test-ad-reliability.js：22 种 SDK 时序、奖励幂等、并发、长广告及管理员跳过场景。
- test-story-ad-policy.cjs：21 个奖励视频选项、主线免费出口、舞蹈广告保留及非双重广告。
- test-user-profile.cjs：登录/资料复用、拒绝重试、超时及身份边界。
- check-subtitles.js：99 条视频映射。原有 4 段音频需人工听审，本次未修改字幕。
- Chrome 真实引擎（模拟 SDK，远端媒体请求中止）：320×568、393×852；八处章节转场、取消/重试/迟到奖励、当前章重玩、卡片及选项曝光/点击/执行、chapter_enter、预告/解锁各阶段，启动 ID 不重置、Scene 不重复。明细见 preview-v90.12/scene-browser-*.json。
- 与修改前备份结构对比：剧情文案、下一跳、素材、数值和广告配置不变，仅新增固定选项 ID。
- ksmg preview 上传成功，二维码：../preview-v90.12/preview-1788859713352.png。

## 验证边界与未完成事项

- 未宣称真机扫码或数仓入库已验收。SDK mock 成功不能证明 CUSTOMIZE_SCENE 收数；新增号段和真实平台频控需扫码及后台确认。
- SQL 为 Spark SQL 模板，真实表结构未提供，未在生产数仓运行。需匹配表名、app_id、event_time、用户字段及 dimension/metric 的实际类型。
- 云文档已通过用户新提供的 docs-shuttle 包更新：文档版本 3 → 4；124 个新块、SQL 及 1658 条编号字典已回读一致。原 85 个正文块及稳定锚点保留为历史参考。之前旧入口的 401 已不再阻碍同步。
- 项目要求的 hub-push 已尝试，失败于 .git/FETCH_HEAD: Operation not permitted；未强制同步或推送工作区中大量既有修改。
- 仓库 scripts/tools/dry-run-story.js 当前是 0 字节；validate-schema.js 等校验脚本缺失，不将空脚本执行成功当作剧情审计。替代使用现有有效的 test-chapter-links.js、test-story-ad-policy.cjs 等专项检查。
