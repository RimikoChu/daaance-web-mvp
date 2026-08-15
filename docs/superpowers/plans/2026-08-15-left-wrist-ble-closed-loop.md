# Left-Wrist BLE Closed Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect one real `DAAANCE_LW` Pod to the existing Daaance motion pipeline, expose hardware diagnostics and commands, and close the training error-to-vibration loop while retaining three Mock Pods and the existing Demo flow.

**Architecture:** A stable App-owned `BluetoothPodClient` handles Web Bluetooth and publishes typed events. A buffered BLE source and a limb-routing Hybrid source adapt real left-wrist IMU into the existing `MotionDataSource`; React components consume snapshots and injected dependencies without owning Bluetooth handles.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, Web Bluetooth, UTF-8 JSON notifications.

## Global Constraints

- Phase one supports exactly one real `left_wrist` Pod named `DAAANCE_LW`; `right_wrist`, `left_ankle`, and `right_ankle` remain Mock.
- BLE UUIDs exist only in `src/hardware/ble/bleConfig.ts`; empty UUIDs produce `BLE protocol not configured` before opening a chooser.
- Commands are UTF-8 strings: `VIBRATE_SHORT`, `VIBRATE_LONG`, `START_COUNTDOWN`, `FEEDBACK_ERROR`, `STOP_ALL`.
- Malformed and unknown notifications never terminate later notification processing.
- Every BLE IMU sample preserves hardware `t` and web receive time.
- Countdown timeout is 8000ms and exposes only `Retry hardware` and `Start in Demo`; it never auto-starts Demo.
- `FEEDBACK_ERROR` is deduplicated by choreography/error event ID and guarded by a 1000ms cooldown.
- Do not redesign the orange-pink UI, rewrite motion recognition, add persistence, or remove the existing Demo flow.
- Do not serialize `BluetoothDevice` or other GATT objects.

---

## File Map

**Create**

- `src/hardware/ble/bleConfig.ts` — device name and all UUID configuration.
- `src/hardware/ble/bleTypes.ts` — Web Bluetooth boundary types, packet types, commands, client snapshots, and error codes.
- `src/hardware/ble/parseBlePacket.ts` — isolated tolerant UTF-8 JSON parser.
- `src/hardware/ble/parseBlePacket.test.ts` — parser validation and recovery tests.
- `src/hardware/ble/BluetoothPodClient.ts` — connection, discovery, notification, write, disconnect, and subscription lifecycle.
- `src/hardware/ble/BluetoothPodClient.test.ts` — mocked Web Bluetooth contract tests.
- `src/domain/bleMotionDataSource.ts` — left-wrist sample buffer with dual clocks.
- `src/domain/bleMotionDataSource.test.ts` — normalization and sample-window tests.
- `src/domain/hybridMotionDataSource.ts` — explicit limb routing between BLE and Mock.
- `src/domain/hybridMotionDataSource.test.ts` — routing and Demo-session tests.
- `src/hardware/HardwareTestPanel.tsx` — connection telemetry, live IMU, events, and command controls.
- `src/hardware/HardwareTestPanel.test.tsx` — status rendering and command mapping tests.
- `src/hardware/useLeftWristHardware.ts` — App-lifetime controller state and client event projection.
- `src/hardware/useLeftWristHardware.test.tsx` — lifecycle and truthfulness tests.
- `src/components/CountdownGate.tsx` — real-hardware countdown wait/retry/Demo choice.
- `src/components/CountdownGate.test.tsx` — success, timeout, retry, cleanup, and Demo-choice tests.
- `src/trainingFeedback.ts` — event deduplication and cooldown guard.
- `src/trainingFeedback.test.ts` — exact feedback suppression rules.

**Modify**

- `src/domain/types.ts` — add optional hardware and receive timestamps to normalized samples.
- `src/domain/mockMotionDataSource.ts` — keep only the Mock source; remove the placeholder BLE class.
- `src/components/PodConnectionPanel.tsx` — render and invoke App-owned left-wrist hardware state instead of owning Web Bluetooth.
- `src/components/PodConnectionPanel.test.tsx` — replace four-chooser tests with one-real-plus-three-Mock behavior.
- `src/components/Training.tsx` — accept injected source, autostart after countdown, analyze real left wrist, and send guarded feedback.
- `src/components/Training.test.tsx` — dependency injection, autostart, Hybrid analysis, and feedback behavior.
- `src/App.tsx` — create stable hardware controller/data sources, add Hardware Test, and coordinate Countdown Gate.
- `src/App.test.tsx` — full flow and Demo preservation tests.
- `src/styles.css` — minimal styles for hardware diagnostics and countdown choices using existing theme tokens.

