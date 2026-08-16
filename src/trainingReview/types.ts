import type { DaaancePodId } from '../hardware/ble/bleTypes'

export type MotionErrorType = 'timing' | 'direction' | 'range'
export type MotionErrorSeverity = 'low' | 'medium' | 'high'
export type MotionErrorSource = 'demo' | 'imu'

export interface MotionErrorEvent {
  id: string
  timestamp: number
  receivedAt: number
  limb: DaaancePodId
  type: MotionErrorType
  severity: MotionErrorSeverity
  source: MotionErrorSource
  detector: string
  confidence?: number
  details?: Record<string, unknown>
}

export interface FeedbackCommandEvent {
  id: string
  errorEventId: string
  command: 'FEEDBACK_ERROR'
  sentAt: number
  status: 'sent' | 'failed'
  failureReason?: string
}

export interface FeedbackExecutionEvent {
  id: string
  errorEventId?: string
  pod: DaaancePodId
  hardwareTimestamp: number
  receivedAt: number
  feedback: 'ERROR'
  outputs: Array<'LED' | 'VIBRATION'>
}

export interface ReviewRange {
  limb: DaaancePodId
  start: number
  end: number
  errorIds: string[]
  emphasis: 'standard' | 'strong'
}

export interface TrainingSessionSnapshot {
  schemaVersion: '1.0.0'
  sessionId: string
  startedAt: number
  errors: MotionErrorEvent[]
  commands: FeedbackCommandEvent[]
  executions: FeedbackExecutionEvent[]
}

export interface TrainingSessionLedger {
  appendError: (event: MotionErrorEvent) => void
  appendCommand: (event: FeedbackCommandEvent) => void
  appendExecution: (event: FeedbackExecutionEvent) => void
  snapshot: () => TrainingSessionSnapshot
}
