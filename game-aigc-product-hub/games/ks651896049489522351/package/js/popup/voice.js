/**
 * scene-voice.js — 局内语音/聊天弹窗
 * 渲染层：直接调用 M3.Render WebGL 接口（无 Canvas 2D ctx）
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // ── 状态 ──────────────────────────────────────────────────────────
  var _visible = false;
  var _available = false;
  var _tab = 0;
  var _scroll = [0, 0];
  var _maxScroll = [0, 0];
  var _drag = null;
  var _entitlementAccountId = '';
  var _ownedSkus = {};
  var _lastEntitlementsSeq = -1;
  var _pendingPurchases = {};
  var _entitlementsReady = false;
  var _entitlementsRetryTimer = null;
  var _lastVoiceSentAt = 0;
  var PURCHASE_TIMEOUT_MS = 8000;

  var _content = { x: 0, y: 0, w: 0, h: 0 };

  var _imgCache = {};
  function getNetImg (url) {
    if (!url) return null;
    var img = _imgCache[url];
    if (!img) {
      try {
        // 快手端必须用 ks.createImage（沙盒内无全局 Image）
        if (typeof ks !== 'undefined' && ks.createImage) img = ks.createImage();
        else if (typeof wx !== 'undefined' && wx.createImage) img = wx.createImage();
        else img = new Image();
      } catch (e) {
        try { img = new Image(); } catch (e2) { return null; }
      }
      // 跨域图必须声明 anonymous：否则 drawImage 到 canvas 会污染画布，
      // WebGL texImage2D 直接抛 SecurityError（icon 静默消失）。CDN 已返回
      // access-control-allow-origin: *
      try { img.crossOrigin = 'anonymous'; } catch (e3) {}
      img.src = url; _imgCache[url] = img;
    }
    return img;
  }

  // 网络图加载完成判定（与 scene-profile 的 imgLoaded 一致）
  function imgLoaded (img) {
    if (!img) return false;
    return (img.complete === undefined || img.complete) && (img.naturalWidth || img.width || 0) > 0;
  }

  // 圆形裁剪离屏 canvas（与 scene-profile 的 _clipAvatarCanvas 同款）：
  // cover 适配（短边撑满居中裁剪）+ 按物理像素建画布抗糊，按 url+尺寸缓存
  var _iconClip = {};
  function clipIconCanvas (url, img, D) {
    if (!img || !imgLoaded(img) || D < 4) return null;
    var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 2;
    var srcW = img.naturalWidth || img.width || 0;
    var D2 = Math.round(D * dpr);
    if (srcW > 0 && D2 > srcW) D2 = srcW;
    if (D2 < D) D2 = D;
    var ckey = url + '|' + D2;
    var clip = _iconClip[ckey];
    if (!clip) {
      var cvs;
      if (typeof ks !== 'undefined' && ks.createCanvas) cvs = ks.createCanvas();
      else if (typeof wx !== 'undefined' && wx.createCanvas) cvs = wx.createCanvas();
      else cvs = document.createElement('canvas');
      cvs.width = D2; cvs.height = D2;
      clip = { cvs: cvs, ctx: cvs.getContext('2d'), drawnW: 0 };
      _iconClip[ckey] = clip;
    }
    if (clip.drawnW !== img.width) {
      var c = clip.ctx;
      c.clearRect(0, 0, D2, D2);
      c.save();
      // 圆角 4 方形裁剪（设计稿 Rectangle 12：32×32 radius 4），逻辑半径按倍率换算
      var rr = Math.max(2, Math.round(4 * (D2 / D)));
      c.beginPath();
      c.moveTo(rr, 0);
      c.lineTo(D2 - rr, 0);
      c.arcTo(D2, 0, D2, rr, rr);
      c.lineTo(D2, D2 - rr);
      c.arcTo(D2, D2, D2 - rr, D2, rr);
      c.lineTo(rr, D2);
      c.arcTo(0, D2, 0, D2 - rr, rr);
      c.lineTo(0, rr);
      c.arcTo(0, 0, rr, 0, rr);
      c.closePath();
      c.clip();
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
      var scale = Math.max(D2 / iw, D2 / ih);
      var dw = iw * scale, dh = ih * scale;
      c.drawImage(img, (D2 - dw) / 2, (D2 - dh) / 2, dw, dh);
      c.restore();
      clip.drawnW = img.width;
    }
    return clip.cvs;
  }

  var INTERACTIVE = [];
  var VOICE_PACKS = [];
  // setConfig 幂等签名：同一份配置（bootstrap 回包与 WS voiceConfig 推送各到一次）
  // 不重复应用，否则 VOICE_PACKS 重建 + _tryRestoreSel 重挂一次
  var _lastCfgSig = '';

  function currentAccountId () {
    var identity = M3.Auth && M3.Auth.getIdentity ? M3.Auth.getIdentity() : null;
    return identity ? (identity.accountId || '') : '';
  }

  function clearPendingPurchases () {
    for (var sku in _pendingPurchases) {
      if (_pendingPurchases.hasOwnProperty(sku) && _pendingPurchases[sku].timer)
        clearTimeout(_pendingPurchases[sku].timer);
    }
    _pendingPurchases = {};
  }

  function clearEntitlementsRetry () {
    if (_entitlementsRetryTimer) clearTimeout(_entitlementsRetryTimer);
    _entitlementsRetryTimer = null;
  }

  function resetForAccount (accountId, force) {
    accountId = accountId || '';
    if (!force && _entitlementAccountId === accountId) return;
    _entitlementAccountId = accountId;
    _lastCfgSig = '';   // 账号切换后允许重新应用同内容配置
    // 切换账号：清上一账号的选中音色（新账号由 _tryRestoreSel 恢复自己的记录）
    if (M3.VoicePack && M3.VoicePack.destroyPack) M3.VoicePack.destroyPack();
    _selectedPackId = '';
    _ownedSkus = {};
    clearPendingPurchases(); clearEntitlementsRetry();
    _lastEntitlementsSeq = -1; _entitlementsReady = false;
    if (force) { _available = false; _visible = false; INTERACTIVE = []; VOICE_PACKS = []; }
  }

  function applyEntitlements (payload) {
    resetForAccount(currentAccountId());
    if (!payload || typeof payload.seq !== 'number' || payload.seq <= _lastEntitlementsSeq) return;
    _lastEntitlementsSeq = payload.seq; clearEntitlementsRetry();
    _ownedSkus = {};
    var items = Array.isArray(payload.items) ? payload.items : [];
    var now = Date.now();
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (!it || !it.sku) continue;
      // 双保险：服务端已过滤到期行，客户端再按 expiresAt 校验一次（防时钟偏差/旧快照）
      var exp = Number(it.expiresAt || 0);
      if (exp > 0 && exp <= now) continue;
      _ownedSkus[it.sku] = true;
    }
    _entitlementsReady = true;
    // 当前选中的语音包已到期/被回收 → 自动切回默认语音包
    if (_selectedPackId) {
      var selPack = null;
      for (var pi = 0; pi < VOICE_PACKS.length; pi++) {
        if (VOICE_PACKS[pi].packId === _selectedPackId) { selPack = VOICE_PACKS[pi]; break; }
      }
      if (selPack && !_ownedSkus[selPack.sku]) {
        if (M3.VoicePack && M3.VoicePack.destroyPack) M3.VoicePack.destroyPack();
        _selectedPackId = '';
        _saveSel('');
        M3.Game.flash('语音包已到期，已切换回默认语音');
      }
    }
    // 权益到位后，对当前已激活的语音包做静默版本检查（有更新自动重新下载）
    setTimeout(_silentVersionCheck, 500);
    // 启动恢复：权益+配置就绪后自动恢复上次选中的语音包
    _tryRestoreSel();
  }

  function markEntitlementsUnavailable (payload) {
    resetForAccount(currentAccountId());
    if (payload && typeof payload.seq === 'number') {
      if (payload.seq <= _lastEntitlementsSeq) return;
      _lastEntitlementsSeq = payload.seq;
    }
    _entitlementsReady = false;
    if (_entitlementsRetryTimer) return;
    var accountId = currentAccountId();
    var retryAfterMs = Math.max(1000, Math.min(30000, Number(payload && payload.retryAfterMs) || 3000));
    _entitlementsRetryTimer = setTimeout(function () {
      _entitlementsRetryTimer = null;
      if (accountId !== currentAccountId()) return;
      // 优先走 bootstrap HTTP 刷新权益；WebSocket 降级
      if (M3.GameHttp) {
        M3.GameHttp.bootstrap().then(function (data) {
          if (data && data.entitlements) {
            if (M3.SceneVoice && M3.SceneVoice.applyEntitlements) M3.SceneVoice.applyEntitlements(data.entitlements);
          }
        }).catch(function () {
          if (M3.Network && M3.Network.send) M3.Network.send('getEntitlements', {});
        });
      } else if (M3.Network && M3.Network.send) {
        M3.Network.send('getEntitlements', {});
      }
    }, retryAfterMs);
  }

  function requestId () {
    return 'buy_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function buyPack (pack) {
    if (!pack || !pack.sku || _pendingPurchases[pack.sku]) return;
    if (!pack.saleEnabled) { M3.Game.flash('购买功能暂未开放'); return; }
    if (!_entitlementsReady) {
      // 主动拉取权益，稍后重试（优先 HTTP）
      if (M3.GameHttp) {
        M3.GameHttp.bootstrap().then(function (data) {
          if (data && data.entitlements && M3.SceneVoice && M3.SceneVoice.applyEntitlements) {
            M3.SceneVoice.applyEntitlements(data.entitlements);
          }
        }).catch(function () {
          if (M3.Network && M3.Network.send) M3.Network.send('getEntitlements', {});
        });
      } else if (M3.Network && M3.Network.send) {
        M3.Network.send('getEntitlements', {});
      }
      M3.Game.flash('权益加载中，请稍后再试');
      return;
    }
    // 游客（含 Web 端）也可购买：钱包挂在游客账号下，服务端权威扣豆
    var wallet = M3.Game.getWallet && M3.Game.getWallet();
    var price = Number(pack.priceBeans || 0);
    if (wallet && price > Number(wallet.availableBeans == null ? wallet.beans : wallet.availableBeans)) {
      M3.Game.flash('铁豆不足，可看广告或分享领豆'); return;
    }
    function confirmPurchase () {
      if (M3.GameHttp) {
        var id = requestId();
        _pendingPurchases[pack.sku] = { requestId: id, timer: null };
        M3.GameHttp.buySku(pack.sku, id,
          M3.Game.getScreen() === 'game' ? 'room_chat_panel' : 'home_voice_store'
        ).then(function (result) {
          delete _pendingPurchases[pack.sku];
          if (result && result.ok) {
            _ownedSkus[pack.sku] = true;
            M3.Game.flash(result.charged ? '购买成功' : '已拥有该语音包');
            if (result.wallet && M3.Game.setWallet) {
              M3.Game.setWallet(result.wallet, result.economy, { walletSource: 'server' });
            }
            if (result.entitlements && M3.SceneVoice && M3.SceneVoice.applyEntitlements) {
              M3.SceneVoice.applyEntitlements(result.entitlements);
            }
          } else {
            M3.Game.flash((result && result.message) || '购买失败，请稍后再试');
          }
        }).catch(function (err) {
          delete _pendingPurchases[pack.sku];
          M3.Game.flash((err && err.message) || '购买失败，请稍后再试');
        });
        return;
      }
      // WebSocket 降级
      var id = requestId();
      var timer = setTimeout(function () {
        var pending = _pendingPurchases[pack.sku];
        if (!pending || pending.requestId !== id) return;
        delete _pendingPurchases[pack.sku];
        M3.Game.flash('购买结果同步超时，请重试');
        if (M3.Network && M3.Network.send) M3.Network.send('getEntitlements', {});
      }, PURCHASE_TIMEOUT_MS);
      _pendingPurchases[pack.sku] = { requestId: id, timer: timer };
      M3.Network.send('buySku', { sku: pack.sku,
        source: M3.Game.getScreen() === 'game' ? 'room_chat_panel' : 'home_voice_store',
        requestId: id });
    }
    var label = price > 0 ? ('花费 ' + price + ' 铁豆购买该语音包？') : '免费领取该语音包？';
    if (typeof KwaiUI !== 'undefined' && KwaiUI.showModal && typeof ks !== 'undefined') {
      KwaiUI.showModal({ title: '确认购买', content: label, confirmText: '确定', onConfirm: confirmPurchase });
    } else if (typeof window.confirm !== 'function' || window.confirm(label)) {
      confirmPurchase();
    }
  }

  function applyPurchaseResult (result) {
    if (!result || !result.sku) return;
    var pending = _pendingPurchases[result.sku];
    if (!pending || (result.requestId && result.requestId !== pending.requestId)) return;
    if (pending.timer) clearTimeout(pending.timer);
    delete _pendingPurchases[result.sku];
    if (result.ok) {
      _ownedSkus[result.sku] = true;
      M3.Game.flash(result.charged ? '购买成功' : '已拥有该语音包');
    } else {
      M3.Game.flash(result.message || '购买失败，请稍后再试');
    }
  }

  function setConfig (cfg) {
    if (!cfg) return;
    // 幂等：启动链上同一份 voiceConfig 会到达两次（bootstrap 回包一次、
    // WS authOk 后推送一次），内容相同则跳过重建与启动恢复，避免叠加触发
    // 语音包下载（曾表现为两条「版本变更 0→1 清除旧缓存」）。
    var sig = '';
    try { sig = JSON.stringify(cfg); } catch (e) { sig = ''; }
    if (sig && sig === _lastCfgSig) return;
    _lastCfgSig = sig;
    _available = true;
    INTERACTIVE = Array.isArray(cfg.interactive) ? cfg.interactive.slice() : [];
    var packs = Array.isArray(cfg.packs) ? cfg.packs : [];
    var schemaVer = Number(cfg.schemaVersion || 1);
    if (schemaVer >= 3) {
      // v3: 完整音效映射，audioBaseUrl + voices 包含 audioMap
      VOICE_PACKS = packs.map(function (pack) {
        var voices = Array.isArray(pack.voices) ? pack.voices : [];
        return {
          packId: pack.packId || '', sku: pack.sku || '',
          voiceId: pack.defaultVoiceId || '',
          text: pack.name || '',
          icon: pack.icon || '',
          priceBeans: Number(pack.priceBeans || 0),
          // 卡片价格行按设计稿显示豆图标+数字（免费包显示 0，不用「免费」文案）
          priceLabel: String(Number(pack.priceBeans || 0)),
          voiceUrl: voices.length > 0 ? voices[0].voiceUrl : '',
          saleEnabled: pack.saleEnabled !== false,
          audioBaseUrl: pack.audioBaseUrl || '',
          voices: voices,
        };
      });
    } else if (schemaVer >= 2) {
      VOICE_PACKS = packs.map(function (pack) {
        var voices = Array.isArray(pack.voices) ? pack.voices : [];
        var defaultVoice = null;
        for (var i = 0; i < voices.length; i++) {
          if (voices[i].voiceId === pack.defaultVoiceId) { defaultVoice = voices[i]; break; }
        }
        defaultVoice = defaultVoice || voices[0] || {};
        return {
          packId: pack.packId || '', sku: pack.sku || '',
          voiceId: defaultVoice.voiceId || '',
          text: pack.name || defaultVoice.text || '',
          icon: pack.icon || '',
          priceBeans: Number(pack.priceBeans || 0),
          priceLabel: pack.promoLabel || String(Number(pack.priceBeans || 0)),
          voiceUrl: defaultVoice.voiceUrl || '',
          saleEnabled: pack.saleEnabled !== false,
          audioBaseUrl: pack.audioBaseUrl || '',
          voices: voices,
        };
      });
    } else {
      VOICE_PACKS = packs.slice();
    }
    // 启动恢复：配置就绪（权益可能已先到）后自动恢复上次选中的语音包
    _tryRestoreSel();
  }

  var IT_ROW_H = 40;
  var VP_ROW_H = 48;

  function sendVoice (item) {
    if (!item || !item.voiceId) return;
    var now = Date.now();
    if (now - _lastVoiceSentAt < 3000) { M3.Game.flash('发送太快了，请稍后再试'); return; }
    if (M3.Network && M3.Network.send) {
      try { M3.Network.send('voiceMsg', { voiceId: item.voiceId }); _lastVoiceSentAt = now; } catch (e) {}
    }
    hide();
  }

  // 按 sku 查包价格（查不到返回 -1）
  function _packPrice (sku) {
    for (var i = 0; i < VOICE_PACKS.length; i++) {
      if (VOICE_PACKS[i].sku === sku) return Number(VOICE_PACKS[i].priceBeans || 0);
    }
    return -1;
  }

  // 选中语音包：CDN 下载到用户目录（快手端缓存）→ 替换 SFX 池
  // 切换/恢复默认时 loadPack/destroyPack 内部会先销毁旧包的全部内存音频（释放），
  // 磁盘缓存保留，下次切回免重复下载。
  var _selectedPackId = '';

  // ── 选中状态本地持久化（按账号隔离）：重进游戏自动恢复上次选中的音色 ──
  // 仅记录付费包；恢复默认（''）时同步清记录。
  function _selKey () { return 'ddz_voice_sel_' + currentAccountId(); }
  function _saveSel (packId) {
    try { KwaiStorage.setSync(_selKey(), packId || ''); } catch (e) {}
  }

  // 启动恢复：配置(VOICE_PACKS)与权益(_ownedSkus)都就绪后触发（setConfig /
  // applyEntitlements 末尾各挂一次，谁后到谁生效）；本会话已手动选择的不覆盖。
  // 包已下架 / 未解锁 / 已到期 → 清记录回默认（与权益到期切换逻辑一致）。
  function _tryRestoreSel () {
    if (_selectedPackId) return;
    if (!VOICE_PACKS.length || !_entitlementsReady) return;
    var saved = '';
    try { saved = String(KwaiStorage.getSync(_selKey()) || ''); } catch (e) { return; }
    if (!saved) return;
    var pack = null;
    for (var i = 0; i < VOICE_PACKS.length; i++) {
      if (VOICE_PACKS[i].packId === saved) { pack = VOICE_PACKS[i]; break; }
    }
    var owned = pack && (Number(pack.priceBeans || 0) === 0 || !!_ownedSkus[pack.sku]);
    if (!pack || !owned) { _saveSel(''); return; }
    // 与 selectPack 一致：构建映射 → 优先磁盘缓存（downloadPack 命中缓存免下载）
    _selectedPackId = pack.packId;
    var voices = Array.isArray(pack.voices) ? pack.voices : [];
    var audioMap = {};
    for (var j = 0; j < voices.length; j++) {
      if (voices[j].key && voices[j].voiceUrl) audioMap[voices[j].key] = voices[j].voiceUrl;
    }
    if (!M3.VoicePack || !M3.VoicePack.downloadPack || typeof Promise === 'undefined') {
      if (M3.VoicePack && M3.VoicePack.loadPack) M3.VoicePack.loadPack(pack.packId, audioMap);
      return;
    }
    var packVersion = Number(pack.version) || 1;
    M3.VoicePack.downloadPack(pack.packId, audioMap, packVersion).then(function (res) {
      if (_selectedPackId !== pack.packId) return;
      if (M3.VoicePack && M3.VoicePack.loadPack) M3.VoicePack.loadPack(pack.packId, res.localMap);
    }).catch(function () {
      if (_selectedPackId !== pack.packId) return;
      // 下载失败回退在线模式（远程 URL）
      if (M3.VoicePack && M3.VoicePack.loadPack) M3.VoicePack.loadPack(pack.packId, audioMap);
    });
  }

  function selectPack (pack) {
    if (!pack || !pack.sku) return;
    // 免费默认包：内容与内置本地音色完全一致，直接使用本地音频，
    // 无需购买、无需下载 CDN（卡片默认即选中态，selectedPackId='' 时高亮）
    if (Number(pack.priceBeans || 0) === 0) {
      if (M3.VoicePack && M3.VoicePack.destroyPack) M3.VoicePack.destroyPack();
      _selectedPackId = '';
      _saveSel('');
      M3.Game.flash('已切换为默认语音');
      return;
    }
    if (!_ownedSkus[pack.sku]) { M3.Game.flash('请先解锁该语音包'); return; }
    if (pack.packId === _selectedPackId) {
      if (M3.VoicePack && M3.VoicePack.destroyPack) M3.VoicePack.destroyPack();
      _selectedPackId = '';
      _saveSel('');
      M3.Game.flash('已恢复默认语音');
      return;
    }

    var voices = Array.isArray(pack.voices) ? pack.voices : [];
    if (!voices.length) { M3.Game.flash('语音包配置异常'); return; }

    _selectedPackId = pack.packId;
    _saveSel(pack.packId);
    M3.Game.flash('正在切换语音包...');

    // 构建 { key → 远程 CDN URL } 映射
    var audioMap = {};
    for (var i = 0; i < voices.length; i++) {
      var v = voices[i];
      if (v.key && v.voiceUrl) audioMap[v.key] = v.voiceUrl;
    }

    // 无下载能力（或测试环境无 Promise）→ 直接远程 URL 加载
    if (!M3.VoicePack || !M3.VoicePack.downloadPack || typeof Promise === 'undefined') {
      if (M3.VoicePack && M3.VoicePack.loadPack) M3.VoicePack.loadPack(pack.packId, audioMap);
      M3.Game.flash('语音包已切换');
      return;
    }

    var packVersion = Number(pack.version) || 1;
    M3.VoicePack.downloadPack(pack.packId, audioMap, packVersion).then(function (res) {
      // 下载期间用户可能已切走（切默认或切别的包），过期结果直接丢弃
      if (_selectedPackId !== pack.packId) return;
      if (M3.VoicePack && M3.VoicePack.loadPack) M3.VoicePack.loadPack(pack.packId, res.localMap);
      M3.Game.flash('语音包已切换');
    }).catch(function (err) {
      if (_selectedPackId !== pack.packId) return;
      // 全量下载失败 → 回退在线播放（远程 URL）
      console.warn('[SceneVoice] 语音包下载失败，回退在线模式', err && err.message);
      if (M3.VoicePack && M3.VoicePack.loadPack) M3.VoicePack.loadPack(pack.packId, audioMap);
      M3.Game.flash('语音包已切换（在线模式）');
    });
  }

  // 静默版本检查：启动时对已解锁且已激活的包做后台更新
  // 若本地缓存版本落后，downloadPack 会自动清旧缓存重新下载
  function _silentVersionCheck () {
    if (!_selectedPackId || !M3.VoicePack || !M3.VoicePack.downloadPack) return;
    var pack = null;
    for (var i = 0; i < VOICE_PACKS.length; i++) {
      if (VOICE_PACKS[i].packId === _selectedPackId) { pack = VOICE_PACKS[i]; break; }
    }
    if (!pack || !_ownedSkus[pack.sku]) return;
    var voices = Array.isArray(pack.voices) ? pack.voices : [];
    if (!voices.length) return;
    var audioMap = {};
    for (var vi = 0; vi < voices.length; vi++) {
      if (voices[vi].key && voices[vi].voiceUrl) audioMap[voices[vi].key] = voices[vi].voiceUrl;
    }
    var packVersion = Number(pack.version) || 1;
    M3.VoicePack.downloadPack(pack.packId, audioMap, packVersion).then(function (res) {
      // 有新文件下载（版本更新触发）时，静默替换当前播放映射
      if (_selectedPackId !== pack.packId || !res.downloaded) return;
      if (M3.VoicePack && M3.VoicePack.loadPack) M3.VoicePack.loadPack(pack.packId, res.localMap);
      console.log('[SceneVoice] 语音包已静默更新 packId=' + pack.packId + ' v' + packVersion);
    }).catch(function () {});
  }

  function show (tab) {
    // bootstrap 已下发语音配置时直接开；否则走 HTTP/WebSocket 兜底
    if (!_available) {
      if (M3.GameHttp) {
        M3.GameHttp.bootstrap().then(function (data) {
          if (data && data.voiceConfig && M3.SceneVoice && M3.SceneVoice.setConfig) {
            M3.SceneVoice.setConfig(data.voiceConfig);
          }
          if (data && data.entitlements && M3.SceneVoice && M3.SceneVoice.applyEntitlements) {
            M3.SceneVoice.applyEntitlements(data.entitlements);
          }
        }).catch(function () {
          if (M3.Network && M3.Network.send) M3.Network.send('getVoiceConfig', {});
        });
      } else if (M3.Network && M3.Network.send) {
        M3.Network.send('getVoiceConfig', {});
      }
      M3.Game.flash('语音加载中，请稍后');
      return;
    }
    _visible = true;
    if (tab === 0 || tab === 1) _tab = tab;
  }
  function hide ()    { _visible = false; _drag = null; }

  M3.SceneVoice = {
    show: show, hide: hide,
    setConfig: setConfig,
    applyEntitlements: applyEntitlements,
    markEntitlementsUnavailable: markEntitlementsUnavailable,
    applyPurchaseResult: applyPurchaseResult,
    resetForAccount: resetForAccount,
    isAvailable: function () { return _available; },
    toggle: function ()     { if (_available) _visible = !_visible; },
    isVisible: function ()  { return _visible; },
    draw: function () {
      if (!_visible) return;
      var rd = M3.Render;
      if (!rd) return;
      _drawPanel(rd, M3.Layout.w, M3.Layout.h, rd.getHitBtns());
    },
    onTouchStart: function (x, y) {
      if (_inContent(x, y)) _drag = { y: y, scroll: _scroll[_tab], moved: 0 };
      else _drag = null;
    },
    onTouchMove: function (x, y) {
      if (!_drag) return 0;
      var dy = _drag.y - y;
      _drag.moved = Math.max(_drag.moved, Math.abs(dy));
      _scroll[_tab] = clamp(_drag.scroll + dy, 0, _maxScroll[_tab]);
      return Math.abs(dy) > 4 ? 1 : 0;
    },
    onTouchEnd: function () { _drag = null; },
    // 供 scene-profile 访问内部数据（下划线前缀表示半公开）
    _getPacks: function () { return VOICE_PACKS; },
    // 免费包（priceBeans=0，即默认语音包）永久拥有，不走购买流程
    _isOwned: function (sku) {
      if (Number(_packPrice(sku)) === 0) return true;
      return !!_ownedSkus[sku];
    },
    _getSelectedPackId: function () { return _selectedPackId; },
    _buyPack: buyPack,
    selectPack: selectPack,   // 供 scene-profile 卡片点击/「使用默认」按钮调用
  };

  function _inContent (x, y) {
    return x >= _content.x && x <= _content.x + _content.w &&
           y >= _content.y && y <= _content.y + _content.h;
  }
  function clamp (v, a, b) { return v < a ? a : (v > b ? b : v); }
  function _ellipsis (rd, text, maxW, font) {
    if (rd.glMeasureText(text, font) <= maxW) return text;
    var s = text;
    while (s.length > 1 && rd.glMeasureText(s + '…', font) > maxW) s = s.slice(0, -1);
    return s + '…';
  }

  // ── 面板绘制 ──────────────────────────────────────────────────────
  function _drawPanel (rd, W, H, hitBtns) {
    var pw = 238, ph = 236, tabW = 25, contentW = pw - tabW;

    var px, py;
    var chat = M3.SceneGame && M3.SceneGame.getChatBtnRect && M3.SceneGame.getChatBtnRect();
    if (chat) {
      px = chat.x + chat.w - pw;
      py = chat.y - 8 - ph;
    } else {
      px = (W - pw) / 2;
      py = (H - ph) / 2;
    }
    px = clamp(px, 6, W - pw - 6);
    py = clamp(py, 6, H - ph - 6);

    // 遮罩（点击关闭）
    rd.fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');

    // 面板底
    rd.fillRounded(px, py, pw, ph, 8, 'rgba(46,54,98,0.90)');
    rd.strokeRounded(px, py, pw, ph, 8, 'rgba(255,255,255,0.30)', 1);

    _content = { x: px, y: py, w: contentW, h: ph };

    if (_tab === 0) _drawInteractive(rd, px, py, contentW, ph, hitBtns);
    else            _drawVoicePacks(rd, px, py, contentW, ph, hitBtns);

    _drawTabs(rd, px + contentW, py, tabW, ph, hitBtns);

    // 遮罩命中（最低优先级）
    hitBtns.unshift({ x: 0, y: 0, w: W, h: H, label: 'voice_mask', onClick: function () { hide(); } });
  }

  // 互动语音列表
  function _drawInteractive (rd, px, py, cw, ph, hitBtns) {
    var rowH = IT_ROW_H;
    var total = rowH * INTERACTIVE.length;
    _maxScroll[0] = Math.max(0, total - ph);
    _scroll[0] = clamp(_scroll[0], 0, _maxScroll[0]);
    var sc = _scroll[0];
    var baseTop = 4;   // 设计稿 Frame 60 top:4 —— 列表从面板顶部 4px 开始从上到下排，不居中
    var font = '500 11px sans-serif';

    // 启用 scissor 裁剪，防止内容溢出面板边界
    if (rd.setScissor) rd.setScissor(px, py, cw, ph);

    for (var i = 0; i < INTERACTIVE.length; i++) {
      var text = INTERACTIVE[i].text || '';
      var ry = py + baseTop + i * rowH - sc;
      if (ry + rowH < py || ry > py + ph) continue;
      // 条目底部渐变分隔线（设计稿 973-3751 Line 3：#CCEEFF 20%，中间实两端透明，左右各留 8）
      rd.fillRectGradH(px + 8, ry + rowH - 1, cw - 16, 1, [
        { t: 0, css: 'rgba(204,238,255,0)' },
        { t: 0.514, css: 'rgba(204,238,255,0.20)' },
        { t: 1, css: 'rgba(204,238,255,0)' },
      ]);
      var shown = _ellipsis(rd, text, cw-24, font);
      rd.glFillText(shown, px+12, ry+rowH/2, font, '#CCEEFF', 'left', 'middle');
    }

    if (rd.clearScissor) rd.clearScissor();

    for (var k = 0; k < INTERACTIVE.length; k++) {
      var ky = py + baseTop + k * rowH - sc;
      var top = Math.max(ky, py);
      var bottom = Math.min(ky + rowH, py + ph);
      if (bottom - top <= 2) continue;
      ;(function (item) {
        hitBtns.push({ x:px, y:top, w:cw, h:bottom-top, label:'voice_it_'+k,
          onClick: function () { if (!_drag || !_drag.moved) sendVoice(item); } });
      })(INTERACTIVE[k]);
    }
  }

  // 专属语音包列表
  function _drawVoicePacks (rd, px, py, cw, ph, hitBtns) {
    var rowH = VP_ROW_H;
    var total = rowH * VOICE_PACKS.length;
    _maxScroll[1] = Math.max(0, total - ph);
    _scroll[1] = clamp(_scroll[1], 0, _maxScroll[1]);
    var sc = _scroll[1];
    var baseTop = 4;   // 设计稿 Frame 60 top:4 —— 列表从面板顶部 4px 开始从上到下排，不居中
    var beanImg = M3.SceneGame && M3.SceneGame.getGameImg && M3.SceneGame.getGameImg('beanIcon');
    var fontName = '500 12px sans-serif';
    var fontPrice = '400 11px sans-serif';

    // 启用 scissor 裁剪，防止内容溢出面板边界
    if (rd.setScissor) rd.setScissor(px, py, cw, ph);

    for (var i = 0; i < VOICE_PACKS.length; i++) {
      var vp = VOICE_PACKS[i];
      var owned = !!_ownedSkus[vp.sku];
      var pending = !!_pendingPurchases[vp.sku];
      var ry = py + baseTop + i * rowH - sc;
      if (ry + rowH < py || ry > py + ph) continue;

      // 条目底部渐变分隔线（设计稿 973-3751 Line 3：#CCEEFF 20%，中间实两端透明）
      rd.fillRectGradH(px + 8, ry + rowH - 1, cw - 16, 1, [
        { t: 0, css: 'rgba(204,238,255,0)' },
        { t: 0.514, css: 'rgba(204,238,255,0.20)' },
        { t: 1, css: 'rgba(204,238,255,0)' },
      ]);

      // 图标（32×32，圆角 4 —— 设计稿 Rectangle 12）：本地包 icon 资源优先（CDN 图在快小
      // 图片域名白名单外加载不了，主页"正常"其实是 voice-deco 本地装饰图回退）；
      // 本地资源缺图时依次回退 CDN 图 → 包名首字符占位
      var iconX = px + 12, iconY = ry + (rowH - 32) / 2;
      var localKey = { default: 'packIconDefault', tiezi: 'packIconTiezi', tianmei: 'packIconTianmei' }[vp.packId];
      var localImg = localKey && M3.SceneGame && M3.SceneGame.getGameImg && M3.SceneGame.getGameImg(localKey);
      var packImg = vp.icon ? getNetImg(vp.icon) : null;
      var iconClip = packImg ? clipIconCanvas(vp.icon, packImg, 32) : null;
      if (localImg) {
        rd.glDrawImage(localImg, iconX, iconY, 32, 32);
      } else if (iconClip) {
        rd.glDrawImage(iconClip, iconX, iconY, 32, 32);
      } else {
        rd.fillRounded(iconX, iconY, 32, 32, 4, 'rgba(30,80,140,0.55)');
        rd.glFillText((vp.text || '包').charAt(0), iconX + 16, iconY + 16,
          '800 16px sans-serif', '#CCEEFF', 'center', 'middle');
      }

      // 名称
      var nameX = iconX + 32 + 4;
      var nameMaxW = px + cw - 12 - nameX;
      rd.glFillText(_ellipsis(rd, vp.text || '', nameMaxW, fontName),
        nameX, ry+rowH*0.36, fontName, '#CCEEFF', 'left', 'middle');

      // 价格（设计稿 Frame 67：豆 icon 9×9 + gap 2 + 11px #FAE9AF）
      var priceCY = ry + rowH * 0.70;
      var beanSz = 9;
      if (beanImg) {
        rd.glDrawImage(beanImg, nameX, priceCY-beanSz/2, beanSz, beanSz);
      } else {
        rd.beginPath(); rd.arc(nameX+beanSz/2, priceCY, beanSz/2, 0, Math.PI*2);
        rd.fill('#FAE9AF');
      }
      var priceText = owned ? '已拥有' : (pending ? '处理中…' : (vp.priceLabel || String(vp.priceBeans || 0)));
      rd.glFillText(priceText, nameX+beanSz+2, priceCY, fontPrice, '#FAE9AF', 'left', 'middle');
    }

    if (rd.clearScissor) rd.clearScissor();

    for (var k = 0; k < VOICE_PACKS.length; k++) {
      var ky = py + baseTop + k * rowH - sc;
      var top = Math.max(ky, py);
      var bottom = Math.min(ky + rowH, py + ph);
      if (bottom - top <= 2) continue;
      ;(function (pack) {
        hitBtns.push({ x:px, y:top, w:cw, h:bottom-top, label:'voice_pack_'+k,
          onClick: function () {
            if (_drag && _drag.moved) return;
            if (_ownedSkus[pack.sku]) selectPack(pack);
            else buyPack(pack);
          }});
      })(VOICE_PACKS[k]);
    }
  }

  // 右侧竖排 tab
  function _drawTabs (rd, tx, ty, tw, ph, hitBtns) {
    var half = ph / 2;
    var tabs = [
      { chars: '互\n动\n语\n音' },
      { chars: '专\n属\n语\n音\n包' },
    ];
    for (var i = 0; i < tabs.length; i++) {
      var active = _tab === i;
      var byY = ty + i * half;
      var _vp = M3.Render.beginPressScale('voice_tab_' + i, tx + tw / 2, byY + half / 2, 0.94);
      if (active) {
        // 选中 Tab：蓝色垂直渐变（设计稿 Rectangle 50：#5BB3F0 → #2667BE）
        if (rd.fillRoundedGrad) {
          rd.fillRoundedGrad(tx, byY, tw, half, 4, '#5BB3F0', '#2667BE');
        } else {
          rd.fillRounded(tx, byY, tw, half, 4, '#3d7ec8');
        }
        rd.strokeRounded(tx+0.5, byY+0.5, tw-1, half-1, 4, 'rgba(255,255,255,0.30)', 0.5);
      } else {
        rd.fillRounded(tx, byY, tw, half, 0, '#1B2137');
      }

      var font = '600 13px sans-serif';
      var lines = tabs[i].chars.split('\n');
      var lineH = 18;
      var startY = byY + half/2 - (lines.length-1)*lineH/2;
      for (var j = 0; j < lines.length; j++) {
        rd.glFillText(lines[j], tx+tw/2, startY+j*lineH, font, '#FFFFFF', 'center', 'middle');
      }
      M3.Render.endPressScale(_vp);
      ;(function (idx) {
        hitBtns.push({ x:tx, y:byY, w:tw, h:half, label:'voice_tab_'+idx, onClick:function(){ _tab=idx; } });
      })(i);
    }
  }

  // 启动后 bootstrap 已拉取语音配置，此处延迟 3s 兜底（WebSocket 降级路径）
  setTimeout(function () {
    if (!_available) {
      if (M3.GameHttp) {
        M3.GameHttp.bootstrap().then(function (data) {
          if (data && data.voiceConfig && M3.SceneVoice && M3.SceneVoice.setConfig) {
            M3.SceneVoice.setConfig(data.voiceConfig);
          }
          if (data && data.entitlements && M3.SceneVoice && M3.SceneVoice.applyEntitlements) {
            M3.SceneVoice.applyEntitlements(data.entitlements);
          }
        }).catch(function () {
          if (M3.Network && M3.Network.send) M3.Network.send('getVoiceConfig', {});
        });
      } else if (M3.Network && M3.Network.send) {
        M3.Network.send('getVoiceConfig', {});
      }
    }
  }, 3000);

})();
