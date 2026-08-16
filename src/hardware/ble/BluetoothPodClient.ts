import { DAAANCE_BLE_CONFIG } from './bleConfig'
import type { BluetoothPodEvent, DaaanceBleCommand } from './bleTypes'
import { parseBlePacket } from './parseBlePacket'

export interface DaaanceBleConfig {
  deviceName: string
  serviceUuid: string
  podRxUuid: string
  podTxUuid: string
}

export interface BluetoothLike {
  requestDevice(options: {
    filters: Array<{ name: string }>
    optionalServices: string[]
  }): Promise<BluetoothDeviceLike>
}

export interface BluetoothRemoteGATTCharacteristicLike {
  readonly value?: DataView
  startNotifications(): Promise<unknown>
  writeValueWithoutResponse?(value: BufferSource): Promise<void>
  writeValue?(value: BufferSource): Promise<void>
  addEventListener(type: 'characteristicvaluechanged', listener: EventListener): void
  removeEventListener(type: 'characteristicvaluechanged', listener: EventListener): void
}

export interface BluetoothRemoteGATTServiceLike {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristicLike>
}

export interface BluetoothRemoteGATTServerLike {
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTServiceLike>
}

export interface BluetoothRemoteGATTLike {
  connect(): Promise<BluetoothRemoteGATTServerLike>
  disconnect(): void
}

export interface BluetoothDeviceLike {
  readonly name?: string
  readonly gatt?: BluetoothRemoteGATTLike
  addEventListener(type: 'gattserverdisconnected', listener: EventListener): void
  removeEventListener(type: 'gattserverdisconnected', listener: EventListener): void
}

export type BluetoothPodErrorCode =
  | 'unsupported'
  | 'connection-failed'
  | 'not-connected'
  | 'command-failed'

export interface BluetoothPodFailure {
  code: BluetoothPodErrorCode
  message: string
}

export type BluetoothPodSnapshot =
  | { state: 'disconnected' }
  | { state: 'connecting' }
  | { state: 'connected'; deviceName: string }
  | { state: 'error'; error: BluetoothPodFailure }
  | { state: 'unsupported'; error: BluetoothPodFailure }

export interface BluetoothPodClientOptions {
  bluetooth?: BluetoothLike
  config?: DaaanceBleConfig
  now?: () => number
}

export class BluetoothPodClientError extends Error {
  constructor(
    readonly code: BluetoothPodErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options)
    this.name = 'BluetoothPodClientError'
  }
}

const UNSUPPORTED_MESSAGE = 'Web Bluetooth is not supported in this browser. Please use Chrome or Edge.'

interface ConnectionAttempt {
  device?: BluetoothDeviceLike
  podTx?: BluetoothRemoteGATTCharacteristicLike
  podRx?: BluetoothRemoteGATTCharacteristicLike
  deviceDisconnectListener?: EventListener
  notificationListenerAttached: boolean
}

export class BluetoothPodClient {
  private readonly bluetooth: BluetoothLike | undefined
  private readonly config: DaaanceBleConfig
  private readonly now: () => number
  private readonly listeners = new Set<(event: BluetoothPodEvent) => void>()
  private readonly snapshotListeners = new Set<(snapshot: BluetoothPodSnapshot) => void>()
  private snapshot: BluetoothPodSnapshot = { state: 'disconnected' }
  private device: BluetoothDeviceLike | undefined
  private podTxCharacteristic: BluetoothRemoteGATTCharacteristicLike | undefined
  private podRxCharacteristic: BluetoothRemoteGATTCharacteristicLike | undefined
  private activeAttempt: ConnectionAttempt | undefined
  private pendingConnection: Promise<void> | undefined

  private readonly handleNotification: EventListener = () => {
    const value = this.podTxCharacteristic?.value
    if (!value) return

    const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    const result = parseBlePacket(new TextDecoder().decode(bytes), this.now())
    if (result.kind === 'event') {
      for (const listener of this.listeners) listener(result.event)
    }
  }

  constructor(options: BluetoothPodClientOptions = {}) {
    const navigatorWithBluetooth = globalThis.navigator as Navigator & { bluetooth?: BluetoothLike }
    this.bluetooth = options.bluetooth ?? navigatorWithBluetooth?.bluetooth
    this.config = options.config ?? DAAANCE_BLE_CONFIG
    this.now = options.now ?? (() => globalThis.performance?.now() ?? Date.now())
  }

  async connect(): Promise<void> {
    const bluetooth = this.bluetooth
    if (!bluetooth) {
      const error = new BluetoothPodClientError('unsupported', UNSUPPORTED_MESSAGE)
      this.publishSnapshot({ state: 'unsupported', error: this.failureFrom(error) })
      throw error
    }

    if (this.snapshot.state === 'connected') return
    if (this.pendingConnection) {
      await this.pendingConnection
      return
    }

    this.publishSnapshot({ state: 'connecting' })
    const attempt: ConnectionAttempt = { notificationListenerAttached: false }
    this.activeAttempt = attempt
    const connection = this.runConnectionAttempt(attempt, bluetooth)
    this.pendingConnection = connection

    try {
      await connection
    } finally {
      if (this.pendingConnection === connection) this.pendingConnection = undefined
    }
  }

