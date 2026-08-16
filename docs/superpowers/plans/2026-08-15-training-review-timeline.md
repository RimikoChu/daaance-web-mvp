# Daaance Training Review Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build continuous four-limb training telemetry, deduplicated standardized error events, hardware feedback acknowledgements, an interactive video review timeline, an in-page report, and secondary JSON export.

**Architecture:** Add an append-only serializable `TrainingSessionLedger` between detectors and presentation. `MotionErrorDetector` implementations emit honest standardized events: Demo emits deterministic Timing/Direction/Range fixtures, while real IMU currently emits Timing only. Timeline markers, review ranges, command/ACK status, report statistics, and JSON export are pure derivations of the ledger.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Web Bluetooth, CSS.

## Global Constraints

- Preserve BLE v0.1 device names, Pod IDs, UUIDs, directions, commands, and existing events exactly.
- Add `FEEDBACK_EXECUTED` only as an optional Pod-to-Web Notify event on `POD_TX_UUID`; do not add a STATUS UUID.
- Do not fake `navigator.bluetooth` in production or serialize `BluetoothDevice`.
- Demo and real IMU remain explicitly separated in UI and data.
- Demo may emit Timing, Direction, and Range with `source: 'demo'`; current real IMU emits Timing only with `source: 'imu'`.
- Raw 50 Hz frames never count directly as independent errors.
- Keep `REVIEW_CLUSTER_WINDOW_MS = 2000`, `REVIEW_CLUSTER_MIN_ERRORS = 2`, `REVIEW_CLUSTER_STRONG_ERRORS = 3`, and `REVIEW_SEEK_PREROLL_MS = 1000` in one constants file.
- Keep existing error-event deduplication and approximately 1000 ms feedback cooldown.
- No PDF, cloud storage, database, accounts, camera detector, or new real Direction/Range algorithm.
- Preserve the existing BLE/Mock separation, countdown gate, 18.66-second video, teaching/follow modes, ±5-second controls, and Safari poster behavior.
- Mark physical LED, vibration, ACK timing, and real 50 Hz checks as `HARDWARE VERIFICATION REQUIRED`.

## File map

- `src/trainingReview/types.ts`: serializable session/error/feedback/review-range types.
- `src/trainingReview/constants.ts`: review clustering and seek thresholds.
- `src/trainingReview/ledger.ts`: append-only ledger and JSON snapshot.
- `src/trainingReview/deduplicateErrors.ts`: sustained-error identity filtering.
- `src/trainingReview/clusterReviewRanges.ts`: pure range derivation.
- `src/trainingReview/detectors.ts`: detector interface plus Demo and IMU Timing implementations.
- `src/trainingReview/report.ts`: report statistics and feedback correlation.
- `src/components/TrainingTimeline.tsx`: timeline markers, ranges, and navigation controls.
- `src/components/TrainingReport.tsx`: primary in-page review report and secondary JSON download.
- Existing BLE files parse and propagate the optional v0.2 acknowledgement.
- Existing data sources expose continuous limb samples without changing provenance.
- `Training.tsx` orchestrates playback/detection/ledger writes; `App.tsx` owns the completed session snapshot.

---

### Task 1: Serializable ledger and review-range derivation

**Files:**
- Create: `src/trainingReview/types.ts`
- Create: `src/trainingReview/constants.ts`
- Create: `src/trainingReview/ledger.ts`
- Create: `src/trainingReview/clusterReviewRanges.ts`
- Test: `src/trainingReview/ledger.test.ts`
- Test: `src/trainingReview/clusterReviewRanges.test.ts`

**Interfaces:**
- Produces: `MotionErrorEvent`, `FeedbackCommandEvent`, `FeedbackExecutionEvent`, `ReviewRange`, `TrainingSessionSnapshot`.
- Produces: `createTrainingSessionLedger(sessionId, startedAt)` with `appendError`, `appendCommand`, `appendExecution`, and `snapshot`.
- Produces: `clusterReviewRanges(errors): ReviewRange[]`.

- [ ] **Step 1: Write failing ledger tests**

Test that append methods preserve insertion data, return immutable snapshots, reject duplicate stable IDs, and produce JSON containing no functions or browser objects.

