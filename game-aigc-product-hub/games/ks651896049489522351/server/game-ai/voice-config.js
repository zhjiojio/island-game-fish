'use strict';

// 语音内容配置 v3 — 完整音效映射
// 每个语音包包含全部游戏音效的 CDN URL，客户端下载后替换 SFX 池。
//
// 音频动作枚举 AUDIO_KEYS：
//   bidding:    bujiao, jiaodizhu, buqiang, qiangdizhu, woqiang, fen1, fen2, fen3
//   double:     jiabei, bujiabei, bujia, superjiabei
//   single:     single_3~A, single_2, single_xiaowang, single_dawang
//   pair:       pair_3~A, pair_2
//   triple:     triple_3~A, triple_2
//   composite:  sandaiyi, sandaier, sidaier
//   special:    shunzi, liandui, feiji, zhadan, wangzha
//   pass:       yaobuqi, buyao, guo
//   chat:       gaokuaidian, kuaidianchupai, shiqizhang, jiuzhe, xintaibengle,
//               dingbuzhu, dingbuzhuyeyao, paihaogao, juewang, yanpai, mmgg, dedede

const VOICE_PACK_ICON = 'https://p4-ad.adukwai.com/bs2/oauthAppIcon/djyNXridPx-openPlatform-file?x-kcdn-pid=682';

// ─── CDN 音频基路径 ─────────────────────────────────────────
// 每套语音包 = CDN 上一个「昵称目录」，目录内包含：
//   icon.png        封面图
//   manifest.json   包信息（名称/音色/条目清单）
//   01_call_landlord/ ... 10_chat/   76 条 mp3（各包命名完全一致，互换目录即换音色）
// 本地生成产物在 package/asset/audio/voice-packs/<dir>/，上传 CDN 后替换 CDN_ROOT。
// 上线前替换为真实 CDN 链接。
const CDN_ROOT = 'https://p1-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks651896049489522351/voice-packs';

function assetUrl(baseUrl, file) {
  return baseUrl.replace(/\/$/, '') + '/' + file;
}

function assertHttpsUrl(value, label) {
  let url;
  try { url = new URL(String(value || '')); } catch { throw new Error(`invalid_voice_url:${label}`); }
  if (url.protocol !== 'https:') throw new Error(`invalid_voice_url:${label}`);
}

// ─── 音效动作枚举 ───────────────────────────────────────────
// 所有语音包必须覆盖这里列出的每个 key
const ALL_AUDIO_KEYS = Object.freeze([
  // 叫牌
  'bujiao', 'jiaodizhu', 'buqiang', 'qiangdizhu', 'woqiang', 'fen1', 'fen2', 'fen3',
  // 加倍
  'jiabei', 'bujiabei', 'bujia', 'superjiabei',
  // 单牌 3~A,2,小王,大王
  'single_3','single_4','single_5','single_6','single_7','single_8','single_9','single_10',
  'single_J','single_Q','single_K','single_A','single_2','single_xiaowang','single_dawang',
  // 对子 3~A,2
  'pair_3','pair_4','pair_5','pair_6','pair_7','pair_8','pair_9','pair_10',
  'pair_J','pair_Q','pair_K','pair_A','pair_2',
  // 三张 3~A,2
  'triple_3','triple_4','triple_5','triple_6','triple_7','triple_8','triple_9','triple_10',
  'triple_J','triple_Q','triple_K','triple_A','triple_2',
  // 复合
  'sandaiyi','sandaier','sidaier',
  // 特殊
  'shunzi','liandui','feiji','zhadan','wangzha',
  // 不出/过
  'yaobuqi','buyao','guo',
  // 互动
  'gaokuaidian','kuaidianchupai','shiqizhang','jiuzhe','xintaibengle',
  'dingbuzhu','dingbuzhuyeyao','paihaogao','juewang','yanpai','mmgg','dedede',
]);

