// 剧情逻辑审计：4 维度（选项/图/视频/旁白）× 3 类问题
// ① 图但无旁白无选项（哑图）
// ② choice 节点无标题/无描述（选项直出无引导）
// ③ 一个 choice 的所有 options 走向同一个 next（伪选择）
// ④ 有选项但没标题（title 缺）
// ⑤ text 与 next 逻辑跳跃（例：text 提到 A 但 next 是 B）
// ⑥ stay 节点无音频且无文字
// ⑦ BE 结局分布：哪些选项 100% 通向 BE（陷阱选项）
// ⑧ 主线关键节点 next 链是否断裂

global.window = {};
require('../js/story.js');
const N = window.STORY.nodes || window.STORY;

const ids = Object.keys(N).filter(k => k !== 'meta' && k !== 'version' && k !== 'changelog' && k !== 'updatedAt' && typeof N[k] === 'object' && N[k]);

function nextsOf(n) {
  const arr = [];
  if (n.next) arr.push(n.next);
  if (Array.isArray(n.options)) n.options.forEach(o => o && o.next && arr.push(o.next));
  return arr;
}

// ① choice 节点：4 选项都走同 next（伪选择）
console.log('\n═════ 【伪选择】choice 所有选项走同一 next ═════');
ids.forEach(id => {
  const n = N[id];
  if (n.type === 'choice' && Array.isArray(n.options) && n.options.length >= 2) {
    const nexts = n.options.map(o => o && o.next).filter(Boolean);
    const uniq = [...new Set(nexts)];
    if (uniq.length === 1) {
      console.log(`  ${id.padEnd(28)} ${n.options.length}个选项全指向 → ${uniq[0]}`);
    }
  }
});

// ② choice 无 title（选项直出、玩家不知场景）
console.log('\n═════ 【选项直出】choice 节点无 title/text ═════');
ids.forEach(id => {
  const n = N[id];
  if (n.type === 'choice' && !n.title && !n.text) {
    const opts = (n.options||[]).map(o => o && o.text ? o.text.slice(0,15) : '?').join(' | ');
    console.log(`  ${id.padEnd(28)} 选项: ${opts}`);
  }
});

// ③ 有 media:image 但无 text 无 speaker 无 options（哑图）
console.log('\n═════ 【哑图】有 image 但无台词无选项无 next ═════');
ids.forEach(id => {
  const n = N[id];
  const m = n.media || {};
  if (m.kind === 'image' && !n.text && !n.options && !n.next) {
    console.log(`  ${id.padEnd(28)} 图: ${(m.file||'').slice(-40)}`);
  }
});

// ④ 有 video 但无 text 无 next（视频完就断）
console.log('\n═════ 【视频断链】有 video 但无 next（且非 BE_） ═════');
ids.forEach(id => {
  const n = N[id];
  const m = n.media || {};
  if (m.kind === 'video' && !n.next && !/^BE_/.test(id) && n.type !== 'end') {
    console.log(`  ${id.padEnd(28)} 视频: ${(m.file||'').slice(-40)}`);
  }
});

// ⑤ stay 节点无 text（stay 就是让玩家看文字的）
console.log('\n═════ 【stay 空文字】stay:true 但无 text ═════');
ids.forEach(id => {
  const n = N[id];
  if (n.stay === true && (!n.text || !n.text.trim())) {
    console.log(`  ${id.padEnd(28)} char:${n.char||'-'} speaker:${n.speaker||'-'}`);
  }
});

// ⑥ choice 全 BE：所有选项都走 BE_
console.log('\n═════ 【全 BE 陷阱】choice 所有选项都通向 BE_ ═════');
ids.forEach(id => {
  const n = N[id];
  if (n.type === 'choice' && Array.isArray(n.options)) {
    const nexts = n.options.map(o => o && o.next).filter(Boolean);
    if (nexts.length && nexts.every(x => /^BE_/.test(x))) {
      console.log(`  ${id.padEnd(28)} ${nexts.length}选项全 BE: ${nexts.join(',')}`);
    }
  }
});

// ⑦ text 极短（< 8 字）的非过场节点（信息量不足）
console.log('\n═════ 【台词过短】非过场 text < 8 字 ═════');
ids.forEach(id => {
  const n = N[id];
  if (n.text && n.text.length < 8 && !n.stay && n.type !== 'choice' && n.type !== 'end') {
    console.log(`  ${id.padEnd(28)} "${n.text}" speaker:${n.speaker||'-'}`);
  }
});

// ⑧ 主线走向：从 start 走 next（选默认第一个选项），列出主线
console.log('\n═════ 【主线追踪】start 起沿第一 next 走完（防死循环 100 步） ═════');
let cur = 's1', seen = new Set(), steps = 0;
while (cur && steps++ < 100 && !seen.has(cur)) {
  seen.add(cur);
  const n = N[cur];
  if (!n) { console.log(`  [${steps}] ❌ 断裂 ${cur} 不存在`); break; }
  const label = (n.text||n.title||'').slice(0,30) || '<无文本>';
  const media = n.media ? (n.media.kind + ':' + (n.media.label||n.media.file||'').slice(-24)) : '-';
  console.log(`  [${String(steps).padStart(3)}] ${cur.padEnd(24)} ${(n.speaker||n.type||'').padEnd(8)} ${label.padEnd(30)} media:${media}`);
  const nx = nextsOf(n);
  cur = nx[0];
  if (!cur && n.type !== 'end' && !/^BE_/.test(cur||'')) { console.log(`     ⚠️ 无下一步且非 end/BE`); break; }
}

// ⑨ choice 无 image 无 video（纯文字选项，缺场景感）
console.log('\n═════ 【无媒体 choice】纯文字选项无图无视频 ═════');
let cntNoMedia = 0;
ids.forEach(id => {
  const n = N[id];
  if (n.type === 'choice' && !n.media && cntNoMedia < 30) {
    const opts = (n.options||[]).map(o => o && o.text ? o.text.slice(0,15) : '?').join(' | ');
    console.log(`  ${id.padEnd(28)} title:${(n.title||'-').slice(0,20)} opts:${opts.slice(0,60)}`);
    cntNoMedia++;
  }
});
if (cntNoMedia >= 30) console.log(`  ... (仅列前 30 条，还有更多)`);
