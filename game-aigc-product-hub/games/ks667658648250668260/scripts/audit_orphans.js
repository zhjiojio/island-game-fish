// 孤儿支线 + 走不完流程 全局审计
// 从 start 开始 BFS，列出：
//   ① 不可达节点（孤儿：从 s1 走不到）
//   ② 死胡同（有 next 但指向不存在的节点 / 无 next 且非 end/BE/HE 结局）
//   ③ 半死链（next 存在但目标节点自己也是断链）
//   ④ choice 内部 options.next 悬空
//   ⑤ 走到最后无 end 类型标记的节点

global.window = {};
require('../js/story.js');
const S = window.STORY;
const N = {};
Object.keys(S).forEach(k => {
  if (['meta','version','changelog','updatedAt','start','endings','nodes'].includes(k)) return;
  if (typeof S[k] === 'object' && S[k] && S[k].id) N[k] = S[k];
});
if (S.nodes) Object.assign(N, S.nodes);

const ids = Object.keys(N);
const total = ids.length;

function nextsOf(n) {
  const arr = [];
  if (n && n.next) arr.push(n.next);
  if (n && Array.isArray(n.options)) n.options.forEach(o => o && o.next && arr.push(o.next));
  return arr.filter(Boolean);
}

// —— ① BFS 可达集 ——
const start = S.start || 's1';
const reach = new Set();
const queue = [start];
while (queue.length) {
  const cur = queue.shift();
  if (reach.has(cur)) continue;
  reach.add(cur);
  const n = N[cur];
  if (!n) continue;
  nextsOf(n).forEach(nx => { if (!reach.has(nx)) queue.push(nx); });
}

// —— ② 孤儿（不可达）——
const orphans = ids.filter(id => !reach.has(id));

// —— ③ 悬空引用（next 指向不存在的节点）——
const danglingRefs = [];  // { from, to, via }
ids.forEach(id => {
  const n = N[id];
  if (!n) return;
  if (n.next && !N[n.next]) danglingRefs.push({ from: id, to: n.next, via: 'next' });
  if (Array.isArray(n.options)) {
    n.options.forEach((o, i) => {
      if (o && o.next && !N[o.next]) danglingRefs.push({ from: id, to: o.next, via: `options[${i}]${o.text?':"'+o.text.slice(0,12)+'"':''}` });
    });
  }
});

// —— ④ 死胡同（无 next 无 options 且非 end/BE/HE）——
const deadEnds = [];
ids.forEach(id => {
  const n = N[id];
  if (!n) return;
  const hasOut = n.next || (Array.isArray(n.options) && n.options.some(o => o && o.next));
  const isEnd = n.type === 'end' || /^(BE|HE)[_0-9]/.test(id) || /^__end/.test(id);
  if (!hasOut && !isEnd) deadEnds.push({ id, type: n.type||'-', hasText: !!n.text, media: (n.media&&n.media.kind)||'-' });
});

// —— ⑤ 从可达集里主线追踪（每次取 next 或 options[0].next），看能否走到 end/BE/HE ——
function traceFromChoice(id, opts) {
  // 每个 choice 每条 option 分别追踪
  return opts.map((o, idx) => {
    if (!o || !o.next) return { idx, opt: o&&o.text||'?', result: 'no-next' };
    let cur = o.next, seen = new Set(), steps = 0;
    while (cur && !seen.has(cur) && steps++ < 200) {
      seen.add(cur);
      const nn = N[cur];
      if (!nn) return { idx, opt: o.text||'?', result: `dangle→${cur}` };
      if (nn.type === 'end' || /^(BE|HE)[_0-9]/.test(cur)) return { idx, opt: o.text||'?', result: `→${cur}` };
      if (nn.next) { cur = nn.next; continue; }
      if (Array.isArray(nn.options) && nn.options[0] && nn.options[0].next) { cur = nn.options[0].next; continue; }
      return { idx, opt: o.text||'?', result: `dead@${cur}` };
    }
    if (seen.has(cur)) return { idx, opt: o.text||'?', result: `loop@${cur}` };
    return { idx, opt: o.text||'?', result: `overflow(200 steps)` };
  });
}

