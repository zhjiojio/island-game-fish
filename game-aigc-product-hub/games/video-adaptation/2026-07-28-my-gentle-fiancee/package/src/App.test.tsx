import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('nine-route manor campaign', () => {
  beforeEach(() => localStorage.clear())

  it('opens with a nine-character archive and three initially available routes', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: '我的温柔未婚妻' })).toBeInTheDocument()
    expect(screen.getByTestId('vow-orbit').querySelectorAll('i')).toHaveLength(9)
    expect(screen.getAllByRole('button', { name: /进入章节|尚未解锁/ })).toHaveLength(9)
    expect(screen.getAllByRole('button', { name: /尚未解锁/ })).toHaveLength(6)
  })

  it('enters the Hub and starts an unlocked character chapter', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '进入云澜山庄' }))
    expect(screen.getByRole('heading', { name: '今晚，想见谁？' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /声音/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /林舒，进入章节/ }))
    expect(screen.getByLabelText('林舒剧情舞台')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '退出会面' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /声音/ })).not.toBeInTheDocument()
  })

  it('keeps relationship feedback in flow above all three choices', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '进入云澜山庄' }))
    await user.click(screen.getByRole('button', { name: /林舒，进入章节/ }))
    fireEvent.ended(screen.getByTestId('story-video'))
    await user.click(within(screen.getByRole('region', { name: '选择回应' })).getAllByRole('button')[0])

    const feedback = screen.getByRole('status')
    const panel = screen.getByRole('region', { name: '选择回应' })
    expect(feedback.parentElement).toHaveClass('stage-feedback-slot')
    expect(feedback.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole('button', { name: /^0[1-3]/ })).toHaveLength(3)
  })
})
