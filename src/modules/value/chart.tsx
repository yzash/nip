import clsx from 'clsx'
import type { ReactNode } from 'react'

// Shared Recharts styling for the command-center palette (PRD §11).
export const AXIS = { stroke: '#6B7280', tick: { fill: '#6B7280', fontSize: 11 }, tickLine: false, axisLine: { stroke: '#353B48' } } as const
export const GRID = { stroke: '#2A2F3A', strokeDasharray: '0', vertical: false } as const
export const TOOLTIP = {
  contentStyle: { background: '#1D212A', border: '1px solid #353B48', borderRadius: 0, fontSize: 12, color: '#F2F3F5', padding: '6px 10px' },
  labelStyle: { color: '#A3AAB8', marginBottom: 2 },
  itemStyle: { color: '#F2F3F5', padding: 0 },
  cursor: { fill: 'rgba(255,255,255,0.04)', stroke: '#353B48' },
} as const

export function LegendItem({ color, label, dash, square }: { color: string; label: ReactNode; dash?: boolean; square?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted">
      {square ? (
        <span className="inline-block h-2.5 w-2.5" style={{ background: color }} />
      ) : (
        <svg width="18" height="8" aria-hidden>
          <line x1="0" y1="4" x2="18" y2="4" stroke={color} strokeWidth="2" strokeDasharray={dash ? '4 3' : undefined} />
        </svg>
      )}
      {label}
    </span>
  )
}

/** Small stat block used in insight headers. */
export function Stat({ label, value, sub, tone, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'yellow'; className?: string }) {
  const tc = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'yellow' ? 'text-ioh-yellow' : 'text-ink'
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={clsx('tnum mt-0.5 text-lg font-semibold leading-6', tc)}>{value}</div>
      {sub && <div className="tnum text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function SyntheticNote({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-start gap-2 border border-warn/30 bg-warn/5 px-3 py-2 text-xs leading-5 text-muted', className)}>
      <span className="mt-[3px] inline-block h-2 w-2 shrink-0 bg-warn" />
      <span>
        <span className="font-semibold text-warn">Synthetic placeholders.</span> Every figure on this page is computed from generated data to show the metric and the method, not the number.
        Baselines, unit costs and targets are replaced with IOH figures in the validation session (PRD §3).
      </span>
    </div>
  )
}
