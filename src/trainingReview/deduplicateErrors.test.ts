import { describe, expect, it } from 'vitest'
import { createErrorDeduplicator } from './deduplicateErrors'
import type { MotionErrorEvent } from './types'

const error = (overrides: Partial<MotionErrorEvent> = {}): MotionErrorEvent => ({
  id: 'frame-1',
  timestamp: 1_000,
  receivedAt: 2_000,
  limb: 'left_wrist',
  type: 'timing',
  severity: 'medium',
  source: 'imu',
  detector: 'imu-timing-v1',
  details: { logicalErrorId: 'c3' },
  ...overrides,
})

describe('createErrorDeduplicator', () => {
  it('suppresses repeated 50Hz frames for one sustained logical detector error without changing either event', () => {
    const deduplicator = createErrorDeduplicator({ sustainedWindowMs: 500 })
    const first = error()
    const repeatedFrame = error({ id: 'frame-2', timestamp: 1_020, receivedAt: 2_020 })

    expect(deduplicator.accept(first)).toBe(true)
    expect(deduplicator.accept(repeatedFrame)).toBe(false)
    expect(first).toEqual(error())
    expect(repeatedFrame).toEqual(error({ id: 'frame-2', timestamp: 1_020, receivedAt: 2_020 }))
  })

  it('accepts a distinct limb, type, or detector and a later fallback sustained window', () => {
    const deduplicator = createErrorDeduplicator({ sustainedWindowMs: 500 })

    expect(deduplicator.accept(error())).toBe(true)
    expect(deduplicator.accept(error({ id: 'right-limb', limb: 'right_wrist' }))).toBe(true)
    expect(deduplicator.accept(error({ id: 'range', type: 'range' }))).toBe(true)
    expect(deduplicator.accept(error({ id: 'new-detector', detector: 'fusion-v1' }))).toBe(true)

    expect(deduplicator.accept(error({ id: 'window-1', details: undefined }))).toBe(true)
    expect(deduplicator.accept(error({ id: 'window-repeat', timestamp: 1_020, details: undefined }))).toBe(false)
    expect(deduplicator.accept(error({ id: 'later-window', timestamp: 1_500, details: undefined }))).toBe(true)
  })

  it('forgets sustained error identities when reset starts a new session', () => {
    const deduplicator = createErrorDeduplicator({ sustainedWindowMs: 500 })
    const sustainedError = error()

    expect(deduplicator.accept(sustainedError)).toBe(true)
    expect(deduplicator.accept(sustainedError)).toBe(false)
    deduplicator.reset()
    expect(deduplicator.accept(sustainedError)).toBe(true)
  })
})
