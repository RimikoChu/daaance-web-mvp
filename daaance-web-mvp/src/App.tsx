import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, ArrowLeft, Bluetooth, Check, ChevronRight, CirclePlay, Footprints, Pause, RotateCcw, Settings2, Sparkles, Volume2, Waves } from 'lucide-react'
import { CHOREOGRAPHY, DANCE_DURATION, LIMB_LABEL, TOLERANCE } from './domain/choreography'
import { MockMotionDataSource } from './domain/mockMotionDataSource'
import { analyzeTiming, summarizeSession } from './domain/motion'
import type { ChoreographyEvent, Limb, Strictness, TimingResult, TrainingMode } from './domain/types'

type Screen = 'home' | 'setup' | 'training' | 'results'
const LIMBS: Limb[] = ['LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE']

function Logo() {
  return <div className="logo"><span>Daaance!</span><i /></div>
}

function DeviceGrid({ active, error }: { active?: Limb; error?: Limb }) {
  return <div className="device-grid">
    {LIMBS.map(limb => <div key={limb} className={`device-chip ${active === limb ? 'active' : ''} ${error === limb ? 'error' : ''}`}>
      <span className="device-dot" />
      <span>{LIMB_LABEL[limb]}</span>
      <small>{error === limb ? (limb.includes('WRIST') ? '红灯纠错' : '震动纠错') : active === limb ? '动作中' : '已连接'}</small>
    </div>)}
  </div>
}

function Home({ onStart }: { onStart: () => void }) {
  return <main className="home page-shell">
    <nav><Logo /><div className="mock-badge"><span /> 模拟设备已就绪</div></nav>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Waves size={15} /> 感受节拍 · 看见动作</div>
        <h1>让身体，<br /><em>跟上节奏。</em></h1>
        <p>用视觉与触觉提示学会舞蹈。四个智能 Pod 读懂你的动作，在真正需要时给你反馈。</p>
        <button className="primary giant" onClick={onStart}>开始训练 <ChevronRight size={20} /></button>
        <div className="principle"><span>训练原则</span><strong>没有反馈，就继续跳。</strong></div>
      </div>
      <div className="hero-stage" aria-label="四肢设备状态">
        <div className="halo halo-one" /><div className="halo halo-two" />
        <div className="dancer">
          <div className="head" /><div className="torso" />
          <div className="arm arm-left"><i /></div><div className="arm arm-right"><i /></div>
          <div className="leg leg-left"><i /></div><div className="leg leg-right"><i /></div>
        </div>
        <div className="status-card"><Bluetooth size={17} /><div><strong>4 / 4</strong><span>Pods 已连接</span></div></div>
      </div>
    </section>
    <div className="device-strip"><DeviceGrid /></div>
  </main>
}

function Setup({ mode, strictness, setMode, setStrictness, onBack, onStart }: {
  mode: TrainingMode; strictness: Strictness; setMode: (m: TrainingMode) => void; setStrictness: (s: Strictness) => void; onBack: () => void; onStart: () => void
}) {
  return <main className="page-shell setup-page">
    <nav><Logo /><button className="text-button" onClick={onBack}><ArrowLeft size={17} /> 返回</button></nav>
    <section className="setup-card">
      <div className="step-label">训练设置 · 约 20 秒</div>
      <h2>选择你的训练方式</h2>
      <p>随时可以重新开始。本次体验将使用模拟动作数据。</p>
      <h3>训练模式</h3>
      <div className="choice-grid">
        <button className={`choice ${mode === 'accessibility' ? 'selected' : ''}`} onClick={() => setMode('accessibility')}>
          <div className="choice-icon"><Waves /></div><span><strong>无障碍模式</strong><small>视觉 + 触觉提示，不使用语音</small></span>{mode === 'accessibility' && <Check />}
        </button>
        <button className={`choice ${mode === 'rhythm' ? 'selected' : ''}`} onClick={() => setMode('rhythm')}>
          <div className="choice-icon"><Volume2 /></div><span><strong>节奏教练模式</strong><small>加入数拍与方向口令</small></span>{mode === 'rhythm' && <Check />}
        </button>
      </div>
      <h3>纠错严格度</h3>
      <div className="strictness" role="group" aria-label="纠错严格度">
        {(['beginner', 'standard', 'advanced'] as Strictness[]).map((item, index) => <button key={item} className={strictness === item ? 'selected' : ''} onClick={() => setStrictness(item)}>
          <strong>{['初学', '标准', '进阶'][index]}</strong><small>{['先跟下来', '平衡节奏', '精修卡点'][index]}</small>
        </button>)}
      </div>
      <div className="setup-note"><Activity size={18} /><span><strong>Mock IMU 已开启</strong>硬件未连接也可以完整体验动作检测。</span></div>
      <button className="primary full" onClick={onStart}>开始舞蹈 <CirclePlay size={20} /></button>
    </section>
  </main>
}

