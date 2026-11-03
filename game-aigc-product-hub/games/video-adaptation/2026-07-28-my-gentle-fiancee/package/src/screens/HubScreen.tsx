import { characters, routes, waves } from '../campaign/content'
import type { CampaignSave } from '../campaign/types'
import { completedCount, isRouteUnlocked } from '../campaign/unlocks'
import { CharacterCard } from '../components/CharacterCard'
import { ClueProgress } from '../components/ClueProgress'

export function HubScreen({ save, onSelect, onArchive, onReview }: { save: CampaignSave; onSelect: (routeId: string) => void; onArchive: () => void; onReview: () => void }) {
  const completed = completedCount(save)
  const clueCount = new Set(Object.values(save.routes).flatMap((route) => route.clues)).size
  return (
    <main className="archive-shell hub-screen">
      <header className="hub-header">
        <button className="text-action" onClick={onArchive}>婚约档案</button>
        <div><p>YUNLAN MANOR · TONIGHT</p><h1>今晚，想见谁？</h1></div>
        <ClueProgress completed={completed} clues={clueCount} />
      </header>
      <section className="objective-card">
        <small>下一段心意</small>
        <p>{completed < 2 ? '完成两场首轮会面，解封第二组婚约。' : completed < 5 ? '累计五份角色证据，开启封存档案。' : completed < 9 ? '完成九场会面，召开遗嘱证据复核。' : '九份证据齐备。遗嘱复核室已经开放。'}</p>
      </section>
      {completed === 9 && clueCount === 9 ? <button className="review-entry" aria-label="进入遗嘱复核室" onClick={onReview}><span>九份证据已齐备</span><b>进入遗嘱复核室</b></button> : null}
      <section className="hub-grid" aria-label="可选择会面">
        {characters.map((character) => {
          const wave = waves.findIndex((item) => item.routeIds.includes(character.id)) + 1
          const progress = save.routes[character.id]
          return <CharacterCard key={character.id} id={character.id} name={character.name} promise={routes[character.id as keyof typeof routes].exclusiveClue} affinity={progress.affinity} completed={progress.completed} locked={!isRouteUnlocked(character.id, save, waves)} wave={wave} onSelect={() => onSelect(character.id)} />
        })}
      </section>
    </main>
  )
}
