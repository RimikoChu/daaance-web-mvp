import { useEffect, useState } from 'react'
import App from './App'
import { CHOREOGRAPHY } from './domain/choreography'
import { toChoreographyEvents, type ChoreographyTimeline } from './domain/choreographyTimeline'
import type { ChoreographyEvent } from './domain/types'
import { Studio } from './studio/Studio'
import { loadChoreography } from './studio/choreographyClient'

interface RootProps {
  path?: string
  loadTimeline?: () => Promise<ChoreographyTimeline>
}

export function Root({ path = window.location.pathname, loadTimeline = loadChoreography }: RootProps) {
  const [choreography, setChoreography] = useState<ChoreographyEvent[]>(CHOREOGRAPHY)

  useEffect(() => {
    if (path === '/studio') return
    let active = true
    loadTimeline().then(timeline => {
      if (active) setChoreography(toChoreographyEvents(timeline))
    }).catch(() => undefined)
    return () => { active = false }
  }, [loadTimeline, path])

  if (path === '/studio') return <Studio />
  return <App choreography={choreography} />
}
