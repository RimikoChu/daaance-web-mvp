import type {
  BluetoothPodEvent,
  BluetoothPodPacket,
  DaaanceFeedbackOutput,
  DaaancePodId,
} from './bleTypes'

type IgnoredParseResult = {
  kind: 'ignored'
  reason: 'malformed' | 'invalid' | 'unknown'
}

export type BlePacketParseResult =
  | { kind: 'event'; event: BluetoothPodEvent }
  | IgnoredParseResult

const podIds: readonly DaaancePodId[] = ['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle']
const podAliases: Readonly<Record<string, DaaancePodId>> = {
  LW: 'left_wrist',
  RW: 'right_wrist',
  LA: 'left_ankle',
  RA: 'right_ankle',
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isPodId = (value: unknown): value is DaaancePodId =>
  typeof value === 'string' && podIds.includes(value as DaaancePodId)

const feedbackOutputs: readonly DaaanceFeedbackOutput[] = ['LED', 'VIBRATION']

const isFeedbackOutputs = (value: unknown): value is DaaanceFeedbackOutput[] =>
  Array.isArray(value)
  && value.length > 0
  && value.every((output) => typeof output === 'string' && feedbackOutputs.includes(output as DaaanceFeedbackOutput))

const isKnownPacket = (value: Record<string, unknown>): value is Record<string, unknown> & BluetoothPodPacket => {
  if (!isPodId(value.pod)) return false

  switch (value.event) {
    case 'HELLO':
      return typeof value.firmware === 'string'
    case 'IMU_DATA':
      return isFiniteNumber(value.t)
        && ['ax', 'ay', 'az', 'gx', 'gy', 'gz'].every((field) => isFiniteNumber(value[field]))
    case 'BUTTON_SINGLE_CLICK':
    case 'COUNTDOWN_DONE':
      return isFiniteNumber(value.t)
    case 'FEEDBACK_EXECUTED':
      return isFiniteNumber(value.t)
        && value.feedback === 'ERROR'
        && isFeedbackOutputs(value.outputs)
    default:
      return false
  }
}

export function parseBlePacket(value: string, receivedAt: number): BlePacketParseResult {
  let parsed: unknown

  try {
    parsed = JSON.parse(value)
  } catch {
    return { kind: 'ignored', reason: 'malformed' }
  }

  if (!isRecord(parsed)) return { kind: 'ignored', reason: 'invalid' }
  const packet: Record<string, unknown> = typeof parsed.pod === 'string' && podAliases[parsed.pod]
    ? { ...parsed, pod: podAliases[parsed.pod] }
    : parsed

  if (typeof packet.event === 'string' && !['HELLO', 'IMU_DATA', 'BUTTON_SINGLE_CLICK', 'COUNTDOWN_DONE', 'FEEDBACK_EXECUTED'].includes(packet.event)) {
    console.debug('[Daaance BLE] Unknown event', packet.event)
    return { kind: 'ignored', reason: 'unknown' }
  }

  if (!isKnownPacket(packet) || !isFiniteNumber(receivedAt)) {
    if (packet.event === 'FEEDBACK_EXECUTED') {
      console.debug('[Daaance BLE] Invalid event', packet.event)
    }
    return { kind: 'ignored', reason: 'invalid' }
  }

  switch (packet.event) {
    case 'HELLO':
      return {
        kind: 'event',
        event: {
          type: 'hello', pod: packet.pod, firmware: packet.firmware,
          receivedAt,
        },
      }
    case 'IMU_DATA':
      return {
        kind: 'event',
        event: {
          type: 'imu', pod: packet.pod, hardwareTimestamp: packet.t, receivedAt,
          ax: packet.ax, ay: packet.ay, az: packet.az,
          gx: packet.gx, gy: packet.gy, gz: packet.gz,
        },
      }
    case 'BUTTON_SINGLE_CLICK':
      return {
        kind: 'event',
        event: {
          type: 'button-single-click', pod: packet.pod,
          hardwareTimestamp: packet.t, receivedAt,
        },
      }
    case 'COUNTDOWN_DONE':
      return {
        kind: 'event',
        event: {
          type: 'countdown-done', pod: packet.pod,
          hardwareTimestamp: packet.t, receivedAt,
        },
      }
    case 'FEEDBACK_EXECUTED':
      return {
        kind: 'event',
        event: {
          type: 'feedback-executed', pod: packet.pod,
          hardwareTimestamp: packet.t, receivedAt,
          feedback: packet.feedback,
          outputs: packet.outputs,
        },
      }
  }
}
