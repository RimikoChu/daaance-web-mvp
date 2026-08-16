import { createBlobTimelineRepository } from './_blobRepository.js'
import { handleChoreographyRequest } from './_choreographyService.js'

const repository = createBlobTimelineRepository()

export default {
  fetch(request: Request): Promise<Response> {
    return handleChoreographyRequest(request, {
      repository,
      hasToken: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    })
  },
}
