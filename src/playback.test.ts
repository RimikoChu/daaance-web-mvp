import { describe, expect, it } from 'vitest'
import { clampTime, getSegmentBounds, getTeachingSegment, seekBy } from './playback'

describe('dance playback math', () => {
  it('clamps direct time inputs and normalizes non-finite values to zero', () => {
    expect(clampTime(7)).toBe(7)
    expect(clampTime(20)).toBe(18.655)
    expect(clampTime(-2)).toBe(0)
    expect(clampTime(Number.NaN)).toBe(0)
    expect(clampTime(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampTime(Number.NEGATIVE_INFINITY)).toBe(0)
    expect(clampTime(7, Number.NaN)).toBe(0)
    expect(clampTime(7, Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampTime(7, Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('seeks exactly five seconds and clamps at both ends', () => {
    expect(seekBy(7, -5)).toBe(2)
    expect(seekBy(17, 5)).toBe(18.655)
    expect(seekBy(2, -5)).toBe(0)
  })

  it('maps playback time into three equal teaching segments', () => {
    expect(getTeachingSegment(0)).toBe(0)
    expect(getTeachingSegment(6.3)).toBe(1)
    expect(getTeachingSegment(13)).toBe(2)
    expect(getSegmentBounds(2)).toEqual({ start: 12.436666666666667, end: 18.655 })
  })

  it('switches segments exactly at each one-third duration boundary', () => {
    const duration = 18.655

    expect(getTeachingSegment(duration / 3, duration)).toBe(1)
    expect(getTeachingSegment(2 * duration / 3, duration)).toBe(2)
  })
})
