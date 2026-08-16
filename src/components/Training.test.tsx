import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHOREOGRAPHY } from '../domain/choreography'
import { MockMotionDataSource } from '../domain/mockMotionDataSource'
import type { ChoreographyEvent, IMUSample, MotionDataSource, TimingStatus } from '../domain/types'
import * as trainingLedger from '../trainingReview/ledger'
import { reviewSeekDestination, Training } from './Training'

vi.mock('../domain/mockMotionDataSource', () => ({
  MockMotionDataSource: vi.fn(function MockMotionDataSource() { return {
    kind: 'mock',
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getSamples: vi.fn(() => []),
    getSamplesForWindow: vi.fn(() => []),
  } }),
}))

function createSource(getSamples: MotionDataSource['getSamples'] = vi.fn(() => []), kind: MotionDataSource['kind'] = 'mock'): MotionDataSource {
  return {
    kind,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    getSamples,
    getSamplesForWindow: vi.fn(() => []),
  }
}

function renderTraining(source = createSource()) {
  return render(<Training source={source} feedbackMode="accessibility" strictness="standard" onFinish={vi.fn()} onExit={vi.fn()} />)
}

function energeticSample(event: ChoreographyEvent, timestamp: number): IMUSample {
  return { timestamp, limb: event.limb, ax: 2.6, ay: 0.9, az: 1.5, gx: 110, gy: 44, gz: 16 }
}

