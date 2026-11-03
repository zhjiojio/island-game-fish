#!/usr/bin/env node
/**
 * 语音批量生成器 —— 新增主播的唯一入口
 * ═══════════════════════════════════════════════════════════════════
 * 用法：
 *   export MINIMAX_API_KEY=sk-cp-...
 *   export MINIMAX_GROUP_ID=...
 *   node tools/gen-voices.js              # 只生成缺失的（增量，省钱）
 *   node tools/gen-voices.js --force      # 全部重生成
 *   node tools/gen-voices.js --only taotao  # 只生成某位主播
 *
 * 产出：package/assets/voice/<key>_help1..N.mp3 + <key>_win1..M.mp3
 *
 * 【为什么用预置音色而不是 voice_clone】
 *   ① voice_clone 每次训练收费，且需企业实名+充值权限；
 *   ② 预置音色 voice_id 固定 → 同一主播的 help/win 天然是同一个人（用户铁律）；
 *   ③ 可复现：换台机器跑出来的音色完全一致，不依赖某个一次性 voice_id。
 *   若后续要真人音色，把 timbre 换成克隆得到的 voice_id 即可，本脚本无需改动。
 * ═══════════════════════════════════════════════════════════════════
 */
var fs = require('fs');
var path = require('path');
var https = require('https');

var CFG = require('./voice-scripts.js');
var OUT = path.join(__dirname, '..', 'package', 'assets', 'voice');
var API_KEY = process.env.MINIMAX_API_KEY;
var GROUP_ID = process.env.MINIMAX_GROUP_ID;

var FORCE = process.argv.indexOf('--force') >= 0;
var onlyIdx = process.argv.indexOf('--only');
var ONLY = onlyIdx >= 0 ? process.argv[onlyIdx + 1] : null;

// Minimax 预置音色映射。key = voice-scripts.js 里的 timbre 标签
var TIMBRE = {
  'female-shaonv':   'female-shaonv',    // 少女音：元气、偏高
  'female-tianmei':  'female-tianmei',   // 甜美音：软糯、气声
  'female-yujie':    'female-yujie',     // 御姐音：偏低、稳
  'female-chengshu': 'female-chengshu'   // 成熟音：知性、语速慢
};

// 情绪参数：求救要急切/撒娇（语速略快），感谢要放松（语速正常）
var TUNE = {
  help: { speed: 1.05, vol: 1.0, pitch: 0 },
  win:  { speed: 1.0,  vol: 1.0, pitch: 0 }
};

// 【踩坑修复 · 音色语速补偿】御姐音/成熟音的默认语速天生比少女音慢很多，
// 同样字数的文案，少女音 6s、御姐音要 9s → 超出「help ≤7.5s」契约。
// 实测：chenchen(御姐) 3 条 help 全部 8.0~8.9s，jingjing(成熟) win 8.9s。
// 所以按音色叠加语速系数，而不是去砍文案（砍文案会丢人设和故事感）。
var SPEED_COMP = {
  'female-shaonv':   1.00,   // 少女音：基准
  'female-tianmei':  1.00,   // 甜美音：基准
  'female-yujie':    1.22,   // 御姐音：慢 → 提速 22%
  'female-chengshu': 1.15    // 成熟音：略慢 → 提速 15%
};
function tuneFor(kind, timbre) {
  var t = TUNE[kind];
  return { speed: Math.round(t.speed * (SPEED_COMP[timbre] || 1) * 100) / 100,
           vol: t.vol, pitch: t.pitch };
}