// ─── 互动语音（公共，不属任何包）────────────────────────────
// audioKey 与语音包 chat 音效 key 一一对应；voiceUrl 为默认包 CDN 地址，
// 客户端优先按当前选中的语音包音色播放（无映射时回退该 URL）。
const DEFAULT_CHAT = file => assetUrl(CDN_ROOT + '/default', '10_chat/' + file);
const INTERACTIVE = [
  { voiceId: 'it_1',  audioKey: 'gaokuaidian',    icon: '', text: '搞快点搞快点！',            voiceUrl: DEFAULT_CHAT('chat_gaokuaidian.mp3'),      contentEnabled: true },
  { voiceId: 'it_2',  audioKey: 'kuaidianchupai', icon: '', text: '快点啊，等到花儿都谢了',    voiceUrl: DEFAULT_CHAT('chat_kuaidian.mp3'),         contentEnabled: true },
  { voiceId: 'it_3',  audioKey: 'shiqizhang',     icon: '', text: '十七张牌，你能秒我？！',    voiceUrl: DEFAULT_CHAT('chat_17zhang.mp3'),          contentEnabled: true },
  { voiceId: 'it_4',  audioKey: 'jiuzhe',         icon: '', text: '就这？',                    voiceUrl: DEFAULT_CHAT('chat_jiuzhe.mp3'),           contentEnabled: true },
  { voiceId: 'it_5',  audioKey: 'xintaibengle',   icon: '', text: '心态崩了呀',                voiceUrl: DEFAULT_CHAT('chat_xintaibeng.mp3'),       contentEnabled: true },
  { voiceId: 'it_6',  audioKey: 'dingbuzhu',      icon: '', text: '这谁顶得住啊！',            voiceUrl: DEFAULT_CHAT('chat_dingbuzhu.mp3'),        contentEnabled: true },
  { voiceId: 'it_7',  audioKey: 'dingbuzhuyeyao', icon: '', text: '顶不住也要顶！',            voiceUrl: DEFAULT_CHAT('chat_dingbuzhu_yeyao.mp3'),  contentEnabled: true },
  { voiceId: 'it_8',  audioKey: 'paihaogao',      icon: '', text: '你的牌打得也太好了！',      voiceUrl: DEFAULT_CHAT('chat_paihaogao.mp3'),        contentEnabled: true },
  { voiceId: 'it_9',  audioKey: 'juewang',        icon: '', text: '我能怎么办，我也很绝望啊', voiceUrl: DEFAULT_CHAT('chat_juewang.mp3'),          contentEnabled: true },
  { voiceId: 'it_10', audioKey: 'yanpai',         icon: '', text: '我要验牌！',                voiceUrl: DEFAULT_CHAT('chat_yanpai.mp3'),           contentEnabled: true },
  { voiceId: 'it_11', audioKey: 'mmgg',           icon: '', text: '你是MM还是GG？',            voiceUrl: DEFAULT_CHAT('chat_mm_gg.mp3'),            contentEnabled: true },
  { voiceId: 'it_12', audioKey: 'dedede',         icon: '', text: '得得得得得得得得得得',      voiceUrl: DEFAULT_CHAT('chat_dedede.mp3'),           contentEnabled: true },
];

