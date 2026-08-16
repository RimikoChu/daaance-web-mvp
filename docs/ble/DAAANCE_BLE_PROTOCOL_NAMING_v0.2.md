# Daaance BLE Protocol Naming v0.2

## Optional `FEEDBACK_EXECUTED` Extension

This document adds one optional acknowledgement event to the frozen
v0.1 protocol. It does not rename, replace, or alter any v0.1 UUID,
event name, pod ID, command, field name, or direction rule.

### Direction

`FEEDBACK_EXECUTED` is sent through `POD_TX_UUID` as a **Pod to Web
Notify** event.

### Event Name

``` text
FEEDBACK_EXECUTED
```

### Canonical Packet

``` json
{
  "event": "FEEDBACK_EXECUTED",
  "pod": "left_wrist",
  "t": 123456,
  "feedback": "ERROR",
  "outputs": ["LED", "VIBRATION"]
}
```

Required fields:

  Field       Requirement
  ----------- -------------------------------------------
  `event`     Must be `FEEDBACK_EXECUTED`
  `pod`       A v0.1 Pod ID
  `t`         Finite hardware timestamp
  `feedback`  Must be `ERROR`
  `outputs`   Non-empty array; each value is `LED` or `VIBRATION`

The Web records the browser receive timestamp separately from `t`.

## Compatibility Rule

The extension is optional: a v0.1 Web client may ignore
`FEEDBACK_EXECUTED`, and a v0.1 Pod does not need to emit it. When a
Pod supports this extension, it must preserve every v0.1 packet and
name exactly as frozen in
`DAAANCE_BLE_PROTOCOL_NAMING_v0.1.md`.