function post(p, obj) {
  return new Promise(function (resolve, reject) {
    var body = Buffer.from(JSON.stringify(obj));
    var req = https.request({
      host: 'api.minimaxi.com', path: p, method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + API_KEY,
        'Content-Type': 'application/json',
        'Content-Length': body.length
      }
    }, function (res) {
      var cs = [];
      res.on('data', function (c) { cs.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, body: Buffer.concat(cs) }); });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}

function synth(text, voiceId, tune, outPath) {
  return post('/v1/t2a_v2?GroupId=' + GROUP_ID, {
    model: 'speech-02-hd',
    text: text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: tune.speed, vol: tune.vol, pitch: tune.pitch
    },
    // 128kbps 单声道 —— 与项目现有语音规格一致，省包体
    audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 }
  }).then(function (r) {
    var j;
    try { j = JSON.parse(r.body.toString()); } catch (e) { throw new Error('非 JSON 响应: ' + r.body.toString().slice(0, 200)); }
    if (!j.data || !j.data.audio) {
      var code = j.base_resp ? j.base_resp.status_code : 0;
      var err = new Error('合成失败: ' + JSON.stringify(j.base_resp || j).slice(0, 200));
      err.rateLimit = (code === 1002);   // 1002 = RPM 超限，可重试
      throw err;
    }
    fs.writeFileSync(outPath, Buffer.from(j.data.audio, 'hex'));
    return fs.statSync(outPath).size;
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// 【踩坑修复】Minimax 有 RPM 限流（status_code 1002）。40 条串行无间隔跑，
// 跑到第 36 条就开始整批 1002 失败。所以：① 每条之间固定间隔；② 遇 1002 指数退避重试。
var GAP_MS = 1200;
function synthRetry(text, voiceId, tune, outPath, tries) {
  tries = tries || 0;
  return synth(text, voiceId, tune, outPath).catch(function (e) {
    if (e.rateLimit && tries < 5) {
      var wait = 4000 * Math.pow(2, tries);   // 4s / 8s / 16s / 32s / 64s
      console.log('     ⏳ RPM 限流，等 ' + (wait / 1000) + 's 重试…');
      return sleep(wait).then(function () { return synthRetry(text, voiceId, tune, outPath, tries + 1); });
    }
    throw e;
  });
}

function main() {
  if (!API_KEY || !GROUP_ID) {
    console.error('✗ 缺少环境变量。请先：');
    console.error('  export MINIMAX_API_KEY=sk-cp-...');
    console.error('  export MINIMAX_GROUP_ID=...');
    process.exit(1);
  }
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  // 一致性校验：数组长度必须与 pd-game.js 的 HELP_N / WIN_N 一致，否则运行时会 404
  var bad = [];
  CFG.girls.forEach(function (g) {
    if (g.help.length !== CFG.HELP_N) bad.push(g.key + ' help ' + g.help.length + ' != ' + CFG.HELP_N);
    if (g.win.length !== CFG.WIN_N) bad.push(g.key + ' win ' + g.win.length + ' != ' + CFG.WIN_N);
    if (!TIMBRE[g.timbre]) bad.push(g.key + ' 未知音色 ' + g.timbre);
  });
  if (bad.length) { console.error('✗ 脚本库校验失败:\n  ' + bad.join('\n  ')); process.exit(1); }

  var jobs = [];
  CFG.girls.forEach(function (g) {
    if (ONLY && g.key !== ONLY) return;
    g.help.forEach(function (t, i) {
      jobs.push({ key: g.key, name: g.name, kind: 'help', text: t,
                  voice: TIMBRE[g.timbre], timbre: g.timbre, file: g.key + '_help' + (i + 1) + '.mp3' });
    });
    g.win.forEach(function (t, i) {
      jobs.push({ key: g.key, name: g.name, kind: 'win', text: t,
                  voice: TIMBRE[g.timbre], timbre: g.timbre, file: g.key + '_win' + (i + 1) + '.mp3' });
    });
  });

  console.log('待生成 ' + jobs.length + ' 条语音' + (FORCE ? '（--force 全量重生成）' : '（增量，已存在的跳过）') + '\n');

  var ok = 0, skip = 0, fail = 0;
  // 串行执行：Minimax 有并发限制，并发跑会大面积 429（见 skill 已知踩坑）
  var chain = Promise.resolve();
  jobs.forEach(function (j) {
    chain = chain.then(function () {
      var out = path.join(OUT, j.file);
      if (!FORCE && fs.existsSync(out) && fs.statSync(out).size > 1024) {
        skip++; console.log('  ⏭  ' + j.file + ' 已存在');
        return;
      }
      return synthRetry(j.text, j.voice, tuneFor(j.kind, j.timbre), out).then(function (size) {
        ok++;
        console.log('  ✓  ' + j.file.padEnd(24) + (size / 1024).toFixed(0) + 'KB  [' + j.name + '] ' + j.text.slice(0, 22) + '…');
        return sleep(GAP_MS);          // 限流保护：每条之间留间隔
      }).catch(function (e) {
        fail++;
        console.error('  ✗  ' + j.file + '  ' + e.message);
      });
    });
  });

  chain.then(function () {
    console.log('\n生成 ' + ok + ' / 跳过 ' + skip + ' / 失败 ' + fail);
    if (fail) { console.error('\n有失败项，修复后重跑（已成功的会自动跳过）'); process.exit(1); }
    console.log('\n下一步：');
    console.log('  1. 抽听几条确认音色/情绪对味');
    console.log('  2. 确认 pd-game.js 的 HELP_N=' + CFG.HELP_N + ' WIN_N=' + CFG.WIN_N + ' 与实际文件数一致');
    console.log('  3. ksmg preview package 真机验证进关/过关语音');
  });
}
main();
