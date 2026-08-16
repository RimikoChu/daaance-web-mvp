import { describe, expect, it } from 'vitest'
import { buildTrainingReport } from './report'
import type { TrainingSessionSnapshot } from './types'

const snapshot: TrainingSessionSnapshot = {
  schemaVersion: '1.0.0',
  sessionId: 'report-session',
  startedAt: 100,
  errors: [
    { id: 'late-demo', timestamp: 4_000, receivedAt: 4_010, limb: 'right_ankle', type: 'range', severity: 'high', source: 'demo', detector: 'demo-review-v1' },
    { id: 'left-imu', timestamp: 1_000, receivedAt: 1_010, limb: 'left_wrist', type: 'timing', severity: 'medium', source: 'imu', detector: 'imu-timing-v1' },
    { id: 'right-demo', timestamp: 2_000, receivedAt: 2_010, limb: 'right_wrist', type: 'direction', severity: 'low', source: 'demo', detector: 'demo-review-v1' },
    { id: 'left-demo', timestamp: 2_900, receivedAt: 2_910, limb: 'left_wrist', type: 'timing', severity: 'low', source: 'demo', detector: 'demo-review-v1' },
    { id: 'left-ankle', timestamp: 5_000, receivedAt: 5_010, limb: 'left_ankle', type: 'timing', severity: 'high', source: 'imu', detector: 'imu-timing-v1' },
  ],
  commands: [
    { id: 'sent-command', errorEventId: 'left-imu', command: 'FEEDBACK_ERROR', sentAt: 1_100, status: 'sent' },
    { id: 'failed-command', errorEventId: 'right-demo', command: 'FEEDBACK_ERROR', sentAt: 2_100, status: 'failed', failureReason: 'Pod disconnected' },
    { id: 'unconfirmed-command', errorEventId: 'left-demo', command: 'FEEDBACK_ERROR', sentAt: 3_000, status: 'sent' },
  ],
  executions: [
    { id: 'ack-1', pod: 'left_wrist', hardwareTimestamp: 1_112, receivedAt: 1_140, feedback: 'ERROR', outputs: ['LED', 'VIBRATION'] },
  ],
}

describe('buildTrainingReport', () => {
  it('derives ordered, source-honest counts and separate overlapping review ranges from the session snapshot', () => {
    const report = buildTrainingReport(snapshot)

    expect(report.totalErrors).toBe(5)
    expect(report.totalReviewRanges).toBe(1)
    expect(report.countsByLimb).toEqual({ left_wrist: 2, right_wrist: 1, left_ankle: 1, right_ankle: 1 })
    expect(report.countsByType).toEqual({ timing: 3, direction: 1, range: 1 })
    expect(report.rows.map(row => row.error.id)).toEqual(['left-imu', 'right-demo', 'left-demo', 'late-demo', 'left-ankle'])
    expect(report.rows.map(row => row.sourceLabel)).toEqual(['IMU-detected', 'Demo-generated', 'Demo-generated', 'Demo-generated', 'IMU-detected'])
    expect(report.reviewRanges).toMatchObject([{ limb: 'left_wrist', start: 1_000, end: 2_900, errorIds: ['left-imu', 'left-demo'] }])
  })

  it('describes command, failed-write, unconfirmed, and acknowledged execution truthfully', () => {
    const report = buildTrainingReport(snapshot)
    const byId = new Map(report.rows.map(row => [row.error.id, row]))

    expect(byId.get('late-demo')?.feedback).toMatchObject({ executionStatus: 'not-commanded', label: 'No feedback command' })
    expect(byId.get('right-demo')?.feedback).toMatchObject({ commandStatus: 'failed', executionStatus: 'failed', failureReason: 'Pod disconnected', label: 'Command failed' })
    expect(byId.get('left-demo')?.feedback).toMatchObject({ commandStatus: 'sent', executionStatus: 'execution-unconfirmed', label: 'Command sent / execution unconfirmed', sentAt: 3_000 })
    expect(byId.get('left-imu')?.feedback).toMatchObject({
      commandStatus: 'sent',
      executionStatus: 'executed',
      sentAt: 1_100,
      executionId: 'ack-1',
      hardwareTimestamp: 1_112,
      receivedAt: 1_140,
      outputs: ['LED', 'VIBRATION'],
      latencyMs: 40,
      label: 'Execution acknowledged',
    })
  })
})
