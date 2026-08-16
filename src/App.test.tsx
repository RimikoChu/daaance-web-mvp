import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { BluetoothPodEvent, DaaanceBleCommand } from './hardware/ble/bleTypes'
import {
  BluetoothPodClient,
  type BluetoothLike,
  type BluetoothPodSnapshot,
  type BluetoothRemoteGATTLike,
} from './hardware/ble/BluetoothPodClient'
import { POD_RX_UUID, POD_TX_UUID, SERVICE_UUID } from './hardware/ble/bleConfig'
import { BLEMotionDataSource } from './domain/bleMotionDataSource'
import { MockMotionDataSource } from './domain/mockMotionDataSource'
import App from './App'

class FakeHardwareClient {
  snapshot: BluetoothPodSnapshot = { state: 'connected', deviceName: 'DAAANCE_LW' }
  webNow = 0
  eventListener: ((event: BluetoothPodEvent) => void) | undefined
  snapshotListener: ((snapshot: BluetoothPodSnapshot) => void) | undefined
  readonly connect = vi.fn(async () => {})
  readonly disconnect = vi.fn(async () => {})
  readonly sendCommand = vi.fn(async (_command: DaaanceBleCommand) => {})
  readonly subscribe = vi.fn((listener: (event: BluetoothPodEvent) => void) => {
    this.eventListener = listener
    return vi.fn()
  })
  readonly subscribeSnapshot = vi.fn((listener: (snapshot: BluetoothPodSnapshot) => void) => {
    this.snapshotListener = listener
    return vi.fn()
  })

  getSnapshot(): BluetoothPodSnapshot {
    return this.snapshot
  }

  getWebTimestamp(): number {
    return this.webNow
  }

  publishSnapshot(snapshot: BluetoothPodSnapshot): void {
    this.snapshot = snapshot
    this.snapshotListener?.(snapshot)
  }

  publishEvent(event: BluetoothPodEvent): void {
    this.eventListener?.(event)
  }
}

class FakeBluetoothCharacteristic extends EventTarget {
  value?: DataView
  readonly startNotifications = vi.fn(async () => this)
  readonly writeValueWithoutResponse = vi.fn(async (_value: BufferSource) => undefined)
}

class FakeBluetoothDevice extends EventTarget {
  readonly name = 'DAAANCE_LW'

  constructor(readonly gatt: BluetoothRemoteGATTLike) {
    super()
  }
}

function makeBluetoothBoundary() {
  const podTx = new FakeBluetoothCharacteristic()
  const podRx = new FakeBluetoothCharacteristic()
  const getCharacteristic = vi.fn(async (uuid: string) => {
    if (uuid === POD_TX_UUID) return podTx
    if (uuid === POD_RX_UUID) return podRx
    throw new Error(`Unexpected characteristic ${uuid}`)
  })
  const getPrimaryService = vi.fn(async () => ({ getCharacteristic }))
  const connect = vi.fn(async () => ({ getPrimaryService }))
  const device = new FakeBluetoothDevice({ connect, disconnect: vi.fn() })
  const requestDevice = vi.fn(async () => device)
  const bluetooth: BluetoothLike = { requestDevice }

  return { bluetooth, podTx, podRx, requestDevice, getPrimaryService, getCharacteristic }
}

function notify(characteristic: FakeBluetoothCharacteristic, packet: string): void {
  const bytes = new TextEncoder().encode(packet)
  characteristic.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  characteristic.dispatchEvent(new Event('characteristicvaluechanged'))
}

