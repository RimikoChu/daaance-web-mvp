import { act, fireEvent, render, screen } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BluetoothPodEvent, DaaanceBleCommand } from '../hardware/ble/bleTypes'
import { CountdownGate } from './CountdownGate'

function hardwareGate() {
  const listeners = new Set<(event: BluetoothPodEvent) => void>()
  const unsubscribe = vi.fn()
  const subscribeEvents = vi.fn((listener: (event: BluetoothPodEvent) => void) => {
    listeners.add(listener)
    return () => {
      unsubscribe()
      listeners.delete(listener)
    }
  })
  return {
    sendCommand: vi.fn(async (_command: DaaanceBleCommand) => {}),
    subscribeEvents,
    unsubscribe,
    emit(event: BluetoothPodEvent) {
      for (const listener of listeners) listener(event)
    },
  }
}

describe('CountdownGate', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('times out at exactly 8000ms without starting and offers only explicit recovery choices', () => {
    const hardware = hardwareGate()
    const onHardwareReady = vi.fn()
    const onStartDemo = vi.fn()
    render(<CountdownGate
      connectionState="connected"
      connect={vi.fn(async () => {})}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={onHardwareReady}
      onStartDemo={onStartDemo}
    />)

    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(7_999))
    expect(screen.queryByRole('button', { name: 'Retry hardware' })).not.toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('button', { name: 'Retry hardware' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start in Demo' })).toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(2)
    expect(onHardwareReady).not.toHaveBeenCalled()
    expect(onStartDemo).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('retries with one new command and lets Demo start only after an explicit click', () => {
    const hardware = hardwareGate()
    const onHardwareReady = vi.fn()
    const onStartDemo = vi.fn()
    render(<CountdownGate
      connectionState="connected"
      connect={vi.fn(async () => {})}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={onHardwareReady}
      onStartDemo={onStartDemo}
    />)

    act(() => vi.advanceTimersByTime(8_000))
    fireEvent.click(screen.getByRole('button', { name: 'Retry hardware' }))
    expect(hardware.sendCommand).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Waiting for DAAANCE_LW…')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(1)

    act(() => vi.advanceTimersByTime(8_000))
    fireEvent.click(screen.getByRole('button', { name: 'Start in Demo' }))
    expect(onStartDemo).toHaveBeenCalledOnce()
    expect(onHardwareReady).not.toHaveBeenCalled()
  })

  it('subscribes before sending and cleans the attempt before reporting hardware ready', () => {
    const order: string[] = []
    let listener: ((event: BluetoothPodEvent) => void) | undefined
    const unsubscribe = vi.fn(() => order.push('unsubscribe'))
    const subscribeEvents = vi.fn((next: (event: BluetoothPodEvent) => void) => {
      order.push('subscribe')
      listener = next
      return unsubscribe
    })
    const sendCommand = vi.fn(async () => {
      order.push('send')
    })
    const onHardwareReady = vi.fn(() => order.push('ready'))
    render(<CountdownGate
      connectionState="connected"
      connect={vi.fn(async () => {})}
      sendCommand={sendCommand}
      subscribeEvents={subscribeEvents}
      onHardwareReady={onHardwareReady}
      onStartDemo={vi.fn()}
    />)

    expect(order).toEqual(['subscribe', 'send'])
    act(() => listener?.({
      type: 'countdown-done',
      pod: 'left_wrist',
      hardwareTimestamp: 3_000,
      receivedAt: 4_000,
    }))

    expect(order).toEqual(['subscribe', 'send', 'unsubscribe', 'ready'])
    expect(vi.getTimerCount()).toBe(0)
    act(() => vi.advanceTimersByTime(8_000))
    expect(onHardwareReady).toHaveBeenCalledOnce()
    expect(onHardwareReady).toHaveBeenCalledWith(4_000)
  })

  it('keeps one active attempt across parent re-renders', () => {
    const hardware = hardwareGate()
    const view = render(<CountdownGate
      connectionState="connected"
      connect={vi.fn(async () => {})}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={() => {}}
      onStartDemo={() => {}}
    />)

    view.rerender(<CountdownGate
      connectionState="connected"
      connect={vi.fn(async () => {})}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={() => {}}
      onStartDemo={() => {}}
    />)

    expect(hardware.sendCommand).toHaveBeenCalledOnce()
    expect(hardware.subscribeEvents).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('sends one countdown command when StrictMode replays the mount effect', () => {
    const hardware = hardwareGate()
    render(<StrictMode><CountdownGate
      connectionState="connected"
      connect={vi.fn(async () => {})}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={vi.fn()}
      onStartDemo={vi.fn()}
    /></StrictMode>)

    expect(hardware.sendCommand).toHaveBeenCalledOnce()
    expect(hardware.sendCommand).toHaveBeenCalledWith('START_COUNTDOWN')
    expect(vi.getTimerCount()).toBe(1)
  })

  it('does not send while disconnected and keeps Demo an explicit choice', () => {
    const hardware = hardwareGate()
    render(<CountdownGate
      connectionState="disconnected"
      connect={vi.fn(async () => {})}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={vi.fn()}
      onStartDemo={vi.fn()}
    />)

    expect(hardware.sendCommand).not.toHaveBeenCalled()
    expect(hardware.subscribeEvents).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.getByRole('button', { name: 'Retry hardware' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start in Demo' })).toBeInTheDocument()
  })

  it('reconnects before subscribing and sending a disconnected Retry attempt', async () => {
    const hardware = hardwareGate()
    const order: string[] = []
    const reconnect = vi.fn(async () => {
      order.push('connect')
    })

    function ReconnectHarness() {
      const [connectionState, setConnectionState] = useState<'disconnected' | 'connected'>('disconnected')
      return <CountdownGate
        connectionState={connectionState}
        connect={async () => {
          await reconnect()
          setConnectionState('connected')
        }}
        sendCommand={async command => {
          order.push('send')
          await hardware.sendCommand(command)
        }}
        subscribeEvents={listener => {
          order.push('subscribe')
          return hardware.subscribeEvents(listener)
        }}
        onHardwareReady={vi.fn()}
        onStartDemo={vi.fn()}
      />
    }

    render(<ReconnectHarness />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry hardware' }))
      await Promise.resolve()
    })

    expect(reconnect).toHaveBeenCalledOnce()
    expect(hardware.subscribeEvents).toHaveBeenCalledOnce()
    expect(hardware.sendCommand).toHaveBeenCalledOnce()
    expect(hardware.sendCommand).toHaveBeenCalledWith('START_COUNTDOWN')
    expect(order).toEqual(['connect', 'subscribe', 'send'])
    expect(screen.getByText('Waiting for DAAANCE_LW…')).toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(1)
  })

  it('keeps explicit recovery choices when disconnected Retry cannot reconnect', async () => {
    const hardware = hardwareGate()
    const connect = vi.fn(async () => {
      throw new Error('chooser cancelled')
    })
    const onHardwareReady = vi.fn()
    const onStartDemo = vi.fn()
    render(<CountdownGate
      connectionState="disconnected"
      connect={connect}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={onHardwareReady}
      onStartDemo={onStartDemo}
    />)

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Retry hardware' }))
      await Promise.resolve()
    })

    expect(connect).toHaveBeenCalledOnce()
    expect(hardware.subscribeEvents).not.toHaveBeenCalled()
    expect(hardware.sendCommand).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    expect(screen.getByRole('button', { name: 'Retry hardware' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start in Demo' })).toBeInTheDocument()
    expect(onHardwareReady).not.toHaveBeenCalled()
    expect(onStartDemo).not.toHaveBeenCalled()
  })

  it('cleans the timer and event subscription when unmounted while waiting', () => {
    const hardware = hardwareGate()
    const onHardwareReady = vi.fn()
    const onStartDemo = vi.fn()
    const view = render(<CountdownGate
      connectionState="connected"
      connect={vi.fn(async () => {})}
      sendCommand={hardware.sendCommand}
      subscribeEvents={hardware.subscribeEvents}
      onHardwareReady={onHardwareReady}
      onStartDemo={onStartDemo}
    />)

    view.unmount()
    act(() => {
      vi.advanceTimersByTime(8_000)
      hardware.emit({
        type: 'countdown-done',
        pod: 'left_wrist',
        hardwareTimestamp: 3_000,
        receivedAt: 4_000,
      })
    })

    expect(hardware.unsubscribe).toHaveBeenCalledOnce()
    expect(onHardwareReady).not.toHaveBeenCalled()
    expect(onStartDemo).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
})
