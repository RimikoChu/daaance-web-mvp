import type { ChoreographyEvent, IMUSample, MotionDataSource } from './types'

const DELAYS = [-90, 120, 80, 310, -40, 180, 60, 290, 100, -210, 40, 320]

export class MockMotionDataSource implements MotionDataSource {
  readonly kind = 'mock' as const

  async connect() {}
  async disconnect() {}

  getSamples(event: ChoreographyEvent): IMUSample[] {
    const index = Number(event.id.replace('c', '')) - 1
    const peak = event.time + (DELAYS[index] ?? 0)
    return [
      this.sample(event, peak - 70, 0.08, 2),
      this.sample(event, peak, 2.6, 110),
      this.sample(event, peak + 70, 0.12, 3),
    ]
  }

  private sample(event: ChoreographyEvent, timestamp: number, force: number, rotation: number): IMUSample {
    return { timestamp, limb: event.limb, ax: force, ay: force * 0.35, az: 1 + force * 0.2, gx: rotation, gy: rotation * 0.4, gz: rotation * 0.15 }
  }
}

export class BLEMotionDataSource implements MotionDataSource {
  readonly kind = 'ble' as const
  async connect() { throw new Error('BLE 尚未连接，已切换到模拟模式') }
  async disconnect() {}
  getSamples(_event: ChoreographyEvent): IMUSample[] { return [] }
}