describe('Daaance training flow', () => {
  it('correlates training-triggered left-wrist feedback with a shared-clock FEEDBACK_EXECUTED acknowledgement', async () => {
    const boundary = makeBluetoothBoundary()
    let webNow = 100
    const client = new BluetoothPodClient({ bluetooth: boundary.bluetooth, now: () => webNow })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()

    try {
      render(<App hardwareClient={client} />)
      fireEvent.click(screen.getByRole('button', { name: 'Connect DAAANCE_LW' }))
      await screen.findByText('Connected')
      await waitFor(() => expect(screen.getByText('DAAANCE_LW 已连接')).toBeInTheDocument())
      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
      await waitFor(() => expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenLastCalledWith(
        new TextEncoder().encode('START_COUNTDOWN'),
      ))

      act(() => notify(boundary.podTx, JSON.stringify({ event: 'COUNTDOWN_DONE', pod: 'left_wrist', t: 7 })))
      const video = await screen.findByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
      Object.defineProperty(video, 'duration', { value: 18.66 })
      fireEvent.loadedMetadata(video)

      webNow = 5_000
      video.currentTime = 2.5
      fireEvent.timeUpdate(video)
      await waitFor(() => expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenLastCalledWith(
        new TextEncoder().encode('FEEDBACK_ERROR'),
      ))

      webNow = 5_033
      act(() => notify(boundary.podTx, JSON.stringify({
        event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 8, feedback: 'ERROR', outputs: ['LED', 'VIBRATION'],
      })))
      fireEvent.click(screen.getByRole('button', { name: '退出训练' }))

      const hardwareTest = screen.getByRole('region', { name: 'Hardware Test' })
      expect(within(hardwareTest).getByText(/FEEDBACK_ERROR · sent 5000 ms · execution acknowledged/)).toBeInTheDocument()
      expect(within(hardwareTest).getByText('FEEDBACK_EXECUTED · hardware 8 ms · received 5033 ms · latency 33 ms · LED, VIBRATION')).toBeInTheDocument()
    } finally {
      play.mockRestore()
    }
  })

  it('uses the Bluetooth client web clock for a controller command and exactly one FEEDBACK_EXECUTED latency correlation', async () => {
    const boundary = makeBluetoothBoundary()
    let webNow = 1_000
    const client = new BluetoothPodClient({ bluetooth: boundary.bluetooth, now: () => webNow })

    render(<App hardwareClient={client} />)
    fireEvent.click(screen.getByRole('button', { name: 'Connect DAAANCE_LW' }))
    expect(await screen.findByText('Connected')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('DAAANCE_LW 已连接')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))

    const hardwareTest = screen.getByRole('region', { name: 'Hardware Test' })
    fireEvent.click(within(hardwareTest).getByRole('button', { name: 'Error feedback' }))
    await waitFor(() => expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenCalledWith(
      new TextEncoder().encode('FEEDBACK_ERROR'),
    ))

    webNow = 1_025
    act(() => notify(boundary.podTx, JSON.stringify({
      event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 45, feedback: 'ERROR', outputs: ['LED'],
    })))
    act(() => notify(boundary.podTx, JSON.stringify({
      event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 45, feedback: 'ERROR', outputs: ['LED'],
    })))

    expect(within(hardwareTest).getByText(/FEEDBACK_ERROR · sent 1000 ms · execution acknowledged/)).toBeInTheDocument()
    expect(within(hardwareTest).getByText('FEEDBACK_EXECUTED · hardware 45 ms · received 1025 ms · latency 25 ms · LED')).toBeInTheDocument()
    expect(within(hardwareTest).getByText('FEEDBACK_EXECUTED · hardware 45 ms · received 1025 ms · command uncorrelated · LED')).toBeInTheDocument()
  })

  it('runs the real left-wrist closed loop through the fake Bluetooth boundary while the other Pods stay Demo', async () => {
    const boundary = makeBluetoothBoundary()
    let receivedAt = 100
    const client = new BluetoothPodClient({
      bluetooth: boundary.bluetooth,
      now: () => receivedAt,
    })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const assertThreeDemoPods = () => expect(screen.getAllByText('Demo')).toHaveLength(3)

    try {
      render(<App hardwareClient={client} />)
      assertThreeDemoPods()

      fireEvent.click(screen.getByRole('button', { name: 'Connect DAAANCE_LW' }))
      assertThreeDemoPods()
      expect(await screen.findByText('Connected')).toBeInTheDocument()
      assertThreeDemoPods()
      expect(boundary.requestDevice).toHaveBeenCalledWith({
        filters: [{ name: 'DAAANCE_LW' }],
        optionalServices: [SERVICE_UUID],
      })
      expect(boundary.getPrimaryService).toHaveBeenCalledWith(SERVICE_UUID)
      expect(boundary.getCharacteristic).toHaveBeenNthCalledWith(1, POD_TX_UUID)
      expect(boundary.getCharacteristic).toHaveBeenNthCalledWith(2, POD_RX_UUID)

      act(() => notify(boundary.podTx, '{"event":"HELLO","pod":"left_wrist","firmware":"0.1.0"}'))
      receivedAt = 120
      act(() => notify(boundary.podTx, '{"event":"IMU_DATA","pod":"left_wrist","t":123456,"ax":0.12,"ay":0.35,"az":9.72,"gx":12.4,"gy":4.5,"gz":8.1}'))
      assertThreeDemoPods()

      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      const hardwareTest = screen.getByRole('region', { name: 'Hardware Test' })
      expect(within(hardwareTest).getByText('DAAANCE_LW')).toBeInTheDocument()
      expect(within(hardwareTest).getByText('0.1.0')).toBeInTheDocument()
      expect(within(hardwareTest).getByText('0.12')).toBeInTheDocument()

      fireEvent.click(within(hardwareTest).getByRole('button', { name: 'Short vibration' }))
      await waitFor(() => expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenCalledTimes(1))
      expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenNthCalledWith(
        1,
        new TextEncoder().encode('VIBRATE_SHORT'),
      )

      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
      await waitFor(() => expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenCalledTimes(2))
      expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenNthCalledWith(
        2,
        new TextEncoder().encode('START_COUNTDOWN'),
      )

      receivedAt = 4_000
      act(() => notify(boundary.podTx, '{"event":"COUNTDOWN_DONE","pod":"left_wrist","t":300}'))
      const video = await screen.findByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
      Object.defineProperty(video, 'duration', { value: 18.66 })
      fireEvent.loadedMetadata(video)
      expect(play).toHaveBeenCalledOnce()
      expect(screen.getByText('Real hardware · Connected')).toBeInTheDocument()
      assertThreeDemoPods()

      fireEvent.ended(video)
      await waitFor(() => expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenCalledTimes(3))
      expect(boundary.podRx.writeValueWithoutResponse).toHaveBeenNthCalledWith(
        3,
        new TextEncoder().encode('FEEDBACK_ERROR'),
      )
      const leftWristResult = within(document.querySelector<HTMLElement>('.results-summary')!).getByText('左手腕').closest<HTMLElement>('.limb-row')
      expect(leftWristResult).not.toBeNull()
      expect(within(leftWristResult!).getByText('动作未捕捉')).toBeInTheDocument()
      expect(within(leftWristResult!).getByText('注意')).toBeInTheDocument()
      for (const mockLimb of ['右手腕', '左脚踝']) {
        const mockResult = within(document.querySelector<HTMLElement>('.results-summary')!).getByText(mockLimb).closest<HTMLElement>('.limb-row')
        expect(mockResult).not.toBeNull()
        expect(within(mockResult!).getByText('节奏稳定')).toBeInTheDocument()
        expect(within(mockResult!).getByText('很好')).toBeInTheDocument()
      }
      const rightAnkleResult = within(document.querySelector<HTMLElement>('.results-summary')!).getByText('右脚踝').closest<HTMLElement>('.limb-row')
      expect(rightAnkleResult).not.toBeNull()
      expect(within(rightAnkleResult!).getByText('平均 307ms 偏晚')).toBeInTheDocument()
      expect(within(rightAnkleResult!).getByText('注意')).toBeInTheDocument()
    } finally {
      play.mockRestore()
    }
  })

  it('uses an abstract four-Pod rhythm field without human-shaped Hero markup', () => {
    const { container } = render(<App />)
    const heroStage = container.querySelector<HTMLElement>('.hero-stage')
    const humanVisualTerm = /human|dancer|person|silhouette|pose|avatar|mannequin|skeleton|舞者|人体|人形|剪影/i

    expect(screen.getByRole('heading', { name: /让身体/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '开始训练' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect DAAANCE_LW' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue in Demo' })).toBeInTheDocument()
    expect(heroStage).toBeInTheDocument()
    expect(heroStage!.querySelector('.dancer, .head, .torso, .arm, .leg')).not.toBeInTheDocument()
    expect(Array.from(heroStage!.querySelectorAll<HTMLElement>('*')).filter(element => (
      humanVisualTerm.test(`${element.getAttribute('class') ?? ''} ${element.id}`)
    ))).toEqual([])
    expect(Array.from(heroStage!.querySelectorAll<HTMLElement>('svg, [role="img"], [aria-label], [aria-roledescription], [data-illustration]')).filter(element => {
      const semanticLabel = [
        element.getAttribute('aria-label'),
        element.getAttribute('aria-roledescription'),
        element.getAttribute('data-illustration'),
        element.tagName.toLowerCase() === 'svg' ? element.textContent : '',
      ].filter(Boolean).join(' ')
      return humanVisualTerm.test(semanticLabel)
    })).toEqual([])
    const rhythmField = heroStage!.querySelector('.rhythm-field')
    expect(rhythmField).toBeInTheDocument()
    expect(within(rhythmField as HTMLElement).getAllByRole('listitem').map(node => node.textContent)).toEqual(['LW', 'RW', 'LA', 'RA'])
    expect(container.querySelectorAll('.device-chip')).toHaveLength(4)
    expect(document.querySelector('.pod-connection-panel')).not.toBeInTheDocument()
  })

  it('uses the confirmed orange-pink soft glass theme', () => {
    render(<App />)

    expect(document.querySelector('main.soft-glass-theme')).toBeInTheDocument()
  })

  it('does not silently turn an unsupported real Pod into a connected Pod', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: 'Connect DAAANCE_LW' }))
    expect(await screen.findByText('Web Bluetooth is not supported in this browser. Please use Chrome or Edge.')).toBeInTheDocument()
    expect(screen.queryByText('Connected')).not.toBeInTheDocument()
    expect(screen.queryByText('选择你的训练方式')).not.toBeInTheDocument()
  })

  it('returns home readiness to waiting after a spontaneous real disconnect', () => {
    const client = new FakeHardwareClient()
    render(<App hardwareClient={client} />)

    expect(screen.getByText('Connected')).toBeInTheDocument()
    act(() => client.publishSnapshot({ state: 'disconnected' }))

    expect(screen.getByText('Not connected')).toBeInTheDocument()
    expect(screen.getByText('Pods 等待连接')).toBeInTheDocument()
    expect(screen.queryByText('DAAANCE_LW 已连接')).not.toBeInTheDocument()
    expect(screen.queryByText('Demo 已就绪')).not.toBeInTheDocument()
  })

  async function continueFromHome() {
    fireEvent.click(screen.getByRole('button', { name: 'Continue in Demo' }))
    await screen.findByText('Demo 已就绪')
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
  }

  it('moves from home to setup after Demo is explicitly selected', async () => {
    render(<App />)
    await continueFromHome()
    expect(screen.getByText('选择你的训练方式')).toBeInTheDocument()
  })

  it('waits for the connected hardware countdown before opening and auto-starting training', () => {
    vi.useFakeTimers()
    const client = new FakeHardwareClient()
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()

    try {
      render(<StrictMode><App hardwareClient={client} /></StrictMode>)
      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))

      expect(client.sendCommand).toHaveBeenCalledOnce()
      expect(client.sendCommand).toHaveBeenCalledWith('START_COUNTDOWN')
      expect(screen.queryByLabelText('18.66 秒舞蹈示范')).not.toBeInTheDocument()

      act(() => client.publishEvent({
        type: 'countdown-done',
        pod: 'left_wrist',
        hardwareTimestamp: 3_000,
        receivedAt: 4_000,
      }))

      const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
      Object.defineProperty(video, 'duration', { value: 18.66 })
      fireEvent.loadedMetadata(video)
      expect(play).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
      play.mockRestore()
    }
  })

  it('records a failed real left-wrist feedback command without discarding results', async () => {
    const client = new FakeHardwareClient()
    client.sendCommand.mockImplementation(async command => {
      if (command === 'FEEDBACK_ERROR') throw new Error('Pod disconnected')
    })
    render(<App hardwareClient={client} />)
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    act(() => client.publishEvent({
      type: 'countdown-done',
      pod: 'left_wrist',
      hardwareTimestamp: 3_000,
      receivedAt: 4_000,
    }))

    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))

    expect(client.sendCommand.mock.calls.map(([command]) => command)).toEqual([
      'START_COUNTDOWN',
      'FEEDBACK_ERROR',
    ])
    expect(await screen.findByText('本次训练完成')).toBeInTheDocument()
    const leftWristRow = screen.getAllByRole('row', { name: /left wrist.*timing.*imu-detected/i })[0]
    expect(within(leftWristRow).getByText('Command failed')).toBeInTheDocument()
    expect(within(leftWristRow).getByText(/Pod disconnected/)).toBeInTheDocument()
  })

  it('uses countdown completion as the real-session clock origin before analyzing BLE samples', () => {
    const client = new FakeHardwareClient()
    const bleSource = new BLEMotionDataSource()
    render(<App hardwareClient={client} bleSource={bleSource} />)
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    act(() => client.publishEvent({
      type: 'countdown-done',
      pod: 'left_wrist',
      hardwareTimestamp: 3_000,
      receivedAt: 4_000,
    }))
    act(() => client.publishEvent({
      type: 'imu',
      pod: 'left_wrist',
      hardwareTimestamp: 5_000,
      receivedAt: 6_000,
      ax: 2.6,
      ay: 0.9,
      az: 1.5,
      gx: 110,
      gy: 44,
      gz: 16,
    }))
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'currentTime', { value: 2.5, writable: true })

    fireEvent.timeUpdate(video)

    expect(client.sendCommand.mock.calls.map(([command]) => command)).toEqual(['START_COUNTDOWN'])
  })

  it('keeps a disconnected real session BLE-backed for the left wrist while other limbs stay Mock-backed', async () => {
    const client = new FakeHardwareClient()
    const bleSource = new BLEMotionDataSource()
    const originalGetSamplesForWindow = MockMotionDataSource.prototype.getSamplesForWindow
    const getMockSamplesForWindow = vi.spyOn(MockMotionDataSource.prototype, 'getSamplesForWindow').mockImplementation(function (this: MockMotionDataSource, startMs, endMs) {
      return originalGetSamplesForWindow.call(this, startMs, endMs)
    })

    try {
      render(<App hardwareClient={client} bleSource={bleSource} />)
      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
      act(() => client.publishEvent({
        type: 'countdown-done',
        pod: 'left_wrist',
        hardwareTimestamp: 3_000,
        receivedAt: 4_000,
      }))

      act(() => client.publishSnapshot({ state: 'disconnected' }))

      const trainingPods = document.querySelectorAll<HTMLElement>('.training-layout aside .device-chip')
      expect.soft(within(trainingPods[0]).queryByText('Real hardware · Disconnected')).toBeInTheDocument()
      expect.soft(Array.from(trainingPods).slice(1).map(card => within(card).getByText('Demo').textContent)).toEqual(['Demo', 'Demo', 'Demo'])

      fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))

      expect(getMockSamplesForWindow).toHaveBeenCalled()
      const resultsSummary = await screen.findByText('四肢表现')
      const leftWristResult = within(resultsSummary.closest<HTMLElement>('.results-summary')!).getByText('左手腕').closest<HTMLElement>('.limb-row')
      expect(leftWristResult).not.toBeNull()
      expect(within(leftWristResult!).getByText('动作未捕捉')).toBeInTheDocument()
    } finally {
      getMockSamplesForWindow.mockRestore()
    }
  })

  it('routes a real rerun through a fresh countdown and BLE session clock', () => {
    const client = new FakeHardwareClient()
    const bleSource = new BLEMotionDataSource()
    render(<App hardwareClient={client} bleSource={bleSource} />)
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))

    const completeCountdownWithCorrectLeftWristSamples = (origin: number) => {
      act(() => client.publishEvent({
        type: 'countdown-done',
        pod: 'left_wrist',
        hardwareTimestamp: origin - 1_000,
        receivedAt: origin,
      }))
      for (const eventTime of [2_000, 7_200, 12_800]) {
        act(() => client.publishEvent({
          type: 'imu',
          pod: 'left_wrist',
          hardwareTimestamp: origin + eventTime - 1_000,
          receivedAt: origin + eventTime,
          ax: 2.6,
          ay: 0.9,
          az: 1.5,
          gx: 110,
          gy: 44,
          gz: 16,
        }))
      }
    }

    completeCountdownWithCorrectLeftWristSamples(4_000)
    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))
    fireEvent.click(screen.getByRole('button', { name: '再跳一次' }))

    expect(screen.queryByLabelText('18.66 秒舞蹈示范')).not.toBeInTheDocument()
    expect(screen.getByText('Waiting for DAAANCE_LW…')).toBeInTheDocument()
    expect(client.sendCommand.mock.calls.map(([command]) => command)).toEqual([
      'START_COUNTDOWN',
      'START_COUNTDOWN',
    ])

    completeCountdownWithCorrectLeftWristSamples(40_000)
    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))

    expect(client.sendCommand.mock.calls.map(([command]) => command)).toEqual([
      'START_COUNTDOWN',
      'START_COUNTDOWN',
    ])
    expect(screen.getByText('本次训练完成')).toBeInTheDocument()
  })

  it('uses a no-op feedback callback for an all-Mock Demo run', async () => {
    const client = new FakeHardwareClient()
    const originalGetSamples = MockMotionDataSource.prototype.getSamples
    const getSamples = vi.spyOn(MockMotionDataSource.prototype, 'getSamples').mockImplementation(function (this: MockMotionDataSource, event) {
      return event.limb === 'LEFT_WRIST' ? [] : originalGetSamples.call(this, event)
    })

    try {
      render(<App hardwareClient={client} />)
      fireEvent.click(screen.getByRole('button', { name: 'Continue in Demo' }))
      await screen.findByText('Demo 已就绪')
      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
      fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))

      expect(getSamples.mock.calls.some(([event]) => event.limb === 'LEFT_WRIST')).toBe(true)
      expect(client.sendCommand).not.toHaveBeenCalled()
      expect(screen.getByText('本次训练完成')).toBeInTheDocument()
    } finally {
      getSamples.mockRestore()
    }
  })

  it('never auto-starts after timeout and uses all-Mock data only after explicit Demo selection', () => {
    vi.useFakeTimers()
    const client = new FakeHardwareClient()
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()

    try {
      render(<App hardwareClient={client} />)
      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))

      act(() => vi.advanceTimersByTime(8_000))
      expect(screen.queryByLabelText('18.66 秒舞蹈示范')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Retry hardware' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Start in Demo' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Start in Demo' }))
      const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
      Object.defineProperty(video, 'duration', { value: 18.66 })
      fireEvent.loadedMetadata(video)
      expect(play).not.toHaveBeenCalled()

      fireEvent.ended(video)
      expect(screen.getByText('本次训练完成')).toBeInTheDocument()
      expect(screen.getByText('75')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
      play.mockRestore()
    }
  })

  it('starts accessibility training without voice controls', async () => {
    render(<App />)
    await continueFromHome()
    fireEvent.click(screen.getByRole('button', { name: /无障碍模式/ }))
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    expect(screen.getByText('无障碍模式')).toBeInTheDocument()
    expect(screen.queryByText('语音提示')).not.toBeInTheDocument()
  })

  it('keeps playback mode selection inside training', async () => {
    render(<App />)
    await continueFromHome()
    expect(screen.queryByRole('button', { name: '教学模式' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '跟跳模式' })).not.toBeInTheDocument()
  })

  it('shows deterministic results when the video completes', async () => {
    render(<App />)
    await continueFromHome()
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))
    expect(screen.getByText('本次训练完成')).toBeInTheDocument()
    expect(screen.getByText('节奏准确率')).toBeInTheDocument()
  })

  it('opens the ledger-backed report and returns a selected error to the paused shared timeline without a countdown', async () => {
    render(<App />)
    await continueFromHome()
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))

    expect(screen.getByRole('heading', { name: '训练复盘报告' })).toBeInTheDocument()
    const row = screen.getAllByRole('row', { name: /left wrist.*timing.*demo-generated/i })[0]
    fireEvent.click(within(row).getByRole('button', { name: 'Review moment' }))

    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { value: 18.66 })
    Object.defineProperty(video, 'pause', { value: vi.fn() })
    fireEvent.loadedMetadata(video)
    expect(video.currentTime).toBe(1)
    expect(screen.queryByText('Waiting for DAAANCE_LW…')).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /left wrist.*timing.*demo-generated/i }).length).toBeGreaterThan(0)
  })

  it('starts a Demo rerun directly with the all-Mock source', async () => {
    render(<App />)
    await continueFromHome()
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))

    fireEvent.click(screen.getByRole('button', { name: '再跳一次' }))

    expect(screen.getByLabelText('18.66 秒舞蹈示范')).toBeInTheDocument()
    expect(screen.queryByText('Waiting for DAAANCE_LW…')).not.toBeInTheDocument()
  })

  it('keeps one Demo snapshot behind four active streams, timeline review, report totals, and JSON export', async () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:demo-session')
    const revokeObjectURL = vi.fn()
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const pause = vi.fn()

    render(<App />)
    await continueFromHome()
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
    Object.defineProperty(video, 'duration', { value: 18.66 })
    Object.defineProperty(video, 'pause', { value: pause })
    fireEvent.loadedMetadata(video)
    fireEvent.play(video)
    video.currentTime = 2
    fireEvent.timeUpdate(video)

    expect(screen.getByText('本拍重点 · 左手腕')).toBeInTheDocument()
    video.currentTime = 2.5
    fireEvent.timeUpdate(video)

    expect(screen.getAllByText('采集中')).toHaveLength(4)
    expect(screen.getAllByRole('button', { name: /Review error.*Demo-generated/i })).toHaveLength(3)
    fireEvent.click(screen.getByRole('button', { name: /Review range, left wrist, 3 errors.*strong/i }))
    expect(pause).toHaveBeenCalledOnce()
    expect(video.currentTime).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Next error' }))
    expect(video.currentTime).toBe(1)

    fireEvent.ended(video)

    expect(await screen.findByRole('heading', { name: '训练复盘报告' })).toBeInTheDocument()
    expect(screen.getAllByText('Demo-generated')).toHaveLength(36)
    expect(screen.getByText('36')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }))
    const exported = createObjectURL.mock.calls[0]?.[0] as Blob
    expect(JSON.parse(await exported.text())).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({ type: 'timing', source: 'demo' }),
        expect.objectContaining({ type: 'direction', source: 'demo' }),
        expect.objectContaining({ type: 'range', source: 'demo' }),
      ]),
      commands: [],
      executions: [],
    })
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:demo-session')
    download.mockRestore()
  })

  it('freezes real-session feedback attempts and execution acknowledgements into the completed report snapshot', async () => {
    const client = new FakeHardwareClient()
    const bleSource = new BLEMotionDataSource()
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:hybrid-session')
    const revokeObjectURL = vi.fn()
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    client.webNow = 1_000
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()

    try {
      render(<App hardwareClient={client} bleSource={bleSource} />)
      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
      act(() => client.publishEvent({
        type: 'countdown-done',
        pod: 'left_wrist',
        hardwareTimestamp: 700,
        receivedAt: 1_000,
      }))

      const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
      Object.defineProperty(video, 'duration', { value: 18.66 })
      fireEvent.loadedMetadata(video)
      client.webNow = 5_000
      video.currentTime = 2.5
      fireEvent.timeUpdate(video)
      await waitFor(() => expect(client.sendCommand).toHaveBeenLastCalledWith('FEEDBACK_ERROR'))

      client.webNow = 5_033
      act(() => client.publishEvent({
        type: 'feedback-executed',
        pod: 'left_wrist',
        hardwareTimestamp: 42,
        receivedAt: 5_033,
        feedback: 'ERROR',
        outputs: ['LED', 'VIBRATION'],
      }))
      act(() => client.publishEvent({
        type: 'feedback-executed',
        pod: 'left_wrist',
        hardwareTimestamp: 42,
        receivedAt: 5_034,
        feedback: 'ERROR',
        outputs: ['LED', 'VIBRATION'],
      }))
      fireEvent.ended(video)

      expect(await screen.findByRole('heading', { name: '训练复盘报告' })).toBeInTheDocument()
      const leftWristRow = screen.getAllByRole('row', { name: /left wrist.*timing.*imu-detected/i })[0]
      expect(within(leftWristRow).getByText('Execution acknowledged')).toBeInTheDocument()
      expect(within(leftWristRow).getByText(/sent 5000 ms.*latency 33 ms/i)).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '导出 JSON' }))
      const exported = JSON.parse(await (createObjectURL.mock.calls[0]?.[0] as Blob).text())
      expect(exported).toMatchObject({
        errors: expect.arrayContaining([expect.objectContaining({ id: 'imu-c1-timing', receivedAt: 5_000 })]),
        commands: expect.arrayContaining([expect.objectContaining({ errorEventId: 'imu-c1-timing', sentAt: 5_000, status: 'sent' })]),
        executions: expect.arrayContaining([expect.objectContaining({ pod: 'left_wrist', hardwareTimestamp: 42, receivedAt: 5_033 })]),
      })
      expect(exported.executions).toHaveLength(1)
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:hybrid-session')
    } finally {
      download.mockRestore()
      play.mockRestore()
    }
  })

  it('ignores a deferred feedback completion from an exited session after a new real session begins', async () => {
    const client = new FakeHardwareClient()
    let resolveFeedbackWrite!: () => void
    const feedbackWrite = new Promise<void>(resolve => { resolveFeedbackWrite = resolve })
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    client.sendCommand.mockImplementation(command => command === 'FEEDBACK_ERROR' ? feedbackWrite : Promise.resolve())

    try {
      render(<App hardwareClient={client} />)
      fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
      act(() => client.publishEvent({ type: 'countdown-done', pod: 'left_wrist', hardwareTimestamp: 1, receivedAt: 1_000 }))
      const firstVideo = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
      Object.defineProperty(firstVideo, 'duration', { value: 18.66 })
      fireEvent.loadedMetadata(firstVideo)
      client.webNow = 5_000
      firstVideo.currentTime = 2.5
      fireEvent.timeUpdate(firstVideo)
      await waitFor(() => expect(client.sendCommand).toHaveBeenLastCalledWith('FEEDBACK_ERROR'))
      fireEvent.ended(firstVideo)

      fireEvent.click(screen.getByRole('button', { name: '退出训练' }))
      expect(screen.getByText('选择你的训练方式')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
      act(() => client.publishEvent({ type: 'countdown-done', pod: 'left_wrist', hardwareTimestamp: 2, receivedAt: 6_000 }))
      const secondVideo = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
      Object.defineProperty(secondVideo, 'duration', { value: 18.66 })
      fireEvent.loadedMetadata(secondVideo)

      await act(async () => {
        resolveFeedbackWrite()
        await Promise.resolve()
        await Promise.resolve()
      })

      expect(screen.getByLabelText('18.66 秒舞蹈示范')).toBe(secondVideo)
      expect(screen.queryByRole('heading', { name: '训练复盘报告' })).not.toBeInTheDocument()
    } finally {
      play.mockRestore()
    }
  })
})
