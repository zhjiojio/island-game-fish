import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { routeIds, routes } from '../campaign/content'
import { createSave, updateRoute } from '../campaign/store'
import { EvidenceReviewScreen } from './EvidenceReviewScreen'
import { HubScreen } from './HubScreen'

function completedSave() {
  return routeIds.reduce((save, routeId) => updateRoute(save, routeId, {
    completed: true,
    resultId: `${routeId}-result`,
    clues: [routes[routeId as keyof typeof routes].exclusiveClue],
  }), createSave(routeIds))
}

describe('first-act evidence review', () => {
  it('opens from the Hub only when nine chapters and clues are complete', async () => {
    const user = userEvent.setup()
    const onReview = vi.fn()
    render(<HubScreen save={completedSave()} onSelect={vi.fn()} onArchive={vi.fn()} onReview={onReview} onMutedChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '进入遗嘱复核室' }))
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('shows all nine duties and exclusive clues without inventing a final truth', () => {
    render(<EvidenceReviewScreen save={completedSave()} onReturn={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '第一幕证据盘点' })).toBeInTheDocument()
    expect(screen.getAllByTestId('evidence-card')).toHaveLength(9)
    expect(screen.getByText('九份合同并非同一时间、同一目的形成。')).toBeInTheDocument()
    expect(screen.getByText(/最终动机仍需后续章节/)).toBeInTheDocument()
  })
})
