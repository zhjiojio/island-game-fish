export type StatName = 'trust' | 'evidence' | 'control'

export type Stats = Record<StatName, number>

export type MediaKind = 'video' | 'still' | 'generated-image' | 'poster' | 'audio'

export interface StoryMedia {
  kind: MediaKind
  src: string
  poster?: string
}

export interface StoryChoice {
  id: string
  label: string
  hint: string
  nextNodeId?: string
  ending?: string
  statDelta?: Partial<Stats>
  setFlags?: string[]
  requiresFlags?: string[]
  requiresStats?: Partial<Stats>
  blockedHint?: string
}

export interface StoryEnding {
  id: string
  title: string
  summary: string
}

export interface StoryNode {
  id: string
  title: string
  chapter: string
  media: StoryMedia
  dialogue: string[]
  choices?: StoryChoice[]
  ending?: StoryEnding
}

export interface StoryGraph {
  startNodeId: string
  initialStats: Stats
  nodes: Record<string, StoryNode>
  endings: string[]
}

export interface GameState {
  nodeId: string
  stats: Stats
  flags: string[]
  history: string[]
}

export interface EvaluatedChoice extends StoryChoice {
  blocked: boolean
  blockedHint?: string
}
