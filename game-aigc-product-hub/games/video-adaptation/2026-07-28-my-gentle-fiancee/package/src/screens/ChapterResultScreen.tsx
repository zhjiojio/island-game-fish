import { portraitByCharacter } from '../generated/roster-imports'
import type { StoryState } from '../story/types'
import { HeartMeter } from '../components/HeartMeter'

export function ChapterResultScreen({ routeId, name, result, state, clue, onReturn }: { routeId: string; name: string; result: { label: string; text?: string; result?: string; summary?: string; content?: string }; state: StoryState; clue: string; onReturn: () => void }) {
  const copy = result.text ?? result.result ?? result.summary ?? result.content ?? '这段关系仍有继续理解的余地。'
  return (
    <main className="archive-shell result-screen">
      <img src={portraitByCharacter[routeId as keyof typeof portraitByCharacter]} alt={name} />
      <section>
        <small>HEART RECORD · {name}</small>
        <h1>{result.label}</h1>
        <HeartMeter affinity={state.affinity} />
        <p>{copy}</p>
        <div className="clue-slip"><span>她交给你的线索</span><b>{clue}</b></div>
        <button className="primary-action" onClick={onReturn}>返回云澜山庄</button>
      </section>
    </main>
  )
}
