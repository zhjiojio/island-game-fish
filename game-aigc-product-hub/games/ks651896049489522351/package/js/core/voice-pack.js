/**
 * voice-pack.js — 东北御姐斗地主语音包 (female-yujie)
 *
 * 使用方式：
 *   M3.VoicePack.play('jiaodizhu');           // 播放"叫地主！"
 *   M3.VoicePack.play('zhadan');              // 播放"炸弹！"
 *   M3.VoicePack.playForHandType('single', 14); // 播放"A" (单牌)
 *   M3.VoicePack.playForHandType('pair', 15);   // 播放"对二！" (对子)
 *   M3.VoicePack.playRandom('emoji');         // 随机播放一条互动语音
 */
(function () {
  var M3 = window.M3 = window.M3 || {};

  // 默认音效基址 = CDN「默认语音包」目录（本地 asset/audio/effect/room/yujie/ 已下线，
  // 内容已上传 CDN，文件命名完全一致）。与 server/game-ai/voice-config.js 的
  // CDN_ROOT + '/default' 保持同步。
  var BASE = 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks651896049489522351/voice-packs/default/';

  // rank → yujie 文件后缀映射（来自 manifest.json 的 03_single/04_pair/05_triple）
  var _RANK_SUFFIX = { 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A', 15: '2', 16: 'xiaowang', 17: 'dawang' };

  // 来自 manifest.json — key → file 映射
  var _map = {
    // ── 叫牌阶段 (01_call_landlord) ──
    bujiao:      '01_call_landlord/bu_jiao.mp3',
    jiaodizhu:   '01_call_landlord/jiao_dizhu.mp3',
    buqiang:     '01_call_landlord/bu_qiang.mp3',
    qiangdizhu:  '01_call_landlord/qiang_dizhu.mp3',
    woqiang:     '01_call_landlord/wo_qiang.mp3',
    fen1:        '01_call_landlord/fen_1.mp3',
    fen2:        '01_call_landlord/fen_2.mp3',
    fen3:        '01_call_landlord/fen_3.mp3',
    // ── 加倍阶段 (02_double) ──
    jiabei:      '02_double/jiabei.mp3',
    bujiabei:    '02_double/bu_jiabei.mp3',
    bujia:       '02_double/bu_jia.mp3',
    superjiabei: '02_double/super_jiabei.mp3',
    // ── 单牌 (03_single) ──
    single_3:        '03_single/single_3.mp3',
    single_4:        '03_single/single_4.mp3',
    single_5:        '03_single/single_5.mp3',
    single_6:        '03_single/single_6.mp3',
    single_7:        '03_single/single_7.mp3',
    single_8:        '03_single/single_8.mp3',
    single_9:        '03_single/single_9.mp3',
    single_10:       '03_single/single_10.mp3',
    single_J:        '03_single/single_J.mp3',
    single_Q:        '03_single/single_Q.mp3',
    single_K:        '03_single/single_K.mp3',
    single_A:        '03_single/single_A.mp3',
    single_2:        '03_single/single_2.mp3',
    single_xiaowang: '03_single/single_xiaowang.mp3',
    single_dawang:   '03_single/single_dawang.mp3',
    // ── 对子 (04_pair) ──
    pair_3:  '04_pair/pair_3.mp3',
    pair_4:  '04_pair/pair_4.mp3',
    pair_5:  '04_pair/pair_5.mp3',
    pair_6:  '04_pair/pair_6.mp3',
    pair_7:  '04_pair/pair_7.mp3',
    pair_8:  '04_pair/pair_8.mp3',
    pair_9:  '04_pair/pair_9.mp3',
    pair_10: '04_pair/pair_10.mp3',
    pair_J:  '04_pair/pair_J.mp3',
    pair_Q:  '04_pair/pair_Q.mp3',
    pair_K:  '04_pair/pair_K.mp3',
    pair_A:  '04_pair/pair_A.mp3',
    pair_2:  '04_pair/pair_2.mp3',
    // ── 三张 (05_triple) ──
    triple_3:  '05_triple/triple_3.mp3',
    triple_4:  '05_triple/triple_4.mp3',
    triple_5:  '05_triple/triple_5.mp3',
    triple_6:  '05_triple/triple_6.mp3',
    triple_7:  '05_triple/triple_7.mp3',
    triple_8:  '05_triple/triple_8.mp3',
    triple_9:  '05_triple/triple_9.mp3',
    triple_10: '05_triple/triple_10.mp3',
    triple_J:  '05_triple/triple_J.mp3',
    triple_Q:  '05_triple/triple_Q.mp3',
    triple_K:  '05_triple/triple_K.mp3',
    triple_A:  '05_triple/triple_A.mp3',
    triple_2:  '05_triple/triple_2.mp3',
    // ── 叫牌（要不起/过）(09_pass) ──
    yaobuqi:     '09_pass/yaobuqi.mp3',
    buyao:       '09_pass/buyao.mp3',
    guo:         '09_pass/guo.mp3',
    // ── 特殊牌型 (08_special) ──
    shunzi:      '08_special/shunzi.mp3',
    liandui:     '08_special/liandui.mp3',
    feiji:       '08_special/feiji.mp3',
    zhadan:      '08_special/zhadan.mp3',
    wangzha:     '08_special/wangzha.mp3',
    // ── 复合牌型 ──
    sandaiyi:    '06_triple_with/triple_with_single.mp3',
    sandaier:    '06_triple_with/triple_with_pair.mp3',
    sidaier:     '07_four_with_two/four_with_two.mp3',
    // ── 互动表情 (10_chat) ──
    gaokuaidian:     '10_chat/chat_gaokuaidian.mp3',
    kuaidianchupai:  '10_chat/chat_kuaidian.mp3',
    shiqizhang:      '10_chat/chat_17zhang.mp3',
    jiuzhe:          '10_chat/chat_jiuzhe.mp3',
    xintaibengle:    '10_chat/chat_xintaibeng.mp3',
    dingbuzhu:       '10_chat/chat_dingbuzhu.mp3',
    dingbuzhuyeyao:  '10_chat/chat_dingbuzhu_yeyao.mp3',
    paihaogao:       '10_chat/chat_paihaogao.mp3',
    juewang:         '10_chat/chat_juewang.mp3',
    yanpai:          '10_chat/chat_yanpai.mp3',
    mmgg:            '10_chat/chat_mm_gg.mp3',
    dedede:          '10_chat/chat_dedede.mp3',
  };

  // 按分类分组的 key 列表
  var _byCat = {};
  var _catFileMap = {
    bid:   '01_call_landlord',
    play:  '08_special',
    emoji: '10_chat',
  };
  for (var k in _map) {
    var cat = _map[k].split('/')[0];
    if (!_byCat[cat]) _byCat[cat] = [];
    _byCat[cat].push(k);
  }

  // ── rank → yujie 单牌/对子/三张文件路径 ──
  function _rankToSuffix (rank) {
    return _RANK_SUFFIX[rank] || '';
  }

  function _playSfxRaw (file) {
    if (!file) return;
    if (typeof KwaiMedia !== 'undefined') KwaiMedia.Audio.playSfx(file);
  }

  // downloadPack 单飞去重表：packId@version → 在途 Promise（见 downloadPack 注释）
  var _downloadInflight = {};

  M3.VoicePack = {
    /** 当前加载的语音包 packId（'' = 默认） */
    _packId: '',

    /**
     * 取指定音效的完整播放地址（https:// CDN / ksfile:// 本地缓存）
     * @param {string} key 如 'gaokuaidian'
     * @returns {string} 无此 key 时返回 ''
     */
    getUrl: function (key) {
      var file = _map[key];
      if (!file) return '';
      // 完整地址直接返回（https:// 在线 CDN / ksfile:// 本地缓存），
      // 仅默认包的相对路径（如 09_pass/guo.mp3）才拼 BASE 前缀
      return /^(https?:|ksfile:|wxfile:|file:)/i.test(file) ? file : BASE + file;
    },

    /**
     * 播放指定音效
     * @param {string} key 如 'jiaodizhu', 'zhadan', 'buyao'
     */
    play: function (key) {
      var url = this.getUrl(key);
      if (url) _playSfxRaw(url);
    },

    /**
     * 加载语音包：替换全部音效映射为 CDN URL
     * @param {string} packId 语音包 ID
     * @param {object} audioMap  { key → fullUrl } 映射表
     */
    loadPack: function (packId, audioMap) {
      if (!audioMap) return;
      this.destroyPack();
      _map = {};
      for (var k in audioMap) {
        if (audioMap.hasOwnProperty(k)) _map[k] = audioMap[k];
      }
      this._packId = packId;
      // 重建分类索引
      _byCat = {};
      for (var mk in _map) {
        var parts = String(_map[mk]).split('/');
        var cat = parts.length >= 2 ? parts[parts.length - 2] : 'misc';
        if (!_byCat[cat]) _byCat[cat] = [];
        _byCat[cat].push(mk);
      }
    },

    /**
     * 下载语音包音频到用户目录（快手端持久缓存，避免每次播放重复走网络）。
     * 若本地已有缓存且 version 匹配，直接复用；version 不匹配则清旧缓存重新下载。
     * H5 端无沙盒文件系统，直接返回远程 URL（浏览器 HTTP 缓存去重）。
     * @param {string} packId   语音包 ID（用作缓存目录名）
     * @param {object} audioMap { key → 远程 URL }
     * @param {number} [version=1] 语音包版本号（服务端下发，有更新时递增）
     * @returns Promise<{ localMap: { key → 本地路径或远程 URL }, cached, downloaded, failed }>
     *
     * 单飞去重：启动链上 _tryRestoreSel（setConfig/applyEntitlements 末尾）与
     * _silentVersionCheck（权益到位后 500ms）会对同一包并发触发；曾表现为两条
     * 「版本变更 0→1 清除旧缓存」日志 + 同一批文件并发下载两遍（版本写入只在
     * 下载完成后发生，第二笔总把已清的缓存再清一次）。同 packId@version 的
     * 在途请求直接复用同一个 Promise。
     */
    downloadPack: function (packId, audioMap, version) {
      var packVer = Number(version) || 1;
      var key = packId + '@' + packVer;
      if (_downloadInflight[key]) return _downloadInflight[key];
      var p = new Promise(function (resolve, reject) {
        var hasKwaiFS = (typeof ks !== 'undefined') &&
                        (typeof KwaiFile !== 'undefined') && KwaiFile.userDataPath;
        if (!hasKwaiFS) { resolve({ localMap: audioMap, cached: 0, downloaded: 0, failed: 0 }); return; }
        var keys = [];
        for (var mk in audioMap) if (audioMap.hasOwnProperty(mk)) keys.push(mk);
        if (!keys.length) { resolve({ localMap: {}, cached: 0, downloaded: 0, failed: 0 }); return; }

        var dir     = KwaiFile.userDataPath + '/voice-packs/' + packId;
        var verFile = dir + '/_version';

        try { if (!KwaiFile.existsSync(dir)) KwaiFile.mkdirSync(dir, true); } catch (e) {}

        // 读本地版本，不一致时清空旧缓存（只删 .mp3，保留目录）
        var localVer = 0;
        try {
          if (KwaiFile.existsSync(verFile)) {
            localVer = Number(KwaiFile.readFileSync(verFile, 'utf8')) || 0;
          }
        } catch (e) {}

        if (localVer !== packVer) {
          // 版本不同：删除旧 mp3 缓存（强制重新下载）
          try {
            var files = KwaiFile.readdirSync ? KwaiFile.readdirSync(dir) : [];
            for (var fi = 0; fi < files.length; fi++) {
              var fname = files[fi];
              if (/\.mp3$/i.test(fname)) {
                try { KwaiFile.unlinkSync(dir + '/' + fname); } catch (ue) {}
              }
            }
          } catch (e) {}
          console.log('[VoicePack] 版本变更 ' + localVer + '→' + packVer + '，清除旧缓存 packId=' + packId);
        }

        var localMap = {}, cached = 0, downloaded = 0, failed = 0;
        var idx = 0, running = 0, CONCURRENCY = 4;

        function finish () {
          // 所有文件处理完毕，写入新版本号
          if (downloaded > 0 || (cached === keys.length)) {
            try { KwaiFile.writeFileSync(verFile, String(packVer), 'utf8'); } catch (e) {}
          }
          // 下载失败的 key 回退远程 URL，保证音效不缺失（只是走网络）
          for (var fk in audioMap) {
            if (audioMap.hasOwnProperty(fk) && !localMap[fk]) localMap[fk] = audioMap[fk];
          }
          if (downloaded + cached === 0 && failed > 0) reject(new Error('voice_pack_download_failed'));
          else resolve({ localMap: localMap, cached: cached, downloaded: downloaded, failed: failed });
        }
        function pump () {
          while (running < CONCURRENCY && idx < keys.length) {
            (function (key) {
              running++;
              var dest = dir + '/' + key + '.mp3';
              if (KwaiFile.existsSync(dest)) {
                localMap[key] = dest; cached++; running--; pump(); checkDone(); return;
              }
              ks.downloadFile({
                url: audioMap[key],
                filePath: dest,
                success: function () { localMap[key] = dest; downloaded++; },
                fail: function (err) {
                  failed++;
                  console.warn('[VoicePack] 下载失败', key, err && err.errMsg || err);
                },
                complete: function () { running--; pump(); checkDone(); }
              });
            })(keys[idx++]);
          }
        }
        function checkDone () {
          if (idx >= keys.length && running === 0) finish();
        }
        pump();
      });
      _downloadInflight[key] = p;
      var clear = function () { if (_downloadInflight[key] === p) delete _downloadInflight[key]; };
      p.then(clear, clear);
      return p;
    },

    /**
     * 释放当前语音包占用的内存音频资源（磁盘缓存保留，下次切换免下载）
     */
    releasePack: function () {
      if (typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.destroyAllSfx) {
        KwaiMedia.Audio.destroyAllSfx();
      }
    },

    /**
     * 销毁当前语音包，恢复默认
     */
    destroyPack: function () {
      if (typeof KwaiMedia !== 'undefined' && KwaiMedia.Audio && KwaiMedia.Audio.destroyAllSfx) {
        KwaiMedia.Audio.destroyAllSfx();
      }
      _map = _defaultMap;
      _byCat = _defaultByCat;
      this._packId = '';
    },

    /**
     * 随机播放某一分类下的音效
     * @param {string} cat  'bid' | 'play' | 'emoji'
     */
    playRandom: function (cat) {
      var mapped = _catFileMap[cat] || cat;
      var keys = _byCat[mapped];
      if (!keys || !keys.length) return;
      var idx = Math.floor(Math.random() * keys.length);
      this.play(keys[idx]);
    },

    /**
     * 根据牌型 key 自动播放对应音效，单牌/对子/三张支持按 rank 读对应文件
     */
    playForHandType: function (handType, rank) {
      // ── 单牌 ──
      if (handType === 'single' && rank != null) {
        var sfx = _rankToSuffix(rank);
        if (sfx) this.play('single_' + sfx);
        return;
      }
      // ── 对子 ──
      if (handType === 'pair' && rank != null) {
        var sfx2 = _rankToSuffix(rank);
        if (sfx2) this.play('pair_' + sfx2);
        return;
      }
      // ── 三张 ──
      if (handType === 'triple' && rank != null) {
        var sfx3 = _rankToSuffix(rank);
        if (sfx3) this.play('triple_' + sfx3);
        return;
      }

      var map = {
        'triple-single': 'sandaiyi',
        'triple-pair':   'sandaier',
        straight:  'shunzi',
        'pair-straight': 'liandui',
        airplane:  'feiji',
        'airplane-singles': 'feiji',
        'airplane-pairs':   'feiji',
        'four-two-singles': 'sidaier',
        'four-two-pairs':   'sidaier',
        bomb:      'zhadan',
        rocket:    'wangzha',
        pass:      'buyao',
      };
      var vk = map[handType];
      if (vk) this.play(vk);
    },
  };

  var _defaultMap = _map;
  var _defaultByCat = _byCat;
})();