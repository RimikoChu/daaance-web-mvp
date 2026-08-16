import { clusterReviewRanges } from './clusterReviewRanges'
import { correlateFeedback, type FeedbackCorrelationRow } from './feedbackCorrelation'
import type {
  FeedbackCommandEvent,
  FeedbackExecutionEvent,
  MotionErrorEvent,
  MotionErrorType,
  TrainingSessionSnapshot,
} from './types'

export type FeedbackExecutionStatus = 'not-commanded' | 'failed' | 'execution-unconfirmed' | 'executed'

export interface TrainingReportFeedback {
  commandId?: string
  commandStatus?: FeedbackCommandEvent['status']
  failureReason?: string
  sentAt?: number
  executionId?: string
  executionStatus: FeedbackExecutionStatus
  hardwareTimestamp?: number
  receivedAt?: number
  outputs?: FeedbackExecutionEvent['outputs']
  latencyMs?: number
  label: string
}

export interface TrainingReportRow {
  error: MotionErrorEvent
  sourceLabel: 'Demo-generated' | 'IMU-detected'
  feedback: TrainingReportFeedback
}

export interface TrainingReport {
  totalErrors: number
  totalReviewRanges: number
  countsByLimb: Record<MotionErrorEvent['limb'], number>
  countsByType: Record<MotionErrorType, number>
  reviewRanges: ReturnType<typeof clusterReviewRanges>
  rows: TrainingReportRow[]
}

const LIMBS: MotionErrorEvent['limb'][] = ['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle']
const TYPES: MotionErrorType[] = ['timing', 'direction', 'range']

const feedbackLabel = (status: FeedbackExecutionStatus): string => ({
  'not-commanded': 'No feedback command',
  failed: 'Command failed',
  'execution-unconfirmed': 'Command sent / execution unconfirmed',
  executed: 'Execution acknowledged',
})[status]

const uniqueErrors = (errors: MotionErrorEvent[]): MotionErrorEvent[] =>
  Array.from(new Map(errors.map(error => [error.id, error])).values())

export function buildTrainingReport(snapshot: TrainingSessionSnapshot): TrainingReport {
  const errors = uniqueErrors(snapshot.errors)
  const feedbackByErrorId = new Map(correlateFeedback(errors, snapshot.commands, snapshot.executions)
    .map(feedback => [feedback.errorEventId, feedback]))
  const executionById = new Map(snapshot.executions.map(execution => [execution.id, execution]))
  const commandById = new Map(snapshot.commands.map(command => [command.id, command]))
  const countsByLimb = Object.fromEntries(LIMBS.map(limb => [limb, 0])) as TrainingReport['countsByLimb']
  const countsByType = Object.fromEntries(TYPES.map(type => [type, 0])) as TrainingReport['countsByType']

  for (const error of errors) {
    countsByLimb[error.limb] += 1
    countsByType[error.type] += 1
  }

  const reviewRanges = clusterReviewRanges(errors)
  const rows = [...errors]
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
    .map(error => {
      const correlation: FeedbackCorrelationRow = feedbackByErrorId.get(error.id) ?? {
        errorEventId: error.id,
        executionStatus: 'not-commanded',
      }
      const command = correlation.commandId ? commandById.get(correlation.commandId) : undefined
      const execution = correlation.executionId ? executionById.get(correlation.executionId) : undefined
      const feedback: TrainingReportFeedback = {
        ...correlation,
        sentAt: command?.sentAt,
        hardwareTimestamp: execution?.hardwareTimestamp,
        receivedAt: execution?.receivedAt,
        outputs: execution?.outputs,
        label: feedbackLabel(correlation.executionStatus),
      }

      return {
        error,
        sourceLabel: error.source === 'demo' ? 'Demo-generated' as const : 'IMU-detected' as const,
        feedback,
      }
    })

  return {
    totalErrors: errors.length,
    totalReviewRanges: reviewRanges.length,
    countsByLimb,
    countsByType,
    reviewRanges,
    rows,
  }
}
