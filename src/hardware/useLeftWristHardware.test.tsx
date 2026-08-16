import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BLEMotionDataSource } from '../domain/bleMotionDataSource'
import type { BluetoothPodEvent } from './ble/bleTypes'
import type { BluetoothPodSnapshot } from './ble/BluetoothPodClient'
import { useLeftWristHardware } from './useLeftWristHardware'

class FakeClient {
  snapshot: BluetoothPodSnapshot = { state: 'disconnected' }
  listener: ((event: BluetoothPodEvent) => void) | undefined
  snapshotListener: ((snapshot: BluetoothPodSnapshot) => void) | undefined
  readonly unsubscribe = vi.fn(() => {
    this.listener = undefined
  })
  readonly subscribe = vi.fn((listener: (event: BluetoothPodEvent) => void) => {
    this.listener = listener
    return this.unsubscribe
  })
  readonly connect = vi.fn(async () => {})
  readonly disconnect = vi.fn(async () => {})
  readonly sendCommand = vi.fn(async () => {})
  readonly unsubscribeSnapshot = vi.fn(() => {
    this.snapshotListener = undefined
  })
  readonly subscribeSnapshot = vi.fn((listener: (snapshot: BluetoothPodSnapshot) => void) => {
    this.snapshotListener = listener
    return this.unsubscribeSnapshot
  })

  getWebTimestamp(): number {
    return globalThis.performance.now()
  }

  getSnapshot(): BluetoothPodSnapshot {
    return this.snapshot
  }

  emit(event: BluetoothPodEvent): void {
    this.listener?.(event)
  }

  publishSnapshot(snapshot: BluetoothPodSnapshot): void {
    this.snapshot = snapshot
    this.snapshotListener?.(snapshot)
  }
}