---

### Task 1: Typed Protocol and Tolerant Packet Parser

**Files:**
- Create: `src/hardware/ble/bleConfig.ts`
- Create: `src/hardware/ble/bleTypes.ts`
- Create: `src/hardware/ble/parseBlePacket.ts`
- Test: `src/hardware/ble/parseBlePacket.test.ts`

**Interfaces:**
- Produces: `DAAANCE_BLE_CONFIG`, `DaaanceBleCommand`, `BluetoothPodPacket`, `BluetoothPodEvent`, `parseBlePacket(value, receivedAt)`.
- `parseBlePacket` returns `{ kind: 'event'; event } | { kind: 'ignored'; reason: 'malformed' | 'invalid' | 'unknown' }` and never throws.

- [ ] **Step 1: Write failing parser tests**

Cover exact `HELLO`, `IMU_DATA`, `BUTTON_SINGLE_CLICK`, and `COUNTDOWN_DONE` objects; assert that IMU output contains `hardwareTimestamp: 123456` and `receivedAt: 987.5`. Add malformed JSON, invalid numeric fields, wrong Pod, and unknown event tests. Finally call malformed then valid parsing sequentially and assert the valid result is still returned.

```ts
expect(parseBlePacket('{bad', 10)).toEqual({ kind: 'ignored', reason: 'malformed' })
expect(parseBlePacket(JSON.stringify({
  event: 'IMU_DATA', pod: 'left_wrist', t: 123456,
  ax: 0.12, ay: 0.35, az: 9.72, gx: 12.4, gy: 4.5, gz: 8.1,
}), 987.5)).toMatchObject({
  kind: 'event',
  event: { type: 'imu', hardwareTimestamp: 123456, receivedAt: 987.5 },
})
```

- [ ] **Step 2: Run RED**

Run: `npm test -- src/hardware/ble/parseBlePacket.test.ts`

Expected: FAIL because parser modules do not exist.

- [ ] **Step 3: Implement configuration, discriminated unions, and parser**

Define commands as a literal union and validate every required field with type guards. Decode only `left_wrist`. Log unknown event names once per notification using `console.debug('[Daaance BLE] Unknown event', name)`; malformed input stays silent.

- [ ] **Step 4: Run GREEN**

Run: `npm test -- src/hardware/ble/parseBlePacket.test.ts`

Expected: all parser tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hardware/ble
git commit -m "feat: define tolerant Daaance BLE protocol"
```

---

### Task 2: BluetoothPodClient Connection and Command Transport

**Files:**
- Create: `src/hardware/ble/BluetoothPodClient.ts`
- Test: `src/hardware/ble/BluetoothPodClient.test.ts`

**Interfaces:**
- Consumes: `DAAANCE_BLE_CONFIG`, `parseBlePacket`, `DaaanceBleCommand`, `BluetoothPodEvent`.
- Produces:

```ts
export interface BluetoothPodClientOptions {
  bluetooth?: BluetoothLike
  config?: DaaanceBleConfig
  now?: () => number
}

