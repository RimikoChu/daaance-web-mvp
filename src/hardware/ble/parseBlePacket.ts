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

  if (typeof parsed.event === 'string' && !['HELLO', 'IMU_DATA', 'BUTTON_SINGLE_CLICK', 'COUNTDOWN_DONE', 'FEEDBACK_EXECUTED'].includes(parsed.event)) {
    console.debug('[Daaance BLE] Unknown event', parsed.event)
    return { kind: 'ignored', reason: 'unknown' }
  }

  if (!isKnownPacket(parsed) || parsed.pod !== 'left_wrist' || !isFiniteNumber(receivedAt)) {
    if (parsed.event === 'FEEDBACK_EXECUTED') {
      console.debug('[Daaance BLE] Invalid event', parsed.event)
    }
    return { kind: 'ignored', reason: 'invalid' }
  }

  switch (parsed.event) {
    case 'HELLO':
      return {
        kind: 'event',
        event: {
          type: 'hello', pod: parsed.pod, firmware: parsed.firmware,
          receivedAt,
        },
      }
    case 'IMU_DATA':
      return {
        kind: 'event',
        event: {
          type: 'imu', pod: parsed.pod, hardwareTimestamp: parsed.t, receivedAt,
          ax: parsed.ax, ay: parsed.ay, az: parsed.az,
          gx: parsed.gx, gy: parsed.gy, gz: parsed.gz,
        },
      }
    case 'BUTTON_SINGLE_CLICK':
      return {
        kind: 'event',
        event: {
          type: 'button-single-click', pod: parsed.pod,
          hardwareTimestamp: parsed.t, receivedAt,
        },
      }
    case 'COUNTDOWN_DONE':
      return {
        kind: 'event',
        event: {
          type: 'countdown-done', pod: parsed.pod,
          hardwareTimestamp: parsed.t, receivedAt,
        },
      }
    case 'FEEDBACK_EXECUTED':
      return {
        kind: 'event',
        event: {
          type: 'feedback-executed', pod: parsed.pod,
          hardwareTimestamp: parsed.t, receivedAt,
          feedback: parsed.feedback,
          outputs: parsed.outputs,
        },
      }
  }
}
