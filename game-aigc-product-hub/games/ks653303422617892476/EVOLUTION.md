# 项目进化记录

当前轮次：2
累计轮次：2
最近确认轮次：1

## Evolution Round 2

触发：用户要求继续开发（agw-start → stage=evolve-review 恢复）；用户确认修复方案 A（保留 Canvas 2D）
基线：6d4d29f（evolve-review round 1 修复后）
开始时间：2026-09-02T13:44:00+08:00
本轮目标：全量证据审计，补齐强制依赖文档，修复合规缺口与功能缺陷
纳入问题：EV-20260902-003、EV-20260902-004、EV-20260902-005、EV-20260902-006、EV-20260902-007、EV-20260902-008、EV-20260902-009、EV-20260902-010
排除问题：EV-20260902-002（渲染栈 2D→WebGL，用户选择方案 A 保留 Canvas 2D，本期不改）
责任方：Game Builder（主）/ agw-codegen（规范缺口）/ agw-start 状态脚本（EV-010）
修改摘要：
  - 补齐 docs/game-privacy.md（agw-privacy 产出，此前缺失）
  - 补齐 docs/scaffold.md（agw-scaffold 产出，此前缺失）
  - workflow-run.yml 同步真实广告位 ID（EV-003）
  - 新增 js/compliance.js，预留隐私政策/实名/防沉迷/客服四项接口（EV-004）
  - layout.js 停止每帧重置 bottomPadding；render.js 结算弹窗按可用区避让 Banner（EV-005）
  - board.js 坑洞判定改用底边贴地判断，修复空中飞越（EV-006）
  - board.js 最高分改为 commitScore() 结算时一次性提交（EV-007）
  - 新增分享按钮与 onClickShare，接通裂变链路（EV-008）
  - 复活时先 clearObstaclesNearRunner() 再开无敌帧，修复无敌结束二次即死（EV-009）
  - 修复公共脚本 game-state-update.js:227 引用未定义变量 mode（EV-010，已获用户批准）
验证证据：
  - 全部业务 JS `node -c` 语法检查通过
  - `.verify/board-logic.js` 13/13 通过（含「不清障必死」对照实验，证明 EV-009 修复有效）
  - `.verify/render-smoke.js` 15/15 通过（ready/playing/gameover 三状态 draw() 无异常，
    Canvas 实际产生 fillRect=119 fillText=41 arc=136 次绘制调用）
  - 合规接口 grep 四项全部命中；§2.2 违禁诱导词 grep 零命中
  - index.html 与 main.js require 清单一致
  - H5 预览服务 localhost:8899 返回 200，compliance.js 可访问
  - `game-state-update.js --begin-evolve-round` 修复后正常输出
结果：confirmed
用户决定：待确认

---

## EV-20260902-002

状态：rejected
首次发现轮次：2
最近处理轮次：2
验证通过轮次：—
修复尝试：0
现象：docs/scaffold.md §1/§7 强制要求所有渲染使用 WebGL、严禁 getContext('2d')，但项目 main.js:25、render.js:30 使用 2D context，render.js 全 368 行由 ctx.fillRect / fillText / arc 构成
证据：docs/scaffold.md:48「[强制] 所有渲染必须使用 WebGL API，严禁使用 canvas.getContext('2d')」；render.js:30 `_ctx = _canvas.getContext('2d')`
期望：按规范用 WebGL shader 重写渲染层
复现：对照 docs/scaffold.md 第 383 行自检清单逐项检查
根因层：agw-codegen 未遵循 scaffold 规范生成渲染层
责任方：Game Builder / agw-codegen
范围：public-candidate（规范与生成实现不一致，属公共契约问题）
修复：本轮不修 —— 用户明确选择方案 A（务实路线），保留 Canvas 2D 以尽快进入 self-test
备注：现有 2D 实现功能完整且可运行，改 WebGL 等于重写渲染层。该问题保留为公共候选，
     待后续确认「scaffold 规范是否应放宽 2D」或「codegen 是否必须强制 WebGL」后再处理。

