import type { MotionErrorEvent, ReviewRange } from '../trainingReview/types'

export interface TrainingTimelineProps {
  duration: number
  currentTime: number
  errors: MotionErrorEvent[]
  ranges: ReviewRange[]
  onSeek: (seconds: number) => void
}

const LIMB_NAME: Record<MotionErrorEvent['limb'], string> = {
  left_wrist: 'left wrist',
  right_wrist: 'right wrist',
  left_ankle: 'left ankle',
  right_ankle: 'right ankle',
}

const SOURCE_NAME: Record<MotionErrorEvent['source'], string> = {
  demo: 'Demo-generated',
  imu: 'IMU-detected',
}

const toPercent = (milliseconds: number, duration: number): number => {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.min(100, Math.max(0, milliseconds / (duration * 1000) * 100))
}

const errorLabel = (error: MotionErrorEvent): string => [
  'Review error',
  LIMB_NAME[error.limb],
  error.type,
  `${error.severity} severity`,
  `${(error.timestamp / 1000).toFixed(2)} seconds`,
  SOURCE_NAME[error.source],
].join(', ')

export function TrainingTimeline({ duration, currentTime, errors, ranges, onSeek }: TrainingTimelineProps) {
  const orderedErrors = Array.from(new Map(errors.map(error => [error.id, error])).values())
    .sort((left, right) => left.timestamp - right.timestamp || left.id.localeCompare(right.id))
  const previousError = [...orderedErrors].reverse().find(error => error.timestamp / 1000 < currentTime)
  const nextError = orderedErrors.find(error => error.timestamp / 1000 > currentTime)

  return <section className="review-timeline" aria-label="Error review timeline">
    <div className="review-timeline-track">
      {ranges.map((range, index) => {
        const left = toPercent(range.start, duration)
        const right = toPercent(range.end, duration)
        const width = Math.max(0, right - left)
        const label = `Review range, ${LIMB_NAME[range.limb]}, ${range.errorIds.length} errors, ${(range.start / 1000).toFixed(2)} to ${(range.end / 1000).toFixed(2)} seconds, ${range.emphasis}`

        return <div className={`review-range ${range.emphasis}`} style={{ left: `${left}%`, width: `${width}%` }} key={`${range.limb}-${range.start}-${range.end}-${index}`}>
          <button className="review-range-jump" type="button" aria-label={label} onClick={() => onSeek(range.start / 1000)} />
        </div>
      })}
      {orderedErrors.map(error => <button
        className="review-point-marker"
        type="button"
        aria-label={errorLabel(error)}
        style={{ left: `${toPercent(error.timestamp, duration)}%` }}
        key={error.id}
        onClick={() => onSeek(error.timestamp / 1000)}
      />)}
      <span className="review-current-position" style={{ left: `${Math.min(100, Math.max(0, currentTime / Math.max(duration, 1) * 100))}%` }} aria-hidden="true" />
    </div>
    <div className="review-navigation" aria-label="Error navigation">
      <button type="button" onClick={() => previousError && onSeek(previousError.timestamp / 1000)} disabled={!previousError}>Previous error</button>
      <button type="button" onClick={() => nextError && onSeek(nextError.timestamp / 1000)} disabled={!nextError}>Next error</button>
    </div>
  </section>
}
