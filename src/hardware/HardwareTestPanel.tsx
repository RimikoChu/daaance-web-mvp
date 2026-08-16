import type { BluetoothPodEvent } from './ble/bleTypes'
import type { HardwareCommandAttempt, LeftWristDiscreteEvent, LeftWristHardwareController } from './useLeftWristHardware'
import type { DaaanceBleCommand } from './ble/bleTypes'

interface HardwareTestPanelProps {
  controller: LeftWristHardwareController
}

const AXES = ['ax', 'ay', 'az', 'gx', 'gy', 'gz'] as const
const CONTROLS: Array<{ label: string; command: DaaanceBleCommand }> = [
  { label: 'Short vibration', command: 'VIBRATE_SHORT' },
  { label: 'Long vibration', command: 'VIBRATE_LONG' },
  { label: 'Error feedback', command: 'FEEDBACK_ERROR' },
  { label: 'Start countdown', command: 'START_COUNTDOWN' },
  { label: 'Stop', command: 'STOP_ALL' },
]

function eventName(event: LeftWristDiscreteEvent): string {
  return event.type === 'button-single-click' ? 'BUTTON_SINGLE_CLICK' : 'COUNTDOWN_DONE'
}

function milliseconds(value: number | undefined): string {
  return value === undefined ? '—' : `${value} ms`
}

type FeedbackExecution = Extract<BluetoothPodEvent, { type: 'feedback-executed' }>

function correlateAcknowledgements(
  attempts: HardwareCommandAttempt[],
  events: BluetoothPodEvent[],
): Map<HardwareCommandAttempt, FeedbackExecution> {
  const matches = new Map<HardwareCommandAttempt, FeedbackExecution>()
  const acknowledgements = events.filter((event): event is FeedbackExecution => event.type === 'feedback-executed')
    .sort((left, right) => left.receivedAt - right.receivedAt)
  const acknowledgedIds = new Set<string>()

  for (const acknowledgement of acknowledgements) {
    const acknowledgementId = [
      acknowledgement.pod,
      acknowledgement.hardwareTimestamp,
      acknowledgement.receivedAt,
      acknowledgement.feedback,
      acknowledgement.outputs.join(','),
    ].join('|')
    if (acknowledgedIds.has(acknowledgementId)) continue
    acknowledgedIds.add(acknowledgementId)
    const candidate = attempts
      .filter(attempt => attempt.command === 'FEEDBACK_ERROR'
        && attempt.status === 'sent'
        && !matches.has(attempt)
        && acknowledgement.receivedAt >= attempt.sentAt
        && acknowledgement.receivedAt - attempt.sentAt <= 5_000)
      .sort((left, right) => right.sentAt - left.sentAt || left.commandId.localeCompare(right.commandId))[0]
    if (candidate) matches.set(candidate, acknowledgement)
  }

  return matches
}

function rawEventName(event: BluetoothPodEvent): string {
  if (event.type === 'feedback-executed') return 'feedback-executed'
  if (event.type === 'button-single-click') return 'button-single-click'
  if (event.type === 'countdown-done') return 'countdown-done'
  return event.type
}

