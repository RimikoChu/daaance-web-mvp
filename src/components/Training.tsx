import { useEffect, useRef, useState } from 'react'
import { Bluetooth, CirclePlay, Pause, Volume2, Waves } from 'lucide-react'
import demoDance from '../assets/demo-dance.mp4'
import demoDancePoster from '../assets/demo-dance-poster.png'
import { CHOREOGRAPHY, LIMB_LABEL, TOLERANCE } from '../domain/choreography'
import { analyzeTiming } from '../domain/motion'
import type { ChoreographyEvent, Limb, MotionDataSource, Strictness, TimingResult, TrainingMode } from '../domain/types'
import { DANCE_DURATION_SECONDS, getSegmentBounds, getTeachingSegment, seekBy } from '../playback'
import { createFeedbackGuard } from '../trainingFeedback'
import { TrainingTimeline } from './TrainingTimeline'
import { REVIEW_SEEK_PREROLL_MS } from '../trainingReview/constants'
import { createErrorDeduplicator } from '../trainingReview/deduplicateErrors'
import { createDemoDetector, createImuTimingDetector } from '../trainingReview/detectors'
import { clusterReviewRanges } from '../trainingReview/clusterReviewRanges'
import { createTrainingSessionLedger } from '../trainingReview/ledger'
import type { TrainingSessionLedger, TrainingSessionSnapshot } from '../trainingReview/types'

type LearningMode = 'teaching' | 'follow'
type LeftWristTrainingStatus = 'demo' | 'connected' | 'disconnected' | 'error'

export interface TrainingProps {
  feedbackMode: TrainingMode
  strictness: Strictness
  onFinish: (snapshot: TrainingSessionSnapshot, results: TimingResult[]) => void
  onExit: () => void
  source: MotionDataSource
  autoStart?: boolean
  leftWristStatus?: LeftWristTrainingStatus
  onFeedbackError?: (eventId: string) => Promise<void> | void
  feedbackNow?: () => number
  sessionLedger?: TrainingSessionLedger
  sessionSnapshot?: TrainingSessionSnapshot
  initialReviewTimestamp?: number
}

const LIMBS: Limb[] = ['LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE']
const SEGMENT_LABELS = ['第一段', '第二段', '第三段']
const ANALYSIS_DELAY_MS = 500
const FEEDBACK_COOLDOWN_MS = 1_000
const LEFT_WRIST_STATUS_LABEL: Record<LeftWristTrainingStatus, string> = {
  demo: 'Demo',
  connected: 'Real hardware · Connected',
  disconnected: 'Real hardware · Disconnected',
  error: 'Real hardware · Error',
}

let trainingSessionSequence = 0

const createTrainingSession = () => createTrainingSessionLedger(
  `training-${Date.now()}-${++trainingSessionSequence}`,
  Date.now(),
)

export function reviewSeekDestination(targetSeconds: number, duration: number): number {
  return seekBy(targetSeconds, -(REVIEW_SEEK_PREROLL_MS / 1000), duration)
}

