# Studio Key Beats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/studio` for editing `demo-dance-001` key beats and synchronize the latest timeline through a Vercel Function backed by Vercel Blob without deploying this branch.

**Architecture:** A shared pure timeline module defines defaults, validation, cloning, and adaptation to the existing training event shape. A root `api/choreography.ts` Function delegates to an injected Blob repository, while a focused React client/editor loads and saves the same document; the existing application receives remote events as an optional prop and otherwise keeps its current built-in choreography.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Testing Library, Web-standard Vercel Functions, `@vercel/blob`.

## Global Constraints

- Work only on `codex/studio-key-beats` in `/Users/rimiko/Documents/ChatGPT/Daaaance/.worktrees/studio-key-beats`.
- Do not merge, rebase, deploy, or modify the current `main` worktree.
- Keep `src/assets/demo-dance.mp4` byte-for-byte unchanged.
- Do not add login, video upload, candidate beats, beat snapping, localStorage persistence, or real-time AI audio analysis.
- Do not change BLE, IMU, Device, hardware-test, or training-review behavior.
- Missing `BLOB_READ_WRITE_TOKEN` permits GET fallback only; POST must return a visible failure.
- Use test-driven development: observe each new test fail for the intended missing behavior before implementation.

---

## File structure

- `src/domain/choreographyTimeline.ts`: contract, defaults, validation, cloning, and training adapter.
- `api/_choreographyService.ts`: HTTP policy with an injected repository.
- `api/_blobRepository.ts`: fixed-path `@vercel/blob` adapter.
- `api/choreography.ts`: Vercel Function entrypoint.
- `src/studio/choreographyClient.ts`: browser GET/POST boundary.
- `src/studio/Studio.tsx`: editor state and interactions.
- `src/App.tsx`, `src/components/Training.tsx`, `src/main.tsx`: narrow runtime integration.
- Corresponding `*.test.ts(x)` files protect every behavior.

### Task 1: Shared timeline contract

**Files:**
- Create: `src/domain/choreographyTimeline.ts`
- Create: `src/domain/choreographyTimeline.test.ts`

**Interfaces:**
- Produces: `BeatIntensity`, `StudioLimb`, `KeyBeat`, `ChoreographyTimeline`, `DEFAULT_TIMELINE`, `cloneDefaultTimeline()`, `normalizeTimeline(input, now?)`, `toChoreographyEvents(timeline)`.

- [ ] **Step 1: Write failing contract tests**

Add literal expectations covering default `danceId`, `durationMs: 18660`, twelve sorted beats, rejected duplicate IDs/out-of-range times/invalid enums, server timestamp replacement, deep cloning, and this adapter result:

```ts
expect(toChoreographyEvents({ ...timeline, beats: [
  { id: 'beat-1', timeMs: 3210, intensity: 'strong', limb: 'right_ankle' },
] })).toEqual([{ id: 'beat-1', time: 3210, limb: 'RIGHT_ANKLE', cue: 'STEP', accent: true }])
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/domain/choreographyTimeline.test.ts`

Expected: FAIL because `choreographyTimeline.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure module**

Define the serializable types, a frozen fixture derived from the existing twelve events, `TimelineValidationError`, deterministic sorting by `timeMs` then `id`, deep-copy defaults, and lowercase-to-uppercase limb conversion. `normalizeTimeline(input, now = () => new Date())` returns a new object and uses `now` for `updatedAt`.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/domain/choreographyTimeline.test.ts`

Expected: all new tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/choreographyTimeline.ts src/domain/choreographyTimeline.test.ts
git commit -m "feat: define choreography timeline contract"
```

### Task 2: Vercel Blob Function

**Files:**
- Create: `api/_choreographyService.ts`
- Create: `api/_blobRepository.ts`
- Create: `api/choreography.ts`
- Create: `api/choreography.test.ts`
- Create: `tsconfig.api.json`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `ChoreographyTimeline`, `cloneDefaultTimeline()`, `normalizeTimeline()`.
- Produces: `TimelineRepository.read(): Promise<unknown | null>`, `TimelineRepository.write(timeline): Promise<void>`, and `handleChoreographyRequest(request, deps): Promise<Response>`.

- [ ] **Step 1: Install explicit dependencies**

Run: `npm install @vercel/blob && npm install --save-dev @types/node`

Expected: package manifests include the Blob SDK and Node types.

- [ ] **Step 2: Write failing Function tests**

Use real `Request` and `Response` with an in-memory repository. Assert successful GET/POST, GET default fallback with `X-Choreography-Source: default` when the token is missing or the object is absent, malformed POST `400`, missing-token POST and repository failures `503`, and unsupported methods `405` with `Allow: GET, POST`.

```ts
const response = await handleChoreographyRequest(
  new Request('http://local/api/choreography', {
    method: 'POST',
    body: JSON.stringify(validTimeline),
  }),
  { repository, hasToken: true, now: () => new Date('2026-08-16T00:00:00.000Z') },
)
expect(response.status).toBe(200)
expect(await response.json()).toMatchObject({ updatedAt: '2026-08-16T00:00:00.000Z' })
```

- [ ] **Step 3: Verify RED**

Run: `npx vitest run api/choreography.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 4: Implement service, repository, and entrypoint**

The repository uses `choreography/demo-dance-001.json`, SDK `get(..., { access: 'private' })`, and:

