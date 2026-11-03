# 《龙凤劫》互动游戏资源清单

## 资源策略

- 源视频只保留绝对路径引用，不复制进 `package/`。
- 互动包使用 8 个 25–30 秒 H.264/AAC 视频片段、8 张同名海报、1 张静帧选择场景和 3 张结局图。
- 视频节点用于开场、动作反馈、实验室/资本冲突、发布会与婚礼危机；低运动量的仓库命令节点和结局使用静帧。
- 所有运行时资源从 `package/src/assets` 进入 Vite 构建图；不使用手写 `/video/*.mp4` 公共路径。
- 默认单资源上限 25 MiB。当前最大资源为 `jade-trust.mp4`，1,490,763 bytes；全部媒体合计约 9.4 MiB。

## 视频切片

| ID | 源视频区间 | 时长 | 故事节点 | 文件大小 |
|---|---:|---:|---|---:|
| protection-contract | 00:00:10–00:00:35 | 25s | protection-contract | 1,198,735 B |
| jade-trust | 00:06:05–00:06:30 | 25s | jade-guarded | 1,490,763 B |
| jade-distance | 00:09:45–00:10:10 | 25s | jade-independent | 945,614 B |
| lab-evidence | 00:15:20–00:15:45 | 25s | lab-truth | 1,294,142 B |
| capital-deal | 00:16:20–00:16:45 | 25s | lab-business | 1,029,528 B |
| launch-stage | 00:31:20–00:31:45 | 25s | launch-control | 1,065,501 B |
| launch-attack | 00:33:30–00:33:55 | 25s | launch-evidence | 1,476,665 B |
| wedding-crisis | 00:44:20–00:44:50 | 30s | wedding-crisis | 1,238,011 B |

## 静帧

| ID | 源时间 | 用途 | 文件大小 |
|---|---:|---|---:|
| protection-contract-poster | 00:00:18 | 开场海报 | 8,402 B |
| warehouse-priority | 00:06:30 | 仓库救援选择节点 | 7,489 B |
| jade-trust-poster | 00:06:18 | 信任路线海报 | 8,518 B |
| jade-distance-poster | 00:09:55 | 独立路线海报 | 8,953 B |
| lab-evidence-poster | 00:15:30 | 实验室路线海报 | 11,409 B |
| capital-deal-poster | 00:16:30 | 资本路线海报 | 11,454 B |
| launch-stage-poster | 00:31:30 | 发布会控制路线海报 | 14,323 B |
| launch-attack-poster | 00:33:42 | 发布会证据路线海报 | 6,899 B |
| wedding-crisis-poster | 00:44:35 | 婚礼危机海报 | 10,522 B |
| ending-together | 00:38:00 | 真结局救援拥抱 | 7,037 B |
| ending-crown-alone | 00:46:50 | 守业结局婚礼/经营余韵 | 10,190 B |
| ending-unfinished | 00:48:00 | 劫后结局幕后黑客 | 15,174 B |

## 视觉复核

`reports/asset-contact-sheet-2.jpg` 汇总了全部 12 张静帧。抽帧确认覆盖资本敌手、婚礼、救援拥抱、幕后黑客、男女主、实验室、发布会、格斗与婚礼攻击等关键视觉，不使用生成图替代原片证据。

## 机器清单

机器可读清单位于 `docs/asset-manifest.json`，通过 `check_assets.py` 校验路径、格式、单文件大小和源视频误入风险。