```ts
const ledger = createTrainingSessionLedger('session-1', 1000)
ledger.appendError({
  id: 'error-1', timestamp: 2400, receivedAt: 3400,
  limb: 'left_wrist', type: 'timing', severity: 'medium',
  source: 'imu', detector: 'imu-timing-v1',
})
expect(ledger.snapshot().errors).toHaveLength(1)
expect(JSON.parse(JSON.stringify(ledger.snapshot())).errors[0].id).toBe('error-1')
```

- [ ] **Step 2: Run ledger tests and verify RED**

Run: `npm test -- src/trainingReview/ledger.test.ts`

Expected: FAIL because the ledger modules do not exist.

- [ ] **Step 3: Implement types, constants, and append-only ledger**

Use Pod IDs (`left_wrist`, `right_wrist`, `left_ankle`, `right_ankle`) in review records and `schemaVersion: '1.0.0'` in snapshots. Return copied arrays from `snapshot()` so callers cannot mutate ledger state.

- [ ] **Step 4: Write failing clustering tests**

Cover one ordinary event, two events in exactly 2000 ms, three-event strong emphasis, more than 2000 ms separation, overlapping ranges on different limbs, and preservation of original event IDs.

```ts
expect(clusterReviewRanges([error('e1', 1000), error('e2', 3000)]))
  .toMatchObject([{ limb: 'left_wrist', start: 1000, end: 3000, emphasis: 'standard' }])
```

- [ ] **Step 5: Run clustering tests and verify RED**

Run: `npm test -- src/trainingReview/clusterReviewRanges.test.ts`

Expected: FAIL because clustering is not implemented.

- [ ] **Step 6: Implement deterministic per-limb clustering**

Sort a copy by timestamp, cluster only events with the same limb whose rolling range remains inside `REVIEW_CLUSTER_WINDOW_MS`, emit ranges only at the minimum count, and set `emphasis: 'strong'` at three or more events.

- [ ] **Step 7: Verify and commit**

Run: `npm test -- src/trainingReview/ledger.test.ts src/trainingReview/clusterReviewRanges.test.ts`

Commit: `feat: add training session event ledger`

---

### Task 2: Optional hardware feedback execution acknowledgement

**Files:**
- Modify: `src/hardware/ble/bleTypes.ts`
- Modify: `src/hardware/ble/parseBlePacket.ts`
- Modify: `src/hardware/ble/parseBlePacket.test.ts`
- Modify: `src/hardware/useLeftWristHardware.ts`
- Modify: `src/hardware/useLeftWristHardware.test.tsx`
- Create: `docs/ble/DAAANCE_BLE_PROTOCOL_NAMING_v0.2.md`

**Interfaces:**
- Produces packet event `feedback-executed` with `pod`, `hardwareTimestamp`, `receivedAt`, `feedback: 'ERROR'`, and `outputs`.
- Existing `subscribeEvents` delivers the acknowledgement without treating it as IMU or a button/countdown event.

- [ ] **Step 1: Write exact parser RED tests**

Use the exact payload:

```json
{"event":"FEEDBACK_EXECUTED","pod":"left_wrist","t":123456,"feedback":"ERROR","outputs":["LED","VIBRATION"]}
```

Assert exact conversion, reject missing/invalid fields, reject unsupported outputs, tolerate malformed JSON, and continue parsing a valid packet after a bad one.

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npm test -- src/hardware/ble/parseBlePacket.test.ts`

Expected: FAIL because `FEEDBACK_EXECUTED` is unknown.

- [ ] **Step 3: Implement the optional packet and event**

Keep every v0.1 name unchanged. Validate `feedback === 'ERROR'`, non-empty outputs, and outputs limited to `LED | VIBRATION`. Map `t` to `hardwareTimestamp` and capture `receivedAt` separately.

- [ ] **Step 4: Test controller propagation**

Add a hook test that subscribes through `subscribeEvents`, injects an acknowledgement, and proves it reaches the listener without changing `latestImu`, firmware, or recent button/countdown history.

- [ ] **Step 5: Document v0.2 without rewriting v0.1**

Keep the v0.1 document as the frozen baseline and add a v0.2 document containing only the optional event extension, compatibility rule, and exact direction (`POD_TX_UUID`, Pod to Web Notify).

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/hardware/ble/parseBlePacket.test.ts src/hardware/useLeftWristHardware.test.tsx`

