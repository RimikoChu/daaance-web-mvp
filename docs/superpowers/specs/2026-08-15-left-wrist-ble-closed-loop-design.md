# Daaance Left-Wrist BLE Closed Loop Design

## Goal

Deliver the first real software-to-hardware loop without changing the existing visual design or removing the current demo flow:

`Connect DAAANCE_LW → receive real IMU → send Short vibration from Hardware Test → physical vibration → training error sends FEEDBACK_ERROR`.

Phase one uses one real left-wrist Pod and three explicit Mock Pods:

- `left_wrist`: real BLE when successfully connected, otherwise disconnected/error/demo only by explicit user choice.
- `right_wrist`: Mock.
- `left_ankle`: Mock.
- `right_ankle`: Mock.

No part of the UI may represent a failed, cancelled, unsupported, or unconfigured BLE attempt as a successful real connection.

## Existing Architecture and Targeted Changes

The current `PodConnectionPanel.tsx` owns device selection and GATT connection, but does not discover services or characteristics, subscribe to notifications, or write commands. `BLEMotionDataSource` is an empty placeholder and `Training` constructs `MockMotionDataSource` internally.

The implementation will preserve the existing motion analysis and demo UI while moving BLE ownership to stable App-level state. The connection panel becomes a view/controller over that state rather than the owner of a `BluetoothDevice`.

## BLE Configuration

Create `src/hardware/ble/bleConfig.ts` with the frozen canonical names and UUIDs:

```ts
export const DAAANCE_DEVICE_NAMES = {
  left_wrist: 'DAAANCE_LW',
  right_wrist: 'DAAANCE_RW',
  left_ankle: 'DAAANCE_LA',
  right_ankle: 'DAAANCE_RA',
} as const

export const SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e'
export const POD_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'
export const POD_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'
```

RX/TX names are always from the Pod perspective: the web writes raw UTF-8 commands to `POD_RX_UUID`; the Pod notifies events from `POD_TX_UUID`. Ambiguous `TX_UUID`, `RX_UUID`, `txCharacteristicUuid`, and `rxCharacteristicUuid` names are prohibited. v0.1 has no STATUS UUID. No UUID may be duplicated in React components or other application files, and protocol naming must not change without user approval.

## BLE Protocol Types and Parsing

Create `src/hardware/ble/bleTypes.ts` for:

- Pod identifiers: `left_wrist`, `right_wrist`, `left_ankle`, `right_ankle`.
- Commands: `VIBRATE_SHORT`, `VIBRATE_LONG`, `START_COUNTDOWN`, `FEEDBACK_ERROR`, `STOP_ALL`.
- Incoming `HELLO`, `IMU_DATA`, `BUTTON_SINGLE_CLICK`, and `COUNTDOWN_DONE` packets.
- Connection state and hardware telemetry snapshots.

TX notifications contain one UTF-8 JSON object per notification. Parsing rules:

- Malformed JSON returns an ignored parse result and never throws through the notification listener.
- Structurally invalid known events are ignored.
- Unknown events are ignored and recorded with a concise `console.debug` entry.
- A bad notification cannot unsubscribe or stop later notifications.
- Only packets for `left_wrist` update phase-one hardware state.
- Event and JSON field names are case-sensitive and have no aliases; `firmware` must never be shortened to `fw`.
- Mock packet fixtures use the same canonical JSON schema as real Pod notifications.

Each normalized BLE IMU sample retains both clocks:

- Hardware timestamp: the packet's original `t`.
- Web receive timestamp: `performance.now()` captured when the notification is handled.

The normalized motion interface will continue to expose the timestamp used by the current analyzer while also preserving both raw clock values for later multi-Pod synchronization work.

## BluetoothPodClient

Create `src/hardware/ble/BluetoothPodClient.ts`. It exposes:

```ts
connect(): Promise<void>
disconnect(): Promise<void>
sendCommand(command: DaaanceBleCommand): Promise<void>
subscribe(listener: (event: BluetoothPodEvent) => void): () => void
```

Responsibilities:

1. Use the frozen canonical UUID constants.
2. Verify `navigator.bluetooth`; otherwise expose `Web Bluetooth is not supported in this browser. Please use Chrome or Edge.` without crashing the page.
3. Call `requestDevice` with the exact name `DAAANCE_LW` and `SERVICE_UUID` as an optional service.
4. Connect GATT, discover the configured service, then discover TX and RX characteristics.
5. Subscribe to TX notifications and decode them independently.
6. Write commands to RX as UTF-8 text, preferring `writeValueWithoutResponse` when supported and falling back to `writeValue`.
7. Handle `gattserverdisconnected`, remove characteristic/device listeners, clear live handles, and transition to reconnect-ready disconnected state.
8. Make explicit `disconnect()` idempotent and complete all listener cleanup.

The `BluetoothDevice`, GATT server, service, and characteristics remain in memory only. They are never serialized to localStorage.
Production code uses the browser's real `navigator.bluetooth`; test code may inject a typed `BluetoothLike` fake into the client boundary, but the Web app must not polyfill or fake `navigator.bluetooth`.

## Stable App-Level Hardware State

`App` creates and retains one `BluetoothPodClient`, one BLE data source, and one Hybrid data source for its lifetime. React state mirrors client snapshots for rendering, but the client object itself is not recreated during page changes.

The Pod model distinguishes:

- `real-disconnected`
- `real-connecting`
- `real-connected`
- `real-error`
- `demo`

The UI labels the real left wrist separately from the three Demo Pods. A successful left-wrist display includes `Real hardware`, `Connected`, and measured Hz. The other three display `Demo` and never share the real connected label.

