# Studio Key Beats Design

## Goal

Add an unauthenticated `/studio` editor for the fixed 18.66-second `demo-dance-001` video. Editors can mark key beats during playback, delete them, assign intensity and limb, reset the draft to the built-in defaults, and persist the latest timeline through `POST /api/choreography` to Vercel Blob. The demo application reads the same timeline through `GET /api/choreography`, so a saved timeline becomes available without a new deployment.

## Scope and isolation

- Work only on `codex/studio-key-beats` in its dedicated worktree.
- Do not merge, rebase, deploy, or modify the current `main` worktree.
- Keep `src/assets/demo-dance.mp4` byte-for-byte unchanged and use it in Studio.
- Do not add login, video upload, candidate-beat generation, beat snapping, or real-time AI audio analysis.
- Do not change BLE, IMU, Device, hardware-test, or training-review behavior.
- The Studio shortcut records the video's exact current playback time, rounded to 10 milliseconds.

## Timeline contract

The shared, independently serializable document is:

```ts
type BeatIntensity = 'light' | 'medium' | 'strong'
type StudioLimb = 'left_wrist' | 'right_wrist' | 'left_ankle' | 'right_ankle'

interface KeyBeat {
  id: string
  timeMs: number
  intensity: BeatIntensity
  limb: StudioLimb
}

interface ChoreographyTimeline {
  schemaVersion: 1
  danceId: 'demo-dance-001'
  durationMs: 18660
  updatedAt: string
  beats: KeyBeat[]
}
```

The built-in default timeline preserves the current twelve choreography times and limbs. Existing accented events become `strong`; other events become `medium`. Beats are sorted by `timeMs`, IDs are unique, timestamps are finite integers from `0` through `18660`, and all enum values are validated. The API rejects extra dance IDs or malformed documents with `400` and a stable JSON error response.

The UI draft is a deep copy of the last loaded or reset document. No browser storage is a source of truth.

## Storage and API

Create the Vite-compatible root function `api/choreography.ts` and non-route helpers whose filenames begin with `_`. Vercel officially supports root `api/` Functions for Vite projects and ignores underscore-prefixed helper files as routes.

Use `@vercel/blob` with a private, fixed pathname:

```text
choreography/demo-dance-001.json
```

`POST /api/choreography` validates the request, replaces `updatedAt` with the server timestamp, serializes the normalized timeline, and calls Blob `put` with `access: 'private'`, `contentType: 'application/json'`, `allowOverwrite: true`, and `cacheControlMaxAge: 60`. It returns the persisted normalized document only after the Blob write succeeds. Blob write failures return `503`; they do not alter client draft state.

`GET /api/choreography` reads the private object by pathname through the Blob SDK, parses and validates it, and returns it with `Cache-Control: no-store`. If `BLOB_READ_WRITE_TOKEN` is absent, or the object does not exist, GET returns the built-in default with a response field/header identifying the fallback. A configured Blob read failure or malformed stored object returns `503` rather than silently masking production corruption. POST never falls back: without the token it returns `503` and does not pretend to save.

The Function depends only on injected storage operations in tests, so validation, missing-token behavior, not-found fallback, successful reads/writes, and storage failures can be tested without contacting Vercel.

## Client data flow

A small choreography client owns `GET` and `POST`; a loader hook owns loading/error/refetch state. On normal demo startup, the application requests `/api/choreography`. Until it resolves, current built-in choreography remains usable. A valid remote result is adapted to the existing `ChoreographyEvent` shape at the boundary and supplied to Training; fetching failure leaves the built-in events active and exposes a non-blocking status rather than breaking training.

This is the only integration with the existing training flow. Motion sources, timing analysis, feedback, BLE, IMU, Devices, and review logic remain unchanged.

## Studio interaction

Routing is intentionally minimal: `window.location.pathname === '/studio'` renders `Studio`, and every other pathname renders the existing application. No router dependency is added.

Studio contains the fixed video, playback controls, current-time display, a proportional timeline, save status, and a beat list. On load it fetches the latest timeline; fallback data is editable normally.

Pressing Space outside an input, select, textarea, button, or content-editable element prevents page scrolling and adds a beat at the current video time. A new beat defaults to `medium` and `left_wrist`. If a beat already exists within 100 milliseconds, Studio selects and scrolls to that beat instead of creating a duplicate. A new beat is selected, highlighted, and scrolled into view. The list remains sorted by time.

Each beat row can change `light`, `medium`, or `strong`; change among the four lowercase limb values; seek the video to the beat; or delete the beat. Accessible labels identify every control and beat time.

`Reset to default` asks for confirmation when the current draft differs from the built-in default, then replaces only the local draft. Reset is not persisted until `Save and sync` is clicked.

`Save and sync` sends the current draft to POST. While saving, duplicate submissions are disabled. Success replaces the draft with the normalized server response and shows the saved timestamp. Failure leaves the exact draft and selection intact and shows an explicit retryable error. Loading failures likewise show an error while retaining the fallback draft.

## Error handling and concurrency

- Invalid API methods return `405` with `Allow: GET, POST`.
- Invalid request JSON or timeline fields return `400` with a human-readable message.
- Missing Blob configuration makes GET fall back for local preview and makes POST fail clearly.
- Blob not found makes GET fall back; other Blob errors return `503`.
- The first version is last-write-wins. Authentication and multi-editor conflict resolution are explicitly out of scope.

## Testing and verification

Follow test-driven development for each behavior:

- Timeline validation, normalization, default cloning, sorting, and conversion to the existing choreography shape.
- Function GET/POST, method rejection, missing-token fallback, not-found fallback, malformed input, and storage failures using injected storage.
- Studio load, fixed video, Space shortcut guards, 100ms deduplication, selection, deletion, intensity/limb editing, reset semantics, successful save, and failed-save draft preservation.
- Application routing and remote choreography loading without regressions to current training behavior.
- Full `npm test`, `npm run build`, targeted Function type checks, `git diff --check`, and confirmation that the video checksum is unchanged.

No deployment or live Blob mutation is part of this branch task.
