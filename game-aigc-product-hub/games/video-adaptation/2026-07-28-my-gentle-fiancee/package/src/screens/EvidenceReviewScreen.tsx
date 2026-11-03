import { characters, routes } from '../campaign/content'
import type { CampaignSave } from '../campaign/types'

export function EvidenceReviewScreen({ save, onReturn }: { save: CampaignSave; onReturn: () => void }) {
  return (
    <main className="archive-shell evidence-review-screen">
      <header className="review-header">
        <p>NINE VOWS · ONE UNSOLVED HEART</p>
        <h1>第一幕证据盘点</h1>
        <span>九场会面不是九份孤立的婚约，而是父亲留下的九个观察位置。</span>
      </header>
      <section className="evidence-thesis">
        <small>阶段结论</small>
        <h2>九份合同并非同一时间、同一目的形成。</h2>
        <p>生活记录、合同年代、公共援助、产权条款、家庭事故、公司条件、九十天日程、旧戏文与异常契约已经互相咬合；父亲的最终动机仍需后续章节与 NG+ 证词复核。</p>
      </section>
      <section className="evidence-grid" aria-label="九份角色证据">
        {characters.map((character, index) => {
          const route = routes[character.id as keyof typeof routes]
          const progress = save.routes[character.id]
          return (
            <article className="evidence-card" data-testid="evidence-card" key={character.id}>
              <span>{String(index + 1).padStart(2, '0')} · {character.name}</span>
              <h2>{route.globalDuty}</h2>
              <p>{route.exclusiveClue}</p>
              <small>{progress.resultId ?? '章节结果已记录'}</small>
            </article>
          )
        })}
      </section>
      <footer className="review-footer">
        <p>第一幕完成：关系结论保持开放，基础主线不锁定任何角色。</p>
        <button className="primary-action" onClick={onReturn}>返回云澜山庄</button>
      </footer>
    </main>
  )
}
