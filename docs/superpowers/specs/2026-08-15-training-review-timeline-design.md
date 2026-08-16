# Daaance Training Review Timeline Design

## Goal

Add an honest, database-ready training review layer to the current Daaance demo. All four limbs produce motion during training, while choreography events identify only the limb that is the focus of the current beat. The session records deduplicated motion errors, web feedback commands, and optional hardware execution acknowledgements. A user can review those events on the video timeline and in an in-page report.

This phase remains a local/browser demo. It does not add PDF generation, cloud storage, a database, accounts, camera analysis, or a new Direction/Range algorithm.

## Product semantics

- All four Pods are continuously active during a dance.
- `Current focus` means the limb emphasized by the choreography at that beat; it does not mean the other limbs stopped moving.
- Demo mode uses four Mock streams.
- Hybrid mode uses real BLE IMU for `left_wrist` and Mock streams for the other three limbs.
- Demo may demonstrate Timing, Direction, and Range report events, but every such event is visibly labelled `Demo-generated`.
- Real IMU sessions only report error types emitted by the installed detector. The current real detector supports Timing only and must not fabricate Direction or Range results.

## Architecture

Use an append-only `TrainingSessionLedger` as the source of truth for the current session:

```text
continuous IMU / Mock samples
          |
          v
MotionErrorDetector
          |
          v
standard MotionErrorEvent
          |
          v
TrainingSessionLedger
  |       |          |            |
  v       v          v            v
timeline  feedback   report       JSON export
          commands
          + ACKs
```

The report and timeline are derived views. They do not maintain independent copies of session facts. The ledger must remain serializable so a later database adapter can persist the same schema without rewriting the analysis, timeline, or report UI.

## Standard error events

```ts
type MotionErrorType = 'timing' | 'direction' | 'range'
type MotionErrorSeverity = 'low' | 'medium' | 'high'
type MotionErrorSource = 'demo' | 'imu'

type MotionErrorEvent = {
  id: string
  timestamp: number
  receivedAt: number
  limb: PodId
  type: MotionErrorType
  severity: MotionErrorSeverity
  source: MotionErrorSource
  detector: string
  confidence?: number
  details?: Record<string, unknown>
}
```

`timestamp` is session/video time. `receivedAt` is the web receive clock. Hardware-derived detector details may retain the original Pod timestamp where available. `source: 'imu'` describes real IMU analysis, not proof that a feedback actuator executed.

## Detector boundary

Introduce a `MotionErrorDetector` interface that consumes normalized motion samples and emits standardized `MotionErrorEvent` values. The training ledger and review UI depend only on this interface and schema.

- Demo detector: deterministic Timing, Direction, and Range fixtures for demonstrating the report.
- Current IMU detector: Timing only.
- Future Direction, Range, camera, or fusion detectors can be added without changing the ledger or review UI schema.

## Error deduplication

Raw 50 Hz frames are never counted as errors. A sustained deviation becomes one independent error event.

Deduplication happens before the ledger and before feedback cooldown. The deduplication key includes at least limb, error type, detector, and the detector's logical error identity/window. Repeated frames belonging to the same sustained error update no counters and create no additional timeline markers.

Existing `FEEDBACK_ERROR` protection remains in force: prioritize error-event identity deduplication and apply an approximately 1000 ms command cooldown.

## Review ranges

Centralize these initial thresholds as named constants:

```ts
REVIEW_CLUSTER_WINDOW_MS = 2000
REVIEW_CLUSTER_MIN_ERRORS = 2
REVIEW_CLUSTER_STRONG_ERRORS = 3
REVIEW_SEEK_PREROLL_MS = 1000
```

- A single deduplicated error is an ordinary point marker.
- At least two independent events for the same limb inside a two-second window form a review range.
- At least three events increase the range's visual emphasis.
- Different limbs may occupy the same time range, but their events and counts remain separate.
- Clustering is deterministic and derived from the ledger; it does not mutate or discard original error events.

## Timeline interaction

The existing video timeline gains point markers and continuous review-range highlights.

