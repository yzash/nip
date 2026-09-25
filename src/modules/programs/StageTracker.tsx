import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { Program } from '@/data/types'
import { addDays, dateShort, daysBetween } from '@/lib/format'
import { PARALLEL, STAGE_NO, stageSlaDays, timeline, type TimelineRow } from './lib'

// Stage tracker (PRD §6 M5, §8): nine stages on a time axis with the actual dates from
// stage_history, planned dates for what is still ahead, the parallel BOQ / PO / vendor lanes of
// NICC programs, and Stage 6b (tower company) as its own lane.

const LABEL_W = 262
const ROW_H = 26

export function StageTracker({ p, today }: { p: Program; today: string }) {
  const rows = timeline(p, today)
  const tc = p.tower_company_clock
  const lanes: ({ kind: 'stage'; row: TimelineRow } | { kind: 'tower' })[] = []
  for (const r of rows) {
    lanes.push({ kind: 'stage', row: r })
    if (r.stage === 'Vendor allocation' && tc) lanes.push({ kind: 'tower' })
  }
  const starts = [p.start, ...rows.map((r) => r.start), ...(tc ? [tc.requested] : [])]
  const d0 = starts.reduce((m, x) => (x < m ? x : m), starts[0])
  const rfs = p.forecast_rfs > p.target_rfs ? p.forecast_rfs : p.target_rfs
  const spanDays = Math.max(21, daysBetween(d0, rfs))
  const pad = Math.max(4, Math.round(spanDays * 0.12))
  const d1 = addDays(rfs, pad)
  const total = daysBetween(d0, d1)
  const x = (d: string) => Math.max(0, Math.min(100, (daysBetween(d0, d) / total) * 100))
  const weekly = total <= 84
  const ticks: string[] = []
  if (weekly) {
    for (let k = 0; k <= total; k += 7) ticks.push(addDays(d0, k))
  } else {
    let [y, m] = d0.split('-').map(Number)
    for (;;) {
      m += 1
      if (m > 12) {
        m = 1
        y += 1
      }
      const d = `${y}-${String(m).padStart(2, '0')}-01`
      if (d > d1) break
      ticks.push(d)
    }
  }
  const nicc = p.managed_by === 'nicc'
  const parIdx = lanes.map((l, i) => (l.kind === 'stage' && PARALLEL.includes(l.row.stage) ? i : -1)).filter((i) => i >= 0)
  const slip = daysBetween(p.target_rfs, p.forecast_rfs)

  return (
    <div className="select-none">
      <div className="relative" style={{ paddingLeft: LABEL_W }}>
        {/* axis */}
        <div className="relative h-6 border-b border-line">
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 text-[10px] text-faint" style={{ left: `${x(t)}%` }}>
              <div className="h-6 whitespace-nowrap border-l border-line pl-1 leading-6">{x(t) > 95 ? '' : weekly ? dateShort(t) : dateShort(t).slice(3)}</div>
            </div>
          ))}
        </div>
        {/* lanes */}
        <div className="relative">
          {/* grid lines */}
          {ticks.map((t) => (
            <div key={t} className="pointer-events-none absolute inset-y-0 border-l border-line/60" style={{ left: `${x(t)}%` }} />
          ))}
          {nicc && parIdx.length > 1 && (
            <div
              className="pointer-events-none absolute left-0 right-0 border-y border-dashed border-ioh-yellow/25 bg-ioh-yellow/[0.035]"
              style={{
                top: parIdx[0] * ROW_H,
                height: (parIdx[parIdx.length - 1] - parIdx[0] + 1) * ROW_H + (tc && parIdx.length ? ROW_H : 0),
              }}
            >
              <span className="absolute right-1.5 top-0.5 text-[9.5px] font-semibold uppercase tracking-wider text-ioh-yellow/60">parallel · 4 ∥ 5 ∥ 6{tc ? ' ∥ 6b' : ''}</span>
            </div>
          )}
          {lanes.map((l, i) => (
            <div key={i} className="relative border-b border-line/50" style={{ height: ROW_H }}>
              <div className="absolute top-0 flex h-full items-center gap-2 pr-3 text-xs" style={{ left: -LABEL_W, width: LABEL_W }}>
                {l.kind === 'stage' ? <StageLabel p={p} r={l.row} /> : <TowerLabel p={p} today={today} />}
              </div>
              {l.kind === 'stage' ? <StageBar r={l.row} x={x} p={p} /> : <TowerBar p={p} x={x} today={today} />}
            </div>
          ))}
          {/* markers */}
          <Marker left={x(today)} color="#FFD100" solid />
          <Marker left={x(p.target_rfs)} color="#2ECC71" />
          {slip > 0 && <Marker left={x(p.forecast_rfs)} color="#FF3B3B" />}
        </div>
        {/* marker labels, greedily stacked so they never collide */}
        <MarkerLabels
          items={[
            {
              left: x(today),
              label: `Today ${dateShort(today)}`,
              color: '#FFD100',
            },
            {
              left: x(p.target_rfs),
              label: `Target RFS ${dateShort(p.target_rfs)}`,
              color: '#2ECC71',
            },
            ...(slip > 0
              ? [
                  {
                    left: x(p.forecast_rfs),
                    label: `Forecast ${dateShort(p.forecast_rfs)} (+${slip} d)`,
                    color: '#FF3B3B',
                  },
                ]
              : []),
          ]}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-faint">
        <Legend swatch={<span className="inline-block h-2.5 w-5 bg-[#5B6273]" />} label="Done (actual dates)" />
        <Legend swatch={<span className="inline-block h-2.5 w-5 bg-ioh-yellow" />} label="In progress" />
        <Legend swatch={<span className="inline-block h-2.5 w-5 border border-dashed border-muted" />} label="Planned" />
        {nicc && <Legend swatch={<span className="inline-block h-2.5 w-5 border-y border-dashed border-ioh-yellow/50 bg-ioh-yellow/10" />} label="Stages 4, 5, 6 and 6b run in parallel" />}
        {tc && <Legend swatch={<span className="inline-block h-2.5 w-5 border border-warn bg-warn/20" />} label="6b tower company SLA window" />}
      </div>
    </div>
  )
}

