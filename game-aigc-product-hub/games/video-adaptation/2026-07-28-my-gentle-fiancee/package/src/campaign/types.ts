export interface RouteProgress {
  affinity: number
  flags: string[]
  clues: string[]
  completed: boolean
  resultId?: string
}

export interface CampaignSave {
  schemaVersion: 2
  activeSlot: string
  muted: boolean
  audioConfigured: boolean
  routes: Record<string, RouteProgress>
}

export interface CampaignWave {
  id: string
  routeIds: string[]
  requiredCompletedChapterCount: number
}
