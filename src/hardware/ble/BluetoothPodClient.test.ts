import { describe, expect, it, vi } from 'vitest'
import {
  DAAANCE_BLE_CONFIG,
  DAAANCE_POD_NAMES,
  POD_RX_UUID,
  POD_TX_UUID,
  SERVICE_UUID,
} from './bleConfig'
import {
  BluetoothPodClient,
  BluetoothPodClientError,
  type BluetoothLike,
  type BluetoothRemoteGATTLike,
  type DaaanceBleConfig,
} from './BluetoothPodClient'

const configuredBle: DaaanceBleConfig = {
  deviceName: DAAANCE_POD_NAMES.left_wrist,
  serviceUuid: SERVICE_UUID,
  podRxUuid: POD_RX_UUID,
  podTxUuid: POD_TX_UUID,
}

class FakeCharacteristic extends EventTarget {
  value?: DataView
  readonly startNotifications = vi.fn(async () => this)
  readonly writeValueWithoutResponse = vi.fn(async (_value: BufferSource) => undefined)
  readonly writeValue = vi.fn(async (_value: BufferSource) => undefined)
}

class FakeDevice extends EventTarget {
  readonly name = 'DAAANCE_LW'

  constructor(readonly gatt: BluetoothRemoteGATTLike) {
    super()
  }
}

function makeBluetoothHarness() {
  const podTx = new FakeCharacteristic()
  const podRx = new FakeCharacteristic()
  const getCharacteristic = vi.fn(async (uuid: string) => {
    if (uuid === configuredBle.podTxUuid) return podTx
    if (uuid === configuredBle.podRxUuid) return podRx
    throw new Error(`Unexpected characteristic ${uuid}`)
  })
  const service = { getCharacteristic }
  const getPrimaryService = vi.fn(async () => service)
  const server = { getPrimaryService }
  const connect = vi.fn(async () => server)
  const disconnect = vi.fn()
  const device = new FakeDevice({ connect, disconnect })
  const requestDevice = vi.fn(async () => device)
  const bluetooth: BluetoothLike = { requestDevice }

  return {
    bluetooth,
    requestDevice,
    device,
    server,
    service,
    podTx,
    podRx,
    connect,
    disconnect,
    getPrimaryService,
    getCharacteristic,
  }
}

function notify(characteristic: FakeCharacteristic, text: string): void {
  const bytes = new TextEncoder().encode(text)
  characteristic.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  characteristic.dispatchEvent(new Event('characteristicvaluechanged'))
}

