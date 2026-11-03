'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
global.window = global;
global.KwaiStorage = { getSync() {}, setSync() {} };
global.console.touch = function () {};
function load(file) { vm.runInThisContext(fs.readFileSync(path.join(root, file), 'utf8'), { filename: file }); }
[
  'package/js/m3-init.js',
  'package/js/play/neutral-config.js',
  'package/js/play/config-validator.js',
  'package/js/play/runtime-config.js',
  'package/js/play/save-data.js',
  'package/js/play/deck.js',
  'package/js/play/progression.js',
  'package/js/play/bonds.js',
  'package/js/play/world-map.js',
  'package/js/play/board.js',
  'package/js/play/combat.js'
].forEach(load);

test('neutral manifest and level pass schema validation', () => {
  assert.equal(M3.ConfigValidator.validateManifest(M3.NeutralConfig.manifest).ok, true);
  assert.equal(M3.ConfigValidator.validateLevel(M3.NeutralConfig.levels['neutral-level-1']).ok, true);
});

test('missing remote configuration starts with a complete playable fallback', async () => {
  await new Promise(resolve => M3.RuntimeConfig.init(resolve));
  const manifest = M3.RuntimeConfig.getManifest();
  const cards = M3.Deck.allowedCards(manifest);
  assert.equal(M3.RuntimeConfig.getSource(), 'fallback');
  assert.ok(cards.length >= manifest.deckRules.deckSize);
  assert.equal(manifest.presentation.themeId, 'coral-fantasy');
  assert.equal(manifest.presentation.copy.homeTitle, '珊瑚防线');
  assert.ok(Array.isArray(manifest.presentation.colors.background));
  assert.ok(cards.every(card => card.displayName && card.uiName && Array.isArray(card.color) && card.symbol && card.appearance && card.appearance.bodyShape && card.appearance.accessory));
  assert.equal(M3.ConfigValidator.validateLevel(M3.RuntimeConfig.getLevel(manifest.worldMap.nodes[0].levelId)).ok, true);
  assert.ok(M3.RuntimeConfig.getLevel(manifest.worldMap.nodes[0].levelId).units.every(unit => Array.isArray(unit.color) && unit.appearance && unit.appearance.bodyShape));
  assert.ok(M3.RuntimeConfig.getLevel(manifest.worldMap.nodes[0].levelId).map.presentation.style.routeMarkerColor);
  assert.equal(M3.RuntimeConfig.getLevel(manifest.worldMap.nodes[0].levelId).uiName, '珊瑚前哨1');
});

test('manifest with fewer playable roles than deck size is rejected for fallback', () => {
  const manifest = Object.assign({}, M3.NeutralConfig.manifest, {
    cards: M3.NeutralConfig.manifest.cards.slice(0, 2)
  });
  const validation = M3.ConfigValidator.validateManifest(manifest);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('cards.playableCount'));
});

test('player deterministically selects exactly five distinct cards', () => {
  const manifest = M3.NeutralConfig.manifest;
  const deck = M3.Deck.defaultDeck(manifest);
  assert.equal(deck.length, 5);
  assert.equal(M3.Deck.validate(manifest, deck).ok, true);
  assert.equal(M3.Deck.validate(manifest, deck.slice(0, 4)).reason, 'size');
  assert.equal(M3.Deck.validate(manifest, [deck[0], deck[0], deck[1], deck[2], deck[3]]).reason, 'duplicate');
});

test('configured card roster can exceed one selection page', () => {
  const cards = Array.from({ length: 13 }, (_, index) => ({ id: `dynamic-card-${index + 1}`, unitId: 'unit-basic', unlocked: true }));
  const manifest = Object.assign({}, M3.NeutralConfig.manifest, { cards });
  assert.equal(M3.Deck.allowedCards(manifest).length, 13);
  assert.equal(M3.Deck.pageCount(cards, 6), 3);
  assert.deepEqual(M3.Deck.page(cards, 1, 6).map(card => card.id), cards.slice(6, 12).map(card => card.id));
  assert.equal(M3.Deck.page(cards, 2, 6).length, 1);
  assert.equal(M3.Deck.defaultDeck(manifest).length, manifest.deckRules.deckSize);
});

test('bond effects are derived from selected-card tags', () => {
  const result = M3.Bonds.evaluate(M3.NeutralConfig.manifest, ['card-1','card-5','card-2','card-3','card-4']);
  assert.deepEqual(result.active, ['bond-rapid']);
  assert.equal(result.effects.attackSpeedMultiplier, 0.9);
});

test('world map exposes every configured level without a display cap', () => {
  M3.SaveData.load();
  const nodes = M3.WorldMap.nodes(M3.NeutralConfig.manifest);
  assert.equal(nodes.length, 8);
  assert.ok(nodes.every(node => node.unlocked));
  const expanded = JSON.parse(JSON.stringify(M3.NeutralConfig.manifest));
  expanded.worldMap.nodes = Array.from({ length: 37 }, (_, index) => ({ id: `level-${index + 1}`, levelId: 'neutral-level-1' }));
  assert.equal(M3.ConfigValidator.validateManifest(expanded).ok, true);
  assert.equal(M3.WorldMap.nodes(expanded).length, 37);
});

test('combat accepts only selected cards and supports deployment', async () => {
  M3.SaveData.load();
  await new Promise(resolve => M3.RuntimeConfig.init(resolve));
  const manifest = M3.RuntimeConfig.getManifest();
  const level = M3.RuntimeConfig.getLevel('neutral-level-1');
  const deck = M3.Deck.defaultDeck(manifest);
  const combat = M3.Combat.create(level, manifest, deck);
  const before = combat.gold;
  assert.equal(combat.actOnCell(0, 0), true);
  assert.equal(combat.towers.length, 1);
  assert.ok(combat.gold < before);
  assert.ok(combat.view().unitAppearances['tower-1'].accessory);
  assert.equal(combat.view().cardCosts[deck[0]], level.units.find(unit => unit.id === 'tower-1').buildCost);
  assert.equal(combat.actOnCell(0, 0), true);
  const upgrade = combat.selectedTowerInfo();
  assert.equal(upgrade.level, 1);
  assert.ok(upgrade.cost > 0);
  assert.equal(combat.upgradeSelected(), true);
  assert.equal(combat.selectedTowerInfo().level, 2);
});

test('out-of-game upgrades use configured material costs', () => {
  M3.SaveData.reset();
  M3.SaveData.get().materials = 100;
  const manifest = M3.NeutralConfig.manifest;
  const cost = M3.Progression.upgradeCost(manifest, 'card-1');
  assert.equal(cost, manifest.progression.baseUpgradeCost);
  assert.equal(M3.Progression.upgrade(manifest, 'card-1'), true);
  assert.equal(M3.Progression.cardLevel('card-1'), 2);
  assert.equal(M3.SaveData.get().materials, 100 - cost);
});
