# Daaance! Web MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建可在线部署、无硬件也能完成 20 秒训练闭环的 Daaance! 中文 Web Demo。

**Architecture:** React 单页状态机负责四屏流转；纯 TypeScript 领域模块定义编舞、数据源和时序分析；Mock 数据源按固定种子生成可复现训练结果。BLE 仅以同接口占位，任何失败均回退 Mock。

**Tech Stack:** React 19、Vite、TypeScript、Vitest、CSS

## Global Constraints

- 无登录、无数据库、无后端。
- 固定一段约 20 秒编舞。
- 默认 Mock 模式，硬件不能成为关键路径。
- 中文 UI；Accessibility 模式不使用语音。
- No feedback = keep dancing；不使用黄灯和绿灯。

---

### Task 1: 领域算法与 Mock 数据源

**Files:**
- Create: `src/domain/types.ts`
- Create: `src/domain/choreography.ts`
- Create: `src/domain/motion.ts`
- Create: `src/domain/mockMotionDataSource.ts`
- Test: `src/domain/motion.test.ts`

**Interfaces:**
- Produces: `MotionDataSource`, `detectPeak`, `analyzeTiming`, `summarizeSession`

- [ ] 先写测试，覆盖容差内正确、早拍、慢拍、缺失动作和汇总准确率。
- [ ] 运行测试并确认因实现缺失而失败。
- [ ] 实现最小领域逻辑与固定编舞。
- [ ] 运行测试并确认通过。

### Task 2: 四屏训练体验

**Files:**
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Create: `src/main.tsx`
- Create: `index.html`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: Task 1 的固定编舞、Mock 数据源和汇总结果。
- Produces: 首页、设置、训练、结果四屏完整交互。

- [ ] 先写关键流程测试：开始训练、选择模式、完成后显示结果。
- [ ] 运行测试并确认失败。
- [ ] 实现四屏 UI、20 秒计时、播放控制、Pod 状态和即时反馈。
- [ ] 运行测试并确认通过。

### Task 3: 工程化与部署准备

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: `npm run dev`、`npm test`、`npm run build`。

- [ ] 配置依赖、测试环境和 Vercel 兼容构建。
- [ ] 安装依赖并运行完整测试。
- [ ] 运行生产构建。
- [ ] 本地预览并验证四屏关键流程。
- [ ] 初始化 Git 仓库并提交可部署版本。

### Task 4: GitHub 与 Vercel 发布

**Files:**
- Modify: Git remote and hosted project configuration only.

**Interfaces:**
- Consumes: Task 3 的可构建 Git 仓库。
- Produces: GitHub 仓库地址和 Vercel 预览地址。

- [ ] 检查 GitHub/Vercel 授权状态。
- [ ] 创建仓库并推送主分支。
- [ ] 导入 Vercel，等待部署成功。
- [ ] 打开线上地址验证核心流程。
