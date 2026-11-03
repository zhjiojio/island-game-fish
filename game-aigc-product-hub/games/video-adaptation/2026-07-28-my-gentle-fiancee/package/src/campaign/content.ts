import rawCampaign from '../generated/campaign-data.json'
import rawScript from '../generated/interactive-script.json'
import rawStory from '../generated/story-data.json'
import type { CampaignWave } from './types'
import type { StoryGraph } from '../story/types'

export const waves = rawCampaign.waves as CampaignWave[]
const characterByRawId = new Map(rawScript.characters.map((character) => [character.id, character]))
export const routeIds = waves.flatMap((wave) => wave.routeIds)
export const characters = routeIds.map((routeId) => {
  const character = characterByRawId.get(routeId)
  if (!character) throw new Error(`Campaign wave references unknown character ${routeId}`)
  return character
})
export const routes = rawCampaign.routes

export function characterById(routeId: string) {
  const character = characters.find((item) => item.id === routeId)
  if (!character) throw new Error(`Unknown character ${routeId}`)
  return character
}

export function graphForRoute(routeId: string): StoryGraph {
  const chapter = Object.values(rawScript.chapters).find((item) => item.route === routeId)
  if (!chapter) throw new Error(`Missing chapter for ${routeId}`)
  const nodes = Object.fromEntries(chapter.roundIds.map((roundId) => {
    const node = rawStory.nodes[roundId as keyof typeof rawStory.nodes]
    if (!node) throw new Error(`Missing generated story node ${roundId}`)
    return [roundId, node]
  })) as unknown as StoryGraph['nodes']
  return {
    schemaVersion: rawStory.schemaVersion,
    title: rawStory.title,
    playerPromise: rawStory.playerPromise,
    startNodeId: chapter.roundIds[0],
    nodes,
  }
}