```ts
await put(PATHNAME, JSON.stringify(timeline), {
  access: 'private',
  contentType: 'application/json',
  allowOverwrite: true,
  cacheControlMaxAge: 60,
})
```

Map `BlobNotFoundError` to `null`; propagate other failures. Export the Web-standard default `{ fetch(request) { ... } }` from `api/choreography.ts`. Add `tsconfig.api.json` with `noEmit`, Node types, and includes for `api/**/*.ts` plus the shared domain module; reference it from root `tsconfig.json`.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run api/choreography.test.ts src/domain/choreographyTimeline.test.ts && npx tsc -p tsconfig.api.json`

Expected: tests PASS and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add api package.json package-lock.json tsconfig.json tsconfig.api.json
git commit -m "feat: persist choreography with Vercel Blob"
```

### Task 3: Studio editor

**Files:**
- Create: `src/studio/choreographyClient.ts`
- Create: `src/studio/Studio.tsx`
- Create: `src/studio/Studio.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `ChoreographyTimeline`, `cloneDefaultTimeline()`, the fixed video and poster.
- Produces: `loadChoreography(fetcher?)`, `saveChoreography(timeline, fetcher?)`, and `<Studio client?>`.

- [ ] **Step 1: Write failing editor tests**

Test the real component with an injected client returning complete documents. Cover fixed video, initial load, Space at `3.214s` creating `3210ms` with `medium/left_wrist`, Space ignored from form controls, selecting instead of duplicating within 100ms, sorted/highlighted insertion, delete, intensity and limb edits, reset confirmation only when dirty, successful server normalization, and failed save preserving the exact draft while showing `保存失败，请重试。`.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/studio/Studio.test.tsx`

Expected: FAIL because `Studio.tsx` does not exist.

- [ ] **Step 3: Implement the HTTP client and editor**

GET uses `cache: 'no-store'`; POST uses JSON and throws on non-2xx responses. Studio keeps draft, selection, load state, and save state separately. The Space listener ignores repeat/editable targets, rounds `video.currentTime * 1000` to 10ms, selects an existing beat within 100ms, or inserts:

```ts
{ id: crypto.randomUUID(), timeMs, intensity: 'medium', limb: 'left_wrist' }
```

Add scoped `.studio-*` desktop/mobile styles, proportional timeline markers, selected rows, and explicit status colors.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/studio/Studio.test.tsx`

Expected: all Studio tests PASS without console errors.

- [ ] **Step 5: Commit**

```bash
git add src/studio src/styles.css
git commit -m "feat: add studio key beat editor"
```

### Task 4: Demo-page synchronization

**Files:**
- Modify: `src/components/Training.tsx`
- Modify: `src/components/Training.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/main.tsx`
- Create: `src/main.test.tsx`

**Interfaces:**
- Consumes: `loadChoreography()`, `toChoreographyEvents()`, and `CHOREOGRAPHY` fallback.
- Produces: optional `choreography?: ChoreographyEvent[]` on `AppProps` and `TrainingProps`; pathname-based Studio entry; non-blocking remote load.

- [ ] **Step 1: Write failing integration tests**

In Training, supply two events and assert cue selection, analysis calls, and `onFinish` use only them. In App, inject choreography and reach Training to prove forwarding without changing Pod/IMU behavior. Test an extracted `Root`: `/studio` renders Studio and `/` renders App while loading remote data.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/components/Training.test.tsx src/App.test.tsx src/main.test.tsx`

Expected: FAIL because choreography injection and pathname routing do not exist.

- [ ] **Step 3: Implement narrow integration**

Add `choreography = CHOREOGRAPHY` to Training and replace only direct constant reads. Add the optional App prop and forward it. Extract `Root`, returning `<Studio />` at `/studio`; otherwise load once, retain `CHOREOGRAPHY` on failure, adapt valid data, and pass `<App choreography={events} />`. Keep `createRoot` in `main.tsx`.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/components/Training.test.tsx src/App.test.tsx src/main.test.tsx`

Expected: all targeted integration and regression tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Training.tsx src/components/Training.test.tsx src/App.tsx src/App.test.tsx src/main.tsx src/main.test.tsx
git commit -m "feat: load synchronized choreography in demo"
```

### Task 5: Full verification and handoff

**Files:**
- Modify only already-scoped files if verification exposes a defect.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: a verified branch with no merge or deployment.

- [ ] **Step 1: Run fresh verification**

```bash
npm test
npm run build
npx tsc -p tsconfig.api.json
git diff --check
shasum -a 256 src/assets/demo-dance.mp4
```

Expected: zero failures, build/typecheck exit 0, no whitespace errors, and the video hash equals the baseline checkout.

- [ ] **Step 2: Audit scope and isolation**

```bash
git status --short --branch
git diff 6e29361...HEAD --stat
git log --oneline --decorate 6e29361..HEAD
git worktree list --porcelain
```

Expected: branch is `codex/studio-key-beats`; changes stay within Studio/timeline/API/integration/docs/config; main remains separate; no merge or deploy commit exists.

- [ ] **Step 3: Commit verification fixes only if needed**

If Step 1 required scoped corrections, commit those exact files as `fix: complete studio verification`. Otherwise create no empty commit.

- [ ] **Step 4: Stop before integration**

Report worktree, branch, commits, test/build evidence, absence of live Blob/deployment verification, and wait for Task 8 before any rebase, merge, final integration test, push, or deployment.
