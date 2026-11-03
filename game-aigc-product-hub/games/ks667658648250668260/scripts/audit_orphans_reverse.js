// 反查孤儿的「应该入口」：找出可能本该跳到孤儿节点的父节点
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

const orphans = [
  'r_haggle_d', 'r_haggle_d2', 'r_haggle_d3', 's_stone_video', 's_stone',
  'r_side05_e2_bridge', 'r_side06_e2_bridge',
  'r_f3_3', 'r_f3_4'
];

// 每个孤儿：找 id 相近的可达兄弟（如 r_haggle_a/b/c 都有，d 是孤儿）
function siblings(orphan) {
  // r_haggle_d → 前缀 r_haggle_ ，兄弟 r_haggle_a/b/c
  const m = orphan.match(/^(.+?)_([a-z]|\d+)$/);
  if (!m) return [];
  const prefix = m[1] + '_';
  return ids.filter(id => id !== orphan && id.startsWith(prefix) && !/^r_haggle_d/.test(id));
}

// 反查：谁指向兄弟 —— 但没指向孤儿？
console.log('═════════════ 孤儿反查报告 ═════════════\n');

orphans.forEach(o => {
  console.log(`\n▸ 孤儿 [${o}]`);
  const n = N[o];
  console.log(`  · 内容: text="${(n.text||'').slice(0,50)}" media=${(n.media&&n.media.kind)||'-'} next=${n.next||'-'}`);
  const sibs = siblings(o);
  console.log(`  · 兄弟节点(同前缀): ${sibs.join(', ') || '(无)'}`);

  // 找所有指向兄弟的父节点
  const parentEntries = [];
  ids.forEach(id => {
    const p = N[id];
    if (!p) return;
    const ops = Array.isArray(p.options) ? p.options : [];
    ops.forEach((opt, i) => {
      if (opt && sibs.includes(opt.next)) {
        parentEntries.push({ parent: id, idx: i, text: opt.text, targets: opt.next });
      }
    });
    if (sibs.includes(p.next)) {
      parentEntries.push({ parent: id, idx: 'next', text: '', targets: p.next });
    }
  });
  // 精简同一 parent
  const grouped = {};
  parentEntries.forEach(p => {
    grouped[p.parent] = grouped[p.parent] || [];
    grouped[p.parent].push(p);
  });
  const pids = Object.keys(grouped);
  if (pids.length) {
    console.log(`  · 兄弟节点的父入口（推测应该也有个 option 指向 ${o}）：`);
    pids.forEach(pid => {
      const parent = N[pid];
      console.log(`      父 [${pid}] 有 ${(parent.options||[]).length} 个选项:`);
      (parent.options||[]).forEach((opt, i) => {
        console.log(`        [${i}] "${(opt.text||'').slice(0,25).padEnd(25)}" → ${opt.next}`);
      });
    });
  } else {
    console.log(`  · ⚠️ 找不到指向任何兄弟节点的父入口（可能整块支线都被删了）`);
  }
});
