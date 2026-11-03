import type { CampaignSave, RouteProgress } from './types'

export const SAVE_KEY = 'my-gentle-fiancee:campaign:v2'

const emptyRoute = (): RouteProgress => ({ affinity: 0, flags: [], clues: [], completed: false })

export function createSave(routeIds: string[], activeSlot = 'slot-1'): CampaignSave {
  return {
    schemaVersion: 2,
    activeSlot,
    muted: false,
    audioConfigured: true,
    routes: Object.fromEntries(routeIds.map((routeId) => [routeId, emptyRoute()])),
  }
}

export function normalizeSave(value: unknown, routeIds: string[]): CampaignSave {
  const fallback = createSave(routeIds)
  if (!value || typeof value !== 'object') return fallback
  const source = value as Partial<CampaignSave> & { affinity?: number; flags?: string[]; clues?: string[] }
  if (source.schemaVersion !== 2 || !source.routes) {
    fallback.routes[routeIds[0]] = {
      affinity: Number.isFinite(source.affinity) ? Number(source.affinity) : 0,
      flags: Array.isArray(source.flags) ? source.flags : [],
      clues: Array.isArray(source.clues) ? source.clues : [],
      completed: false,
    }
    return fallback
  }
  for (const routeId of routeIds) {
    const route = source.routes[routeId]
    if (!route) continue
    fallback.routes[routeId] = {
      affinity: Number.isFinite(route.affinity) ? route.affinity : 0,
      flags: Array.isArray(route.flags) ? [...new Set(route.flags)] : [],
      clues: Array.isArray(route.clues) ? [...new Set(route.clues)] : [],
      completed: Boolean(route.completed),
      resultId: route.resultId,
    }
  }
  fallback.activeSlot = typeof source.activeSlot === 'string' ? source.activeSlot : 'slot-1'
  fallback.audioConfigured = true
  fallback.muted = false
  return fallback
}

export function loadSave(storage: Pick<Storage, 'getItem'>, routeIds: string[]): CampaignSave {
  const raw = storage.getItem(SAVE_KEY)
  if (!raw) return createSave(routeIds)
  try {
    return normalizeSave(JSON.parse(raw), routeIds)
  } catch {
    return createSave(routeIds)
  }
}

export function persistSave(storage: Pick<Storage, 'setItem'>, save: CampaignSave): void {
  storage.setItem(SAVE_KEY, JSON.stringify(save))
}

export function updateRoute(
  save: CampaignSave,
  routeId: string,
  update: Partial<RouteProgress>,
): CampaignSave {
  const current = save.routes[routeId]
  if (!current) throw new Error(`Unknown route ${routeId}`)
  return {
    ...save,
    routes: {
      ...save.routes,
      [routeId]: {
        ...current,
        ...update,
        flags: update.flags ? [...new Set(update.flags)] : current.flags,
        clues: update.clues ? [...new Set(update.clues)] : current.clues,
      },
    },
  }
}
