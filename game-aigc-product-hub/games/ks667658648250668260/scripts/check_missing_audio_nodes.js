// 查 11 个缺音节点的图状态
global.window = {};
require('../js/story.js');
const NODES = window.STORY.nodes || window.STORY;
const ids = ['r_f1_d','r_haggle_d2','e2s4','r_side05_e2_bridge','r_side06_e2_bridge','r_e2_cloth_red','r_e2_cloth_qipao','r_f2_b','e4s2','e4s5','e4s7'];
ids.forEach(id => {
  const n = NODES[id];
  if (!n) { console.log(id, '❌ 节点不存在'); return; }
  const m = n.media || {};
  console.log(id.padEnd(24), '| kind:', (m.kind||'-').padEnd(6), '| file:', (m.file||'-').slice(0,60), '| speaker:', n.speaker||'-', '| text:', (n.text||'').slice(0,40));
});
