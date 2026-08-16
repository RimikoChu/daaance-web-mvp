import type { FeedbackCommandEvent, MotionErrorEvent } from './trainingReview/types'

type FeedbackError = Pick<MotionErrorEvent, 'id'> | string

function eventIdFrom(event: FeedbackError): string {
  return typeof event === 'string' ? event : event.id
}

function failureReason(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

export function createFeedbackGuard(options: {
  cooldownMs: number
  now: () => number
  send: (eventId: string) => void | Promise<void>
  createCommandId?: () => string
}): { report(event: FeedbackError): Promise<FeedbackCommandEvent | undefined>; reset(): void } {
  const reportedEventIds = new Set<string>()
  let lastAttemptAt: number | undefined
  let commandSequence = 0

  return {
    async report(event) {
      const eventId = eventIdFrom(event)
      if (reportedEventIds.has(eventId)) return undefined
      reportedEventIds.add(eventId)

      const attemptedAt = options.now()
      if (lastAttemptAt !== undefined && attemptedAt - lastAttemptAt < options.cooldownMs) return undefined
      lastAttemptAt = attemptedAt

      const command: FeedbackCommandEvent = {
        id: options.createCommandId?.() ?? `feedback-command-${attemptedAt}-${++commandSequence}`,
        errorEventId: eventId,
        command: 'FEEDBACK_ERROR',
        sentAt: attemptedAt,
        status: 'sent',
      }

      try {
        await options.send(eventId)
        return command
      } catch (cause) {
        // Hardware feedback is best-effort; analysis results must still be retained.
        return { ...command, status: 'failed', failureReason: failureReason(cause) }
      }
    },
    reset() {
      reportedEventIds.clear()
      lastAttemptAt = undefined
    },
  }
}
