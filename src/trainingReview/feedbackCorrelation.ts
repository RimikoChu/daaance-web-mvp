import type { FeedbackCommandEvent, FeedbackExecutionEvent, MotionErrorEvent } from './types'

export const FEEDBACK_ACK_CORRELATION_WINDOW_MS = 5_000

export interface FeedbackCorrelationRow {
  errorEventId: string
  commandId?: string
  commandStatus?: FeedbackCommandEvent['status']
  failureReason?: string
  executionId?: string
  executionStatus: 'not-commanded' | 'failed' | 'execution-unconfirmed' | 'executed'
  latencyMs?: number
}

interface Candidate {
  command: FeedbackCommandEvent
  pod: MotionErrorEvent['limb']
}

export function correlateFeedback(
  errors: MotionErrorEvent[],
  commands: FeedbackCommandEvent[],
  executions: FeedbackExecutionEvent[],
  correlationWindowMs = FEEDBACK_ACK_CORRELATION_WINDOW_MS,
): FeedbackCorrelationRow[] {
  const errorById = new Map(errors.map(error => [error.id, error]))
  const commandByErrorId = new Map<string, FeedbackCommandEvent>()
  for (const command of [...commands].sort((left, right) => left.sentAt - right.sentAt || left.id.localeCompare(right.id))) {
    if (!commandByErrorId.has(command.errorEventId)) commandByErrorId.set(command.errorEventId, command)
  }

  const candidates: Candidate[] = [...commandByErrorId.values()]
    .map(command => ({ command, pod: errorById.get(command.errorEventId)?.limb }))
    .filter((candidate): candidate is Candidate => candidate.pod !== undefined && candidate.command.status === 'sent')
  const executionByCommandId = new Map<string, FeedbackExecutionEvent>()
  const seenExecutionIds = new Set<string>()

  for (const execution of [...executions].sort((left, right) => left.receivedAt - right.receivedAt || left.id.localeCompare(right.id))) {
    if (seenExecutionIds.has(execution.id)) continue
    seenExecutionIds.add(execution.id)
    const match = candidates
      .filter(candidate => !executionByCommandId.has(candidate.command.id)
        && candidate.pod === execution.pod
        && candidate.command.sentAt <= execution.receivedAt
        && execution.receivedAt - candidate.command.sentAt <= correlationWindowMs)
      .sort((left, right) => right.command.sentAt - left.command.sentAt || left.command.id.localeCompare(right.command.id))[0]
    if (match) executionByCommandId.set(match.command.id, execution)
  }

  return errors.map(error => {
    const command = commandByErrorId.get(error.id)
    if (!command) return { errorEventId: error.id, executionStatus: 'not-commanded' }
    if (command.status === 'failed') {
      return {
        errorEventId: error.id,
        commandId: command.id,
        commandStatus: command.status,
        failureReason: command.failureReason,
        executionStatus: 'failed',
      }
    }
    const execution = executionByCommandId.get(command.id)
    if (!execution) {
      return {
        errorEventId: error.id,
        commandId: command.id,
        commandStatus: command.status,
        executionStatus: 'execution-unconfirmed',
      }
    }
    return {
      errorEventId: error.id,
      commandId: command.id,
      commandStatus: command.status,
      executionId: execution.id,
      executionStatus: 'executed',
      latencyMs: execution.receivedAt - command.sentAt,
    }
  })
}