## Motion Data Sources

Implement a real `BLEMotionDataSource` that buffers normalized left-wrist IMU samples and can return the samples relevant to a choreography event. It exposes the same `MotionDataSource` contract consumed by the existing analyzer.

Implement `HybridMotionDataSource` with explicit limb routing:

- `LEFT_WRIST` → BLE source while real BLE is connected and supplying data.
- `RIGHT_WRIST`, `LEFT_ANKLE`, `RIGHT_ANKLE` → existing Mock source.
- When the user explicitly selects Demo after a BLE failure or countdown timeout, all limbs use Mock for that training session.

`Training` receives a `MotionDataSource` through props. It does not construct a fixed Mock source. The existing `analyzeTiming`, peak detection, result format, and summary pipeline remain unchanged except for the minimal timestamp metadata extension.

## Hardware Test

Add a Hardware Test area to the setup page. It does not redesign the page.

Connection information:

- Device name.
- Connection state.
- Firmware version from `HELLO`.
- Last packet web receive time.
- Measured IMU Hz based on a rolling recent receive window.

Live IMU values:

- `ax`, `ay`, `az`, `gx`, `gy`, `gz`.

Controls, enabled only for a real connected left wrist:

- Short vibration → `VIBRATE_SHORT`.
- Long vibration → `VIBRATE_LONG`.
- Error feedback → `FEEDBACK_ERROR`.
- Start countdown → `START_COUNTDOWN`.
- Stop → `STOP_ALL`.

Recent hardware events show `BUTTON_SINGLE_CLICK` and `COUNTDOWN_DONE` with their hardware timestamp and web receive time.

## Training Countdown Gate

When training Start is pressed:

1. If the user is in Demo, enter training with the existing normal video flow.
2. If real left wrist is connected, send `START_COUNTDOWN` and show a waiting state.
3. On `COUNTDOWN_DONE`, enter training and start video playback.
4. After 8 seconds without `COUNTDOWN_DONE`, do not start automatically. Show two explicit actions:
   - `Retry hardware`: resend `START_COUNTDOWN` and restart the 8-second timer.
   - `Start in Demo`: mark this training session Demo and start the existing flow.
5. Navigating away or completing the gate clears the timeout and countdown subscription.

## Training Feedback Loop

Training consumes the Hybrid data source. Existing choreography events are analyzed through the existing pipeline. When a left-wrist result is `early`, `late`, or `missed`, the app sends `FEEDBACK_ERROR` and records the result normally.

Feedback must not be sent per IMU frame. Deduplication uses the choreography/error event identifier first. A second guard enforces an approximately 1000ms command cooldown. Therefore one error event produces at most one feedback command, and different rapid events cannot spam the motor inside the cooldown window.

Command errors update debug/connection status but do not crash training or discard the timing result.

## Failure and Fallback Behavior

- Unsupported browser: show the exact Chrome/Edge guidance; Demo remains available.
- User cancels chooser: remain non-connected and show a cancellation/error state; never mark real hardware successful.
- Discovery, notification, or write failure: show a real hardware error/disconnected state; Demo remains an explicit choice.
- Unexpected disconnect: clean up handles, keep the client reconnect-ready, and stop sending commands.
- Countdown timeout: only `Retry hardware` and `Start in Demo`; no automatic fallback.
- Video/media failures retain the existing stable unavailable UI.

## Testing Strategy

All behavior changes follow test-first development.

1. Parser tests cover every known packet, malformed JSON, invalid fields, unknown events, and recovery on a later good packet.
2. Client tests cover canonical UUID/name usage, unsupported browser, request options, discovery, notification lifecycle, raw UTF-8 commands, disconnect cleanup, and reconnect readiness.
3. Data-source tests cover dual timestamps, left-wrist buffering, event-window reads, and Hybrid limb routing.
4. App/Pod tests cover one real left wrist plus three Mock Pods, failure/cancel truthfulness, and persistent client ownership across screens.
5. Hardware Test tests cover telemetry, live values, event history, control enablement, and exact command mapping.
6. Training tests cover injected datasource use, countdown success, 8-second timeout choices, retry, explicit Demo start, error-event deduplication, and 1000ms cooldown.
7. Run the entire existing test suite and `npm run build` before completion.

## Out of Scope

- More than one real BLE Pod.
- Complex clock synchronization.
- Binary BLE protocol.
- Cloud BLE.
- New authentication or database schema.
- Rewriting UI, choreography, motion recognition, or the existing demo flow.
- XIAO D0–D10, vibration, LED, button, IMU, I2C, battery, or any other physical pin/electrical mapping; Web code must not depend on GPIO assignments.

## Acceptance Criteria

The phase is complete when:

1. A Chrome/Edge session can connect only to `DAAANCE_LW`, subscribe to `POD_TX_UUID`, and write commands to `POD_RX_UUID`.
2. Hardware Test shows firmware, live six-axis values, last packet time, and approximately 50Hz measured receive rate.
3. Short vibration sends `VIBRATE_SHORT` and the physical Pod vibrates.
4. Training waits for `COUNTDOWN_DONE`, supports the specified timeout choices, and plays the existing 18.66-second video after success.
5. Left-wrist BLE samples and three Mock limbs enter the same existing analysis pipeline.
6. A detected left-wrist error sends deduplicated, cooldown-protected `FEEDBACK_ERROR` and remains in the training record.
7. Unsupported, cancelled, failed, or unconfigured BLE never appears as real connected hardware.
8. Demo training remains operational.
9. All tests and `npm run build` pass.
