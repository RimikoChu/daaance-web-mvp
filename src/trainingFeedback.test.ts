import { describe, expect, it, vi } from 'vitest'
import { createFeedbackGuard } from './trainingFeedback'

describe('createFeedbackGuard', () => {
  it('sends the first event and never sends the same event twice', async () => {
    const send = vi.fn(async () => {})
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => 5_000, send })

    await expect(guard.report('c1')).resolves.toBe(true)
    await expect(guard.report('c1')).resolves.toBe(false)

    expect(send).toHaveBeenCalledOnce()
    expect(send).toHaveBeenCalledWith('c1')
  })

  it('suppresses a different event at 999ms and sends it at 1000ms', async () => {
    let now = 5_000
    const send = vi.fn(async () => {})
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => now, send })

    await expect(guard.report('c1')).resolves.toBe(true)
    now += 999
    await expect(guard.report('c2')).resolves.toBe(false)
    now += 1
    await expect(guard.report('c3')).resolves.toBe(true)

    expect(send.mock.calls).toEqual([['c1'], ['c3']])
  })

  it('records an event before awaiting its send so concurrent duplicates are suppressed', async () => {
    let resolveSend: (() => void) | undefined
    const send = vi.fn(() => new Promise<void>(resolve => { resolveSend = resolve }))
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => 5_000, send })

    const first = guard.report('c1')
    await expect(guard.report('c1')).resolves.toBe(false)
    resolveSend?.()
    await expect(first).resolves.toBe(true)

    expect(send).toHaveBeenCalledOnce()
  })

  it('does not throw through report when sending is rejected', async () => {
    const send = vi.fn(async () => { throw new Error('not connected') })
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => 5_000, send })

    await expect(guard.report('c1')).resolves.toBe(true)
    await expect(guard.report('c1')).resolves.toBe(false)
    expect(send).toHaveBeenCalledOnce()
  })

  it('reset starts a fresh feedback run', async () => {
    const send = vi.fn(async () => {})
    const guard = createFeedbackGuard({ cooldownMs: 1_000, now: () => 5_000, send })

    await guard.report('c1')
    guard.reset()

    await expect(guard.report('c1')).resolves.toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
  })
})
