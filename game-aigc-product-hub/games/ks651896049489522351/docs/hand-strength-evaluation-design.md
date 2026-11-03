# 斗地主轻量牌力评估技术设计

> 状态：已实现并通过全量回归  
> 适用范围：服务端机器人叫抢地主与加倍  
> 默认版本：`hand-strength-lite`  
> 回滚版本：`hand-strength-v1`

## 1. 背景

原有 V1 牌力算法只按大小王、2、A、炸弹、三张、对子和低位单张做线性加减，无法识别顺子、连对、飞机等完整结构。

项目曾实现精确 V2：通过合法牌型枚举和迭代加深搜索，证明一手牌最少需要多少手出完，再从有界代表拆牌中提取结构特征。该方案虽然能得到精确 `minimumTurns`，但不适合在线叫抢和加倍链路：

- 17 张随机样本 p50 约 `27.87 ms`，p99 约 `86.73 ms`；
- 20 张随机样本 p50 约 `74.69 ms`，p99 约 `183.32 ms`；
- 默认 10,000 状态预算下，17 张约 5% 降级，20 张约 41% 降级；
- 算法在 Node.js 主线程同步执行，会阻塞 Event Loop；
- Shadow 仍需执行完整计算，会增加线上 CPU 和延迟，不能消除性能风险。

因此当前方案改为 V2-Lite：不求精确最少手数，不进行递归搜索，不提供牌力 Shadow；直接提取结构特征并运行固定数量的确定性贪心拆牌计划。

## 2. 目标与边界

### 2.1 目标

1. 识别 V1 无法表达的顺子、连对、飞机等牌型结构。
2. 输出稳定、可解释、确定性的静态牌力指数。
3. 单手评估保持亚毫秒级常见延迟，无搜索预算和降级分支。
4. 默认用于机器人叫抢、加倍，保持现有动作协议不变。
5. 保留 V1 作为显式紧急回滚版本。
6. 牌力评估只读取机器人自己的手牌，不读取其他玩家暗牌。

### 2.2 非目标

V2-Lite 不提供：

- 精确最少出牌手数；
- 完整局面求解；
- 对手暗牌推断；
- 实时胜率；
- DouZero 动作价值；
- 发牌控制或胜率保证；
- 在线 Shadow 或双算能力。

`estimatedTurns` 是固定贪心计划得到的估算值，不得解释为数学意义上的最优解。

## 3. 决策结论

### 3.1 保留能力

- `hand-strength-lite`：默认牌力评估器；
- `bid-double-policy-lite`：默认叫抢与加倍阈值；
- `hand-strength-v1`：旧公式紧急回滚；
- `bid-double-policy-v1`：与 V1 配套的旧策略阈值；
- 按局冻结 evaluator 和 policy 版本，避免一局内语义变化。

### 3.2 删除能力

以下能力不进入运行时：

- 精确 `minimumTurns` 搜索；
- 合法牌型全集生成；
- 迭代加深、BFS、DP 等拆牌搜索；
- 搜索状态预算和超预算降级；
- 代表拆牌搜索；
- `hand-strength-v2`；
- `bid-double-policy-v2`；
- 牌力 Shadow；
- 牌力百分比灰度。

DouZero 自身的 `off / shadow / active` 是独立的出牌模型能力，不属于本次删除范围。

## 4. 模块结构

```text
server/game-ai/hand-strength/
├── index.js             # 稳定门面和版本选择
├── evaluator-v1.js      # 旧线性公式，紧急回滚
├── evaluator-lite.js    # 轻量结构评估
├── hand-state.js        # 输入校验和点数计数
├── policies.js          # evaluator/policy 版本与阈值
└── runtime.js           # 启动配置和按局版本冻结
```

已删除：

```text
server/game-ai/hand-strength/decomposition.js
server/game-ai/hand-strength/evaluator-v2.js
server/game-ai/hand-strength/pattern-generator.js
```

依赖方向：

```text
server/index.js
  → strategy.js
    → hand-strength/index.js
      → evaluator-lite.js | evaluator-v1.js
```

业务层不得直接依赖评估器内部实现。

## 5. 输入与输出

### 5.1 输入

```js
evaluateHand(hand, {
  evaluatorVersion: 'hand-strength-lite'
})
```

输入约束：

- `hand` 必须是数组；
- 最多 20 张牌；
- 点数范围为 3～17；
- 普通点数最多 4 张；
- 大小王各最多 1 张；
- 不允许重复 `cardId`；
- 评估过程不得修改输入数组和卡牌对象。

算法只依赖点数计数，不依赖花色、卡牌 ID 或输入顺序。

### 5.2 Lite 输出

