import { describe, expect, it } from 'vitest'
import type { BluetoothPodEvent } from '../hardware/ble/bleTypes'
import { BLEMotionDataSource } from './bleMotionDataSource'
import type { ChoreographyEvent } from './types'

type ImuEvent = Extract<BluetoothPodEvent, { type: 'imu' }>

const leftWristEvent: ChoreographyEvent = {
  id: 'c1',
  time: 5000,
  limb: 'LEFT_WRIST',
  cue: 'MOVE',
  accent: false,
}

function imu(receivedAt: number, hardwareTimestamp: number, ax = 0.1): ImuEvent {
  return {
    type: 'imu',
    pod: 'left_wrist',
    hardwareTimestamp,
    receivedAt,
    ax,
    ay: 0.2,
    az: 1.1,
    gx: 2,
    gy: 3,
    gz: 4,
  }
}

describe('BLEMotionDataSource', () => {
  it('returns real samples in the event window with training-relative and original clocks', () => {
    const source = new BLEMotionDataSource()
    source.startSession(10_000)
    source.addEvent(imu(14_600, 104_600, 1))
    source.addEvent(imu(15_400, 105_400, 2))
    source.addEvent(imu(15_501, 105_501, 3))

    expect(source.getSamples(leftWristEvent)).toEqual([
      {
        timestamp: 4600,
        hardwareTimestamp: 104_600,
        receivedAt: 14_600,
        limb: 'LEFT_WRIST',
        ax: 1,
        ay: 0.2,
        az: 1.1,
        gx: 2,
        gy: 3,
        gz: 4,
      },
      {
        timestamp: 5400,
        hardwareTimestamp: 105_400,
        receivedAt: 15_400,
        limb: 'LEFT_WRIST',
        ax: 2,
        ay: 0.2,
        az: 1.1,
        gx: 2,
        gy: 3,
        gz: 4,
      },
    ])
  })

  it('evicts samples more than 30 seconds older than the newest received sample', () => {
    const source = new BLEMotionDataSource()
    source.startSession(0)
    source.addEvent(imu(1000, 1))
    source.addEvent(imu(31_001, 2))

    expect(source.getSamples({ ...leftWristEvent, time: 1000 })).toEqual([])
  })

  it('keeps no more than the latest 2000 samples', () => {
    const source = new BLEMotionDataSource()
    source.startSession(0)
    for (let index = 0; index < 2001; index += 1) {
      source.addEvent(imu(5000, index))
    }

    const samples = source.getSamples(leftWristEvent)
    expect(samples).toHaveLength(2000)
    expect(samples[0]?.hardwareTimestamp).toBe(1)
    expect(samples.at(-1)?.hardwareTimestamp).toBe(2000)
  })

  it('clear removes buffered hardware samples', () => {
    const source = new BLEMotionDataSource()
    source.startSession(0)
    source.addEvent(imu(5000, 1))

    source.clear()

    expect(source.getSamples(leftWristEvent)).toEqual([])
  })

  it('does not expose left-wrist samples for another limb', () => {
    const source = new BLEMotionDataSource()
    source.startSession(0)
    source.addEvent(imu(5000, 1))

    expect(source.getSamples({ ...leftWristEvent, limb: 'RIGHT_WRIST' })).toEqual([])
  })
})
