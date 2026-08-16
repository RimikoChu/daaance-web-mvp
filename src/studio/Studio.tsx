import { useEffect, useMemo, useRef, useState } from 'react'
import { CirclePlay, Pause, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import demoDance from '../assets/demo-dance.mp4'
import demoDancePoster from '../assets/demo-dance-poster.png'
import {
  cloneDefaultTimeline,
  type BeatIntensity,
  type ChoreographyTimeline,
  type KeyBeat,
  type StudioLimb,
} from '../domain/choreographyTimeline'
import { loadChoreography, saveChoreography } from './choreographyClient'

export interface ChoreographyClient {
  load(): Promise<ChoreographyTimeline>
  save(timeline: ChoreographyTimeline): Promise<ChoreographyTimeline>
}

interface StudioProps {
  client?: ChoreographyClient
  createId?: () => string
  confirmReset?: () => boolean
}

const defaultClient: ChoreographyClient = { load: loadChoreography, save: saveChoreography }
const INTENSITIES: BeatIntensity[] = ['light', 'medium', 'strong']
const LIMBS: StudioLimb[] = ['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle']

function formatTime(timeMs: number): string {
  return `${(timeMs / 1000).toFixed(2)}s`
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) || target.isContentEditable
}

function comparable(timeline: ChoreographyTimeline): string {
  return JSON.stringify(timeline.beats)
}

