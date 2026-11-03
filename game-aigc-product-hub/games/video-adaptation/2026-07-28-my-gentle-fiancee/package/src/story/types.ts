export interface StoryChoice {
  id: string
  label: string
  directConsequence: string
  longTermConsequence: string
  nextNodeId: string
  effects?: {
    affinity?: number
    flags?: string[]
    clues?: string[]
  }
}

export interface StoryNode {
  id: string
  title?: string
  visualIntent?: string
  action: string
  dialogue: Array<{ speaker: string; text: string; emotion?: string }>
  dialogueVariants?: Array<{ whenFlag: string; speaker: string; text: string }>
  presentation?: 'video' | 'portrait' | 'cg' | 'ui'
  animationCue?: 'doorway' | 'tableware' | 'kitchen' | 'paper' | 'fabric' | 'night' | 'room'
  musicKey?: string
  foleyEvent?: string
  foleyAssetId?: string
  media: {
    type: 'video' | 'portrait' | 'cg' | 'none'
    nodeId?: string
    variants?: Array<{ mediaVariantId: string; whenFlags: string[] }>
  }
  choices?: StoryChoice[]
  nextNodeId?: string
  ending?: { id: string; label: string; summary: string }
  resultVariants?: Array<{ id: string; label: string; condition: string; text?: string; result?: string; summary?: string; content?: string }>
  chapterResult?: { id: string; label: string; text?: string; content?: string }
}

export interface StoryGraph {
  schemaVersion: number
  title: string
  playerPromise: string
  startNodeId: string
  nodes: Record<string, StoryNode>
}

export interface StoryState {
  affinity: number
  flags: string[]
  clues: string[]
}
