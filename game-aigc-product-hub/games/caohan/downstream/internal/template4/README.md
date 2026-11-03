# 按 game-config(4).json 适配的当前交付

正式配置为 ../../game-config.json。保留 78 个播放节点、69 条 v5 原生视频、14 个结局及原条件分支；媒体 URL、实际时长、音轨开关、首尾帧全部沿用已验证交付。

## 本版展示与交互

- homepage 新增逃婚主题 loadingTitle/loadingHints，按样例只保留开始按钮。copyright 为空，等待真实权利主体；未照抄示例公司。首页图沿用真实 CDN 首帧，背景音乐仍为空。
- preload 使用 EAGER、lookahead=2，initialNodes 为入口及四个直接后继，共 5 个真实节点；不使用示例节点 ID。
- 非结局组件使用 x=null、width=360；提示 y=390，按钮按 529/591/653/715 排列，条件未解锁说明占对应选项行。实际长文案排版待工程真机确认。
- 结局在视频播放后显示弹窗，不新增配音或覆盖播放中的画面。原 category=bad 的 ending_regret 使用 endingDialog_be，看广告返回 ep11_scene_00__v2，保留原来满足条件的路径；广告失败留在结局节点。
- 其余 13 个结局使用 endingDialog_he 分享弹窗，只表示采用该分享展示组件，未把原“荒诞/隐藏/反转”题材分类改名为好结局。分享后 nextNodeId=null。按样例约定，点击弹窗外由工程执行 restart。
- 原剧本没有倒计时选项，未新增 countdownButton 或关注解锁。广告位 ID 继续由工程填写。

## 核验与版本

字段路径、组件枚举、引用、可达性、预加载、媒体一致性和坏结局返回路径均通过检查，见 reports/config-verification.json。未执行工程引擎或真机测试。上一版配置在 ../history/before-template4/game-config.json，v5 媒体和原路径验证资料在 ../v5/。
