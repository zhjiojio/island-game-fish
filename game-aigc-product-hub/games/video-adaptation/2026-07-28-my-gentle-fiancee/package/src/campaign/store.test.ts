import { describe, expect, it } from 'vitest'
import { createSave, loadSave, normalizeSave, persistSave, SAVE_KEY, updateRoute } from './store'
import { isRouteUnlocked, unlockedRouteIds } from './unlocks'

const routeIds = ['xiaoyu', 'linshu', 'wanwan', 'tangtang', 'yuwan', 'xinqing', 'yeye', 'liuli', 'yaoji']
const waves = [
  { id: 'wave-1', routeIds: routeIds.slice(0, 3), requiredCompletedChapterCount: 0 },
  { id: 'wave-2', routeIds: routeIds.slice(3, 6), requiredCompletedChapterCount: 2 },
  { id: 'wave-3', routeIds: routeIds.slice(6), requiredCompletedChapterCount: 5 },
]

describe('campaign save', () => {
  it('creates isolated progress for all nine routes', () => {
    const save = createSave(routeIds)
    expect(save).toMatchObject({ muted: false, audioConfigured: true })
    const next = updateRoute(save, 'xiaoyu', { affinity: 8, flags: ['home'] })
    expect(next.routes.xiaoyu.affinity).toBe(8)
    expect(next.routes.linshu.affinity).toBe(0)
    expect(save.routes.xiaoyu.affinity).toBe(0)
  })

  it('unlocks waves at exactly zero, two, and five completions', () => {
    let save = createSave(routeIds)
    expect(unlockedRouteIds(save, waves)).toEqual(routeIds.slice(0, 3))
    save = updateRoute(updateRoute(save, 'xiaoyu', { completed: true }), 'linshu', { completed: true })
    expect(isRouteUnlocked('tangtang', save, waves)).toBe(true)
    save = updateRoute(updateRoute(updateRoute(save, 'wanwan', { completed: true }), 'tangtang', { completed: true }), 'yuwan', { completed: true })
    expect(isRouteUnlocked('yaoji', save, waves)).toBe(true)
  })

  it('migrates the pilot save into the first route', () => {
    const save = normalizeSave({ affinity: 12, flags: ['warm'], clues: ['letter'] }, routeIds)
    expect(save.routes.xiaoyu).toMatchObject({ affinity: 12, flags: ['warm'], clues: ['letter'] })
    expect(save.schemaVersion).toBe(2)
  })

  it('persists and reloads the same slot', () => {
    const data = new Map<string, string>()
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
    }
    const save = updateRoute(createSave(routeIds, 'slot-2'), 'wanwan', { completed: true })
    persistSave(storage, save)
    expect(data.has(SAVE_KEY)).toBe(true)
    expect(loadSave(storage, routeIds)).toEqual(save)
  })

  it('migrates legacy saves to sound enabled by default', () => {
    const legacy = { ...createSave(routeIds), muted: true, audioConfigured: false }
    expect(normalizeSave(legacy, routeIds)).toMatchObject({ muted: false, audioConfigured: true })
  })
})
