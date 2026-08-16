import { describe, expect, it } from 'vitest'
import { CHOREOGRAPHY } from './choreography'
import { MockMotionDataSource } from './mockMotionDataSource'
import { detectPeak } from './motion'

describe('MockMotionDataSource', () => {
  it('streams multiple deterministic samples for every limb in a playback window', () => {
    const samples = new MockMotionDataSource().getSamplesForWindow(1000, 1100)

    expect(samples.map(sample => sample.limb)).toEqual([
      'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE',
      'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE',
      'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE',
      'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE',
      'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE',
      'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE',
    ])
    expect(samples.filter(sample => sample.limb === 'LEFT_WRIST')).toHaveLength(6)
    expect(samples.filter(sample => sample.limb === 'RIGHT_WRIST')).toHaveLength(6)
    expect(samples.filter(sample => sample.limb === 'LEFT_ANKLE')).toHaveLength(6)
    expect(samples.filter(sample => sample.limb === 'RIGHT_ANKLE')).toHaveLength(6)
    expect(samples.map(sample => sample.timestamp)).toEqual([
      1000, 1000, 1000, 1000,
      1020, 1020, 1020, 1020,
      1040, 1040, 1040, 1040,
      1060, 1060, 1060, 1060,
      1080, 1080, 1080, 1080,
      1100, 1100, 1100, 1100,
    ])
  })

  it('returns a chronological playback window when it includes a choreography focus peak', () => {
    const samples = new MockMotionDataSource().getSamplesForWindow(1900, 1920)

    expect(samples.map(sample => sample.timestamp)).toEqual([
      1900, 1900, 1900, 1900,
      1910,
      1920, 1920, 1920, 1920,
    ])
  })

  it.each([
    ['c1', 1910],
    ['c2', 3320],
    ['c3', 4580],
    ['c4', 6010],
  ])('keeps %s as the choreography focus peak while other limbs stream continuously', (eventId, peakTimestamp) => {
    const event = CHOREOGRAPHY.find(candidate => candidate.id === eventId)
    if (!event) throw new Error(`Missing choreography event ${eventId}`)

    const samples = new MockMotionDataSource().getSamples(event)

    expect(samples.every(sample => sample.limb === event.limb)).toBe(true)
    expect(detectPeak(samples)?.timestamp).toBe(peakTimestamp)
  })
})
