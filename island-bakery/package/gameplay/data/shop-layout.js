(function () {
  window.AIGCUtils = window.AIGCUtils || {};
  /**
   * 烤鱼店原画层槽位。
   * 横屏是设计坐标 960×540；竖屏 x/y、headDx/headDy 都是相对画面宽高的比例。
   * 每个槽的 x、y 是脚底（烤架、榨汁器是底座下沿中心）。
   * headDx、headDy 是头相对脚底的偏移，屏幕 Y 向下，头在脚上方所以 headDy 为负。
   * 气泡底边中心 = 脚底 + head 偏移，不再使用 orderBubble 的 cx/top。
   */
  AIGCUtils.ShopLayout = {
    /** 矢量回退仍用旧锚点；原画层订单气泡不读这里 */
    orderBubbleLand: [
      { cx: 388, top: 54, bw: 168, bh: 56, rowFishY: 72, rowJuiceY: 92 },
      { cx: 748, top: 228, bw: 168, bh: 56, rowFishY: 246, rowJuiceY: 266 }
    ],
    orderBubblePort: [
      { cx: 0.34, rowFishFrac: 0.21, rowJuiceFrac: 0.28 },
      { cx: 0.66, rowFishFrac: 0.21, rowJuiceFrac: 0.28 }
    ],
    grillKey: function () {
      var lv = (AIGCUtils.GameState && AIGCUtils.GameState.level) || 1;
      lv = Math.max(1, Math.min(4, lv | 0));
      return "grill_lv" + lv;
    },
    /**
     * 队列类型是 otter/cat/rabbit/bear，立绘是单人顾客。
     * 没有同名立绘的类型用现成单人顾客，不用拼在一张上的 customer_cat。
     */
    customerSpriteKey: function (customer) {
      var type = customer && customer.type;
      if (type === "bear") return customer.id % 2 ? "customer_bear_cream" : "customer_bear_blue";
      if (type === "cat") return "customer_fox";
      if (type === "rabbit") return "customer_pig";
      return "customer_penguin";
    },
    land: {
      grill: { x: 188, y: 388 },
      // 脚底下移：配合横屏 rabbitH≈1.4×，手仍靠近操作台、脚落地面（R0015）
      rabbit: { x: 74, y: 416 },
      // 店外两张圆桌和三把椅子已从横屏底板去掉。这里是站立精灵的两个脚底，落在原座位处的沙滩上。
      // 不要改成坐姿，也不要把身体再对齐已经不存在的椅子。气泡底边中心仍是脚底 + headDx/headDy。
      customers: [
        { x: 830, y: 348, headDx: 0, headDy: -92 },
        { x: 868, y: 468, headDx: 0, headDy: -92 }
      ],
      // R0046b：上提过多回落；360→390（仍高于原 416，避开木牌）
      plates: [
        { id: "small", x: 72, y: 390 },
        { id: "salmon", x: 168, y: 390 },
        { id: "tuna", x: 264, y: 390 },
        { id: "golden", x: 350, y: 390 }
      ],
      // R0045：横屏底栏五等分相对桌面带（约半屏略宽，保证 101 木牌五格不重叠）
      trayBand: { left: 36, right: 546 },
      // R0045f：五格整体下移（木牌顶 Y，原 402）
      trayPlaqueY: 414,
      // R0045e：椰汁上提过多回落 −10→−4；金枪鱼仍 +8
      trayIconDy: [0, 0, 8, 0, -4],
      // 横屏桌面椰汁脚点：R0045 起由 Renderer.landJuiceStackPoint 跟第 5 格物体位；此处仅回退参考
      juiceStack: { x: 456, y: 444 },
      // 青椰子堆和榨汁器之间的柜台空位（兼容/提示字回退）；兔与椰拆开见 juiceStand / juiceNut。
      work: { x: 468, y: 210 },
      // 横屏椰汁：脚落柜台前；相对 (348,355) 右上贴近青椰（R0015）
      juiceStand: { x: 385, y: 305 },
      juiceNut: { x: 455, y: 228 },
      juicer: { x: 524, y: 228 }
    },
    port: {
      grill: { x: 0.52, y: 0.825 },
      rabbit: { x: 0.30, y: 0.825 },
      customers: [
        { x: 0.17, y: 0.312, headDx: 0, headDy: -0.095 },
        { x: 0.81, y: 0.312, headDx: 0, headDy: -0.095 }
      ],
      // 左侧成品桌竖排，脚底对齐兔子同层木桌（rabbit.y≈0.825）；步距约 0.05，避免高约 48 的烤鱼叠在一起
      plates: [
        { id: "small", x: 0.13, y: 0.765 },
        { id: "salmon", x: 0.13, y: 0.820 },
        { id: "tuna", x: 0.13, y: 0.900 },
        { id: "golden", x: 0.13, y: 0.950 }
      ],
      // 竖屏椰汁堆独立锚点（改鱼前相对末槽算得的落点），勿再绑 plates，避免调鱼高度时连带椰汁
      juiceStack: { x: 0.23, y: 0.775 },
      // 中层：兔子在青椰堆与圆木板之间（勿压椰堆）；椰子落圆木板台面（勿悬空偏上）。
      work: { x: 0.45, y: 0.50 },
      juiceStand: { x: 0.34, y: 0.52 },
      juiceNut: { x: 0.45, y: 0.50 },
      juicer: { x: 0.667, y: 0.466 }
    }
  };
})();
