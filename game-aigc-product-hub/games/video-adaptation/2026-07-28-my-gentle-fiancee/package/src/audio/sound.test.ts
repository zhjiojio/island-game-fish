import { describe, expect, it } from 'vitest'
import { SOUND_CUES } from './sound'

describe('procedural UI sound cues', () => {
  it('keeps interaction cues short and distinct', () => {
    expect(Object.keys(SOUND_CUES)).toEqual(['choice', 'continue', 'complete'])
    expect(SOUND_CUES.choice.duration).toBeLessThanOrEqual(0.12)
    expect(SOUND_CUES.complete.frequency).toBeGreaterThan(SOUND_CUES.continue.frequency)
  })
})
