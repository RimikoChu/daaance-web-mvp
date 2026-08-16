import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneDefaultTimeline, type ChoreographyTimeline } from '../domain/choreographyTimeline'
import { Studio, type ChoreographyClient } from './Studio'

function timeline(beats: ChoreographyTimeline['beats'] = []): ChoreographyTimeline {
  return { ...cloneDefaultTimeline(), beats, updatedAt: '2026-08-15T00:00:00.000Z' }
}

function client(initial = timeline()): ChoreographyClient {
  return {
    load: vi.fn(async () => initial),
    save: vi.fn(async value => ({ ...value, updatedAt: '2026-08-16T01:02:03.000Z' })),
  }
}

describe('Studio', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads the fixed demo and marks an exact beat with Space', async () => {
    const api = client()
    render(<Studio client={api} createId={() => 'new-beat'} />)
    const video = screen.getByLabelText('Studio 18.66 秒舞蹈示范') as HTMLVideoElement
    expect(video).toHaveAttribute('src', expect.stringContaining('demo-dance'))
    await screen.findByText('0 个关键拍')
    Object.defineProperty(video, 'currentTime', { value: 3.214, writable: true })

    fireEvent.keyDown(window, { key: ' ', code: 'Space' })

    expect(screen.getByText('3.21s')).toBeInTheDocument()
    const row = screen.getByTestId('beat-new-beat')
    expect(row).toHaveAttribute('aria-current', 'true')
    expect(within(row).getByLabelText('关键拍强度')).toHaveValue('medium')
    expect(within(row).getByLabelText('关键拍部位')).toHaveValue('left_wrist')
  })

  it('offers a visible button that marks the current video time', async () => {
    render(<Studio client={client()} createId={() => 'button-beat'} />)
    const video = screen.getByLabelText('Studio 18.66 秒舞蹈示范') as HTMLVideoElement
    await screen.findByText('0 个关键拍')
    Object.defineProperty(video, 'currentTime', { value: 6.789, writable: true })

    fireEvent.click(screen.getByRole('button', { name: '添加当前关键拍' }))

    expect(screen.getByText('6.79s')).toBeInTheDocument()
    expect(screen.getByTestId('beat-button-beat')).toHaveAttribute('aria-current', 'true')
  })

  it('does not mark from editable controls and selects a nearby beat instead of duplicating', async () => {
    render(<Studio client={client(timeline([
      { id: 'existing', timeMs: 3200, intensity: 'light', limb: 'right_wrist' },
    ]))} createId={() => 'should-not-exist'} />)
    const video = screen.getByLabelText('Studio 18.66 秒舞蹈示范') as HTMLVideoElement
    await screen.findByText('1 个关键拍')
    Object.defineProperty(video, 'currentTime', { value: 3.25, writable: true })

    fireEvent.keyDown(screen.getByLabelText('关键拍强度'), { key: ' ', code: 'Space' })
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })

    expect(screen.getByText('1 个关键拍')).toBeInTheDocument()
    expect(screen.getByTestId('beat-existing')).toHaveAttribute('aria-current', 'true')
    expect(screen.queryByTestId('beat-should-not-exist')).not.toBeInTheDocument()
  })

  it('edits, seeks to, and deletes a key beat', async () => {
    render(<Studio client={client(timeline([
      { id: 'editable', timeMs: 1500, intensity: 'light', limb: 'left_wrist' },
    ]))} />)
    const video = screen.getByLabelText('Studio 18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 0, writable: true })
    const row = await screen.findByTestId('beat-editable')

    fireEvent.change(within(row).getByLabelText('关键拍强度'), { target: { value: 'strong' } })
    fireEvent.change(within(row).getByLabelText('关键拍部位'), { target: { value: 'right_ankle' } })
    fireEvent.click(within(row).getByRole('button', { name: '定位到 1.50s' }))

    expect(video.currentTime).toBe(1.5)
    expect(within(row).getByLabelText('关键拍强度')).toHaveValue('strong')
    expect(within(row).getByLabelText('关键拍部位')).toHaveValue('right_ankle')

    fireEvent.click(within(row).getByRole('button', { name: '删除 1.50s' }))
    expect(screen.getByText('0 个关键拍')).toBeInTheDocument()
  })

  it('resets a dirty draft only after confirmation without saving', async () => {
    const api = client(timeline())
    const confirmReset = vi.fn(() => false)
    render(<Studio client={api} confirmReset={confirmReset} createId={() => 'draft'} />)
    const video = screen.getByLabelText('Studio 18.66 秒舞蹈示范') as HTMLVideoElement
    await screen.findByText('0 个关键拍')
    Object.defineProperty(video, 'currentTime', { value: 1, writable: true })
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })

    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))
    expect(screen.getByText('1 个关键拍')).toBeInTheDocument()
    confirmReset.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }))

    expect(screen.getByText('12 个关键拍')).toBeInTheDocument()
    expect(api.save).not.toHaveBeenCalled()
  })

  it('uses the server response after save and preserves the draft when save fails', async () => {
    const api = client(timeline())
    vi.mocked(api.save)
      .mockResolvedValueOnce(timeline([{ id: 'server', timeMs: 2220, intensity: 'strong', limb: 'right_ankle' }]))
      .mockRejectedValueOnce(new Error('offline'))
    render(<Studio client={api} createId={() => 'draft'} />)
    const video = screen.getByLabelText('Studio 18.66 秒舞蹈示范') as HTMLVideoElement
    await screen.findByText('0 个关键拍')

    fireEvent.click(screen.getByRole('button', { name: '保存并同步' }))
    expect(await screen.findByTestId('beat-server')).toBeInTheDocument()
    Object.defineProperty(video, 'currentTime', { value: 4, writable: true })
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    fireEvent.click(screen.getByRole('button', { name: '保存并同步' }))

    expect(await screen.findByText('保存失败，请重试。')).toBeInTheDocument()
    expect(screen.getByTestId('beat-server')).toBeInTheDocument()
    expect(screen.getByTestId('beat-draft')).toBeInTheDocument()
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2))
  })
})
