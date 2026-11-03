// [NOTE] No reference code used. Designed from idea.md + scaffold spec.
(function () {
  var M3 = window.M3;

  function makeTiles() {
    var tiles = [], x, y;
    for (y = 0; y < 8; y += 1) {
      for (x = 0; x < 10; x += 1) tiles.push('buildable');
    }
    for (x = 0; x < 10; x += 1) tiles[5 * 10 + x] = 'road';
    for (y = 0; y <= 5; y += 1) tiles[y * 10 + 8] = 'road';
    tiles[5 * 10] = 'spawn';
    tiles[8] = 'goal';
    tiles[2 * 10 + 2] = 'obstacle';
    tiles[3 * 10 + 5] = 'obstacle';
    return tiles;
  }

  var units = [
    { id: 'tower-1', prototype: 'arrow', enabled: true, attack: 18, range: 2.5, interval: 0.9, levelCap: 3, growth: 1.25, buildCost: 55, upgradeCost: 45, skill: 'none', displayName: '潮刃卫士', color: [0.18,0.72,0.86], imageAsset: '', soundAsset: '' },
    { id: 'tower-2', prototype: 'arrow', enabled: true, attack: 31, range: 3.2, interval: 1.4, levelCap: 3, growth: 1.25, buildCost: 80, upgradeCost: 60, skill: 'none', displayName: '赤礁射手', color: [0.94,0.42,0.32], imageAsset: '', soundAsset: '' },
    { id: 'tower-3', prototype: 'frost', enabled: true, attack: 12, range: 2.4, interval: 1.1, levelCap: 3, growth: 1.2, buildCost: 70, upgradeCost: 55, skill: 'slow', skillPower: 0.35, skillDuration: 1.5, displayName: '冰潮术士', color: [0.32,0.78,0.92], imageAsset: '', soundAsset: '' },
    { id: 'tower-4', prototype: 'ranger', enabled: true, attack: 16, range: 2.2, interval: 1.2, levelCap: 3, growth: 1.22, buildCost: 90, upgradeCost: 70, skill: 'splash', skillPower: 0.55, displayName: '星珊瑚法师', color: [0.78,0.42,0.88], imageAsset: '', soundAsset: '' },
    { id: 'tower-5', prototype: 'arrow', enabled: true, attack: 9, range: 2.0, interval: 0.45, levelCap: 3, growth: 1.18, buildCost: 65, upgradeCost: 50, skill: 'none', displayName: '海风游侠', color: [0.26,0.86,0.58], imageAsset: '', soundAsset: '' },
    { id: 'tower-6', prototype: 'frost', enabled: true, attack: 24, range: 2.8, interval: 1.8, levelCap: 3, growth: 1.3, buildCost: 105, upgradeCost: 80, skill: 'slow', skillPower: 0.5, skillDuration: 1.0, displayName: '深蓝祭司', color: [0.34,0.52,0.96], imageAsset: '', soundAsset: '' },
    { id: 'enemy-1', prototype: 'slime', enabled: true, hp: 80, defense: 0, speed: 1.0, killReward: 10, displayName: '浊潮水滴', color: [0.92,0.28,0.38], imageAsset: '', soundAsset: '' },
    { id: 'enemy-2', prototype: 'slime', enabled: true, hp: 145, defense: 3, speed: 0.75, killReward: 16, displayName: '暗流甲兽', color: [0.76,0.24,0.46], imageAsset: '', soundAsset: '' },
    { id: 'enemy-3', prototype: 'golem', enabled: true, hp: 480, defense: 7, speed: 0.55, killReward: 60, displayName: '沉渊巨像', color: [0.58,0.18,0.36], imageAsset: '', soundAsset: '' }
  ];

  var level = {
    name: '珊瑚前哨', uiName: '珊瑚前哨', description: '守住最后的珊瑚礁', objective: '坚持3波攻击', revision: 1, status: 'published', delivery: 'embedded-fallback',
    schemaVersion: 5, template: 'fixed-path-v1',
    map: {
      width: 10, height: 8, theme: 'coral-fantasy', backgroundAsset: '', tiles: makeTiles(), speedMultiplier: 0.65,
      presentation: { groundColor: [0.08,0.30,0.31], routeColor: [0.34,0.48,0.48], obstacleColor: [0.72,0.36,0.28], waterColor: [0.03,0.13,0.22] },
      tileAssets: { grass: '', road: '', spawn: '', goal: '', obstacle: '', buildable: '', speed: '' },
      obstacles: { clearable: true, clearCost: 25, afterClear: 'buildable' },
      path: [{x:0,y:5},{x:1,y:5},{x:2,y:5},{x:3,y:5},{x:4,y:5},{x:5,y:5},{x:6,y:5},{x:7,y:5},{x:8,y:5},{x:8,y:4},{x:8,y:3},{x:8,y:2},{x:8,y:1},{x:8,y:0}]
    },
    units: units,
    economy: { initialGold: 240, baseHp: 20, regenRate: 1, resourceCap: 1000 },
    waves: [
      { id: 'wave-1', groups: [{ id: 'group-1', enemy: 'enemy-1', count: 8, delay: 0, interval: 1.0 }] },
      { id: 'wave-2', groups: [{ id: 'group-2', enemy: 'enemy-1', count: 10, delay: 0, interval: 0.75 }, { id: 'group-3', enemy: 'enemy-2', count: 4, delay: 2, interval: 1.3 }] },
      { id: 'wave-3', groups: [{ id: 'group-4', enemy: 'enemy-3', count: 1, delay: 0, interval: 1 }] }
    ],
    audio: { musicAsset: '', victoryAsset: '' },
    waveExecution: { startRule: 'after_previous_cleared', groupTiming: 'relative_to_wave_start', firstSpawn: 'at_group_delay' },
    requiredCapabilities: ['dynamic_wave_groups','fixed_path','buildable_cells','character_ids_and_wave_references','static_character_images','attack_or_death_audio','clear_obstacles_to_build'],
    assetManifest: []
  };

  var fallbackLevels = {}, fallbackLevelRefs = {}, fallbackNodes = [], fallbackIndex, fallbackLevel;
  for (fallbackIndex = 1; fallbackIndex <= 8; fallbackIndex += 1) {
    fallbackLevel = JSON.parse(JSON.stringify(level));
    fallbackLevel.name = '珊瑚前哨' + fallbackIndex;
    fallbackLevel.uiName = '珊瑚前哨' + fallbackIndex;
    fallbackLevel.revision = fallbackIndex;
    fallbackLevels['neutral-level-' + fallbackIndex] = fallbackLevel;
    fallbackLevelRefs['neutral-level-' + fallbackIndex] = { embedded: true, revision: fallbackIndex };
    fallbackNodes.push({ id: 'level-' + fallbackIndex, x: 0.5, y: fallbackIndex / 9, levelId: 'neutral-level-' + fallbackIndex, displayName: '珊瑚前哨' + fallbackIndex, description: '守住最后的珊瑚礁', prerequisites: [], minStars: 0, minPlayerLevel: 1 });
  }

  M3.NeutralConfig = {
    manifest: {
      schemaVersion: 1, revision: 1, gameId: 'ks0987654321',
      presentation: {
        themeId: 'coral-fantasy', displayName: '珊瑚防线',
        copy: { homeTitle: '珊瑚防线', homeSubtitle: '守护最后的珊瑚礁', homeAction: '进入潮汐地图', mapTitle: '潮汐战图', mapSubtitle: '选择珊瑚前哨', mapUpgrade: '角色升级', detailBack: '返回', detailAction: '选择五名守卫', deckTitle: '选择五名守卫', deckHint: '点击卡牌组建队伍', progressionTitle: '角色升级', progressionMaterial: '材料', progressionCost: '升级花费', purchaseCost: '购买花费', battleGold: '珍珠', battleLife: '珊瑚礁', resultWin: '守护成功', resultLose: '前哨失守', resultAction: '返回地图' },
        sceneAssets: { homeBackground: '', worldMapBackground: '', levelBackground: '', battleBackground: '' },
        colors: { background: [0.025,0.10,0.17], panel: [0.07,0.24,0.29], primary: [0.16,0.72,0.70], accent: [0.96,0.48,0.36], success: [0.20,0.76,0.48], disabled: [0.24,0.30,0.34], frame: [0.72,0.96,0.91], route: [0.34,0.48,0.48], ground: [0.08,0.30,0.31], obstacle: [0.72,0.36,0.28], enemy: [0.92,0.28,0.38], health: [0.28,0.94,0.46], gold: [1.0,0.82,0.28] },
        rolePalette: [[0.18,0.72,0.86],[0.94,0.42,0.32],[0.32,0.78,0.92],[0.78,0.42,0.88],[0.26,0.86,0.58],[0.34,0.52,0.96]],
        enemyPalette: [[0.92,0.28,0.38],[0.76,0.24,0.46],[0.58,0.18,0.36]],
        mapStyle: { tileGap: 2, tileBorder: 2, tileBorderColor: [0.10,0.42,0.42], groundAccentColor: [0.12,0.38,0.34], routeInset: 0.18, routeMarkerColor: [0.62,0.76,0.70], obstacleInset: 0.20, obstacleAccentColor: [0.96,0.58,0.34], spawnColor: [0.22,0.86,0.78], goalColor: [1.0,0.72,0.30], backgroundBandColor: [0.04,0.22,0.31], backgroundBandCount: 5 },
        roleAppearances: [
          { bodyShape: 'tall', accessory: 'blade', bodyScaleX: 0.56, bodyScaleY: 0.72, headScale: 0.34, secondaryColor: [0.10,0.34,0.48], accentColor: [0.82,0.98,0.94] },
          { bodyShape: 'wide', accessory: 'bow', bodyScaleX: 0.70, bodyScaleY: 0.58, headScale: 0.31, secondaryColor: [0.46,0.16,0.18], accentColor: [1.0,0.78,0.34] },
          { bodyShape: 'robe', accessory: 'orb', bodyScaleX: 0.62, bodyScaleY: 0.68, headScale: 0.36, secondaryColor: [0.12,0.38,0.62], accentColor: [0.80,0.98,1.0] },
          { bodyShape: 'robe', accessory: 'staff', bodyScaleX: 0.60, bodyScaleY: 0.72, headScale: 0.34, secondaryColor: [0.36,0.16,0.54], accentColor: [1.0,0.66,0.88] },
          { bodyShape: 'light', accessory: 'fan', bodyScaleX: 0.54, bodyScaleY: 0.62, headScale: 0.30, secondaryColor: [0.10,0.42,0.32], accentColor: [0.86,1.0,0.62] },
          { bodyShape: 'tall', accessory: 'shell', bodyScaleX: 0.64, bodyScaleY: 0.74, headScale: 0.38, secondaryColor: [0.14,0.24,0.58], accentColor: [0.72,0.88,1.0] }
        ],
        enemyAppearances: [
          { bodyShape: 'blob', accessory: 'eyes', bodyScaleX: 0.72, bodyScaleY: 0.54, headScale: 0.22, secondaryColor: [0.54,0.10,0.24], accentColor: [1.0,0.72,0.82] },
          { bodyShape: 'armored', accessory: 'horns', bodyScaleX: 0.78, bodyScaleY: 0.68, headScale: 0.28, secondaryColor: [0.38,0.10,0.30], accentColor: [0.96,0.56,0.72] },
          { bodyShape: 'giant', accessory: 'crown', bodyScaleX: 0.88, bodyScaleY: 0.82, headScale: 0.34, secondaryColor: [0.24,0.08,0.22], accentColor: [0.90,0.42,0.58] }
        ]
      },
      deckRules: { deckSize: 5, allowDuplicates: false, requiredTags: [], bannedCardIds: [] },
      cards: [
        { id: 'card-1', unitId: 'tower-1', displayName: '潮刃卫士', uiName: '潮刃卫士', symbol: 1, tags: ['rapid'], color: [0.18,0.72,0.86], portraitAsset: '' },
        { id: 'card-2', unitId: 'tower-2', displayName: '赤礁射手', uiName: '赤礁射手', symbol: 2, tags: ['precision'], color: [0.94,0.42,0.32], portraitAsset: '' },
        { id: 'card-3', unitId: 'tower-3', displayName: '冰潮术士', uiName: '冰潮术士', symbol: 3, tags: ['control'], color: [0.32,0.78,0.92], portraitAsset: '' },
        { id: 'card-4', unitId: 'tower-4', displayName: '星珊瑚法师', uiName: '星珊瑚法师', symbol: 4, tags: ['area'], color: [0.78,0.42,0.88], portraitAsset: '' },
        { id: 'card-5', unitId: 'tower-5', displayName: '海风游侠', uiName: '海风游侠', symbol: 5, tags: ['rapid'], color: [0.26,0.86,0.58], portraitAsset: '' },
        { id: 'card-6', unitId: 'tower-6', displayName: '深蓝祭司', uiName: '深蓝祭司', symbol: 6, tags: ['control'], color: [0.34,0.52,0.96], portraitAsset: '' }
      ],
      progression: { maxLevel: 20, baseXp: 100, xpGrowth: 1.25, statPerLevel: 0.04, baseUpgradeCost: 25, upgradeCostGrowth: 1.35 },
      bonds: [
        { id: 'bond-rapid', tag: 'rapid', thresholds: [{ count: 2, effect: { type: 'attackSpeedMultiplier', value: 0.9 } }] },
        { id: 'bond-control', tag: 'control', thresholds: [{ count: 2, effect: { type: 'slowPowerBonus', value: 0.1 } }] }
      ],
      worldMap: { nodes: fallbackNodes },
      levels: fallbackLevelRefs, assetManifest: []
    },
    levels: fallbackLevels
  };
})();
