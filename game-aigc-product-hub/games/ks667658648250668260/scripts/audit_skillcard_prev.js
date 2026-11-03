#!/usr/bin/env node
/**
 * scripts/audit_skillcard_prev.js
 * -------------------------------
 * 铁律 34（v72.12 · 2026-08-10 lihui26 钉死）：
 *   kind:"skillcard" 节点前一节点必须有 media.kind === 'video' | 'image'
 *   禁止 skillcard 前一节点是纯文字（无 media），否则技能弹卡瞬间干飘、观感尴尬
 *
 * 用法：node scripts/audit_skillcard_prev.js
 * 退出码：0 = 全绿；1 = 有裸文字 → skillcard 违规
 */
const fs = require('fs');
const path = require('path');
global.window = global;
const storyCode = fs.readFileSync(path.resolve(__dirname, '../js/story.js'), 'utf8');
eval(storyCode);
const NODES = (window.STORY && window.STORY.nodes) || {};

// 建反向索引：node.next -> [prevId1, prevId2, ...]
const revIdx = {};
for (const id in NODES) {
  const n = NODES[id];
  if (!n) continue;
  const nexts = [];
  if (n.next) nexts.push(n.next);
  if (Array.isArray(n.options)) {
    n.options.forEach(o => { if (o && o.next) nexts.push(o.next); });
  }
  nexts.forEach(nx => { (revIdx[nx] = revIdx[nx] || []).push(id); });
}

const violations = [];
for (const id in NODES) {
  const n = NODES[id];
  if (!n || !n.media || n.media.kind !== 'skillcard') continue;
  const prevs = revIdx[id] || [];
  if (prevs.length === 0) {
    violations.push({ id, reason: '孤儿 skillcard（无任何节点 next→此）', prev: '(none)' });
    continue;
  }
  prevs.forEach(pid => {
    const p = NODES[pid];
    const okKind = p && p.media && (p.media.kind === 'video' || p.media.kind === 'image');
    if (!okKind) {
      violations.push({
        id, prev: pid,
        reason: '前置节点无 media.video/image · 裸文字接 skillcard'
      });
    }
  });
}

if (violations.length === 0) {
  console.log('✅ skillcard 前置节点审计通过（' +
    Object.keys(NODES).filter(k => NODES[k].media && NODES[k].media.kind === 'skillcard').length +
    ' 张 skillcard 全部有视频/图片过场）');
  process.exit(0);
}

console.error('❌ skillcard 前置节点审计未通过（铁律 34）');
violations.forEach(v => {
  console.error(`  · [${v.id}]  prev=${v.prev}  ${v.reason}`);
});
console.error('\n修复建议：在 skillcard 前插入一个 media:{kind:"video"|"image"} 的过场节点');
process.exit(1);