export class BluetoothPodClient {
  connect(): Promise<void>
  disconnect(): Promise<void>
  sendCommand(command: DaaanceBleCommand): Promise<void>
  subscribe(listener: (event: BluetoothPodEvent) => void): () => void
  getSnapshot(): BluetoothPodSnapshot
}
```

- [ ] **Step 1: Write failing configuration and support tests**

Assert empty UUIDs reject with code `protocol-not-configured` without calling `requestDevice`. Assert missing `bluetooth` rejects with the exact Chrome/Edge guidance and snapshot state `unsupported`.

- [ ] **Step 2: Run first RED**

Run: `npm test -- src/hardware/ble/BluetoothPodClient.test.ts`

Expected: FAIL because `BluetoothPodClient` does not exist.

- [ ] **Step 3: Implement validation and snapshot subscription**

Implement snapshot transitions `disconnected → connecting → connected/error/unsupported`, immutable `getSnapshot()`, and subscriber notification. Do not implement GATT discovery beyond what the tests require yet.

- [ ] **Step 4: Run first GREEN**

Run the focused client test and expect validation/support cases to pass.

- [ ] **Step 5: Write failing discovery and notification tests**

Use typed fakes for device, GATT server, service, TX, and RX. Assert:

```ts
expect(requestDevice).toHaveBeenCalledWith({
  filters: [{ name: 'DAAANCE_LW' }],
  optionalServices: ['service-uuid'],
})
expect(server.getPrimaryService).toHaveBeenCalledWith('service-uuid')
expect(service.getCharacteristic).toHaveBeenCalledWith('tx-uuid')
expect(service.getCharacteristic).toHaveBeenCalledWith('rx-uuid')
```

Dispatch one malformed notification then one valid IMU notification and assert the subscriber receives the valid event.

- [ ] **Step 6: Run second RED**

Expected: FAIL because discovery and notification behavior are absent.

- [ ] **Step 7: Implement connect, discovery, Notify, and unexpected disconnect cleanup**

Attach exactly one `characteristicvaluechanged` listener after `startNotifications()`. Attach `gattserverdisconnected` to the selected device. On failure or disconnect, remove both listeners, clear characteristic handles, and publish reconnect-ready state.

- [ ] **Step 8: Write failing command and explicit cleanup tests**

Assert `sendCommand('VIBRATE_SHORT')` writes `new TextEncoder().encode('VIBRATE_SHORT')`, uses `writeValueWithoutResponse` when present, falls back to `writeValue`, rejects while disconnected, and `disconnect()` is idempotent.

- [ ] **Step 9: Run third RED, implement writes, then run GREEN**

Run: `npm test -- src/hardware/ble/BluetoothPodClient.test.ts`

Expected: all client tests pass with no leaked listeners.

- [ ] **Step 10: Commit**

```bash
git add src/hardware/ble/BluetoothPodClient.ts src/hardware/ble/BluetoothPodClient.test.ts
git commit -m "feat: add left wrist Bluetooth client"
```

---

### Task 3: BLE and Hybrid Motion Sources

**Files:**
- Modify: `src/domain/types.ts`
- Modify: `src/domain/mockMotionDataSource.ts`
- Create: `src/domain/bleMotionDataSource.ts`
- Create: `src/domain/bleMotionDataSource.test.ts`
- Create: `src/domain/hybridMotionDataSource.ts`
- Create: `src/domain/hybridMotionDataSource.test.ts`

**Interfaces:**
- Extends `IMUSample` with optional `hardwareTimestamp?: number` and `receivedAt?: number`; extends `MotionDataSource.kind` to `'mock' | 'ble' | 'hybrid'`.
- Produces:

```ts
export class BLEMotionDataSource implements MotionDataSource {
  readonly kind = 'ble'
  addEvent(event: Extract<BluetoothPodEvent, { type: 'imu' }>): void
  startSession(receivedAt: number): void
  clear(): void
  getSamples(event: ChoreographyEvent): IMUSample[]
}

export class HybridMotionDataSource implements MotionDataSource {
  readonly kind = 'hybrid'
  constructor(ble: MotionDataSource, mock: MotionDataSource, useRealLeftWrist: () => boolean)
  getSamples(event: ChoreographyEvent): IMUSample[]
}
```

- [ ] **Step 1: Write failing BLE source tests**

Add two IMU events around a left-wrist choreography event and one outside its window. Assert returned normalized samples preserve hardware and receive timestamps and use the training-relative timestamp supplied by the source session clock.

- [ ] **Step 2: Run BLE source RED**

Run: `npm test -- src/domain/bleMotionDataSource.test.ts`

Expected: FAIL because the source does not exist.

- [ ] **Step 3: Implement bounded buffer and event-window reads**

Keep at most 30 seconds or 2000 samples. Add `startSession(receivedAt)` so normalized `timestamp` becomes `sample.receivedAt - sessionStartReceivedAt`; preserve the original two clock fields.

- [ ] **Step 4: Run BLE source GREEN**

Expected: BLE source tests pass.

- [ ] **Step 5: Write failing Hybrid routing tests**

Assert real-session left wrist calls BLE, other limbs call Mock, and `useRealLeftWrist() === false` routes every limb to Mock.

- [ ] **Step 6: Run Hybrid RED, implement routing, then run GREEN**

Run: `npm test -- src/domain/bleMotionDataSource.test.ts src/domain/hybridMotionDataSource.test.ts`

Expected: both suites pass.

- [ ] **Step 7: Remove the placeholder BLE class and run domain regression tests**

Run: `npm test -- src/domain`

Expected: all motion and datasource tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/domain
git commit -m "feat: route left wrist BLE motion samples"
```

