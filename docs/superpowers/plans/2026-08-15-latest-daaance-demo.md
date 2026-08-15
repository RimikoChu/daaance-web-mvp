# Latest Daaance Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the nested legacy app on `main` with a root-level Daaance demo that connects four Pods, switches teaching/follow modes, seeks by five seconds, and plays the supplied 18.655-second dance video.

**Architecture:** Preserve the existing Vite/React application and domain analysis modules while moving the app to the repository root. A pure playback module owns duration and teaching-segment math; React owns Pod and video element state; the supplied movie is bundled from `src/assets/demo-dance.mp4`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, native HTML video, optional Web Bluetooth with per-Pod demo fallback.

## Global Constraints

- Deploy from the existing `RimikoChu/daaance-web-mvp` repository and existing Vercel project only.
- The Vite application must live at the repository root; remove the obsolete wrapper directory.
- Preserve the supplied media payload at `src/assets/demo-dance.mp4`; expected duration is 18.655 seconds, dimensions are 720×1280, and size is about 2.8 MB.
- The training page must expose `教学模式 / 跟跳模式`, `−5 秒`, and `+5 秒`.
- Switching modes must preserve the current playback position.
- Four-Pod connection must remain demo-safe when Web Bluetooth is unavailable or rejected.
- Run the complete test suite and `npm run build` before updating remote `main`.
- The final commit message must remain `feat: deploy latest Daaance demo`.

## File structure

- `package.json`, `package-lock.json`, `index.html`, `vite.config.ts`, and `tsconfig*.json`: root-level Vite project configuration.
- `src/App.tsx`: screen flow and composition only.
- `src/components/PodConnectionPanel.tsx`: coordinated four-Pod connection states and UI.
- `src/components/Training.tsx`: video playback, mode switch, transport controls, IMU timing collection.
- `src/playback.ts`: pure seek clamping and three-segment calculations.
- `src/assets/demo-dance.mp4`: supplied immutable media.
- `src/**/*.test.ts(x)`: behavior tests for playback, Pods, training transport, and the complete flow.

---

### Task 1: Promote the Vite project to repository root

**Files:**
- Move: `daaance-web-mvp/*` to repository root, including hidden project files
- Preserve: `docs/superpowers/specs/2026-08-15-latest-daaance-demo-design.md`
- Preserve: `docs/superpowers/plans/2026-08-15-latest-daaance-demo.md`
- Remove: empty `daaance-web-mvp/`

**Interfaces:**
- Consumes: the current nested Vite application.
- Produces: root commands `npm test`, `npm run build`, and `npm run dev`.

- [ ] **Step 1: Record the pre-move test baseline**

Run: `cd daaance-web-mvp && npm ci && npm test`

Expected: the existing domain and app tests pass before any behavior change.

- [ ] **Step 2: Move the project without changing source behavior**

Move every tracked entry from `daaance-web-mvp/` to the repository root. Keep the root `docs/` tree and replace the one-line root README with the application's README.

- [ ] **Step 3: Verify the root project**

Run: `npm test`

Expected: the same tests pass from the repository root, proving the move did not change behavior.

---

### Task 2: Add tested playback math

**Files:**
- Create: `src/playback.test.ts`
- Create: `src/playback.ts`

**Interfaces:**
- Produces: `DANCE_DURATION_SECONDS = 18.655`, `clampTime(time: number, duration?: number): number`, `seekBy(current: number, delta: number, duration?: number): number`, `getTeachingSegment(time: number, duration?: number): number`, and `getSegmentBounds(segment: number, duration?: number): { start: number; end: number }`.

- [ ] **Step 1: Write failing boundary tests**

```ts
import { describe, expect, it } from 'vitest'
import { clampTime, getSegmentBounds, getTeachingSegment, seekBy } from './playback'

describe('dance playback math', () => {
  it('seeks exactly five seconds and clamps at both ends', () => {
    expect(seekBy(7, -5)).toBe(2)
    expect(seekBy(17, 5)).toBe(18.655)
    expect(seekBy(2, -5)).toBe(0)
  })

  it('maps playback time into three equal teaching segments', () => {
    expect(getTeachingSegment(0)).toBe(0)
    expect(getTeachingSegment(6.3)).toBe(1)
    expect(getTeachingSegment(13)).toBe(2)
    expect(getSegmentBounds(2)).toEqual({ start: 12.436666666666667, end: 18.655 })
  })
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/playback.test.ts`

Expected: FAIL because `src/playback.ts` does not exist.

- [ ] **Step 3: Implement the pure helpers**

Use a three-segment constant, clamp non-finite values to zero, clamp segment indices to 0–2, and return the exact final duration for segment 2.

- [ ] **Step 4: Run the focused and full tests**

Run: `npm test -- src/playback.test.ts && npm test`

Expected: all tests pass.

---

### Task 3: Add coordinated four-Pod connection

**Files:**
- Create: `src/components/PodConnectionPanel.test.tsx`
- Create: `src/components/PodConnectionPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `PodConnectionPanel({ onReady }: { onReady: () => void })` and four observable states: `disconnected`, `connecting`, `hardware`, `demo`.
- Consumes: existing limb IDs and labels from `src/domain/types.ts` and `src/domain/choreography.ts`.

- [ ] **Step 1: Write the failing component test**

```tsx
it('connects all four Pods together and falls back to Demo 50Hz', async () => {
  render(<PodConnectionPanel onReady={vi.fn()} />)
  expect(screen.getAllByText('未连接')).toHaveLength(4)
  fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))
  expect(screen.getAllByText('连接中…')).toHaveLength(4)
  expect(await screen.findAllByText('Demo · 50Hz')).toHaveLength(4)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/components/PodConnectionPanel.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the minimal coordinated state machine**