```js
{
  version: 'hand-strength-lite',
  score: 0.73,
  features: {
    cardCount: 17,
    estimatedTurns: 6,
    turnEfficiency: 0.6875,
    controlPower: 0.39,
    bombCount: 1,
    hasRocket: false,
    weakLooseCards: 2,
    weakLooseRatio: 0.1176,
    straightCoverage: 6,
    pairStraightCoverage: 0,
    airplaneCoverage: 0,
    structuredCoverage: 0.8235,
    finishingPotential: 0.43,
    controlBreakPenalty: 0
  },
  diagnostics: {
    deterministic: true,
    evaluatedPlans: 8,
    fallbackApplied: false,
    fallbackReason: null
  }
}
```

字段语义：

- `score`：范围 `[0,1]` 的静态牌力指数，不是胜率；
- `estimatedTurns`：八种固定贪心计划中的最小出牌手数估计；
- `turnEfficiency`：按当前手牌张数归一化的估算出牌效率；
- `controlPower`：王、2、A、炸弹的控制力；
- `weakLooseCards`：所选计划中的低位散单数量；
- `structuredCoverage`：对子、三张、顺子、连对、飞机、炸弹和火箭覆盖比例；
- `controlBreakPenalty`：所选计划是否拆分炸弹或火箭；
- `evaluatedPlans`：固定为 8，不随牌面扩大。

## 6. V2-Lite 算法

### 6.1 点数计数

手牌转换为长度 15 的计数数组：

```text
[3, 4, 5, ..., A, 2, 小王, 大王]
```

状态规模固定，不创建搜索树。

### 6.2 直接结构检测

算法直接在计数数组上识别：

- 火箭；
- 炸弹；
- 连续三张；
- 飞机裸牌、飞机带单、飞机带对；
- 顺子；
- 连对；
- 三张、三带一、三带二；
- 对子；
- 单张。

顺子和连对只遍历 3～A，不允许包含 2 或王。

### 6.3 固定贪心计划

算法固定运行四种结构优先级：

```text
A：飞机 → 顺子 → 连对 → 三张
B：飞机 → 连对 → 顺子 → 三张
C：顺子 → 飞机 → 连对 → 三张
D：连对 → 飞机 → 顺子 → 三张
```

每种优先级再运行两种策略：

1. 优先保护并单独消耗火箭、炸弹，飞机优先带对；
2. 允许结构竞争，飞机优先带单。

总计划数固定为：

```text
4 × 2 = 8
```

每个计划最后依次消耗：

```text
火箭 → 炸弹 → 三带 → 对子 → 单张
```

计划排序规则：

1. `estimatedTurns` 更少；
2. `controlBreakPenalty` 更低；
3. `weakLooseCards` 更少；
4. `structuredCards` 更多；
5. 飞机覆盖更多；
6. 顺子覆盖更多。

### 6.4 复杂度

点数种类固定为 15，计划数量固定为 8。算法没有递归、状态队列和不受控候选枚举。

可将单次复杂度视为固定上界，主要由少量长度 15 的数组扫描和复制构成。不存在随搜索状态数增长的尾延迟，也不存在预算耗尽降级。

## 7. 牌力评分

Lite 沿用结构化评分框架：

```text
rawScore =
  intercept
  + turnEfficiencyWeight × turnEfficiency
  + controlPowerWeight × controlPower
  + structuredCoverageWeight × structuredCoverage
  + finishingPotentialWeight × finishingPotential
  - weakLooseWeight × weakLooseRatio
  - controlBreakWeight × controlBreakPenalty

score = sigmoid(rawScore)
```

当前权重用于保持与已验证结构样例和原 V2 教师结果的相对一致性，后续仍应通过真实对局数据标定。

## 8. 叫抢与加倍接入

`strategy.js` 只消费评估结果，不参与结构计算。

默认组合：

```text
hand-strength-lite + bid-double-policy-lite
```

紧急回滚组合：

```text
hand-strength-v1 + bid-double-policy-v1
```

Evaluator 与 Policy 在代码层保持独立版本字段，便于诊断；运行时默认使用配套组合。

接入阶段：

- `bidding`：叫地主、抢地主、最终确认；
- `doubling`：地主和农民加倍；
- `playing`：不使用牌力评估，仍由规则 AI 或 DouZero 决策。

真人超时叫抢、加倍不调用机器人牌力评估。

## 9. 配置与回滚

仅保留一个配置：

```bash
DDZ_HAND_STRENGTH_MODE=lite
```

可选值：

| 值 | 行为 |
|---|---|
| `lite` | 默认使用轻量结构评估和 Lite Policy |
| `v1` | 使用旧线性公式和 V1 Policy |

非法值按 `lite` 处理。

已删除的配置：

```text
DDZ_HAND_STRENGTH_V2_PERCENT
DDZ_HAND_STRENGTH_MAX_STATES
DDZ_HAND_STRENGTH_SHADOW_LOG_PERCENT
```

