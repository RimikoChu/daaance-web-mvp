import { describe, expect, it } from 'vitest'
import { clusterReviewRanges } from './clusterReviewRanges'
import type { MotionErrorEvent } from './types'

const error = (id: string, timestamp: number, limb: MotionErrorEvent['limb'] = 'left_wrist'): MotionErrorEvent => ({
  id,
  timestamp,
  receivedAt: timestamp + 100,
  limb,
  type: 'timing',
  severity: 'medium',
  source: 'imu',
  detector: 'imu-timing-v1',
})

describe('clusterReviewRanges', () => {
  it('does not create a review range for one ordinary error', () => {
    expect(clusterReviewRanges([error('e1', 1_000)])).toEqual([])
  })

  it('clusters two errors exactly 2000ms apart for the same limb', () => {
    expect(clusterReviewRanges([error('e2', 3_000), error('e1', 1_000)])).toEqual([{
      limb: 'left_wrist',
      start: 1_000,
      end: 3_000,
      errorIds: ['e1', 'e2'],
      emphasis: 'standard',
    }])
  })

  it('gives three errors in one cluster strong emphasis', () => {
    expect(clusterReviewRanges([error('e1', 1_000), error('e2', 2_000), error('e3', 3_000)])).toEqual([{
      limb: 'left_wrist',
      start: 1_000,
      end: 3_000,
      errorIds: ['e1', 'e2', 'e3'],
      emphasis: 'strong',
    }])
  })

  it('keeps errors more than 2000ms apart out of a range', () => {
    expect(clusterReviewRanges([error('e1', 1_000), error('e2', 3_001)])).toEqual([])
  })

  it('creates overlapping ranges independently for different limbs', () => {
    expect(clusterReviewRanges([
      error('left-1', 1_000, 'left_wrist'),
      error('right-1', 1_000, 'right_wrist'),
      error('left-2', 2_000, 'left_wrist'),
      error('right-2', 2_000, 'right_wrist'),
    ])).toEqual([
      {
        limb: 'left_wrist', start: 1_000, end: 2_000,
        errorIds: ['left-1', 'left-2'], emphasis: 'standard',
      },
      {
        limb: 'right_wrist', start: 1_000, end: 2_000,
        errorIds: ['right-1', 'right-2'], emphasis: 'standard',
      },
    ])
  })
})
