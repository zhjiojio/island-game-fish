(function () {
  var AIGCUtils = window.AIGCUtils;
  var EventBus = AIGCUtils.EventBus || window.KwaiEvent;

  function clamp01(v) {
    return Math.max(0, Math.min(1, v));
  }

  /**
   * 烤鱼店动画驱动：玩法状态选 clip，缺帧时用 procedural 动效占位。
   * play 可强制一次片段（点火/翻面/敲击），不被 sync 的循环态立刻盖掉。
   */
  AIGCUtils.AnimDriver = {
    actors: {},
    lastLog: "",
    bound: false,

    init: function () {
      this.actors = {};
      this.lastLog = "";
      this.bindEvents();
    },

    bindEvents: function () {
      if (this.bound || !EventBus || typeof EventBus.on !== "function") return;
      this.bound = true;
      var self = this;
      EventBus.on("baking:qte", function (data) {
        if (!data) return;
        if (data.stage === "stoke") {
          self.play("rabbit", "rabbit_grill_ignite", { force: true, lockMs: 960 });
          console.log("[ShopAnim] ignite_start");
        }
        if (data.stage === "flip") {
          self.play("rabbit", "rabbit_grill_flip", { force: true, lockMs: 960 });
          console.log("[ShopAnim] flip_start");
        }
      });
      EventBus.on("baking:juice_hit", function (data) {
        if (!data) return;
        if (data.kind === "crack") {
          self.play("rabbit", "rabbit_crack_hit", { force: true, lockMs: 480 });
        }
        if (data.kind === "straw") {
          self.play("rabbit", "rabbit_straw", { force: true, lockMs: 480 });
        }
      });
      EventBus.on("anim:play", function (data) {
        if (!data || !data.actorId || !data.clipId) return;
        self.play(data.actorId, data.clipId, data);
      });
    },

    ensure: function (actorId) {
      if (!this.actors[actorId]) {
        this.actors[actorId] = {
          clipId: "",
          elapsed: 0,
          lockUntil: 0,
          // 兔子烤架原画默认 flip=true（facing<0）；顾客默认正面
          facing: actorId === "rabbit" ? -1 : 1,
          phase: Math.random() * 1000,
          fallbackKey: "",
          sideView: false
        };
      }
      return this.actors[actorId];
    },

    lookupClip: function (clipId) {
      if (AIGCUtils.FishingAnims && AIGCUtils.FishingAnims.get(clipId)) return AIGCUtils.FishingAnims.get(clipId);
      if (AIGCUtils.ShopAnims && AIGCUtils.ShopAnims.get(clipId)) return AIGCUtils.ShopAnims.get(clipId);
      return null;
    },

    play: function (actorId, clipId, opts) {
      opts = opts || {};
      var clip = this.lookupClip(clipId);
      if (!clip) {
        console.warn("[ShopAnim] missing clip", clipId);
        return false;
      }
      var actor = this.ensure(actorId);
      var now = typeof AIGCUtils._now === "function" ? AIGCUtils._now() : Date.now();
      if (!opts.force && actor.lockUntil > now) return false;
      // 同 clip 且非 force/restart：不重置 elapsed（oneshot 停在末帧；loop 继续播）
      if (actor.clipId === clipId && !opts.restart && !opts.force) {
        if (opts.facing != null) actor.facing = opts.facing;
        if (opts.fallbackKey) actor.fallbackKey = opts.fallbackKey;
        if (opts.sideView != null) actor.sideView = !!opts.sideView;
        return true;
      }
      actor.clipId = clipId;
      actor.elapsed = 0;
      actor.facing = opts.facing != null ? opts.facing : actor.facing;
      actor.fallbackKey = opts.fallbackKey || clip.fallbackKey || actor.fallbackKey || "";
      actor.sideView = opts.sideView != null ? !!opts.sideView : !!clip.procedural && clip.procedural.indexOf("walk") >= 0;
      actor.lockUntil = opts.force ? now + (opts.lockMs || clip.durationMs || 0) : actor.lockUntil;
      if (opts.force || actor.clipId) {
        var mark = actorId + ":" + clipId;
        if (this.lastLog !== mark) {
          this.lastLog = mark;
          console.log("[ShopAnim] play", actorId, clipId, "force", !!opts.force, "side", actor.sideView);
        }
      }
      return true;
    },

    update: function (dt) {
      this.bindEvents();
      var id;
      for (id in this.actors) {
        if (!this.actors.hasOwnProperty(id)) continue;
        this.actors[id].elapsed += dt;
      }
      this.syncShop();
      this.syncFishing();
    },

    /** 钓鱼区：蓄力+松开抛竿播 cast；bite/reeling 循环 reel；其余静帧 */
    syncFishing: function () {
      var game = AIGCUtils.Game;
      if (!game || game.currentArea !== "fishing" || !AIGCUtils.FishingAnims) return;
      var collection = AIGCUtils.Collection;
      if (!collection) return;
      var phase = collection.phase || "idle";
      var clipId = "rabbit_fish_idle";
      if (phase === "charging" || phase === "cast_anim") clipId = "rabbit_fish_cast";
      else if (phase === "bite" || phase === "reeling") clipId = "rabbit_fish_reel";
      var restart = (phase === "charging" || phase === "cast_anim") && this.lastFishPhase !== phase;
      // cast_anim 由 releaseCast 已 force；此处保证 charging 持续跟帧
      this.play("fish_rabbit", clipId, { fallbackKey: "hero_rabbit_fish", facing: 1, restart: restart });
      if (this.lastFishPhase !== phase) {
        this.lastFishPhase = phase;
        console.log("[FishAnim] phase", phase, "clip", clipId);
      }
    },

    syncShop: function () {
      if (!AIGCUtils.ShopAnims) return;
      var baking = AIGCUtils.Baking;
      var now = typeof AIGCUtils._now === "function" ? AIGCUtils._now() : Date.now();
      var rabbit = this.ensure("rabbit");
      var locked = rabbit.lockUntil > now;

      if (!locked) {
        // facing<0 → flip=true，与原烤架兔子朝向一致；走向柜台仍朝右，走回朝左
        if (baking && baking.flipFx && baking.flipFx.timer < baking.flipFx.duration) {
          this.play("rabbit", "rabbit_grill_flip", { fallbackKey: "hero_rabbit_grill", facing: -1 });
        } else if (baking && baking.current && baking.current.recipeId === "fish_grilled") {
          var stage = baking.current.stage;
          if (stage === "stoke") this.play("rabbit", "rabbit_grill_idle", { fallbackKey: "hero_rabbit_grill", facing: -1 });
          else if (stage === "cooking") {
            this.play("rabbit", AIGCUtils.ShopAnims.cookClipForLevel(false), { fallbackKey: "hero_rabbit_grill", facing: -1 });
          } else if (stage === "flip") {
            this.play("rabbit", AIGCUtils.ShopAnims.cookClipForLevel(true), { fallbackKey: "hero_rabbit_grill", facing: -1 });
          }
        } else if (baking && baking.current && baking.current.recipeId === "coconut_juice") {
          var js = baking.current.stage;
          if (js === "put_tools") this.play("rabbit", "rabbit_put_tools", { fallbackKey: "hero_rabbit_grill", facing: -1 });
          // 柜台在烤架右侧：走向制作点侧身向右
          else if (js === "walk_to_work") this.play("rabbit", "rabbit_walk", { fallbackKey: "hero_rabbit_grill", sideView: true, facing: 1 });
          else if (js === "pick_coconut") this.play("rabbit", "rabbit_pick_coconut", { fallbackKey: "hero_rabbit_grill", facing: -1 });
          else if (js === "crack") this.play("rabbit", "rabbit_crack_ready", { fallbackKey: "hero_rabbit_grill", facing: -1 });
          else if (js === "straw") this.play("rabbit", "rabbit_straw_ready", { fallbackKey: "hero_rabbit_grill", facing: -1 });
          else if (js === "straw_anim") this.play("rabbit", "rabbit_straw", { fallbackKey: "hero_rabbit_grill", facing: -1 });
        } else if (baking && baking.plating && baking.plating.recipeId === "coconut_juice") {
          var pt = baking.plating.timer || 0;
          // 回烤架向左走，身子朝左
          if (pt < 420) this.play("rabbit", "rabbit_walk", { fallbackKey: "hero_rabbit_grill", sideView: true, facing: -1 });
          else if (pt < 750) this.play("rabbit", "rabbit_pick_tools", { fallbackKey: "hero_rabbit_grill", facing: -1 });
          else this.play("rabbit", "rabbit_grill_idle", { fallbackKey: "hero_rabbit_grill", facing: -1 });
        } else {
          this.play("rabbit", "rabbit_grill_idle", { fallbackKey: "hero_rabbit_grill", facing: -1 });
        }
      }

      var queue = (AIGCUtils.Selling && AIGCUtils.Selling.queue) || [];
      for (var i = 0; i < queue.length; i++) {
        var customer = queue[i];
        if (!customer) continue;
        var cid = "customer_" + customer.id;
        var key = AIGCUtils.ShopLayout ? AIGCUtils.ShopLayout.customerSpriteKey(customer) : "";
        var entering = (customer.arrival || 0) > 2;
        var walkClip = AIGCUtils.ShopAnims.walkClipForType(customer.type);
        if (customer.leaving) {
          // 向右离场：侧身朝右（walk sheet 面右，facing>0 → 不镜像）
          this.play(cid, walkClip, {
            fallbackKey: key,
            sideView: true,
            facing: 1
          });
          if (this.lastCustomerLeaveLog !== cid) {
            this.lastCustomerLeaveLog = cid;
            console.log("[ShopAnim] customer leave facing right", customer.id, customer.type);
          }
        } else if (entering) {
          // 从右向左走进：镜像朝左
          this.play(cid, walkClip, {
            fallbackKey: key,
            sideView: true,
            facing: -1
          });
        } else {
          this.play(cid, AIGCUtils.ShopAnims.waitClipForType(customer.type), {
            fallbackKey: key,
            sideView: false,
            facing: 1
          });
        }
      }
    },

    /** 根据 clip 取当前帧；有 sheet 则返回 UV，无 sheet 用 procedural 轻动效。 */
    resolve: function (actorId) {
      var actor = this.ensure(actorId);
      var clip = this.lookupClip(actor.clipId) || {
        loop: true,
        durationMs: 800,
        procedural: "breathe",
        fallbackKey: actor.fallbackKey
      };
      var dur = Math.max(1, clip.durationMs || 800);
      var t = actor.elapsed;
      var progress = clip.loop ? (t % dur) / dur : clamp01(t / dur);
      // 烤制中：帧相位跟进度条走，一条进度内翻烤 cookCycles 圈，满条对准翻面节点
      var cookProg = null;
      if (clip.syncCookProgress && AIGCUtils.Baking && AIGCUtils.Baking.current) {
        var cur = AIGCUtils.Baking.current;
        if (cur.recipeId === "fish_grilled" && cur.stage === "cooking" && cur.cookDuration > 0) {
          cookProg = clamp01(cur.elapsed / cur.cookDuration);
          progress = cookProg;
        }
      }
      var done = !clip.loop && progress >= 1;
      var phase = (t + (actor.phase || 0)) / 1000;
      var hasSheet = !!(clip.sheetKey && (clip.frameCount | 0) >= 1);
      var frame = 0;
      var u0 = 0;
      var v0 = 0;
      var u1 = 1;
      var v1 = 1;
      if (hasSheet) {
        var n = clip.frameCount | 0;
        var cols = clip.cols || n;
        var rows = clip.rows || 1;
        if (cookProg != null) {
          var cycles = clip.cookCycles || 2;
          frame = Math.floor(cookProg * cycles * n) % n;
          if (cookProg >= 1) frame = n - 1;
        } else {
          frame = Math.min(n - 1, Math.floor(progress * n));
          if (!clip.loop && progress >= 1) frame = n - 1;
        }
        var col = frame % cols;
        var row = Math.floor(frame / cols) % rows;
        u0 = col / cols;
        v0 = row / rows;
        u1 = (col + 1) / cols;
        v1 = (row + 1) / rows;
      }
      var motion = hasSheet
        ? { rot: 0, scaleY: 1, dx: 0, dy: 0, alpha: 1 }
        : this.proceduralMotion(clip.procedural, progress, phase, actor);
      return {
        clipId: actor.clipId,
        key: hasSheet ? clip.sheetKey : (actor.fallbackKey || clip.fallbackKey || ""),
        sheetKey: hasSheet ? clip.sheetKey : "",
        hasSheet: hasSheet,
        combinedGrill: !!(hasSheet && clip.combinedGrill),
        frame: frame,
        frameCount: clip.frameCount || 1,
        u0: u0,
        v0: v0,
        u1: u1,
        v1: v1,
        facing: actor.facing,
        flip: actor.facing < 0,
        sideView: actor.sideView,
        progress: progress,
        done: done,
        rot: motion.rot,
        scaleY: motion.scaleY,
        dx: motion.dx,
        dy: motion.dy,
        alpha: motion.alpha
      };
    },

    proceduralMotion: function (kind, progress, phase, actor) {
      var rot = 0;
      var scaleY = 1;
      var dx = 0;
      var dy = 0;
      var alpha = 1;
      var p = progress;
      var w = Math.sin(phase * Math.PI * 2);
      // 无序列帧时只做很轻的呼吸/位移，大角度整图甩是木偶感主因
      if (kind === "breathe" || kind === "hold") {
        scaleY = 1 + Math.sin(phase * Math.PI * 2) * (kind === "hold" ? 0.006 : 0.01);
        dy = Math.sin(phase * Math.PI * 2) * (kind === "hold" ? 0.4 : 0.7);
      } else if (kind === "ignite") {
        rot = Math.sin(p * Math.PI) * 0.1;
        dy = -Math.sin(p * Math.PI) * 3;
      } else if (kind === "cook") {
        rot = Math.sin(phase * Math.PI * 2) * 0.05;
        dy = Math.abs(Math.sin(phase * Math.PI * 2)) * 1.2;
      } else if (kind === "flip") {
        rot = Math.sin(p * Math.PI) * 0.14;
        dy = -Math.sin(p * Math.PI) * 4;
      } else if (kind === "put_tools" || kind === "pick_tools") {
        rot = Math.sin(p * Math.PI) * (kind === "put_tools" ? 0.08 : -0.08);
        dy = Math.sin(p * Math.PI) * 2.5;
      } else if (kind === "walk" || kind === "walk_side") {
        dy = Math.abs(Math.sin(phase * Math.PI * 2 * 1.8)) * 2;
        rot = Math.sin(phase * Math.PI * 2 * 1.8) * 0.03;
      } else if (kind === "pick" || kind === "straw") {
        dy = -Math.sin(p * Math.PI) * 4;
        rot = Math.sin(p * Math.PI) * 0.06;
      } else if (kind === "crack") {
        rot = Math.sin(p * Math.PI) * -0.12;
        dx = Math.sin(p * Math.PI) * 2;
      } else if (kind === "wait_bear") {
        rot = w * 0.02;
        scaleY = 1 + w * 0.01;
        dy = Math.max(0, Math.sin(phase * Math.PI * 0.7)) * 1.5;
      } else if (kind === "wait_otter") {
        dy = Math.abs(Math.sin(phase * Math.PI * 2 * 1.4)) * 2;
        rot = Math.sin(phase * Math.PI * 1.1) * 0.035;
        dx = Math.sin(phase * Math.PI * 1.1) * 1;
      } else if (kind === "wait_cat") {
        rot = Math.sin(phase * Math.PI * 1.3) * 0.04;
        dx = Math.sin(phase * Math.PI * 1.3) * 1.5;
      } else if (kind === "wait_rabbit") {
        dy = Math.abs(Math.sin(phase * Math.PI * 1.2)) * 1.6;
        rot = Math.sin(phase * Math.PI * 2.1) * 0.03;
      } else if (kind === "cast") {
        // sheet 未就绪时的明显抛竿占位：竿大幅前后甩
        rot = Math.sin(phase * Math.PI * 2) * -0.35;
        dy = Math.sin(phase * Math.PI * 2) * -6;
        dx = Math.sin(phase * Math.PI * 2) * 4;
      } else if (kind === "reel") {
        rot = Math.sin(phase * Math.PI * 2) * 0.22;
        dy = Math.sin(phase * Math.PI * 2) * 4;
        dx = Math.cos(phase * Math.PI * 2) * 2;
      }
      return { rot: rot, scaleY: scaleY, dx: dx, dy: dy, alpha: alpha };
    }
  };
})();
