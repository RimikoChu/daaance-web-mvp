import type { MotionErrorEvent } from './types'

const identityKey = (event: MotionErrorEvent, sustainedWindowMs: number): string => {
  const logicalErrorId = event.details?.logicalErrorId
  const sustainedIdentity = logicalErrorId === undefined
    ? { sustainedWindow: Math.floor(event.timestamp / sustainedWindowMs) }
    : { logicalErrorId }

  return JSON.stringify([event.detector, event.limb, event.type, sustainedIdentity])
}

export const createErrorDeduplicator = (options: {
  sustainedWindowMs: number
}): { accept(event: MotionErrorEvent): boolean; reset(): void } => {
  const acceptedIdentities = new Set<string>()

  return {
    accept(event) {
      const key = identityKey(event, options.sustainedWindowMs)
      if (acceptedIdentities.has(key)) return false

      acceptedIdentities.add(key)
      return true
    },
    reset() {
      acceptedIdentities.clear()
    },
  }
}