All cards enter `connecting` in the same state update. If `navigator.bluetooth` is unavailable, settle all four to `demo`; if available, attempt each limb independently and convert rejection to `demo`. Call `onReady` only after all four reach `hardware` or `demo`.

- [ ] **Step 4: Integrate the panel on the home screen**

Replace the always-connected badge and direct training button with the panel. Enable continuing to setup only after all four Pod states are ready.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- src/components/PodConnectionPanel.test.tsx && npm test`

Expected: the new Pod test and prior flow tests pass after updating their entry action.

---

### Task 4: Add real video training and mode switching

**Files:**
- Create: `src/components/Training.test.tsx`
- Create: `src/components/Training.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`
- Copy: supplied movie to `src/assets/demo-dance.mp4`

**Interfaces:**
- Produces: `Training({ feedbackMode, strictness, onFinish, onExit })` with one `<video aria-label="18.66 秒舞蹈示范">` and teaching/follow mode state.
- Consumes: playback helpers from Task 2 and IMU analysis from `src/domain/*`.

- [ ] **Step 1: Copy the supplied media and validate metadata**

Copy `/Users/rimiko/Downloads/01ea57709f57bb89010370039f690922d5_4610.mp4?sign=548f98299bae75e872b7086223f6eb24&t=6a84e816video.MOV` to `src/assets/demo-dance.mp4`. Verify byte size matches and macOS metadata still reports 18.655 seconds at 720×1280.

- [ ] **Step 2: Write failing training behavior tests**

```tsx
it('renders the supplied video and preserves time while switching modes', () => {
  render(<Training feedbackMode="accessibility" strictness="standard" onFinish={vi.fn()} onExit={vi.fn()} />)
  const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
  Object.defineProperty(video, 'currentTime', { value: 8, writable: true })
  fireEvent.click(screen.getByRole('button', { name: '跟跳模式' }))
  expect(video.currentTime).toBe(8)
  fireEvent.click(screen.getByRole('button', { name: '教学模式' }))
  expect(video.currentTime).toBe(8)
})

it('seeks the shared video backward and forward by five seconds', () => {
  render(<Training feedbackMode="accessibility" strictness="standard" onFinish={vi.fn()} onExit={vi.fn()} />)
  const video = screen.getByLabelText('18.66 秒舞蹈示范') as HTMLVideoElement
  Object.defineProperty(video, 'currentTime', { value: 8, writable: true })
  fireEvent.click(screen.getByRole('button', { name: '后退 5 秒' }))
  expect(video.currentTime).toBe(3)
  fireEvent.click(screen.getByRole('button', { name: '前进 5 秒' }))
  expect(video.currentTime).toBe(8)
})
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- src/components/Training.test.tsx`

Expected: FAIL because the extracted component and real video do not exist.

- [ ] **Step 4: Implement the shared video player**

Import the movie URL from `src/assets/demo-dance.mp4`. Use one video ref, `timeupdate`, `loadedmetadata`, `play`, `pause`, and `ended` events. Transport buttons write clamped seconds through `seekBy`. Mode buttons update only the mode state so the video time is unchanged.

- [ ] **Step 5: Implement teaching segments**

In teaching mode, show three segments plus previous/repeat/next controls. Segment actions seek to the chosen segment start. Pause at the active segment end; do not automatically switch to follow mode. Hide segment controls in follow mode.

- [ ] **Step 6: Update app flow and results integration**

Keep feedback preference selection in setup, remove playback mode selection there, and pass the feedback mode to `Training`. On video completion, calculate deterministic results through the existing mock IMU source and open the existing results screen.

- [ ] **Step 7: Run focused and full tests**

Run: `npm test -- src/components/Training.test.tsx src/App.test.tsx && npm test`

Expected: all transport, mode, Pod, domain, and end-to-end component tests pass.

---

### Task 5: Verify and publish the single release commit

**Files:**
- Modify: all files above in the existing local commit.

**Interfaces:**
- Produces: remote `main` at a commit whose message is exactly `feat: deploy latest Daaance demo`.

- [ ] **Step 1: Run final repository checks**

Run: `npm test`

Expected: zero failing tests.

Run: `npm run build`

Expected: exit code 0 and a `dist/assets/*.mp4` artifact near 2.8 MB.

Run: `git diff --check && git status -sb`

Expected: no whitespace errors; only intended source, tests, docs, configuration, and video changes.

- [ ] **Step 2: Amend the already-created release commit**

Stage only intended paths and run `git commit --amend --no-edit`, preserving the exact message `feat: deploy latest Daaance demo`.

- [ ] **Step 3: Push `main` normally**

Run: `git push origin main`

Expected: remote `main` advances without force because the local release commit is a descendant of the old remote main.

---

### Task 6: Verify the existing Vercel production deployment

**Files:** none.

**Interfaces:**
- Consumes: the pushed GitHub commit and existing Vercel Git integration.
- Produces: evidence that the original `daaance-web-mvp` production project serves that commit.

- [ ] **Step 1: Poll the existing deployment only**

Use the Vercel project/deployment connection when available; otherwise inspect GitHub deployment/check status and the known production URL. Do not call any project-creation or direct-deploy operation.

- [ ] **Step 2: Verify the production page in a browser**

Confirm all four Pod cards reach `Demo · 50Hz`, enter training, switch `教学模式 / 跟跳模式` without resetting time, exercise `−5 秒 / +5 秒`, and confirm the video reports approximately 18.655 seconds and advances during playback.

- [ ] **Step 3: Capture final evidence**

Record the production URL, deployment status, commit SHA, test count, build exit status, video duration, and any console/runtime errors.
