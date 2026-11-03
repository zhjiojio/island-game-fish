import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HeartMeter } from './HeartMeter'

describe('PRD heart scale', () => {
  it('starts at zero hearts when affinity is zero', () => {
    const { container } = render(<HeartMeter affinity={0} />)
    expect(screen.getByLabelText('好感度 0/5')).toBeInTheDocument()
    expect(container.querySelectorAll('.filled')).toHaveLength(0)
  })

  it('fills one heart for each complete twenty affinity points', () => {
    const { container } = render(<HeartMeter affinity={40} />)
    expect(screen.getByLabelText('好感度 2/5')).toBeInTheDocument()
    expect(container.querySelectorAll('.filled')).toHaveLength(2)
  })
})