---

### Task 4: Stable App-Level Hardware Controller and Truthful Pod UI

**Files:**
- Create: `src/hardware/useLeftWristHardware.ts`
- Create: `src/hardware/useLeftWristHardware.test.tsx`
- Modify: `src/components/PodConnectionPanel.tsx`
- Modify: `src/components/PodConnectionPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: one App-created `BluetoothPodClient` and `BLEMotionDataSource`.
- Produces `LeftWristHardwareController` with `snapshot`, `connect`, `disconnect`, `sendCommand`, `subscribeEvents`, `recentEvents`, and `latestImu`.
- `PodConnectionPanel` receives the controller and never calls `navigator.bluetooth` directly.

- [ ] **Step 1: Write failing controller lifecycle tests**

Render a harness that switches child screens while retaining the hook owner. Assert the same client remains subscribed, IMU events call `bleSource.addEvent`, and unmount unsubscribes once.

- [ ] **Step 2: Run controller RED**

Expected: FAIL because the controller hook does not exist.

- [ ] **Step 3: Implement App-lifetime state projection**

Project HELLO firmware, latest IMU, last packet time, rolling one-second Hz, recent button/countdown events, and connection errors. Do not store raw Bluetooth objects in React state.

- [ ] **Step 4: Run controller GREEN**

Expected: lifecycle and telemetry tests pass.

- [ ] **Step 5: Replace Pod tests with one-real-plus-three-Mock RED cases**

Assert the UI initially shows left wrist `Real hardware / Not connected` and the other three `Demo`. Assert protocol-not-configured, unsupported, cancellation, and discovery failure never render `Connected`. Assert successful client state renders device name, `Connected`, and measured Hz.

- [ ] **Step 6: Run Pod RED**

Run: `npm test -- src/components/PodConnectionPanel.test.tsx src/App.test.tsx`

Expected: FAIL because the panel still owns the four-device loop.

- [ ] **Step 7: Refactor PodConnectionPanel and App ownership**

Replace the `connectPods()` loop with a single `controller.connect()` action. Keep the orange-pink composition and compact status placement. Rename the action to `Connect DAAANCE_LW`; expose `Continue in Demo` separately so Demo is intentional.

- [ ] **Step 8: Run Pod/App GREEN**

Expected: truthful status tests and existing home navigation tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/hardware/useLeftWristHardware.ts src/hardware/useLeftWristHardware.test.tsx src/components/PodConnectionPanel.tsx src/components/PodConnectionPanel.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat: persist left wrist hardware state"
```

---

### Task 5: Hardware Test Diagnostic Area

**Files:**
- Create: `src/hardware/HardwareTestPanel.tsx`
- Create: `src/hardware/HardwareTestPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `LeftWristHardwareController`.
- Sends exact `DaaanceBleCommand` values through `controller.sendCommand`.

- [ ] **Step 1: Write failing Hardware Test rendering tests**

Assert device name, state, firmware, last packet time, `49.8 Hz`, six numeric IMU fields, and recent `BUTTON_SINGLE_CLICK` / `COUNTDOWN_DONE` entries render from a connected snapshot.

- [ ] **Step 2: Run rendering RED**

Run: `npm test -- src/hardware/HardwareTestPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement diagnostic rendering**

Use semantic sections and a definition list; format IMU values to two decimals and Hz to one decimal. Render the exact unsupported and protocol-not-configured messages from controller state.

- [ ] **Step 4: Write failing command mapping tests**

