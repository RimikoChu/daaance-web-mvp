import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrainingTimeline } from './TrainingTimeline'
import type { MotionErrorEvent, ReviewRange } from '../trainingReview/types'

const error = (id: string, timestamp: number, overrides: Partial<MotionErrorEvent> = {}): MotionErrorEvent => ({
  id,
  timestamp,
  receivedAt: timestamp + 100,
  limb: 'left_wrist',
  type: 'timing',
  severity: 'medium',
  source: 'demo',
  detector: 'demo-review-v1',
  ...overrides,
})

const range = (emphasis: ReviewRange['emphasis']): ReviewRange => ({
  limb: 'left_wrist',
  start: 2_000,
  end: 4_000,
  errorIds: ['first', 'second', 'third'],
  emphasis,
})

describe('TrainingTimeline', () => {
  it('renders accessible ordinary error markers and standard and strong review ranges', () => {
    render(<TrainingTimeline
      duration={10}
      currentTime={0}
      errors={[error('first', 2_000), error('second', 4_000, { limb: 'right_ankle', type: 'range', severity: 'high', source: 'imu' })]}
      ranges={[range('standard'), { ...range('strong'), limb: 'right_ankle', start: 5_000, end: 8_000 }]}
      onSeek={vi.fn()}
    />)

    expect(screen.getByRole('button', { name: /left wrist.*timing.*medium.*2\.00.*demo-generated/i })).toHaveClass('review-point-marker')
    expect(screen.getByRole('button', { name: /right ankle.*range.*high.*4\.00.*imu-detected/i })).toHaveClass('review-point-marker')
    expect(document.querySelector('.review-range.standard')).toHaveStyle({ left: '20%', width: '20%' })
    expect(document.querySelector('.review-range.strong')).toHaveStyle({ left: '50%', width: '30%' })
    expect(screen.getByRole('button', { name: /review range.*left wrist.*3 errors/i })).toBeInTheDocument()
  })

  it('navigates deduplicated errors chronologically from the current playback time', () => {
    const onSeek = vi.fn()
    const errors = [error('late', 7_000), error('first', 2_000), error('middle', 5_000)]
    const { rerender } = render(<TrainingTimeline duration={10} currentTime={5} errors={errors} ranges={[]} onSeek={onSeek} />)

    fireEvent.click(screen.getByRole('button', { name: 'Previous error' }))
    fireEvent.click(screen.getByRole('button', { name: 'Next error' }))
    expect(onSeek).toHaveBeenNthCalledWith(1, 2)
    expect(onSeek).toHaveBeenNthCalledWith(2, 7)

    rerender(<TrainingTimeline duration={10} currentTime={0} errors={errors} ranges={[]} onSeek={onSeek} />)
    expect(screen.getByRole('button', { name: 'Previous error' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Next error' }))
    expect(onSeek).toHaveBeenLastCalledWith(2)
  })

  it('uses the matching error or range timestamp as the review target', () => {
    const onSeek = vi.fn()
    render(<TrainingTimeline duration={10} currentTime={0} errors={[error('first', 2_000)]} ranges={[range('standard')]} onSeek={onSeek} />)

    fireEvent.click(screen.getByRole('button', { name: /left wrist.*timing/i }))
    fireEvent.click(screen.getByRole('button', { name: /review range/i }))
    expect(onSeek).toHaveBeenNthCalledWith(1, 2)
    expect(onSeek).toHaveBeenNthCalledWith(2, 2)
  })
})
