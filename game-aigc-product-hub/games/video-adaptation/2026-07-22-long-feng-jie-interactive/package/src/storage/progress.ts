import type { GameState } from '../story/types'

export const STORAGE_KEY = 'long-feng-jie-progress'
const SAVE_VERSION = 1

export interface ProgressSnapshot {
  session: GameState
  unlockedEndings: string[]
}

type StorageAdapter = Pick<Storage, 'getItem' | 'setItem'>

const cloneSnapshot = (snapshot: ProgressSnapshot): ProgressSnapshot => ({
  session: {
    ...snapshot.session,
    stats: { ...snapshot.session.stats },
    flags: [...snapshot.session.flags],
    history: [...snapshot.session.history],
  },
  unlockedEndings: [...snapshot.unlockedEndings],
})

function isProgressSnapshot(value: unknown): value is ProgressSnapshot {
  if (!value || typeof value !== 'object') return false
  const progress = value as Partial<ProgressSnapshot>
  const session = progress.session
  return Boolean(
    session &&
      typeof session.nodeId === 'string' &&
      typeof session.stats?.trust === 'number' &&
      typeof session.stats?.evidence === 'number' &&
      typeof session.stats?.control === 'number' &&
      Array.isArray(session.flags) &&
      Array.isArray(session.history) &&
      Array.isArray(progress.unlockedEndings),
  )
}

export function saveProgress(
  storage: StorageAdapter,
  progress: ProgressSnapshot,
): boolean {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: SAVE_VERSION, progress }),
    )
    return true
  } catch {
    return false
  }
}

export function loadProgress(
  storage: StorageAdapter,
  fallback: ProgressSnapshot,
): ProgressSnapshot {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return cloneSnapshot(fallback)
    const envelope = JSON.parse(raw) as { version?: number; progress?: unknown }
    if (envelope.version !== SAVE_VERSION || !isProgressSnapshot(envelope.progress)) {
      return cloneSnapshot(fallback)
    }
    return cloneSnapshot(envelope.progress)
  } catch {
    return cloneSnapshot(fallback)
  }
}

export function resetRun(
  progress: ProgressSnapshot,
  freshSession: GameState,
): ProgressSnapshot {
  return {
    session: {
      ...freshSession,
      stats: { ...freshSession.stats },
      flags: [...freshSession.flags],
      history: [...freshSession.history],
    },
    unlockedEndings: [...progress.unlockedEndings],
  }
}

export function unlockEnding(
  progress: ProgressSnapshot,
  endingId: string,
): ProgressSnapshot {
  return {
    session: progress.session,
    unlockedEndings: [...new Set([...progress.unlockedEndings, endingId])],
  }
}
