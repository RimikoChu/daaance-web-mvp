import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrainingReport } from './TrainingReport'
import type { TrainingSessionSnapshot } from '../trainingReview/types'

const snapshot: TrainingSessionSnapshot = {
  schemaVersion: '1.0.0',
  sessionId: 'session export',
  startedAt: 1,
  errors: [
    { id: 'left', timestamp: 1_000, receivedAt: 1_010, limb: 'left_wrist', type: 'timing', severity: 'high', source: 'imu', detector: 'imu-timing-v1' },
    { id: 'right', timestamp: 2_000, receivedAt: 2_010, limb: 'right_wrist', type: 'direction', severity: 'medium', source: 'demo', detector: 'demo-review-v1' },
    { id: 'ankle-left', timestamp: 2_500, receivedAt: 2_510, limb: 'left_ankle', type: 'range', severity: 'low', source: 'demo', detector: 'demo-review-v1' },
    { id: 'ankle-right', timestamp: 3_000, receivedAt: 3_010, limb: 'right_ankle', type: 'timing', severity: 'medium', source: 'imu', detector: 'imu-timing-v1' },
  ],
  commands: [
    { id: 'command', errorEventId: 'left', command: 'FEEDBACK_ERROR', sentAt: 1_020, status: 'sent' },
    { id: 'failed-command', errorEventId: 'right', command: 'FEEDBACK_ERROR', sentAt: 2_020, status: 'failed', failureReason: 'Pod disconnected' },
  ],
  executions: [{ id: 'ack', pod: 'left_wrist', hardwareTimestamp: 40, receivedAt: 1_060, feedback: 'ERROR', outputs: ['LED'] }],
}

describe('TrainingReport', () => {
  it('renders the primary in-page report with four limbs, three error categories, detail rows, and direct review', () => {
    const onReviewTime = vi.fn()
    render(<TrainingReport snapshot={snapshot} onReviewTime={onReviewTime} onAgain={vi.fn()} onHome={vi.fn()} />)

    expect(screen.getByRole('heading', { name: '训练复盘报告' })).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    for (const limb of ['左手腕', '右手腕', '左脚踝', '右脚踝']) expect(screen.getByText(limb)).toBeInTheDocument()
    for (const type of ['Timing', 'Direction', 'Range']) expect(screen.getByText(type)).toBeInTheDocument()

    const leftRow = screen.getByRole('row', { name: /left wrist.*timing.*high.*imu-detected/i })
    expect(within(leftRow).getByText('Execution acknowledged')).toBeInTheDocument()
    expect(within(leftRow).getByText(/sent 1020 ms/i)).toBeInTheDocument()
    expect(within(leftRow).getByText(/latency 40 ms/i)).toBeInTheDocument()
    const failedRow = screen.getByRole('row', { name: /right wrist.*direction.*demo-generated/i })
    expect(within(failedRow).getByText(/sent 2020 ms.*Pod disconnected/i)).toBeInTheDocument()
    expect(screen.getAllByText('Demo-generated')).toHaveLength(2)
    fireEvent.click(within(leftRow).getByRole('button', { name: 'Review moment' }))
    expect(onReviewTime).toHaveBeenCalledWith(1_000)

    expect(screen.getByRole('button', { name: '导出 JSON' })).toHaveClass('report-export')
  })

  it('exports the exact raw snapshot only on click, then cleans up its temporary download URL and anchor', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:session')
    const revokeObjectURL = vi.fn()
    let downloadedAnchor: HTMLAnchorElement | undefined
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedAnchor = this })
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    render(<TrainingReport snapshot={snapshot} onReviewTime={vi.fn()} onAgain={vi.fn()} onHome={vi.fn()} />)

    expect(createObjectURL).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }))

    expect(createObjectURL).toHaveBeenCalledOnce()
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(await blob.text()).toBe(JSON.stringify(snapshot, null, 2))
    expect(click).toHaveBeenCalledOnce()
    expect(downloadedAnchor?.download).toBe('daaance-session-session export.json')
    expect(document.querySelector(`a[download="${downloadedAnchor?.download}"]`)).not.toBeInTheDocument()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:session')
    click.mockRestore()
  })
})
