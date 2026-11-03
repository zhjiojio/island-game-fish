import { characters, waves } from '../campaign/content'
import type { CampaignSave } from '../campaign/types'
import { isRouteUnlocked } from '../campaign/unlocks'
import { CharacterCard } from '../components/CharacterCard'

export function RosterScreen({ save, onEnter }: { save: CampaignSave; onEnter: () => void }) {
  return (
    <main className="archive-shell roster-screen">
      <header className="archive-header">
        <div className="archive-copy">
          <p>MY GENTLE FIANCÉE · CHAPTER ONE</p>
          <h1>我的温柔未婚妻</h1>
          <span>九份婚约，不是九个答案。今夜开始，重新选择如何靠近彼此。</span>
        </div>
        <div className="vow-orbit" data-testid="vow-orbit" aria-hidden="true">
          <div>{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div>
          <b>云澜</b>
          <em>09</em>
        </div>
      </header>
      <section className="roster-grid" aria-label="九位未婚妻档案">
        {characters.map((character) => {
          const wave = waves.findIndex((item) => item.routeIds.includes(character.id)) + 1
          return <CharacterCard key={character.id} id={character.id} name={character.name} promise={character.emotionalPromise} affinity={save.routes[character.id].affinity} completed={save.routes[character.id].completed} locked={!isRouteUnlocked(character.id, save, waves)} wave={wave} />
        })}
      </section>
      <button className="primary-action" type="button" aria-label="进入云澜山庄" onClick={onEnter}><span>开启第一幕</span>进入云澜山庄</button>
    </main>
  )
}
