import type { StoryNode } from '../story/types'

interface EndingScreenProps {
  node: StoryNode
  historyLabels: string[]
  unlockedCount: number
  totalEndings: number
  onReplay: () => void
}

export function EndingScreen({
  node,
  historyLabels,
  unlockedCount,
  totalEndings,
  onReplay,
}: EndingScreenProps) {
  return (
    <main className="ending-screen">
      <div className="ending-screen__image">
        <img src={node.media.src} alt={`${node.title}结局画面`} />
        <span className="ending-screen__seal">终</span>
      </div>
      <p className="chapter-kicker">{node.chapter}</p>
      <h1>{node.title}</h1>
      <p className="ending-summary">{node.ending?.summary}</p>
      <div className="ending-dialogue">
        {node.dialogue.map((line) => <p key={line}>{line}</p>)}
      </div>
      <section className="fate-trail" aria-labelledby="fate-trail-title">
        <h2 id="fate-trail-title">本轮命运轨迹</h2>
        <ol>
          {historyLabels.map((label, index) => (
            <li key={`${label}-${index}`}>{label}</li>
          ))}
        </ol>
      </section>
      <p className="collection-count">已收录 {unlockedCount} / {totalEndings} 个结局</p>
      <button className="replay-button" type="button" onClick={onReplay}>
        再改写一次命运
      </button>
    </main>
  )
}