// ─── 语音包定义 ─────────────────────────────────────────────
// audioMap: { key → CDN文件路径 | null(无此音效) }
// yujie 文件结构映射（来自 manifest.json）作为模板
function buildYujieAudioMap(packId) {
  // 01_call_landlord
  const b = '01_call_landlord';
  // 02_double
  const d = '02_double';
  // 03_single
  const s = '03_single';
  // 04_pair
  const p = '04_pair';
  // 05_triple
  const t = '05_triple';
  // 06_triple_with
  const tw = '06_triple_with';
  // 07_four_with_two
  const fw = '07_four_with_two';
  // 08_special
  const sp = '08_special';
  // 09_pass
  const pa = '09_pass';
  // 10_chat
  const ch = '10_chat';

  return {
    bujiao:             b + '/bu_jiao.mp3',
    jiaodizhu:          b + '/jiao_dizhu.mp3',
    buqiang:            b + '/bu_qiang.mp3',
    qiangdizhu:         b + '/qiang_dizhu.mp3',
    woqiang:            b + '/wo_qiang.mp3',
    fen1:               b + '/fen_1.mp3',
    fen2:               b + '/fen_2.mp3',
    fen3:               b + '/fen_3.mp3',

    jiabei:             d + '/jiabei.mp3',
    bujiabei:           d + '/bu_jiabei.mp3',
    bujia:              d + '/bu_jia.mp3',
    superjiabei:        d + '/super_jiabei.mp3',

    single_3:           s + '/single_3.mp3',
    single_4:           s + '/single_4.mp3',
    single_5:           s + '/single_5.mp3',
    single_6:           s + '/single_6.mp3',
    single_7:           s + '/single_7.mp3',
    single_8:           s + '/single_8.mp3',
    single_9:           s + '/single_9.mp3',
    single_10:          s + '/single_10.mp3',
    single_J:           s + '/single_J.mp3',
    single_Q:           s + '/single_Q.mp3',
    single_K:           s + '/single_K.mp3',
    single_A:           s + '/single_A.mp3',
    single_2:           s + '/single_2.mp3',
    single_xiaowang:    s + '/single_xiaowang.mp3',
    single_dawang:      s + '/single_dawang.mp3',

    pair_3:             p + '/pair_3.mp3',
    pair_4:             p + '/pair_4.mp3',
    pair_5:             p + '/pair_5.mp3',
    pair_6:             p + '/pair_6.mp3',
    pair_7:             p + '/pair_7.mp3',
    pair_8:             p + '/pair_8.mp3',
    pair_9:             p + '/pair_9.mp3',
    pair_10:            p + '/pair_10.mp3',
    pair_J:             p + '/pair_J.mp3',
    pair_Q:             p + '/pair_Q.mp3',
    pair_K:             p + '/pair_K.mp3',
    pair_A:             p + '/pair_A.mp3',
    pair_2:             p + '/pair_2.mp3',

    triple_3:           t + '/triple_3.mp3',
    triple_4:           t + '/triple_4.mp3',
    triple_5:           t + '/triple_5.mp3',
    triple_6:           t + '/triple_6.mp3',
    triple_7:           t + '/triple_7.mp3',
    triple_8:           t + '/triple_8.mp3',
    triple_9:           t + '/triple_9.mp3',
    triple_10:          t + '/triple_10.mp3',
    triple_J:           t + '/triple_J.mp3',
    triple_Q:           t + '/triple_Q.mp3',
    triple_K:           t + '/triple_K.mp3',
    triple_A:           t + '/triple_A.mp3',
    triple_2:           t + '/triple_2.mp3',

    sandaiyi:           tw + '/triple_with_single.mp3',
    sandaier:           tw + '/triple_with_pair.mp3',
    sidaier:            fw + '/four_with_two.mp3',

    shunzi:             sp + '/shunzi.mp3',
    liandui:            sp + '/liandui.mp3',
    feiji:              sp + '/feiji.mp3',
    zhadan:             sp + '/zhadan.mp3',
    wangzha:            sp + '/wangzha.mp3',

    yaobuqi:            pa + '/yaobuqi.mp3',
    buyao:              pa + '/buyao.mp3',
    guo:                pa + '/guo.mp3',

    gaokuaidian:        ch + '/chat_gaokuaidian.mp3',
    kuaidianchupai:     ch + '/chat_kuaidian.mp3',
    shiqizhang:         ch + '/chat_17zhang.mp3',
    jiuzhe:             ch + '/chat_jiuzhe.mp3',
    xintaibengle:       ch + '/chat_xintaibeng.mp3',
    dingbuzhu:          ch + '/chat_dingbuzhu.mp3',
    dingbuzhuyeyao:     ch + '/chat_dingbuzhu_yeyao.mp3',
    paihaogao:          ch + '/chat_paihaogao.mp3',
    juewang:            ch + '/chat_juewang.mp3',
    yanpai:             ch + '/chat_yanpai.mp3',
    mmgg:               ch + '/chat_mm_gg.mp3',
    dedede:             ch + '/chat_dedede.mp3',
  };
}

// dir = CDN 上的语音包目录（ASCII 文件名，不可用中文）；显示名走 name 字段。
// 目录内是语音包音频（01_call_landlord/... 76 条），与音频同级的还有
// icon.png（头像）与 manifest.json（名称等包信息，未来可扩展）。
const PACKS = [
  // 免费默认包（御姐音色）
  { packId: 'default', version: 1, dir: 'default', sku: 'voice_pack:default', name: '默认语音包', icon: '', promoLabel: '免费', priceBeans: 0,   defaultVoiceId: 'vp_default_jiaodizhu', contentEnabled: true, audioBaseUrl: CDN_ROOT + '/default', audioMap: buildYujieAudioMap('default') },
  // 铁子语音包：豪横男声（male-qn-badao），本地已生成待上传 CDN
  { packId: 'tiezi',   version: 1, dir: 'tiezi', sku: 'voice_pack:tiezi',   name: '铁子语音包', icon: '', promoLabel: '',    priceBeans: 100, defaultVoiceId: 'vp_tiezi_jiaodizhu',   contentEnabled: true, audioBaseUrl: CDN_ROOT + '/tiezi', audioMap: buildYujieAudioMap('tiezi') },
  // 甜妹语音包：甜美女声（female-tianmei），本地已生成待上传 CDN
  { packId: 'tianmei', version: 1, dir: 'tianmei', sku: 'voice_pack:tianmei', name: '甜妹语音包', icon: '', promoLabel: '',    priceBeans: 100, defaultVoiceId: 'vp_tianmei_jiaodizhu', contentEnabled: true, audioBaseUrl: CDN_ROOT + '/tianmei', audioMap: buildYujieAudioMap('tianmei') },
];

