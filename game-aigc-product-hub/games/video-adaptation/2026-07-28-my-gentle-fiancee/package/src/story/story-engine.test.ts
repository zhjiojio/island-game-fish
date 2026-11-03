import { describe, expect, it } from 'vitest'
import { applyChoice, reachableEndingIds, selectResult, selectedMediaId, targetForChoice, validateGraph } from './engine'
import { story } from './story'

describe('campaign story contract', () => {
  it('ships a valid graph with three reachable chapter outcomes', () => {
    expect(validateGraph(story)).toEqual([])
    expect(reachableEndingIds(story).sort()).toEqual(['reacquaintance', 'respectful-distance', 'welcome-home'])
  })

  it('moves each declared choice to its exact nextNodeId', () => {
    const firstChoice = story.nodes['xiaoyu-ch01-r02']
    for (const choice of firstChoice.choices ?? []) {
      expect(targetForChoice(firstChoice, choice.id)).toBe(choice.nextNodeId)
    }
  })

  it('applies choice state, resolves the matching reaction, and selects a result', () => {
    const choice = story.nodes['xiaoyu-ch01-r02'].choices![0]
    const state = applyChoice({ affinity: 22, flags: ['promised-breakfast'], clues: [] }, choice)
    expect(state.affinity).toBe(30)
    expect(selectedMediaId(story.nodes['xiaoyu-ch01-r03'], state.flags)).toBe('xiaoyu-ch01-r03-warm-first-answer')
    expect(selectResult(story.nodes['xiaoyu-ch01-r20'], state)?.id).toBe('welcome-home')
  })
})