---

## EV-20260902-003

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：js/kwai-ad-config.js 硬编码广告位 ID 2300040237_01/02/03，但 workflow-run.yml 的 config.ad_units 三项全为空，配置源与代码不一致
证据：js/kwai-ad-config.js 三项均有值；workflow-run.yml config.ad_units 三项均为 ""
期望：workflow-run.yml 作为唯一配置源，与代码保持一致
复现：对比两个文件的广告位字段
根因层：agw-scaffold Step 3 未回写配置源
责任方：Game Builder
范围：project
修复：用户确认 ID 为真实分配，将三个 ID 同步写入 workflow-run.yml

### Round 2 / Attempt 1

修改：workflow-run.yml config.ad_units 写入 2300040237_01 / _02 / _03
验证：配置源与 kwai-ad-config.js 完全一致
结果：passed

---

## EV-20260902-004

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：docs/game-privacy.md §2.1 强制要求预留隐私政策、实名认证、防沉迷、客服入口四项接口，全项目 grep 零命中，提审会被驳回
证据：`grep -rn "PRIVACY_POLICY_URL|requestRealNameAuth|getAntiAddictionInfo|openCustomerServicePage" package/` → 0 结果
期望：四项接口均有预留调用点，且非快手环境静默降级不阻塞游戏
复现：对照 docs/game-privacy.md §2.1 表格逐项 grep
根因层：agw-codegen 未读取 game-privacy.md §2 约束
责任方：Game Builder
范围：public-candidate（合规接口属所有 IAA 小游戏通用硬门禁）
修复：新增 js/compliance.js 统一预留四项能力，main.js 登录后调用 M3.Compliance.init()

### Round 2 / Attempt 1

修改：新增 js/compliance.js（131 行）；main.js require 与 init 调用；index.html 追加 script 标签
验证：四项关键字 grep 全部命中；render-smoke 测试确认非快手环境三项调用均静默降级不抛错
结果：passed

---

## EV-20260902-005

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：game.js 三处将 Banner 高度写入 M3.Layout.bottomPadding，但 layout.js:22 每帧 init() 把它重置为 0，且 render.js 从未读取该值，导致 Banner 直接遮挡结算弹窗「重新开始」按钮
证据：layout.js:22 `M3.Layout.bottomPadding = 0;`（main.js 主循环每帧调用 init()）；render.js grep bottomPadding → 0 命中
期望：bottomPadding 跨帧保持，结算弹窗在 Banner 上方完整可见可点
复现：快手环境进入结算页，Banner 展示后按钮被压住无法点击
根因层：layout 层状态被每帧重置 + render 层未消费布局约束
责任方：Game Builder
范围：project
修复：layout.js 改为 `bottomPadding = bottomPadding || 0` 保持已有值；render.js 结算弹窗改为在 [safeTop, h - bottomPadding] 可用区内垂直居中

### Round 2 / Attempt 1

修改：layout.js bottomPadding 保持逻辑；render.js drawGameoverScreen 按可用区计算 boxY
验证：board-logic 测试确认多帧 init() 后值保持 96；render-smoke 测试确认 Banner=120 时按钮整体上移且按钮底边 ≤ Banner 顶边
结果：passed

---

## EV-20260902-006

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：坑洞碰撞判定附加 runner.isOnGround 条件，但角色在坑洞上方下落时该值恒为 false，导致坑洞可被「空中飞越」而完全失效
证据：board.js:216 `if (runCenterX > obs.x && ... && runner.isOnGround)`；board.js:173-180 仅在落到 groundLine 时才置 isOnGround=true
期望：角色底边达到地面线且水平投影落在坑内即判掉落；高空跨越不判死
复现：跑到坑洞前起跳，落点在坑内也不会死亡
根因层：board 层碰撞判定条件错误
责任方：Game Builder
范围：project
修复：改用 `runBottom >= groundY - 1 && inPitX` 判定，移除 isOnGround 依赖

