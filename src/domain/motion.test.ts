import { describe, expect, it } from 'vitest'
import { analyzeTiming, detectPeak, summarizeSession, timingErrorSeverity } from './motion'
import type { ChoreographyEvent, IMUSample, TimingResult } from './types'

const target: ChoreographyEvent = { id: 'e1', time: 5000, limb: 'RIGHT_ANKLE', cue: 'STEP', accent: false }

const samplesAround = (peakTime: number): IMUSample[] => [
  { timestamp: peakTime - 60, limb: 'RIGHT_ANKLE', ax: 0.1, ay: 0, az: 1, gx: 2, gy: 1, gz: 0 },
  { timestamp: peakTime, limb: 'RIGHT_ANKLE', ax: 2.8, ay: 1.2, az: 1.8, gx: 120, gy: 35, gz: 10 },
  { timestamp: peakTime + 60, limb: 'RIGHT_ANKLE', ax: 0.2, ay: 0, az: 1, gx: 3, gy: 1, gz: 0 },
]

describe('motion timing analysis', () => {
  it('detects the strongest motion energy peak', () => {
    expect(detectPeak(samplesAround(5270))?.timestamp).toBe(5270)
  })

  it('marks motion inside tolerance as correct', () => {
    expect(analyzeTiming(target, samplesAround(5180), 250)).toMatchObject({ status: 'correct', timingError: 180 })
  })

  it('marks positive timing error as late', () => {
    expect(analyzeTiming(target, samplesAround(5270), 250)).toMatchObject({ status: 'late', timingError: 270 })
  })

  it('marks negative timing error as early', () => {
    expect(analyzeTiming(target, samplesAround(4700), 250)).toMatchObject({ status: 'early', timingError: -300 })
  })

  it('marks absent motion as missed', () => {
    expect(analyzeTiming(target, [], 250).status).toBe('missed')
  })

  it.each([
    [-300, 'early', 'low'],
    [300, 'late', 'low'],
    [-301, 'early', 'medium'],
    [301, 'late', 'medium'],
    [-600, 'early', 'medium'],
    [600, 'late', 'medium'],
    [-601, 'early', 'high'],
    [601, 'late', 'high'],
  ] as const)('maps a %sms timing error to %s severity', (timingError, status, severity) => {
    expect(timingErrorSeverity({
      event: target,
      actualTime: target.time + timingError,
      timingError,
      status,
    })).toBe(severity)
  })

  it('maps a missed timing result with no timing error to high severity', () => {
    expect(timingErrorSeverity({
      event: target,
      actualTime: null,
      timingError: null,
      status: 'missed',
    })).toBe('high')
  })

  it('summarizes accuracy and the weakest limb', () => {
    const results: TimingResult[] = [
      { event: { ...target, limb: 'LEFT_WRIST' }, actualTime: 5050, timingError: 50, status: 'correct' },
      { event: { ...target, id: 'e2' }, actualTime: 5300, timingError: 300, status: 'late' },
    ]
    const summary = summarizeSession(results)
    expect(summary.accuracy).toBe(50)
    expect(summary.limbs.RIGHT_ANKLE.averageError).toBe(300)
  })
})
