import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PodConnectionPanel } from './PodConnectionPanel'

type PodDevice = {
  id: string
  gatt?: { connect: () => Promise<unknown> }
}

function installBluetooth(requestDevice: () => Promise<PodDevice>) {
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: { requestDevice } })
}

function device(id: string, connect: () => Promise<unknown> = () => Promise.resolve({})) {
  return { id, gatt: { connect } }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(value => { resolve = value })
  return { promise, resolve }
}

function terminalCount() {
  return screen.queryAllByText('硬件 · 已连接').length + screen.queryAllByText('Demo · 50Hz').length
}

afterEach(() => {
  Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined })
  vi.restoreAllMocks()
})

describe('PodConnectionPanel', () => {
  it('renders a compact status action and reports every state transition', async () => {
    const onStatesChange = vi.fn()
    render(<PodConnectionPanel variant="compact" onReady={vi.fn()} onStatesChange={onStatesChange} />)

    expect(document.querySelector('.pod-connection-panel')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))

    await waitFor(() => expect(screen.getByText('4 / 4')).toBeInTheDocument())
    expect(onStatesChange).toHaveBeenCalledWith(expect.objectContaining({
      LEFT_WRIST: 'demo',
      RIGHT_WRIST: 'demo',
      LEFT_ANKLE: 'demo',
      RIGHT_ANKLE: 'demo',
    }))
  })

  it('connects all four Pods together and falls back to Demo 50Hz', async () => {
    render(<PodConnectionPanel onReady={vi.fn()} />)

    expect(screen.getAllByText('未连接')).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))

    expect(screen.getAllByText('连接中…')).toHaveLength(4)
    expect(await screen.findAllByText('Demo · 50Hz')).toHaveLength(4)
  })

  it('updates each Pod as its sequential chooser and GATT connection settle', async () => {
    const firstGatt = deferred<unknown>()
    const secondChooser = deferred<PodDevice>()
    const requestDevice = vi.fn()
      .mockResolvedValueOnce(device('left-wrist', () => firstGatt.promise))
      .mockImplementationOnce(() => secondChooser.promise)
    installBluetooth(requestDevice)

    render(<PodConnectionPanel onReady={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))

    expect(screen.getAllByText('连接中…')).toHaveLength(4)
    expect(requestDevice).toHaveBeenCalledOnce()

    firstGatt.resolve({})
    await waitFor(() => expect(screen.getAllByText('硬件 · 已连接')).toHaveLength(1))
    expect(screen.getAllByText('连接中…')).toHaveLength(3)
    expect(requestDevice).toHaveBeenCalledTimes(2)
    expect(requestDevice).toHaveBeenNthCalledWith(1, { filters: [{ namePrefix: 'Daaance Pod' }] })
  })

  it('uses hardware only after GATT succeeds and settles failures to demo independently', async () => {
    const requestDevice = vi.fn()
      .mockResolvedValueOnce(device('left-wrist'))
      .mockResolvedValueOnce({ id: 'right-wrist' })
      .mockResolvedValueOnce(device('left-ankle', () => Promise.reject(new Error('GATT failed'))))
      .mockResolvedValueOnce(device('right-ankle'))
    installBluetooth(requestDevice)

    render(<PodConnectionPanel onReady={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))

    await waitFor(() => expect(terminalCount()).toBe(4))
    expect(screen.getAllByText('硬件 · 已连接')).toHaveLength(2)
    expect(screen.getAllByText('Demo · 50Hz')).toHaveLength(2)
  })

  it('does not allow a selected device ID to satisfy more than one Pod', async () => {
    const requestDevice = vi.fn(() => Promise.resolve(device('same-pod')))
    installBluetooth(requestDevice)

    render(<PodConnectionPanel onReady={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))

    await waitFor(() => expect(terminalCount()).toBe(4))
    expect(screen.getAllByText('硬件 · 已连接')).toHaveLength(1)
    expect(screen.getAllByText('Demo · 50Hz')).toHaveLength(3)
  })

  it('notifies the home flow only after every Pod reaches a terminal state', async () => {
    const onReady = vi.fn()
    const gattConnections = [deferred<unknown>(), deferred<unknown>(), deferred<unknown>(), deferred<unknown>()]
    let requestIndex = 0
    const requestDevice = vi.fn(() => {
      const index = requestIndex++
      return Promise.resolve(device(`pod-${index}`, () => gattConnections[index].promise))
    })
    installBluetooth(requestDevice)

    render(<PodConnectionPanel onReady={onReady} />)
    fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))

    for (let index = 0; index < 3; index += 1) {
      await waitFor(() => expect(requestDevice).toHaveBeenCalledTimes(index + 1))
      gattConnections[index].resolve({})
      await waitFor(() => expect(terminalCount()).toBe(index + 1))
      expect(onReady).not.toHaveBeenCalled()
    }

    await waitFor(() => expect(requestDevice).toHaveBeenCalledTimes(4))
    gattConnections[3].resolve({})
    await waitFor(() => expect(terminalCount()).toBe(4))
    expect(onReady).toHaveBeenCalledOnce()
  })
})
