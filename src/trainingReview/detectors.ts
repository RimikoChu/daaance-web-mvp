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

export type DetectorDiagnostic = 'detector-threw' | 'invalid-output'

const POD_IDS = new Set<MotionErrorEvent['limb']>(['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle'])
const ERROR_TYPES = new Set<MotionErrorEvent['type']>(['timing', 'direction', 'range'])
const SEVERITIES = new Set<MotionErrorEvent['severity']>(['low', 'medium', 'high'])
const SOURCES = new Set<MotionErrorEvent['source']>(['demo', 'imu'])

const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const isTimestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

const isJsonValue = (value: unknown, ancestors = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (ancestors.has(value)) return false

  ancestors.add(value)
  try {
    if (Array.isArray(value)) return value.every(item => isJsonValue(item, ancestors))
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false
    return Object.values(value).every(item => isJsonValue(item, ancestors))
  } finally {
    ancestors.delete(value)
  }
}

export const isMotionErrorEvent = (value: unknown): value is MotionErrorEvent => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const event = value as Record<string, unknown>
  return isNonEmptyString(event.id)
    && isTimestamp(event.timestamp)
    && isTimestamp(event.receivedAt)
    && POD_IDS.has(event.limb as MotionErrorEvent['limb'])
    && ERROR_TYPES.has(event.type as MotionErrorEvent['type'])
    && SEVERITIES.has(event.severity as MotionErrorEvent['severity'])
    && SOURCES.has(event.source as MotionErrorEvent['source'])
    && isNonEmptyString(event.detector)
    && (event.confidence === undefined || (typeof event.confidence === 'number' && Number.isFinite(event.confidence)))
    && (event.details === undefined || isJsonValue(event.details))
    && isJsonValue(value)
}

export const detectValidatedMotionErrors = (
  detector: MotionErrorDetector,
  input: MotionDetectorInput,
  onDiagnostic?: (diagnostic: DetectorDiagnostic) => void,
): MotionErrorEvent[] => {
  try {
    const output: unknown = detector.detect(input)
    if (!Array.isArray(output)) {
      onDiagnostic?.('invalid-output')
      return []
    }

    const events = output.filter(isMotionErrorEvent)
    if (events.length !== output.length) onDiagnostic?.('invalid-output')
    return events
  } catch {
    onDiagnostic?.('detector-threw')
    return []
  }
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
