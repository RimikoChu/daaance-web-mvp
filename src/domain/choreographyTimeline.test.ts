import { describe, expect, it } from 'vitest'
import {
  cloneDefaultTimeline,
  normalizeTimeline,
  TimelineValidationError,
  toChoreographyEvents,
} from './choreographyTimeline'

describe('choreography timeline', () => {
  it('provides an independent default document for the fixed demo', () => {
    const first = cloneDefaultTimeline()
    const second = cloneDefaultTimeline()

    expect(first).toMatchObject({ schemaVersion: 1, danceId: 'demo-dance-001', durationMs: 18660 })
    expect(first.beats).toEqual([])
    first.beats.push({ id: 'manual', timeMs: 1000, intensity: 'medium', limb: 'left_wrist' })
    expect(second.beats).toEqual([])
  })

  it('normalizes sorting and replaces the client timestamp', () => {
    const input = {
      schemaVersion: 1,
      danceId: 'demo-dance-001',
      durationMs: 18660,
      updatedAt: 'client-time',
      beats: [
        { id: 'later', timeMs: 5000, intensity: 'light', limb: 'left_wrist' },
        { id: 'earlier', timeMs: 1000, intensity: 'strong', limb: 'right_ankle' },
      ],
    }

    expect(normalizeTimeline(input, () => new Date('2026-08-16T00:00:00.000Z'))).toEqual({
      ...input,
      updatedAt: '2026-08-16T00:00:00.000Z',
      beats: [input.beats[1], input.beats[0]],
    })
  })

  it.each([
    ['duplicate ids', { beats: [
      { id: 'same', timeMs: 1000, intensity: 'medium', limb: 'left_wrist' },
      { id: 'same', timeMs: 2000, intensity: 'medium', limb: 'right_wrist' },
    ] }],
    ['out-of-range time', { beats: [{ id: 'bad', timeMs: 18661, intensity: 'medium', limb: 'left_wrist' }] }],
    ['invalid intensity', { beats: [{ id: 'bad', timeMs: 1000, intensity: 'huge', limb: 'left_wrist' }] }],
    ['invalid limb', { beats: [{ id: 'bad', timeMs: 1000, intensity: 'medium', limb: 'head' }] }],
  ])('rejects %s', (_name, change) => {
    const input = { ...cloneDefaultTimeline(), ...change }
    expect(() => normalizeTimeline(input)).toThrow(TimelineValidationError)
  })

  it('adapts serializable beats to existing training events', () => {
    const timeline = {
      ...cloneDefaultTimeline(),
      beats: [{ id: 'beat-1', timeMs: 3210, intensity: 'strong' as const, limb: 'right_ankle' as const }],
    }

    expect(toChoreographyEvents(timeline)).toEqual([
      { id: 'beat-1', time: 3210, limb: 'RIGHT_ANKLE', cue: 'STEP', accent: true },
    ])
  })
})
