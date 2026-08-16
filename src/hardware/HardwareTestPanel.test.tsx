import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import type { LeftWristHardwareController, LeftWristHardwareSnapshot } from './useLeftWristHardware'
import { HardwareTestPanel } from './HardwareTestPanel'

function controller(
  snapshot: LeftWristHardwareSnapshot,
  overrides: Partial<LeftWristHardwareController> = {},
): LeftWristHardwareController {
  return {
    snapshot,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    sendCommand: vi.fn(async () => {}),
    subscribeEvents: vi.fn(() => vi.fn()),
    recentEvents: [],
    rawEventLog: [],
    commandAttempts: [],
    ...overrides,
  }
}

describe('HardwareTestPanel', () => {
  it('renders connected telemetry, six live axes, and both timestamps for recent events', () => {
    render(<HardwareTestPanel controller={controller({
      state: 'connected',
      deviceName: 'DAAANCE_LW',
      firmware: '0.1.7',
      lastPacketAt: 1200.5,
      imuHz: 49.84,
    }, {
      latestImu: {
        type: 'imu',
        pod: 'left_wrist',
        hardwareTimestamp: 1190,
        receivedAt: 1200.5,
        ax: 1.236,
        ay: -2.344,
        az: 3.456,
        gx: 4.564,
        gy: -5.676,
        gz: 6.784,
      },
      recentEvents: [
        { type: 'button-single-click', pod: 'left_wrist', hardwareTimestamp: 33, receivedAt: 1130.5 },
        { type: 'countdown-done', pod: 'left_wrist', hardwareTimestamp: 44, receivedAt: 1140.5 },
      ],
    })} />)

    expect(screen.getByRole('heading', { name: 'Hardware Test' })).toBeInTheDocument()
    expect(screen.getByText('DAAANCE_LW')).toBeInTheDocument()
    expect(screen.getByText('connected')).toBeInTheDocument()
    expect(screen.getByText('0.1.7')).toBeInTheDocument()
    expect(screen.getByText('1200.5 ms')).toBeInTheDocument()
    expect(screen.getByText('49.8 Hz')).toBeInTheDocument()

    for (const axis of ['ax', 'ay', 'az', 'gx', 'gy', 'gz']) {
      expect(screen.getByText(axis)).toBeInTheDocument()
    }
    for (const value of ['1.24', '-2.34', '3.46', '4.56', '-5.68', '6.78']) {
      expect(screen.getByText(value)).toBeInTheDocument()
    }

    expect(screen.getByText('BUTTON_SINGLE_CLICK')).toBeInTheDocument()
    expect(screen.getByText('hardware 33 ms · received 1130.5 ms')).toBeInTheDocument()
    expect(screen.getByText('COUNTDOWN_DONE')).toBeInTheDocument()
    expect(screen.getByText('hardware 44 ms · received 1140.5 ms')).toBeInTheDocument()
  })

  it('renders the unsupported-browser message verbatim from controller state', () => {
    const message = 'Web Bluetooth is not supported in this browser. Please use Chrome or Edge.'

    render(<HardwareTestPanel controller={controller({
      state: 'unsupported',
      error: { code: 'unsupported', message },
      imuHz: 0,
    })} />)

    expect(screen.getByText(message)).toBeInTheDocument()
  })

  it('exposes truthful connection controls, explicit Mock pods, command audit records, ACK timing, and raw BLE events', () => {
    const hardware = controller({ state: 'connected', deviceName: 'DAAANCE_LW', imuHz: 0 }, {
      commandAttempts: [{
        commandId: 'command-7', command: 'FEEDBACK_ERROR', sentAt: 100, status: 'sent',
      }],
      rawEventLog: [{
        type: 'feedback-executed', pod: 'left_wrist', hardwareTimestamp: 1200, receivedAt: 135,
        feedback: 'ERROR', outputs: ['LED', 'VIBRATION'],
      }],
    })
    render(<HardwareTestPanel controller={hardware} />)

    expect(screen.getByRole('button', { name: 'Disconnect DAAANCE_LW' })).toBeEnabled()
    expect(screen.getByText('Right wrist · Mock')).toBeInTheDocument()
    expect(screen.getByText('Left ankle · Mock')).toBeInTheDocument()
    expect(screen.getByText('Right ankle · Mock')).toBeInTheDocument()
    expect(screen.getByText('command-7 · FEEDBACK_ERROR · sent 100 ms · execution acknowledged')).toBeInTheDocument()
    expect(screen.getByText('FEEDBACK_EXECUTED · hardware 1200 ms · received 135 ms · latency 35 ms · LED, VIBRATION')).toBeInTheDocument()
    expect(screen.getByText('feedback-executed · received 135 ms')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Disconnect DAAANCE_LW' }))
    expect(hardware.disconnect).toHaveBeenCalledOnce()
  })

  it('offers only the DAAANCE_LW connection action when disconnected', () => {
    const hardware = controller({ state: 'disconnected', imuHz: 0 })
    render(<HardwareTestPanel controller={hardware} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect DAAANCE_LW' }))
    expect(hardware.connect).toHaveBeenCalledOnce()
  })

  it('correlates one acknowledgement only to the closest preceding FEEDBACK_ERROR attempt', () => {
    render(<HardwareTestPanel controller={controller({ state: 'connected', deviceName: 'DAAANCE_LW', imuHz: 0 }, {
      commandAttempts: [
        { commandId: 'command-early', command: 'FEEDBACK_ERROR', sentAt: 100, status: 'sent' },
        { commandId: 'command-late', command: 'FEEDBACK_ERROR', sentAt: 120, status: 'sent' },
      ],
      rawEventLog: [{
        type: 'feedback-executed', pod: 'left_wrist', hardwareTimestamp: 1_200, receivedAt: 135,
        feedback: 'ERROR', outputs: ['LED'],
      }],
    })} />)

    expect(screen.getByText('command-early · FEEDBACK_ERROR · sent 100 ms · execution unconfirmed')).toBeInTheDocument()
    expect(screen.getByText('command-late · FEEDBACK_ERROR · sent 120 ms · execution acknowledged')).toBeInTheDocument()
    expect(screen.getByText('FEEDBACK_EXECUTED · hardware 1200 ms · received 135 ms · latency 15 ms · LED')).toBeInTheDocument()
  })

  it('does not treat a duplicate FEEDBACK_EXECUTED record as a second execution', () => {
    const acknowledgement = {
      type: 'feedback-executed' as const, pod: 'left_wrist' as const, hardwareTimestamp: 1_200, receivedAt: 135,
      feedback: 'ERROR' as const, outputs: ['LED'] as Array<'LED' | 'VIBRATION'>,
    }
    render(<HardwareTestPanel controller={controller({ state: 'connected', deviceName: 'DAAANCE_LW', imuHz: 0 }, {
      commandAttempts: [
        { commandId: 'command-early', command: 'FEEDBACK_ERROR', sentAt: 100, status: 'sent' },
        { commandId: 'command-late', command: 'FEEDBACK_ERROR', sentAt: 120, status: 'sent' },
      ],
      rawEventLog: [acknowledgement, { ...acknowledgement }],
    })} />)

    expect(screen.getByText('command-early · FEEDBACK_ERROR · sent 100 ms · execution unconfirmed')).toBeInTheDocument()
    expect(screen.getByText('command-late · FEEDBACK_ERROR · sent 120 ms · execution acknowledged')).toBeInTheDocument()
  })

  it('maps the five connected controls to exact BLE commands in control order', () => {
    const hardware = controller({ state: 'connected', deviceName: 'DAAANCE_LW', imuHz: 0 })
    render(<HardwareTestPanel controller={hardware} />)

    for (const name of ['Short vibration', 'Long vibration', 'Error feedback', 'Start countdown', 'Stop']) {
      const control = screen.getByRole('button', { name })
      expect(control).toBeEnabled()
      fireEvent.click(control)
    }

    expect(vi.mocked(hardware.sendCommand).mock.calls.map(([command]) => command)).toEqual([
      'VIBRATE_SHORT',
      'VIBRATE_LONG',
      'FEEDBACK_ERROR',
      'START_COUNTDOWN',
      'STOP_ALL',
    ])
  })

  it.each<LeftWristHardwareSnapshot>([
    { state: 'disconnected', imuHz: 0 },
    { state: 'connecting', imuHz: 0 },
    { state: 'error', error: { code: 'connection-failed', message: 'Connection failed' }, imuHz: 0 },
    { state: 'unsupported', error: { code: 'unsupported', message: 'Unsupported' }, imuHz: 0 },
  ])('disables every hardware control while state is $state', snapshot => {
    render(<HardwareTestPanel controller={controller(snapshot)} />)

    const controls = screen.getByRole('region', { name: 'Hardware controls' }).querySelectorAll('button')
    expect(controls).toHaveLength(5)
    for (const control of controls) {
      expect(control).toBeDisabled()
    }
  })

  it('mounts on Setup after the setup note and before Start', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Continue in Demo' }))
    await screen.findByText('Demo 已就绪')
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))

    const note = screen.getByText('Mock IMU 已开启').closest('.setup-note')!
    const panel = screen.getByRole('region', { name: 'Hardware Test' })
    const start = screen.getByRole('button', { name: '开始舞蹈' })

    expect(note.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(panel.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
