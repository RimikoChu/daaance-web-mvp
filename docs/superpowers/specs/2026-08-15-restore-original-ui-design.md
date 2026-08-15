# Restore Original Daaance UI Design

## Goal

Restore the visual design and page flow from Git commit `4b656b47e61f6b4bc65fe2269a2859d7348bfecc` while retaining the current root-level Vite project structure, the 18.66-second dance video, four-Pod connection behavior, teaching/follow-along playback modes, segment controls, and ±5-second seeking.

## Source of Truth

- Original visual design: `daaance-web-mvp/src/App.tsx` and `daaance-web-mvp/src/styles.css` at commit `4b656b47e61f6b4bc65fe2269a2859d7348bfecc`.
- Current functional implementation: root-level `src/components/PodConnectionPanel.tsx`, `src/components/Training.tsx`, and `src/playback.ts`.
- Video asset: root-level `src/assets/demo-dance.mp4`, 2,908,240 bytes and approximately 18.66 seconds.
- Deployment structure: the application remains at repository root because the existing Vercel project now uses the repository root as its Root Directory.

## Visual Restoration

### Home

Restore the original navigation, hero copy, dancer illustration, device strip, spacing, typography, colors, and primary `开始训练` call to action. Remove the large connection panel that displaced the original hero composition.

Add only a compact `连接 4 个 Pods` action beside the original `4 / 4 Pods 已连接` status card. The status card and four device chips reflect disconnected, connecting, hardware, or demo states without changing the original grid geometry.

Clicking `开始训练` before all Pods reach a terminal state starts the same four-Pod connection process. Once all Pods are hardware-connected or placed in demo mode, the original setup page opens. Clicking the compact connection action starts the same process without navigating.

### Setup and Results

Restore the original markup, labels, layout, and styling. Retain the existing training-mode and strictness behavior. No new panels or visual hierarchy changes are introduced.

### Training

Preserve the original training header, sidebar, Pod device grid, stage framing, timing information, timeline, and control placement. Replace only the stylized teacher figure inside the original stage with the supplied dance video.

Add the following controls using the existing visual language:

- `教学模式` and `跟跳模式` switch above the stage.
- `−5 秒` and `+5 秒` controls around the existing play/pause control.
- Three teaching segments with previous, repeat, and next actions.

Teaching mode pauses at segment boundaries and updates the selected segment when seeking across a boundary. Follow-along mode plays the same single video continuously. Switching modes preserves the current playback time.

## Pod Connection Behavior

The app represents four fixed Pod slots: left wrist, right wrist, left ankle, and right ankle. A connection attempt marks all four slots as connecting immediately, requests Web Bluetooth devices serially, and requires a successful GATT connection for hardware status. Any unavailable or failed slot transitions to the 50 Hz demo data source so the user can complete the demo without physical hardware.

The user may enter setup only when every slot is in hardware or demo state. Repeated clicks while connecting are ignored.

## Media Failure Behavior

If video metadata is invalid or the media fails to load, playback stops, a stable error message is shown, and all playback, mode, segment, and seeking controls are disabled. The rest of the original UI remains usable, including exiting training.

## Testing

Tests must prove:

- The restored home retains the original primary content and no longer renders the large connection panel.
- A compact `连接 4 个 Pods` action exists and all four slots enter connecting state together.
- Setup and results retain their original flow.
- Teaching/follow-along switching preserves time.
- ±5-second controls clamp correctly and update teaching segments across boundaries.
- The single video reports the expected duration and segment boundaries.
- Media failure disables every playback-related control.
- The full test suite and `npm run build` pass before pushing.

## Deployment

Push the corrective change to `main` in the existing `RimikoChu/daaance-web-mvp` repository. Do not recreate the Vercel project. Confirm the existing project `prj_0DrxI4jvPlBTi4S5CXYhjzZRiwEp` deploys the new main commit with status `READY` and keeps `https://daaance-web-mvp.vercel.app` assigned.
