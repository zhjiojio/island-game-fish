(function () {
  window.AIGCUtils = window.AIGCUtils || {};
  /** 与 assets/游戏元素清单.json 一致；单图路径相对 res/Image/sprites/ */
  AIGCUtils.AssetSprites = {
    grillLevel: function (lv) {
      var n = Math.max(1, Math.min(4, lv || 1));
      return "sprites/grill_lv" + n + ".png";
    },
    coconut: {
      green: "sprites/coconut_green.png",
      golden: "sprites/coconut_golden.png",
      greenJuiced: "sprites/coconut_green_juiced.png",
      goldenJuiced: "sprites/coconut_golden_juiced.png"
    },
    grilled: {
      small: "sprites/grilled_small.png",
      salmon: "sprites/grilled_salmon.png",
      tuna: "sprites/grilled_tuna.png",
      golden: "sprites/grilled_golden.png"
    },
    /** 成品图四周有透明边，脚底对齐要用内容区，不要用整张画布底边 */
    trim: {
      grilled_small: [108 / 1024, 71 / 768, 983 / 1024, 683 / 768],
      grilled_salmon: [45 / 1024, 41 / 768, 927 / 1024, 1],
      grilled_tuna: [67 / 1024, 13 / 768, 974 / 1024, 663 / 768],
      grilled_golden: [28 / 1024, 0, 976 / 1024, 694 / 768],
      fish_raw_small: [146 / 1024, 183 / 768, 892 / 1024, 540 / 768],
      fish_raw_salmon: [18 / 1024, 150 / 768, 963 / 1024, 558 / 768],
      fish_raw_tuna: [53 / 1024, 0, 1023 / 1024, 535 / 768],
      fish_raw_golden: [0, 0, 977 / 1024, 588 / 768],
      // 椰子树.png 品红底抠掉后的树冠到树根，轴心用这块内容的底边中心
      coconut_tree: [70 / 1344, 24 / 2016, 1272 / 1344, 1984 / 2016]
    },
    coconutIconVariant: function (use) {
      if (use === "golden_juiced") return "golden_juiced";
      if (use === "golden") return "golden";
      if (use === "juice" || use === "order" || use === "green_juiced") return "green_juiced";
      return "green";
    }
  };
})();
