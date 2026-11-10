(function () {
  var AIGCUtils = window.AIGCUtils;
  var EventBus = AIGCUtils.EventBus || window.KwaiEvent;

  AIGCUtils.Selling = {
    queue: [],
    nextCustomerId: 1,
    moneyEffects: [],

    init: function () {
      this.queue = [];
      this.nextCustomerId = 1;
      this.moneyEffects = [];
      if (AIGCUtils.GameState.shopBuilt) this.start();
    },

    start: function () {
      if (this.queue.length) return;
      this.queue = [this.createCustomer(0), this.createCustomer(1)];
      console.log("[Prototype] First random orders created");
    },

    createCustomer: function (slot) {
      var stock = AIGCUtils.GameState.fishStock;
      var spotId = AIGCUtils.Collection.spotId;
      var baitId = AIGCUtils.Collection.baitId;
      var orderable = AIGCUtils.Recipes.getOrderableSpeciesIds(spotId, baitId);
      var orderRollOptions = { spotId: spotId, baitId: baitId, perfect: true };
      var firstOrder = AIGCUtils.GameState.stats.totalOrders === 0 && slot === 0;
      var speciesId;
      if (firstOrder && stock.length) {
        var pickFrom = stock.filter(function (f) {
          return orderable.indexOf(AIGCUtils.Recipes.normalizeSpeciesId(f.speciesId)) >= 0;
        });
        if (pickFrom.length) {
          speciesId = pickFrom[Math.floor(Math.random() * pickFrom.length)].speciesId;
        } else {
          speciesId = AIGCUtils.Recipes.rollFishSpecies(orderRollOptions);
        }
      } else {
        speciesId = AIGCUtils.Recipes.rollFishSpecies(orderRollOptions);
      }
      var fish = firstOrder ? 1 : Math.floor(Math.random() * 3);
      var juice = firstOrder ? Math.floor(Math.random() * 2) : Math.floor(Math.random() * 3);
      if (!firstOrder && fish + juice === 0) juice = 1;
      if (!firstOrder && fish + juice > 3) juice = 3 - fish;
      var animals = ["otter", "cat", "rabbit", "bear"];
      return {
        id: this.nextCustomerId++,
        type: animals[Math.floor(Math.random() * animals.length)],
        active: true,
        leaving: false,
        leaveTimer: 0,
        arrival: 320,
        slot: slot,
        order: { speciesId: speciesId, fish: fish, juice: juice }
      };
    },

    getMissing: function (customer) {
      var fishReady = AIGCUtils.GameState.getProductCount("fish_grilled", customer.order.speciesId);
      var juiceReady = AIGCUtils.GameState.getProductCount("coconut_juice");
      return {
        fish: Math.max(0, customer.order.fish - fishReady),
        juice: Math.max(0, customer.order.juice - juiceReady)
      };
    },

    takeProducts: function (recipeId, speciesId, amount) {
      var products = [];
      for (var i = 0; i < amount; i++) {
        var index = AIGCUtils.GameState.bakedGoods.findIndex(function (good) {
          return good.recipeId === recipeId && (!speciesId || good.speciesId === speciesId);
        });
        if (index < 0) break;
        products.push(AIGCUtils.GameState.bakedGoods.splice(index, 1)[0]);
      }
      return products;
    },

    sell: function (customerIndex) {
      var customer = this.queue[customerIndex];
      if (!customer || !customer.active || customer.leaving) return { success: false, message: "顾客已离开" };
      var missing = this.getMissing(customer);
      if (missing.fish || missing.juice) {
        var parts = [];
        if (missing.fish) parts.push(AIGCUtils.Recipes.getFishSpecies(customer.order.speciesId).name + "烤鱼 " + missing.fish + "份");
        if (missing.juice) parts.push("椰子汁 " + missing.juice + "份");
        return { success: false, message: "还需要 " + parts.join("、") };
      }
      var products = this.takeProducts("fish_grilled", customer.order.speciesId, customer.order.fish);
      products = products.concat(this.takeProducts("coconut_juice", null, customer.order.juice));
      var price = products.reduce(function (sum, good) { return sum + good.unitPrice; }, 0);
      AIGCUtils.GameState.addCoins(price);
      AIGCUtils.GameState.stats.totalSold += products.length;
      AIGCUtils.GameState.stats.totalOrders++;
      customer.leaving = true;
      customer.active = false;
      customer.leaveTimer = 0;
      this.moneyEffects.push({ slot: customerIndex, amount: price, timer: 0 });
      AIGCUtils.GameState.save();
      EventBus.emit("selling:sold", {
        price: price,
        itemCount: products.length,
        customerIndex: customerIndex
      });
      console.log("[Prototype] Order delivered", customer.id, products.length, price);
      return { success: true, price: price, itemCount: products.length };
    },

    update: function (dt) {
      for (var effectIndex = this.moneyEffects.length - 1; effectIndex >= 0; effectIndex--) {
        this.moneyEffects[effectIndex].timer += dt;
        if (this.moneyEffects[effectIndex].timer >= 1100) this.moneyEffects.splice(effectIndex, 1);
      }
      for (var i = 0; i < this.queue.length; i++) {
        var customer = this.queue[i];
        customer.arrival = Math.max(0, customer.arrival - dt * 0.7);
        if (!customer.leaving) continue;
        customer.leaveTimer += dt;
      if (customer.leaveTimer >= 1100) {
        this.queue[i] = this.createCustomer(i);
        console.log("[Prototype] Customer replaced with currently obtainable order", this.queue[i].order.speciesId);
      }
      }
    },

    getQueue: function () {
      return this.queue;
    }
  };
})();
