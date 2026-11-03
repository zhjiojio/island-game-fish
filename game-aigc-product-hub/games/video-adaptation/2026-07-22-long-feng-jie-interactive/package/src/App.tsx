import { useMemo, useState } from 'react'
import { ChoicePanel } from './components/ChoicePanel'
import { EndingScreen } from './components/EndingScreen'
import { MediaStage } from './components/MediaStage'
import {
  applyChoice,
  availableChoices,
  freshState,
} from './story/engine'
import { story } from './story/storyData'
import type { EvaluatedChoice, StatName } from './story/types'
import {
  loadProgress,
  resetRun,
  saveProgress,
  unlockEnding,
  type ProgressSnapshot,
} from './storage/progress'
import './styles.css'

const statMeta: Record<StatName, { label: string; glyph: string }> = {
  trust: { label: '信任', glyph: '凤' },
  evidence: { label: '证据', glyph: '鉴' },
  control: { label: '掌控', glyph: '龙' },
}

const choiceLabels = Object.values(story.nodes).reduce<Record<string, string>>(
  (labels, node) => {
    for (const choice of node.choices ?? []) labels[choice.id] = choice.label
    return labels
  },
  {},
)

const makeFreshSession = () => freshState(story.startNodeId, story.initialStats)

const makeFallback = (): ProgressSnapshot => ({
  session: makeFreshSession(),
  unlockedEndings: [],
})

function safeInitialProgress(): ProgressSnapshot {
  const progress = loadProgress(localStorage, makeFallback())
  return story.nodes[progress.session.nodeId] ? progress : makeFallback()
}

const statDirection = (value: number) => {
  if (value > 0) return '上升'
  if (value < 0) return '承压'
  return '未定'
}

export default function App() {
  const [progress, setProgress] = useState(safeInitialProgress)
  const node = story.nodes[progress.session.nodeId]
  const [choiceReady, setChoiceReady] = useState(node.media.kind !== 'video')
  const [muted, setMuted] = useState(true)
  const [feedback, setFeedback] = useState<string | null>(null)

  const evaluatedChoices = useMemo(
    () => availableChoices(node.choices ?? [], progress.session),
    [node.choices, progress.session],
  )

  const persist = (next: ProgressSnapshot) => {
    setProgress(next)
    saveProgress(localStorage, next)
  }

  const selectChoice = (choice: EvaluatedChoice) => {
    if (choice.blocked) return
    const session = applyChoice(progress.session, choice)
    const target = story.nodes[session.nodeId]
    let next: ProgressSnapshot = { ...progress, session }
    if (target.ending) next = unlockEnding(next, target.ending.id)
    persist(next)
    setFeedback(`命运已改写 · ${choice.label}`)
    setChoiceReady(target.media.kind !== 'video')
  }

  const replay = () => {
    const next = resetRun(progress, makeFreshSession())
    persist(next)
    setFeedback(null)
    setChoiceReady(false)
  }

  if (node.ending) {
    return (
      <div className="app-shell app-shell--ending">
        <EndingScreen
          node={node}
          historyLabels={progress.session.history.map((id) => choiceLabels[id] ?? id)}
          unlockedCount={progress.unlockedEndings.length}
          totalEndings={story.endings.length}
          onReplay={replay}
        />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className="portrait-stage">
        <header className="story-header">
          <div className="brand-lockup" aria-label="龙凤劫：我的战神保镖">
            <span className="brand-lockup__seal">劫</span>
            <span>
              <small>我的战神保镖</small>
              <strong>龙凤劫</strong>
            </span>
          </div>
          <button
            className="sound-toggle"
            type="button"
            aria-label={muted ? '开启声音' : '关闭声音'}
            onClick={() => setMuted((value) => !value)}
          >
            {muted ? '静' : '声'}
          </button>
        </header>

        <section className="story-heading">
          <p>{node.chapter}</p>
          <h1>{node.title}</h1>
        </section>

        <MediaStage
          key={node.id}
          media={node.media}
          title={node.title}
          muted={muted}
          onReady={() => setChoiceReady(true)}
        />

        <section className="narrative-caption" aria-label="剧情摘要">
          {node.dialogue.map((line) => <p key={line}>{line}</p>)}
        </section>

        <section className="fate-meter" aria-label="命运状态">
          {(Object.keys(statMeta) as StatName[]).map((name) => (
            <div className="fate-meter__item" key={name}>
              <span aria-hidden="true">{statMeta[name].glyph}</span>
              <small>{statMeta[name].label}</small>
              <strong>{statDirection(progress.session.stats[name])}</strong>
            </div>
          ))}
        </section>

        {feedback ? <p className="fate-feedback" role="status">{feedback}</p> : null}
        {choiceReady ? (
          <ChoicePanel choices={evaluatedChoices} onSelect={selectChoice} />
        ) : null}
      </main>
    </div>
  )
}
