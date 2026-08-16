import type { ChoreographyEvent, IMUSample, MotionDataSource } from './types'

const EVENT_WINDOW_MS = 500

export class HybridMotionDataSource implements MotionDataSource {
  readonly kind = 'hybrid' as const

  constructor(
    private readonly ble: MotionDataSource,
    private readonly mock: MotionDataSource,
  ) {}

  async connect() {}
  async disconnect() {}

  getSamplesForWindow(startMs: number, endMs: number): IMUSample[] {
    const mockSamples = this.mock.getSamplesForWindow(startMs, endMs)
    const leftWrist = this.ble.getSamplesForWindow(startMs, endMs)
    const otherLimbs = mockSamples.filter(sample => sample.limb !== 'LEFT_WRIST')
    return [...leftWrist, ...otherLimbs]
  }

  getSamples(event: ChoreographyEvent): IMUSample[] {
    return this.getSamplesForWindow(event.time - EVENT_WINDOW_MS, event.time + EVENT_WINDOW_MS)
      .filter(sample => sample.limb === event.limb)
  }
}