// —— ⑥ 「孤儿支线簇」：从每个孤儿 BFS，找出彼此互通的孤岛 ——
const orphanSet = new Set(orphans);
const visited = new Set();
const islands = [];
orphans.forEach(seed => {
  if (visited.has(seed)) return;
  const island = [];
  const q = [seed];
  while (q.length) {
    const c = q.shift();
    if (visited.has(c) || !orphanSet.has(c)) continue;
    visited.add(c);
    island.push(c);
    const n = N[c];
    if (n) nextsOf(n).forEach(x => { if (orphanSet.has(x) && !visited.has(x)) q.push(x); });
    // 反向也算：谁指向 c
    ids.forEach(x => {
      if (visited.has(x) || !orphanSet.has(x)) return;
      const nx = N[x];
      if (nx && nextsOf(nx).includes(c)) q.push(x);
    });
  }
  islands.push(island);
});

// —— 打印结果 ——
console.log('═'.repeat(66));
console.log(`总节点数: ${total}  可达: ${reach.size}  不可达(孤儿): ${orphans.length}`);
console.log('═'.repeat(66));

console.log('\n【① 悬空引用】next / options.next 指向不存在节点 —— 走到就 crash');
if (!danglingRefs.length) console.log('  ✅ 无');
else danglingRefs.forEach(r => console.log(`  ✗ ${r.from.padEnd(28)} --${r.via.padEnd(24)}--> ${r.to}  ⚠️ 目标不存在`));

console.log('\n【② 死胡同】无 next 无 options 且非 end/BE/HE —— 玩家卡在这个节点无法继续');
if (!deadEnds.length) console.log('  ✅ 无');
else deadEnds.forEach(d => console.log(`  ✗ ${d.id.padEnd(28)} type=${d.type} media=${d.media} hasText=${d.hasText}`));

console.log(`\n【③ 孤儿节点】从 start(${start}) 走不到 —— 数量: ${orphans.length}`);
if (!orphans.length) console.log('  ✅ 无');
else {
  console.log(`  分成 ${islands.length} 个孤岛簇（互通节点归为一簇）:`);
  islands.sort((a,b)=>b.length-a.length).forEach((isl, i) => {
    console.log(`  ─ 孤岛 #${i+1} (${isl.length} 节点):`);
    isl.slice(0, 20).forEach(id => {
      const n = N[id]; const m = n.media||{};
      console.log(`    · ${id.padEnd(30)} type=${(n.type||'-').padEnd(6)} media=${(m.kind||'-').padEnd(6)} next=${n.next||'-'}`);
    });
    if (isl.length > 20) console.log(`    ...(共 ${isl.length} 个，仅显示前 20)`);
  });
}

console.log('\n【④ choice 每选项终点追踪】每个可达 choice 的每个 option 追到 end/BE/HE 或死路');
let totalChoices = 0, badChoices = 0;
ids.forEach(id => {
  const n = N[id];
  if (!reach.has(id)) return;
  if (n.type !== 'choice' || !Array.isArray(n.options)) return;
  totalChoices++;
  const traces = traceFromChoice(id, n.options);
  const bad = traces.filter(t => /^(no-next|dangle|dead|loop|overflow)/.test(t.result));
  if (bad.length) {
    badChoices++;
    console.log(`  ✗ ${id.padEnd(28)} (${bad.length}/${traces.length} 有问题):`);
    bad.forEach(t => console.log(`      [${t.idx}] "${t.opt.slice(0,20)}" → ${t.result}`));
  }
});
if (!badChoices) console.log(`  ✅ 全部 ${totalChoices} 个 choice 的选项都能走到 end/BE/HE`);
else console.log(`  合计 ${badChoices}/${totalChoices} 个 choice 有走不完的选项`);

console.log('\n═'.repeat(66));
console.log('审计完毕');
