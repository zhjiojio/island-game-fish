import type { CampaignSave, CampaignWave } from './types'

export function completedCount(save: CampaignSave): number {
  return Object.values(save.routes).filter((route) => route.completed).length
}

export function unlockedRouteIds(save: CampaignSave, waves: CampaignWave[]): string[] {
  const completed = completedCount(save)
  return waves
    .filter((wave) => completed >= wave.requiredCompletedChapterCount)
    .flatMap((wave) => wave.routeIds)
}

export function isRouteUnlocked(routeId: string, save: CampaignSave, waves: CampaignWave[]): boolean {
  return unlockedRouteIds(save, waves).includes(routeId)
}

