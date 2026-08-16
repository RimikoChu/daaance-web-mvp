import { normalizeTimeline, type ChoreographyTimeline } from '../domain/choreographyTimeline'

type Fetcher = typeof fetch

async function readResponse(response: Response): Promise<ChoreographyTimeline> {
  const body = await response.json() as unknown
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && 'error' in body ? String(body.error) : 'Choreography request failed.'
    throw new Error(message)
  }
  const updatedAt = typeof body === 'object' && body !== null && 'updatedAt' in body ? String(body.updatedAt) : ''
  return normalizeTimeline(body, () => new Date(updatedAt))
}

export async function loadChoreography(fetcher: Fetcher = fetch): Promise<ChoreographyTimeline> {
  return readResponse(await fetcher('/api/choreography', { method: 'GET', cache: 'no-store' }))
}

export async function saveChoreography(timeline: ChoreographyTimeline, fetcher: Fetcher = fetch): Promise<ChoreographyTimeline> {
  return readResponse(await fetcher('/api/choreography', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(timeline),
  }))
}