function Legend({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      {label}
    </span>
  )
}

function Marker({ left, color, solid }: { left: number; color: string; solid?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute inset-y-0 w-0 border-l"
      style={{
        left: `${left}%`,
        borderColor: color,
        borderStyle: solid ? 'solid' : 'dashed',
      }}
    />
  )
}

function MarkerLabels({ items }: { items: { left: number; label: string; color: string }[] }) {
  // Approximate label width as a share of an ~800 px track.
  const est = (t: string) => ((t.length * 5.8 + 8) / 800) * 100
  const placed: {
    left: number
    label: string
    color: string
    lane: number
    x0: number
    x1: number
  }[] = []
  for (const it of [...items].sort((a, b) => a.left - b.left)) {
    const w = est(it.label)
    const x0 = it.left < 8 ? it.left : it.left > 88 ? it.left - w : it.left - w / 2
    const x1 = x0 + w
    let lane = 0
    while (placed.some((p) => p.lane === lane && x0 < p.x1 && x1 > p.x0)) lane++
    placed.push({ ...it, lane, x0, x1 })
  }
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1))
  return (
    <div className="relative" style={{ height: 6 + lanes * 13 }}>
      {placed.map((it) => (
        <div
          key={it.label}
          className="absolute whitespace-nowrap text-[10px] font-semibold"
          style={{
            left: `${it.left}%`,
            top: 3 + it.lane * 13,
            color: it.color,
            transform: `translateX(${it.left < 8 ? '0%' : it.left > 88 ? '-100%' : '-50%'})`,
          }}
        >
          {it.label}
        </div>
      ))}
    </div>
  )
}