Click the five controls and assert calls in order:

```ts
['VIBRATE_SHORT', 'VIBRATE_LONG', 'FEEDBACK_ERROR', 'START_COUNTDOWN', 'STOP_ALL']
```

Assert controls are disabled unless state is `connected`.

- [ ] **Step 5: Run command RED, implement controls, then run GREEN**

Run the focused test and expect all Hardware Test cases to pass.

- [ ] **Step 6: Mount on Setup and style with existing tokens**

Place the panel after `.setup-note` and before Start. Add only `.hardware-test`, `.hardware-live-grid`, `.hardware-controls`, and `.hardware-events` rules using `--soft-orange`, `--glass-surface`, `--glass-line`, and existing radii/shadows.

- [ ] **Step 7: Run App and Hardware Test suites**

Run: `npm test -- src/App.test.tsx src/hardware/HardwareTestPanel.test.tsx`

Expected: both suites pass without changing existing mode controls.

- [ ] **Step 8: Commit**

```bash
git add src/hardware/HardwareTestPanel.tsx src/hardware/HardwareTestPanel.test.tsx src/App.tsx src/styles.css
git commit -m "feat: add left wrist hardware test panel"
```

---

### Task 6: Countdown Gate and Explicit Demo Fallback

**Files:**
- Create: `src/components/CountdownGate.tsx`
- Create: `src/components/CountdownGate.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: connection state, `sendCommand`, and typed hardware event subscription.
- Produces `onHardwareReady()` and `onStartDemo()` outcomes; owns and cleans one 8000ms timeout per attempt.

- [ ] **Step 1: Write failing success-path test**

With fake timers, click Start while connected. Assert `START_COUNTDOWN` is sent once, training is not rendered yet, then emit `COUNTDOWN_DONE` and assert training opens with `autoStart` enabled.

- [ ] **Step 2: Run success RED**

Run: `npm test -- src/components/CountdownGate.test.tsx src/App.test.tsx`

Expected: FAIL because Start opens training immediately.

- [ ] **Step 3: Implement waiting gate and event completion**

Subscribe before sending the command. Clear the subscription and timer before calling the completion callback.

- [ ] **Step 4: Write failing timeout and retry tests**

Advance exactly 8000ms. Assert no training, exact `Retry hardware` and `Start in Demo` buttons, and no automatic callback. Click Retry and assert a second `START_COUNTDOWN`; click Start in Demo and assert training receives the all-Mock source.

- [ ] **Step 5: Run timeout RED, implement choices, then run GREEN**

Expected: success, timeout, retry, and explicit Demo cases pass.

- [ ] **Step 6: Add cleanup regression test**

Unmount while waiting, advance timers, emit countdown, and assert no callback or state update occurs.

- [ ] **Step 7: Run full gate/App GREEN**

Run: `npm test -- src/components/CountdownGate.test.tsx src/App.test.tsx`

- [ ] **Step 8: Commit**

```bash
git add src/components/CountdownGate.tsx src/components/CountdownGate.test.tsx src/App.tsx src/App.test.tsx src/styles.css
git commit -m "feat: gate training on hardware countdown"
```

---

### Task 7: Inject Hybrid Source and Close Error-to-Vibration Loop

**Files:**
- Create: `src/trainingFeedback.ts`
- Create: `src/trainingFeedback.test.ts`
- Modify: `src/components/Training.tsx`
- Modify: `src/components/Training.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- `TrainingProps` gains `source: MotionDataSource`, `autoStart?: boolean`, and `onFeedbackError?: (eventId: string) => Promise<void> | void`.
- Produces:

```ts
export function createFeedbackGuard(options: {
  cooldownMs: number
  now: () => number
  send: (eventId: string) => void | Promise<void>
}): { report(eventId: string): Promise<boolean>; reset(): void }
```

- [ ] **Step 1: Write failing feedback guard tests**

Assert the first event sends, the same event never sends twice, a different event inside 999ms is suppressed, and a different event at 1000ms sends. Assert a rejected send does not throw through `report`.

- [ ] **Step 2: Run guard RED**

Run: `npm test -- src/trainingFeedback.test.ts`

Expected: FAIL because the guard does not exist.

- [ ] **Step 3: Implement the minimal guard and run GREEN**

