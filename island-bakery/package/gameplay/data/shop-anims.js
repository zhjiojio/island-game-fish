(function () {
  window.AIGCUtils = window.AIGCUtils || {};
  /**
   * 烤鱼店角色 clip 表。sheet 有帧时走 UV；无 sheet 时用 fallbackKey + procedural 占位动效。
   * gate 只作文档/校验语义，真正开播由 Baking / Selling / AnimDriver.sync 控制。
   */
  AIGCUtils.ShopAnims = {
    clips: {
      rabbit_grill_idle: {
        actor: "rabbit",
        loop: true,
        durationMs: 800,
        fallbackKey: "hero_rabbit_grill",
        procedural: "breathe",
        gate: "idle"
      },
      rabbit_grill_ignite: {
        actor: "rabbit",
        loop: false,
        durationMs: 960,
        fallbackKey: "hero_rabbit_grill",
        procedural: "ignite",
        gate: "stoke_hit",
        // 合帧精灵表：兔子+烤架，播放时绘制层隐藏单独烤架/兔子
        sheetKey: "anim_rabbit_grill_ignite",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true
      },
      // 四级烤架各一段持续翻烤；进度条相位用 syncCookProgress 驱动帧
      grill_lv1_cook: {
        actor: "rabbit",
        loop: true,
        durationMs: 960,
        fallbackKey: "hero_rabbit_grill",
        procedural: "cook",
        gate: "cooking",
        sheetKey: "anim_grill_lv1_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true,
        syncCookProgress: true,
        cookCycles: 2
      },
      grill_lv2_cook: {
        actor: "rabbit",
        loop: true,
        durationMs: 960,
        fallbackKey: "hero_rabbit_grill",
        procedural: "cook",
        gate: "cooking",
        sheetKey: "anim_grill_lv2_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true,
        syncCookProgress: true,
        cookCycles: 2
      },
      grill_lv3_cook: {
        actor: "rabbit",
        loop: true,
        durationMs: 960,
        fallbackKey: "hero_rabbit_grill",
        procedural: "cook",
        gate: "cooking",
        sheetKey: "anim_grill_lv3_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true,
        syncCookProgress: true,
        cookCycles: 2
      },
      grill_lv4_cook: {
        actor: "rabbit",
        loop: true,
        durationMs: 960,
        fallbackKey: "hero_rabbit_grill",
        procedural: "cook",
        gate: "cooking",
        sheetKey: "anim_grill_lv4_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true,
        syncCookProgress: true,
        cookCycles: 2
      },
      // 翻面等待：同等级 cook 表慢循环，不跟进度条（条已满）
      grill_lv1_cook_hold: {
        actor: "rabbit",
        loop: true,
        durationMs: 1200,
        fallbackKey: "hero_rabbit_grill",
        procedural: "hold",
        gate: "flip_wait",
        sheetKey: "anim_grill_lv1_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true
      },
      grill_lv2_cook_hold: {
        actor: "rabbit",
        loop: true,
        durationMs: 1200,
        fallbackKey: "hero_rabbit_grill",
        procedural: "hold",
        gate: "flip_wait",
        sheetKey: "anim_grill_lv2_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true
      },
      grill_lv3_cook_hold: {
        actor: "rabbit",
        loop: true,
        durationMs: 1200,
        fallbackKey: "hero_rabbit_grill",
        procedural: "hold",
        gate: "flip_wait",
        sheetKey: "anim_grill_lv3_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true
      },
      grill_lv4_cook_hold: {
        actor: "rabbit",
        loop: true,
        durationMs: 1200,
        fallbackKey: "hero_rabbit_grill",
        procedural: "hold",
        gate: "flip_wait",
        sheetKey: "anim_grill_lv4_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true
      },
      // 兼容旧名 → 运行时由 cookClipForLevel 替换
      rabbit_grill_cook: {
        actor: "rabbit",
        loop: true,
        durationMs: 960,
        fallbackKey: "hero_rabbit_grill",
        procedural: "cook",
        gate: "cooking",
        sheetKey: "anim_grill_lv1_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true,
        syncCookProgress: true,
        cookCycles: 2
      },
      rabbit_grill_cook_hold: {
        actor: "rabbit",
        loop: true,
        durationMs: 1200,
        fallbackKey: "hero_rabbit_grill",
        procedural: "hold",
        gate: "flip_wait",
        sheetKey: "anim_grill_lv1_cook",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true
      },
      rabbit_grill_flip: {
        actor: "rabbit",
        loop: false,
        durationMs: 960,
        fallbackKey: "hero_rabbit_grill",
        procedural: "flip",
        gate: "flip_hit",
        sheetKey: "anim_rabbit_grill_flip",
        frameCount: 8,
        cols: 8,
        rows: 1,
        combinedGrill: true
      },
      rabbit_put_tools: {
        actor: "rabbit",
        loop: false,
        durationMs: 640,
        fallbackKey: "hero_rabbit_grill",
        procedural: "put_tools",
        gate: "juice_auto",
        sheetKey: "anim_rabbit_put_tools",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      rabbit_walk: {
        actor: "rabbit",
        loop: true,
        durationMs: 640,
        fallbackKey: "hero_rabbit_grill",
        procedural: "walk",
        gate: "juice_auto",
        sheetKey: "anim_rabbit_juice_walk",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      rabbit_pick_coconut: {
        actor: "rabbit",
        loop: false,
        durationMs: 280,
        fallbackKey: "hero_rabbit_grill",
        procedural: "pick",
        gate: "juice_auto",
        sheetKey: "anim_rabbit_juice_walk",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      rabbit_crack_ready: {
        actor: "rabbit",
        loop: true,
        durationMs: 800,
        fallbackKey: "hero_rabbit_grill",
        procedural: "hold",
        gate: "juice_auto",
        sheetKey: "anim_rabbit_juice_crack",
        frameCount: 1,
        cols: 8,
        rows: 1
      },
      rabbit_crack_hit: {
        actor: "rabbit",
        loop: false,
        durationMs: 480,
        fallbackKey: "hero_rabbit_grill",
        procedural: "crack",
        gate: "crack_hit",
        sheetKey: "anim_rabbit_juice_crack",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      rabbit_straw_ready: {
        actor: "rabbit",
        loop: true,
        durationMs: 800,
        fallbackKey: "hero_rabbit_grill",
        procedural: "hold",
        gate: "juice_auto",
        // 插管待命：停在插管 sheet 首帧（持吸管对准椰子，非喝饮）
        sheetKey: "anim_rabbit_juice_straw",
        frameCount: 1,
        cols: 8,
        rows: 1
      },
      rabbit_straw: {
        actor: "rabbit",
        loop: false,
        durationMs: 480,
        fallbackKey: "hero_rabbit_grill",
        procedural: "straw",
        gate: "straw_hit",
        // 点击后播完整插管；禁止喝饮姿势
        sheetKey: "anim_rabbit_juice_straw",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      rabbit_pick_tools: {
        actor: "rabbit",
        loop: false,
        durationMs: 640,
        fallbackKey: "hero_rabbit_grill",
        procedural: "pick_tools",
        gate: "juice_auto",
        // 拿回工具：复用放工具 sheet（同一放下/拿起动作段）
        sheetKey: "anim_rabbit_put_tools",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_wait_bear: {
        actor: "customer",
        loop: true,
        durationMs: 960,
        procedural: "wait_bear",
        gate: "wait",
        sheetKey: "anim_customer_bear_wait",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_wait_otter: {
        actor: "customer",
        loop: true,
        durationMs: 960,
        procedural: "wait_otter",
        gate: "wait",
        sheetKey: "anim_customer_penguin_wait",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_wait_cat: {
        actor: "customer",
        loop: true,
        durationMs: 960,
        procedural: "wait_cat",
        gate: "wait",
        sheetKey: "anim_customer_fox_wait",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_wait_rabbit: {
        actor: "customer",
        loop: true,
        durationMs: 960,
        procedural: "wait_rabbit",
        gate: "wait",
        sheetKey: "anim_customer_pig_wait",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_bear_walk: {
        actor: "customer",
        loop: true,
        durationMs: 640,
        procedural: "walk_side",
        gate: "enter_or_leave",
        sheetKey: "anim_customer_bear_walk",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_penguin_walk: {
        actor: "customer",
        loop: true,
        durationMs: 640,
        procedural: "walk_side",
        gate: "enter_or_leave",
        sheetKey: "anim_customer_penguin_walk",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_fox_walk: {
        actor: "customer",
        loop: true,
        durationMs: 640,
        procedural: "walk_side",
        gate: "enter_or_leave",
        sheetKey: "anim_customer_fox_walk",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      customer_pig_walk: {
        actor: "customer",
        loop: true,
        durationMs: 640,
        procedural: "walk_side",
        gate: "enter_or_leave",
        sheetKey: "anim_customer_pig_walk",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      // 兼容旧通用侧身走名
      customer_walk_side: {
        actor: "customer",
        loop: true,
        durationMs: 640,
        procedural: "walk_side",
        gate: "enter_or_leave",
        sheetKey: "anim_customer_penguin_walk",
        frameCount: 8,
        cols: 8,
        rows: 1
      }
    },

    waitClipForType: function (type) {
      if (type === "bear") return "customer_wait_bear";
      if (type === "otter") return "customer_wait_otter";
      if (type === "cat") return "customer_wait_cat";
      if (type === "rabbit") return "customer_wait_rabbit";
      return "customer_wait_otter";
    },

    walkClipForType: function (type) {
      if (type === "bear") return "customer_bear_walk";
      if (type === "otter") return "customer_penguin_walk";
      if (type === "cat") return "customer_fox_walk";
      if (type === "rabbit") return "customer_pig_walk";
      return "customer_penguin_walk";
    },

    /** walk sheet 原画是否面朝右；狐狸表面朝左，离场/进场镜像要反过来 */
    walkSheetFacesRight: function (type) {
      if (type === "cat") return false;
      return true;
    },

    /** 进场朝左 / 离场朝右 时，该类型 walk sheet 是否需要水平翻转 */
    walkFlipForDir: function (type, towardRight) {
      var sheetRight = this.walkSheetFacesRight(type);
      // 要朝右：sheet 面右则不翻，面左则翻；要朝左则相反
      return towardRight ? !sheetRight : sheetRight;
    },

    grillLevel: function () {
      var lv = (AIGCUtils.GameState && AIGCUtils.GameState.level) || 1;
      return Math.max(1, Math.min(4, lv | 0));
    },

    /** 当前店铺等级对应的持续翻烤 / 翻面等待 clip */
    cookClipForLevel: function (hold) {
      var lv = this.grillLevel();
      return hold ? ("grill_lv" + lv + "_cook_hold") : ("grill_lv" + lv + "_cook");
    },

    get: function (clipId) {
      return this.clips[clipId] || null;
    }
  };

  /**
   * 钓鱼区兔子 clip：透明底仅兔+竿；charging 抛竿，reeling 全程循环提竿。
   * 使用独立 actor `fish_rabbit`，避免与烤鱼店 rabbit sync 互相覆盖。
   */
  AIGCUtils.FishingAnims = {
    clips: {
      rabbit_fish_idle: {
        actor: "fish_rabbit",
        loop: true,
        durationMs: 800,
        fallbackKey: "hero_rabbit_fish",
        procedural: "breathe",
        gate: "idle"
      },
      rabbit_fish_cast: {
        actor: "fish_rabbit",
        // 蓄力时循环预摆；松开 cast_anim 会 restart 再播一段
        // R0001：抛竿过快 → 拉长到约 1.5s 一圈
        loop: true,
        durationMs: 1500,
        fallbackKey: "hero_rabbit_fish",
        procedural: "cast",
        gate: "charging",
        sheetKey: "anim_rabbit_fish_cast",
        frameCount: 8,
        cols: 8,
        rows: 1
      },
      rabbit_fish_reel: {
        actor: "fish_rabbit",
        loop: true,
        durationMs: 720,
        fallbackKey: "hero_rabbit_fish",
        procedural: "reel",
        gate: "reeling",
        sheetKey: "anim_rabbit_fish_reel",
        frameCount: 8,
        cols: 8,
        rows: 1
      }
    },
    get: function (clipId) {
      return this.clips[clipId] || null;
    }
  };
})();
