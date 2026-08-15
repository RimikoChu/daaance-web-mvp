import { useCallback, useEffect, useRef, useState } from 'react'
import type { BLEMotionDataSource } from '../domain/bleMotionDataSource'
import type { BluetoothPodClient, BluetoothPodSnapshot } from './ble/BluetoothPodClient'
import type { BluetoothPodEvent, DaaanceBleCommand } from './ble/bleTypes'

type ImuEvent = Extract<BluetoothPodEvent, { type: 'imu' }>
export type LeftWristDiscreteEvent = Extract<BluetoothPodEvent, { type: 'button-single-click' | 'countdown-done' }>

export type LeftWristHardwareSnapshot = BluetoothPodSnapshot & {
  firmware?: string
  lastPacketAt?: number
  imuHz: number
}

export type LeftWristHardwareClient = Pick<
  BluetoothPodClient,
  'connect' | 'disconnect' | 'getSnapshot' | 'sendCommand' | 'subscribe' | 'subscribeSnapshot'
>

export interface LeftWristHardwareController {
  snapshot: LeftWristHardwareSnapshot
  connect: () => Promise<void>
  disconnect: () => Promise<void>
  sendCommand: (command: DaaanceBleCommand) => Promise<void>
  subscribeEvents: (listener: (event: BluetoothPodEvent) => void) => () => void
  recentEvents: LeftWristDiscreteEvent[]
  latestImu?: ImuEvent
}

const IMU_RATE_WINDOW_MS = 1000
const MAX_RECENT_EVENTS = 20

function withTelemetry(snapshot: BluetoothPodSnapshot): LeftWristHardwareSnapshot {
  return { ...snapshot, imuHz: 0 }
}

function measuredHz(receivedAt: number[]): number {
  if (receivedAt.length < 2) return 0
  const duration = receivedAt.at(-1)! - receivedAt[0]
  return duration > 0 ? (receivedAt.length - 1) * 1000 / duration : 0
}

export function useLeftWristHardware(
  client: LeftWristHardwareClient,
  bleSource: Pick<BLEMotionDataSource, 'addEvent' | 'clear'>,
): LeftWristHardwareController {
  const [snapshot, setSnapshot] = useState<LeftWristHardwareSnapshot>(() => withTelemetry(client.getSnapshot()))
  const [latestImu, setLatestImu] = useState<ImuEvent>()
  const [recentEvents, setRecentEvents] = useState<LeftWristDiscreteEvent[]>([])
  const imuReceivedAt = useRef<number[]>([])
  const imuRateExpiry = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const eventListeners = useRef(new Set<(event: BluetoothPodEvent) => void>())

  const resetTelemetry = useCallback((connection: BluetoothPodSnapshot) => {
    if (imuRateExpiry.current !== undefined) clearTimeout(imuRateExpiry.current)
    imuRateExpiry.current = undefined
    imuReceivedAt.current = []
    bleSource.clear()
    setLatestImu(undefined)
    setRecentEvents([])
    setSnapshot(withTelemetry(connection))
  }, [bleSource])

  useEffect(() => client.subscribeSnapshot(resetTelemetry), [client, resetTelemetry])

  useEffect(() => {
    const unsubscribe = client.subscribe(event => {
      if (event.type === 'imu') {
        bleSource.addEvent(event)
        setLatestImu(event)
        const windowStart = event.receivedAt - IMU_RATE_WINDOW_MS
        imuReceivedAt.current = [...imuReceivedAt.current, event.receivedAt]
          .filter(receivedAt => receivedAt > windowStart)
        setSnapshot(current => ({
          ...current,
          lastPacketAt: event.receivedAt,
          imuHz: measuredHz(imuReceivedAt.current),
        }))
        if (imuRateExpiry.current !== undefined) clearTimeout(imuRateExpiry.current)
        imuRateExpiry.current = setTimeout(() => {
          imuRateExpiry.current = undefined
          imuReceivedAt.current = []
          setSnapshot(current => ({ ...current, imuHz: 0 }))
        }, IMU_RATE_WINDOW_MS)
      } else {
        setSnapshot(current => ({
          ...current,
          firmware: event.type === 'hello' ? event.firmware : current.firmware,
          lastPacketAt: event.receivedAt,
        }))

        if (event.type === 'button-single-click' || event.type === 'countdown-done') {
          setRecentEvents(current => [...current, event].slice(-MAX_RECENT_EVENTS))
        }
      }

      for (const listener of eventListeners.current) {
        try {
          listener(event)
        } catch {
          // Hardware ingestion must not depend on event-consumer behavior.
        }
      }
    })

    return () => {
      unsubscribe()
      if (imuRateExpiry.current !== undefined) clearTimeout(imuRateExpiry.current)
    }
  }, [bleSource, client])

  const connect = useCallback(() => client.connect(), [client])

  const disconnect = useCallback(() => client.disconnect(), [client])

  const sendCommand = useCallback((command: DaaanceBleCommand) => client.sendCommand(command), [client])

  const subscribeEvents = useCallback((listener: (event: BluetoothPodEvent) => void) => {
    eventListeners.current.add(listener)
    return () => {
      eventListeners.current.delete(listener)
    }
  }, [])

  return { snapshot, connect, disconnect, sendCommand, subscribeEvents, recentEvents, latestImu }
}
