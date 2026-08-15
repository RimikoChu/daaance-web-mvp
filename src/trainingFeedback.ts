export function createFeedbackGuard(options: {
  cooldownMs: number
  now: () => number
  send: (eventId: string) => void | Promise<void>
}): { report(eventId: string): Promise<boolean>; reset(): void } {
  const reportedEventIds = new Set<string>()
  let lastAttemptAt: number | undefined

  return {
    async report(eventId) {
      if (reportedEventIds.has(eventId)) return false
      reportedEventIds.add(eventId)

      const attemptedAt = options.now()
      if (lastAttemptAt !== undefined && attemptedAt - lastAttemptAt < options.cooldownMs) return false
      lastAttemptAt = attemptedAt

      try {
        await options.send(eventId)
      } catch {
        // Hardware feedback is best-effort; analysis results must still be retained.
      }
      return true
    },
    reset() {
      reportedEventIds.clear()
      lastAttemptAt = undefined
    },
  }
}
