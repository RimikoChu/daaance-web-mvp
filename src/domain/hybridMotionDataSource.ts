import type { ChoreographyEvent, IMUSample, MotionDataSource } from './types'

export class HybridMotionDataSource implements MotionDataSource {
  readonly kind = 'hybrid' as const

  constructor(
    private readonly ble: MotionDataSource,
    private readonly mock: MotionDataSource,
    private readonly useRealLeftWrist: () => boolean,
  ) {}

  async connect() {}
  async disconnect() {}

  getSamples(event: ChoreographyEvent): IMUSample[] {
    if (event.limb === 'LEFT_WRIST' && this.useRealLeftWrist()) {
      return this.ble.getSamples(event)
    }
    return this.mock.getSamples(event)
  }
}
