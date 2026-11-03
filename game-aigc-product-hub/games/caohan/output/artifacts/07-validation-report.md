# 商业化与制作验证报告

- 结构层：PASS；124 个节点引用完整；携带 flags 回放后 44/44 个选项可解锁、14/14 个结局真实可达，无死路。
- 体验层：PASS；11 集首个真实选择均在第 2 节点、15 秒内，前 30 秒无 information 选择。
- 互动层：PASS；共 11 个 choice，每集一轮四选一；每轮 4 个选项均直达不同视频 scene，且为 2 free + 1 rewarded_ad + 1 condition。
- 汇流层：PASS；每条分支先播放独立后果视频，到下一决策/结局边界最多 2/4 汇流，无四路立即合并。
- 变现层：PASS；每集全图库存为 4 个互斥分支 ad_gate 加 1 个选项广告，共 5 个设计机会；单次路径实际曝光 1–2 个。逐集 IAA 10/10，集末钩子 5/5。
- 结局层：PASS；14 个结局为 4 正式 + 4 反转 + 4 荒诞 + 2 隐藏，并分布在不同章节和路径。
- 制作层：PASS；中档预算为 50–60 条核心视频，实际 55 个 scene、55 个 video、131 个 shot；按可达路径的相邻决策间隔为 2–3 条视频，开场和结局尾段按规则豁免。
- 人工复核：广告频控、素材出图后的角色脸部和空间轴线连续性。
- 最小溯源：`agw-story2game 4.1.0-minimal`，`deterministic+stateful-path`，runId `taohun-caohan-v4-statefix-20260903`。

inputs_used: 01–06 阶段产物、候选 JSON、validate.py
outputs_created: 07-validation-report.md、最终 v4 JSON
assumptions: 内容评分为上线前预评分
open_issues: 上线后以 Trace 数据重新校准广告密度
status: PASS