function Training({ mode, strictness, duration, onFinish, onExit }: { mode: TrainingMode; strictness: Strictness; duration: number; onFinish: (r: TimingResult[]) => void; onExit: () => void }) {
  const [elapsed, setElapsed] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [results, setResults] = useState<TimingResult[]>([])
  const handled = useRef(new Set<string>())
  const source = useMemo(() => new MockMotionDataSource(), [])
  const scale = duration / DANCE_DURATION
  const logicalTime = Math.min(DANCE_DURATION, elapsed / scale)
  const nextEvent = CHOREOGRAPHY.find(event => event.time >= logicalTime - 350 && event.time <= logicalTime + 600)
  const latest = results.at(-1)

  useEffect(() => {
    if (!playing) return
    const started = performance.now() - elapsed
    const timer = window.setInterval(() => {
      const value = performance.now() - started
      setElapsed(value)
      if (value >= duration) setPlaying(false)
    }, Math.min(50, Math.max(10, duration / 20)))
    return () => window.clearInterval(timer)
  }, [playing, duration])

  useEffect(() => {
    for (const event of CHOREOGRAPHY) {
      if (logicalTime >= event.time && !handled.current.has(event.id)) {
        handled.current.add(event.id)
        setResults(current => [...current, analyzeTiming(event, source.getSamples(event), TOLERANCE[strictness])])
      }
    }
  }, [logicalTime, source, strictness])

  useEffect(() => {
    if (elapsed >= duration) onFinish(results.length === CHOREOGRAPHY.length ? results : CHOREOGRAPHY.map(event => analyzeTiming(event, source.getSamples(event), TOLERANCE[strictness])))
  }, [elapsed, duration, onFinish, results, source, strictness])

  const seek = (delta: number) => setElapsed(value => Math.max(0, Math.min(duration, value + delta * scale)))
  const currentError = latest && latest.status !== 'correct' && logicalTime - latest.event.time < 850 ? latest.event.limb : undefined

  return <main className="training-page">
    <header><Logo /><div className="training-mode"><span className="live-dot" />{mode === 'accessibility' ? '无障碍模式' : '节奏教练模式'}</div><button className="text-button" onClick={onExit}>退出训练</button></header>
    <div className="training-layout">
      <aside><div className="aside-title"><Bluetooth size={16} /> Pod 状态</div><DeviceGrid active={nextEvent?.limb} error={currentError} /><div className="quiet-card"><Waves size={18} /><span><strong>安静反馈</strong>没有提示时，请继续跳。</span></div></aside>
      <section className="dance-view">
        <div className="stage-top"><span>示范舞段 · 基础律动</span><strong>{Math.floor(logicalTime / 1000).toString().padStart(2, '0')} / 20 秒</strong></div>
        <div className="teacher-stage">
          <div className="beat-grid" />
          <div className={`teacher ${nextEvent?.limb.toLowerCase().replace('_', '-') ?? ''}`}><div className="teacher-head" /><div className="teacher-body" /><div className="teacher-arm left" /><div className="teacher-arm right" /><div className="teacher-leg left" /><div className="teacher-leg right" /></div>
          <div className={`cue-card ${nextEvent?.accent ? 'accent' : ''}`}>
            <small>{nextEvent?.accent ? '重拍提示 · 双腕长震' : '下一动作'}</small>
            <strong>{nextEvent ? LIMB_LABEL[nextEvent.limb] : '准备结束'}</strong>
            {mode === 'rhythm' && nextEvent?.voice && <span><Volume2 size={15} /> 语音提示：{nextEvent.voice}</span>}
          </div>
          {currentError && <div className="error-toast"><span>需要注意</span><strong>{LIMB_LABEL[currentError]} {latest?.status === 'late' ? '慢了一点' : latest?.status === 'early' ? '快了一点' : '动作不明显'}</strong></div>}
        </div>
        <div className="timeline-wrap">
          <div className="timeline"><div className="timeline-progress" style={{ width: `${Math.min(100, elapsed / duration * 100)}%` }} />{CHOREOGRAPHY.map(event => <i key={event.id} className={event.accent ? 'accent' : ''} style={{ left: `${event.time / DANCE_DURATION * 100}%` }} />)}</div>
          <div className="controls"><button onClick={() => seek(-15000)} aria-label="后退15秒">−15</button><button className="play" onClick={() => setPlaying(v => !v)} aria-label={playing ? '暂停' : '播放'}>{playing ? <Pause /> : <CirclePlay />}</button><button onClick={() => seek(15000)} aria-label="前进15秒">+15</button></div>
        </div>
      </section>
    </div>
  </main>
}