Record event IDs before awaiting the command to prevent concurrent duplicates. Update the cooldown timestamp only when a send attempt begins.

- [ ] **Step 4: Write failing Training injection tests**

Provide a fake `MotionDataSource`; finish the video and assert the source is queried for all choreography events instead of a locally constructed Mock source. With `autoStart`, assert the video play method is called after metadata is available.

- [ ] **Step 5: Run injection RED, remove fixed Mock construction, then run GREEN**

Run: `npm test -- src/components/Training.test.tsx`

- [ ] **Step 6: Write failing left-wrist feedback integration tests**

Return an incorrect left-wrist sample and correct Mock samples for other limbs. Assert the timing result is retained and `onFeedbackError(event.id)` fires once for that error. Re-run analysis/time updates and assert no duplicate call.

- [ ] **Step 7: Implement analysis feedback integration**

Analyze each choreography event once per training run, persist results by event ID, and report only non-correct left-wrist results through the guard. Do not emit feedback per IMU notification.

- [ ] **Step 8: Wire App command callback**

For real sessions, map guarded feedback to `controller.sendCommand('FEEDBACK_ERROR')`. For Demo sessions, use a no-op callback. Command rejection must not remove the result.

- [ ] **Step 9: Run Training/App GREEN**

Run: `npm test -- src/trainingFeedback.test.ts src/components/Training.test.tsx src/App.test.tsx`

Expected: injection, autostart, analysis, deduplication, cooldown, and existing playback tests all pass.

- [ ] **Step 10: Commit**

```bash
git add src/trainingFeedback.ts src/trainingFeedback.test.ts src/components/Training.tsx src/components/Training.test.tsx src/App.tsx
git commit -m "feat: send guarded hardware error feedback"
```

---

### Task 8: End-to-End Regression, Browser Check, and Release Readiness

**Files:**
- Modify only files required by failures discovered in this task.

**Interfaces:**
- Verifies the complete specified behavior; introduces no new architecture.

- [ ] **Step 1: Add one full-flow App regression test**

Drive: connect successful `DAAANCE_LW` → HELLO + IMU notifications → Setup Hardware Test Short vibration → Start → COUNTDOWN_DONE → video starts → incorrect left-wrist result → `FEEDBACK_ERROR`. Assert the three other Pod labels remain `Demo` throughout.

- [ ] **Step 2: Run the full-flow acceptance test**

Run: `npm test -- src/App.test.tsx`

Expected: PASS if Tasks 1–7 are correctly integrated. If it fails, stop at the first broken boundary, add a focused failing regression beside that boundary's unit tests, apply the smallest repair there, then rerun this App test.

- [ ] **Step 3: Run the complete suite**

Run: `npm test`

Expected: every test file passes with zero failures.

- [ ] **Step 4: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite succeed; output includes `demo-dance-*.mp4` and `soft-glass-background-*.jpg`.

- [ ] **Step 5: Verify the physical-debug UI locally**

Run: `npm run dev -- --host 127.0.0.1` and inspect in Chrome/Edge:

- UUIDs empty → `BLE protocol not configured` and no chooser.
- With UUIDs populated → chooser filters exact `DAAANCE_LW`.
- Successful connection → left wrist Real/Connected and three Demo Pods.
- Hardware Test values update; Hz trends toward 50.
- Short vibration button sends the exact command.
- Countdown timeout shows only Retry hardware and Start in Demo.

- [ ] **Step 6: Review the final diff against the spec**

Run:

```bash
git diff --check
git status --short
rg -n "serviceUuid|txCharacteristicUuid|rxCharacteristicUuid" src
```

Expected: no whitespace errors; UUID values are defined only in `bleConfig.ts` and referenced through the config object elsewhere.

- [ ] **Step 7: Commit integration fixes**

```bash
git add src
git commit -m "test: verify left wrist BLE closed loop"
```

- [ ] **Step 8: Prepare the completion report**

Report changed/new files, exact UUID location, connect and Hardware Test locations, measured-Hz interpretation, Short vibration procedure, automatic error-feedback procedure, confirmation of three Mock Pods, full test count, and final build output. Do not claim physical vibration was verified unless a configured real device was actually connected during the run.