Commit: `feat: record hardware feedback acknowledgements`

---

### Task 3: Detector boundary and independent-error deduplication

**Files:**
- Create: `src/trainingReview/detectors.ts`
- Create: `src/trainingReview/deduplicateErrors.ts`
- Test: `src/trainingReview/detectors.test.ts`
- Test: `src/trainingReview/deduplicateErrors.test.ts`
- Modify: `src/domain/motion.ts`
- Modify: `src/domain/types.ts`

**Interfaces:**
- Produces: `MotionErrorDetector.detect(input): MotionErrorEvent[]`.
- Produces: `createDemoDetector()` and `createImuTimingDetector(strictness)`.
- Produces: `createErrorDeduplicator({ sustainedWindowMs })` with `accept(event): boolean` and `reset()`.

- [ ] **Step 1: Write detector contract RED tests**

Assert the deterministic Demo detector emits Timing, Direction, and Range events with `source: 'demo'`; assert the IMU detector emits only Timing with `source: 'imu'` and reuses the existing `analyzeTiming` result rather than inventing Direction/Range.

- [ ] **Step 2: Run detector tests and verify RED**

Run: `npm test -- src/trainingReview/detectors.test.ts`

Expected: FAIL because the detector interface and implementations do not exist.

- [ ] **Step 3: Implement minimal honest detectors**

Convert non-correct `TimingResult` values to severity using centralized timing-error bands. Give Demo events deterministic IDs tied to choreography IDs and use explicit detector names (`demo-review-v1`, `imu-timing-v1`).

- [ ] **Step 4: Write 50 Hz deduplication RED tests**

Feed repeated events for the same logical detector identity across consecutive frames and assert only one is accepted. Assert a different limb, type, detector identity, or later independent window is accepted.

- [ ] **Step 5: Implement identity-first deduplication**

Use a stable key derived from detector, limb, type, and `details.logicalErrorId` when present; otherwise use the sustained window. Do not change the original event and do not deduplicate different limbs in an overlapping time range.

- [ ] **Step 6: Verify and commit**

Run: `npm test -- src/trainingReview/detectors.test.ts src/trainingReview/deduplicateErrors.test.ts src/domain/motion.test.ts`

Commit: `feat: standardize motion error detection`

---

