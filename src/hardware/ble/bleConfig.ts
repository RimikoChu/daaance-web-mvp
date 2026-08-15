export const DAAANCE_POD_NAMES = {
  left_wrist: 'DAAANCE_LW',
  right_wrist: 'DAAANCE_RW',
  left_ankle: 'DAAANCE_LA',
  right_ankle: 'DAAANCE_RA',
} as const

export const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
export const POD_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
export const POD_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'

export const DAAANCE_BLE_CONFIG = {
  deviceName: DAAANCE_POD_NAMES.left_wrist,
  serviceUuid: SERVICE_UUID,
  podRxUuid: POD_RX_UUID,
  podTxUuid: POD_TX_UUID,
} as const
