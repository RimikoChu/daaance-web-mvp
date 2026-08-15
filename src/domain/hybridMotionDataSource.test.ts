import { describe, expect, it } from 'vitest'
import { BLEMotionDataSource } from './bleMotionDataSource'
import { HybridMotionDataSource } from './hybridMotionDataSource'
import { MockMotionDataSource } from './mockMotionDataSource'
import type { ChoreographyEvent } from './types'

const leftWristEvent: ChoreographyEvent = {
  id: 'c1',
  time: 1000,
  limb: 'LEFT_WRIST',
  cue: 'MOVE',
  accent: false,
}

function realBleWithSample(): BLEMotionDataSource {
  const source = new BLEMotionDataSource()
  source.startSession(10_000)
  source.addEvent({
    type: 'imu',
    pod: 'left_wrist',
    hardwareTimestamp: 9876,
    receivedAt: 11_000,
    ax: 8,
    ay: 0,
    az: 1,
    gx: 0,
    gy: 0,
    gz: 0,
  })
  return source
}

describe('HybridMotionDataSource', () => {
  it('returns buffered BLE data for the left wrist in a real-hardware session', () => {
    const source = new HybridMotionDataSource(
      realBleWithSample(),
      new MockMotionDataSource(),
      () => true,
    )

    expect(source.getSamples(leftWristEvent)).toEqual([
      expect.objectContaining({
        timestamp: 1000,
        limb: 'LEFT_WRIST',
        hardwareTimestamp: 9876,
        receivedAt: 11_000,
        ax: 8,
      }),
    ])
  })

  it.each([
    ['c2', 'RIGHT_WRIST'],
    ['c3', 'LEFT_ANKLE'],
    ['c4', 'RIGHT_ANKLE'],
  ] as const)('returns Mock data for %s/%s in a real-hardware session', (id, limb) => {
    const source = new HybridMotionDataSource(
      realBleWithSample(),
      new MockMotionDataSource(),
      () => true,
    )

    const samples = source.getSamples({ ...leftWristEvent, id, limb })
    expect(samples).toHaveLength(3)
    expect(samples.map(sample => sample.limb)).toEqual([limb, limb, limb])
    expect(samples.every(sample => sample.hardwareTimestamp === undefined)).toBe(true)
  })

  it('returns Mock data for the left wrist in an explicit Demo session', () => {
    const source = new HybridMotionDataSource(
      realBleWithSample(),
      new MockMotionDataSource(),
      () => false,
    )

    const samples = source.getSamples(leftWristEvent)
    expect(samples).toHaveLength(3)
    expect(samples.every(sample => sample.hardwareTimestamp === undefined)).toBe(true)
    expect(samples.map(sample => sample.timestamp)).toEqual([840, 910, 980])
  })
})
