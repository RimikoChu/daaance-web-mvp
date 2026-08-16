# Task 4 report: Continuous four-limb Mock and Hybrid telemetry

## Status

Complete

## Behavioral guarantees

- `MotionDataSource` now exposes `getSamplesForWindow(startMs, endMs)` while
  retaining event-scoped `getSamples(event)` as the choreography-focus adapter.
- Mock produces deterministic 50 Hz baseline samples for all four limbs,
  incorporating limb-specific phase offsets. Existing deterministic focus peaks
  remain present for timing analysis.
- BLE window reads return only buffered real left-wrist packets, preserving both
  hardware and web-receive timestamps.
- Hybrid always uses real buffered BLE left-wrist data and filters Mock output
  to the other three limbs. Demo selects the standalone Mock source, so a later
  real-session disconnect cannot substitute Mock left-wrist data.

## RED evidence

`npm test -- src/domain/mockMotionDataSource.test.ts src/domain/hybridMotionDataSource.test.ts src/domain/bleMotionDataSource.test.ts`
failed before implementation because all three sources lacked
`getSamplesForWindow`.

The choreography-focus peak regression tests also failed against the first
continuous waveform because its baseline peaks replaced the established
choreography focus peaks. The final Mock stream retains those focus peaks while
keeping all limbs continuously sampled.

## GREEN verification

- Focused source and motion suite: 4 files, 29 tests passed.
- Source plus App integration suite: 5 files, 50 tests passed.
- Full suite: 18 files, 168 tests passed.
- `npm run build`: `tsc -b && vite build` exited successfully.
- `git diff --check`: passed.

## Scope note

The pre-existing modifications to the training-review plan and design spec were
left uncommitted and excluded from the Task 4 commit.

## Review round 1

Two P2 findings were reproduced with RED tests and fixed:

- Hybrid now filters windowed BLE output to `LEFT_WRIST` defensively before it
  is combined with the three Mock limbs. An adversarial BLE test injects a
  right-wrist hardware sample and proves it is excluded; an empty BLE window
  test proves no Mock left wrist appears.
- Mock now sorts its merged baseline and choreography-focus samples by timestamp
  before returning a window. A window containing the `c1` focus peak verifies
  chronological order (`1900`, `1910`, `1920`).

### Verification

- Focused source and motion suite: 4 files, 36 tests passed.
- Full suite: 18 files, 171 tests passed.
- `npm run build`: `tsc -b && vite build` exited successfully.
- `git diff --check`: passed.
