import type { ChoreographyEvent, Limb } from './types'

export type BeatIntensity = 'light' | 'medium' | 'strong'
export type StudioLimb = 'left_wrist' | 'right_wrist' | 'left_ankle' | 'right_ankle'

export interface KeyBeat {
  id: string
  timeMs: number
  intensity: BeatIntensity
  limb: StudioLimb
}

export interface ChoreographyTimeline {
  schemaVersion: 1
  danceId: 'demo-dance-001'
  durationMs: 18660
  updatedAt: string
  beats: KeyBeat[]
}

export class TimelineValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimelineValidationError'
  }
}

const INTENSITIES: BeatIntensity[] = ['light', 'medium', 'strong']
const LIMBS: StudioLimb[] = ['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle']
const DEFAULT_BEATS: KeyBeat[] = []

export const DEFAULT_TIMELINE: Readonly<ChoreographyTimeline> = Object.freeze({
  schemaVersion: 1,
  danceId: 'demo-dance-001',
  durationMs: 18660,
  updatedAt: '2026-08-15T00:00:00.000Z',
  beats: Object.freeze(DEFAULT_BEATS.map(beat => Object.freeze({ ...beat }))) as unknown as KeyBeat[],
})

export function cloneDefaultTimeline(): ChoreographyTimeline {
  return {
    schemaVersion: 1,
    danceId: 'demo-dance-001',
    durationMs: 18660,
    updatedAt: DEFAULT_TIMELINE.updatedAt,
    beats: DEFAULT_TIMELINE.beats.map(beat => ({ ...beat })),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseBeat(value: unknown, ids: Set<string>): KeyBeat {
  if (!isRecord(value)) throw new TimelineValidationError('Each beat must be an object.')
  const { id, timeMs, intensity, limb } = value
  if (typeof id !== 'string' || id.trim() === '') throw new TimelineValidationError('Each beat requires a non-empty id.')
  if (ids.has(id)) throw new TimelineValidationError(`Duplicate beat id: ${id}`)
  if (!Number.isInteger(timeMs) || (timeMs as number) < 0 || (timeMs as number) > 18660) {
    throw new TimelineValidationError(`Beat ${id} has an invalid timeMs.`)
  }
  if (!INTENSITIES.includes(intensity as BeatIntensity)) throw new TimelineValidationError(`Beat ${id} has an invalid intensity.`)
  if (!LIMBS.includes(limb as StudioLimb)) throw new TimelineValidationError(`Beat ${id} has an invalid limb.`)
  ids.add(id)
  return { id, timeMs: timeMs as number, intensity: intensity as BeatIntensity, limb: limb as StudioLimb }
}

export function normalizeTimeline(input: unknown, now: () => Date = () => new Date()): ChoreographyTimeline {
  if (!isRecord(input)) throw new TimelineValidationError('Timeline must be an object.')
  if (input.schemaVersion !== 1) throw new TimelineValidationError('Unsupported schemaVersion.')
  if (input.danceId !== 'demo-dance-001') throw new TimelineValidationError('Unsupported danceId.')
  if (input.durationMs !== 18660) throw new TimelineValidationError('durationMs must be 18660.')
  if (!Array.isArray(input.beats)) throw new TimelineValidationError('beats must be an array.')
  const ids = new Set<string>()
  const beats = input.beats.map(beat => parseBeat(beat, ids)).sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id))
  return {
    schemaVersion: 1,
    danceId: 'demo-dance-001',
    durationMs: 18660,
    updatedAt: now().toISOString(),
    beats,
  }
}

const TRAINING_LIMBS: Record<StudioLimb, Limb> = {
  left_wrist: 'LEFT_WRIST',
  right_wrist: 'RIGHT_WRIST',
  left_ankle: 'LEFT_ANKLE',
  right_ankle: 'RIGHT_ANKLE',
}

export function toChoreographyEvents(timeline: ChoreographyTimeline): ChoreographyEvent[] {
  return timeline.beats.map(beat => ({
    id: beat.id,
    time: beat.timeMs,
    limb: TRAINING_LIMBS[beat.limb],
    cue: beat.limb.endsWith('wrist') ? 'MOVE' : 'STEP',
    accent: beat.intensity === 'strong',
  }))
}
