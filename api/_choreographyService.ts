import {
  cloneDefaultTimeline,
  normalizeTimeline,
  TimelineValidationError,
  type ChoreographyTimeline,
} from '../src/domain/choreographyTimeline.js'

export interface TimelineRepository {
  read(): Promise<unknown | null>
  write(timeline: ChoreographyTimeline): Promise<void>
}

interface ChoreographyServiceDependencies {
  repository: TimelineRepository
  hasToken: boolean
  now?: () => Date
}

function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...headers },
  })
}

export async function handleChoreographyRequest(
  request: Request,
  { repository, hasToken, now = () => new Date() }: ChoreographyServiceDependencies,
): Promise<Response> {
  if (request.method === 'GET') {
    if (!hasToken) return json(cloneDefaultTimeline(), 200, { 'X-Choreography-Source': 'default' })
    try {
      const stored = await repository.read()
      if (stored === null) return json(cloneDefaultTimeline(), 200, { 'X-Choreography-Source': 'default' })
      const updatedAt = typeof stored === 'object' && stored !== null && 'updatedAt' in stored
        ? String(stored.updatedAt)
        : ''
      const timeline = normalizeTimeline(stored, () => new Date(updatedAt))
      return json(timeline, 200, { 'X-Choreography-Source': 'blob' })
    } catch {
      return json({ error: 'Choreography storage is unavailable.' }, 503)
    }
  }

  if (request.method === 'POST') {
    if (!hasToken) return json({ error: 'Blob storage is not configured.' }, 503)
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400)
    }
    let timeline: ChoreographyTimeline
    try {
      timeline = normalizeTimeline(body, now)
    } catch (error) {
      const message = error instanceof TimelineValidationError ? error.message : 'Invalid choreography timeline.'
      return json({ error: message }, 400)
    }
    try {
      await repository.write(timeline)
      return json(timeline)
    } catch {
      return json({ error: 'Choreography storage is unavailable.' }, 503)
    }
  }

  return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST' })
}
