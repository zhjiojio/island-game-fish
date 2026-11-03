/**
 * data/mock-levels-config.js — 本地 Mock 关卡配置（仅供离线开发调试使用）
 * 职责：
 *   - 提供一份字段结构与远程 levels-config-v3.json（详见架构文档 §2.5）完全一致
 *     的最小样例配置
 *   - 覆盖 4 种内置玩法模式（hidden/spot/hunt/story）各 1 关，新增玩法时可在
 *     此追加一关，不依赖生产 CDN 即可本地跑通全流程
 *   - 图片资源全部复用本地 assets/ 下已有素材，零外部网络依赖
 * 启用方式：
 *   在 core/config.js 中把 CONFIG.USE_MOCK_CONFIG 设为 true，
 *   RemoteConfig.load() 会跳过远程请求直接使用此数据（生产环境务必保持 false）。
 * 依赖：无
 * 导出：window.MOCK_LEVELS_CONFIG
 */
(function () {
  'use strict';

  // RemoteConfig._parse 要求 theme.cover 必须以 http 开头才会被保留（生产规则），
  // mock 场景下用当前页面 origin 拼出一个可访问的本地地址来满足该校验。
  var origin = (typeof location !== 'undefined' && location.origin) ? location.origin : 'http://localhost:8080';
  var mockCover = origin + '/assets/Image/global_bg.png';

  window.MOCK_LEVELS_CONFIG = {
    version: 'mock-1',
    hiddenIdxRanges: [],

    props: {
      demo_item: { emoji: '🔍', name: '示例道具' }
    },

    tauntLines: ['再仔细看看！', '差一点就找到了！'],

    themes: [
      {
        id: 900001,
        subject: 'Mock 主题',
        short: 'Mock 主题',
        full: '本地调试用主题（4 种内置玩法各 1 关）',
        mode: 'hidden',
        cover: mockCover,
        completeImage: mockCover,
        unlockBy: 'free',
        unlocked: true,
        dailyUnlock: false,
        comingsoon: false,
        stars: 3
      }
    ],

    levels: [
      {
        themeId: 900001, idx: 1, title: 'Mock · 找茬', mode: 'hidden',
        duration: 60, hint: '本地 mock 关卡（单图找茬）', boss: false,
        scene: 'assets/Image/global_bg.png',
        odds: [
          { prop: 'demo_item', x: 10, y: 10, w: 20, h: 20, tag: '示例目标A' },
          { prop: 'demo_item', x: 60, y: 50, w: 15, h: 15, tag: '示例目标B' }
        ]
      },
      {
        themeId: 900001, idx: 2, title: 'Mock · 找不同', mode: 'spot',
        duration: 60, hint: '本地 mock 关卡（双图找不同）', boss: false,
        sceneA: 'assets/Image/global_bg.png',
        sceneB: 'assets/Image/global_bg.png',
        layout: 'h',
        odds: [
          { prop: 'demo_item', x: 30, y: 30, w: 15, h: 15, clue: '注意左上角', tag: '示例不同点' }
        ]
      },
      {
        themeId: 900001, idx: 3, title: 'Mock · 寻物', mode: 'hunt',
        duration: 60, hint: '本地 mock 关卡（寻物清单）', boss: false,
        scene: 'assets/Image/global_bg.png',
        odds: [
          { prop: 'demo_item', x: 45, y: 45, w: 15, h: 15, tag: '示例道具' }
        ]
      },
      {
        themeId: 900001, idx: 4, title: 'Mock · 剧情', mode: 'story',
        duration: 60, hint: '本地 mock 关卡（剧情找线索）', boss: false, bossStage: 0,
        scene: 'assets/Image/global_bg.png',
        intro: {
          chapterTitle: '第 0 章 · Mock',
          title: '案件简报',
          body: '这是本地 mock 剧情简报，用于离线调试 story 模式。',
          sectionTitle: '本关调查方向',
          goals: ['观察画面细节', '找到隐藏线索'],
          buttonText: '开始找线索'
        },
        odds: [
          { prop: 'demo_item', x: 50, y: 50, w: 20, h: 20, tag: '线索', narrative: '发现了一条线索！' }
        ],
        epilogue: '案件已了结，感谢配合调查。',
        epilogueTag: 'Mock'
      },
      {
        themeId: 900001, idx: 5, title: 'Mock · 拼图', mode: 'puzzle',
        duration: 120, hint: '把下方元素拖到线稿对应的位置上', boss: false,
        scenes: [
          {
            id: 'scene_001',
            scene: 'assets/Image/global_bg.png',
            odds: [
              { id: 'piece_a', tag: '拼图 A', scene: 'assets/Image/global_bg.png', result: 'assets/Image/global_bg.png', thumbnail: 'assets/Image/global_bg.png', x: 10, y: 15, w: 25, h: 20, zIndex: 1 },
              { id: 'piece_b', tag: '拼图 B', scene: 'assets/Image/global_bg.png', result: 'assets/Image/global_bg.png', x: 55, y: 35, w: 20, h: 25, zIndex: 1 }
            ]
          },
          {
            id: 'scene_002',
            scene: 'assets/Image/global_bg.png',
            odds: [
              { id: 'piece_c', tag: '拼图 C', scene: 'assets/Image/global_bg.png', result: 'assets/Image/global_bg.png', thumbnail: 'assets/Image/global_bg.png', x: 25, y: 68, w: 18, h: 18, zIndex: 2 }
            ]
          }
        ]
      }
    ]
  };
})();