  private async runConnectionAttempt(attempt: ConnectionAttempt, bluetooth: BluetoothLike): Promise<void> {
    try {
      const device = await bluetooth.requestDevice({
        filters: [{ name: this.config.deviceName }],
        optionalServices: [this.config.serviceUuid],
      })
      if (!this.isActive(attempt)) return

      attempt.device = device
      attempt.deviceDisconnectListener = () => this.handleUnexpectedDisconnect(attempt)
      device.addEventListener('gattserverdisconnected', attempt.deviceDisconnectListener)

      if (!device.gatt) throw new Error('Selected Bluetooth device does not expose GATT')

      const server = await device.gatt.connect()
      if (!this.isActive(attempt)) return
      const service = await server.getPrimaryService(this.config.serviceUuid)
      if (!this.isActive(attempt)) return
      const podTx = await service.getCharacteristic(this.config.podTxUuid)
      if (!this.isActive(attempt)) return
      attempt.podTx = podTx
      const podRx = await service.getCharacteristic(this.config.podRxUuid)
      if (!this.isActive(attempt)) return
      attempt.podRx = podRx

      await podTx.startNotifications()
      if (!this.isActive(attempt)) return
      podTx.addEventListener('characteristicvaluechanged', this.handleNotification)
      attempt.notificationListenerAttached = true

      this.device = device
      this.podTxCharacteristic = podTx
      this.podRxCharacteristic = podRx
      this.publishSnapshot({ state: 'connected', deviceName: device.name ?? this.config.deviceName })
    } catch (cause) {
      if (!this.isActive(attempt)) {
        this.cleanupAttempt(attempt, true)
        return
      }

      const error = cause instanceof BluetoothPodClientError
        ? cause
        : new BluetoothPodClientError(
          'connection-failed',
          cause instanceof Error ? cause.message : 'Bluetooth connection failed',
          { cause },
        )
      this.activeAttempt = undefined
      this.cleanupAttempt(attempt, true)
      this.clearPublishedHandles()
      this.publishSnapshot({ state: 'error', error: this.failureFrom(error) })
      throw error
    }
  }

  async disconnect(): Promise<void> {
    this.invalidateActiveAttempt(true)
    this.publishSnapshot({ state: 'disconnected' })
  }

  async sendCommand(command: DaaanceBleCommand): Promise<void> {
    const podRx = this.podRxCharacteristic
    const attempt = this.activeAttempt
    if (this.snapshot.state !== 'connected' || !podRx) {
      throw new BluetoothPodClientError('not-connected', 'Bluetooth Pod is not connected')
    }

    const encoded = new TextEncoder().encode(command)
    try {
      if (podRx.writeValueWithoutResponse) {
        await podRx.writeValueWithoutResponse(encoded)
      } else if (podRx.writeValue) {
        await podRx.writeValue(encoded)
      } else {
        throw new Error('Pod RX characteristic does not support writes')
      }
    } catch (cause) {
      const error = new BluetoothPodClientError(
        'command-failed',
        cause instanceof Error ? cause.message : 'Bluetooth command failed',
        { cause },
      )
      if (attempt && this.activeAttempt === attempt && this.podRxCharacteristic === podRx) {
        this.invalidateActiveAttempt(true)
        this.publishSnapshot({ state: 'error', error: this.failureFrom(error) })
      }
      throw error
    }
  }

  subscribe(listener: (event: BluetoothPodEvent) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  subscribeSnapshot(listener: (snapshot: BluetoothPodSnapshot) => void): () => void {
    this.snapshotListeners.add(listener)
    return () => {
      this.snapshotListeners.delete(listener)
    }
  }

  getSnapshot(): BluetoothPodSnapshot {
    if ('error' in this.snapshot) {
      return { ...this.snapshot, error: { ...this.snapshot.error } }
    }
    return { ...this.snapshot }
  }

  getWebTimestamp(): number {
    return this.now()
  }

  private failureFrom(error: BluetoothPodClientError): BluetoothPodFailure {
    return { code: error.code, message: error.message }
  }

  private isActive(attempt: ConnectionAttempt): boolean {
    return this.activeAttempt === attempt
  }

  private handleUnexpectedDisconnect(attempt: ConnectionAttempt): void {
    if (!this.isActive(attempt)) return

    this.invalidateActiveAttempt(false)
    this.publishSnapshot({ state: 'disconnected' })
  }

  private publishSnapshot(snapshot: BluetoothPodSnapshot): void {
    this.snapshot = snapshot
    for (const listener of this.snapshotListeners) {
      try {
        listener(this.getSnapshot())
      } catch {
        // Connection lifecycle must not depend on consumer behavior.
      }
    }
  }

  private invalidateActiveAttempt(disconnectGatt: boolean): void {
    const attempt = this.activeAttempt
    this.activeAttempt = undefined
    this.pendingConnection = undefined
    if (attempt) this.cleanupAttempt(attempt, disconnectGatt)
    this.clearPublishedHandles()
  }

  private cleanupAttempt(attempt: ConnectionAttempt, disconnectGatt: boolean): void {
    if (attempt.notificationListenerAttached) {
      attempt.podTx?.removeEventListener('characteristicvaluechanged', this.handleNotification)
      attempt.notificationListenerAttached = false
    }
    if (attempt.deviceDisconnectListener) {
      attempt.device?.removeEventListener('gattserverdisconnected', attempt.deviceDisconnectListener)
      attempt.deviceDisconnectListener = undefined
    }

    if (disconnectGatt) attempt.device?.gatt?.disconnect()
    attempt.device = undefined
    attempt.podTx = undefined
    attempt.podRx = undefined
  }

  private clearPublishedHandles(): void {
    this.podTxCharacteristic = undefined
    this.podRxCharacteristic = undefined
    this.device = undefined
  }
}
