export type DaaancePodId = 'left_wrist' | 'right_wrist' | 'left_ankle' | 'right_ankle'

export type DaaanceBleCommand =
  | 'VIBRATE_SHORT'
  | 'VIBRATE_LONG'
  | 'START_COUNTDOWN'
  | 'FEEDBACK_ERROR'
  | 'STOP_ALL'

export interface HelloPacket {
  event: 'HELLO'
  pod: DaaancePodId
  firmware: string
}

export interface ImuDataPacket {
  event: 'IMU_DATA'
  pod: DaaancePodId
  t: number
  ax: number
  ay: number
  az: number
  gx: number
  gy: number
  gz: number
}

export interface ButtonSingleClickPacket {
  event: 'BUTTON_SINGLE_CLICK'
  pod: DaaancePodId
  t: number
}

export interface CountdownDonePacket {
  event: 'COUNTDOWN_DONE'
  pod: DaaancePodId
  t: number
}

export type DaaanceFeedbackOutput = 'LED' | 'VIBRATION'

export interface FeedbackExecutedPacket {
  event: 'FEEDBACK_EXECUTED'
  pod: DaaancePodId
  t: number
  feedback: 'ERROR'
  outputs: DaaanceFeedbackOutput[]
}

export type BluetoothPodPacket =
  | HelloPacket
  | ImuDataPacket
  | ButtonSingleClickPacket
  | CountdownDonePacket
  | FeedbackExecutedPacket

export type BluetoothPodEvent =
  | {
    type: 'hello'
    pod: DaaancePodId
    firmware: string
    receivedAt: number
  }
  | {
    type: 'imu'
    pod: DaaancePodId
    hardwareTimestamp: number
    receivedAt: number
    ax: number
    ay: number
    az: number
    gx: number
    gy: number
    gz: number
  }
  | {
    type: 'button-single-click'
    pod: DaaancePodId
    hardwareTimestamp: number
    receivedAt: number
  }
  | {
    type: 'countdown-done'
    pod: DaaancePodId
    hardwareTimestamp: number
    receivedAt: number
  }
  | {
    type: 'feedback-executed'
    pod: DaaancePodId
    hardwareTimestamp: number
    receivedAt: number
    feedback: 'ERROR'
    outputs: DaaanceFeedbackOutput[]
  }
