#!/usr/bin/env node
/**
 * 成就卡「看广告 · 直通该章」目标一致性回归测试
 * ------------------------------------------------------------------
 * 背景：v90.20 之前 achievements.js 里的 chapter / jump 是手写的，
 *       与 nodeUnlockMap 的真实解锁位置对不上（11 张卡有 6 张章节写错），
 *       导致用户看完广告被送到错误的章节。v90.21 起改为构建期推导。
 * 本测试守住三条红线：
 *   ① CARD_JUMP_MAP 覆盖 nodeUnlockMap 里的每一张卡，且 ep 必须等于该解锁节点的真实 ep
 *   ② achievements.js 里禁止再出现手写 chapter: / jump: 字面量
 *   ③ jumpable 的卡，其 ep 必须真的出现在 meta.homeChapters 里（否则直通进不去）
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..', '..');

let failed = 0;
const ok = (m) => console.log('  ✅ ' + m);
const bad = (m) => { failed++; console.log('  ❌ ' + m); };

// —— 载入产物 ——
global.window = {};
require(path.join(REPO, 'package', 'js', 'registry.js'));
const REG = global.window.WEIHUNQI_REGISTRY;
const CARD_JUMP_MAP = REG.CARD_JUMP_MAP;
const NODE_UNLOCK_MAP = REG.NODE_UNLOCK_MAP;

// —— 载入真值源 ——
const meta = JSON.parse(fs.readFileSync(path.join(REPO, 'content', 'meta.json'), 'utf8'));
const homeChapterIds = new Set((meta.meta.homeChapters || []).map((c) => c.id));
const epDir = path.join(REPO, 'content', 'episodes');
const allNodes = {};
for (const f of fs.readdirSync(epDir).filter((x) => x.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(epDir, f), 'utf8'));
  Object.assign(allNodes, data.nodes || data);
}

console.log('\n① CARD_JUMP_MAP 与 nodeUnlockMap / 剧本 ep 一致性');
const cards = Object.entries(NODE_UNLOCK_MAP);
if (Object.keys(CARD_JUMP_MAP).length !== cards.length) {
  bad(`条目数不符：CARD_JUMP_MAP ${Object.keys(CARD_JUMP_MAP).length} vs nodeUnlockMap ${cards.length}`);
} else ok(`条目数一致（${cards.length} 张卡）`);

for (const [nodeId, cardId] of cards) {
  const t = CARD_JUMP_MAP[cardId];
  if (!t) { bad(`${cardId} 缺失直通目标`); continue; }
  const node = allNodes[nodeId];
  if (!node) { bad(`${cardId} 的解锁节点 ${nodeId} 在剧本中不存在`); continue; }
  if (t.node !== nodeId) bad(`${cardId} 目标节点错：期望 ${nodeId}，实际 ${t.node}`);
  else if (t.ep !== node.ep) bad(`${cardId} 目标章节错：节点 ${nodeId} 实际在 ${node.ep}，却写成 ${t.ep}`);
  else ok(`${cardId} → ${t.ep}/${nodeId}${t.jumpable ? '' : '（不可直通）'}`);
}

console.log('\n② achievements.js 不得再手写 chapter / jump');
const achv = fs.readFileSync(path.join(REPO, 'package', 'js', 'achievements.js'), 'utf8');
const cardsBlock = achv.slice(achv.indexOf('var CARDS = ['), achv.indexOf('injectJumpTargets'));
if (/chapter\s*:\s*['"]EP/.test(cardsBlock)) bad('CARDS 表里仍有手写 chapter 字面量');
else ok('CARDS 表无手写 chapter');
if (/\bjump\s*:\s*\{/.test(cardsBlock)) bad('CARDS 表里仍有手写 jump 字面量');
else ok('CARDS 表无手写 jump');

console.log('\n③ jumpable 的目标章节必须在 homeChapters 中');
for (const [cardId, t] of Object.entries(CARD_JUMP_MAP)) {
  if (t.jumpable && !homeChapterIds.has(t.ep)) bad(`${cardId} 标记可直通，但 ${t.ep} 不在章节首页列表`);
  else if (!t.jumpable && homeChapterIds.has(t.ep)) bad(`${cardId} 标记不可直通，但 ${t.ep} 明明在章节首页列表`);
}
if (!failed) ok('可直通标记与章节首页列表一致');

console.log(failed ? `\n❌ ${failed} 项失败\n` : '\n✅ 全部通过\n');
process.exit(failed ? 1 : 0);
