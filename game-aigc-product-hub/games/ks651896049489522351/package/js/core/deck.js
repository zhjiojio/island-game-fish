(function () {
  var M3 = window.M3 = window.M3 || {};
  var C = M3.Config;

  // ---- 牌组操作（客户端） ----
  M3.Deck = {
    // 创建一副完整的牌
    createDeck: function () {
      var deck = [];
      for (var si = 0; si < C.SUITS.length; si++) {
        for (var rank = 3; rank <= 15; rank++) {
          deck.push({ id: C.SUITS[si] + '-' + rank, suit: C.SUITS[si], rank: rank, label: C.RANK_LABELS[rank] });
        }
      }
      deck.push({ id: 'joker-16', suit: 'joker', rank: 16, label: C.RANK_LABELS[16] });
      deck.push({ id: 'joker-17', suit: 'joker', rank: 17, label: C.RANK_LABELS[17] });
      return deck;
    },

    // 洗牌（Fisher-Yates）
    shuffle: function (items) {
      var arr = items.slice();
      for (var i = arr.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
      }
      return arr;
    },

    // 按 rank 降序排序
    sortCards: function (cards) {
      return cards.slice().sort(function (a, b) {
        return b.rank - a.rank || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
      });
    },

    // 获取花色符号
    suitSymbol: function (card) {
      return C.SUIT_SYMBOLS[card.suit] || '';
    },

    // 是否为红色牌
    isRed: function (card) {
      return C.SUIT_COLORS[card.suit] === 'red' || card.suit === 'joker';
    },
  };
})();