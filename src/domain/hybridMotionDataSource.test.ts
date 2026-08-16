import { describe, expect, it } from 'vitest'
import { BLEMotionDataSource } from './bleMotionDataSource'
import { HybridMotionDataSource } from './hybridMotionDataSource'
import { MockMotionDataSource } from './mockMotionDataSource'
import type { ChoreographyEvent, MotionDataSource } from './types'

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
  it('filters adversarial non-left BLE samples from a hybrid playback window', () => {
    const ble: MotionDataSource = {
      kind: 'ble',
      async connect() {},
      async disconnect() {},
      getSamplesForWindow: () => [
        { timestamp: 1000, hardwareTimestamp: 9876, receivedAt: 11_000, limb: 'LEFT_WRIST', ax: 8, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 },
        { timestamp: 1000, hardwareTimestamp: 9999, receivedAt: 11_000, limb: 'RIGHT_WRIST', ax: 9, ay: 0, az: 1, gx: 0, gy: 0, gz: 0 },
      ],
      getSamples: () => [],
    }
    const source = new HybridMotionDataSource(ble, new MockMotionDataSource())

    const hardwareSamples = source.getSamplesForWindow(1000, 1000)
      .filter(sample => sample.hardwareTimestamp !== undefined)

    expect(hardwareSamples).toEqual([
      expect.objectContaining({ limb: 'LEFT_WRIST', hardwareTimestamp: 9876, receivedAt: 11_000 }),
    ])
  })

  it('does not substitute a Mock left wrist when the BLE window is empty', () => {
    const ble: MotionDataSource = {
      kind: 'ble',
      async connect() {},
      async disconnect() {},
      getSamplesForWindow: () => [],
      getSamples: () => [],
    }
    const source = new HybridMotionDataSource(ble, new MockMotionDataSource())

    const limbs = [...new Set(source.getSamplesForWindow(1000, 1040).map(sample => sample.limb))]

    expect(limbs).toEqual(['RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE'])
  })

  it('streams real buffered left-wrist samples and Mock samples for exactly the other three limbs', () => {
    const ble = realBleWithSample()
    ble.addEvent({
      type: 'imu',
      pod: 'left_wrist',
      hardwareTimestamp: 9926,
      receivedAt: 11_050,
      ax: 9,
      ay: 0,
      az: 1,
      gx: 0,
      gy: 0,
      gz: 0,
    })
    const source = new HybridMotionDataSource(ble, new MockMotionDataSource())

    const samples = source.getSamplesForWindow(1000, 1080)
    const leftWrist = samples.filter(sample => sample.limb === 'LEFT_WRIST')
    const mockLimbs = [...new Set(samples.filter(sample => sample.hardwareTimestamp === undefined).map(sample => sample.limb))]

    expect(leftWrist).toEqual([
      expect.objectContaining({ timestamp: 1000, hardwareTimestamp: 9876, receivedAt: 11_000, ax: 8 }),
      expect.objectContaining({ timestamp: 1050, hardwareTimestamp: 9926, receivedAt: 11_050, ax: 9 }),
    ])
    expect(mockLimbs).toEqual(['RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE'])
    expect(samples.filter(sample => sample.limb === 'RIGHT_WRIST')).toHaveLength(5)
    expect(samples.filter(sample => sample.limb === 'LEFT_ANKLE')).toHaveLength(5)
    expect(samples.filter(sample => sample.limb === 'RIGHT_ANKLE')).toHaveLength(5)
  })

  it('keeps the left wrist real after the selected hardware session disconnects', () => {
    const source = new HybridMotionDataSource(realBleWithSample(), new MockMotionDataSource())

    const samples = source.getSamplesForWindow(1000, 1080)

    expect(samples.filter(sample => sample.limb === 'LEFT_WRIST')).toEqual([
      expect.objectContaining({ hardwareTimestamp: 9876, receivedAt: 11_000 }),
    ])
  })

  it('returns buffered BLE data for the left wrist in a real-hardware session', () => {
    const source = new HybridMotionDataSource(
      realBleWithSample(),
      new MockMotionDataSource(),
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
    )

    const samples = source.getSamples({ ...leftWristEvent, id, limb })
    expect(samples.length).toBeGreaterThan(1)
    expect(samples.every(sample => sample.limb === limb)).toBe(true)
    expect(samples.every(sample => sample.hardwareTimestamp === undefined)).toBe(true)
  })

  it('never substitutes Mock data for the hybrid left wrist', () => {
    const source = new HybridMotionDataSource(
      realBleWithSample(),
      new MockMotionDataSource(),
    )

    const samples = source.getSamples(leftWristEvent)
    expect(samples).toEqual([
      expect.objectContaining({ limb: 'LEFT_WRIST', hardwareTimestamp: 9876, receivedAt: 11_000 }),
    ])
  })
})
