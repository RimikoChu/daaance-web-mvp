import { describe, expect, it } from 'vitest'
import { createTrainingSessionLedger } from './ledger'

describe('createTrainingSessionLedger', () => {
  it('records each event type in the session snapshot', () => {
    const ledger = createTrainingSessionLedger('session-1', 1_000)

    ledger.appendError({
      id: 'error-1', timestamp: 2_400, receivedAt: 3_400,
      limb: 'left_wrist', type: 'timing', severity: 'medium',
      source: 'imu', detector: 'imu-timing-v1',
    })
    ledger.appendCommand({
      id: 'command-1', errorEventId: 'error-1', command: 'FEEDBACK_ERROR',
      sentAt: 3_500, status: 'sent',
    })
    ledger.appendExecution({
      id: 'execution-1', errorEventId: 'error-1', pod: 'left_wrist',
      hardwareTimestamp: 2_450, receivedAt: 3_600, feedback: 'ERROR',
      outputs: ['LED', 'VIBRATION'],
    })

    expect(ledger.snapshot()).toEqual({
      schemaVersion: '1.0.0', sessionId: 'session-1', startedAt: 1_000,
      errors: [{
        id: 'error-1', timestamp: 2_400, receivedAt: 3_400,
        limb: 'left_wrist', type: 'timing', severity: 'medium',
        source: 'imu', detector: 'imu-timing-v1',
      }],
      commands: [{
        id: 'command-1', errorEventId: 'error-1', command: 'FEEDBACK_ERROR',
        sentAt: 3_500, status: 'sent',
      }],
      executions: [{
        id: 'execution-1', errorEventId: 'error-1', pod: 'left_wrist',
        hardwareTimestamp: 2_450, receivedAt: 3_600, feedback: 'ERROR',
        outputs: ['LED', 'VIBRATION'],
      }],
    })
  })

  it('returns independent snapshots that cannot change ledger state', () => {
    const ledger = createTrainingSessionLedger('session-1', 1_000)
    ledger.appendError({
      id: 'error-1', timestamp: 2_400, receivedAt: 3_400,
      limb: 'left_wrist', type: 'timing', severity: 'medium',
      source: 'imu', detector: 'imu-timing-v1', details: { frame: 12 },
    })

    const snapshot = ledger.snapshot()
    snapshot.errors[0].severity = 'high'
    ;(snapshot.errors[0].details as { frame: number }).frame = 99
    snapshot.errors.push({
      id: 'error-2', timestamp: 2_500, receivedAt: 3_500,
      limb: 'right_wrist', type: 'range', severity: 'low',
      source: 'demo', detector: 'demo-v1',
    })

    expect(ledger.snapshot().errors).toEqual([{
      id: 'error-1', timestamp: 2_400, receivedAt: 3_400,
      limb: 'left_wrist', type: 'timing', severity: 'medium',
      source: 'imu', detector: 'imu-timing-v1', details: { frame: 12 },
    }])
  })

  it('rejects a duplicate stable event ID', () => {
    const ledger = createTrainingSessionLedger('session-1', 1_000)
    const error = {
      id: 'duplicate-id', timestamp: 2_400, receivedAt: 3_400,
      limb: 'left_wrist' as const, type: 'timing' as const, severity: 'medium' as const,
      source: 'imu' as const, detector: 'imu-timing-v1',
    }

    ledger.appendError(error)

    expect(() => ledger.appendError(error)).toThrow('Duplicate event ID: duplicate-id')
  })

  it('creates a JSON-safe snapshot without runtime objects or functions', () => {
    const ledger = createTrainingSessionLedger('session-1', 1_000)
    ledger.appendError({
      id: 'error-1', timestamp: 2_400, receivedAt: 3_400,
      limb: 'left_wrist', type: 'timing', severity: 'medium',
      source: 'imu', detector: 'imu-timing-v1',
    })

    const json = JSON.stringify(ledger.snapshot())

    expect(JSON.parse(json).errors[0].id).toBe('error-1')
    expect(json).not.toContain('function')
  })
})
