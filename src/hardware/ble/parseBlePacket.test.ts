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

  it('ignores packets from a pod outside the phase-one left wrist', () => {
    expect(parseBlePacket(JSON.stringify({
      event: 'BUTTON_SINGLE_CLICK', pod: 'right_wrist', t: 100,
    }), 101)).toEqual({ kind: 'ignored', reason: 'invalid' })
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
    expect(parseBlePacket(JSON.stringify({ event: 'COUNTDOWN_DONE', pod: 'left_wrist', t: 11 }), 12))
      .toMatchObject({ kind: 'event', event: { type: 'countdown-done', hardwareTimestamp: 11, receivedAt: 12 } })
  })
})
