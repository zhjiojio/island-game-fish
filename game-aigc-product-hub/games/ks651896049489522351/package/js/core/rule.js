(function () {
  var M3 = window.M3 = window.M3 || {};

  // ---- 斗地主出牌规则引擎（客户端） ----
  var PLAY_LABELS = {
    single: '单张', pair: '对子', triple: '三张',
    'triple-single': '三带一', 'triple-pair': '三带二',
    straight: '顺子', 'pair-straight': '连对',
    airplane: '飞机', 'airplane-singles': '飞机带单', 'airplane-pairs': '飞机带对',
    'four-two-singles': '四带二', 'four-two-pairs': '四带两对',
    bomb: '炸弹', rocket: '火箭',
  };

  function rankGroups (cards) {
    var counts = {};
    for (var i = 0; i < cards.length; i++) {
      var r = cards[i].rank;
      counts[r] = (counts[r] || 0) + 1;
    }
    var groups = [];
    var keys = Object.keys(counts);
    for (var k = 0; k < keys.length; k++) {
      groups.push({ rank: Number(keys[k]), count: counts[keys[k]] });
    }
    groups.sort(function (a, b) { return b.count - a.count || b.rank - a.rank; });
    return groups;
  }

  function isConsecutive (ranks) {
    for (var i = 0; i < ranks.length; i++) {
      if (ranks[i] >= 15) return false;
    }
    for (var i = 1; i < ranks.length; i++) {
      if (ranks[i] !== ranks[i - 1] + 1) return false;
    }
    return true;
  }

  function consecutiveSlices (ranks) {
    var valid = [];
    for (var i = 0; i < ranks.length; i++) {
      if (ranks[i] < 15) valid.push(ranks[i]);
    }
    valid.sort(function (a, b) { return a - b; });
    var slices = [];
    var start = 0;
    for (var i_ = 1; i_ <= valid.length; i_++) {
      if (i_ === valid.length || valid[i_] !== valid[i_ - 1] + 1) {
        var run = valid.slice(start, i_);
        for (var len = run.length; len >= 2; len--) {
          for (var offset = 0; offset + len <= run.length; offset++) {
            slices.push(run.slice(offset, offset + len));
          }
        }
        start = i_;
      }
    }
    slices.sort(function (a, b) { return b.length - a.length || b[b.length - 1] - a[a.length - 1]; });
    return slices;
  }

  M3.Rule = {
    analyzePlay: function (cards) {
      if (!cards || cards.length === 0) return null;
      var groups = rankGroups(cards);
      var counts = groups.map(function (g) { return g.count; }).sort(function (a, b) { return b - a; });
      var ranks = groups.map(function (g) { return g.rank; }).sort(function (a, b) { return a - b; });
      var len = cards.length;

      // rocket
      if (len === 2 && ranks[0] === 16 && ranks[1] === 17) {
        return { type: 'rocket', rank: 17, length: len, label: PLAY_LABELS.rocket };
      }
      // bomb
      if (len === 4 && groups.length === 1) {
        return { type: 'bomb', rank: groups[0].rank, length: len, label: PLAY_LABELS.bomb };
      }
      // single
      if (len === 1) return { type: 'single', rank: ranks[0], length: len, label: PLAY_LABELS.single };
      // pair
      if (len === 2 && groups.length === 1) return { type: 'pair', rank: ranks[0], length: len, label: PLAY_LABELS.pair };
      // triple
      if (len === 3 && groups.length === 1) return { type: 'triple', rank: ranks[0], length: len, label: PLAY_LABELS.triple };
      // triple-single
      if (len === 4 && counts[0] === 3) {
        var r3 = null;
        for (var gi = 0; gi < groups.length; gi++) { if (groups[gi].count === 3) { r3 = groups[gi].rank; break; } }
        return { type: 'triple-single', rank: r3, length: len, label: PLAY_LABELS['triple-single'] };
      }
      // triple-pair
      if (len === 5 && counts[0] === 3 && counts[1] === 2) {
        var r3p = null;
        for (var gi2 = 0; gi2 < groups.length; gi2++) { if (groups[gi2].count === 3) { r3p = groups[gi2].rank; break; } }
        return { type: 'triple-pair', rank: r3p, length: len, label: PLAY_LABELS['triple-pair'] };
      }
      // straight
      if (len >= 5 && groups.every(function (g) { return g.count === 1; }) && isConsecutive(ranks)) {
        return { type: 'straight', rank: ranks[ranks.length - 1], length: len, chainLength: ranks.length, label: PLAY_LABELS.straight };
      }
      // pair-straight
      if (len >= 6 && len % 2 === 0 && groups.every(function (g) { return g.count === 2; }) && isConsecutive(ranks)) {
        return { type: 'pair-straight', rank: ranks[ranks.length - 1], length: len, chainLength: ranks.length, label: PLAY_LABELS['pair-straight'] };
      }
      // airplane variants
      var triples = [];
      for (var gi3 = 0; gi3 < groups.length; gi3++) {
        if (groups[gi3].count === 3) triples.push(groups[gi3].rank);
      }
      triples.sort(function (a, b) { return a - b; });
      if (triples.length >= 2) {
        var chains = consecutiveSlices(triples);
        for (var ci = 0; ci < chains.length; ci++) {
          var chain = chains[ci];
          var n = chain.length;
          var mainRank = chain[chain.length - 1];
          if (len === n * 3) {
            return { type: 'airplane', rank: mainRank, length: len, chainLength: n, label: PLAY_LABELS.airplane };
          }
          var chainSet = {};
          for (var cj = 0; cj < chain.length; cj++) chainSet[chain[cj]] = true;
          var extra = 0, pairExtra = 0;
          for (var gk = 0; gk < groups.length; gk++) {
            if (chainSet[groups[gk].rank]) {
              extra += Math.max(0, groups[gk].count - 3);
            } else {
              extra += groups[gk].count;
              if (groups[gk].count === 2) pairExtra++;
            }
          }
          if (len === n * 4 && extra === n) {
            return { type: 'airplane-singles', rank: mainRank, length: len, chainLength: n, label: PLAY_LABELS['airplane-singles'] };
          }
          if (len === n * 5 && pairExtra === n && extra === n * 2) {
            return { type: 'airplane-pairs', rank: mainRank, length: len, chainLength: n, label: PLAY_LABELS['airplane-pairs'] };
          }
        }
      }
      // four-two-singles
      if (len === 6 && counts[0] === 4) {
        var r4 = null;
        for (var gi4 = 0; gi4 < groups.length; gi4++) { if (groups[gi4].count === 4) { r4 = groups[gi4].rank; break; } }
        return { type: 'four-two-singles', rank: r4, length: len, label: PLAY_LABELS['four-two-singles'] };
      }
      // four-two-pairs
      if (len === 8 && counts[0] === 4) {
        var pairCount = 0, r4p = null;
        for (var gi5 = 0; gi5 < groups.length; gi5++) {
          if (groups[gi5].count === 2) pairCount++;
          if (groups[gi5].count === 4) r4p = groups[gi5].rank;
        }
        if (pairCount === 2) return { type: 'four-two-pairs', rank: r4p, length: len, label: PLAY_LABELS['four-two-pairs'] };
      }
      return null;
    },

    canBeat: function (candidate, previous) {
      if (!previous) return true;
      if (candidate.type === 'rocket') return previous.type !== 'rocket';
      if (previous.type === 'rocket') return false;
      if (candidate.type === 'bomb' && previous.type !== 'bomb') return true;
      if (previous.type === 'bomb' && candidate.type !== 'bomb') return false;
      if (candidate.type !== previous.type) return false;
      if (candidate.length !== previous.length) return false;
      if ((candidate.chainLength || 0) !== (previous.chainLength || 0)) return false;
      return candidate.rank > previous.rank;
    },

    isMultiplierPlay: function (play) {
      return play.type === 'bomb' || play.type === 'rocket';
    },

    PLAY_LABELS: PLAY_LABELS,
  };
})();