const imuEvent = (receivedAt: number): Extract<BluetoothPodEvent, { type: 'imu' }> => ({
  type: 'imu',
  pod: 'left_wrist',
  hardwareTimestamp: receivedAt - 10,
  receivedAt,
  ax: 1,
  ay: 2,
  az: 3,
  gx: 4,
  gy: 5,
  gz: 6,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useLeftWristHardware', () => {
  it('keeps one client subscription across child-screen changes and unsubscribes on owner unmount', () => {
    const client = new FakeClient()
    const addEvent = vi.fn()
    const bleSource = { addEvent } as unknown as BLEMotionDataSource

    function Harness() {
      const [screenName, setScreenName] = useState('home')
      useLeftWristHardware(client, bleSource)
      return <button onClick={() => setScreenName(current => current === 'home' ? 'setup' : 'home')}>{screenName}</button>
    }

    const view = render(<Harness />)
    expect(client.subscribe).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'home' }))
    expect(screen.getByRole('button', { name: 'setup' })).toBeInTheDocument()
    expect(client.subscribe).toHaveBeenCalledOnce()

    act(() => client.emit(imuEvent(1250)))
    expect(addEvent).toHaveBeenCalledWith(imuEvent(1250))

    view.unmount()
    expect(client.unsubscribe).toHaveBeenCalledOnce()
    expect(client.unsubscribeSnapshot).toHaveBeenCalledOnce()
  })

  it('projects firmware, latest IMU, last packet time, rolling one-second Hz, and recent discrete events', () => {
    const client = new FakeClient()
    const bleSource = { addEvent: vi.fn() } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return <output>{controller.snapshot.imuHz}</output>
    }

    render(<Harness />)
    act(() => {
      client.emit({ type: 'hello', pod: 'left_wrist', firmware: '0.1.7', receivedAt: 100 })
      client.emit(imuEvent(100))
      client.emit(imuEvent(1100))
      client.emit(imuEvent(1120))
      client.emit({ type: 'button-single-click', pod: 'left_wrist', hardwareTimestamp: 33, receivedAt: 1130 })
      client.emit({ type: 'countdown-done', pod: 'left_wrist', hardwareTimestamp: 44, receivedAt: 1140 })
    })

    expect(controller.snapshot.firmware).toBe('0.1.7')
    expect(controller.snapshot.lastPacketAt).toBe(1140)
    expect(controller.snapshot.imuHz).toBe(50)
    expect(controller.latestImu).toEqual(imuEvent(1120))
    expect(controller.recentEvents.map(event => event.type)).toEqual(['button-single-click', 'countdown-done'])
  })

  it('projects a spontaneous client disconnect into React state', () => {
    const client = new FakeClient()
    client.snapshot = { state: 'connected', deviceName: 'DAAANCE_LW' }
    const bleSource = { addEvent: vi.fn(), clear: vi.fn() } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return <output>{controller.snapshot.state}</output>
    }

    render(<Harness />)
    expect(screen.getByText('connected')).toBeInTheDocument()

    act(() => client.publishSnapshot({ state: 'disconnected' }))

    expect(screen.getByText('disconnected')).toBeInTheDocument()
  })

  it('expires a silent IMU rate after one second', () => {
    vi.useFakeTimers()
    const client = new FakeClient()
    client.snapshot = { state: 'connected', deviceName: 'DAAANCE_LW' }
    const bleSource = { addEvent: vi.fn(), clear: vi.fn() } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return <output>{controller.snapshot.imuHz}</output>
    }

    render(<Harness />)
    act(() => {
      client.emit(imuEvent(100))
      client.emit(imuEvent(120))
    })
    expect(controller.snapshot.imuHz).toBe(50)

    act(() => vi.advanceTimersByTime(999))
    expect(controller.snapshot.imuHz).toBe(50)
    act(() => vi.advanceTimersByTime(1))
    expect(controller.snapshot.imuHz).toBe(0)
  })

  it('clears telemetry and buffered BLE samples when the connection transitions', () => {
    const client = new FakeClient()
    client.snapshot = { state: 'connected', deviceName: 'DAAANCE_LW' }
    const clear = vi.fn()
    const bleSource = { addEvent: vi.fn(), clear } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return null
    }

    render(<Harness />)
    act(() => {
      client.emit({ type: 'hello', pod: 'left_wrist', firmware: '0.1.7', receivedAt: 100 })
      client.emit(imuEvent(100))
      client.emit(imuEvent(120))
      client.emit({ type: 'countdown-done', pod: 'left_wrist', hardwareTimestamp: 44, receivedAt: 130 })
    })

    act(() => client.publishSnapshot({ state: 'disconnected' }))

    expect(controller.snapshot).toEqual({ state: 'disconnected', imuHz: 0 })
    expect(controller.latestImu).toBeUndefined()
    expect(controller.recentEvents).toEqual([])
    expect(clear).toHaveBeenCalledOnce()
  })

  it('keeps internal telemetry projection alive when a public event subscriber throws', () => {
    const client = new FakeClient()
    const addEvent = vi.fn()
    const bleSource = { addEvent, clear: vi.fn() } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return <output>{controller.latestImu?.receivedAt ?? 'none'}</output>
    }

    render(<Harness />)
    controller.subscribeEvents(() => { throw new Error('consumer failed') })

    act(() => expect(() => client.emit(imuEvent(400))).not.toThrow())

    expect(addEvent).toHaveBeenCalledWith(imuEvent(400))
    expect(screen.getByText('400')).toBeInTheDocument()
  })

  it('delivers feedback acknowledgements to subscribers without projecting them as telemetry or discrete events', () => {
    const client = new FakeClient()
    const addEvent = vi.fn()
    const bleSource = { addEvent, clear: vi.fn() } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return null
    }

    render(<Harness />)
    act(() => {
      client.emit({ type: 'hello', pod: 'left_wrist', firmware: '0.1.7', receivedAt: 100 })
      client.emit(imuEvent(120))
      client.emit({ type: 'button-single-click', pod: 'left_wrist', hardwareTimestamp: 33, receivedAt: 130 })
      client.emit({ type: 'countdown-done', pod: 'left_wrist', hardwareTimestamp: 44, receivedAt: 140 })
    })
    const feedbackAcknowledgement: Extract<BluetoothPodEvent, { type: 'feedback-executed' }> = {
      type: 'feedback-executed',
      pod: 'left_wrist',
      hardwareTimestamp: 123456,
      receivedAt: 150,
      feedback: 'ERROR',
      outputs: ['LED', 'VIBRATION'],
    }
    const received: BluetoothPodEvent[] = []
    controller.subscribeEvents(event => received.push(event))

    act(() => client.emit(feedbackAcknowledgement))

    expect(received).toEqual([feedbackAcknowledgement])
    expect(addEvent).toHaveBeenCalledOnce()
    expect(controller.latestImu).toEqual(imuEvent(120))
    expect(controller.snapshot.firmware).toBe('0.1.7')
    expect(controller.recentEvents.map(event => event.type)).toEqual(['button-single-click', 'countdown-done'])
  })

  it('audits command attempts with unique web IDs and retains a bounded raw BLE event log', async () => {
    const client = new FakeClient()
    const bleSource = { addEvent: vi.fn(), clear: vi.fn() } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return null
    }

    render(<Harness />)
    await act(async () => {
      await controller.sendCommand('FEEDBACK_ERROR')
      await controller.sendCommand('STOP_ALL')
    })
    act(() => {
      for (let index = 0; index < 51; index += 1) {
        client.emit({ type: 'button-single-click', pod: 'left_wrist', hardwareTimestamp: index, receivedAt: index })
      }
    })

    expect(controller.commandAttempts).toEqual([
      expect.objectContaining({ command: 'FEEDBACK_ERROR', status: 'sent', sentAt: expect.any(Number), commandId: expect.any(String) }),
      expect.objectContaining({ command: 'STOP_ALL', status: 'sent', sentAt: expect.any(Number), commandId: expect.any(String) }),
    ])
    expect(controller.commandAttempts[0].commandId).not.toBe(controller.commandAttempts[1].commandId)
    expect(controller.rawEventLog).toHaveLength(50)
    expect(controller.rawEventLog[0]).toMatchObject({ type: 'button-single-click', receivedAt: 1 })
    expect(controller.rawEventLog.at(-1)).toMatchObject({ type: 'button-single-click', receivedAt: 50 })
  })

  it('records failed command attempts without converting them into sent success', async () => {
    const client = new FakeClient()
    client.sendCommand.mockRejectedValueOnce(new Error('not connected'))
    const bleSource = { addEvent: vi.fn(), clear: vi.fn() } as unknown as BLEMotionDataSource
    let controller!: ReturnType<typeof useLeftWristHardware>

    function Harness() {
      controller = useLeftWristHardware(client, bleSource)
      return null
    }

    render(<Harness />)
    await act(async () => {
      await expect(controller.sendCommand('FEEDBACK_ERROR')).rejects.toThrow('not connected')
    })

    expect(controller.commandAttempts).toEqual([
      expect.objectContaining({ command: 'FEEDBACK_ERROR', status: 'failed', failureReason: 'not connected' }),
    ])
  })
})
