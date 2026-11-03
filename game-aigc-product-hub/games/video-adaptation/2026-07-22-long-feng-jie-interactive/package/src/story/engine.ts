import type {
  EvaluatedChoice,
  GameState,
  Stats,
  StoryChoice,
  StoryGraph,
} from './types'

const STAT_NAMES = ['trust', 'evidence', 'control'] as const

const clampStat = (value: number) => Math.max(-3, Math.min(3, value))

export function applyChoice(state: GameState, choice: StoryChoice): GameState {
  const target = choice.nextNodeId ?? choice.ending
  if (!target) {
    throw new Error(`Choice ${choice.id} has no target`)
  }

  const stats = { ...state.stats }
  for (const name of STAT_NAMES) {
    stats[name] = clampStat(stats[name] + (choice.statDelta?.[name] ?? 0))
  }

  return {
    nodeId: target,
    stats,
    flags: [...new Set([...state.flags, ...(choice.setFlags ?? [])])],
    history: [...state.history, choice.id],
  }
}

export function availableChoices(
  choices: StoryChoice[],
  state: Pick<GameState, 'stats' | 'flags'>,
): EvaluatedChoice[] {
  const flags = new Set(state.flags)
  return choices.map((choice) => {
    const hasFlags = (choice.requiresFlags ?? []).every((flag) => flags.has(flag))
    const hasStats = STAT_NAMES.every(
      (name) => state.stats[name] >= (choice.requiresStats?.[name] ?? -3),
    )
    const blocked = !hasFlags || !hasStats

    return {
      ...choice,
      blocked,
      blockedHint: blocked ? choice.blockedHint : undefined,
    }
  })
}

export function freshState(startNodeId: string, initialStats: Stats): GameState {
  return {
    nodeId: startNodeId,
    stats: { ...initialStats },
    flags: [],
    history: [],
  }
}

export function validateGraph(graph: StoryGraph): string[] {
  const errors: string[] = []
  if (!graph.nodes[graph.startNodeId]) {
    errors.push(`Start node ${graph.startNodeId} does not exist`)
  }

  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.id !== nodeId) {
      errors.push(`Node key ${nodeId} does not match id ${node.id}`)
    }
    const hasChoices = Boolean(node.choices?.length)
    const hasEnding = Boolean(node.ending)
    if (hasChoices === hasEnding) {
      errors.push(`Node ${nodeId} must define choices or an ending`)
    }
    for (const choice of node.choices ?? []) {
      const target = choice.nextNodeId ?? choice.ending
      if (!target || !graph.nodes[target]) {
        errors.push(
          `Choice ${choice.id} in ${nodeId} targets missing node ${target ?? 'undefined'}`,
        )
      }
    }
  }

  return errors
}

export function reachableEndingIds(graph: StoryGraph): string[] {
  if (validateGraph(graph).length > 0) {
    return []
  }

  const queue: GameState[] = [freshState(graph.startNodeId, graph.initialStats)]
  const seen = new Set<string>()
  const endings = new Set<string>()

  while (queue.length > 0) {
    const state = queue.shift()!
    const stateKey = JSON.stringify([state.nodeId, state.stats, [...state.flags].sort()])
    if (seen.has(stateKey)) {
      continue
    }
    seen.add(stateKey)

    const node = graph.nodes[state.nodeId]
    if (node.ending) {
      endings.add(node.ending.id)
      continue
    }

    for (const choice of availableChoices(node.choices ?? [], state)) {
      if (!choice.blocked) {
        queue.push(applyChoice(state, choice))
      }
    }
  }

  return [...endings]
}