### Task 4: Continuous four-limb Mock and Hybrid telemetry

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/mockMotionDataSource.ts`
- Modify: `src/domain/hybridMotionDataSource.ts`
- Modify: `src/domain/bleMotionDataSource.ts`
- Modify: `src/domain/mockMotionDataSource.test.ts`
- Modify: `src/domain/hybridMotionDataSource.test.ts`
- Modify: `src/domain/bleMotionDataSource.test.ts`

**Interfaces:**
- Extend `MotionDataSource` with `getSamplesForWindow(startMs, endMs): IMUSample[]` while retaining event-scoped `getSamples(event)` during migration.
- Demo returns all four limbs for a playback window.
- Hybrid returns BLE left wrist plus Mock right wrist/left ankle/right ankle; it never substitutes Mock left wrist after a real-session disconnect.

- [ ] **Step 1: Write continuous-source RED tests**

Assert a Demo playback window contains samples for all four limbs and each limb has multiple samples. Assert Hybrid contains BLE left-wrist timestamps and Mock samples for exactly the other three limbs.

- [ ] **Step 2: Run source tests and verify RED**

Run: `npm test -- src/domain/mockMotionDataSource.test.ts src/domain/hybridMotionDataSource.test.ts src/domain/bleMotionDataSource.test.ts`

Expected: FAIL because continuous-window reads do not exist.

- [ ] **Step 3: Implement windowed reads without fake BLE**

Generate deterministic continuous Mock samples from time and limb-specific phase offsets. BLE window reads only buffered real packets. Hybrid concatenates BLE left wrist and filtered non-left Mock samples. Keep hardware and received timestamps on BLE samples.

- [ ] **Step 4: Preserve choreography focus semantics**

Keep `getSamples(event)` as a filtered compatibility adapter used by timing analysis. The data stream contains four moving limbs; the choreography still identifies one focus limb per beat.

- [ ] **Step 5: Verify and commit**

Run the three source test files plus `src/domain/motion.test.ts`.

Commit: `feat: stream continuous four limb motion data`

---

### Task 5: Feedback command audit and ACK correlation

**Files:**
- Modify: `src/trainingFeedback.ts`
- Modify: `src/trainingFeedback.test.ts`
- Create: `src/trainingReview/feedbackCorrelation.ts`
- Test: `src/trainingReview/feedbackCorrelation.test.ts`
- Modify: `src/hardware/useLeftWristHardware.ts`
- Modify: `src/hardware/useLeftWristHardware.test.tsx`
- Modify: `src/hardware/HardwareTestPanel.tsx`
- Modify: `src/hardware/HardwareTestPanel.test.tsx`

**Interfaces:**
- Extend `createFeedbackGuard` so `report(errorEvent)` returns a `FeedbackCommandEvent | undefined` while preserving identity deduplication and cooldown.
- Produce `correlateFeedback(errors, commands, executions)` for report rows and latency.
- Keep the existing App-level BLE adapter as the sole real-hardware owner and expose a bounded raw event log plus command-attempt records for the development Hardware Debug panel.

- [ ] **Step 1: Write command-audit RED tests**

Assert one accepted error produces one command record with `sentAt` and `status: 'sent'`; a rejected write produces `status: 'failed'` and a reason; duplicate identity and cooldown-suppressed errors produce no command record.

- [ ] **Step 2: Run feedback tests and verify RED**

Run: `npm test -- src/trainingFeedback.test.ts`

Expected: FAIL because the guard currently returns only a boolean and swallows failure details.

- [ ] **Step 3: Implement audited feedback without weakening cooldown**

Preserve best-effort training analysis while returning a serializable record for every attempted write. Do not mark an execution as successful merely because the write resolved.

- [ ] **Step 4: Write and implement correlation tests**

Match an ACK to the closest preceding sent command for the same Pod inside a bounded correlation window. Compute `receivedAt - sentAt`; represent absent ACK as `execution-unconfirmed`; keep duplicate/out-of-order ACK handling deterministic.

- [ ] **Step 5: Verify and commit**

Before committing, extend the existing Hardware Test panel (development UI only) with Connect/Disconnect `DAAANCE_LW`, truthful connection state, live IMU, `BUTTON_SINGLE_CLICK`, the existing five commands, `FEEDBACK_EXECUTED`, unique `commandId`, sent/ACK timestamps, latency when correlated, and a bounded raw BLE event log. Keep all protocol names exact and leave the other three Pods explicitly Mock. Do not add RGB, press/release, STATUS UUID, or component-owned Bluetooth code.

Run: `npm test -- src/trainingFeedback.test.ts src/trainingReview/feedbackCorrelation.test.ts`

Commit: `feat: audit hardware feedback delivery`

---

### Task 6: Interactive error timeline and navigation

**Files:**
- Create: `src/components/TrainingTimeline.tsx`
- Test: `src/components/TrainingTimeline.test.tsx`
- Modify: `src/components/Training.tsx`
- Modify: `src/components/Training.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- `TrainingTimeline({ duration, currentTime, errors, ranges, onSeek })`.
- `onSeek(seconds)` seeks the shared video and pauses.

- [ ] **Step 1: Write timeline RED tests**

Assert ordinary point markers, standard and strong continuous ranges, accessible labels, chronological previous/next navigation, one-second preroll, zero clamp, duration clamp, and pause-before-seek behavior.

- [ ] **Step 2: Run timeline tests and verify RED**

Run: `npm test -- src/components/TrainingTimeline.test.tsx src/components/Training.test.tsx`

Expected: FAIL because the review timeline is absent.

- [ ] **Step 3: Implement the timeline presentation**

Position markers and ranges by percentage of duration. Use buttons for markers, `aria-label` values containing limb/type/severity/time/source, and non-interactive range backgrounds with an accessible jump button.

- [ ] **Step 4: Integrate shared-video seeking**

In `Training`, pause the video, compute `max(0, targetMs - REVIEW_SEEK_PREROLL_MS) / 1000`, clamp through the existing playback helper, update current time and teaching segment, then pass the callback to the timeline.

- [ ] **Step 5: Make Pod status truthful**

While playing, show all four Pods as `采集中`. Show the choreography limb separately as `本拍重点`; never use `动作中` to imply only one limb is moving. Preserve `Real hardware`, `Demo`, and disconnected/error provenance labels.

