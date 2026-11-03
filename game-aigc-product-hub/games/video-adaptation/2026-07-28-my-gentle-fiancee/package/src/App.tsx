import { useEffect, useMemo, useState } from 'react'
import { characterById, graphForRoute, routeIds, routes } from './campaign/content'
import { loadSave, persistSave, updateRoute } from './campaign/store'
import type { CampaignSave } from './campaign/types'
import type { StoryState } from './story/types'
import { HubScreen } from './screens/HubScreen'
import { RosterScreen } from './screens/RosterScreen'
import { StoryStage } from './screens/StoryStage'
import { ChapterResultScreen } from './screens/ChapterResultScreen'
import { EvidenceReviewScreen } from './screens/EvidenceReviewScreen'

type Screen = 'roster' | 'hub' | 'stage' | 'result' | 'review'

export default function App() {
  const [screen, setScreen] = useState<Screen>('roster')
  const [routeId, setRouteId] = useState('xiaoyu')
  const [save, setSave] = useState<CampaignSave>(() => loadSave(window.localStorage, routeIds))
  const [lastResult, setLastResult] = useState<{ state: StoryState; resultId: string }>()
  const graph = useMemo(() => graphForRoute(routeId), [routeId])
  const character = characterById(routeId)
  const route = routes[routeId as keyof typeof routes]

  useEffect(() => persistSave(window.localStorage, save), [save])

  const selectRoute = (selected: string) => {
    setRouteId(selected)
    setLastResult(undefined)
    setScreen('stage')
  }

  const completeChapter = (state: StoryState, resultId: string) => {
    setSave((current) => updateRoute(current, routeId, {
      affinity: state.affinity,
      flags: state.flags,
      clues: [...state.clues, route.exclusiveClue],
      completed: true,
      resultId,
    }))
    setLastResult({ state, resultId })
    setScreen('result')
  }

  if (screen === 'roster') return <RosterScreen save={save} onEnter={() => setScreen('hub')} />
  if (screen === 'hub') return <HubScreen save={save} onSelect={selectRoute} onArchive={() => setScreen('roster')} onReview={() => setScreen('review')} />
  if (screen === 'stage') return <StoryStage key={routeId} routeId={routeId} name={character.name} graph={graph} onExit={() => setScreen('hub')} onComplete={completeChapter} />
  if (screen === 'review') return <EvidenceReviewScreen save={save} onReturn={() => setScreen('hub')} />

  const resultNode = Object.values(graph.nodes).find((node) => node.resultVariants)
  const result = resultNode?.resultVariants?.find((item) => item.id === lastResult?.resultId)
  if (!lastResult || !result) return null
  return <ChapterResultScreen routeId={routeId} name={character.name} result={result} state={lastResult.state} clue={route.exclusiveClue} onReturn={() => setScreen('hub')} />
}
