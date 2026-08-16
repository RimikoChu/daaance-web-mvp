import { describe, expect, it, vi } from 'vitest'
import type { MotionErrorEvent } from './trainingReview/types'
import { createFeedbackGuard } from './trainingFeedback'

const error = (id: string): MotionErrorEvent => ({
  id,
  timestamp: 1_000,
  receivedAt: 5_000,
  limb: 'left_wrist',
  type: 'timing',
  severity: 'medium',
  source: 'imu',
  detector: 'imu-timing-v1',
})

describe('createFeedbackGuard', () => {
  it('audits an accepted feedback write with its send timestamp and a unique command ID', async () => {
    const send = vi.fn(async () => {})
    const guard = createFeedbackGuard({
      cooldownMs: 1_000,
      now: () => 5_000,
      send,
      createCommandId: () => 'command-1',
    })

    await expect(guard.report(error('c1'))).resolves.toEqual({
      id: 'command-1',
      errorEventId: 'c1',
      command: 'FEEDBACK_ERROR',
      sentAt: 5_000,
      status: 'sent',
    })
    await expect(guard.report(error('c1'))).resolves.toBeUndefined()

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('c1')
  })

  it('suppresses duplicate identities and different errors inside the cooldown without command records', async () => {
    let now = 5_000
    const send = vi.fn(async () => {})
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => now, send, createCommandId: () => `command-${now}` })

    await expect(guard.report(error('c1'))).resolves.toMatchObject({ status: 'sent' })
    await expect(guard.report(error('c1'))).resolves.toBeUndefined()
    now += 999
    await expect(guard.report(error('c2'))).resolves.toBeUndefined()
    now += 1
    await expect(guard.report(error('c3'))).resolves.toMatchObject({ id: 'command-6000', status: 'sent' })

    expect(send.mock.calls).toEqual([['c1'], ['c3']])
  })

  it('records an event before awaiting its send so concurrent duplicates are suppressed', async () => {
    let resolveSend: (() => void) | undefined
    const send = vi.fn(() => new Promise<void>(resolve => { resolveSend = resolve }))
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => 5_000, send })

    const first = guard.report(error('c1'))
    await expect(guard.report(error('c1'))).resolves.toBeUndefined()
    resolveSend?.()
    await expect(first).resolves.toMatchObject({ errorEventId: 'c1', status: 'sent' })

    expect(send).toHaveBeenCalledOnce()
  })

  it('records a failed command with the rejected write reason without throwing through analysis', async () => {
    const send = vi.fn(async () => { throw new Error('not connected') })
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => 5_000, send, createCommandId: () => 'command-1' })

    await expect(guard.report(error('c1'))).resolves.toEqual({
      id: 'command-1',
      errorEventId: 'c1',
      command: 'FEEDBACK_ERROR',
      sentAt: 5_000,
      status: 'failed',
      failureReason: 'not connected',
    })
    await expect(guard.report(error('c1'))).resolves.toBeUndefined()
    expect(send).toHaveBeenCalledOnce()
  })

  it('reset starts a fresh feedback run', async () => {
    const send = vi.fn(async () => {})
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => 5_000, send })

    await guard.report(error('c1'))
    guard.reset()

    await expect(guard.report(error('c1'))).resolves.toMatchObject({ status: 'sent' })
    expect(send).toHaveBeenCalledTimes(2)
  })
})