版本在每局开始时写入房间状态：

```js
room.handStrengthMode = 'lite' | 'v1';
room.handEvaluatorVersion = 'hand-strength-lite' | 'hand-strength-v1';
room.handPolicyVersion = 'bid-double-policy-lite' | 'bid-double-policy-v1';
```

回滚只需设置 `DDZ_HAND_STRENGTH_MODE=v1` 并重启服务；不会影响客户端协议、出牌规则或结算。

## 10. 性能与质量验证

### 10.1 性能对比

固定种子、17/20 张各 1,000 手的开发机样本：

| 手牌数 | Lite p50 | Lite p95 | Lite p99 | Lite max | 原精确 V2 p50 | 原精确 V2 p99 |
|---|---:|---:|---:|---:|---:|---:|
| 17 张 | 0.0202ms | 0.0641ms | 0.1267ms | 0.5877ms | 约 27.87ms | 约 86.73ms |
| 20 张 | 0.0192ms | 0.0457ms | 0.1002ms | 0.5330ms | 约 74.69ms | 约 183.32ms |

Lite 不存在搜索预算，因此无预算降级。

测试中的 500 手批量评估设有宽松的 1 秒上限，用于捕获明显性能回退，不作为生产 SLA。

### 10.2 与原精确 V2 的离线一致性

原精确 V2 在删除前作为离线教师，对默认 10,000 状态预算内成功的样本比较 Pearson 分数相关性：

| 手牌数 | Lite 与精确 V2 | V1 与精确 V2 | Lite 估算手数平均绝对误差 |
|---|---:|---:|---:|
| 17 张 | 0.8509 | 0.4655 | 0.3736 手 |
| 20 张 | 0.8114 | 0.6926 | 0.8475 手 |

该结果说明 Lite 对原 V2 结构评分的拟合明显优于 V1，同时把常见耗时降低到亚毫秒级。

这些数据不是胜率提升结论。叫抢和加倍的最终收益仍需通过固定发牌、固定座位和完整对局仿真校准。

## 11. 测试要求

### 11.1 兼容与输入

- V1 固定样本与旧公式完全一致；
- 默认入口返回 `hand-strength-lite`；
- 非法点数、重复卡牌、超量手牌被拒绝；
- 输入数组和卡牌对象不被修改；
- 同点数不同花色、不同输入顺序结果一致。

### 11.2 结构能力

覆盖：

- 顺子；
- 连对；
- 裸飞机；
- 飞机带单；
- 飞机带对；
- 火箭；
- 炸弹；
- 完整结构与离散低牌的相对排序；
- 控制牌保护。

### 11.3 运行时和策略

- 默认模式为 Lite；
- 仅接受 `lite` 和 `v1`；
- V1 回滚同步切换 evaluator 与 policy；
- 叫抢返回 `0/1`；
- 加倍返回 `1/2/4`；
- 客户端协议保持不变；
- 不存在牌力 Shadow metadata；
- 不存在搜索预算或降级路径。

### 11.4 性能

- 固定批量样本在宽松上限内完成；
- 单次诊断始终显示 `evaluatedPlans: 8`；
- 不允许引入递归搜索或按牌面无界增长的候选集合。

## 12. 安全与可观测性

常规动作 metadata 可记录：

- evaluator 版本；
- policy 版本；
- 牌力分桶；
- `estimatedTurns`；
- 控制力；
- 弱散牌数量；
- 结构覆盖率。

禁止记录：

- 完整手牌；
- 其他玩家暗牌；
- 认证信息；
- 数据库凭据；
- 可逆推出玩家身份的信息。

## 13. 后续校准

当前 Lite 相比 V1 提升了结构表达能力，但不能直接宣称提升了胜率。后续校准建议：

1. 固定发牌和座位，对比 V1 与 Lite 的叫抢、加倍决策；
2. 运行完整对局仿真，统计地主胜率、农民胜率和收益；
3. 按 `calling / robbing / final_confirm` 分阶段标定阈值；
4. 分别标定地主与农民的普通加倍、超级加倍阈值；
5. 检查强牌漏叫、弱牌误叫、弱牌超级加倍等高风险样本；
6. 权重或阈值变更必须更新版本或测试基线。

## 14. 验收标准

实现完成必须满足：

- 默认使用 `hand-strength-lite`；
- V1 可通过单一环境变量回滚；
- 精确 V2 搜索文件和运行时引用已删除；
- 牌力 Shadow 逻辑和配置已删除；
- 结构测试、策略测试、部署配置测试通过；
- 服务端全量测试通过；
- `git diff --check` 和 JavaScript 语法检查通过；
- 不修改客户端协议、规则裁决和结算逻辑。
