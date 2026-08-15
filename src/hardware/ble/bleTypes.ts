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

export type BluetoothPodPacket =
  | HelloPacket
  | ImuDataPacket
  | ButtonSingleClickPacket
  | CountdownDonePacket

export type BluetoothPodEvent =
  | {
    type: 'hello'
    pod: 'left_wrist'
    firmware: string
    receivedAt: number
  }
  | {
    type: 'imu'
    pod: 'left_wrist'
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
    pod: 'left_wrist'
    hardwareTimestamp: number
    receivedAt: number
  }
  | {
    type: 'countdown-done'
    pod: 'left_wrist'
    hardwareTimestamp: number
    receivedAt: number
  }
