import { RotateCcw } from 'lucide-react'
import { buildTrainingExport, buildTrainingReport } from '../trainingReview/report'
import type { MotionErrorEvent, TrainingSessionSnapshot } from '../trainingReview/types'

export interface TrainingReportProps {
  snapshot: TrainingSessionSnapshot
  onReviewTime: (timestamp: number) => void
  onAgain: () => void
  onHome: () => void
}

const LIMB_LABEL: Record<MotionErrorEvent['limb'], string> = {
  left_wrist: '左手腕',
  right_wrist: '右手腕',
  left_ankle: '左脚踝',
  right_ankle: '右脚踝',
}
const LIMB_ACCESSIBLE_LABEL: Record<MotionErrorEvent['limb'], string> = {
  left_wrist: 'left wrist',
  right_wrist: 'right wrist',
  left_ankle: 'left ankle',
  right_ankle: 'right ankle',
}
const TYPES: Array<[MotionErrorEvent['type'], string]> = [
  ['timing', 'Timing'],
  ['direction', 'Direction'],
  ['range', 'Range'],
]
const LIMBS: MotionErrorEvent['limb'][] = ['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle']

const formatTime = (milliseconds: number): string => `${(milliseconds / 1000).toFixed(2)} s`

const feedbackDetails = (feedback: ReturnType<typeof buildTrainingReport>['rows'][number]['feedback']): string => {
  const sentAt = feedback.sentAt === undefined ? undefined : `sent ${feedback.sentAt} ms`
  if (feedback.executionStatus === 'failed') return [sentAt, feedback.failureReason].filter(Boolean).join(' · ')
  if (feedback.executionStatus !== 'executed') return sentAt ?? ''
  return [
    sentAt,
    feedback.outputs?.join(', '),
    feedback.hardwareTimestamp === undefined ? undefined : `hardware ${feedback.hardwareTimestamp} ms`,
    feedback.receivedAt === undefined ? undefined : `received ${feedback.receivedAt} ms`,
    feedback.latencyMs === undefined ? undefined : `latency ${feedback.latencyMs} ms`,
  ].filter(Boolean).join(' · ')
}

export function TrainingReport({ snapshot, onReviewTime, onAgain, onHome }: TrainingReportProps) {
  const report = buildTrainingReport(snapshot)
  const exportJson = () => {
    const json = JSON.stringify(buildTrainingExport(snapshot), null, 2)
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `daaaance-session-${snapshot.sessionId}.json`
    document.body.append(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return <main className="page-shell results-page report-page soft-glass-theme">
    <nav><div className="logo"><span>Daaaance!</span><i /></div><button className="text-button" onClick={onHome}>返回首页</button></nav>
    <section className="report-head">
      <div><span>训练记录已生成</span><h1>训练复盘报告</h1><p>按独立动作误差回看本次训练；硬件执行状态只在收到确认后标记为已执行。</p></div>
      <button className="report-export" type="button" onClick={exportJson}>导出 JSON</button>
    </section>
    <section className="report-totals" aria-label="训练复盘汇总">
      <div><small>独立误差</small><strong>{report.totalErrors}</strong></div>
      <div><small>复盘区间</small><strong>{report.totalReviewRanges}</strong></div>
    </section>
    <section className="report-breakdown" aria-label="误差分类统计">
      <div className="report-count-section"><h2>按四肢</h2><div className="report-count-grid">{LIMBS.map(limb => <div key={limb}><span>{LIMB_LABEL[limb]}</span><strong>{report.countsByLimb[limb]}</strong></div>)}</div></div>
      <div className="report-count-section"><h2>按类型</h2><div className="report-count-grid">{TYPES.map(([type, label]) => <div key={type}><span>{label}</span><strong>{report.countsByType[type]}</strong></div>)}</div></div>
    </section>
    <section className="report-errors" aria-labelledby="report-errors-title">
      <div className="report-section-heading"><div><span>逐条记录</span><h2 id="report-errors-title">误差与反馈执行</h2></div><small>按视频时间排序</small></div>
      <div className="report-table" role="table" aria-label="训练误差记录">
        <div className="report-table-head" role="row"><span>时间 / 动作</span><span>来源与检测器</span><span>反馈命令与 ACK</span><span>复盘</span></div>
        {report.rows.map(({ error, sourceLabel, feedback }) => <div className="report-row" role="row" aria-label={`${LIMB_ACCESSIBLE_LABEL[error.limb]}, ${error.type}, ${error.severity}, ${sourceLabel}`} key={error.id}>
          <div><strong>{formatTime(error.timestamp)}</strong><span>{LIMB_LABEL[error.limb]} · {error.type} · {error.severity}</span></div>
          <div><strong className={`report-source ${error.source}`}>{sourceLabel}</strong><span>{error.detector}</span></div>
          <div><strong className={`report-feedback ${feedback.executionStatus}`}>{feedback.label}</strong><span>{feedbackDetails(feedback)}</span></div>
          <button type="button" onClick={() => onReviewTime(error.timestamp)} aria-label="Review moment">回看</button>
        </div>)}
      </div>
    </section>
    <div className="result-actions report-actions"><button className="secondary" onClick={onHome}>回到首页</button><button className="primary" onClick={onAgain}><RotateCcw size={18} /> 再跳一次</button></div>
  </main>
}
