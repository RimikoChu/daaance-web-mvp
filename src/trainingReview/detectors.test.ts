import { describe, expect, it, vi } from 'vitest'
import { detectValidatedMotionErrors, createDemoDetector, createImuTimingDetector } from './detectors'
import type { ChoreographyEvent, IMUSample } from '../domain/types'
import type { MotionErrorDetector } from './detectors'
import type { MotionErrorEvent } from './types'

const event: ChoreographyEvent = {
  id: 'c3', time: 5_000, limb: 'LEFT_WRIST', cue: 'MOVE', accent: false,
}

const samplesAround = (peakTime: number): IMUSample[] => [
  { timestamp: peakTime - 60, limb: 'LEFT_WRIST', ax: 0.1, ay: 0, az: 1, gx: 2, gy: 1, gz: 0 },
  { timestamp: peakTime, limb: 'LEFT_WRIST', ax: 2.8, ay: 1.2, az: 1.8, gx: 120, gy: 35, gz: 10 },
  { timestamp: peakTime + 60, limb: 'LEFT_WRIST', ax: 0.2, ay: 0, az: 1, gx: 3, gy: 1, gz: 0 },
]

const detectorInput = { event, samples: samplesAround(5_400), receivedAt: 9_000 }
const validError: MotionErrorEvent = {
  id: 'validated-c3', timestamp: 5_000, receivedAt: 9_000,
  limb: 'left_wrist', type: 'timing', severity: 'medium',
  source: 'imu', detector: 'test-detector',
}

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

  it('isolates a thrown detector and malformed return, then permits a later valid detection', () => {
    const detector: MotionErrorDetector = {
      detect: vi.fn()
        .mockImplementationOnce(() => { throw new Error('bad detector') })
        .mockReturnValueOnce({ invalid: 'not-an-array' })
        .mockReturnValueOnce([validError]),
    }
    const diagnostic = vi.fn()

    expect(detectValidatedMotionErrors(detector, detectorInput, diagnostic)).toEqual([])
    expect(detectValidatedMotionErrors(detector, detectorInput, diagnostic)).toEqual([])
    expect(detectValidatedMotionErrors(detector, detectorInput, diagnostic)).toEqual([validError])
    expect(diagnostic).toHaveBeenCalledWith('detector-threw')
    expect(diagnostic).toHaveBeenCalledWith('invalid-output')
  })

  it.each([
    ['id', { ...validError, id: '' }],
    ['timestamp', { ...validError, timestamp: Number.NaN }],
    ['receivedAt', { ...validError, receivedAt: -1 }],
    ['limb', { ...validError, limb: 'elbow' }],
    ['type', { ...validError, type: 'posture' }],
    ['severity', { ...validError, severity: 'urgent' }],
    ['source', { ...validError, source: 'camera' }],
    ['detector', { ...validError, detector: '' }],
  ])('rejects a malformed standardized %s field before it reaches review state', (_field, malformed) => {
    const detector = { detect: () => [malformed] } as unknown as MotionErrorDetector

    expect(detectValidatedMotionErrors(detector, detectorInput)).toEqual([])
  })

  it('rejects a non-serializable detector payload before the ledger can process it', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const detector = { detect: () => [{ ...validError, debug: circular }] } as unknown as MotionErrorDetector

    expect(detectValidatedMotionErrors(detector, detectorInput)).toEqual([])
  })
})
