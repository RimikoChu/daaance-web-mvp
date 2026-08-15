import type { LeftWristDiscreteEvent, LeftWristHardwareController } from './useLeftWristHardware'
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

export function HardwareTestPanel({ controller }: HardwareTestPanelProps) {
  const { snapshot, latestImu, recentEvents } = controller
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
  </section>
}
