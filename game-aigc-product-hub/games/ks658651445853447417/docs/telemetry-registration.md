# 老铁眼真尖 · 埋点后台注册清单（v1.0.74）

**AppID**: `ks658651445853447417`
**上报 API**: `ks.reportScene`
**注册入口**: 快手小程序管理后台 → 数据分析 → 埋点管理

⚠️ **每个 sceneId + dimension key + metric key 都必须先在管理后台注册**，否则上报会返回 `20001` 错误。

---

## 一、Scene ID 清单

### A 组 · 启动加载漏斗（v1.0.68 已有）
| sceneId | 名称 | 触发时机 |
|---|---|---|
| 7001 | JS_START | JS 首次执行 |
| 7002 | WELCOME_SHOWN | 欢迎页首帧绘制完成 |
| 7003 | HOME_READY | 首页可点击 |
| 7004 | FIRST_LEVEL_ENTER | 首次进入任一关卡 |
| 7005 | SCENE_IMG_LOADED | 关卡场景图加载完成 |

### B 组 · 时长留存漏斗（v1.0.69 已有）
| sceneId | 名称 | 触发时机 |
|---|---|---|
| 7010 | FIRST_LEVEL_END | 首关结束（win/lose，去重后一次） |
| 7011 | REACH_3_LEVELS | 累计通关 3 |
| 7012 | REACH_5_LEVELS | 累计通关 5 |
| 7013 | REACH_10_LEVELS | 累计通关 10 |
| 7014 | OPEN_SETTINGS | 打开设置面板 |
| 7016 | MERCY_TRIGGERED | 仁慈机制触发 |

### C 组 · 广告漏斗（v1.0.69 已有）
| sceneId | 名称 | 触发时机 |
|---|---|---|
| 7020 | AD_ENTRY_EXPOSED | 广告入口曝光 |
| 7021 | AD_ENTRY_CLICKED | 广告入口点击 |
| 7022 | AD_LOAD_OK | 广告 load 成功 |
| 7023 | AD_SHOW_END | 广告完整曝光 |
| 7024 | AD_REWARD_GRANTED | 奖励发放 |

### D 组 · 会话行为分析 ⭐ v1.0.74 新增
| sceneId | 名称 | 说明 |
|---|---|---|
| **7030** | **SESSION_SUMMARY** | 会话总览（onHide 触发） |
| **7031** | **SCREEN_STATS_P1** | 屏幕 PV/停留时长 分片 1 |
| **7032** | **SCREEN_STATS_P2** | 屏幕 PV/停留时长 分片 2 |
| **7033** | **BUTTON_STATS_P1** | 按钮点击 分片 1 |
| **7034** | **BUTTON_STATS_P2** | 按钮点击 分片 2 |
| **7040** | **LEVEL_STATS_P1** | 关卡数据 分片 1（L0-L9） |
| **7041** | **LEVEL_STATS_P2** | 关卡数据 分片 2（L10-L19） |
| **7042** | **LEVEL_STATS_P3** | 关卡数据 分片 3（L20-L29） |
| **7043** | **LEVEL_STATS_P4** | 关卡数据 分片 4（L30-L39） |
| **7044** | **LEVEL_STATS_P5** | 关卡数据 分片 5（L40-L49） |
| **7045** | **LEVEL_STATS_P6** | 关卡数据 分片 6（L50-L59） |
| **7046** | **LEVEL_STATS_P7** | 关卡数据 分片 7（L60-L69） |
| **7047** | **LEVEL_STATS_P8** | 关卡数据 分片 8（L70-L79） |
| **7048** | **LEVEL_STATS_P9** | 关卡数据 分片 9（L80-L89） |
| **7049** | **LEVEL_STATS_P10** | 关卡数据 分片 10（L90-L109） |

---

## 二、Dimension Key 清单（v1.0.74 新增）

需要在管理后台注册的 **dimension 字段**（每个 sceneId 都可携带）：

| key | 类型 | 说明 |
|---|---|---|
| `batch` | string | 分片编号（"1"、"2" ...） |
| `range` | string | 关卡区间（"L0-L9"） |
| `reason` | string | 上报触发原因（"onHide" / "manual"） |
| `pkgVer` | string | 代码包版本 v1.0.74 |

---

## 三、Metric Key 清单（v1.0.74 新增）

### 3.1 SESSION_SUMMARY (7030) metric

