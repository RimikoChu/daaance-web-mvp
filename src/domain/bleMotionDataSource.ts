import type { BluetoothPodEvent } from '../hardware/ble/bleTypes'
import type { ChoreographyEvent, IMUSample, MotionDataSource } from './types'

type ImuEvent = Extract<BluetoothPodEvent, { type: 'imu' }>

const BUFFER_DURATION_MS = 30_000
const MAX_BUFFERED_SAMPLES = 2000
const EVENT_WINDOW_MS = 500

export class BLEMotionDataSource implements MotionDataSource {
  readonly kind = 'ble' as const
  private events: ImuEvent[] = []
  private sessionStartReceivedAt = 0
  private latestReceivedAt = Number.NEGATIVE_INFINITY

  async connect() {}
  async disconnect() {}

  addEvent(event: ImuEvent): void {
    this.latestReceivedAt = Math.max(this.latestReceivedAt, event.receivedAt)
    this.events.push(event)

    const earliestReceivedAt = this.latestReceivedAt - BUFFER_DURATION_MS
    this.events = this.events
      .filter(sample => sample.receivedAt >= earliestReceivedAt)
      .slice(-MAX_BUFFERED_SAMPLES)
  }

  startSession(receivedAt: number): void {
    this.sessionStartReceivedAt = receivedAt
  }

  clear(): void {
    this.events = []
    this.latestReceivedAt = Number.NEGATIVE_INFINITY
  }

  getSamplesForWindow(startMs: number, endMs: number): IMUSample[] {
    return this.events.flatMap(sample => {
      const timestamp = sample.receivedAt - this.sessionStartReceivedAt
      if (timestamp < startMs || timestamp > endMs) return []

      return [{
        timestamp,
        hardwareTimestamp: sample.hardwareTimestamp,
        receivedAt: sample.receivedAt,
        limb: 'LEFT_WRIST',
        ax: sample.ax,
        ay: sample.ay,
        az: sample.az,
        gx: sample.gx,
        gy: sample.gy,
        gz: sample.gz,
      }]
    })
  }

  getSamples(event: ChoreographyEvent): IMUSample[] {
    if (event.limb !== 'LEFT_WRIST') return []
    return this.getSamplesForWindow(event.time - EVENT_WINDOW_MS, event.time + EVENT_WINDOW_MS)
  }
}
