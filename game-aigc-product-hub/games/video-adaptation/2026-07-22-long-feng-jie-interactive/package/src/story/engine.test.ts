import { describe, expect, it } from 'vitest'
import {
  applyChoice,
  availableChoices,
  reachableEndingIds,
  validateGraph,
} from './engine'
import type { StoryGraph } from './types'

const graphFixture: StoryGraph = {
  startNodeId: 'start',
  initialStats: { trust: 0, evidence: 0, control: 0 },
  endings: ['ending-a', 'ending-b', 'ending-c'],
  nodes: {
    start: {
      id: 'start',
      title: '开始',
      chapter: '序章',
      media: { kind: 'still', src: 'start.jpg' },
      dialogue: ['选择路线。'],
      choices: [
        {
          id: 'earn-trust',
          label: '建立信任',
          hint: '',
          nextNodeId: 'fork',
          setFlags: ['trusted'],
        },
        { id: 'leave', label: '独自离开', hint: '', ending: 'ending-b' },
      ],
    },
    fork: {
      id: 'fork',
      title: '分岔',
      chapter: '终章',
      media: { kind: 'still', src: 'fork.jpg' },
      dialogue: ['信任改变了可选结局。'],
      choices: [
        {
          id: 'together',
          label: '并肩',
          hint: '',
          ending: 'ending-a',
          requiresFlags: ['trusted'],
        },
        { id: 'wait', label: '等待', hint: '', ending: 'ending-c' },
      ],
    },
    'ending-a': {
      id: 'ending-a',
      title: 'A',
      chapter: '结局',
      media: { kind: 'still', src: 'a.jpg' },
      dialogue: ['A'],
      ending: { id: 'ending-a', title: 'A', summary: 'A' },
    },
    'ending-b': {
      id: 'ending-b',
      title: 'B',
      chapter: '结局',
      media: { kind: 'still', src: 'b.jpg' },
      dialogue: ['B'],
      ending: { id: 'ending-b', title: 'B', summary: 'B' },
    },
    'ending-c': {
      id: 'ending-c',
      title: 'C',
      chapter: '结局',
      media: { kind: 'still', src: 'c.jpg' },
      dialogue: ['C'],
      ending: { id: 'ending-c', title: 'C', summary: 'C' },
    },
  },
}

describe('story engine transitions', () => {
  it('applies stat deltas and records history without mutating the prior state', () => {
    const state = {
      nodeId: 'a',
      stats: { trust: 0, evidence: 0, control: 0 },
      flags: [],
      history: [],
    }
    const choice = {
      id: 'trust',
      label: '交付信任',
      hint: '',
      nextNodeId: 'b',
      statDelta: { trust: 1 },
      setFlags: ['trusted'],
    }

    const next = applyChoice(state, choice)

    expect(next).toEqual({
      nodeId: 'b',
      stats: { trust: 1, evidence: 0, control: 0 },
      flags: ['trusted'],
      history: ['trust'],
    })
    expect(state.stats.trust).toBe(0)
  })

  it('keeps unmet choices visible but blocked', () => {
    const choices = [
      {
        id: 'truth',
        label: '公开真相',
        hint: '',
        ending: 'ending-together',
        requiresFlags: ['trusted', 'evidence-secured'],
        blockedHint: '你仍缺少信任或证据',
      },
    ]

    expect(
      availableChoices(choices, {
        stats: { trust: 1, evidence: 0, control: 0 },
        flags: ['trusted'],
      })[0],
    ).toMatchObject({
      blocked: true,
      blockedHint: '你仍缺少信任或证据',
    })
  })
})

describe('story graph validation', () => {
  it('reports a choice target that does not exist', () => {
    const broken = structuredClone(graphFixture)
    broken.nodes.start.choices![0].nextNodeId = 'missing'

    expect(validateGraph(broken)).toContain(
      'Choice earn-trust in start targets missing node missing',
    )
  })

  it('finds every ending reachable through legal choices', () => {
    expect(reachableEndingIds(graphFixture).sort()).toEqual([
      'ending-a',
      'ending-b',
      'ending-c',
    ])
  })
})
