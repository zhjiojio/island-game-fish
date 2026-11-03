import type { StoryChoice, StoryGraph, StoryNode, StoryState } from './types'

export function validateGraph(graph: StoryGraph): string[] {
  const errors: string[] = []
  if (!graph.nodes[graph.startNodeId]) errors.push(`Missing start node ${graph.startNodeId}`)
  for (const [nodeId, node] of Object.entries(graph.nodes)) {
    if (node.id !== nodeId) errors.push(`Node id mismatch: ${nodeId}`)
    const modes = [Boolean(node.choices?.length), Boolean(node.nextNodeId), Boolean(node.ending || node.chapterResult)].filter(Boolean)
    if (modes.length !== 1) errors.push(`Node ${nodeId} must define choices, nextNodeId, or ending`)
    for (const choice of node.choices ?? []) {
      if (!graph.nodes[choice.nextNodeId]) errors.push(`Choice ${choice.id} targets ${choice.nextNodeId}`)
    }
    if (node.nextNodeId && !graph.nodes[node.nextNodeId]) errors.push(`Node ${nodeId} targets ${node.nextNodeId}`)
  }
  return errors
}

export function reachableEndingIds(graph: StoryGraph): string[] {
  if (validateGraph(graph).length) return []
  const pending = [graph.startNodeId]
  const seen = new Set<string>()
  const endings = new Set<string>()
  while (pending.length) {
    const nodeId = pending.shift()!
    if (seen.has(nodeId)) continue
    seen.add(nodeId)
    const node = graph.nodes[nodeId]
    if (node.ending) endings.add(node.ending.id)
    for (const result of node.resultVariants ?? []) endings.add(result.id)
    if (node.nextNodeId) pending.push(node.nextNodeId)
    for (const choice of node.choices ?? []) pending.push(choice.nextNodeId)
  }
  return [...endings]
}

export function applyChoice(state: StoryState, choice: StoryChoice): StoryState {
  return {
    affinity: state.affinity + (choice.effects?.affinity ?? 0),
    flags: [...new Set([...state.flags, ...(choice.effects?.flags ?? [])])],
    clues: [...new Set([...state.clues, ...(choice.effects?.clues ?? [])])],
  }
}

export function selectedMediaId(node: StoryNode, flags: string[]): string | undefined {
  if (node.media.type !== 'video') return undefined
  if (!node.media.variants?.length) return node.media.nodeId ?? node.id
  const matches = node.media.variants.filter((variant) => variant.whenFlags.every((flag) => flags.includes(flag)))
  if (matches.length !== 1) throw new Error(`Node ${node.id} expected one media variant, found ${matches.length}`)
  return matches[0].mediaVariantId
}

function conditionMatches(condition: string, state: StoryState): boolean {
  if (condition === 'default') return true
  return condition.split(/\s+and\s+/).every((part) => {
    const affinity = part.match(/^affinity\s*>=\s*(-?\d+)$/)
    if (affinity) return state.affinity >= Number(affinity[1])
    const anyFlag = part.match(/^any\(([^)]+)\)$/)
    if (anyFlag) return anyFlag[1].split(',').some((flag) => state.flags.includes(flag.trim()))
    return false
  })
}

export function selectResult(node: StoryNode, state: StoryState) {
  return node.resultVariants?.find((result) => conditionMatches(result.condition, state))
}

export function targetForChoice(node: StoryNode, choiceId: string): string {
  const choice = node.choices?.find((item) => item.id === choiceId)
  if (!choice) throw new Error(`Unknown choice ${choiceId} in ${node.id}`)
  return choice.nextNodeId
}
