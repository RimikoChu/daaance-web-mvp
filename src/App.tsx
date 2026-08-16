import { useCallback, useRef, useState } from 'react'
import { Activity, ArrowLeft, Check, ChevronRight, CirclePlay, Footprints, RotateCcw, Sparkles, Volume2, Waves } from 'lucide-react'
import { LIMB_LABEL } from './domain/choreography'
import { summarizeSession } from './domain/motion'
import { BLEMotionDataSource } from './domain/bleMotionDataSource'
import { HybridMotionDataSource } from './domain/hybridMotionDataSource'
import { MockMotionDataSource } from './domain/mockMotionDataSource'
import type { ChoreographyEvent, Limb, MotionDataSource, Strictness, TimingResult, TrainingMode } from './domain/types'
import { initialPodStates, PodConnectionPanel } from './components/PodConnectionPanel'
import type { PodConnectionHandle, PodStates } from './components/PodConnectionPanel'
import { BluetoothPodClient } from './hardware/ble/BluetoothPodClient'
import { useLeftWristHardware } from './hardware/useLeftWristHardware'
import type { LeftWristHardwareClient, LeftWristHardwareController } from './hardware/useLeftWristHardware'
import { HardwareTestPanel } from './hardware/HardwareTestPanel'
import { Training } from './components/Training'
import { CountdownGate } from './components/CountdownGate'

type Screen = 'home' | 'setup' | 'countdown' | 'training' | 'results'
const LIMBS: Limb[] = ['LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE']

function Logo() {
  return <div className="logo"><span>Daaance!</span><i /></div>
}

const POD_STATUS_LABEL = {
  'real-disconnected': 'Real hardware · Not connected',
  'real-connecting': 'Real hardware · Connecting…',
  'real-connected': 'Real hardware · Connected',
  'real-error': 'Real hardware · Error',
  demo: 'Demo',
}

function podVisualState(state: PodStates[Limb]): string {
  if (state === 'real-connecting') return 'connecting'
  if (state === 'real-connected') return 'hardware'
  if (state === 'demo') return 'demo'
  return 'disconnected'
}

function DeviceGrid({ active, error, podStates }: { active?: Limb; error?: Limb; podStates?: PodStates }) {
  return <div className="device-grid">
    {LIMBS.map(limb => <div key={limb} className={`device-chip ${podStates?.[limb] ?? ''} ${podStates ? podVisualState(podStates[limb]) : ''} ${active === limb ? 'active' : ''} ${error === limb ? 'error' : ''}`}>
      <span className="device-dot" />
      <span>{LIMB_LABEL[limb]}</span>
      <small>{error === limb ? (limb.includes('WRIST') ? '红灯纠错' : '震动纠错') : active === limb ? '动作中' : podStates ? POD_STATUS_LABEL[podStates[limb]] : '已连接'}</small>
    </div>)}
  </div>
}