export function Training({ feedbackMode, strictness, onFinish, onExit, source, autoStart = false, leftWristStatus = 'demo', onFeedbackError, feedbackNow = () => globalThis.performance?.now() ?? Date.now(), sessionLedger, sessionSnapshot, initialReviewTimestamp }: TrainingProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const finishedRef = useRef(false)
  const resultsByEventIdRef = useRef(new Map<string, TimingResult>())
  const reviewDeduplicatorRef = useRef(createErrorDeduplicator({ sustainedWindowMs: 1_000 }))
  const reviewLedgerRef = useRef<ReturnType<typeof createTrainingSessionLedger> | null>(null)
  if (!sessionSnapshot && !sessionLedger && !reviewLedgerRef.current) reviewLedgerRef.current = createTrainingSession()
  const onFeedbackErrorRef = useRef(onFeedbackError)
  onFeedbackErrorRef.current = onFeedbackError
  const sessionActiveRef = useRef(true)
  const feedbackGuardRef = useRef<ReturnType<typeof createFeedbackGuard> | null>(null)
  const pendingFeedbackReportsRef = useRef(new Set<Promise<void>>())
  if (!feedbackGuardRef.current) {
    feedbackGuardRef.current = createFeedbackGuard({
      cooldownMs: FEEDBACK_COOLDOWN_MS,
      now: feedbackNow,
      send: eventId => onFeedbackErrorRef.current?.(eventId),
    })
  }
  useEffect(() => () => { sessionActiveRef.current = false }, [])
  const [learningMode, setLearningMode] = useState<LearningMode>('teaching')
  const [activeSegment, setActiveSegment] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(DANCE_DURATION_SECONDS)
  const [playing, setPlaying] = useState(false)
  const [mediaAvailable, setMediaAvailable] = useState(true)
  const [message, setMessage] = useState('视频已就绪，点击播放开始教学。')
  const [, setReviewLedgerRevision] = useState(0)
  const logicalTime = currentTime * 1000
  const nextEvent = CHOREOGRAPHY.find(event => event.time >= logicalTime - 350 && event.time <= logicalTime + 600)
  const activeLedger = sessionLedger ?? reviewLedgerRef.current
  const reviewSnapshot = sessionSnapshot ?? activeLedger?.snapshot()
  if (!reviewSnapshot) throw new Error('Training requires a review session snapshot')
  const reviewRanges = clusterReviewRanges(reviewSnapshot.errors)

  const analyzeEvent = (event: ChoreographyEvent): TimingResult => {
    const existing = resultsByEventIdRef.current.get(event.id)
    if (existing) return existing

    const samples = source.getSamples(event)
    const result = analyzeTiming(event, samples, TOLERANCE[strictness])
    resultsByEventIdRef.current.set(event.id, result)
    const detector = source.kind === 'mock' || (source.kind === 'hybrid' && event.limb !== 'LEFT_WRIST')
      ? createDemoDetector()
      : createImuTimingDetector(strictness)
    const newErrors = detector.detect({
      event,
      samples,
      receivedAt: feedbackNow(),
    }).filter(error => reviewDeduplicatorRef.current.accept(error))
    if (!sessionSnapshot && newErrors.length > 0) {
      for (const error of newErrors) activeLedger?.appendError(error)
      setReviewLedgerRevision(revision => revision + 1)
    }
    const feedbackError = newErrors.find(error => error.limb === 'left_wrist' && error.type === 'timing')
    if (source.kind === 'hybrid' && feedbackError && onFeedbackErrorRef.current) {
      const report = feedbackGuardRef.current?.report(feedbackError.id)
      if (report) {
        const settled = report.then(command => {
          if (!sessionActiveRef.current || !command || sessionSnapshot) return
          activeLedger?.appendCommand(command)
          setReviewLedgerRevision(revision => revision + 1)
        })
        pendingFeedbackReportsRef.current.add(settled)
        void settled.finally(() => pendingFeedbackReportsRef.current.delete(settled))
      }
    }
    return result
  }

  const analyzeThrough = (timeMs: number) => {
    for (const event of CHOREOGRAPHY) {
      if (event.time + ANALYSIS_DELAY_MS <= timeMs) analyzeEvent(event)
    }
  }

  const seek = (delta: number) => {
    const video = videoRef.current
    if (!video || !mediaAvailable) return
    const destination = seekBy(video.currentTime, delta, duration)
    video.currentTime = destination
    setCurrentTime(destination)
    if (learningMode === 'teaching') setActiveSegment(getTeachingSegment(destination, duration))
  }

  const chooseSegment = (segment: number) => {
    const video = videoRef.current
    if (!video || !mediaAvailable) return
    const nextSegment = Math.min(2, Math.max(0, segment))
    video.currentTime = getSegmentBounds(nextSegment, duration).start
    setCurrentTime(video.currentTime)
    setActiveSegment(nextSegment)
  }

  const seekReview = (targetSeconds: number) => {
    const video = videoRef.current
    if (!video || !mediaAvailable) return

    video.pause()
    const destination = reviewSeekDestination(targetSeconds, duration)
    video.currentTime = destination
    setPlaying(false)
    setCurrentTime(destination)
    setActiveSegment(getTeachingSegment(destination, duration))
  }

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video || !mediaAvailable) return
    if (!video.paused) {
      video.pause()
      return
    }
    setMessage('正在开始播放…')
    try {
      await video.play()
    } catch {
      setPlaying(false)
      setMessage('视频未能播放，请点击播放按钮重试。')
    }
  }

  const updateTime = () => {
    const video = videoRef.current
    if (!video) return
    const time = video.currentTime
    setCurrentTime(time)
    if (!sessionSnapshot) analyzeThrough(time * 1000)
    if (learningMode === 'teaching') {
      const bounds = getSegmentBounds(activeSegment, duration)
      if (time >= bounds.end) {
        video.pause()
        setMessage(`${SEGMENT_LABELS[activeSegment]}教学完成，可以重复或进入下一段。`)
      }
    } else {
      setActiveSegment(getTeachingSegment(time, duration))
    }
  }

  const finish = () => {
    if (!sessionActiveRef.current || sessionSnapshot || finishedRef.current) return
    finishedRef.current = true
    setPlaying(false)
    const completedResults = CHOREOGRAPHY.map(analyzeEvent)
    const complete = () => {
      if (sessionActiveRef.current) onFinish(activeLedger!.snapshot(), completedResults)
    }
    const pendingFeedbackReports = [...pendingFeedbackReportsRef.current]
    if (pendingFeedbackReports.length === 0) {
      complete()
      return
    }
    void Promise.all(pendingFeedbackReports).then(complete)
  }

  const exit = () => {
    sessionActiveRef.current = false
    onExit()
  }

  return <main className="training-page soft-glass-theme">
    <header>
      <div className="logo"><span>Daaance!</span><i /></div>
      <div className="training-mode"><span className="live-dot" />{feedbackMode === 'accessibility' ? '无障碍模式' : '节奏教练模式'}</div>
      <button className="text-button" onClick={exit}>退出训练</button>
    </header>
    <div className="training-layout">
      <aside>
        <div className="aside-title"><Bluetooth size={16} /> Pod 状态</div>
        <div className="device-grid">{LIMBS.map(limb => {
          const sourceLabel = limb === 'LEFT_WRIST' ? LEFT_WRIST_STATUS_LABEL[leftWristStatus] : 'Demo'
          return <div className={`device-chip ${nextEvent?.limb === limb ? 'active' : ''}`} key={limb}>
            <span className="device-dot" />
            <span>{LIMB_LABEL[limb]}</span>
            <small><span>{sourceLabel}</span><span aria-hidden="true"> · </span><span>{playing ? '采集中' : '待命'}</span></small>
          </div>
        })}</div>
        <div className="quiet-card"><Waves size={18} /><span><strong>安静反馈</strong>没有提示时，请继续跳。</span></div>
      </aside>
      <section className="dance-view">
        <div className="training-toolbar" role="group" aria-label="训练播放模式">
          <button disabled={!mediaAvailable} aria-pressed={learningMode === 'teaching'} className={learningMode === 'teaching' ? 'selected' : ''} onClick={() => setLearningMode('teaching')}>教学模式</button>
          <button disabled={!mediaAvailable} aria-pressed={learningMode === 'follow'} className={learningMode === 'follow' ? 'selected' : ''} onClick={() => setLearningMode('follow')}>跟跳模式</button>
        </div>
        <div className="stage-top"><span>示范舞段 · 基础律动</span><span className="choreography-focus" aria-live="polite">{nextEvent ? `本拍重点 · ${LIMB_LABEL[nextEvent.limb]}` : '本拍重点 · 准备'}</span><strong>{Math.floor(currentTime).toString().padStart(2, '0')} / {Math.round(duration)} 秒</strong></div>
        <div className="teacher-stage video-stage">
          <div className="beat-grid" />
          <video
            className="video-stage-media"
            ref={videoRef}
            aria-label="18.66 秒舞蹈示范"
            src={demoDance}
            poster={demoDancePoster}
            playsInline
            preload="auto"
            onLoadedMetadata={event => {
              const mediaDuration = event.currentTarget.duration
              if (!Number.isFinite(mediaDuration) || mediaDuration <= 0) {
                setMediaAvailable(false)
                setPlaying(false)
                setMessage('无法读取视频信息，请重新加载后再试。')
                return
              }
              setMediaAvailable(true)
              setDuration(mediaDuration)
              if (initialReviewTimestamp !== undefined) {
                const destination = reviewSeekDestination(initialReviewTimestamp / 1000, mediaDuration)
                event.currentTarget.pause()
                event.currentTarget.currentTime = destination
                setCurrentTime(destination)
                setActiveSegment(getTeachingSegment(destination, mediaDuration))
                setMessage('正在回看已记录的动作误差。')
                return
              }
              setMessage('视频已就绪，点击播放开始教学。')
              if (autoStart) void event.currentTarget.play().catch(() => {
                setPlaying(false)
                setMessage('视频未能播放，请点击播放按钮重试。')
              })
            }}
            onPlay={() => { setPlaying(true); setMessage(learningMode === 'teaching' ? `${SEGMENT_LABELS[activeSegment]}教学播放中。` : '跟跳播放中。') }}
            onPause={() => setPlaying(false)}
            onTimeUpdate={updateTime}
            onEnded={finish}
            onError={() => {
              setMediaAvailable(false)
              setPlaying(false)
              setMessage('视频无法加载，请检查媒体文件后重新加载。')
            }}
          />
          <div className={`cue-card ${nextEvent?.accent ? 'accent' : ''}`}><small>{nextEvent?.accent ? '重拍提示 · 双腕长震' : '下一动作'}</small><strong>{nextEvent ? LIMB_LABEL[nextEvent.limb] : '准备结束'}</strong>{feedbackMode === 'rhythm' && nextEvent?.voice && <span><Volume2 size={15} /> 语音提示：{nextEvent.voice}</span>}</div>
        </div>
        <p className="playback-status" role="status">{message}</p>
        {learningMode === 'teaching' && <div className="segment-panel">
          <div className="segment-tabs">{SEGMENT_LABELS.map((label, index) => <button disabled={!mediaAvailable} key={label} className={activeSegment === index ? 'selected' : ''} aria-pressed={activeSegment === index} onClick={() => chooseSegment(index)}>{label}</button>)}</div>
          <div className="segment-controls"><button disabled={!mediaAvailable || activeSegment === 0} onClick={() => chooseSegment(activeSegment - 1)}>上一段</button><button disabled={!mediaAvailable} onClick={() => chooseSegment(activeSegment)}>重复本段</button><button disabled={!mediaAvailable || activeSegment === 2} onClick={() => chooseSegment(activeSegment + 1)}>下一段</button></div>
        </div>}
        <div className="timeline-wrap">
          <div className="timeline"><div className="timeline-progress" style={{ width: `${duration > 0 ? Math.min(100, currentTime / duration * 100) : 0}%` }} /></div>
          <TrainingTimeline duration={duration} currentTime={currentTime} errors={reviewSnapshot.errors} ranges={reviewRanges} onSeek={seekReview} />
          <div className="controls"><button disabled={!mediaAvailable} onClick={() => seek(-5)} aria-label="后退 5 秒">−5</button><button disabled={!mediaAvailable} className="play" onClick={togglePlayback} aria-label={playing ? '暂停' : '播放'}>{playing ? <Pause /> : <CirclePlay />}</button><button disabled={!mediaAvailable} onClick={() => seek(5)} aria-label="前进 5 秒">+5</button></div>
        </div>
      </section>
    </div>
  </main>
}