function Results({ results, onAgain, onHome }: { results: TimingResult[]; onAgain: () => void; onHome: () => void }) {
  const summary = summarizeSession(results)
  return <main className="page-shell results-page">
    <nav><Logo /><button className="text-button" onClick={onHome}>返回首页</button></nav>
    <section className="results-head"><div className="result-check"><Check /></div><div><span>训练记录已生成</span><h2>本次训练完成</h2><p>动作完成得不错。下面只展示最值得关注的信息。</p></div></section>
    <div className="results-grid">
      <section className="score-card"><span>节奏准确率</span><div className="score-ring" style={{ '--score': `${summary.accuracy * 3.6}deg` } as React.CSSProperties}><strong>{summary.accuracy}<small>%</small></strong></div><p>在当前纠错标准下<br />命中目标节拍</p></section>
      <section className="limb-results"><h3>四肢表现</h3>{LIMBS.map(limb => { const item = summary.limbs[limb]; return <div className="limb-row" key={limb}><div className="limb-symbol">{limb.includes('WRIST') ? <Waves /> : <Footprints />}</div><div><strong>{item.label}</strong><small>{item.tendency === 'good' ? '节奏稳定' : item.averageError === null ? '动作未捕捉' : `平均 ${Math.abs(item.averageError)}ms ${item.averageError > 0 ? '偏晚' : '偏早'}`}</small></div><span className={item.tendency === 'good' ? 'good' : 'focus'}>{item.tendency === 'good' ? '很好' : '注意'}</span></div>})}</section>
      <section className="coach-card"><div><Sparkles /></div><span><small>Daaance! 教练建议</small><p>{summary.coaching}</p></span></section>
    </div>
    <div className="result-actions"><button className="secondary" onClick={onHome}>回到首页</button><button className="primary" onClick={onAgain}><RotateCcw size={18} /> 再跳一次</button></div>
  </main>
}

export default function App({ demoDuration = DANCE_DURATION }: { demoDuration?: number }) {
  const [screen, setScreen] = useState<Screen>('home')
  const [mode, setMode] = useState<TrainingMode>('accessibility')
  const [strictness, setStrictness] = useState<Strictness>('standard')
  const [results, setResults] = useState<TimingResult[]>([])

  if (screen === 'home') return <Home onStart={() => setScreen('setup')} />
  if (screen === 'setup') return <Setup mode={mode} strictness={strictness} setMode={setMode} setStrictness={setStrictness} onBack={() => setScreen('home')} onStart={() => setScreen('training')} />
  if (screen === 'training') return <Training mode={mode} strictness={strictness} duration={demoDuration} onExit={() => setScreen('setup')} onFinish={value => { setResults(value); setScreen('results') }} />
  return <Results results={results} onHome={() => setScreen('home')} onAgain={() => setScreen('training')} />
}
