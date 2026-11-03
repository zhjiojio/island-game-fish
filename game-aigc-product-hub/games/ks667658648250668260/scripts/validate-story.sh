#!/bin/bash
# story.js 静态自检器 —— 谁能保证 case 是对的？就是这个脚本。
# 逻辑：把 story.js 用 Node 载入 → 遍历所有 next / options.next → 校验
#   1) 引用的目标节点是否存在
#   2) 死胡同（非 end 类型但无 next 且无 options）
#   3) 孤儿（没有任何节点指向它 · 起点 s1 除外）
#   4) 每个 ending id 是否都有 endings 表条目
#   5) options 里的 next 目标是否都存在
set -e
cd "$(dirname "$0")/.."

node - <<'NODE_EOF'
// Polyfill window
global.window = {};
require('./js/story.js');
const S = window.STORY;
if (!S) { console.error('❌ window.STORY 未定义'); process.exit(2); }

const nodes = S.nodes || {};
const endings = S.endings || {};
const ids = Object.keys(nodes);

const missing = [];   // 引用了但不存在的目标节点
const dead = [];      // 死胡同（非 end 但无出口）
const orphan = [];    // 孤儿节点
const missingEnding = []; // ending id 未在 endings 表里定义

// 建反向引用图
const incoming = {};
ids.forEach(id => incoming[id] = []);

ids.forEach(id => {
  const n = nodes[id];
  const targets = [];
  if (n.next) targets.push(n.next);
  if (Array.isArray(n.options)) n.options.forEach(o => o.next && targets.push(o.next));
  targets.forEach(t => {
    if (!nodes[t]) missing.push(`${id} -> ${t}`);
    else (incoming[t] = incoming[t] || []).push(id);
  });

  // 死胡同判定：非 end 类型 && 无 next && 无 options
  const isEnd = n.type === 'end' || n.ending;
  if (!isEnd && !n.next && (!n.options || n.options.length === 0)) {
    dead.push(id);
  }

  // ending id 校验
  if (n.ending && !endings[n.ending]) {
    missingEnding.push(`${id} -> ending:${n.ending}`);
  }
});

// 孤儿：除起点外没人指向它
const start = S.start || 's1';
ids.forEach(id => {
  if (id === start) return;
  if ((incoming[id] || []).length === 0) orphan.push(id);
});

// 统计
const endingIds = new Set();
ids.forEach(id => nodes[id].ending && endingIds.add(nodes[id].ending));

console.log('==== STORY 静态自检报告 ====');
console.log(`版本:          ${S.version}`);
console.log(`节点总数:      ${ids.length}`);
console.log(`起始节点:      ${start} ${nodes[start] ? '✓' : '✗ 不存在！'}`);
console.log(`结局节点数:    ${ids.filter(i => nodes[i].type === 'end' || nodes[i].ending).length}`);
console.log(`endings 表:    ${Object.keys(endings).length} 个 (${Object.keys(endings).sort().join(',')})`);
console.log(`实际用到的:    ${endingIds.size} 个 (${[...endingIds].sort().join(',')})`);
console.log('');
console.log(`❓ missing_refs (引用不存在的目标): ${missing.length}`);
missing.slice(0,10).forEach(x => console.log('   ' + x));
console.log(`💀 dead_ends   (死胡同非 end): ${dead.length}`);
dead.slice(0,10).forEach(x => console.log('   ' + x));
console.log(`👻 orphans     (无人指向): ${orphan.length}`);
orphan.slice(0,10).forEach(x => console.log('   ' + x));
console.log(`🎬 ending 未定义: ${missingEnding.length}`);
missingEnding.slice(0,10).forEach(x => console.log('   ' + x));

const fail = missing.length + dead.length + missingEnding.length;
if (fail > 0) {
  console.log('\n❌ 校验未通过：' + fail + ' 处问题');
  process.exit(1);
}
console.log('\n✅ 校验通过');
NODE_EOF

# v72.3 · char 字段静态审计（永久门禁）
echo ""
echo "==== char 字段静态审计 ===="
node scripts/audit_char.js || { echo "❌ char 审计未通过（见上）"; exit 1; }
echo "✅ char 审计通过"

# v72.12 · skillcard 前置节点审计（铁律 34 · 禁裸文字接 skillcard）
echo ""
echo "==== skillcard 前置节点审计（铁律 34）===="
node scripts/audit_skillcard_prev.js || { echo "❌ skillcard 前置审计未通过（铁律 34）"; exit 1; }

# v84.0 · 字幕健康度审计（防覆盖率退化）
#   历史事故：build_subtitles_js.py 只读 scripts/subtitles/output/，而人工精修
#   字幕在 content/subtitles/，两者脱节导致 42 份精修成果从没进包，
#   EP06/EP07 整集 0 条字幕。这道门禁就是那次事故的哨兵。
echo ""
echo "==== 字幕健康度审计（v84.0）===="
node scripts/tools/check-subtitles.js || { echo "❌ 字幕健康度未通过（见上）"; exit 1; }
