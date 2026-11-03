// scripts/audit_story.js —— 全局审计：孤儿节点 / 悬空 next / 图缺失 / 音频缺失
// 用法：node scripts/audit_story.js
const fs = require('fs');
const path = require('path');

// 模拟 window
global.window = {};
require('../js/story.js');
const STORY = global.window.STORY;
const NODES = STORY.nodes || STORY;
const start = STORY.start || 's1';

const ids = new Set(Object.keys(NODES));
const reachable = new Set();
const queue = [start];
while (queue.length) {
  const id = queue.shift();
  if (reachable.has(id) || !NODES[id]) continue;
  reachable.add(id);
  const n = NODES[id];
  if (n.next) queue.push(n.next);
  if (n.type === 'choice' && n.options) {
    n.options.forEach(o => { if (o.next) queue.push(o.next); });
  }
}

// 孤儿：定义了但从未被指向的节点
const referenced = new Set([start]);
Object.values(NODES).forEach(n => {
  if (n.next) referenced.add(n.next);
  if (n.options) n.options.forEach(o => { if (o.next) referenced.add(o.next); });
});
const orphans = [...ids].filter(id => !referenced.has(id));

// 悬空 next：指向不存在的节点
const dangling = [];
Object.entries(NODES).forEach(([id, n]) => {
  if (n.next && !NODES[n.next] && !/^(__|BE_)/.test(n.next)) dangling.push({ id, next: n.next });
  if (n.options) n.options.forEach((o, i) => {
    if (o.next && !NODES[o.next] && !/^(__|BE_)/.test(o.next)) dangling.push({ id, opt: i, next: o.next });
  });
});

// 不可达
const unreachable = [...ids].filter(id => !reachable.has(id) && !/^__/.test(id));

// 图统计：有 media.file 的节点
const imgNodes = [];
const videoNodes = [];
Object.entries(NODES).forEach(([id, n]) => {
  const m = n.media;
  if (!m || !m.file) return;
  if (m.kind === 'image') imgNodes.push({ id, file: m.file });
  else if (m.kind === 'video') videoNodes.push({ id, file: m.file });
});

// 检查本地资源
function checkLocal(rel) {
  if (!rel) return false;
  if (/^https?:/.test(rel)) return null; // CDN, 无法本地检查
  return fs.existsSync(path.join(__dirname, '..', rel));
}
const imgMissing = imgNodes.filter(x => checkLocal(x.file) === false);
const videoMissing = videoNodes.filter(x => checkLocal(x.file) === false);

// 音频：所有节点都应有 narr audio? 只查有 text + 非视频节点 + speaker=narrator/内心 的
const narrDir = path.join(__dirname, '..', 'assets/audio/narr');
const narrFiles = fs.existsSync(narrDir) ? fs.readdirSync(narrDir).filter(f => f.endsWith('.mp3')) : [];
const narrSet = new Set(narrFiles.map(f => f.replace('.mp3', '')));
const audioMissing = [];
Object.entries(NODES).forEach(([id, n]) => {
  if (!n.text) return;
  if (n.media && n.media.kind === 'video') return;
  if (/^(BE_|__)/.test(id)) return;
  if (n.type === 'choice') return;
  // narr / 内心 OS / stay 节点
  const isNarr = n.char === 'narrator' || (n.speaker && /旁白|内心|说书/.test(n.speaker));
  if (!isNarr && !n.stay) return;
  if (!narrSet.has(id)) audioMissing.push({ id, speaker: n.speaker, stay: !!n.stay });
});

// BE 音频
const beDir = path.join(__dirname, '..', 'assets/audio/be');
const beFiles = fs.existsSync(beDir) ? fs.readdirSync(beDir).filter(f => f.endsWith('.mp3')) : [];
const beSet = new Set(beFiles.map(f => f.replace('.mp3', '')));

// BE roast 音频（v71.16 24 条）
const beRoastMissing = [];
Object.entries(NODES).forEach(([id, n]) => {
  if (n.options) n.options.forEach(o => {
    if (o.roastKey && !beSet.has(o.roastKey)) beRoastMissing.push({ id, roastKey: o.roastKey });
  });
});

// lastframe
const lfDir = path.join(__dirname, '..', 'assets/lastframe');
const lfFiles = fs.existsSync(lfDir) ? fs.readdirSync(lfDir).filter(f => f.endsWith('.jpg')) : [];

console.log('====== STORY AUDIT ======');
console.log(`版本: ${STORY.version}`);
console.log(`总节点数: ${ids.size}`);
console.log(`可达节点数: ${reachable.size}`);
console.log(`\n[孤儿节点（定义了但无人指向，start 除外）] ${orphans.length}`);
orphans.forEach(id => console.log('  -', id));
console.log(`\n[悬空 next（指向不存在的节点）] ${dangling.length}`);
dangling.forEach(d => console.log('  -', JSON.stringify(d)));
console.log(`\n[不可达节点] ${unreachable.length}`);
unreachable.forEach(id => console.log('  -', id));
console.log(`\n[图节点总数] image=${imgNodes.length} video=${videoNodes.length}`);
console.log(`[本地图缺失] ${imgMissing.length}`);
imgMissing.forEach(x => console.log('  -', x.id, '→', x.file));
console.log(`[本地视频缺失] ${videoMissing.length}`);
videoMissing.forEach(x => console.log('  -', x.id, '→', x.file));
console.log(`\n[旁白/内心 OS/stay 音频缺失] ${audioMissing.length}`);
audioMissing.forEach(x => console.log('  -', x.id, x.speaker, x.stay?'(stay)':''));
console.log(`\n[BE roast 音频缺失] ${beRoastMissing.length}`);
beRoastMissing.forEach(x => console.log('  -', x.id, '→', x.roastKey));
console.log(`\n[lastframe] ${lfFiles.length} 张`);
console.log('=========================');
