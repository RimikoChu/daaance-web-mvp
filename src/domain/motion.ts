import { LIMB_LABEL } from './choreography'
import type {
  ChoreographyEvent,
  IMUSample,
  Limb,
  LimbSummary,
  SessionSummary,
  TimingErrorSeverity,
  TimingResult,
} from './types'

export const TIMING_ERROR_BANDS = {
  low: 300,
  medium: 600,
} as const

export const timingErrorSeverity = (result: TimingResult): TimingErrorSeverity => {
  if (result.status === 'missed' || result.timingError === null) return 'high'

  const absoluteError = Math.abs(result.timingError)
  if (absoluteError <= TIMING_ERROR_BANDS.low) return 'low'
  if (absoluteError <= TIMING_ERROR_BANDS.medium) return 'medium'
  return 'high'
}

const energy = (sample: IMUSample) => {
  const accel = Math.hypot(sample.ax, sample.ay, sample.az - 1)
  const gyro = Math.hypot(sample.gx, sample.gy, sample.gz) / 80
  return accel + gyro
}

export function detectPeak(samples: IMUSample[]): IMUSample | null {
  if (samples.length === 0) return null
  const peak = samples.reduce((best, sample) => energy(sample) > energy(best) ? sample : best)
  return energy(peak) >= 1 ? peak : null
}

export function analyzeTiming(event: ChoreographyEvent, samples: IMUSample[], tolerance: number): TimingResult {
  const peak = detectPeak(samples.filter(sample => sample.limb === event.limb))
  if (!peak) return { event, actualTime: null, timingError: null, status: 'missed' }
  const timingError = peak.timestamp - event.time
  const status = Math.abs(timingError) <= tolerance ? 'correct' : timingError < 0 ? 'early' : 'late'
  return { event, actualTime: peak.timestamp, timingError, status }
}

const LIMBS: Limb[] = ['LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE']

export function summarizeSession(results: TimingResult[]): SessionSummary {
  const correct = results.filter(result => result.status === 'correct').length
  const limbs = Object.fromEntries(LIMBS.map(limb => {
    const own = results.filter(result => result.event.limb === limb)
    const errors = own.map(result => result.timingError).filter((value): value is number => value !== null)
    const averageError = errors.length ? Math.round(errors.reduce((sum, value) => sum + value, 0) / errors.length) : null
    const ownCorrect = own.filter(result => result.status === 'correct').length
    const tendency: LimbSummary['tendency'] = ownCorrect === own.length && own.length > 0
      ? 'good'
      : averageError === null ? 'missed' : averageError > 0 ? 'late' : 'early'
    return [limb, { label: LIMB_LABEL[limb], total: own.length, correct: ownCorrect, averageError, tendency }]
  })) as Record<Limb, LimbSummary>

  const weakest = LIMBS.map(limb => limbs[limb]).sort((a, b) => a.correct / Math.max(a.total, 1) - b.correct / Math.max(b.total, 1))[0]
  const coaching = weakest.tendency === 'good'
    ? '你的四肢节奏很稳定，继续保持现在的动作进入时机。'
    : weakest.tendency === 'late'
      ? `整体节奏不错。下一次让${weakest.label}的动作稍微提前进入。`
      : weakest.tendency === 'early'
        ? `动作能量很好。下一次让${weakest.label}稍微多等半拍。`
        : `没有捕捉到${weakest.label}的部分动作，下一次可以把动作做得更明确。`

  return { accuracy: results.length ? Math.round(correct / results.length * 100) : 0, limbs, coaching }
}
