import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from './App'

describe('Daaance training flow', () => {
  it('moves from home to setup', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
    expect(screen.getByText('选择你的训练方式')).toBeInTheDocument()
  })

  it('starts accessibility training without voice controls', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
    fireEvent.click(screen.getByRole('button', { name: /无障碍模式/ }))
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    expect(screen.getByText('无障碍模式')).toBeInTheDocument()
    expect(screen.queryByText('语音提示')).not.toBeInTheDocument()
  })

  it('shows results when the accelerated demo completes', async () => {
    vi.useFakeTimers()
    render(<App demoDuration={100} />)
    fireEvent.click(screen.getByRole('button', { name: '开始训练' }))
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    await vi.advanceTimersByTimeAsync(250)
    expect(screen.getByText('本次训练完成')).toBeInTheDocument()
    expect(screen.getByText('节奏准确率')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
