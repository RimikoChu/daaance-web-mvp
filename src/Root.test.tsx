import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { cloneDefaultTimeline } from './domain/choreographyTimeline'
import { Root } from './Root'

describe('Root routing and choreography loading', () => {
  it('renders Studio only at /studio', () => {
    render(<Root path="/studio" loadTimeline={vi.fn()} />)
    expect(screen.getByRole('heading', { name: '关键拍编辑器' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /让身体/ })).not.toBeInTheDocument()
  })

  it('loads the latest timeline for the normal demo without blocking the home screen', async () => {
    const loadTimeline = vi.fn(async () => cloneDefaultTimeline())
    render(<Root path="/" loadTimeline={loadTimeline} />)

    expect(screen.getByRole('heading', { name: /让身体/ })).toBeInTheDocument()
    await waitFor(() => expect(loadTimeline).toHaveBeenCalledOnce())
  })
})
