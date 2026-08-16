import { TOLERANCE } from '../domain/choreography'
import { analyzeTiming, timingErrorSeverity } from '../domain/motion'
import type { ChoreographyEvent, IMUSample, Strictness } from '../domain/types'
import type { MotionErrorEvent } from './types'

export interface MotionDetectorInput {
  event: ChoreographyEvent
  samples: IMUSample[]
  receivedAt: number
}

export interface MotionErrorDetector {
  detect(input: MotionDetectorInput): MotionErrorEvent[]
}

const toPodId = (limb: ChoreographyEvent['limb']): MotionErrorEvent['limb'] => limb.toLowerCase() as MotionErrorEvent['limb']

export const createDemoDetector = (): MotionErrorDetector => ({
  detect: ({ event, receivedAt }) => ([
    {
      id: `demo-${event.id}-timing`,
      timestamp: event.time,
      receivedAt,
      limb: toPodId(event.limb),
      type: 'timing',
      severity: 'medium',
      source: 'demo',
      detector: 'demo-review-v1',
      details: { logicalErrorId: event.id },
    },
    {
      id: `demo-${event.id}-direction`,
      timestamp: event.time,
      receivedAt,
      limb: toPodId(event.limb),
      type: 'direction',
      severity: 'medium',
      source: 'demo',
      detector: 'demo-review-v1',
      details: { logicalErrorId: event.id },
    },
    {
      id: `demo-${event.id}-range`,
      timestamp: event.time,
      receivedAt,
      limb: toPodId(event.limb),
      type: 'range',
      severity: 'low',
      source: 'demo',
      detector: 'demo-review-v1',
      details: { logicalErrorId: event.id },
    },
  ]),
})

export const createImuTimingDetector = (strictness: Strictness): MotionErrorDetector => ({
  detect: ({ event, samples, receivedAt }) => {
    const result = analyzeTiming(event, samples, TOLERANCE[strictness])
    if (result.status === 'correct') return []

    return [{
      id: `imu-${event.id}-timing`,
      timestamp: result.actualTime ?? event.time,
      receivedAt,
      limb: toPodId(event.limb),
      type: 'timing',
      severity: timingErrorSeverity(result),
      source: 'imu',
      detector: 'imu-timing-v1',
      details: {
        logicalErrorId: event.id,
        timingErrorMs: result.timingError,
        timingStatus: result.status,
      },
    }]
  },
})