describe('Training', () => {
  beforeEach(() => {
    vi.mocked(MockMotionDataSource).mockClear()
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined)
  })

  afterEach(() => vi.restoreAllMocks())

  it('keeps the original training stage frame around the dance video', () => {
    renderTraining()

    const video = screen.getByLabelText('18.66 秒舞蹈示范')
    expect(video.closest('.teacher-stage')).toBeInTheDocument()
    expect(document.querySelector('.training-layout aside .device-grid')).toBeInTheDocument()
    expect(screen.getByText('示范舞段 · 基础律动')).toBeInTheDocument()
  })

  it('pins portrait video to the stage so its full frame can be contained', () => {
    renderTraining()

    expect(screen.getByLabelText('18.66 秒舞蹈示范')).toHaveClass('video-stage-media')
  })

  it('shows a real first-frame poster while Safari prepares the video', () => {
    renderTraining()

    const video = screen.getByLabelText('18.66 秒舞蹈示范')
    expect(video).toHaveAttribute('preload', 'auto')
    expect(video).toHaveAttribute('poster', expect.stringContaining('demo-dance-poster'))
  })

  it('renders the supplied video and preserves time while switching modes', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 8, writable: true })

    fireEvent.click(screen.getByRole('button', { name: '跟跳模式' }))
    expect(video.currentTime).toBe(8)
    fireEvent.click(screen.getByRole('button', { name: '教学模式' }))
    expect(video.currentTime).toBe(8)
  })

  it('seeks the shared video backward and forward by five seconds', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 8, writable: true })

    fireEvent.click(screen.getByRole('button', { name: '后退 5 秒' }))
    expect(video.currentTime).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: '前进 5 秒' }))
    expect(video.currentTime).toBe(8)
  })

  it('synchronizes the teaching segment when five-second seeks cross boundaries', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    const pause = vi.spyOn(video, 'pause')
    Object.defineProperty(video, 'currentTime', { value: 3, writable: true })

    fireEvent.click(screen.getByRole('button', { name: '前进 5 秒' }))
    expect(screen.getByRole('button', { name: '第二段' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.timeUpdate(video)
    expect(pause).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '后退 5 秒' }))
    expect(screen.getByRole('button', { name: '第一段' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows three teaching segments and hides them in follow mode', () => {
    renderTraining()

    expect(screen.getAllByRole('button', { name: /第[一二三]段/ })).toHaveLength(3)
    expect(screen.getByRole('button', { name: '上一段' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重复本段' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下一段' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '跟跳模式' }))
    expect(screen.queryByRole('button', { name: '重复本段' })).not.toBeInTheDocument()
  })

  it('pauses at the active teaching segment end without switching modes', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    const pause = vi.spyOn(video, 'pause')
    Object.defineProperty(video, 'currentTime', { value: 6.3, writable: true })

    fireEvent.timeUpdate(video)

    expect(pause).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '教学模式' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('keeps an understandable stable UI when metadata fails', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { value: Number.NaN })
    fireEvent.loadedMetadata(video)
    expect(screen.getByText('无法读取视频信息，请重新加载后再试。')).toBeInTheDocument()
  })

  it('keeps an understandable stable UI when playback is rejected', async () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'play', { value: vi.fn().mockRejectedValue(new Error('blocked')) })
    fireEvent.click(screen.getByRole('button', { name: '播放' }))
    expect(await screen.findByText('视频未能播放，请点击播放按钮重试。')).toBeInTheDocument()
  })

  it.each([
    ['invalid metadata', (video: HTMLVideoElement) => {
      Object.defineProperty(video, 'duration', { value: Number.NaN })
      fireEvent.loadedMetadata(video)
    }],
    ['media error', (video: HTMLVideoElement) => fireEvent.error(video)],
  ])('disables all training controls after %s', (_case, failMedia) => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement

    failMedia(video)

    for (const name of ['教学模式', '跟跳模式', '第一段', '第二段', '第三段', '上一段', '重复本段', '下一段', '后退 5 秒', '播放', '前进 5 秒']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })

  it('shows a stable unavailable state when the media element emits an error', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement

    fireEvent.error(video)

    expect(screen.getByText('视频无法加载，请检查媒体文件后重新加载。')).toBeInTheDocument()
    expect(screen.queryByText('视频已就绪，点击播放开始教学。')).not.toBeInTheDocument()
  })

  it('finishes only once when the media element delivers ended more than once', () => {
    const onFinish = vi.fn()
    render(<Training source={createSource()} feedbackMode="accessibility" strictness="standard" onFinish={onFinish} onExit={vi.fn()} />)
    const video = screen.getByLabelText('18.66 秒舞蹈示范')

    fireEvent.ended(video)
    fireEvent.ended(video)

    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('queries the injected motion source for every choreography event without constructing a Mock fallback', () => {
    const getSamples = vi.fn<MotionDataSource['getSamples']>(() => [])
    renderTraining(createSource(getSamples))

    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))

    expect(getSamples.mock.calls.map(([event]) => event.id)).toEqual(CHOREOGRAPHY.map(event => event.id))
    expect(MockMotionDataSource).not.toHaveBeenCalled()
  })

  it('auto-starts playback after valid metadata is available', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    render(<Training source={createSource()} autoStart feedbackMode="accessibility" strictness="standard" onFinish={vi.fn()} onExit={vi.fn()} />)
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { value: 18.66 })

    fireEvent.loadedMetadata(video)

    expect(play).toHaveBeenCalledOnce()
  })

  it.each([
    ['early', -400],
    ['late', 400],
    ['missed', null],
  ] as const)('retains a %s left-wrist result and reports its ledger error only once', async (status, offset) => {
    const getSamples = vi.fn((event: ChoreographyEvent) => {
      if (event.id !== 'c1') return [energeticSample(event, event.time)]
      return offset === null ? [] : [energeticSample(event, event.time + offset)]
    })
    const onFinish = vi.fn()
    const onFeedbackError = vi.fn(async () => {})
    render(<Training
      source={createSource(getSamples, 'hybrid')}
      feedbackMode="accessibility"
      strictness="standard"
      onFeedbackError={onFeedbackError}
      onFinish={onFinish}
      onExit={vi.fn()}
    />)
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 2.5, writable: true })

    fireEvent.timeUpdate(video)
    fireEvent.timeUpdate(video)
    fireEvent.ended(video)

    await waitFor(() => expect(onFinish).toHaveBeenCalledOnce())
    const snapshot = onFinish.mock.calls[0]?.[0]
    const results = onFinish.mock.calls[0]?.[1]
    expect(snapshot.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'imu-c1-timing', source: 'imu' }),
    ]))
    expect(results.find((result: { event: ChoreographyEvent }) => result.event.id === 'c1')).toMatchObject({ status: status as TimingStatus })
    expect(getSamples.mock.calls.filter(([event]) => event.id === 'c1')).toHaveLength(1)
    expect(onFeedbackError).toHaveBeenCalledOnce()
    expect(onFeedbackError).toHaveBeenCalledWith('imu-c1-timing')
  })

  it('retains an incorrect non-left-wrist result without reporting hardware feedback', async () => {
    const getSamples = vi.fn((event: ChoreographyEvent) => [
      energeticSample(event, event.time + (event.id === 'c2' ? 400 : 0)),
    ])
    const onFinish = vi.fn()
    const onFeedbackError = vi.fn(async () => {})
    render(<Training
      source={createSource(getSamples, 'hybrid')}
      feedbackMode="accessibility"
      strictness="standard"
      onFeedbackError={onFeedbackError}
      onFinish={onFinish}
      onExit={vi.fn()}
    />)
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 3.7, writable: true })

    fireEvent.timeUpdate(video)
    fireEvent.ended(video)

    await waitFor(() => expect(onFinish).toHaveBeenCalledOnce())
    const snapshot = onFinish.mock.calls[0]?.[0]
    const results = onFinish.mock.calls[0]?.[1]
    expect(snapshot.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'demo-c2-timing', source: 'demo' }),
    ]))
    expect(results.find((result: { event: ChoreographyEvent }) => result.event.id === 'c2')).toMatchObject({ status: 'late' })
    expect(onFeedbackError).not.toHaveBeenCalled()
  })

  it('pauses the shared video before seeking a review marker with one-second preroll', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    const pause = vi.spyOn(video, 'pause')
    Object.defineProperty(video, 'currentTime', { value: 2.5, writable: true })

    fireEvent.timeUpdate(video)
    fireEvent.click(screen.getByRole('button', { name: /left wrist.*timing.*demo-generated/i }))

    expect(pause).toHaveBeenCalledOnce()
    expect(video.currentTime).toBe(1)
    expect(screen.getByRole('button', { name: '第一段' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('clamps review seeks to the shared video bounds after applying preroll', () => {
    expect(reviewSeekDestination(0.5, 18.655)).toBe(0)
    expect(reviewSeekDestination(30, 18.655)).toBe(18.655)
  })

  it('shows all four Pods as collecting while keeping choreography focus separate', () => {
    renderTraining()
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 2, writable: true })

    fireEvent.play(video)
    fireEvent.timeUpdate(video)

    expect(screen.getAllByText('采集中')).toHaveLength(4)
    expect(screen.getByText('本拍重点 · 左手腕')).toBeInTheDocument()
    expect(screen.queryByText('动作中')).not.toBeInTheDocument()
    expect(screen.getAllByText('Demo')).toHaveLength(4)
  })

  it('derives review markers from a stable ledger and creates an empty ledger for a new Training session', () => {
    const createLedger = vi.spyOn(trainingLedger, 'createTrainingSessionLedger')
    const source = createSource()
    const props = { source, feedbackMode: 'accessibility' as const, strictness: 'standard' as const, onFinish: vi.fn(), onExit: vi.fn() }
    const { rerender } = render(<Training key="session-one" {...props} />)
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 2.5, writable: true })

    fireEvent.timeUpdate(video)

    expect(createLedger).toHaveBeenCalledTimes(1)
    const firstLedger = createLedger.mock.results[0]?.value
    expect(firstLedger?.snapshot().errors).toHaveLength(3)
    expect(screen.getByRole('button', { name: /left wrist.*timing.*demo-generated/i })).toBeInTheDocument()

    rerender(<Training key="session-two" {...props} />)

    expect(createLedger).toHaveBeenCalledTimes(2)
    expect(createLedger.mock.results[1]?.value.snapshot().errors).toEqual([])
    expect(screen.queryByRole('button', { name: /demo-generated/i })).not.toBeInTheDocument()
  })
})
