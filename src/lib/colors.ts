import type { ColourThreshold } from '@/data/types'

// Status colours are deliberately separate from brand colours (PRD §11) so red-as-brand
// and red-as-alarm never collide.
export const STATUS = {
  ok: '#2ECC71',
  warn: '#F5A623',
  bad: '#FF3B3B',
  nodata: '#6B7280',
  prog: '#8B5CF6',
} as const
export const BRAND = { red: '#E4002B', yellow: '#FFD100' } as const
export const STATUS_COLORS = [STATUS.ok, STATUS.warn, STATUS.bad] as const

/** 0 = within threshold, 1 = degrading / at risk, 2 = breached / predicted to breach, -1 = no data */
export function statusOf(v: number | null | undefined, t: ColourThreshold): -1 | 0 | 1 | 2 {
  if (v === null || v === undefined || Number.isNaN(v)) return -1
  if (t.dir === 'high') return v >= t.green ? 0 : v >= t.amber ? 1 : 2
  return v < t.green ? 0 : v < t.amber ? 1 : 2
}

export function statusColor(s: number): string {
  return s === 0 ? STATUS.ok : s === 1 ? STATUS.warn : s === 2 ? STATUS.bad : STATUS.nodata
}

// Sequential ramp for non-status measures (revenue density): charcoal to IOH yellow.
export const SEQ = ['#2A2B2E', '#4A4320', '#7A6A1C', '#AE9212', '#E0B90A', '#FFD100']
export function seqColor(t: number): string {
  const i = Math.max(0, Math.min(SEQ.length - 1, Math.floor(t * SEQ.length)))
  return SEQ[i]
}

export const SERIES = ['#FFD100', '#5AA9E6', '#8B5CF6', '#2ECC71', '#F5A623', '#E4572E', '#A3AAB8']
