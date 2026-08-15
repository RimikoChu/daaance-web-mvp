export const DANCE_DURATION_SECONDS = 18.655

const TEACHING_SEGMENT_COUNT = 3

function normalizeDuration(duration?: number): number {
  const value = duration ?? DANCE_DURATION_SECONDS
  return Number.isFinite(value) ? Math.max(value, 0) : 0
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0
}

export function clampTime(time: number, duration?: number): number {
  return Math.min(Math.max(finiteOrZero(time), 0), normalizeDuration(duration))
}

export function seekBy(current: number, delta: number, duration?: number): number {
  return clampTime(finiteOrZero(current) + finiteOrZero(delta), duration)
}

export function getTeachingSegment(time: number, duration?: number): number {
  const normalizedDuration = normalizeDuration(duration)

  if (normalizedDuration === 0) {
    return 0
  }

  return Math.min(
    Math.floor(clampTime(time, normalizedDuration) / (normalizedDuration / TEACHING_SEGMENT_COUNT)),
    TEACHING_SEGMENT_COUNT - 1,
  )
}

export function getSegmentBounds(
  segment: number,
  duration?: number,
): { start: number; end: number } {
  const normalizedDuration = normalizeDuration(duration)
  const normalizedSegment = Math.min(
    Math.max(Math.trunc(finiteOrZero(segment)), 0),
    TEACHING_SEGMENT_COUNT - 1,
  )
  const segmentLength = normalizedDuration / TEACHING_SEGMENT_COUNT
  const start = normalizedSegment * segmentLength

  return {
    start,
    end: normalizedSegment === TEACHING_SEGMENT_COUNT - 1 ? normalizedDuration : start + segmentLength,
  }
}