### Round 2 / Attempt 1

修改：board.js pit 分支改用底边贴地判断
验证：board-logic 测试双向验证 —— 贴地且在坑内 → gameover；高空跨越坑洞上方 → playing
结果：passed

---

## EV-20260902-007

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：board.js:187 每帧实时刷新 _bestScore 并调用 saveBestScore()，导致结算页「本次」永远等于「最高」，玩家永远看不到纪录对比；且每帧写 localStorage 有性能开销
证据：board.js:187-190 位于 update() 内，每帧执行；storage 写入频率 = 帧率
期望：仅在死亡结算时提交一次最高分，并给出「新纪录」正反馈
复现：玩一局后看结算页，「本次」与「最高」数值恒等
根因层：board 层数据提交时机错误
责任方：Game Builder
范围：project
修复：新增 commitScore() 由 game.js 在 gameover 时调用一次；新增 isNewRecord() 供 render 展示「🎉 新纪录！」

### Round 2 / Attempt 1

修改：board.js 移除 update() 内实时写入，新增 commitScore()/isNewRecord()/_newRecord；game.js gameover 分支调用 commitScore()；render.js 结算页展示新纪录提示
验证：board-logic 测试确认跑动 300 帧期间 best 恒为 0 且 storage 写入 0 次；commitScore() 后 best 追平且仅写 1 次
结果：passed

---

## EV-20260902-008

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：kwai-share.js 已在 main.js:16 被 require，但游戏内无任何分享入口，裂变链路完全缺失
证据：`grep -rn "KwaiShare" js/` → 修复前 0 命中；workflow-run.yml share_template_id 为空
期望：结算页提供分享入口，携带本局分数邀请好友挑战
复现：游戏全流程无任何分享按钮
根因层：game entry 未接入已加载的平台能力
责任方：Game Builder
范围：project
修复：render.js 结算页新增分享按钮 + input.js 命中处理 + game.js onClickShare() 调用 KwaiShare.share()

### Round 2 / Attempt 1

修改：render.js 新增 _btnShare 与绘制；input.js 追加命中分支；game.js 新增 onClickShare()
验证：render-smoke 测试确认按钮命中区有效、位于 Banner 上方、无 KwaiShare 时调用不抛错
结果：passed
备注：workflow-run.yml 的 share_template_id 仍为空，需用户补填后才能启用分享模版

---

## EV-20260902-009

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：复活后 1.5s 无敌帧仅跳过碰撞判定，但障碍本体未被清除；角色原地与障碍重叠时，无敌一结束会立刻二次死亡
证据：game.js:48 无敌期直接 `M3.Board.update()` 并忽略返回值，未移除 _obstacles 中与角色重叠的项
期望：复活时清空角色周围障碍，给玩家有效反应窗口
复现：撞墙死亡 → 看广告复活 → 无敌结束瞬间立刻再次死亡
根因层：game 层复活流程缺少世界状态清理
责任方：Game Builder
范围：project
修复：新增 M3.Board.clearObstaclesNearRunner(safeAheadPx)，revive() 中先清障再开无敌帧，并推迟下次生成时机

### Round 2 / Attempt 1

修改：board.js 新增 clearObstaclesNearRunner()；game.js revive() 调用 clearObstaclesNearRunner(320)
验证：board-logic 测试确认近处障碍被清、远处保留、复活后 90 帧无敌窗口内不死；
     并设对照实验证明不清障时第 0 帧即死，修复真实有效
结果：passed

---

## EV-20260902-010

