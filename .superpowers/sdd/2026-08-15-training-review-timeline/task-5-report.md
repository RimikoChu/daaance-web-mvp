# Task 5 report: Feedback command audit and ACK correlation

## Status

Complete

## Behavioral guarantees

- `createFeedbackGuard.report(errorEvent)` returns a serializable
  `FeedbackCommandEvent` for each accepted attempt. It preserves identity
  deduplication and the existing cooldown, returns failed writes with their
  reason, and never represents a resolved write as hardware execution.
- `correlateFeedback` deterministically pairs a `FEEDBACK_EXECUTED` record to
  the closest preceding sent command for the same error limb in a five-second
  window. Missing ACKs remain `execution-unconfirmed`; failed writes remain
  `failed`.
- The App-owned left-wrist controller remains the only BLE owner. It exposes a
  bounded 50-entry raw BLE event log and bounded command-attempt history with a
  unique web `commandId`, sent timestamp, and truthful sent/failed status.
- The development Hardware Test UI connects/disconnects only `DAAANCE_LW`,
  displays truthful state, live IMU, `BUTTON_SINGLE_CLICK`, the existing five
  frozen commands, `FEEDBACK_EXECUTED` receive/hardware times and correlated
  latency, and three explicitly Mock Pods. A command without an ACK is shown
  as execution unconfirmed.

## RED evidence

- Command-audit and feedback-correlation tests failed before implementation:
  the guard returned booleans and the correlation module did not exist.
- Hardware Debug tests failed before implementation because the controller had
  no command/event audit state and the panel had no DAAANCE_LW connection,
  ACK, or raw-log presentation.
- A multiple-command ACK test failed before refinement because one ACK was
  displayed as confirmation for every eligible command. Correlation now
  consumes each acknowledgement once and selects the closest preceding command.
- Independent review found that duplicate raw acknowledgements could still be
  consumed twice, and that the panel needed a production guard. A regression
  test now deduplicates stable ACK identities before matching, and `App` mounts
  Hardware Debug only when `import.meta.env.DEV` is true.

## Verification

- Focused feedback and Hardware Debug suites pass.
- Full suite, production build, and `git diff --check` were run before commit.

## Hardware verification required

Physical LED and vibration execution, firmware ACK timestamps,
command-to-ACK latency, and real approximately 50 Hz IMU behavior still
require verification with a physical Pod.

## Scope note

The controller-owned plan and design-spec edits are intentionally excluded from
this task commit.

## Review round 2: clock-domain correction

Independent review found a critical clock-domain mismatch: BLE receive times
came from `BluetoothPodClient`'s monotonic web clock while command attempts and
the Training feedback guard used epoch `Date.now()`. The client now exposes its
single `getWebTimestamp()` source; the App passes it to Training, and the
controller records command sends from it. A real-client integration regression
drives a command at 1000 ms and `FEEDBACK_EXECUTED` at 1025 ms through the
Bluetooth client, controller, and panel, asserting one nonnegative 25 ms
latency correlation while a duplicate ACK remains uncorrelated.

## Review round 3: Training-path integration regression

Quality review requested an integration test that reaches the actual Training
analysis path rather than a Hardware Test manual command. The new real-client
test enters Hybrid Training, advances past the first left-wrist choreography
event with no matching IMU sample, verifies the resulting incorrect analysis
sends `FEEDBACK_ERROR` at injected clock time 5000 ms, delivers an ACK at 5033
ms, returns to the development panel, and observes exactly the nonnegative
33 ms latency. The test was verified RED by temporarily substituting epoch
`Date.now()` for the controller web clock, then GREEN after restoring the
shared client clock; no further production change was required.
