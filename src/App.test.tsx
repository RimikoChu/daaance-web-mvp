import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Daaance training flow', () => {
  async function continueFromHome() {
    fireEvent.click(screen.getByRole('button', { name: '连接 4 个 Pods' }))
    await waitFor(() => expect(
      screen.queryAllByText('硬件 · 已连接').length + screen.queryAllByText('Demo · 50Hz').length,
    ).toBe(4))
    await waitFor(() => expect(screen.getByRole('button', { name: '继续设置' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '继续设置' }))
  }

  it('moves from home to setup after all Pods are ready', async () => {
    render(<App />)
    await continueFromHome()
    expect(screen.getByText('选择你的训练方式')).toBeInTheDocument()
  })

  it('starts accessibility training without voice controls', async () => {
    render(<App />)
    await continueFromHome()
    fireEvent.click(screen.getByRole('button', { name: /无障碍模式/ }))
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    expect(screen.getByText('无障碍模式')).toBeInTheDocument()
    expect(screen.queryByText('语音提示')).not.toBeInTheDocument()
  })

  it('keeps playback mode selection inside training', async () => {
    render(<App />)
    await continueFromHome()
    expect(screen.queryByRole('button', { name: '教学模式' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '跟跳模式' })).not.toBeInTheDocument()
  })

  it('shows deterministic results when the video completes', async () => {
    render(<App />)
    await continueFromHome()
    fireEvent.click(screen.getByRole('button', { name: '开始舞蹈' }))
    fireEvent.ended(screen.getByLabelText('18.66 秒舞蹈示范'))
    expect(screen.getByText('本次训练完成')).toBeInTheDocument()
    expect(screen.getByText('节奏准确率')).toBeInTheDocument()
  })
})