function Home({ controller, onStart }: { controller: LeftWristHardwareController; onStart: (useRealHardware: boolean) => void }) {
  const [podStates, setPodStates] = useState<PodStates>(() => ({ ...initialPodStates }))
  const podsReady = podStates.LEFT_WRIST === 'real-connected' || podStates.LEFT_WRIST === 'demo'
  const connectionRef = useRef<PodConnectionHandle>(null)
  const startRequested = useRef(false)
  const handleReady = useCallback(() => {
    if (startRequested.current) onStart(controller.snapshot.state === 'connected')
  }, [controller.snapshot.state, onStart])
  const handleStart = () => {
    if (podsReady) {
      onStart(podStates.LEFT_WRIST === 'real-connected')
      return
    }
    startRequested.current = true
    connectionRef.current?.connect()
  }
  const readinessLabel = !podsReady
    ? 'Pods 等待连接'
    : podStates.LEFT_WRIST === 'real-connected' ? 'DAAANCE_LW 已连接' : 'Demo 已就绪'

  return <main className="home page-shell soft-glass-theme">
    <nav><Logo /><div className="mock-badge"><span /> {readinessLabel}</div></nav>
    <section className="hero">
      <div className="hero-copy">
        <div className="eyebrow"><Waves size={15} /> 感受节拍 · 看见动作</div>
        <h1>让身体，<br /><em>跟上节奏。</em></h1>
        <p>用视觉与触觉提示学会舞蹈。四个智能 Pod 读懂你的动作，在真正需要时给你反馈。</p>
        <button className="primary giant" onClick={handleStart}>开始训练 <ChevronRight size={20} /></button>
        <div className="principle"><span>训练原则</span><strong>没有反馈，就继续跳。</strong></div>
      </div>
      <div className="hero-stage" aria-label="四肢设备状态">
        <div className="rhythm-field" aria-label="四个 Pod 节拍场">
          <div className="rhythm-glow" aria-hidden="true" />
          <div className="rhythm-orbit rhythm-orbit-outer" aria-hidden="true" />
          <div className="rhythm-orbit rhythm-orbit-inner" aria-hidden="true" />
          <div className="rhythm-ripples" aria-hidden="true"><i /><i /><i /></div>
          <div className="rhythm-wave" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /></div>
          <ul className="rhythm-nodes" aria-label="Pod 位置">
            <li className="rhythm-node rhythm-node-lw"><span>LW</span></li>
            <li className="rhythm-node rhythm-node-rw"><span>RW</span></li>
            <li className="rhythm-node rhythm-node-la"><span>LA</span></li>
            <li className="rhythm-node rhythm-node-ra"><span>RA</span></li>
          </ul>
          <div className="rhythm-core" aria-hidden="true"><span /><i /></div>
          <PodConnectionPanel ref={connectionRef} controller={controller} variant="compact" onReady={handleReady} onStatesChange={setPodStates} />
        </div>
      </div>
    </section>
    <div className="device-strip"><DeviceGrid podStates={podStates} /></div>
  </main>
}

function Setup({ controller, feedbackMode, strictness, setFeedbackMode, setStrictness, onBack, onStart }: {
  controller: LeftWristHardwareController; feedbackMode: TrainingMode; strictness: Strictness; setFeedbackMode: (m: TrainingMode) => void; setStrictness: (s: Strictness) => void; onBack: () => void; onStart: () => void
}) {
  return <main className="page-shell setup-page soft-glass-theme">
    <nav><Logo /><button className="text-button" onClick={onBack}><ArrowLeft size={17} /> 返回</button></nav>
    <section className="setup-card">
      <div className="step-label">训练设置 · 约 20 秒</div>
      <h2>选择你的训练方式</h2>
      <p>随时可以重新开始。本次体验将使用模拟动作数据。</p>
      <h3>训练模式</h3>
      <div className="choice-grid">
        <button className={`choice ${feedbackMode === 'accessibility' ? 'selected' : ''}`} onClick={() => setFeedbackMode('accessibility')}>
          <div className="choice-icon"><Waves /></div><span><strong>无障碍模式</strong><small>视觉 + 触觉提示，不使用语音</small></span>{feedbackMode === 'accessibility' && <Check />}
        </button>
        <button className={`choice ${feedbackMode === 'rhythm' ? 'selected' : ''}`} onClick={() => setFeedbackMode('rhythm')}>
          <div className="choice-icon"><Volume2 /></div><span><strong>节奏教练模式</strong><small>加入数拍与方向口令</small></span>{feedbackMode === 'rhythm' && <Check />}
        </button>
      </div>
      <h3>纠错严格度</h3>
      <div className="strictness" role="group" aria-label="纠错严格度">
        {(['beginner', 'standard', 'advanced'] as Strictness[]).map((item, index) => <button key={item} className={strictness === item ? 'selected' : ''} onClick={() => setStrictness(item)}>
          <strong>{['初学', '标准', '进阶'][index]}</strong><small>{['先跟下来', '平衡节奏', '精修卡点'][index]}</small>
        </button>)}
      </div>
      <div className="setup-note"><Activity size={18} /><span><strong>Mock IMU 已开启</strong>硬件未连接也可以完整体验动作检测。</span></div>
      <HardwareTestPanel controller={controller} />
      <button className="primary full" onClick={onStart}>开始舞蹈 <CirclePlay size={20} /></button>
    </section>
  </main>
}

