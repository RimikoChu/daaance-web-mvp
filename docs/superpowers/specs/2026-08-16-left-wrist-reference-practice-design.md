# Left-Wrist Reference Practice Design

## Goal

Deliver one reliable live demo loop using only the real `left_wrist` Pod:

`Record Reference → Start Practice → compare live motion → PASS / MOTION ERROR → BLE LED/vibration feedback`

## Frozen Scope

- One real Pod only: `left_wrist` / `DAAANCE_LW`.
- Reuse the existing BLE UUIDs and newline-delimited JSON receive path.
- Accept firmware Pod ID `LW` and normalize it internally to `left_wrist`.
- Record every real six-axis IMU sample received during the reference video.
- Keep the reference only in page memory. Refreshing the page clears it.
- Compare Reference and Practice with 400ms windows aligned by `video.currentTime`.
- Expose only `PASS` and `Motion Error — Left Wrist`.
- Show measured IMU samples per second and a visible warning below 20Hz.
- Use existing firmware commands only:
  - Motion error: `LED_RED`, then `VIBRATE_SHORT`.
  - Match/recovery: `LED_GREEN`.
- Apply an 800ms error-feedback cooldown.

The demo does not add or use four-Pod orchestration, Mock Pods, Hybrid routing, Camera Pose, AI/ML, or Timing/Direction/Range classification. Existing legacy flows remain intact but are not dependencies of this demo loop.

## Existing Code Reuse

- `src/hardware/ble/BluetoothPodClient.ts`: device selection, GATT discovery, notification framing, writes, disconnect cleanup.
- `src/hardware/ble/parseBlePacket.ts`: tolerant JSON parsing and `LW → left_wrist` normalization.
- `src/hardware/useLeftWristHardware.ts`: App-level connection state, IMU event subscription, live sample-rate measurement.
- `src/assets/demo-dance.mp4` and `src/assets/demo-dance-poster.png`: the 18.66-second shared video.
- Existing `training-page`, video, control, and status styles: presentation remains visually consistent.

## Data Model

```ts
export interface ReferenceMotionSample {
  videoTimeMs: number
  hardwareTimestamp: number
  receivedAt: number
  ax: number
  ay: number
  az: number
  gx: number
  gy: number
  gz: number
}
```

Every accepted `left_wrist` IMU notification becomes one sample. No key-frame reduction is allowed.

## Comparison Algorithm

For each 400ms Reference/Practice window, calculate:

- acceleration magnitude RMS;
- gyroscope magnitude RMS;
- acceleration magnitude mean and variation;
- gyroscope magnitude mean and variation;
- combined movement intensity.

Feature differences are normalized against configurable floors so quiet windows do not create unstable ratios. A window is anomalous only when its total normalized distance exceeds the configured threshold and both windows contain enough samples.

The state machine starts in `match`:

- three consecutive anomalous windows transition to `error`;
- two consecutive matching windows transition back to `match`;
- one isolated anomalous sample or window cannot trigger feedback.

All thresholds live in `referencePracticeConfig.ts` for现场 tuning without component edits.

## Recording Flow

1. The Pod must be connected.
2. `Record Reference` clears any previous reference and sets the video to `0`.
3. Recording becomes active before playback starts.
4. Each incoming IMU event records the video time at receipt plus both hardware and web timestamps.
5. Video end stops recording and produces `Reference Ready` only when enough samples were captured.
6. Playback failure or disconnect stops the run and shows an actionable status; it never invents a ready reference.

## Practice Flow

1. `Start Practice` is enabled only for a connected Pod and a ready reference.
2. Starting clears practice state, resets the comparator, seeks to `0`, and sends `LED_GREEN`.
3. Each incoming IMU event is recorded with the current video time.
4. Once the rolling Practice window has enough data, it is compared with the Reference window at the same video time.
5. State transitions update the visible status.
6. Entering error sends `LED_RED` and `VIBRATE_SHORT`; repeated feedback obeys the 800ms cooldown.
7. Recovering sends `LED_GREEN` once.
8. Video end stops practice and leaves the last result visible.

## Command and Error Handling

- Commands are raw UTF-8 strings through the existing Pod RX characteristic.
- A failed command does not crash playback or IMU ingestion; the UI shows a concise feedback failure status.
- Disconnect immediately disables Record/Practice and stops an active run.
- Samples from any Pod other than `left_wrist` are ignored.
- Low rate is shown when the existing measured rate is positive but below 20Hz.

## UI

Add one focused control section to the current training presentation:

- connection state and `Connect Left Wrist` / disconnect control;
- `Record Reference`;
- `Reference Ready`;
- `Start Practice`;
- `PASS` or `Motion Error — Left Wrist`;
- `IMU: xx samples/sec` and a low-rate warning.

No new navigation system, charts, report, or visual redesign is introduced.

## Testing

- Pure feature extraction and state-machine unit tests.
- Full-sample recording tests retaining video, hardware, and web timestamps.
- Error hysteresis and recovery tests.
- 800ms feedback cooldown tests.
- Component integration tests using fake BLE events and a controllable video element.
- Regression tests that no error feedback occurs from one bad window and that non-left-wrist packets are ignored.
- Full `npm test` and `npm run build` before completion.

## Hardware Verification

The following remain `HARDWARE VERIFICATION REQUIRED` until exercised with the physical Pod:

- sustained real receive rate near 30Hz;
- `LED_RED`, `LED_GREEN`, and `VIBRATE_SHORT` execution;
-现场 comparison threshold calibration while dancing;
- perceived feedback latency during a full 18.66-second run.
