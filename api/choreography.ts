import { createBlobTimelineRepository } from './_blobRepository'
import { handleChoreographyRequest } from './_choreographyService'

const repository = createBlobTimelineRepository()

export default {
  fetch(request: Request): Promise<Response> {
    return handleChoreographyRequest(request, {
      repository,
      hasToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    })
  },
}
