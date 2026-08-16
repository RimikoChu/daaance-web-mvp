# Task 6 report: Interactive error timeline and navigation

## Status

Complete

## Behavioral guarantees

- `TrainingTimeline` renders ordinary point markers and separate standard or
  strong continuous review ranges from the supplied deduplicated errors and
  ranges. Markers and range jump targets are buttons with accessible labels
  containing limb, error type/count, severity, timestamp, and source.
- Previous and Next error navigation uses stable timestamp-and-ID order. It
  navigates only to the adjacent deduplicated error around the current video
  time.
- Review actions target the existing shared video. Training pauses first, then
  seeks with the centralized one-second preroll and the existing bounded seek
  helper. The current time and teaching segment remain synchronized.
- Demo review events use the existing Demo detector; real sources use the
  timing-only IMU detector, while Hybrid keeps Mock-derived Demo events to its
  non-left-wrist limbs. No Direction or Range detector is fabricated for IMU.
- The Training Pod panel now shows all four streams as `采集中` while playback
  runs, preserves each Pod's Demo/real/disconnected/error provenance, and
  presents choreography focus independently as `本拍重点`.

## RED evidence

- `TrainingTimeline.test.tsx` initially failed because the component did not
  exist.
- The Training integration tests then failed because review markers, clamped
  preroll seeking, and the four-Pod collecting/focus presentation were absent.

## Verification

- Focused timeline and Training suites: 26 tests passed.
- The default parallel `npm test` encountered Vitest worker-start timeouts;
  each reported suite passed in isolation. The complete serial run
  `npm test -- --maxWorkers=1` passed 20 files / 188 tests.
- `npm run build` passed (`tsc -b` and Vite production build), with the MP4
  and poster included in `dist/assets`.
- `git diff --check` passed.
- Browser verification covered the Demo flow at desktop and 390px mobile:
  all four Pods display `采集中`, focus stays separate, strong review ranges
  and accessible markers appear, marker navigation pauses and seeks to the
  one-second preroll, review controls fit on mobile, and no browser console
  errors occurred.

## Scope note

Frozen BLE files and the pre-existing plan/design-spec edits are excluded from
this task commit.

## Review round 1: ledger ownership correction

Review found that Training maintained a separate `reviewErrors` presentation
array instead of using the append-only session ledger. Training now creates one
stable ledger for each mounted session, appends only post-dedup detector errors,
and derives Timeline markers and review ranges exclusively from
`ledger.snapshot().errors`. A revision signal only refreshes the derived view;
it is not a second event store. The regression creates a Demo marker, verifies
the ledger holds the three source events, then mounts a new Training session and
verifies its new ledger and timeline are empty. Focused tests passed 27/27;
the serial full suite passed 20 files / 189 tests; build and diff checks passed.
