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
      rabbit: { x: 74, y: 388 },
      customers: [
        { x: 830, y: 348, headDx: 0, headDy: -92 },
        { x: 868, y: 468, headDx: 0, headDy: -92 }
      ],
      plates: [
        { id: "small", x: 72, y: 416 },
        { id: "salmon", x: 176, y: 416 },
        { id: "tuna", x: 280, y: 416 },
        { id: "golden", x: 384, y: 416 }
      ],
      juicer: { x: 524, y: 228 }
    },
    port: {
      grill: { x: 0.52, y: 0.825 },
      rabbit: { x: 0.30, y: 0.825 },
      customers: [
        { x: 0.17, y: 0.312, headDx: 0, headDy: -0.095 },
        { x: 0.81, y: 0.312, headDx: 0, headDy: -0.095 }
      ],
      plates: [
        { id: "small", x: 0.096, y: 0.748 },
        { id: "salmon", x: 0.148, y: 0.748 },
        { id: "tuna", x: 0.200, y: 0.748 },
        { id: "golden", x: 0.252, y: 0.748 }
      ],
      juicer: { x: 0.667, y: 0.466 }
    }
  };
})();
