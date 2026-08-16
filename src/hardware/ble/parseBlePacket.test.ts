import { describe, expect, it, vi } from 'vitest'
import { parseBlePacket } from './parseBlePacket'

describe('parseBlePacket', () => {
  it('normalizes the exact canonical left-wrist HELLO packet without inventing a timestamp', () => {
    expect(parseBlePacket('{"event":"HELLO","pod":"left_wrist","firmware":"0.1.0"}', 101.5)).toEqual({
      kind: 'event',
      event: {
        type: 'hello',
        pod: 'left_wrist',
        firmware: '0.1.0',
        receivedAt: 101.5,
      },
    })
  })

  it('normalizes a left-wrist IMU_DATA packet with both clocks', () => {
    expect(parseBlePacket(JSON.stringify({
      event: 'IMU_DATA', pod: 'left_wrist', t: 123456,
      ax: 0.12, ay: 0.35, az: 9.72, gx: 12.4, gy: 4.5, gz: 8.1,
    }), 987.5)).toEqual({
      kind: 'event',
      event: {
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
      },
    })
  })

  it.each([
    ['LW', 'left_wrist'],
    ['RW', 'right_wrist'],
    ['LA', 'left_ankle'],
    ['RA', 'right_ankle'],
  ] as const)('normalizes firmware Pod alias %s to %s', (pod, normalizedPod) => {
    expect(parseBlePacket(JSON.stringify({
      event: 'IMU_DATA', pod, t: 123456,
      ax: 0.12, ay: 0.35, az: 9.72, gx: 12.4, gy: 4.5, gz: 8.1,
    }), 987.5)).toMatchObject({
      kind: 'event',
      event: { type: 'imu', pod: normalizedPod },
    })
  })

  it('normalizes a left-wrist BUTTON_SINGLE_CLICK packet', () => {
    expect(parseBlePacket(JSON.stringify({
      event: 'BUTTON_SINGLE_CLICK', pod: 'left_wrist', t: 200,
    }), 205)).toEqual({
      kind: 'event',
      event: {
        type: 'button-single-click',
        pod: 'left_wrist',
        hardwareTimestamp: 200,
        receivedAt: 205,
      },
    })
  })

  it('normalizes a left-wrist COUNTDOWN_DONE packet', () => {
    expect(parseBlePacket(JSON.stringify({
      event: 'COUNTDOWN_DONE', pod: 'left_wrist', t: 300,
    }), 305)).toEqual({
      kind: 'event',
      event: {
        type: 'countdown-done',
        pod: 'left_wrist',
        hardwareTimestamp: 300,
        receivedAt: 305,
      },
    })
  })

  it('normalizes the exact FEEDBACK_EXECUTED acknowledgement with both clocks', () => {
    expect(parseBlePacket(
      '{"event":"FEEDBACK_EXECUTED","pod":"left_wrist","t":123456,"feedback":"ERROR","outputs":["LED","VIBRATION"]}',
      987.5,
    )).toEqual({
      kind: 'event',
      event: {
        type: 'feedback-executed',
        pod: 'left_wrist',
        hardwareTimestamp: 123456,
        receivedAt: 987.5,
        feedback: 'ERROR',
        outputs: ['LED', 'VIBRATION'],
      },
    })
  })

  it.each([
    { event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', feedback: 'ERROR', outputs: ['LED', 'VIBRATION'] },
    { event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: '123456', feedback: 'ERROR', outputs: ['LED', 'VIBRATION'] },
    { event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123456, outputs: ['LED', 'VIBRATION'] },
    { event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123456, feedback: 'SUCCESS', outputs: ['LED', 'VIBRATION'] },
    { event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123456, feedback: 'ERROR', outputs: [] },
    { event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123456, feedback: 'ERROR', outputs: 'LED' },
  ])('rejects invalid FEEDBACK_EXECUTED fields: %o', (packet) => {
    expect(parseBlePacket(JSON.stringify(packet), 987.5)).toEqual({ kind: 'ignored', reason: 'invalid' })
  })

  it.each([
    [['MOTOR']],
    [['LED', 'MOTOR']],
    [[1]],
  ])('rejects unsupported FEEDBACK_EXECUTED outputs: %o', (outputs) => {
    expect(parseBlePacket(JSON.stringify({
      event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123456, feedback: 'ERROR', outputs,
    }), 987.5)).toEqual({ kind: 'ignored', reason: 'invalid' })
  })

  it('ignores and logs a malformed known FEEDBACK_EXECUTED acknowledgement once', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    expect(parseBlePacket(JSON.stringify({
      event: 'FEEDBACK_EXECUTED', pod: 'left_wrist', t: 123456, feedback: 'ERROR', outputs: [],
    }), 987.5)).toEqual({ kind: 'ignored', reason: 'invalid' })
    expect(debug).toHaveBeenCalledOnce()
    expect(debug).toHaveBeenCalledWith('[Daaance BLE] Invalid event', 'FEEDBACK_EXECUTED')

    debug.mockRestore()
  })

  it('ignores malformed JSON without logging', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    expect(parseBlePacket('{bad', 10)).toEqual({ kind: 'ignored', reason: 'malformed' })
    expect(debug).not.toHaveBeenCalled()

    debug.mockRestore()
  })

  it('ignores a known packet with invalid numeric fields', () => {
    expect(parseBlePacket(JSON.stringify({
      event: 'IMU_DATA', pod: 'left_wrist', t: 1,
      ax: '0.12', ay: 0.35, az: 9.72, gx: 12.4, gy: 4.5, gz: 8.1,
    }), 2)).toEqual({ kind: 'ignored', reason: 'invalid' })
  })

  it('accepts canonical packets from another normalized Pod without changing internal IDs', () => {
    expect(parseBlePacket(JSON.stringify({
      event: 'BUTTON_SINGLE_CLICK', pod: 'right_wrist', t: 100,
    }), 101)).toMatchObject({ kind: 'event', event: { pod: 'right_wrist' } })
  })

  it('ignores and logs an unknown event once per notification', () => {
    const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)

    expect(parseBlePacket(JSON.stringify({ event: 'SOMETHING_NEW', pod: 'left_wrist', t: 1 }), 2))
      .toEqual({ kind: 'ignored', reason: 'unknown' })
    expect(debug).toHaveBeenCalledOnce()
    expect(debug).toHaveBeenCalledWith('[Daaance BLE] Unknown event', 'SOMETHING_NEW')

    debug.mockRestore()
  })

  it('continues parsing valid packets after malformed input', () => {
    expect(parseBlePacket('{bad', 10)).toEqual({ kind: 'ignored', reason: 'malformed' })
    expect(parseBlePacket(
      '{"event":"FEEDBACK_EXECUTED","pod":"left_wrist","t":123456,"feedback":"ERROR","outputs":["LED","VIBRATION"]}',
      12,
    )).toMatchObject({
      kind: 'event',
      event: { type: 'feedback-executed', hardwareTimestamp: 123456, receivedAt: 12 },
    })
  })
})
