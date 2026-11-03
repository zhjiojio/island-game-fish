#!/usr/bin/env node
// v76.19 · 全量旁白 mp3 审计脚本
// 扫 content/episodes/*.json 找所有【应有旁白】的节点 → 逐个 curl CDN 检查存在性
// 应有旁白规则（对齐 js/main.js shouldPlayNarr）：
//   - 非 choice / 非 end
//   - 有 text 字段
//   - 非 video 节点 or 在 NARR_VIDEO_ALLOW 白名单
//   - v76.18 新增：type=choice 且 narr:true 也算
// 输出：missing.txt（缺失的 curId 列表，一行一个）
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const CDN = 'https://p5-ad.adkwai.com/udata/pkg/KS-GAME/AIGC-SoGame/ks712131693858878897/audio/narr/';
const NARR_VIDEO_ALLOW = { e3s3: 1, s_stone_video: 1, s_weather_video: 1 };
const EPISODES_DIR = path.join(__dirname, '../content/episodes');
const LOCAL_NARR = path.join(__dirname, '../assets/audio/narr');

const localSet = new Set();
if (fs.existsSync(LOCAL_NARR)) {
  fs.readdirSync(LOCAL_NARR).forEach(f => {
    if (f.endsWith('.mp3')) localSet.add(f.replace('.mp3', ''));
  });
}

function shouldNarr(id, n) {
  if (!n) return false;
  if (n.type === 'choice') return n.narr === true;
  if (n.type === 'end') return false;
  if (!n.text) return false;
  if (n.media && n.media.kind === 'video' && !NARR_VIDEO_ALLOW[id]) return false;
  return true;
}

const shouldList = [];
fs.readdirSync(EPISODES_DIR).filter(f => f.endsWith('.json')).forEach(fn => {
  const nodes = JSON.parse(fs.readFileSync(path.join(EPISODES_DIR, fn), 'utf8'));
  Object.keys(nodes).forEach(id => {
    const n = nodes[id];
    if (typeof n !== 'object' || Array.isArray(n)) return;
    if (shouldNarr(id, n)) shouldList.push({ id, ep: fn, text: (n.text||n.title||'').substring(0, 40), char: n.char, speaker: n.speaker });
  });
});

console.log('应有旁白节点数：' + shouldList.length);
console.log('本地已存在：' + Array.from(localSet).filter(k => shouldList.find(x => x.id === k)).length);

// 分批 curl 检查 CDN
const missing = [];
const present = [];
let i = 0;
const total = shouldList.length;
const step = 10;

function checkBatch(start) {
  const batch = shouldList.slice(start, start + step);
  const cmds = batch.map(x => `curl -s -o /dev/null -w "%{http_code} ${x.id}\\n" "${CDN}${x.id}.mp3"`).join(';');
  const out = execSync(cmds, { encoding: 'utf8', maxBuffer: 1024*1024 });
  out.trim().split('\n').forEach(line => {
    const [code, id] = line.trim().split(/\s+/);
    const rec = shouldList.find(x => x.id === id);
    if (code === '200') present.push(rec);
    else missing.push(rec);
  });
  const done = start + batch.length;
  process.stdout.write(`\r进度 ${done}/${total}`);
  if (done < total) checkBatch(done);
}
checkBatch(0);
console.log('\n');

console.log(`✅ CDN 已存在：${present.length}`);
console.log(`❌ CDN 缺失：${missing.length}`);
console.log('\n=== 缺失明细 ===');
missing.forEach(m => {
  console.log(`  [${m.ep}] ${m.id}  (${m.char||''}/${m.speaker||''})  "${m.text}"`);
});

fs.writeFileSync(path.join(__dirname, 'narr-missing.json'), JSON.stringify(missing, null, 2));
fs.writeFileSync(path.join(__dirname, 'narr-missing.txt'), missing.map(m => m.id).join('\n'));
console.log('\n📁 写入 scripts/narr-missing.json 和 narr-missing.txt');