export function HardwareTestPanel({ controller }: HardwareTestPanelProps) {
  const { snapshot, latestImu, recentEvents, rawEventLog = [], commandAttempts = [] } = controller
  const acknowledgements = correlateAcknowledgements(commandAttempts, rawEventLog)
  const connectionError = snapshot.state === 'error' || snapshot.state === 'unsupported'
    ? snapshot.error.message
    : undefined

  return <section className="hardware-test" aria-labelledby="hardware-test-title">
    <h3 id="hardware-test-title">Hardware Test</h3>

    <dl>
      <div><dt>Device</dt><dd>{snapshot.state === 'connected' ? snapshot.deviceName : '—'}</dd></div>
      <div><dt>State</dt><dd>{snapshot.state}</dd></div>
      <div><dt>Firmware</dt><dd>{snapshot.firmware ?? '—'}</dd></div>
      <div><dt>Last receive</dt><dd>{milliseconds(snapshot.lastPacketAt)}</dd></div>
      <div><dt>Measured rate</dt><dd>{snapshot.imuHz.toFixed(1)} Hz</dd></div>
    </dl>

    {connectionError && <p role="status">{connectionError}</p>}

    <section aria-label="DAAANCE_LW connection">
      {snapshot.state === 'connected'
        ? <button type="button" onClick={() => { void controller.disconnect().catch(() => {}) }}>Disconnect DAAANCE_LW</button>
        : <button type="button" disabled={snapshot.state === 'connecting'} onClick={() => { void controller.connect().catch(() => {}) }}>Connect DAAANCE_LW</button>}
      <ul aria-label="Mock Pods">
        <li>Right wrist · Mock</li>
        <li>Left ankle · Mock</li>
        <li>Right ankle · Mock</li>
      </ul>
    </section>

    <section aria-labelledby="hardware-live-title">
      <h4 id="hardware-live-title">Live IMU</h4>
      <dl className="hardware-live-grid">
        {AXES.map(axis => <div key={axis}>
          <dt>{axis}</dt>
          <dd>{latestImu ? latestImu[axis].toFixed(2) : '—'}</dd>
        </div>)}
      </dl>
    </section>

    <section aria-label="Hardware controls" className="hardware-controls">
      {CONTROLS.map(({ label, command }) => <button
        key={command}
        type="button"
        disabled={snapshot.state !== 'connected'}
        onClick={() => { void controller.sendCommand(command).catch(() => {}) }}
      >{label}</button>)}
    </section>

    <section aria-labelledby="hardware-events-title">
      <h4 id="hardware-events-title">Recent events</h4>
      <ol className="hardware-events">
        {recentEvents.map((event, index) => <li key={`${event.type}-${event.receivedAt}-${index}`}>
          <strong>{eventName(event)}</strong>
          <span>hardware {milliseconds(event.hardwareTimestamp)} · received {milliseconds(event.receivedAt)}</span>
        </li>)}
      </ol>
    </section>

    <section aria-labelledby="hardware-command-audit-title">
      <h4 id="hardware-command-audit-title">Command attempts</h4>
      <ol className="hardware-events">
        {commandAttempts.map(attempt => {
          const acknowledgement = acknowledgements.get(attempt)
          const executionState = attempt.status === 'failed'
            ? `failed: ${attempt.failureReason ?? 'unknown error'}`
            : attempt.command === 'FEEDBACK_ERROR'
              ? acknowledgement ? 'execution acknowledged' : 'execution unconfirmed'
              : 'sent'
          return <li key={attempt.commandId}>{attempt.commandId} · {attempt.command} · sent {milliseconds(attempt.sentAt)} · {executionState}</li>
        })}
      </ol>
    </section>

    <section aria-labelledby="hardware-feedback-ack-title">
      <h4 id="hardware-feedback-ack-title">FEEDBACK_EXECUTED</h4>
      <ol className="hardware-events">
        {rawEventLog.filter((event): event is FeedbackExecution => event.type === 'feedback-executed').map((event, index) => {
          const attempt = [...acknowledgements.entries()].find(([, acknowledgement]) => acknowledgement === event)?.[0]
          const latency = attempt ? event.receivedAt - attempt.sentAt : undefined
          return <li key={`${event.hardwareTimestamp}-${event.receivedAt}-${index}`}>FEEDBACK_EXECUTED · hardware {milliseconds(event.hardwareTimestamp)} · received {milliseconds(event.receivedAt)}{latency === undefined ? ' · command uncorrelated' : ` · latency ${milliseconds(latency)}`} · {event.outputs.join(', ')}</li>
        })}
      </ol>
    </section>

    <section aria-labelledby="hardware-raw-events-title">
      <h4 id="hardware-raw-events-title">Raw BLE event log</h4>
      <ol className="hardware-events">
        {rawEventLog.map((event, index) => <li key={`${event.type}-${event.receivedAt}-${index}`}>{rawEventName(event)} · received {milliseconds(event.receivedAt)}</li>)}
      </ol>
    </section>
  </section>
}