- [ ] **Step 6: Verify responsive styling and commit**

Run focused tests, visually check desktop and mobile with long labels, then commit.

Commit: `feat: add interactive training error timeline`

---

### Task 7: In-page report and secondary JSON export

**Files:**
- Create: `src/trainingReview/report.ts`
- Test: `src/trainingReview/report.test.ts`
- Create: `src/components/TrainingReport.tsx`
- Test: `src/components/TrainingReport.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `buildTrainingReport(snapshot)` with total errors/ranges, per-limb counts, per-type counts, ordered rows, command/ACK state, and latency.
- `TrainingReport({ snapshot, onReviewTime, onAgain, onHome })`.

- [ ] **Step 1: Write pure report RED tests**

Use mixed limbs/types/sources and command states. Assert totals, separate overlapping limb ranges, ordered rows, `Demo-generated`, `IMU-detected`, `execution-unconfirmed`, failed writes, executed outputs, and latency.

- [ ] **Step 2: Implement report derivation**

Build all statistics from the immutable session snapshot and `clusterReviewRanges`; do not store duplicate counters in React state.

- [ ] **Step 3: Write component RED tests**

Assert the four limb sections, three type categories, total errors, review-range count, row metadata, direct review buttons, and a visually secondary `导出 JSON` action.

- [ ] **Step 4: Implement report and safe download**

Create a Blob from `JSON.stringify(snapshot, null, 2)`, generate an object URL only on click, click a temporary download anchor named `daaance-session-<sessionId>.json`, and revoke the URL. Never include the Bluetooth client/device.

- [ ] **Step 5: Integrate report navigation**

Store the completed snapshot in `App`. A report row's review action returns to Training in review mode at the selected timestamp, using the same explicit source provenance and without rerunning countdown.

- [ ] **Step 6: Verify and commit**

Run report, component, and App tests.

Commit: `feat: add in-page training review report`

---

### Task 8: Full closed-loop integration and final verification

**Files:**
- Modify: `src/components/Training.tsx`
- Modify: `src/components/Training.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Update: `docs/superpowers/specs/2026-08-15-training-review-timeline-design.md` only if implementation reveals a reviewed clarification, never to weaken requirements.

**Interfaces:**
- Completed Training returns `TrainingSessionSnapshot` rather than a bare `TimingResult[]`.
- App subscribes to `feedback-executed` during the active real session and appends it to that session's ledger.

- [ ] **Step 1: Write end-to-end RED tests**

Cover a full Demo session producing all three error types and four-limb streaming, timeline markers/ranges, navigation, report statistics, and JSON. Cover a Hybrid session that records BLE Timing only for left wrist, Mock events for the other limbs, one `FEEDBACK_ERROR` command, one execution ACK, and measured latency.

- [ ] **Step 2: Run App integration tests and verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: FAIL until the ledger is wired through Training and Results.

- [ ] **Step 3: Implement lifecycle and cleanup**

Create one ledger per training attempt, reset detector/deduplicator/feedback guard on restart, subscribe to hardware ACKs only while the real session is active, unsubscribe on exit/unmount, and freeze the snapshot on completion.

- [ ] **Step 4: Preserve existing flows**

Re-run tests for countdown timeout choices, explicit Demo fallback, command write failures, unexpected disconnect, Hardware Test, video duration, Safari poster, teaching/follow mode, segment boundaries, and ±5 seconds.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run build
git diff --check
```

Expected: all tests pass, TypeScript/Vite build succeeds, the MP4 and poster appear in `dist/assets`, and the worktree contains only intended changes.

- [ ] **Step 6: Browser verification**

Verify desktop and mobile Demo flow: four active Pod streams, focus indicator, ordinary markers, strong/standard ranges, click-to-pause/preroll, previous/next, report counts, source labels, and JSON action. Verify unsupported Web Bluetooth remains non-fatal.

- [ ] **Step 7: Final review and commit**

Request a whole-branch review against the approved spec. Fix Critical/Important findings with focused regression tests, rerun full verification, then commit:

`feat: add training review timeline and report`

Document these remaining checks as `HARDWARE VERIFICATION REQUIRED`: physical LED execution, vibration execution, firmware ACK timestamp, command-to-ACK latency, and real approximately 50 Hz IMU behavior.