function StageLabel({ p, r }: { p: Program; r: TimelineRow }) {
  const dur = Math.max(0, daysBetween(r.start, r.end))
  const sla = stageSlaDays(p, r.stage)
  const over = r.state !== 'planned' && r.stage !== 'Validation' && dur > sla && sla > 0
  return (
    <>
      <span className={clsx('w-6 shrink-0 text-right font-mono text-[10.5px]', r.state === 'current' ? 'text-ioh-yellow' : 'text-faint')}>{STAGE_NO[r.stage]}</span>
      <span className={clsx('w-[104px] shrink-0 truncate', r.state === 'planned' ? 'text-muted' : 'font-medium text-ink')}>{r.stage}</span>
      <span className={clsx('tnum truncate text-[10.5px]', r.state === 'planned' ? 'italic text-faint' : over ? 'text-warn' : 'text-muted')} title={`SLA ${sla} d`}>
        {r.stage === 'Validation' && r.state === 'planned'
          ? `from ${dateShort(r.start)}`
          : r.state === 'current'
            ? dur > 0
              ? `since ${dateShort(r.start)} · ${dur} d`
              : `since ${dateShort(r.start)}`
            : `${dateShort(r.start)} · ${dur} d`}
      </span>
    </>
  )
}

function StageBar({ r, x, p }: { r: TimelineRow; x: (d: string) => number; p: Program }) {
  const l = x(r.start)
  const w = Math.max(0.6, x(r.end) - l)
  const color = p.health === 'late' ? '#FF3B3B' : p.health === 'at_risk' ? '#F5A623' : '#FFD100'
  return (
    <div
      className={clsx('absolute top-[7px] h-3', r.state === 'planned' && 'border border-dashed border-muted/70')}
      style={{
        left: `${l}%`,
        width: `${w}%`,
        background: r.state === 'done' ? '#5B6273' : r.state === 'current' ? color : 'transparent',
      }}
      title={`${r.stage}: ${dateShort(r.start)} → ${dateShort(r.end)} (${r.state})`}
    />
  )
}

function TowerLabel({ p, today }: { p: Program; today: string }) {
  const tc = p.tower_company_clock!
  const left = daysBetween(today, tc.due)
  return (
    <>
      <span className="w-6 shrink-0 text-right font-mono text-[10.5px] text-faint">6b</span>
      <span className="w-[104px] shrink-0 truncate font-medium text-ink">Tower co access</span>
      <span className={clsx('tnum truncate text-[10.5px]', tc.status === 'overdue' ? 'text-bad' : tc.status === 'approved' ? 'text-ok' : 'text-warn')}>
        {tc.status === 'approved' ? 'approved' : tc.status === 'overdue' ? `${Math.abs(left)} d overdue` : `${left} d left`}
      </span>
    </>
  )
}

function TowerBar({ p, x, today }: { p: Program; x: (d: string) => number; today: string }) {
  const tc = p.tower_company_clock!
  const l = x(tc.requested)
  const w = Math.max(0.6, x(tc.due) - l)
  const c = tc.status === 'overdue' ? '#FF3B3B' : tc.status === 'approved' ? '#2ECC71' : '#F5A623'
  const elapsedEnd = tc.status === 'approved' ? tc.due : today
  return (
    <>
      <div
        className="absolute top-[7px] h-3 border"
        style={{
          left: `${l}%`,
          width: `${w}%`,
          borderColor: c,
          background: `${c}22`,
        }}
        title={`${tc.tower_company}: requested ${dateShort(tc.requested)}, due ${dateShort(tc.due)} (${tc.sla_days} d SLA)`}
      />
      <div
        className="absolute top-[10px] h-1.5"
        style={{
          left: `${l}%`,
          width: `${Math.max(0, x(elapsedEnd) - l)}%`,
          background: c,
        }}
      />
    </>
  )
}
