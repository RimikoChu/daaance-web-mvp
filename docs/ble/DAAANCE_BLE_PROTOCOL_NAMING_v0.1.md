# Daaance BLE Protocol Naming v0.1

> This document freezes the BLE naming and message protocol used by both
> the Web software and Pod firmware. Do not rename UUIDs, event names,
> pod IDs, or command names without updating both sides together.

## 1. Device Names

  Position      BLE Device Name
  ------------- -----------------
  Left Wrist    `DAAANCE_LW`
  Right Wrist   `DAAANCE_RW`
  Left Ankle    `DAAANCE_LA`
  Right Ankle   `DAAANCE_RA`

## 2. Pod IDs

  Position      Pod ID
  ------------- ---------------
  Left Wrist    `left_wrist`
  Right Wrist   `right_wrist`
  Left Ankle    `left_ankle`
  Right Ankle   `right_ankle`

## 3. BLE UUIDs

``` text
SERVICE_UUID
6e400001-b5a3-f393-e0a9-e50e24dcca9e
```

``` text
POD_RX_UUID
6e400002-b5a3-f393-e0a9-e50e24dcca9e
```

``` text
POD_TX_UUID
6e400003-b5a3-f393-e0a9-e50e24dcca9e
```

### Direction rule

RX/TX are always named from the **Pod's perspective**.

``` text
0002 = POD_RX = Web -> Pod
0003 = POD_TX = Pod -> Web
```

-   `POD_RX_UUID`
    -   Pod receives data
    -   Web writes commands here
    -   Characteristic: `WRITE` / `WRITE WITHOUT RESPONSE`
-   `POD_TX_UUID`
    -   Pod transmits data
    -   Web subscribes to notifications here
    -   Characteristic: `NOTIFY`

Do not use ambiguous names such as `TX_UUID` or `RX_UUID` without the
`POD_` prefix.

`STATUS_UUID` is not used in protocol v0.1.

## 4. Canonical Event Names

Event names are case-sensitive.

``` text
HELLO
IMU_DATA
BUTTON_SINGLE_CLICK
COUNTDOWN_DONE
```

Do not use lowercase variants such as:

``` text
hello
imu_data
button_single_click
countdown_done
```

## 5. HELLO Packet

Sent by Pod to Web through `POD_TX_UUID`.

``` json
{
  "event": "HELLO",
  "pod": "left_wrist",
  "firmware": "0.1.0"
}
```

Required field names:

``` text
event
pod
firmware
```

Do not rename `firmware` to `fw`.

## 6. IMU Packet

Sent by Pod to Web through `POD_TX_UUID`.

Target rate:

``` text
50 Hz
20 ms / sample
```

Canonical format:

``` json
{
  "event": "IMU_DATA",
  "pod": "left_wrist",
  "t": 123456,
  "ax": 0.12,
  "ay": 0.35,
  "az": 9.72,
  "gx": 12.4,
  "gy": 4.5,
  "gz": 8.1
}
```

Field definitions:

  Field     Meaning
  --------- -------------------------------------------
  `event`   Must be `IMU_DATA`
  `pod`     Pod ID
  `t`       Hardware timestamp, preferably `millis()`
  `ax`      Acceleration X
  `ay`      Acceleration Y
  `az`      Acceleration Z
  `gx`      Gyroscope X
  `gy`      Gyroscope Y
  `gz`      Gyroscope Z

The Web side should also record a browser receive timestamp separately.

## 7. Button Event

Sent by Pod to Web through `POD_TX_UUID`.

``` json
{
  "event": "BUTTON_SINGLE_CLICK",
  "pod": "left_wrist",
  "t": 123456
}
```

## 8. Countdown Complete Event

Sent by Pod to Web through `POD_TX_UUID` after the hardware countdown
pattern finishes.

``` json
{
  "event": "COUNTDOWN_DONE",
  "pod": "left_wrist",
  "t": 123456
}
```

## 9. Web -\> Pod Commands

Commands are written to `POD_RX_UUID`.

Encoding:

``` text
Raw UTF-8 string
```

Canonical commands:

``` text
VIBRATE_SHORT
VIBRATE_LONG
START_COUNTDOWN
FEEDBACK_ERROR
STOP_ALL
```

Do not wrap commands in JSON.

Correct:

``` text
VIBRATE_SHORT
```

Incorrect:

``` json
{"cmd":"VIBRATE_SHORT"}
```

Do not add lowercase aliases.

## 10. Command Semantics

### `VIBRATE_SHORT`

Trigger a short vibration.

### `VIBRATE_LONG`

Trigger a long vibration.

### `START_COUNTDOWN`

Run the countdown haptic pattern:

``` text
short -> pause -> short -> pause -> short -> pause -> long
```

After it finishes, send:

``` text
COUNTDOWN_DONE
```

### `FEEDBACK_ERROR`

Trigger the current error-feedback behavior.

The software side should apply cooldown/deduplication so the same
detected error does not repeatedly trigger the motor every IMU frame.

### `STOP_ALL`

Immediately stop active vibration/countdown/feedback patterns and return
the Pod to idle.

## 11. BLE Connection Behavior

The Pod should:

1.  Advertise using the correct device name.
2.  Expose `SERVICE_UUID`.
3.  Expose `POD_RX_UUID` as writable.
4.  Expose `POD_TX_UUID` as notifiable.
5.  Send `HELLO` after connection/subscription is ready.
6.  Continuously send `IMU_DATA` at approximately 50 Hz.
7.  Re-advertise after disconnect.
8.  Keep BLE and IMU processing non-blocking.

## 12. First Hardware Target

Current phase:

``` text
left_wrist = Real BLE Pod
right_wrist = Mock
left_ankle = Mock
right_ankle = Mock
```

Current real BLE device:

``` text
DAAANCE_LW
```

Current real Pod ID:

``` text
left_wrist
```

## Hardware Pin Scope

This protocol intentionally does **not** define physical XIAO pin
assignments.

The following are firmware/hardware implementation details and are **not
frozen by this document**:

-   XIAO `D0`--`D10` GPIO assignments
-   vibration motor GPIO
-   LED / RGB GPIO
-   button GPIO
-   IMU SDA / SCL pins
-   IMU I2C address
-   battery / power wiring
-   other board-level electrical connections

The Web software must not depend on any physical GPIO number.

For example, the Web sends:

``` text
VIBRATE_SHORT
```

The firmware decides internally which physical pin drives the vibration
motor.

Physical pin assignments may therefore change without changing the BLE
protocol or Web software.

## 13. Protocol Freeze Summary

``` text
Device:
DAAANCE_LW

Pod:
left_wrist

Service:
6e400001-b5a3-f393-e0a9-e50e24dcca9e

Web -> Pod:
POD_RX_UUID
6e400002-b5a3-f393-e0a9-e50e24dcca9e

Pod -> Web:
POD_TX_UUID
6e400003-b5a3-f393-e0a9-e50e24dcca9e

Events:
HELLO
IMU_DATA
BUTTON_SINGLE_CLICK
COUNTDOWN_DONE

Commands:
VIBRATE_SHORT
VIBRATE_LONG
START_COUNTDOWN
FEEDBACK_ERROR
STOP_ALL
```

## 14. Compatibility Rule

The Web software, mock simulator, tests, and firmware must all follow
this document exactly.

If one side changes:

-   UUID
-   device name
-   pod ID
-   event name
-   JSON field name
-   command name
-   RX/TX direction

the other side must be updated at the same time.

For protocol v0.1, do not introduce alternative aliases or fallback
naming.
