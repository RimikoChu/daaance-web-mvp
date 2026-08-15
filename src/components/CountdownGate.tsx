import { useEffect, useRef, useState } from 'react'
import { Bluetooth, RotateCcw } from 'lucide-react'
import type { BluetoothPodEvent, DaaanceBleCommand } from '../hardware/ble/bleTypes'
import type { LeftWristHardwareSnapshot } from '../hardware/useLeftWristHardware'

const COUNTDOWN_TIMEOUT_MS = 8_000

export interface CountdownGateProps {
  connectionState: LeftWristHardwareSnapshot['state']
  connect: () => Promise<void>
  sendCommand: (command: DaaanceBleCommand) => Promise<void>
  subscribeEvents: (listener: (event: BluetoothPodEvent) => void) => () => void
  onHardwareReady: (receivedAt: number) => void
  onStartDemo: () => void
}

export function CountdownGate({
  connectionState,
  connect,
  sendCommand,
  subscribeEvents,
  onHardwareReady,
  onStartDemo,
}: CountdownGateProps) {
  const [attempt, setAttempt] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const onHardwareReadyRef = useRef(onHardwareReady)
  const commandAttempt = useRef<number | undefined>(undefined)
  onHardwareReadyRef.current = onHardwareReady
  const showRecovery = timedOut || connectionState !== 'connected'

  useEffect(() => {
    if (connectionState !== 'connected') return

    let active = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    let unsubscribe = () => {}

    const finishAttempt = () => {
      if (!active) return false
      active = false
      unsubscribe()
      if (timeout !== undefined) clearTimeout(timeout)
      return true
    }

    unsubscribe = subscribeEvents(event => {
      if (event.type !== 'countdown-done' || !finishAttempt()) return
      onHardwareReadyRef.current(event.receivedAt)
    })
    timeout = setTimeout(() => {
      if (!finishAttempt()) return
      setTimedOut(true)
    }, COUNTDOWN_TIMEOUT_MS)
    if (commandAttempt.current !== attempt) {
      commandAttempt.current = attempt
      void sendCommand('START_COUNTDOWN').catch(() => {})
    }

    return () => {
      finishAttempt()
    }
  }, [attempt, connectionState, sendCommand, subscribeEvents])

  const retry = () => {
    setTimedOut(false)
    setAttempt(current => current + 1)
    if (connectionState === 'connected') return

    setReconnecting(true)
    void connect().catch(() => {
      setTimedOut(true)
    }).finally(() => {
      setReconnecting(false)
    })
  }

  return <main className="countdown-page page-shell soft-glass-theme">
    <section className="countdown-card" aria-live="polite">
      <div className="countdown-icon"><Bluetooth /></div>
      {showRecovery ? <>
        <span className="step-label">Hardware countdown timed out</span>
        <h2>The Pod did not finish its countdown.</h2>
        <p>Retry the real left-wrist Pod, or explicitly continue with four Demo Pods.</p>
        <div className="countdown-actions">
          <button className="secondary" onClick={retry} disabled={reconnecting}><RotateCcw size={18} /> Retry hardware</button>
          <button className="primary" onClick={onStartDemo}>Start in Demo</button>
        </div>
      </> : <>
        <span className="step-label">Real hardware countdown</span>
        <h2>Waiting for DAAANCE_LW…</h2>
        <p>Training starts when the left-wrist Pod reports that its countdown is complete.</p>
      </>}
    </section>
  </main>
}
