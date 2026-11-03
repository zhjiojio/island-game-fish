(function () {
  'use strict';
  var M3 = window.M3 = window.M3 || {};

  var state = fresh('', 0);

  function parseDecimal (value) {
    var s = String(value === null || value === undefined ? '' : value).trim();
    if (!/^\+?\d+$/.test(s)) return null;
    s = s.replace(/^\+/, '').replace(/^0+(?=\d)/, '');
    return s || '0';
  }

  function decimal (value) {
    return parseDecimal(value) || '0';
  }

  function addDecimal (a, b) {
    a = parseDecimal(a); b = parseDecimal(b);
    if (a === null || b === null) return null;
    var carry = 0, out = '', i = a.length - 1, j = b.length - 1;
    while (i >= 0 || j >= 0 || carry) {
      var sum = carry + (i >= 0 ? a.charCodeAt(i--) - 48 : 0) + (j >= 0 ? b.charCodeAt(j--) - 48 : 0);
      out = String(sum % 10) + out; carry = Math.floor(sum / 10);
    }
    return out;
  }

  function compare (a, b) {
    a = decimal(a); b = decimal(b);
    if (a.length !== b.length) return a.length > b.length ? 1 : -1;
    return a === b ? 0 : (a > b ? 1 : -1);
  }

  function format (value) {
    var s = decimal(value);
    if (s.length <= 4) return s;
    // >=1亿（9 位以上）→ xx.x亿；>=1万 → xx.x万（字符串运算，余额可能超出 Number 精度）
    if (s.length >= 9) {
      var wholeY = s.slice(0, -8);
      var digitY = s.charAt(s.length - 8);
      return wholeY + (digitY === '0' ? '' : '.' + digitY) + '亿';
    }
    var whole = s.slice(0, -4);
    var digit = s.charAt(s.length - 4);
    return whole + (digit === '0' ? '' : '.' + digit) + '万';
  }

  function fresh (accountId, epoch) {
    return { accountId: accountId || '', chargeBalance: '0', freeBalance: '0', balance: '0',
      observedAt: 0, stale: true, ready: false, syncing: false, error: '', accountEpoch: epoch || 0 };
  }

  function snapshot () {
    var out = {}, key;
    for (key in state) if (Object.prototype.hasOwnProperty.call(state, key)) out[key] = state[key];
    return out;
  }

  M3.DiamondWallet = {
    normalize: decimal,
    compare: compare,
    format: format,
    getState: snapshot,
    getAccountEpoch: function () { return state.accountEpoch; },
    resetForAccount: function (accountId, epoch) {
      var nextEpoch = typeof epoch === 'number' ? epoch : state.accountEpoch + 1;
      state = fresh(accountId || '', nextEpoch);
      return snapshot();
    },
    setSyncing: function (value, accountId, epoch) {
      if (accountId !== state.accountId || epoch !== state.accountEpoch) return false;
      state.syncing = !!value;
      if (value) { state.error = ''; state.stale = true; }
      return true;
    },
    setError: function (message, accountId, epoch) {
      if (accountId !== state.accountId || epoch !== state.accountEpoch) return false;
      state.syncing = false;
      state.error = String(message || '').slice(0, 255);
      return true;
    },
    apply: function (wallet, accountId, epoch) {
      if (!wallet || accountId !== state.accountId || epoch !== state.accountEpoch) return false;
      if (wallet.accountId && wallet.accountId !== state.accountId) return false;
      var observedAt = Number(wallet.observedAt);
      var chargeBalance = parseDecimal(wallet.chargeBalance);
      var freeBalance = parseDecimal(wallet.freeBalance);
      var balance = parseDecimal(wallet.balance);
      if (!isFinite(observedAt) || observedAt < 0 || Math.floor(observedAt) !== observedAt || observedAt <= state.observedAt ||
          chargeBalance === null || freeBalance === null || balance === null || addDecimal(chargeBalance, freeBalance) !== balance) {
        return false;
      }
      state.chargeBalance = chargeBalance;
      state.freeBalance = freeBalance;
      state.balance = balance;
      state.observedAt = observedAt;
      state.stale = wallet.stale === true;
      state.ready = true;
      state.syncing = false;
      state.error = '';
      return true;
    },
  };
})();