function Results({ results, onAgain, onHome }: { results: TimingResult[]; onAgain: () => void; onHome: () => void }) {
  const summary = summarizeSession(results)
  return <main className="page-shell results-page soft-glass-theme">
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

export interface AppProps {
  hardwareClient?: LeftWristHardwareClient
  bleSource?: BLEMotionDataSource
  choreography?: ChoreographyEvent[]
}

export default function App({ hardwareClient, bleSource: injectedBleSource, choreography }: AppProps = {}) {
  const [client] = useState<LeftWristHardwareClient>(() => hardwareClient ?? new BluetoothPodClient())
  const [bleSource] = useState(() => injectedBleSource ?? new BLEMotionDataSource())
  const hardware = useLeftWristHardware(client, bleSource)
  const [mockSource] = useState(() => new MockMotionDataSource())
  // Hybrid is selected only after the real Pod countdown. A later disconnect
  // changes connection status, not the session's left-wrist data provenance.
  const [hybridSource] = useState(() => new HybridMotionDataSource(
    bleSource,
    mockSource,
    () => true,
  ))
  const [screen, setScreen] = useState<Screen>('home')
  const [useRealHardware, setUseRealHardware] = useState(false)
  const [trainingSource, setTrainingSource] = useState<MotionDataSource>(mockSource)
  const [autoStart, setAutoStart] = useState(false)
  const [feedbackMode, setFeedbackMode] = useState<TrainingMode>('accessibility')
  const [strictness, setStrictness] = useState<Strictness>('standard')
  const [results, setResults] = useState<TimingResult[]>([])
  const sendFeedbackError = useCallback((_eventId: string) => hardware.sendCommand('FEEDBACK_ERROR'), [hardware.sendCommand])
  const ignoreFeedbackError = useCallback((_eventId: string) => {}, [])

  const startTraining = (source: MotionDataSource, shouldAutoStart: boolean) => {
    setTrainingSource(source)
    setAutoStart(shouldAutoStart)
    setScreen('training')
  }

  const restartTraining = () => {
    if (trainingSource.kind === 'hybrid') {
      setScreen('countdown')
      return
    }
    setAutoStart(false)
    setScreen('training')
  }

  if (screen === 'home') return <Home controller={hardware} onStart={realHardware => { setUseRealHardware(realHardware); setScreen('setup') }} />
  if (screen === 'setup') return <Setup controller={hardware} feedbackMode={feedbackMode} strictness={strictness} setFeedbackMode={setFeedbackMode} setStrictness={setStrictness} onBack={() => setScreen('home')} onStart={() => {
    if (useRealHardware) setScreen('countdown')
    else startTraining(mockSource, false)
  }} />
  if (screen === 'countdown') return <CountdownGate
    connectionState={hardware.snapshot.state}
    connect={hardware.connect}
    sendCommand={hardware.sendCommand}
    subscribeEvents={hardware.subscribeEvents}
    onHardwareReady={receivedAt => {
      bleSource.startSession(receivedAt)
      startTraining(hybridSource, true)
    }}
    onStartDemo={() => startTraining(mockSource, false)}
  />
  if (screen === 'training') {
    const leftWristStatus = trainingSource.kind !== 'hybrid'
      ? 'demo'
      : hardware.snapshot.state === 'connected'
        ? 'connected'
        : hardware.snapshot.state === 'error' || hardware.snapshot.state === 'unsupported'
          ? 'error'
          : 'disconnected'
    return <Training
      choreography={choreography}
      source={trainingSource}
      autoStart={autoStart}
      leftWristStatus={leftWristStatus}
      feedbackMode={feedbackMode}
      strictness={strictness}
      onFeedbackError={trainingSource.kind === 'hybrid' ? sendFeedbackError : ignoreFeedbackError}
      onExit={() => setScreen('setup')}
      onFinish={value => { setResults(value); setScreen('results') }}
    />
  }
  return <Results results={results} onHome={() => setScreen('home')} onAgain={restartTraining} />
}
