import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

const revealVideoChoice = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: '跳过片段，进入抉择' }))
}

describe('Long Feng Jie player', () => {
  beforeEach(() => localStorage.clear())

  it('changes fate through the full trust route and unlocks the true ending', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: '保护契约' })).toBeInTheDocument()
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /接受贴身保护/ }))
    expect(screen.getByText(/命运已改写/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /先救受伤者/ }))
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /追问我们是否早就见过/ }))
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /留下取证/ }))
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /维持直播，公开证据/ }))
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /公开战神身份，并肩破局/ }))

    expect(screen.getByRole('heading', { name: '并肩破局' })).toBeInTheDocument()
    expect(screen.getByText('已收录 1 / 3 个结局')).toBeInTheDocument()
  })

  it('shows accumulated consequences by blocking an unavailable ending', async () => {
    const user = userEvent.setup()
    render(<App />)

    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /安全必须由我掌控/ }))
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /先谈公司，不谈过去/ }))
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /先稳住发布会/ }))
    await revealVideoChoice(user)
    await user.click(screen.getByRole('button', { name: /维持直播，稳住市场/ }))
    await revealVideoChoice(user)

    expect(
      screen.getByRole('button', { name: /公开战神身份，并肩破局/ }),
    ).toBeDisabled()
    expect(
      screen.getByText(/需要在保护契约、玉佩旧事和实验室取证中建立完整信任链/),
    ).toBeInTheDocument()
  })

  it('falls back to the poster and summary when video playback fails', async () => {
    const user = userEvent.setup()
    render(<App />)

    fireEvent.error(screen.getByTestId('story-video'))

    expect(screen.getByText('片段暂时无法播放')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '保护契约剧情画面' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '看剧情摘要并继续' }))
    expect(screen.getByRole('button', { name: /接受贴身保护/ })).toBeInTheDocument()
  })
})
