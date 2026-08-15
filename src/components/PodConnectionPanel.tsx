import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Bluetooth, Check, Radio } from 'lucide-react'
import { LIMB_LABEL } from '../domain/choreography'
import type { Limb } from '../domain/types'
import type { LeftWristHardwareController } from '../hardware/useLeftWristHardware'

export type PodState = 'real-disconnected' | 'real-connecting' | 'real-connected' | 'real-error' | 'demo'
export type PodStates = Record<Limb, PodState>
export interface PodConnectionHandle { connect: () => void }

const LIMBS: Limb[] = ['LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_ANKLE', 'RIGHT_ANKLE']
export const initialPodStates: PodStates = {
  LEFT_WRIST: 'real-disconnected',
  RIGHT_WRIST: 'demo',
  LEFT_ANKLE: 'demo',
  RIGHT_ANKLE: 'demo',
}

interface PodConnectionPanelProps {
  controller: LeftWristHardwareController
  onReady: () => void
  onStatesChange?: (states: PodStates) => void
  variant?: 'panel' | 'compact'
}

function realPodState(controller: LeftWristHardwareController, demoSelected: boolean): PodState {
  if (demoSelected) return 'demo'
  switch (controller.snapshot.state) {
    case 'connecting': return 'real-connecting'
    case 'connected': return 'real-connected'
    case 'error':
    case 'unsupported': return 'real-error'
    default: return 'real-disconnected'
  }
}

function realStatus(controller: LeftWristHardwareController): string {
  switch (controller.snapshot.state) {
    case 'connecting': return 'Connecting…'
    case 'connected': return 'Connected'
    case 'error':
    case 'unsupported': return controller.snapshot.error.message
    default: return 'Not connected'
  }
}

function visualState(state: PodState): string {
  if (state === 'real-connecting') return 'connecting'
  if (state === 'real-connected') return 'hardware'
  if (state === 'demo') return 'demo'
  return 'disconnected'
}

export const PodConnectionPanel = forwardRef<PodConnectionHandle, PodConnectionPanelProps>(function PodConnectionPanel({ controller, onReady, onStatesChange, variant = 'panel' }, ref) {
  const [demoSelected, setDemoSelected] = useState(false)
  const [demoTransitioning, setDemoTransitioning] = useState(false)
  const demoRequested = useRef(false)
  const mounted = useRef(false)
  const readyReported = useRef(false)
  const leftWristState = realPodState(controller, demoSelected)
  const isConnecting = controller.snapshot.state === 'connecting'
  const connectedSnapshot = controller.snapshot.state === 'connected' ? controller.snapshot : undefined
  const isConnected = Boolean(connectedSnapshot)
  const states = useMemo<PodStates>(() => ({
    LEFT_WRIST: leftWristState,
    RIGHT_WRIST: 'demo',
    LEFT_ANKLE: 'demo',
    RIGHT_ANKLE: 'demo',
  }), [leftWristState])

  const connect = () => {
    if (demoRequested.current) return
    void controller.connect().catch(() => {})
  }

  useImperativeHandle(ref, () => ({ connect }))

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (isConnected && !demoRequested.current && !readyReported.current) {
      readyReported.current = true
      onReady()
    }
  }, [isConnected, onReady])

  useEffect(() => {
    if (!isConnected && !demoSelected && !demoTransitioning) readyReported.current = false
  }, [demoSelected, demoTransitioning, isConnected])

  useEffect(() => {
    onStatesChange?.(states)
  }, [onStatesChange, states])

  const continueInDemo = () => {
    if (demoRequested.current || demoSelected) return
    demoRequested.current = true
    setDemoTransitioning(true)
    void controller.disconnect().then(() => {
      if (!mounted.current) return
      setDemoTransitioning(false)
      setDemoSelected(true)
      if (!readyReported.current) {
        readyReported.current = true
        onReady()
      }
    }).catch(() => {
      if (!mounted.current) return
      demoRequested.current = false
      setDemoTransitioning(false)
    })
  }

  const connectionDetails = <>
    <span>Real hardware</span>
    {connectedSnapshot && <span>{connectedSnapshot.deviceName}</span>}
    <span>{realStatus(controller)}</span>
    {isConnected && <span>{controller.snapshot.imuHz.toFixed(1)} Hz</span>}
  </>

  const actions = <>
    <button className={variant === 'compact' ? 'pod-compact-action' : 'primary pod-connect-button'} onClick={connect} disabled={isConnecting || isConnected || demoSelected || demoTransitioning}>
      {isConnecting ? 'Connecting DAAANCE_LW…' : 'Connect DAAANCE_LW'}
    </button>
    <button className={variant === 'compact' ? 'pod-compact-action' : 'secondary pod-connect-button'} onClick={continueInDemo} disabled={demoSelected || demoTransitioning}>{demoTransitioning ? 'Switching to Demo…' : 'Continue in Demo'}</button>
  </>

  if (variant === 'compact') return <section className="status-card pod-status-card" aria-label="Pod connection status">
    <Bluetooth size={17} />
    <div>
      <strong>{demoSelected ? 'Demo mode' : isConnected ? 'DAAANCE_LW' : 'Left wrist'}</strong>
      <small>{demoSelected ? <span>Four Demo Pods</span> : connectionDetails}</small>
    </div>
    <div className="pod-compact-actions">{actions}</div>
  </section>

  return <section className="pod-connection-panel" aria-label="Pod connection status">
    <div className="pod-panel-heading">
      <span><Bluetooth size={16} /> Pod 连接</span>
      <small>1 real left wrist · 3 Demo Pods</small>
    </div>
    <div className="pod-grid">
      {LIMBS.map(limb => {
        const isReal = limb === 'LEFT_WRIST' && states[limb] !== 'demo'
        return <article className={`pod-card ${states[limb]} ${visualState(states[limb])}`} key={limb}>
          <span className="pod-icon">{states[limb] === 'real-connected' || states[limb] === 'demo' ? <Check size={15} /> : <Radio size={15} />}</span>
          <div>
            <strong>{LIMB_LABEL[limb]}</strong>
            <small>{isReal ? connectionDetails : <span>Demo</span>}</small>
          </div>
        </article>
      })}
    </div>
    <div className="pod-panel-actions">{actions}</div>
  </section>
})