// ─── 验证 ────────────────────────────────────────────────────
const seenVoiceIds = new Set();
const seenPackIds = new Set();
const seenPackSkus = new Set();

for (const item of INTERACTIVE) {
  if (seenVoiceIds.has(item.voiceId)) throw new Error(`duplicate_voice_id:${item.voiceId}`);
  seenVoiceIds.add(item.voiceId);
  assertHttpsUrl(item.voiceUrl, item.voiceId);
}

for (const pack of PACKS) {
  if (seenPackIds.has(pack.packId)) throw new Error(`duplicate_pack_id:${pack.packId}`);
  if (seenPackSkus.has(pack.sku)) throw new Error(`duplicate_pack_sku:${pack.sku}`);
  seenPackIds.add(pack.packId);
  seenPackSkus.add(pack.sku);

  // 验证 audioMap 覆盖了所有必要 key
  const missingKeys = ALL_AUDIO_KEYS.filter(k => !pack.audioMap[k]);
  if (missingKeys.length > 0) throw new Error(`pack ${pack.packId} missing audio keys: ${missingKeys.join(',')}`);

  // 构建 voices 列表（按 audioMap 生成）
  const voices = [];
  for (const key of ALL_AUDIO_KEYS) {
    const file = pack.audioMap[key];
    if (!file) continue;
    const voiceId = `vp_${pack.packId}_${key}`;
    if (seenVoiceIds.has(voiceId)) throw new Error(`duplicate_voice_id:${voiceId}`);
    seenVoiceIds.add(voiceId);
    voices.push({
      voiceId,
      key,
      text: key, // 文案由客户端根据 key 映射到中文
      voiceUrl: assetUrl(pack.audioBaseUrl, file),
      contentEnabled: true,
    });
  }
  pack.voices = voices;
}

const VOICE_PACK_SKUS = Object.freeze(Array.from(seenPackSkus));

// ─── 导出配置 ────────────────────────────────────────────────
const VOICE_CONFIG = Object.freeze({
  schemaVersion: 3,
  interactive: INTERACTIVE.filter(item => item.contentEnabled).map(item => ({ ...item })),
  packs: PACKS.filter(pack => pack.contentEnabled).map(pack => ({
    packId:         pack.packId,
    version:        pack.version || 1,
    sku:            pack.sku,
    name:           pack.name,
    // 头像 = 语音包名称目录内与音频同级的 icon.png
    icon:           pack.icon || assetUrl(pack.audioBaseUrl, 'icon.png'),
    promoLabel:     pack.promoLabel,
    priceBeans:     pack.priceBeans,
    defaultVoiceId: pack.defaultVoiceId,
    audioBaseUrl:   pack.audioBaseUrl,
    saleEnabled:    true,
    voices:         pack.voices.filter(v => v.contentEnabled).map(v => ({ ...v })),
  })),
});

const VOICE_BY_ID = new Map();
const PACK_BY_ID = new Map();
for (const item of VOICE_CONFIG.interactive) {
  VOICE_BY_ID.set(item.voiceId, { text: item.text, voiceUrl: item.voiceUrl, packId: '', sku: '', free: true, audioKey: item.audioKey || '' });
}
for (const pack of VOICE_CONFIG.packs) {
  PACK_BY_ID.set(pack.packId, pack);
  for (const voice of pack.voices) {
    if (VOICE_BY_ID.has(voice.voiceId)) throw new Error(`duplicate_voice_id:${voice.voiceId}`);
    VOICE_BY_ID.set(voice.voiceId, {
      text: voice.text, voiceUrl: voice.voiceUrl,
      packId: pack.packId, sku: pack.sku, free: false,
      audioKey: voice.key || '',
    });
  }
}

const LEGACY_VOICE_CONFIG = Object.freeze({
  interactive: VOICE_CONFIG.interactive.map(item => ({
    voiceId: item.voiceId, icon: item.icon, text: item.text, voiceUrl: item.voiceUrl,
  })),
  packs: [],
});

function getVoiceConfigForCapabilities(capabilities) {
  return capabilities && capabilities.has('voice_config_v2') ? VOICE_CONFIG : LEGACY_VOICE_CONFIG;
}

module.exports = {
  VOICE_PACK_ICON,
  VOICE_CONFIG,
  VOICE_PACK_SKUS,
  VOICE_BY_ID,
  PACK_BY_ID,
  ALL_AUDIO_KEYS,
  LEGACY_VOICE_CONFIG,
  getVoiceConfigForCapabilities,
};