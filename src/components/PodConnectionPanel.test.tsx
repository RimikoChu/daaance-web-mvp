import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LeftWristHardwareController, LeftWristHardwareSnapshot } from '../hardware/useLeftWristHardware'
import { PodConnectionPanel } from './PodConnectionPanel'

function controller(snapshot: LeftWristHardwareSnapshot): LeftWristHardwareController {
  return {
    snapshot,
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    sendCommand: vi.fn(async () => {}),
    subscribeEvents: vi.fn(() => vi.fn()),
    recentEvents: [],
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('PodConnectionPanel', () => {
  it('shows one disconnected real left wrist and three explicit Demo Pods', () => {
    render(<PodConnectionPanel controller={controller({ state: 'disconnected', imuHz: 0 })} onReady={vi.fn()} />)

    expect(screen.getByText('Real hardware')).toBeInTheDocument()
    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.getAllByText('Demo')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Connect DAAANCE_LW' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue in Demo' })).toBeInTheDocument()
  })

  it.each([
    { state: 'unsupported', error: { code: 'unsupported', message: 'Web Bluetooth is not supported in this browser. Please use Chrome or Edge.' } } as const,
    { state: 'error', error: { code: 'connection-failed', message: 'Bluetooth chooser was cancelled' } } as const,
    { state: 'error', error: { code: 'connection-failed', message: 'Service discovery failed' } } as const,
  ])('never labels $state real BLE failures as Connected', snapshot => {
    render(<PodConnectionPanel controller={controller({ ...snapshot, imuHz: 0 })} onReady={vi.fn()} />)

    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(screen.getByText(snapshot.error.message)).toBeInTheDocument()
  })

  it('shows the connected device name and measured IMU rate only after real success', () => {
    render(<PodConnectionPanel controller={controller({
      state: 'connected',
      deviceName: 'DAAANCE_LW',
      imuHz: 49.8,
    })} onReady={vi.fn()} />)

    expect(screen.getByText('Real hardware')).toBeInTheDocument()
    expect(screen.getByText('DAAANCE_LW')).toBeInTheDocument()
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByText('49.8 Hz')).toBeInTheDocument()
    expect(screen.getAllByText('Demo')).toHaveLength(3)
  })

  it('uses controller connect and makes Demo continuation an explicit separate action', async () => {
    const hardware = controller({ state: 'disconnected', imuHz: 0 })
    const onReady = vi.fn()
    render(<PodConnectionPanel controller={hardware} onReady={onReady} />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect DAAANCE_LW' }))
    expect(hardware.connect).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Continue in Demo' }))
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
  })

  it('shows the intentional Demo selection in the compact status card', async () => {
    render(<PodConnectionPanel
      controller={controller({ state: 'error', error: { code: 'connection-failed', message: 'Cancelled' }, imuHz: 0 })}
      onReady={vi.fn()}
      variant="compact"
    />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue in Demo' }))

    expect(await screen.findByText('Demo mode')).toBeInTheDocument()
    expect(screen.queryByText('Cancelled')).not.toBeInTheDocument()
  })

  it('terminates an active connection attempt before continuing in Demo', async () => {
    const termination = deferred()
    const hardware = controller({ state: 'connecting', imuHz: 0 })
    hardware.disconnect = vi.fn(() => termination.promise)
    const onReady = vi.fn()
    render(<PodConnectionPanel controller={hardware} onReady={onReady} variant="compact" />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue in Demo' }))

    expect(hardware.disconnect).toHaveBeenCalledOnce()
    expect(onReady).not.toHaveBeenCalled()
    expect(screen.queryByText('Demo mode')).not.toBeInTheDocument()

    termination.resolve()
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce())
    expect(screen.getByText('Demo mode')).toBeInTheDocument()
  })

  it('reports readiness again after a disconnect and successful reconnect', async () => {
    const onReady = vi.fn()
    const connected = controller({ state: 'connected', deviceName: 'DAAANCE_LW', imuHz: 0 })
    const view = render(<PodConnectionPanel controller={connected} onReady={onReady} />)
    await waitFor(() => expect(onReady).toHaveBeenCalledOnce())

    view.rerender(<PodConnectionPanel controller={controller({ state: 'disconnected', imuHz: 0 })} onReady={onReady} />)
    view.rerender(<PodConnectionPanel controller={connected} onReady={onReady} />)

    await waitFor(() => expect(onReady).toHaveBeenCalledTimes(2))
  })

  it('ignores Demo termination that completes after unmount', async () => {
    const termination = deferred()
    const hardware = controller({ state: 'connecting', imuHz: 0 })
    hardware.disconnect = vi.fn(() => termination.promise)
    const onReady = vi.fn()
    const view = render(<PodConnectionPanel controller={hardware} onReady={onReady} />)

    fireEvent.click(screen.getByRole('button', { name: 'Continue in Demo' }))
    view.unmount()
    termination.resolve()
    await termination.promise
    await Promise.resolve()

    expect(onReady).not.toHaveBeenCalled()
  })
})