状态：verified
首次发现轮次：2
最近处理轮次：2
验证通过轮次：2
修复尝试：1
现象：公共脚本 scripts/game-state-update.js:227 引用未定义变量 mode（应为 opts.mode），导致 --begin-evolve-round 等所有模式直接崩溃 ReferenceError
证据：`node scripts/game-state-update.js <appid> --begin-evolve-round` → `ReferenceError: mode is not defined at main (game-state-update.js:227:3)`
期望：所有状态推进命令可正常执行
复现：执行任意 game-state-update.js 命令
根因层：agw-start 状态脚本变量作用域错误（main() 内无 mode 变量，仅 parseArgs() 内有）
责任方：agw-start / 状态脚本
范围：public-candidate（公共脚本缺陷，影响所有游戏项目的状态推进）
修复：main() 内 `mode === '--set-stage'` 改为 `opts.mode === 'set-stage'`

### Round 2 / Attempt 1

修改：scripts/game-state-update.js:227 条件表达式修正为 opts.mode === 'set-stage'
验证：`--begin-evolve-round` 正常输出「✅ 进化轮次已开始」；node -c 语法检查通过
结果：passed
备注：本修复经用户明确批准（Human Gate 已通过）。属公共脚本改动，
     已同时满足 agw-evolve §5 的「确定性可复现 + 明确 rollback（单行还原）」条件。

---

## Evolution Round 1

触发：代码生成后首次 evolve-review（自动代码审查）
基线：codegen 完成后初始版本
开始时间：2026-09-01T16:18:00+08:00
本轮目标：审查游戏代码质量，修复已知问题，确认无阻塞问题
纳入问题：EV-20260901-001、EV-20260901-002
排除问题：无
责任方：Game Builder / Render
修改摘要：
  - 修复 render.js 使用 ctx.ellipse() 的兼容性问题（→ arc 替代实现）
  - 移除 main.js 中多余的 KwaiAd.showRewarded(null) 预加载调用
验证证据：语法检查通过；H5 预览服务运行（localhost:8899）
结果：confirmed
用户决定：待确认

---

## EV-20260901-001

状态：verified
首次发现轮次：1
最近处理轮次：1
验证通过轮次：1
修复尝试：1
现象：render.js 第 180 行使用 `ctx.ellipse()` 绘制角色阴影，部分旧版快手小游戏 Canvas 环境不支持该 API，会导致角色阴影丢失或报错
证据：render.js:180 `ctx.ellipse(x + w * 0.5, M3.Layout.groundY + 2, w * 0.5, 6, 0, 0, Math.PI * 2);`
期望：用 `ctx.arc` + `scale` 或手动路径替代，兼容所有快手环境
复现：在不支持 ellipse 的旧机型上运行，角色脚下阴影消失或报错
根因层：render 层 Canvas API 兼容性
责任方：Game Builder
范围：project
修复：将 ellipse 替换为 save/scale/arc/restore 模拟实现

### Round 1 / Attempt 1

修改：render.js 第 178-181 行，椭圆阴影改用 ctx.save → ctx.scale → ctx.arc → ctx.restore 实现
验证：语法检查通过；视觉效果等效
结果：passed

---

## EV-20260901-002

状态：verified
首次发现轮次：1
最近处理轮次：1
验证通过轮次：1
修复尝试：1
现象：main.js 第 84 行 `KwaiAd.showRewarded(null)` 在游戏初始化时被调用，该调用旨在预加载广告，但在快手环境中会因广告位 ID 未验证而立即触发 onClose/onError 回调，且该调用在非快手环境也会造成不必要日志
证据：main.js:84 `KwaiAd.showRewarded(null);`
期望：激励广告按需初始化（已在 kwai-ad.js 的 showRewarded 中实现惰性初始化），无需在入口主动调用
复现：启动游戏，console 中出现广告初始化日志或 warning
根因层：game entry 调用时序
责任方：Game Builder
范围：project
修复：移除 main.js 第 84 行多余的预加载调用

### Round 1 / Attempt 1

修改：删除 main.js 中 `KwaiAd.showRewarded(null);` 这一行
验证：语法检查通过；广告仍可在 onClickRevive 时正常触发
结果：passed
