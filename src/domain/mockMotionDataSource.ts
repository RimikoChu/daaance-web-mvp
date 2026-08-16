import type { ChoreographyEvent, IMUSample, MotionDataSource } from './types'
import { CHOREOGRAPHY } from './choreography'

const SAMPLE_INTERVAL_MS = 20
const EVENT_WINDOW_MS = 500
const LIMBS = ['LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE'] as const
const LIMB_PHASES = [0, 0.9, 1.8, 2.7]
const DELAYS = [-90, 120, 80, 310, -40, 180, 60, 290, 100, -210, 40, 320]

export class MockMotionDataSource implements MotionDataSource {
  readonly kind = 'mock' as const

  async connect() {}
  async disconnect() {}

  getSamplesForWindow(startMs: number, endMs: number): IMUSample[] {
    const firstTimestamp = Math.ceil(startMs / SAMPLE_INTERVAL_MS) * SAMPLE_INTERVAL_MS
    const samples: IMUSample[] = []

    for (let timestamp = firstTimestamp; timestamp <= endMs; timestamp += SAMPLE_INTERVAL_MS) {
      LIMBS.forEach((limb, index) => samples.push(this.continuousSample(limb, timestamp, LIMB_PHASES[index])))
    }

    samples.push(...CHOREOGRAPHY.flatMap((event, index) => {
      const timestamp = event.time + (DELAYS[index] ?? 0)
      return timestamp >= startMs && timestamp <= endMs ? [this.focusPeakSample(event, timestamp)] : []
    }))

    return samples
  }

  getSamples(event: ChoreographyEvent): IMUSample[] {
    return this.getSamplesForWindow(event.time - EVENT_WINDOW_MS, event.time + EVENT_WINDOW_MS)
      .filter(sample => sample.limb === event.limb)
  }

  private continuousSample(limb: IMUSample['limb'], timestamp: number, phase: number): IMUSample {
    const cycle = timestamp / 320 + phase
    const force = 0.25 + Math.sin(cycle) * 0.12
    const rotation = 10 + Math.cos(cycle * 1.4) * 12
    return { timestamp, limb, ax: force, ay: force * 0.35, az: 1 + force * 0.2, gx: rotation, gy: rotation * 0.4, gz: rotation * 0.15 }
  }

  private focusPeakSample(event: ChoreographyEvent, timestamp: number): IMUSample {
    return { timestamp, limb: event.limb, ax: 2.6, ay: 0.91, az: 1.52, gx: 110, gy: 44, gz: 16 }
  }
}
