# Restore Original Daaance UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the visual hierarchy from Git commit `4b656b47e61f6b4bc65fe2269a2859d7348bfecc` while preserving the four-Pod connection flow, the 18.66-second video, teaching/follow-along modes, segment controls, and ±5-second seeking.

**Architecture:** Keep the root-level Vite project and existing domain/playback modules. Recompose `App.tsx` from the original Home, Setup, DeviceGrid, and Results markup, expose the existing Pod connection controller through a small imperative handle and state callback, and fit the current video controller into the original training stage frame.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest, Testing Library, Lucide React, Web Bluetooth.

## Global Constraints

- Original visual source of truth is commit `4b656b47e61f6b4bc65fe2269a2859d7348bfecc` under `daaance-web-mvp/src/`.
- Keep the application at repository root; do not restore the obsolete nested project directory.
- Keep `src/assets/demo-dance.mp4` byte-for-byte unchanged at 2,908,240 bytes.
- Keep one shared `<video>` element and preserve playback time across mode switches.
- Keep the existing Vercel project `prj_0DrxI4jvPlBTi4S5CXYhjzZRiwEp`; do not create another project.
- Use test-first RED/GREEN cycles for behavior changes.

---

### Task 1: Restore the original home composition around a compact Pod controller

**Files:**
- Modify: `src/components/PodConnectionPanel.tsx`
- Modify: `src/components/PodConnectionPanel.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces: `export type PodState = 'disconnected' | 'connecting' | 'hardware' | 'demo'`.
- Produces: `export type PodStates = Record<Limb, PodState>`.
- Produces: `export interface PodConnectionHandle { connect: () => void }`.
- Produces: `PodConnectionPanel` props `{ onReady: () => void; onStatesChange?: (states: PodStates) => void; variant?: 'panel' | 'compact' }`.
- Consumes: `DeviceGrid({ podStates?: PodStates, active?: Limb, error?: Limb })` in `App.tsx`.

- [ ] **Step 1: Add failing home-flow tests for the original layout and compact Pod action**

Replace the current `continueFromHome` assumptions in `src/App.test.tsx` with tests that require the original CTA and compact controller:

```tsx
it('restores the original home composition without the large Pod panel', () => {
  render(<App />)
  expect(screen.getByRole('heading', { name: /让身体/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '开始训练' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '连接 4 个 Pods' })).toBeInTheDocument()
  expect(document.querySelector('.pod-connection-panel')).not.toBeInTheDocument()
})

