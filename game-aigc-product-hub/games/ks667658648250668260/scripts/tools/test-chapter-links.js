const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const root = path.resolve(__dirname, '../..');
const chapters = JSON.parse(fs.readFileSync(path.join(root, 'content/meta.json'))).meta.homeChapters;
const nodes = {};
for (const name of fs.readdirSync(path.join(root, 'content/episodes'))) {
  if (name.endsWith('.json')) Object.assign(nodes, JSON.parse(fs.readFileSync(path.join(root, 'content/episodes', name))));
}
const order = new Map(chapters.map((c, index) => [c.id, index]));
let crossings = 0;
for (const [id, node] of Object.entries(nodes)) {
  for (const next of [node.next, ...(node.options || []).map(option => option.next)].filter(Boolean)) {
    assert(nodes[next], id + ' has missing destination ' + next);
    if (!order.has(node.ep) || !order.has(nodes[next].ep) || node.ep === nodes[next].ep) continue;
    assert.equal(order.get(nodes[next].ep), order.get(node.ep) + 1, id + ' crosses into an unrelated chapter');
    crossings++;
  }
}
assert(crossings >= 8, 'every main chapter transition remains reachable');
assert.equal(nodes.k_side_gate2.options[1].next, 'k_side_dress_e3');
assert.equal(nodes.f_dress_a_e3.next, chapters[3].start);
assert.equal(nodes.k_side_dress.ep, 'EP02', 'post-skill bonus branch moves with the second chapter');
for (const chapter of chapters) assert.equal(nodes[chapter.start].ep, chapter.id);
console.log('PASS: all story destinations exist, cross-chapter paths move forward once, EP03 outfit isolation, and every chapter starts in its own episode');
