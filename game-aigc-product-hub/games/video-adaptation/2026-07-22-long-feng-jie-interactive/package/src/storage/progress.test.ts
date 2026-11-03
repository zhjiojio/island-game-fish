import { beforeEach, describe, expect, it } from 'vitest'
import {
  STORAGE_KEY,
  loadProgress,
  resetRun,
  saveProgress,
  unlockEnding,
} from './progress'
import type { GameState } from '../story/types'

const freshSession: GameState = {
  nodeId: 'protection-contract',
  stats: { trust: 0, evidence: 0, control: 0 },
  flags: [],
  history: [],
}

const fallback = { session: freshSession, unlockedEndings: [] }

describe('progress storage', () => {
  beforeEach(() => localStorage.clear())

  it('saves and restores a valid session', () => {
    const progress = {
      session: { ...freshSession, nodeId: 'lab-truth' },
      unlockedEndings: ['ending-together'],
    }

    saveProgress(localStorage, progress)

    expect(loadProgress(localStorage, fallback)).toEqual(progress)
  })

  it('returns a fresh snapshot for malformed JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')

    expect(loadProgress(localStorage, fallback)).toEqual(fallback)
  })

  it('discards an unsupported save version', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 99, progress: fallback }),
    )

    expect(loadProgress(localStorage, fallback)).toEqual(fallback)
  })

  it('keeps unlocked endings when a new run starts', () => {
    const completed = unlockEnding(fallback, 'ending-together')

    expect(resetRun(completed, freshSession)).toEqual({
      session: freshSession,
      unlockedEndings: ['ending-together'],
    })
  })
})