it('starts all four Pod connections from the original start CTA and opens setup when ready', async () => {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
  expect(screen.getAllByText('连接中…')).toHaveLength(4)
  await waitFor(() => expect(screen.getAllByText('Demo · 50Hz')).toHaveLength(4))
  expect(await screen.findByText('选择你的训练方式')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the home tests and verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: the test fails because the current home renders `.pod-connection-panel`, uses `继续设置`, and does not expose the original `开始训练` behavior.

- [ ] **Step 3: Add a failing component test for the compact controller API**

Append to `src/components/PodConnectionPanel.test.tsx`:

```tsx
it('renders a compact status action and reports every state transition', async () => {
  const onStatesChange = vi.fn()
  render(<PodConnectionPanel variant="compact" onReady={vi.fn()} onStatesChange={onStatesChange} />)
  expect(document.querySelector('.pod-connection-panel')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))
  await waitFor(() => expect(screen.getByText('4 / 4')).toBeInTheDocument())
  expect(onStatesChange).toHaveBeenCalledWith(expect.objectContaining({
    LEFT_WRIST: 'demo', RIGHT_WRIST: 'demo', LEFT_ANKLE: 'demo', RIGHT_ANKLE: 'demo',
  }))
})
```

- [ ] **Step 4: Run the component test and verify RED**

Run: `npm test -- src/components/PodConnectionPanel.test.tsx`

Expected: TypeScript/test failure because `variant` and `onStatesChange` are not implemented.

- [ ] **Step 5: Implement the minimal reusable Pod controller**

In `src/components/PodConnectionPanel.tsx`:

```tsx
export type PodState = 'disconnected' | 'connecting' | 'hardware' | 'demo'
export type PodStates = Record<Limb, PodState>
export interface PodConnectionHandle { connect: () => void }

export const PodConnectionPanel = forwardRef<PodConnectionHandle, {
  onReady: () => void
  onStatesChange?: (states: PodStates) => void
  variant?: 'panel' | 'compact'
}>(function PodConnectionPanel({ onReady, onStatesChange, variant = 'panel' }, ref) {
  // retain the existing sequential Bluetooth/GATT implementation
  useImperativeHandle(ref, () => ({ connect: connectPods }))
  useEffect(() => onStatesChange?.(states), [onStatesChange, states])

  if (variant === 'compact') return <section className="status-card pod-status-card" aria-label="连接四个 Pods">
    <Bluetooth size={17} />
    <div><strong>{isReady ? '4 / 4' : `${terminalCount} / 4`}</strong><span>{isReady ? 'Pods 已连接' : 'Pods 待连接'}</span></div>
    <button className="pod-compact-action" onClick={connectPods} disabled={isConnecting || isReady}>
      {isConnecting ? '连接中…' : isReady ? '已就绪' : '连接 4 个 Pods'}
    </button>
  </section>
  // retain the existing full panel return for focused component tests
})
```

Compute `terminalCount` from hardware/demo states and keep the current single-run, serialized chooser logic unchanged.

- [ ] **Step 6: Restore original Home, Setup, and Results markup**

Lift the corresponding markup and class names from:

```bash
git show 4b656b47e61f6b4bc65fe2269a2859d7348bfecc:daaance-web-mvp/src/App.tsx
```

Keep the root imports and current `Training` component. In `Home`, mount `PodConnectionPanel` as `variant="compact"`, retain the original `开始训练` button, and use a ref so either CTA triggers `connect()`. Store reported `PodStates` and pass them to the original four `DeviceGrid` chips. When `onReady` fires after a start request, call `onStart()` exactly once.

- [ ] **Step 7: Restore original base CSS and add only compact Pod modifiers**

Restore the original rules from:

```bash
git show 4b656b47e61f6b4bc65fe2269a2859d7348bfecc:daaance-web-mvp/src/styles.css
```

Then add these scoped additions without changing the original hero grid:

```css
.pod-status-card { gap: 12px; }
.pod-compact-action { border: 1px solid #d8ff3e66; border-radius: 9px; background: #d8ff3e12; color: #d8ff3e; padding: 7px 10px; cursor: pointer; font-size: 10px; font-weight: 700; }
.pod-compact-action:disabled { cursor: not-allowed; opacity: .55; }
```

- [ ] **Step 8: Run focused tests and verify GREEN**

Run: `npm test -- src/App.test.tsx src/components/PodConnectionPanel.test.tsx`

Expected: all focused tests pass, including original flow, compact rendering, four simultaneous connecting states, serialized GATT attempts, unique device IDs, and Demo 50 Hz fallback.

- [ ] **Step 9: Commit Task 1**

```bash
git add src/App.tsx src/App.test.tsx src/components/PodConnectionPanel.tsx src/components/PodConnectionPanel.test.tsx src/styles.css
git commit -m "fix: restore original Daaance home UI"
```

---

### Task 2: Fit the current video controls into the original training stage

**Files:**
- Modify: `src/components/Training.tsx`
- Modify: `src/components/Training.test.tsx`
- Modify: `src/styles.css`
- Keep unchanged: `src/assets/demo-dance.mp4`
- Keep unchanged: `src/playback.ts`
- Test: `src/playback.test.ts`

**Interfaces:**
- Consumes: `DANCE_DURATION_SECONDS`, `getSegmentBounds`, `getTeachingSegment`, and `seekBy` from `src/playback.ts`.
- Preserves: `TrainingProps` and the single `HTMLVideoElement` ref.

- [ ] **Step 1: Add a failing visual-structure regression test**

Append to `src/components/Training.test.tsx`:

```tsx
it('keeps the original training stage frame around the dance video', () => {
  renderTraining()
  const video = screen.getByLabelText('18.66 秒舞蹈示范')
  expect(video.closest('.teacher-stage')).toBeInTheDocument()
  expect(document.querySelector('.training-layout aside .device-grid')).toBeInTheDocument()
  expect(screen.getByText('示范舞段 · 基础律动')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the training test and verify RED**

Run: `npm test -- src/components/Training.test.tsx`

Expected: failure because the current video wrapper is only `.video-stage` and the original stage label is absent.

- [ ] **Step 3: Restore the stage-top and original frame classes**

In `src/components/Training.tsx`, keep the current toolbar, video event handlers, cue card, segment controls, and ±5 controls. Add the original stage header and wrap the single video with both original and media classes:

```tsx
<div className="stage-top">
  <span>示范舞段 · 基础律动</span>
  <strong>{Math.floor(currentTime).toString().padStart(2, '0')} / {Math.round(duration)} 秒</strong>
</div>
<div className="teacher-stage video-stage">
  <div className="beat-grid" />
  <video ref={videoRef} aria-label="18.66 秒舞蹈示范" src={demoDance} playsInline preload="metadata" />
  {/* retain the existing cue card */}
</div>
```

Do not introduce a second media element and do not alter playback state behavior.

- [ ] **Step 4: Add scoped media styling on top of the restored original CSS**

Append to `src/styles.css`:

```css
.training-toolbar { display: flex; justify-content: center; gap: 6px; margin-bottom: 12px; }
.training-toolbar button, .segment-tabs button, .segment-controls button { border: 1px solid #ffffff14; border-radius: 10px; background: #15181e; color: #aeb2ab; padding: 9px 15px; cursor: pointer; }
.training-toolbar button.selected, .segment-tabs button.selected { border-color: #d8ff3e; background: #d8ff3e; color: #11140b; font-weight: 700; }
.video-stage video { position: relative; z-index: 1; display: block; width: 100%; height: 100%; object-fit: contain; background: #050608; }
.video-stage .beat-grid, .video-stage .cue-card { z-index: 2; }
.playback-status { min-height: 18px; margin: 9px 0; color: #929690; text-align: center; font-size: 12px; }
.segment-panel { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.segment-tabs, .segment-controls { display: flex; gap: 7px; }
.training-toolbar button:disabled, .segment-tabs button:disabled, .segment-controls button:disabled, .controls button:disabled { opacity: .35; cursor: not-allowed; }
```

- [ ] **Step 5: Run playback and training tests and verify GREEN**

Run: `npm test -- src/components/Training.test.tsx src/playback.test.ts`

Expected: all tests pass, including exact duration thirds, mode time preservation, cross-boundary seeking, segment-end pause, media failure disabling, and one-shot finish.

- [ ] **Step 6: Commit Task 2**

```bash
git add src/components/Training.tsx src/components/Training.test.tsx src/styles.css
git commit -m "fix: restore original training layout"
```

---

### Task 3: Verify, publish, and validate the existing Vercel project

**Files:**
- Verify: `src/assets/demo-dance.mp4`
- Verify: repository working tree
- No new application files.

**Interfaces:**
- Consumes: GitHub repository `RimikoChu/daaance-web-mvp`, branch `main`.
- Consumes: Vercel project `prj_0DrxI4jvPlBTi4S5CXYhjzZRiwEp`.
- Produces: a `READY` production deployment aliased to `https://daaance-web-mvp.vercel.app`.

- [ ] **Step 1: Run the full verification suite**

```bash
npm test
npm run build
git diff --check
```

Expected: 5 test files pass, all tests pass, Vite emits `dist/assets/demo-dance-*.mp4`, and no whitespace errors are reported.

- [ ] **Step 2: Verify the video remained unchanged**

```bash
test "$(stat -f%z src/assets/demo-dance.mp4)" = "2908240"
cmp -s src/assets/demo-dance.mp4 '/Users/rimiko/Downloads/01ea57709f57bb89010370039f690922d5_4610.mp4?sign=548f98299bae75e872b7086223f6eb24&t=6a84e816video.MOV'
```

Expected: both commands exit 0.

- [ ] **Step 3: Review the corrective diff against the original visual source**

```bash
git diff 4b656b47e61f6b4bc65fe2269a2859d7348bfecc -- src/App.tsx src/styles.css src/components/Training.tsx src/components/PodConnectionPanel.tsx
```

Confirm that differences from the original UI are limited to the compact Pod action, live device states, video, teaching/follow-along controls, segment controls, and ±5-second seeking.

- [ ] **Step 4: Push the completed corrective commits to main**

```bash
git push origin main
```

If direct Git transport is unavailable, publish the same verified commit/tree through the authenticated GitHub Git Data API and verify the remote main tree SHA equals the local tree SHA.

- [ ] **Step 5: Verify the existing Vercel deployment**

Inspect the deployment attached to the new main commit. Confirm project ID `prj_0DrxI4jvPlBTi4S5CXYhjzZRiwEp`, target `production`, status `READY`, Git source branch `main`, the new commit SHA, and alias `https://daaance-web-mvp.vercel.app`.

- [ ] **Step 6: Verify the production artifact and UI behavior**

Confirm Vercel build logs include:

```text
npm run build
dist/index.html
dist/assets/demo-dance-*.mp4  2,908.24 kB
Deployment completed
```

Verify the four Pod states, compact connection action, original Home/Setup/Results visual hierarchy, teaching/follow-along switching, ±5-second seeking, three teaching segments, and 18.66-second media readiness. If the execution environment cannot route `*.vercel.app`, document that limitation and cross-check the exact deployed commit using Vercel build metadata plus the full browser/test suite.
