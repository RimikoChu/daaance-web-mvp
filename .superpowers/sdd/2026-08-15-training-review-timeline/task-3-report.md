# Task 3 report: Detector boundary and independent-error deduplication

## Status

Complete

## Scope

- Added `MotionErrorDetector` with Demo and IMU Timing implementations.
- Added identity-first error deduplication for sustained detector events.
- Added centralized Timing-error severity bands.

## Behavioral guarantees

- Demo creates deterministic Timing, Direction, and Range fixtures labelled
  `source: 'demo'` and `detector: 'demo-review-v1'`.
- Real IMU analysis calls the existing `analyzeTiming` function using the
  selected strictness and emits only Timing errors labelled `source: 'imu'`
  and `detector: 'imu-timing-v1'`.
- Each detector event ID is tied to its choreography ID. Repeated 50 Hz
  frames with the same detector, limb, type, and logical error identity are
  accepted only once; different limbs/types/detectors and later fallback
  windows remain independent.
- The deduplicator never mutates the supplied event and `reset()` starts a
  fresh session.

## RED evidence

- `npm test -- src/trainingReview/detectors.test.ts` failed before the
  implementation because `./detectors` did not exist.
- `npm test -- src/trainingReview/deduplicateErrors.test.ts` failed before the
  implementation because `./deduplicateErrors` did not exist.

## GREEN verification

- `npm test -- src/trainingReview/detectors.test.ts` — 2 tests passed.
- `npm test -- src/trainingReview/deduplicateErrors.test.ts` — 3 tests passed.
- `npm test -- src/trainingReview/detectors.test.ts src/trainingReview/deduplicateErrors.test.ts src/domain/motion.test.ts` — 11 tests passed.
- `npm test` — 17 test files, 151 tests passed.
- `npm run build` — `tsc -b && vite build` exited successfully.
- `git diff --check` — passed.
