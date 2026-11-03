// 牌型判定与压制规则测试。rules.js 逻辑密度高（飞机带牌、连对边界、chainLength 比较），
// 是最容易在重构中被静默改坏的地方，这里锁定行为基线。
const test = require('node:test');
const assert = require('node:assert');
const { analyzePlay, canBeat, isMultiplierPlay } = require('../rules');

// 便捷构造：c(3,3,3) -> 三张 3
let seq = 0;
const SUITS = ['spades', 'hearts', 'clubs', 'diamonds'];
function c (...ranks) {
  return ranks.map((r, i) => ({ id: `card-${r}-${seq++}`, suit: SUITS[i % 4], rank: r, label: String(r) }));
}
const type = (...ranks) => {
  const play = analyzePlay(c(...ranks));
  return play ? play.type : null;   // 区分「无法识别」与「字段缺失」
};

test('空输入返回 null', () => {
  assert.strictEqual(analyzePlay([]), null);
  assert.strictEqual(analyzePlay(null), null);
});

test('基础牌型识别', () => {
  assert.strictEqual(type(5), 'single');
  assert.strictEqual(type(5, 5), 'pair');
  assert.strictEqual(type(5, 5, 5), 'triple');
  assert.strictEqual(type(5, 5, 5, 8), 'triple-single');
  assert.strictEqual(type(5, 5, 5, 8, 8), 'triple-pair');
  assert.strictEqual(type(5, 5, 5, 5), 'bomb');
  assert.strictEqual(type(16, 17), 'rocket');
});

test('顺子：至少 5 张、不得跨 2 和王', () => {
  assert.strictEqual(type(3, 4, 5, 6, 7), 'straight');
  assert.strictEqual(type(3, 4, 5, 6), null, '4 张不构成顺子');
  assert.strictEqual(type(11, 12, 13, 14, 15), null, '不能包含 2(rank15)');
  assert.strictEqual(type(13, 14, 15, 16, 17), null, '不能包含王');
});

test('连对：至少 3 对且连续', () => {
  assert.strictEqual(type(3, 3, 4, 4, 5, 5), 'pair-straight');
  assert.strictEqual(type(3, 3, 4, 4), null, '2 对不构成连对');
  assert.strictEqual(type(3, 3, 5, 5, 6, 6), null, '不连续不构成连对');
  assert.strictEqual(type(14, 14, 15, 15, 16, 16), null, '不能包含 2/王');
});

test('飞机及其带牌', () => {
  assert.strictEqual(type(5, 5, 5, 6, 6, 6), 'airplane');
  assert.strictEqual(type(5, 5, 5, 6, 6, 6, 8, 9), 'airplane-singles');
  assert.strictEqual(type(5, 5, 5, 6, 6, 6, 8, 8, 9, 9), 'airplane-pairs');
  assert.strictEqual(type(5, 5, 5, 7, 7, 7), null, '三张不连续不是飞机');
});

test('四带二', () => {
  assert.strictEqual(type(5, 5, 5, 5, 8, 9), 'four-two-singles');
  assert.strictEqual(type(5, 5, 5, 5, 8, 8, 9, 9), 'four-two-pairs');
});

test('canBeat：同类型比大小', () => {
  const small = analyzePlay(c(5));
  const big = analyzePlay(c(9));
  assert.ok(canBeat(big, small));
  assert.ok(!canBeat(small, big));
  assert.ok(!canBeat(small, small), '同点数不能压');
});

test('canBeat：无前手时任意牌型可出', () => {
  assert.ok(canBeat(analyzePlay(c(3)), null));
});

test('canBeat：炸弹压普通牌，火箭压一切', () => {
  const pair = analyzePlay(c(15, 15));
  const bomb = analyzePlay(c(3, 3, 3, 3));
  const rocket = analyzePlay(c(16, 17));
  assert.ok(canBeat(bomb, pair), '炸弹压对子');
  assert.ok(!canBeat(pair, bomb), '对子压不了炸弹');
  assert.ok(canBeat(rocket, bomb), '火箭压炸弹');
  assert.ok(!canBeat(bomb, rocket), '炸弹压不了火箭');
  assert.ok(!canBeat(rocket, rocket), '火箭不能压火箭');
});

test('canBeat：炸弹之间比点数', () => {
  const b3 = analyzePlay(c(3, 3, 3, 3));
  const b9 = analyzePlay(c(9, 9, 9, 9));
  assert.ok(canBeat(b9, b3));
  assert.ok(!canBeat(b3, b9));
});

test('canBeat：不同类型不可互压', () => {
  assert.ok(!canBeat(analyzePlay(c(9, 9)), analyzePlay(c(5))), '对子不能压单张');
});

test('canBeat：长度与链长必须一致', () => {
  const s5 = analyzePlay(c(3, 4, 5, 6, 7));
  const s6 = analyzePlay(c(4, 5, 6, 7, 8, 9));
  assert.ok(!canBeat(s6, s5), '6 张顺子不能压 5 张顺子');
  const s5b = analyzePlay(c(5, 6, 7, 8, 9));
  assert.ok(canBeat(s5b, s5), '等长顺子比最大牌');
});

test('isMultiplierPlay 仅炸弹与火箭翻倍', () => {
  assert.ok(isMultiplierPlay(analyzePlay(c(3, 3, 3, 3))));
  assert.ok(isMultiplierPlay(analyzePlay(c(16, 17))));
  assert.ok(!isMultiplierPlay(analyzePlay(c(3))));
  assert.ok(!isMultiplierPlay(analyzePlay(c(3, 4, 5, 6, 7))));
});

test('非法组合返回 null', () => {
  assert.strictEqual(type(3, 4), null);
  assert.strictEqual(type(3, 3, 4), null);
  assert.strictEqual(type(3, 4, 5, 6, 8), null, '断口不成顺');
});
