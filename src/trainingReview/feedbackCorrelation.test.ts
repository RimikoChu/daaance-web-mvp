import { describe, expect, it } from 'vitest'
import { correlateFeedback } from './feedbackCorrelation'
import type { FeedbackCommandEvent, FeedbackExecutionEvent, MotionErrorEvent } from './types'

const error = (id: string, limb: MotionErrorEvent['limb'] = 'left_wrist'): MotionErrorEvent => ({
  id, timestamp: 100, receivedAt: 100, limb, type: 'timing', severity: 'medium', source: 'imu', detector: 'imu-timing-v1',
})
const command = (id: string, errorEventId: string, sentAt: number, status: FeedbackCommandEvent['status'] = 'sent'): FeedbackCommandEvent => ({
  id, errorEventId, command: 'FEEDBACK_ERROR', sentAt, status,
})
const execution = (id: string, receivedAt: number, pod: FeedbackExecutionEvent['pod'] = 'left_wrist'): FeedbackExecutionEvent => ({
  id, pod, hardwareTimestamp: receivedAt - 3, receivedAt, feedback: 'ERROR', outputs: ['LED', 'VIBRATION'],
})

describe('correlateFeedback', () => {
  it('correlates an acknowledgement to the closest preceding sent command for its error limb and measures latency', () => {
    const rows = correlateFeedback(
      [error('left-error'), error('right-error', 'right_wrist')],
      [command('left-command', 'left-error', 100), command('right-command', 'right-error', 103)],
      [execution('left-ack', 125)],
    )

    expect(rows).toEqual([
      expect.objectContaining({ errorEventId: 'left-error', commandId: 'left-command', executionId: 'left-ack', executionStatus: 'executed', latencyMs: 25 }),
      expect.objectContaining({ errorEventId: 'right-error', commandId: 'right-command', executionStatus: 'execution-unconfirmed' }),
    ])
  })

  it('keeps an absent acknowledgement unconfirmed and a rejected write failed', () => {
    const rows = correlateFeedback(
      [error('sent-error'), error('failed-error')],
      [command('sent-command', 'sent-error', 100), { ...command('failed-command', 'failed-error', 200, 'failed'), failureReason: 'not connected' }],
      [],
    )

    expect(rows).toEqual([
      expect.objectContaining({ commandId: 'sent-command', executionStatus: 'execution-unconfirmed' }),
      expect.objectContaining({ commandId: 'failed-command', executionStatus: 'failed', failureReason: 'not connected' }),
    ])
  })

  it('does not attach duplicate or stale acknowledgements to a second command', () => {
    const rows = correlateFeedback(
      [error('first'), error('second')],
      [command('first-command', 'first', 100), command('second-command', 'second', 200)],
      [execution('late-ack', 250), execution('late-ack', 251), execution('stale-ack', 10)],
    )

    expect(rows).toEqual([
      expect.objectContaining({ commandId: 'first-command', executionStatus: 'execution-unconfirmed' }),
      expect.objectContaining({ commandId: 'second-command', executionId: 'late-ack', latencyMs: 50, executionStatus: 'executed' }),
    ])
  })
})
