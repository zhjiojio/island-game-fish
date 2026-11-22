# island-bakery 问题索引

本索引用于快速定位，不替代区域文档中的完整记录。

| 轮次 ID | 日期 | 区域/子区域 | 问题摘要 | 状态 | 关联历史轮次 | 文档位置 |
|---------|------|-------------|----------|------|--------------|----------|
| R0001 | 2026-11-18 | 钓鱼区/海面分层与抛竿 | 硬切线、色差、闪帧、左岸方块海、抛竿过快、缺碎浪 | 已重新打开 | 无 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0002 | 2026-11-18 | 钓鱼区/海面合一 | 三长方形分区、右下漏底板、船区竖直浪 | 已重新打开 | R0001 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0003 | 2026-11-18 | 钓鱼区/海面合一 | 漏静海、横线、色差、左缘像素硬边 | 已重新打开 | R0002 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0004 | 2026-11-18 | 钓鱼区/海面合一 | 多块海、近岸方块、左静海、盖山、盖地图背包、沙滩未包裹 | 已重新打开 | R0003 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0005 | 2026-11-18 | 钓鱼区/海面合一 | 用户要求撤销海浪分层动画（越改越差） | 已重新打开 | R0001–R0004 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0006 | 2026-11-18 | 钓鱼区/船层 | 停 bob 后仍双船（noboat 仍烤船+精灵） | 已重新打开 | R0005 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0007 | 2026-11-18 | 钓鱼区/船层 | 兔子下绿色阴影（noboat 绿罩） | 待用户验收 | R0005/R0006 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0008 | 2026-11-18 | 钓鱼区/动态海第1批 | C0 验收基线 + C7 UI 拆独立透明层 | 已关闭 | R0001–R0007；父方案 `--21` | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0009 | 2026-11-18 | 钓鱼区/动态海第2批 | C2 清洗蒙版 RGB 与 seaflat（去旧浪纹） | 已关闭 | R0008；父方案 `--21` | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0010 | 2026-11-18 | 钓鱼区/动态海第3批 | C1 + 新船/下移/裁剪/减小摆动硬裁（补丁5–8） | 待用户验收 | R0009；`--00-竖屏船摆动减小与硬裁` | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0011 | 2026-11-20 | 钓鱼区/交付门禁 | renderer 使用 document 离屏画布，改为 WebGL readPixels | 待用户验收 | R0010 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0012 | 2026-11-20 | 钓鱼区/包体纹理 | 8 张 sea sheet 超 2048，重排 4×3 网格并同步 UV | 待用户验收 | R0005 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0013 | 2026-11-20 | 交付/资源路径 | 真机精灵层全丢：`?v=` 路径未剥离导致字帖/UI/船海加载失败 | 待用户验收 | R0012 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0014 | 2026-11-20 | 钓鱼区/动态海第4批 | C3：横移色带→向岸涌浪脊线（v107） | 待用户验收 | R0009/R0010；父方案 `--21` | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0015 | 2026-11-20 | 钓鱼区/动态海第5批 | C4 拍岸碎浪+波峰碎沫；sea-meta；`?foam=0` | 待用户验收 | R0014；父方案 `--21`；`--17` | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0015 | 2026-11-20 | 烤鱼店/兔子与指引；钓鱼区绿区字 | 横屏兔1.4×脚下移；绿区加深；烤鱼提示+首次箭头；钓鱼字加深 | 待用户验收 | 无 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0016 | 2026-11-20 | 钓鱼区/动态海 C3 浪形 | 亮线→峰谷体积浪形（乘性） | 已重新打开 | R0014/R0015；`--18` 收口 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0017 | 2026-11-20 | 钓鱼区/动态海 C3 浪形 | 乘性拧渐变→加法表面光（单变量） | 已重新打开 | R0016；`--18` 加法光照 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0018 | 2026-11-20 | 钓鱼区/动态海 C3 浪形 | Plan B：轻度平整底色再叠浪 | 已关闭 | R0017；`--18` PlanB | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0019 | 2026-11-20 | 钓鱼区/动态海 C4 | 近岸浪花：碎点 swash 推进回退 | 待用户验收 | R0018；`--18` C4 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0020 | 2026-11-22 | 烤鱼店/合表尺度 | 合表 maxH 过紧导致烤制兔比静帧矮约 35% | 待用户验收 | R0015 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0021 | 2026-11-22 | 地图/未解锁提示 | 未解锁弹窗改为「未达到解锁条件」+ 分区等级金币文案 | 已重新打开 | 无 | `docs/PdeMonster/island-bakery__地图.md` |
| R0022 | 2026-11-22 | 烤鱼店/横屏阶段提示字 | 生火/烤制/翻面提示改为与空闲同款白加粗 | 待用户验收 | R0015 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0023 | 2026-11-22 | 地图/未解锁提示 | 弹窗缺字、条件行偏下、墨色不显眼 | 待用户验收 | R0021 | `docs/PdeMonster/island-bakery__地图.md` |
| R0024 | 2026-11-22 | 地图/文档 | 分区金币开门逻辑回写 GDD/方案/设计文档 | 待用户验收 | R0021 | `docs/PdeMonster/island-bakery__地图.md` |
| R0025 | 2026-11-22 | 新人引导/地图起手与分区解锁 | 地图首屏+锁/红箭头+三弹窗+第一条鱼解锁椰林+首次烤鱼收尾 | 已重新打开 | R0021/R0023 | `docs/PdeMonster/island-bakery__新人引导.md` |
| R0026 | 2026-11-22 | 新人引导/验收修正；钓鱼区拉锯提示 | 箭头指木牌上方；跳过搭建；落盘后再结束弹窗；椰汁提示；拉锯文案 | 待用户验收 | R0025 | `docs/PdeMonster/island-bakery__新人引导.md` |
| R0027 | 2026-11-22 | 椰林区/玩法提示 | 增加「点击椰子摇落椰子 接住掉落的椰子」 | 已重新打开 | 无 | `docs/PdeMonster/island-bakery__椰林区.md` |
| R0028 | 2026-11-22 | 烤鱼店/椰汁提示 | 「点击椰子开始制作椰汁」上移 | 待用户验收 | R0026 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0029 | 2026-11-22 | 烤鱼店/出餐标题 | 「椰子汁完成」上移 | 待用户验收 | R0028 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0030 | 2026-11-22 | 椰林区/玩法提示 | 只留棕色「点击椰树摇落椰子 接住掉落椰子」 | 已重新打开 | R0027 | `docs/PdeMonster/island-bakery__椰林区.md` |
| R0031 | 2026-11-22 | 全局/玩法提示样式 | 统一绿色流光粗体 drawGuideTip | 已重新打开 | R0022/R0030 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0032 | 2026-11-22 | 全局/玩法提示样式 | drawGuideTip 主色改棕色流光 | 已重新打开 | R0031 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0033 | 2026-11-22 | 全局/玩法提示样式 | 改暖奶油金+流光减速 | 待用户验收 | R0032 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0034 | 2026-11-22 | 椰林区/玩法提示对比度 | 绿叶底上加半透明深底+加粗描边 | 待用户验收 | R0033 | `docs/PdeMonster/island-bakery__椰林区.md` |
| R0035 | 2026-11-22 | 椰林区/提示底框居中 | 底框按字形包围盒垂直居中 | 待用户验收 | R0034 | `docs/PdeMonster/island-bakery__椰林区.md` |
| R0036 | 2026-11-22 | 椰林区/提示底框材质 | 深棕硬贴→奶油多层渐隐（无边框阴影） | 待用户验收 | R0034/R0035 | `docs/PdeMonster/island-bakery__椰林区.md` |
| R0037 | 2026-11-22 | 启动/资源加载 | 两阶段必需包+硬门闸 loading，禁旧素材闪现 | 待用户验收 | R0013 | `docs/PdeMonster/island-bakery__启动加载.md` |
| R0038 | 2026-11-22 | 交付/包体校验 | Audio 目录与 BootOverlay/脚手架合规 | 待用户验收 | R0037 | `docs/PdeMonster/island-bakery__启动加载.md` |
| R0039 | 2026-11-22 | 钓鱼/椰林/离线窗 | 横屏主钮同锚；椰林去底；欢迎回来等结算壳 | 待用户验收 | R0036/R0037 | `docs/PdeMonster/island-bakery__钓鱼区.md` 等 |
| R0040 | 2026-11-22 | 烤鱼店/椰子数量 | 原料椰子×N + 椰汁堆×N 对齐鱼盘 | 已重新打开 | 无 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0041 | 2026-11-22 | 钓鱼区/逃鱼弹窗 | 圆盘中心补生鱼素材对齐钓到了 | 待用户验收 | 无 | `docs/PdeMonster/island-bakery__钓鱼区.md` |
| R0042 | 2026-11-22 | 烤鱼店/椰汁数量 | 去掉×N；制作好椰汁右侧木牌显示数量 | 待用户验收 | R0040 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0043 | 2026-11-22 | 烤鱼店/椰汁木牌 | 底栏金色传说移到椰汁左；木牌落原鱼标位 | 已重新打开 | R0042 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0044 | 2026-11-22 | 烤鱼店/底栏布局 | 五等分物体+同宽木牌，均匀间距不挤窄 | 已重新打开 | R0043 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0045 | 2026-11-22 | 烤鱼店/桌面带布局 | 半桌宽五等分竖排物体+同宽木牌 | 待用户验收 | R0044 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0046 | 2026-11-22 | 烤鱼店/成品烤鱼 | 落盘脚点上提避开底栏木牌 | 待用户验收 | R0045 | `docs/PdeMonster/island-bakery__烤鱼店.md` |
| R0038 | 2026-11-22 | 启动/交付包体 | 音效目录大小写致主包超限；脚手架扫描报错 | 待用户验收 | R0037 | `docs/PdeMonster/island-bakery__启动加载.md` |
