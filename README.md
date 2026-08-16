# Daaaance! Web MVP

48 小时硬件黑客松软件 Demo。默认使用 Mock IMU，无需连接硬件即可完成约 20 秒训练闭环。

## 本地运行

```bash
npm install
npm run dev
```

## 验证

```bash
npm test
npm run build
```

## 当前范围

- 中文四屏训练流程
- 固定编舞时间轴
- Mock IMU 峰值检测与节拍误差分析
- 无障碍模式与节奏教练模式
- 三档纠错严格度
- 结果汇总与一条教练建议

真实 BLE 数据源将在硬件通信稳定后接入；Mock 模式始终作为演示降级方案保留。
