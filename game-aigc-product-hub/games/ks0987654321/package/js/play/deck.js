(function () {
  var M3 = window.M3;
  function unique(list) { var seen = {}, out = [], i; for (i = 0; i < list.length; i += 1) if (!seen[list[i]]) { seen[list[i]] = true; out.push(list[i]); } return out; }
  function allowedCards(manifest) {
    var banned = {}, out = [], i, c, list = manifest.cards || [], b = (manifest.deckRules && manifest.deckRules.bannedCardIds) || [];
    for (i = 0; i < b.length; i += 1) banned[b[i]] = true;
    for (i = 0; i < list.length; i += 1) { c = list[i]; if (!banned[c.id] && c.unlocked !== false) out.push(c); }
    return out;
  }
  function pageCount(cards, pageSize) { return Math.max(1, Math.ceil((cards || []).length / Math.max(1, pageSize || 1))); }
  function page(cards, pageIndex, pageSize) {
    var size = Math.max(1, pageSize || 1), count = pageCount(cards, size), index = Math.max(0, Math.min(pageIndex || 0, count - 1));
    return (cards || []).slice(index * size, (index + 1) * size);
  }
  function validate(manifest, ids) {
    var rules = manifest.deckRules || {}, size = rules.deckSize || 5, allowed = {}, tags = {}, i, c, cardMap = {}, req = rules.requiredTags || [];
    for (i = 0; i < manifest.cards.length; i += 1) cardMap[manifest.cards[i].id] = manifest.cards[i];
    allowedCards(manifest).forEach(function (x) { allowed[x.id] = true; });
    if (!Array.isArray(ids) || ids.length !== size) return { ok: false, reason: 'size' };
    if (!rules.allowDuplicates && unique(ids).length !== ids.length) return { ok: false, reason: 'duplicate' };
    for (i = 0; i < ids.length; i += 1) { if (!allowed[ids[i]]) return { ok: false, reason: 'unavailable' }; c = cardMap[ids[i]]; (c.tags || []).forEach(function (t) { tags[t] = true; }); }
    for (i = 0; i < req.length; i += 1) if (!tags[req[i]]) return { ok: false, reason: 'required-tag' };
    return { ok: true, reason: '' };
  }
  M3.Deck = { allowedCards: allowedCards, pageCount: pageCount, page: page, validate: validate, defaultDeck: function (m) { return allowedCards(m).slice(0, (m.deckRules && m.deckRules.deckSize) || 5).map(function (c) { return c.id; }); } };
})();
