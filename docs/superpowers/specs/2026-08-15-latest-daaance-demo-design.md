# Latest Daaance Demo Design

## Goal

Replace the outdated nested project on `main` with the latest deployable Daaance demo. The production page must connect four Pods, switch between teaching and follow-along playback, seek backward or forward by five seconds, and play the supplied 18.655-second dance video.

## Repository layout

The Vite application lives at the repository root. `package.json`, `index.html`, TypeScript configuration, and `src/` are root-level entries. The obsolete `daaance-web-mvp/` wrapper directory is removed. The supplied movie is copied to `src/assets/demo-dance.mp4` without changing its media payload.

## User flow

1. The home screen starts with four disconnected Pod cards and one `连接 4 个 Pods` action.
2. Activating the action starts all four connection indicators together. Each Pod attempts the existing Web Bluetooth adapter when available and otherwise settles into a reliable `Demo · 50Hz` state. The demo may continue when physical hardware is unavailable.
3. The setup screen retains feedback preferences and strictness but does not force a playback-mode choice.
4. The training screen contains a persistent `教学模式 / 跟跳模式` switch. Both modes control the same video and retain the current playback time when switched.
5. Teaching mode divides the 18.655-second video into three equal segments and exposes previous, repeat, and next-segment actions. Follow-along mode plays the full video continuously.
6. Both modes expose pause/play, `−5 秒`, and `+5 秒`. Seeking is clamped between zero and the video's duration.
7. Completion continues to use the existing deterministic IMU analysis and results screen.

## Components and data flow

- `App` owns the screen state, Pod state, feedback settings, and completed timing results.
- `PodConnectionPanel` exposes one coordinated connection action and renders the four independent connection outcomes.
- `Training` owns one `<video>` element. Native media events update elapsed time and completion state; every mode and transport action writes through that same element.
- A small playback helper handles duration clamping and teaching-segment calculations so boundary behavior is unit-testable without a browser media implementation.
- Existing domain types and mock motion analysis remain the hardware-compatible data boundary. No backend, database, or new Vercel project is introduced.

## Error handling

- Unsupported or rejected Web Bluetooth connections degrade per Pod to Demo 50Hz instead of blocking the flow.
- Video metadata failure leaves transport controls disabled and shows a clear media-unavailable message.
- Playback promise rejection keeps the player paused and preserves the current time.
- Seek and segment operations clamp to the known 18.655-second duration.

## Verification

Automated tests cover the coordinated four-Pod connection, training-mode switching, five-second seeking, video source/rendering, teaching segments, and the existing result flow. Before publishing, run the complete test script and `npm run build` from the repository root. After pushing `main`, confirm the existing Vercel project deploys that commit and exercise the production page in a browser, including actual video playback and duration.
