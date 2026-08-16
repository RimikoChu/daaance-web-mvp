import { describe, expect, it } from 'vitest'
import { createDemoDetector, createImuTimingDetector } from './detectors'
import type { ChoreographyEvent, IMUSample } from '../domain/types'

const event: ChoreographyEvent = {
  id: 'c3', time: 5_000, limb: 'LEFT_WRIST', cue: 'MOVE', accent: false,
}

const samplesAround = (peakTime: number): IMUSample[] => [
  { timestamp: peakTime - 60, limb: 'LEFT_WRIST', ax: 0.1, ay: 0, az: 1, gx: 2, gy: 1, gz: 0 },
  { timestamp: peakTime, limb: 'LEFT_WRIST', ax: 2.8, ay: 1.2, az: 1.8, gx: 120, gy: 35, gz: 10 },
  { timestamp: peakTime + 60, limb: 'LEFT_WRIST', ax: 0.2, ay: 0, az: 1, gx: 3, gy: 1, gz: 0 },
]

describe('motion error detectors', () => {
  it('emits deterministic demo Timing, Direction, and Range fixtures for a choreography event', () => {
    const errors = createDemoDetector().detect({
      event,
      samples: samplesAround(5_400),
      receivedAt: 9_000,
    })

    expect(errors).toEqual([
      expect.objectContaining({
        id: 'demo-c3-timing', timestamp: 5_000, receivedAt: 9_000,
        limb: 'left_wrist', type: 'timing', severity: 'medium',
        source: 'demo', detector: 'demo-review-v1', details: { logicalErrorId: 'c3' },
      }),
      expect.objectContaining({
        id: 'demo-c3-direction', timestamp: 5_000, receivedAt: 9_000,
        limb: 'left_wrist', type: 'direction', severity: 'medium',
        source: 'demo', detector: 'demo-review-v1', details: { logicalErrorId: 'c3' },
      }),
      expect.objectContaining({
        id: 'demo-c3-range', timestamp: 5_000, receivedAt: 9_000,
        limb: 'left_wrist', type: 'range', severity: 'low',
        source: 'demo', detector: 'demo-review-v1', details: { logicalErrorId: 'c3' },
      }),
    ])
  })

  it('uses analyzeTiming under the requested strictness and never fabricates Direction or Range for IMU', () => {
    const input = { event, samples: samplesAround(4_800), receivedAt: 9_000 }

    expect(createImuTimingDetector('standard').detect(input)).toEqual([])
    expect(createImuTimingDetector('advanced').detect(input)).toEqual([
      expect.objectContaining({
        id: 'imu-c3-timing', timestamp: 4_800, receivedAt: 9_000,
        limb: 'left_wrist', type: 'timing', severity: 'low',
        source: 'imu', detector: 'imu-timing-v1',
        details: { logicalErrorId: 'c3', timingErrorMs: -200, timingStatus: 'early' },
      }),
    ])
  })
})