- Clicking an error seeks to approximately one second before its timestamp and pauses.
- Clicking a review range seeks to approximately one second before its start and pauses.
- `Previous error` and `Next error` navigate deduplicated events in timestamp order.
- Seeking is clamped to the video bounds.
- Review uses the existing video instance and preserves the current teaching/follow-mode behavior.
- Timeline markers remain keyboard accessible and expose limb, type, severity, timestamp, and source as accessible labels.

## Feedback command and execution records

```ts
type FeedbackCommandEvent = {
  id: string
  errorEventId: string
  command: 'FEEDBACK_ERROR'
  sentAt: number
  status: 'sent' | 'failed'
  failureReason?: string
}

type FeedbackExecutionEvent = {
  id: string
  errorEventId?: string
  pod: PodId
  hardwareTimestamp: number
  receivedAt: number
  feedback: 'ERROR'
  outputs: Array<'LED' | 'VIBRATION'>
}
```

The UI must distinguish detection time, command-send time, and hardware-execution time. If no execution acknowledgement is received, it displays `Command sent / execution unconfirmed`; it never implies that the Pod actually lit or vibrated.

## BLE protocol v0.2 extension

BLE naming and all v0.1 UUIDs, directions, device names, Pod IDs, commands, and existing events remain unchanged. v0.2 adds one optional Pod-to-Web Notify event on `POD_TX_UUID`:

```json
{
  "event": "FEEDBACK_EXECUTED",
  "pod": "left_wrist",
  "t": 123456,
  "feedback": "ERROR",
  "outputs": ["LED", "VIBRATION"]
}
```

The parser validates this event tolerantly. Malformed acknowledgements are ignored and debug-logged without interrupting later notifications. Unknown future events keep the existing ignore-and-log behavior. v0.1 firmware remains usable; missing acknowledgements are represented as unconfirmed execution.

## In-page report

The in-page report is the primary output and includes:

- total independent errors;
- total review ranges;
- per-limb counts for left wrist, right wrist, left ankle, and right ankle;
- counts by Timing, Direction, and Range;
- an ordered error list with timestamp, limb, type, severity, detector, and source;
- feedback command status and timestamp;
- hardware execution acknowledgement, outputs, hardware timestamp, web receive timestamp, and measured command-to-ACK latency when available;
- direct navigation from report rows to the matching video moment.

The UI explicitly uses `Demo-generated` and `IMU-detected`. It must not advertise real Direction/Range detection when the current IMU detector does not provide it.

## JSON export

JSON export is a secondary developer action. It contains the session metadata, all original standardized error events, derived review ranges, feedback command records, hardware execution records, detector identifiers, and schema version. It does not replace or visually compete with the in-page report.

No PDF, upload, database write, or cloud persistence is included.

## Error handling

- Invalid detector output is rejected at the detector boundary and does not crash training.
- One malformed BLE packet does not stop later packets.
- Failed feedback writes append a failed command record and update visible hardware status using the existing client behavior.
- Missing ACKs remain unconfirmed rather than failed unless the write itself failed.
- Duplicate/out-of-order ACKs are retained safely or ignored by stable identity rules without duplicating the associated error.
- Disconnecting during a real session never substitutes Mock left-wrist data without explicit Demo selection.

## Testing and acceptance

Automated tests must cover:

1. Four-limb continuous Mock generation without changing the choreography focus semantics.
2. Hybrid routing: BLE left wrist, Mock other three limbs.
3. Error-event deduplication under repeated 50 Hz frames.
4. Two-event and three-event clustering, limb separation, overlapping ranges, and boundary behavior.
5. Marker/range seeking with one-second preroll, clamping, pause, and previous/next navigation.
6. Demo events showing all three types with `source: 'demo'`.
7. Real detector emitting only supported Timing events with `source: 'imu'`.
8. Exact v0.2 `FEEDBACK_EXECUTED` parsing plus malformed and unknown packet tolerance.
9. Command, ACK, latency, missing-ACK, and failed-write report states.
10. Complete JSON export without non-serializable Bluetooth objects.
11. Existing countdown, feedback cooldown, BLE/Mock separation, 18.66-second video, teaching/follow modes, and ±5-second controls remain green.

Run the full test suite and `npm run build`. Physical LED, vibration, ACK timing, and real 50 Hz behavior remain `HARDWARE VERIFICATION REQUIRED` until tested with the Pod.
