export type Limb = 'LEFT_WRIST' | 'RIGHT_WRIST' | 'LEFT_ANKLE' | 'RIGHT_ANKLE'
export type TrainingMode = 'accessibility' | 'rhythm'
export type Strictness = 'beginner' | 'standard' | 'advanced'

export interface ChoreographyEvent {
  id: string
  time: number
  limb: Limb
  cue: 'MOVE' | 'STEP'
  accent: boolean
  voice?: string
}

export interface IMUSample {
  timestamp: number
  hardwareTimestamp?: number
  receivedAt?: number
  limb: Limb
  ax: number
  ay: number
  az: number
  gx: number
  gy: number
  gz: number
}

export type TimingStatus = 'correct' | 'early' | 'late' | 'missed'

export interface TimingResult {
  event: ChoreographyEvent
  actualTime: number | null
  timingError: number | null
  status: TimingStatus
}

export interface MotionDataSource {
  readonly kind: 'mock' | 'ble' | 'hybrid'
  connect(): Promise<void>
  disconnect(): Promise<void>
  getSamples(event: ChoreographyEvent): IMUSample[]
}

export interface LimbSummary {
  label: string
  total: number
  correct: number
  averageError: number | null
  tendency: TimingStatus | 'good'
}

export interface SessionSummary {
  accuracy: number
  limbs: Record<Limb, LimbSummary>
  coaching: string
}