function notifyLine(characteristic: FakeCharacteristic, text: string): void {
  notify(characteristic, `${text}\n`)
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('BluetoothPodClient configuration and support', () => {
  it('defines the canonical Pod names and Pod-perspective UART UUIDs', () => {
    expect(DAAANCE_POD_NAMES).toEqual({
      left_wrist: 'DAAANCE_LW',
      right_wrist: 'DAAANCE_RW',
      left_ankle: 'DAAANCE_LA',
      right_ankle: 'DAAANCE_RA',
    })
    expect(SERVICE_UUID).toBe('6e400001-b5a3-f393-e0a9-e50e24dcca9e')
    expect(POD_RX_UUID).toBe('6e400002-b5a3-f393-e0a9-e50e24dcca9e')
    expect(POD_TX_UUID).toBe('6e400003-b5a3-f393-e0a9-e50e24dcca9e')
    expect(DAAANCE_BLE_CONFIG).toEqual({
      deviceName: 'DAAANCE_LW',
      serviceUuid: SERVICE_UUID,
      podRxUuid: POD_RX_UUID,
      podTxUuid: POD_TX_UUID,
    })
  })

  it('reports unsupported Web Bluetooth with Chrome or Edge guidance', async () => {
    const client = new BluetoothPodClient()

    await expect(client.connect()).rejects.toEqual(expect.objectContaining({
      code: 'unsupported',
      message: 'Web Bluetooth is not supported in this browser. Please use Chrome or Edge.',
    }))
    expect(client.getSnapshot()).toEqual({
      state: 'unsupported',
      error: {
        code: 'unsupported',
        message: 'Web Bluetooth is not supported in this browser. Please use Chrome or Edge.',
      },
    })
  })

  it('returns immutable snapshot values rather than its internal object', async () => {
    const client = new BluetoothPodClient({ config: configuredBle })

    const snapshot = client.getSnapshot()
    ;(snapshot as { state: string }).state = 'connected'

    expect(client.getSnapshot()).toEqual({ state: 'disconnected' })
  })

  it('uses a typed error that preserves its stable failure code', () => {
    const error = new BluetoothPodClientError('not-connected', 'Bluetooth Pod is not connected')

    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('not-connected')
  })
})

describe('BluetoothPodClient discovery and notifications', () => {
  it('publishes connecting while the device chooser is pending', async () => {
    let resolveDevice!: (device: FakeDevice) => void
    const chooser = new Promise<FakeDevice>((resolve) => {
      resolveDevice = resolve
    })
    const requestDevice = vi.fn(() => chooser)
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({
      bluetooth: { requestDevice },
      config: configuredBle,
    })

    const connection = client.connect()

    expect(client.getSnapshot()).toEqual({ state: 'connecting' })
    resolveDevice(harness.device)
    await connection
  })

  it('selects DAAANCE_LW and discovers its configured service and characteristics', async () => {
    const harness = makeBluetoothHarness()
    const startNotifications = vi.spyOn(harness.podTx, 'startNotifications')
    const addPodTxListener = vi.spyOn(harness.podTx, 'addEventListener')
    const addDeviceListener = vi.spyOn(harness.device, 'addEventListener')
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })

    await client.connect()

    expect(harness.requestDevice).toHaveBeenCalledWith({
      filters: [{ name: 'DAAANCE_LW' }],
      optionalServices: [SERVICE_UUID],
    })
    expect(harness.connect).toHaveBeenCalledOnce()
    expect(harness.getPrimaryService).toHaveBeenCalledWith(SERVICE_UUID)
    expect(harness.getCharacteristic).toHaveBeenNthCalledWith(1, POD_TX_UUID)
    expect(harness.getCharacteristic).toHaveBeenNthCalledWith(2, POD_RX_UUID)
    expect(startNotifications).toHaveBeenCalledOnce()
    expect(addPodTxListener).toHaveBeenCalledOnce()
    expect(addPodTxListener).toHaveBeenCalledWith('characteristicvaluechanged', expect.any(Function))
    expect(addDeviceListener).toHaveBeenCalledWith('gattserverdisconnected', expect.any(Function))
    expect(client.getSnapshot()).toEqual({ state: 'connected', deviceName: 'DAAANCE_LW' })
  })

  it('buffers fragmented firmware JSON until the newline and emits exactly one normalized IMU event', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle, now: () => 987.5 })
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()
    const line = JSON.stringify({
      event: 'IMU_DATA', pod: 'LW', t: 63461,
      ax: -2.617, ay: -9.659, az: -3.309, gx: 28.07, gy: 4.5, gz: 8.1, button: 0,
    })
    const chunks = [line.slice(0, 11), line.slice(11, 29), line.slice(29, 47), line.slice(47, 65), line.slice(65, 83), line.slice(83, 101), line.slice(101)]

    for (const chunk of chunks) {
      notify(harness.podTx, chunk)
      expect(listener).not.toHaveBeenCalled()
    }
    notify(harness.podTx, '\n')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      type: 'imu', pod: 'left_wrist', hardwareTimestamp: 63461, receivedAt: 987.5,
      ax: -2.617, ay: -9.659, az: -3.309, gx: 28.07,
    }))
  })

  it('emits every complete line from one notification and retains only the trailing fragment', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()

    notify(harness.podTx, '{"event":"BUTTON_SINGLE_CLICK","pod":"LW","t":1}\n{"event":"COUNTDOWN_DONE","pod":"LW","t":2}\n{"event":"BUTTON')
    expect(listener).toHaveBeenCalledTimes(2)
    notify(harness.podTx, '_SINGLE_CLICK","pod":"LW","t":3}\n')

    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener.mock.calls.map(([event]) => event.type)).toEqual(['button-single-click', 'countdown-done', 'button-single-click'])
  })

  it('clears an incomplete receive buffer across disconnect and reconnect', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()

    notify(harness.podTx, '{"event":"IMU_DATA","pod":"LW"')
    await client.disconnect()
    await client.connect()
    notify(harness.podTx, ',"t":1,"ax":0,"ay":0,"az":9.8,"gx":0,"gy":0,"gz":0}\n')
    expect(listener).not.toHaveBeenCalled()

    notifyLine(harness.podTx, '{"event":"BUTTON_SINGLE_CLICK","pod":"LW","t":2}')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('continues delivering valid events after a malformed notification', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({
      bluetooth: harness.bluetooth,
      config: configuredBle,
      now: () => 987.5,
    })
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()

    notifyLine(harness.podTx, '{bad')
    notifyLine(harness.podTx, JSON.stringify({
      event: 'IMU_DATA', pod: 'left_wrist', t: 123456,
      ax: 0.12, ay: 0.35, az: 9.72, gx: 12.4, gy: 4.5, gz: 8.1,
    }))

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      type: 'imu',
      pod: 'left_wrist',
      hardwareTimestamp: 123456,
      receivedAt: 987.5,
      ax: 0.12,
      ay: 0.35,
      az: 9.72,
      gx: 12.4,
      gy: 4.5,
      gz: 8.1,
    })
  })

  it('logs an invalid feedback acknowledgement and delivers the following valid acknowledgement', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({
      bluetooth: harness.bluetooth,
      config: configuredBle,
      now: () => 987.5,
    })
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()

    notifyLine(harness.podTx, JSON.stringify({
      event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123456, feedback: 'ERROR', outputs: [],
    }))
    notifyLine(harness.podTx, JSON.stringify({
      event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123457,
      feedback: 'ERROR', outputs: ['LED', 'VIBRATION'],
    }))

    expect(debug).toHaveBeenCalledOnce()
    expect(debug).toHaveBeenCalledWith('[Daaance BLE] Invalid event', 'FEEDBACK_EXECUTED')
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      type: 'feedback-executed',
      pod: 'left_wrist',
      hardwareTimestamp: 123457,
      receivedAt: 987.5,
      feedback: 'ERROR',
      outputs: ['LED', 'VIBRATION'],
    })

    debug.mockRestore()
  })

  it('delivers the exact canonical HELLO notification without a hardware timestamp', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({
      bluetooth: harness.bluetooth,
      config: configuredBle,
      now: () => 101.5,
    })
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()

    notifyLine(harness.podTx, '{"event":"HELLO","pod":"left_wrist","firmware":"0.1.0"}')

    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith({
      type: 'hello',
      pod: 'left_wrist',
      firmware: '0.1.0',
      receivedAt: 101.5,
    })
  })

  it('removes live listeners on unexpected disconnect and can reconnect', async () => {
    const harness = makeBluetoothHarness()
    const removePodTxListener = vi.spyOn(harness.podTx, 'removeEventListener')
    const removeDeviceListener = vi.spyOn(harness.device, 'removeEventListener')
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()

    harness.device.dispatchEvent(new Event('gattserverdisconnected'))
    notifyLine(harness.podTx, JSON.stringify({ event: 'BUTTON_SINGLE_CLICK', pod: 'left_wrist', t: 10 }))

    expect(client.getSnapshot()).toEqual({ state: 'disconnected' })
    expect(removePodTxListener).toHaveBeenCalledWith('characteristicvaluechanged', expect.any(Function))
    expect(removeDeviceListener).toHaveBeenCalledWith('gattserverdisconnected', expect.any(Function))
    expect(listener).not.toHaveBeenCalled()

    await client.connect()
    expect(client.getSnapshot()).toEqual({ state: 'connected', deviceName: 'DAAANCE_LW' })
  })

  it('publishes spontaneous disconnects to snapshot subscribers and stops after unsubscribe', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    const listener = vi.fn()
    const unsubscribe = client.subscribeSnapshot(listener)

    await client.connect()
    harness.device.dispatchEvent(new Event('gattserverdisconnected'))

    expect(listener.mock.calls.map(([snapshot]) => snapshot)).toEqual([
      { state: 'connecting' },
      { state: 'connected', deviceName: 'DAAANCE_LW' },
      { state: 'disconnected' },
    ])

    unsubscribe()
    await client.connect()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('cleans the selected device listener when discovery fails', async () => {
    const harness = makeBluetoothHarness()
    harness.getPrimaryService.mockRejectedValueOnce(new Error('service missing'))
    const removeDeviceListener = vi.spyOn(harness.device, 'removeEventListener')
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })

    await expect(client.connect()).rejects.toMatchObject({
      code: 'connection-failed',
      message: 'service missing',
    })

    expect(removeDeviceListener).toHaveBeenCalledWith('gattserverdisconnected', expect.any(Function))
    expect(client.getSnapshot()).toEqual({
      state: 'error',
      error: { code: 'connection-failed', message: 'service missing' },
    })
  })

  it('does not resume pending discovery after an explicit disconnect', async () => {
    const harness = makeBluetoothHarness()
    const service = deferred<typeof harness.service>()
    harness.getPrimaryService.mockImplementationOnce(() => service.promise)
    const removeDeviceListener = vi.spyOn(harness.device, 'removeEventListener')
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })

    const connection = client.connect()
    await vi.waitFor(() => expect(harness.getPrimaryService).toHaveBeenCalledOnce())

    await client.disconnect()
    service.resolve(harness.service)
    await connection

    expect(harness.getCharacteristic).not.toHaveBeenCalled()
    expect(harness.disconnect).toHaveBeenCalledOnce()
    expect(removeDeviceListener).toHaveBeenCalledOnce()
    expect(client.getSnapshot()).toEqual({ state: 'disconnected' })
  })

  it('does not resume pending discovery after an unexpected disconnect', async () => {
    const harness = makeBluetoothHarness()
    const service = deferred<typeof harness.service>()
    harness.getPrimaryService.mockImplementationOnce(() => service.promise)
    const removeDeviceListener = vi.spyOn(harness.device, 'removeEventListener')
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })

    const connection = client.connect()
    await vi.waitFor(() => expect(harness.getPrimaryService).toHaveBeenCalledOnce())

    harness.device.dispatchEvent(new Event('gattserverdisconnected'))
    service.resolve(harness.service)
    await connection

    expect(harness.getCharacteristic).not.toHaveBeenCalled()
    expect(harness.disconnect).not.toHaveBeenCalled()
    expect(removeDeviceListener).toHaveBeenCalledOnce()
    expect(client.getSnapshot()).toEqual({ state: 'disconnected' })
  })

  it('shares one chooser and discovery attempt across duplicate connect calls', async () => {
    const harness = makeBluetoothHarness()
    const chosenDevice = deferred<FakeDevice>()
    harness.requestDevice.mockImplementation(() => chosenDevice.promise)
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })

    const firstConnection = client.connect()
    const secondConnection = client.connect()

    expect(harness.requestDevice).toHaveBeenCalledOnce()
    chosenDevice.resolve(harness.device)
    await Promise.all([firstConnection, secondConnection])

    expect(harness.connect).toHaveBeenCalledOnce()
    expect(harness.podTx.startNotifications).toHaveBeenCalledOnce()
    expect(client.getSnapshot()).toEqual({ state: 'connected', deviceName: 'DAAANCE_LW' })
  })
})