export function Studio({
  client = defaultClient,
  createId = () => crypto.randomUUID(),
  confirmReset = () => window.confirm('清空当前所有人工关键拍？'),
}: StudioProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const [draft, setDraft] = useState<ChoreographyTimeline>(() => cloneDefaultTimeline())
  const [loadedDraft, setLoadedDraft] = useState<ChoreographyTimeline>(() => cloneDefaultTimeline())
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTimeMs, setCurrentTimeMs] = useState(0)
  const [message, setMessage] = useState('正在读取最新关键拍…')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    client.load().then(timeline => {
      if (!active) return
      setDraft(timeline)
      setLoadedDraft(timeline)
      setMessage('已读取最新关键拍。')
    }).catch(() => {
      if (active) setMessage('读取失败，当前显示默认关键拍。')
    })
    return () => { active = false }
  }, [client])

  const dirty = useMemo(() => comparable(draft) !== comparable(loadedDraft), [draft, loadedDraft])

  const selectBeat = (id: string) => {
    setSelectedBeatId(id)
    requestAnimationFrame(() => rowRefs.current.get(id)?.scrollIntoView?.({ block: 'nearest' }))
  }

  const markCurrentBeat = () => {
    const video = videoRef.current
    if (!video) return
    const timeMs = Math.max(0, Math.min(18660, Math.round(video.currentTime * 100) * 10))
    const nearby = draft.beats.find(beat => Math.abs(beat.timeMs - timeMs) <= 100)
    if (nearby) {
      selectBeat(nearby.id)
      setMessage(`${formatTime(nearby.timeMs)} 已有关键拍。`)
      return
    }
    const beat: KeyBeat = { id: createId(), timeMs, intensity: 'medium', limb: 'left_wrist' }
    setDraft(current => ({ ...current, beats: [...current.beats, beat].sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)) }))
    selectBeat(beat.id)
    setMessage(`已添加 ${formatTime(timeMs)} 关键拍。`)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || event.repeat || isEditableTarget(event.target)) return
      event.preventDefault()
      markCurrentBeat()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [createId, draft.beats])

  const updateBeat = (id: string, change: Partial<KeyBeat>) => {
    setDraft(current => ({ ...current, beats: current.beats.map(beat => beat.id === id ? { ...beat, ...change } : beat) }))
  }

  const seekTo = (beat: KeyBeat) => {
    if (videoRef.current) videoRef.current.currentTime = beat.timeMs / 1000
    setCurrentTimeMs(beat.timeMs)
    selectBeat(beat.id)
  }

  const reset = () => {
    if (dirty && !confirmReset()) return
    const next = cloneDefaultTimeline()
    setDraft(next)
    setSelectedBeatId(null)
    setMessage('已清空全部关键拍；点击保存并同步后才会写入。')
  }

  const save = async () => {
    setSaving(true)
    setMessage('正在保存并同步…')
    try {
      const saved = await client.save(draft)
      setDraft(saved)
      setLoadedDraft(saved)
      setMessage(`已同步 · ${new Date(saved.updatedAt).toLocaleTimeString()}`)
    } catch {
      setMessage('保存失败，请重试。')
    } finally {
      setSaving(false)
    }
  }

  const togglePlayback = async () => {
    const video = videoRef.current
    if (!video) return
    if (!video.paused) video.pause()
    else await video.play().catch(() => setMessage('视频未能播放，请重试。'))
  }

  return <main className="studio-page">
    <header className="studio-header">
      <div><span className="studio-kicker">Daaance! Studio</span><h1>关键拍编辑器</h1><p>播放视频，按空格快速标记当前时刻。</p></div>
      <div className="studio-actions">
        <button className="studio-mark-action" onClick={markCurrentBeat}><Plus size={17} /> 添加当前关键拍</button>
        <button className="secondary" onClick={reset}><RotateCcw size={16} /> 清空全部</button>
        <button className="primary" disabled={saving} onClick={save}><Save size={16} /> {saving ? '同步中…' : '保存并同步'}</button>
      </div>
    </header>
    <div className="studio-layout">
      <section className="studio-preview">
        <video
          ref={videoRef}
          aria-label="Studio 18.66 秒舞蹈示范"
          src={demoDance}
          poster={demoDancePoster}
          playsInline
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={event => setCurrentTimeMs(Math.round(event.currentTarget.currentTime * 1000))}
          onEnded={event => {
            event.currentTarget.currentTime = 0
            setCurrentTimeMs(0)
            setPlaying(false)
          }}
        />
        <button className="studio-play" onClick={togglePlayback} aria-label={playing ? '暂停视频' : '播放视频'}>{playing ? <Pause /> : <CirclePlay />}</button>
        <div className="studio-clock"><strong>{formatTime(currentTimeMs)}</strong><span>/ 18.66s</span></div>
        <div className="studio-timeline" aria-label="关键拍时间线">
          <i style={{ left: `${currentTimeMs / 18660 * 100}%` }} />
          {draft.beats.map(beat => <button
            key={beat.id}
            className={selectedBeatId === beat.id ? `studio-marker ${beat.intensity} selected` : `studio-marker ${beat.intensity}`}
            style={{ left: `${beat.timeMs / 18660 * 100}%` }}
            aria-label={`选择 ${formatTime(beat.timeMs)}`}
            onClick={() => seekTo(beat)}
          />)}
        </div>
        <p className="studio-status" role="status">{message}</p>
      </section>
      <section className="studio-beats">
        <div className="studio-beats-head"><h2>Timeline</h2><span>{draft.beats.length} 个关键拍</span></div>
        <div className="studio-beat-list">
          {draft.beats.map(beat => <article
            key={beat.id}
            ref={node => { if (node) rowRefs.current.set(beat.id, node); else rowRefs.current.delete(beat.id) }}
            data-testid={`beat-${beat.id}`}
            aria-current={selectedBeatId === beat.id ? 'true' : undefined}
            className={selectedBeatId === beat.id ? 'studio-beat selected' : 'studio-beat'}
          >
            <button className="studio-time" onClick={() => seekTo(beat)} aria-label={`定位到 ${formatTime(beat.timeMs)}`}>{formatTime(beat.timeMs)}</button>
            <label><span>强度</span><select aria-label="关键拍强度" value={beat.intensity} onChange={event => updateBeat(beat.id, { intensity: event.target.value as BeatIntensity })}>{INTENSITIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <label><span>部位</span><select aria-label="关键拍部位" value={beat.limb} onChange={event => updateBeat(beat.id, { limb: event.target.value as StudioLimb })}>{LIMBS.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
            <button className="studio-delete" aria-label={`删除 ${formatTime(beat.timeMs)}`} onClick={() => setDraft(current => ({ ...current, beats: current.beats.filter(item => item.id !== beat.id) }))}><Trash2 size={16} /></button>
          </article>)}
        </div>
      </section>
    </div>
  </main>
}
