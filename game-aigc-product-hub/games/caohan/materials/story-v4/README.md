原始 v4 JSON 共 55 个视频节点，55 个节点成片均已生成、审核与合并（2026-09-07）。以 video-inventory.tsv 与 manifest.json 为准。

交付目录：
- characters：8 位角色的参考图，9 个 PNG（许邵泽指定原图保留一份别名）。
- video：按原剧本视频 ID 命名的节点成片。
- segments：当前使用的 Kling 原生音画同步分段，重做前版本仅位于 review 的历史目录，不可接入游戏。
- requests/production：分段顺序、原文台词、生成请求。
- review：抽帧、独立音频转写、人物审核、全文覆盖和技术检查证据。
- source：原 v4 剧本只读副本，未修改。

用户已授权长旁白延长、超长内容分段；裸露镜头用不透明衣物或被子遮挡。当前素材保留原生音轨，未后配音。成片不是原 JSON 所有 startSec/endSec 的逐帧等时复刻；ep03_scene_00_video_01 的表演跨原 1.5 秒镜头边界，原审核说明保留。

恢复生产使用的实际工作目录：/Users/kwaibear/work/minigame/game-aigc-product-hub/games/ks867658648250668260/materials/story-v4
任务脚本：上述游戏目录下 outputs/media_v4_ops.py；异步恢复文件位于 .cache/media-jobs/story-v4/production。恢复时使用各 task.json 指定的 jobFile，不重复提交已有成功分段。
