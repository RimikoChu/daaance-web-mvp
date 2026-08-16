import { get, put } from '@vercel/blob'
import type { ChoreographyTimeline } from '../src/domain/choreographyTimeline.js'
import type { TimelineRepository } from './_choreographyService.js'

const PATHNAME = 'choreography/demo-dance-001.json'

export function createBlobTimelineRepository(): TimelineRepository {
  return {
    async read() {
      const result = await get(PATHNAME, { access: 'private', useCache: false })
      if (!result || result.statusCode !== 200) return null
      return new Response(result.stream).json()
    },
    async write(timeline: ChoreographyTimeline) {
      await put(PATHNAME, JSON.stringify(timeline), {
        access: 'private',
        contentType: 'application/json',
        allowOverwrite: true,
        cacheControlMaxAge: 60,
      })
    },
  }
}
