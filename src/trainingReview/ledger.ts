import type {
  FeedbackCommandEvent,
  FeedbackExecutionEvent,
  MotionErrorEvent,
  TrainingSessionLedger,
  TrainingSessionSnapshot,
} from './types'

const copySerializable = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value)) as Value

export const createTrainingSessionLedger = (
  sessionId: string,
  startedAt: number,
): TrainingSessionLedger => {
  const errors: MotionErrorEvent[] = []
  const commands: FeedbackCommandEvent[] = []
  const executions: FeedbackExecutionEvent[] = []
  const eventIds = new Set<string>()

  const append = <Event extends { id: string }>(events: Event[], event: Event): void => {
    if (eventIds.has(event.id)) {
      throw new Error(`Duplicate event ID: ${event.id}`)
    }

    eventIds.add(event.id)
    events.push(copySerializable(event))
  }

  return {
    appendError: event => append(errors, event),
    appendCommand: event => append(commands, event),
    appendExecution: event => append(executions, event),
    snapshot: (): TrainingSessionSnapshot => copySerializable({
      schemaVersion: '1.0.0',
      sessionId,
      startedAt,
      errors,
      commands,
      executions,
    }),
  }
}