| key | 说明 |
|---|---|
| `totalMs` | 会话总时长（ms） |
| `totalClicks` | 总点击数 |
| `totalPv` | 总屏幕 PV |
| `screenMs` | 所有屏幕停留时长和（ms） |
| `lvEnter` | 关卡进入总次数 |
| `lvWin` | 关卡通关总次数 |
| `lvLose` | 关卡失败总次数 |
| `wrongCnt` | 全局错误点击数 |

### 3.2 SCREEN_STATS_P1/P2 (7031/7032) metric

格式：`<屏幕名截前10字符>_pv` / `<屏幕名截前10字符>_ms`

需注册的屏幕（每个屏 2 个 metric key）：
- `welcome_pv` / `welcome_ms`
- `home_pv` / `home_ms`
- `level_pv` / `level_ms`
- `level_win_pv` / `level_win_ms`（会被截为 `level_win_pv` / `level_win_ms`，都在 10 字符内✓）
- `level_lose_pv` / `level_lose_ms` (⚠ `level_lose` 是 10 字符，会截为 `level_lose_pv`)
- `settings_pv` / `settings_ms`

### 3.3 BUTTON_STATS_P1/P2 (7033/7034) metric

格式：`<按钮名截前14字符>` = 点击次数

需注册的按钮 key：
- `btn_hint` — 提示按钮
- `btn_skip` — 跳过按钮
- `btn_settings_home` (14 字符边界注意) — 主页设置
- `btn_settings_game` — 游戏内设置
- `tap_correct` — 关内正确点击
- `tap_wrong` — 关内错误点击

### 3.4 LEVEL_STATS_P1~P10 (7040~7049) metric

每关 7 个字段，格式：`L<idx>_<字段>`

| 字段 | 含义 |
|---|---|
| `L<idx>_e` | 该关进入次数 |
| `L<idx>_w` | 该关通关次数 |
| `L<idx>_x` | 该关失败次数 |
| `L<idx>_ms` | 该关累计停留时长（ms） |
| `L<idx>_wr` | 该关累计错误点击数 |
| `L<idx>_h` | 该关使用提示次数 |
| `L<idx>_b` | 该关最佳通关时长（ms） |

**注册量估算**：110 关 × 7 字段 = **770 个 metric key**（这个量得跟平台运营协商是否支持批量导入 CSV）

---

## 四、批量注册操作步骤

1. 登录 [快手小程序管理后台](https://mp.kuaishou.com/)
2. 选择应用 **老铁眼真尖 (ks658651445853447417)**
3. 侧边栏 → **数据分析** → **埋点管理**
4. **场景管理**：先按第一节表格添加 15 个新 sceneId（7030-7049）
5. **维度管理**：按第二节表格添加 4 个 dimension key
6. **指标管理**：
   - 手动添加：SESSION_SUMMARY 8 个字段 + 屏幕 12 个字段 + 按钮 6 个字段
   - 批量导入：LEVEL_STATS 770 个字段（申请 CSV 导入通道）

---

## 五、数据分析用法

### 5.1 关卡难度定位（核心用途）

拉 LEVEL_STATS 数据，用以下公式判断哪一关设计有问题：

- **完成率**：`L<idx>_w / L<idx>_e`（低于 60% → 太难）
- **平均通关耗时**：`L<idx>_ms / L<idx>_w` （远高于同主题均值 → 卡点）
- **平均错误数**：`L<idx>_wr / L<idx>_e`（高 → 异物太隐蔽）
- **提示依赖**：`L<idx>_h / L<idx>_e`（>30% → 找不到）
- **最佳完成时间**：`L<idx>_b`（用户天花板）

### 5.2 页面漏斗

`welcome_pv → home_pv → level_pv → level_win_pv` 每层流失率

### 5.3 按钮热度

`btn_hint / totalClicks` — 提示按钮真实需求
`btn_settings_* / totalClicks` — 设置探索深度

---

## 六、看板设计建议

在快数（天策）新建看板，绑定这批 sceneId，做 3 张核心表：

1. **关卡难度矩阵表**：110 关 × 5 指标（完成率/平均耗时/错误数/提示率/最佳耗时）
2. **屏幕漏斗**：welcome/home/level/win/lose PV & 停留时长趋势
3. **按钮热度榜**：Top 10 按钮点击排序 + 日环比
