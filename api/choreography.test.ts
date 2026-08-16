import { describe, expect, it, vi } from 'vitest'
import { cloneDefaultTimeline } from '../src/domain/choreographyTimeline.js'
import { handleChoreographyRequest, type TimelineRepository } from './_choreographyService.js'

function repository(value: unknown | null = cloneDefaultTimeline()): TimelineRepository {
  return { read: vi.fn(async () => value), write: vi.fn(async () => undefined) }
}

const NOW = () => new Date('2026-08-16T00:00:00.000Z')

describe('/api/choreography', () => {
  it('returns a validated stored timeline without caching', async () => {
    const response = await handleChoreographyRequest(
      new Request('http://local/api/choreography'),
      { repository: repository(), hasToken: true, now: NOW },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('no-store')
    expect(response.headers.get('X-Choreography-Source')).toBe('blob')
    expect(await response.json()).toMatchObject({ danceId: 'demo-dance-001', durationMs: 18660 })
  })

  it.each([
    ['the token is missing', false, cloneDefaultTimeline()],
    ['the blob is absent', true, null],
  ])('returns the built-in default when %s', async (_name, hasToken, value) => {
    const response = await handleChoreographyRequest(
      new Request('http://local/api/choreography'),
      { repository: repository(value), hasToken, now: NOW },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('X-Choreography-Source')).toBe('default')
    expect((await response.json()).beats).toEqual([])
  })

  it('validates and persists a normalized POST document', async () => {
    const store = repository()
    const input = { ...cloneDefaultTimeline(), updatedAt: 'client', beats: [
      { id: 'c2', timeMs: 3200, intensity: 'strong', limb: 'right_wrist' },
      { id: 'c1', timeMs: 2000, intensity: 'medium', limb: 'left_wrist' },
    ] }
    const response = await handleChoreographyRequest(
      new Request('http://local/api/choreography', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }),
      { repository: store, hasToken: true, now: NOW },
    )

    expect(response.status).toBe(200)
    const saved = await response.json()
    expect(saved.updatedAt).toBe('2026-08-16T00:00:00.000Z')
    expect(saved.beats.map((beat: { id: string }) => beat.id)).toEqual(['c1', 'c2'])
    expect(store.write).toHaveBeenCalledWith(saved)
  })

  it.each([
    ['missing token', repository(), false, cloneDefaultTimeline(), 503],
    ['malformed document', repository(), true, { danceId: 'other' }, 400],
  ])('rejects POST with %s', async (_name, store, hasToken, body, status) => {
    const response = await handleChoreographyRequest(
      new Request('http://local/api/choreography', { method: 'POST', body: JSON.stringify(body) }),
      { repository: store, hasToken, now: NOW },
    )
    expect(response.status).toBe(status)
    expect(await response.json()).toHaveProperty('error')
    expect(store.write).not.toHaveBeenCalled()
  })

  it.each(['GET', 'POST'] as const)('returns 503 when Blob %s fails', async method => {
    const store = repository()
    if (method === 'GET') vi.mocked(store.read).mockRejectedValue(new Error('blob unavailable'))
    else vi.mocked(store.write).mockRejectedValue(new Error('blob unavailable'))
    const response = await handleChoreographyRequest(
      new Request('http://local/api/choreography', {
        method,
        body: method === 'POST' ? JSON.stringify(cloneDefaultTimeline()) : undefined,
      }),
      { repository: store, hasToken: true, now: NOW },
    )
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Choreography storage is unavailable.' })
  })

  it('rejects unsupported methods', async () => {
    const response = await handleChoreographyRequest(
      new Request('http://local/api/choreography', { method: 'DELETE' }),
      { repository: repository(), hasToken: true, now: NOW },
    )
    expect(response.status).toBe(405)
    expect(response.headers.get('Allow')).toBe('GET, POST')
  })
})