describe('BluetoothPodClient commands and explicit cleanup', () => {
  it('writes command text as UTF-8 without response when supported', async () => {
    const harness = makeBluetoothHarness()
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    await client.connect()

    await client.sendCommand('VIBRATE_SHORT')

    expect(harness.podRx.writeValueWithoutResponse).toHaveBeenCalledOnce()
    expect(harness.podRx.writeValueWithoutResponse).toHaveBeenCalledWith(
      new TextEncoder().encode('VIBRATE_SHORT'),
    )
    expect(harness.podRx.writeValue).not.toHaveBeenCalled()
  })

  it('falls back to writeValue when writeValueWithoutResponse is unavailable', async () => {
    const harness = makeBluetoothHarness()
    const podRx = harness.podRx as unknown as {
      writeValueWithoutResponse?: FakeCharacteristic['writeValueWithoutResponse']
      writeValue: FakeCharacteristic['writeValue']
    }
    podRx.writeValueWithoutResponse = undefined
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    await client.connect()

    await client.sendCommand('STOP_ALL')

    expect(podRx.writeValue).toHaveBeenCalledOnce()
    expect(podRx.writeValue).toHaveBeenCalledWith(new TextEncoder().encode('STOP_ALL'))
  })

  it('publishes an RX write failure and releases the failed connection before reconnecting', async () => {
    const harness = makeBluetoothHarness()
    const removePodTxListener = vi.spyOn(harness.podTx, 'removeEventListener')
    const removeDeviceListener = vi.spyOn(harness.device, 'removeEventListener')
    harness.podRx.writeValueWithoutResponse.mockRejectedValueOnce(new Error('RX write failed'))
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    const snapshotListener = vi.fn()
    client.subscribeSnapshot(snapshotListener)
    await client.connect()
    snapshotListener.mockClear()

    await expect(client.sendCommand('FEEDBACK_ERROR')).rejects.toMatchObject({
      code: 'command-failed',
      message: 'RX write failed',
    })

    expect(client.getSnapshot()).toEqual({
      state: 'error',
      error: { code: 'command-failed', message: 'RX write failed' },
    })
    expect(snapshotListener).toHaveBeenCalledOnce()
    expect(snapshotListener).toHaveBeenCalledWith({
      state: 'error',
      error: { code: 'command-failed', message: 'RX write failed' },
    })
    expect(removePodTxListener).toHaveBeenCalledOnce()
    expect(removeDeviceListener).toHaveBeenCalledOnce()
    expect(harness.disconnect).toHaveBeenCalledOnce()

    harness.device.dispatchEvent(new Event('gattserverdisconnected'))
    expect(client.getSnapshot()).toEqual({
      state: 'error',
      error: { code: 'command-failed', message: 'RX write failed' },
    })

    await client.connect()
    expect(harness.podTx.startNotifications).toHaveBeenCalledTimes(2)
    expect(client.getSnapshot()).toEqual({ state: 'connected', deviceName: 'DAAANCE_LW' })
  })

  it('does not let a stale command rejection tear down a newer connection', async () => {
    const harness = makeBluetoothHarness()
    const write = deferred<undefined>()
    harness.podRx.writeValueWithoutResponse.mockImplementationOnce(() => write.promise)
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    await client.connect()

    const pendingCommand = client.sendCommand('VIBRATE_LONG')
    await client.disconnect()
    await client.connect()
    write.reject(new Error('stale RX failure'))

    await expect(pendingCommand).rejects.toMatchObject({
      code: 'command-failed',
      message: 'stale RX failure',
    })
    expect(harness.disconnect).toHaveBeenCalledOnce()
    expect(client.getSnapshot()).toEqual({ state: 'connected', deviceName: 'DAAANCE_LW' })
  })

  it('rejects commands while disconnected', async () => {
    const client = new BluetoothPodClient({
      bluetooth: makeBluetoothHarness().bluetooth,
      config: configuredBle,
    })

    await expect(client.sendCommand('FEEDBACK_ERROR')).rejects.toMatchObject({
      code: 'not-connected',
      message: 'Bluetooth Pod is not connected',
    })
  })

  it('disconnects idempotently and removes listeners exactly once', async () => {
    const harness = makeBluetoothHarness()
    const removePodTxListener = vi.spyOn(harness.podTx, 'removeEventListener')
    const removeDeviceListener = vi.spyOn(harness.device, 'removeEventListener')
    const client = new BluetoothPodClient({ bluetooth: harness.bluetooth, config: configuredBle })
    const listener = vi.fn()
    client.subscribe(listener)
    await client.connect()

    await client.disconnect()
    await client.disconnect()
    notifyLine(harness.podTx, JSON.stringify({ event: 'BUTTON_SINGLE_CLICK', pod: 'left_wrist', t: 10 }))

    expect(harness.disconnect).toHaveBeenCalledOnce()
    expect(removePodTxListener).toHaveBeenCalledOnce()
    expect(removeDeviceListener).toHaveBeenCalledOnce()
    expect(listener).not.toHaveBeenCalled()
    expect(client.getSnapshot()).toEqual({ state: 'disconnected' })
  })
})
