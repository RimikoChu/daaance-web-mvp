import type { ChoreographyEvent, Limb, Strictness } from './types'

export const DANCE_DURATION = 20_000

export const CHOREOGRAPHY: ChoreographyEvent[] = [
  { id: 'c1', time: 2000, limb: 'LEFT_WRIST', cue: 'MOVE', accent: false, voice: '左手' },
  { id: 'c2', time: 3200, limb: 'RIGHT_WRIST', cue: 'MOVE', accent: true, voice: '右手' },
  { id: 'c3', time: 4500, limb: 'LEFT_ANKLE', cue: 'STEP', accent: false, voice: '左脚' },
  { id: 'c4', time: 5700, limb: 'RIGHT_ANKLE', cue: 'STEP', accent: true, voice: '右脚' },
  { id: 'c5', time: 7200, limb: 'LEFT_WRIST', cue: 'MOVE', accent: false, voice: '向左' },
  { id: 'c6', time: 8400, limb: 'RIGHT_WRIST', cue: 'MOVE', accent: false, voice: '向右' },
  { id: 'c7', time: 9800, limb: 'LEFT_ANKLE', cue: 'STEP', accent: true, voice: '踩点' },
  { id: 'c8', time: 11200, limb: 'RIGHT_ANKLE', cue: 'STEP', accent: false, voice: '右脚' },
  { id: 'c9', time: 12800, limb: 'LEFT_WRIST', cue: 'MOVE', accent: true, voice: '打开' },
  { id: 'c10', time: 14300, limb: 'RIGHT_WRIST', cue: 'MOVE', accent: false, voice: '转身' },
  { id: 'c11', time: 16000, limb: 'LEFT_ANKLE', cue: 'STEP', accent: false, voice: '左脚' },
  { id: 'c12', time: 17800, limb: 'RIGHT_ANKLE', cue: 'STEP', accent: true, voice: '定格' },
]

export const TOLERANCE: Record<Strictness, number> = {
  beginner: 400,
  standard: 250,
  advanced: 150,
}

export const LIMB_LABEL: Record<Limb, string> = {
  LEFT_WRIST: '左手腕',
  RIGHT_WRIST: '右手腕',
  LEFT_ANKLE: '左脚踝',
  RIGHT_ANKLE: '右脚踝',
}
