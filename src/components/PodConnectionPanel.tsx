import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Bluetooth, Check, Radio } from 'lucide-react'
import { LIMB_LABEL } from '../domain/choreography'
import type { Limb } from '../domain/types'

export type PodState = 'disconnected' | 'connecting' | 'hardware' | 'demo'
export type PodStates = Record<Limb, PodState>
export interface PodConnectionHandle { connect: () => void }
type BluetoothDevice = {
  id: string
  gatt?: { connect: () => Promise<unknown> }
}
type BluetoothNavigator = Navigator & {
  bluetooth?: { requestDevice: (options: { filters: Array<{ namePrefix: string }> }) => Promise<BluetoothDevice> }
}

const LIMBS: Limb[] = ['LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE']
export const initialPodStates: PodStates = {
  LEFT_WRIST: 'disconnected',
  RIGHT_WRIST: 'disconnected',
  LEFT_ANKLE: 'disconnected',
  RIGHT_ANKLE: 'disconnected',
}

const statusLabel: Record<PodState, string> = {
  disconnected: '未连接',
  connecting: '连接中…',
  hardware: '硬件 · 已连接',
  demo: 'Demo · 50Hz',
}

interface PodConnectionPanelProps {
  onReady: () => void
  onStatesChange?: (states: PodStates) => void
  variant?: 'panel' | 'compact'
}

export const PodConnectionPanel = forwardRef<PodConnectionHandle, PodConnectionPanelProps>(function PodConnectionPanel({ onReady, onStatesChange, variant = 'panel' }, ref) {
  const [states, setStates] = useState<PodStates>(() => ({ ...initialPodStates }))
  const readyReported = useRef(false)
  const connectingRef = useRef(false)
  const isConnecting = LIMBS.some(limb => states[limb] === 'connecting')
  const isReady = LIMBS.every(limb => states[limb] === 'hardware' || states[limb] === 'demo')
  const terminalCount = LIMBS.filter(limb => states[limb] === 'hardware' || states[limb] === 'demo').length

  useEffect(() => {
    if (isReady && !readyReported.current) {
      readyReported.current = true
      onReady()
    }
  }, [isReady, onReady])

  useEffect(() => {
    onStatesChange?.(states)
  }, [onStatesChange, states])

  async function connectPods() {
    if (connectingRef.current || isReady) return
    connectingRef.current = true
    setStates(Object.fromEntries(LIMBS.map(limb => [limb, 'connecting'])) as Record<Limb, PodState>)
    const bluetooth = (navigator as BluetoothNavigator).bluetooth
    const connectedDeviceIds = new Set<string>()

    if (!bluetooth) {
      await Promise.resolve()
      LIMBS.forEach(limb => setStates(current => ({ ...current, [limb]: 'demo' })))
      connectingRef.current = false
      return
    }

    for (const limb of LIMBS) {
      let state: PodState = 'demo'
      try {
        const device = await bluetooth.requestDevice({ filters: [{ namePrefix: 'Daaance Pod' }] })
        if (device.gatt && !connectedDeviceIds.has(device.id)) {
          await device.gatt.connect()
          connectedDeviceIds.add(device.id)
          state = 'hardware'
        }
      } catch {
        state = 'demo'
      }
      setStates(current => ({ ...current, [limb]: state }))
    }
    connectingRef.current = false
  }

  useImperativeHandle(ref, () => ({ connect: () => { void connectPods() } }))

  if (variant === 'compact') return <section className="status-card pod-status-card" aria-label="连接四个 Pods">
    <Bluetooth size={17} />
    <div><strong>{isReady ? '4 / 4' : `${terminalCount} / 4`}</strong><span>{isReady ? 'Pods 已连接' : 'Pods 待连接'}</span></div>
    <button className="pod-compact-action" onClick={() => { void connectPods() }} disabled={isConnecting || isReady}>
      {isConnecting ? '连接中…' : isReady ? '已就绪' : '连接 4 个 Pods'}
    </button>
  </section>

  return <section className="pod-connection-panel" aria-label="连接四个 Pods">
    <div className="pod-panel-heading">
      <span><Bluetooth size={16} /> Pod 连接</span>
      <small>{isReady ? '四个 Pod 已就绪' : '连接后可继续设置'}</small>
    </div>
    <div className="pod-grid">
      {LIMBS.map(limb => <article className={`pod-card ${states[limb]}`} key={limb}>
        <span className="pod-icon">{states[limb] === 'hardware' ? <Check size={15} /> : <Radio size={15} />}</span>
        <div><strong>{LIMB_LABEL[limb]}</strong><small>{statusLabel[states[limb]]}</small></div>
      </article>)}
    </div>
    <button className="primary pod-connect-button" onClick={() => { void connectPods() }} disabled={isConnecting || isReady}>
      {isConnecting ? '正在连接 Pods…' : isReady ? 'Pods 已就绪' : '连接 4 个 Pods'}
    </button>
  </section>
})
