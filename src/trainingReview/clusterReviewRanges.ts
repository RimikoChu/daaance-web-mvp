import {
  REVIEW_CLUSTER_MIN_ERRORS,
  REVIEW_CLUSTER_STRONG_ERRORS,
  REVIEW_CLUSTER_WINDOW_MS,
} from './constants'
import type { MotionErrorEvent, ReviewRange } from './types'

export const clusterReviewRanges = (errors: MotionErrorEvent[]): ReviewRange[] => {
  const errorsByLimb = new Map<string, MotionErrorEvent[]>()

  for (const error of errors) {
    const limbErrors = errorsByLimb.get(error.limb) ?? []
    limbErrors.push(error)
    errorsByLimb.set(error.limb, limbErrors)
  }

  const ranges: ReviewRange[] = []
  for (const limbErrors of errorsByLimb.values()) {
    const orderedErrors = [...limbErrors].sort((left, right) =>
      left.timestamp - right.timestamp || left.id.localeCompare(right.id),
    )
    let cluster: MotionErrorEvent[] = []

    const appendCluster = (): void => {
      if (cluster.length < REVIEW_CLUSTER_MIN_ERRORS) return

      ranges.push({
        limb: cluster[0].limb,
        start: cluster[0].timestamp,
        end: cluster[cluster.length - 1].timestamp,
        errorIds: cluster.map(error => error.id),
        emphasis: cluster.length >= REVIEW_CLUSTER_STRONG_ERRORS ? 'strong' : 'standard',
      })
    }

    for (const error of orderedErrors) {
      if (cluster.length > 0 && error.timestamp - cluster[0].timestamp > REVIEW_CLUSTER_WINDOW_MS) {
        appendCluster()
        cluster = []
      }
      cluster.push(error)
    }
    appendCluster()
  }

  return ranges.sort((left, right) =>
    left.start - right.start || left.end - right.end || left.limb.localeCompare(right.limb),
  )
}
