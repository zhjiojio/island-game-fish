# 部署验收报告

## 结果

- 状态：通过
- 游戏地址：https://bboyabssiszai.github.io/long-feng-jie-interactive/
- 源码仓库：https://github.com/bboyabssiszai/long-feng-jie-interactive
- 发布提交：`c4de0a95eec09583befe1fa3c626d7d27448d58d`
- GitHub Actions：https://github.com/bboyabssiszai/long-feng-jie-interactive/actions/runs/29910572299
- 验收时间：2026-07-22T18:08:33+08:00

## 自动化验收

- GitHub Pages 工作流成功，耗时 29 秒。
- 应用测试：4 个测试文件、12 项测试全部通过。
- TypeScript 与 Vite 生产构建通过，输出约 9.7 MiB。
- 代码检查通过。
- 媒体策略门通过：原始 126.4 MiB 长视频未进入部署包。
- 线上资源门通过：8 个 MP4 和 12 个 JPG 均可访问，且 `Content-Type` 正确。
- 响应式浏览器验证通过：390×844 与 1280×800 无横向溢出，三个结局均可到达。

## 线上媒体

验收覆盖 `capital-deal`、`jade-distance`、`jade-trust`、`lab-evidence`、`launch-attack`、`launch-stage`、`protection-contract`、`warehouse-priority`、`wedding-crisis` 及三个结局资源。逐项结果见 `reports/verification.json`。

## 说明

部署后校验曾发现校验脚本会把 GitHub Pages 的仓库子路径误裁剪为根路径。已加入回归测试并修复路径解析；修复后重新执行技能测试与线上资源检查，结果均通过。该问题不影响已部署游戏本身。
