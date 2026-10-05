import clsx from 'clsx'
import { addDays, dateShort } from '@/lib/format'
import type { PlanDraft } from '@/lib/plan'
import { day0 } from './shared'

const PARALLEL = new Set(['BOQ', 'PO & stock', 'Vendor', 'Tower co'])
const ROW = 30
const LABEL_W = 196

/**
 * Critical path (PRD §8). Stages 4, 5, 6 and 6b start together the day after the Stage 3
 * decision; Stage 7 is physical work. Critical items are yellow; breach, bridge and RFS marked.
 */
export function CriticalPath({ d }: { d: PlanDraft }) {
  const start = day0(d)
  const items = d.critical_path
  const lanes: string[] = []
  for (const it of items) if (!lanes.includes(it.lane)) lanes.push(it.lane)
  const win = d.window_days
  const max = Math.ceil((Math.max(d.rfs_days, win ?? 0, d.bridge?.days ?? 0) + 4) / 7) * 7
  const pct = (x: number) => (x / max) * 100
  const days = Array.from({ length: max + 1 }, (_, k) => k)
  const par = items.filter((i) => PARALLEL.has(i.lane))
  const parIdx = lanes.map((l, k) => (PARALLEL.has(l) ? k : -1)).filter((k) => k >= 0)
  const parStart = Math.min(...par.map((p) => p.start))
  const parEnd = Math.max(...par.map((p) => p.end))

  const markers = [
    ...(d.bridge ? [{ at: d.bridge.days, color: '#2ECC71', label: `Bridge live D+${d.bridge.days}`, dashed: false }] : []),
    ...(win !== null ? [{ at: win, color: '#FF3B3B', label: `Predicted breach D+${win} · ${dateShort(addDays(start, win))}`, dashed: true }] : []),
    { at: d.rfs_days, color: '#FFD100', label: `Target RFS D+${d.rfs_days} · ${dateShort(d.target_rfs)}`, dashed: false },
  ].sort((a, b) => a.at - b.at)
  // one label row per marker, so labels never collide
  const rows = markers.map((_, k) => k)
  const MARK_H = 16 * markers.length + 4
  const AXIS_H = 30

  return (
    <div className="px-4 pb-3 pt-3">
      <div className="flex">
        <div className="shrink-0" style={{ width: LABEL_W }}>
          <div style={{ height: AXIS_H + MARK_H }} className="flex items-end pb-1 text-2xs font-semibold uppercase tracking-wider text-faint">
            Stage
          </div>
          {lanes.map((l) => {
            const crit = items.some((i) => i.lane === l && i.critical)
            const first = items.find((i) => i.lane === l)!
            return (
              <div key={l} style={{ height: ROW }} className="flex items-center gap-2 border-t border-line/60 pr-3">
                <span className={clsx('h-2 w-2 shrink-0', crit ? 'bg-ioh-yellow' : 'border border-[#5AA9E6]/70')} />
                <span className={clsx('truncate text-xs', PARALLEL.has(l) ? 'text-ink' : 'text-muted')}>{first.stage.replace(/ — wave \d.*$/, '')}</span>
              </div>
            )
          })}
        </div>
        <div className="relative min-w-0 flex-1">
          {/* axis: day ticks, week labels */}
          <div className="relative" style={{ height: AXIS_H }}>
            {days.map((k) => (
              <div key={k} className="absolute bottom-0" style={{ left: `${pct(k)}%` }}>
                <div className={clsx('absolute bottom-0 w-px', k % 7 === 0 ? 'h-2.5 bg-line2' : 'h-1 bg-line')} />
                {k % 7 === 0 && k < max && (
                  <div className={clsx('tnum absolute bottom-3 whitespace-nowrap text-[10px] leading-3', k === 0 ? '' : k === max ? '-translate-x-full' : '-translate-x-1/2')}>
                    <span className="font-semibold text-muted">{k === 0 ? 'D0' : `W${k / 7}`}</span> <span className="text-faint">{dateShort(addDays(start, k))}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {/* marker labels */}
          <div className="relative" style={{ height: MARK_H }}>
            {markers.map((m, k) => {
              const right = pct(m.at) > 70
              return (
                <div key={m.label} className={clsx('tnum absolute whitespace-nowrap px-1 text-[10px] font-semibold', right && '-translate-x-full')} style={{ left: `${pct(m.at)}%`, top: 2 + rows[k] * 16, color: m.color, borderLeft: right ? undefined : `1.5px solid ${m.color}`, borderRight: right ? `1.5px solid ${m.color}` : undefined }}>
                  {m.label}
                </div>
              )
            })}
          </div>
          {/* lanes */}
          <div className="relative">
            {days
              .filter((k) => k % 7 === 0)
              .map((k) => (
                <div key={k} className="absolute inset-y-0 w-px bg-line/60" style={{ left: `${pct(k)}%` }} />
              ))}
            {parIdx.length > 1 && (
              <div
                className="absolute border border-dashed border-[#5AA9E6]/50 bg-[#5AA9E6]/[0.06]"
                style={{ left: `${pct(parStart)}%`, width: `${pct(parEnd - parStart)}%`, top: Math.min(...parIdx) * ROW + 2, height: (Math.max(...parIdx) - Math.min(...parIdx) + 1) * ROW - 3 }}
              />
            )}
            {lanes.map((l) => (
              <div key={l} style={{ height: ROW }} className="relative border-t border-line/60">
                {items
                  .filter((i) => i.lane === l)
                  .map((it, k, laneItems) => {
                    const w = pct(it.end - it.start)
                    const lastInLane = k === laneItems.length - 1
                    const inside = w > 12
                    const label = it.stage.replace(/^\d+b?\.\s*/, '')
                    return (
                      <div key={k} className="absolute top-[6px] flex h-[18px] items-center" style={{ left: `${pct(it.start)}%`, width: `max(${w}%, 3px)` }} title={`${it.stage}: D+${it.start} → D+${it.end} (${it.end - it.start} d)${it.note ? ` · ${it.note}` : ''}`}>
                        <div className={clsx('flex h-full w-full items-center overflow-hidden px-1.5', it.critical ? 'bg-ioh-yellow text-canvas' : 'border border-[#5AA9E6]/60 bg-[#5AA9E6]/20 text-ink')}>
                          {inside && <span className="truncate text-[10.5px] font-semibold">{label}</span>}
                        </div>
                        {lastInLane && (
                          <span className="tnum absolute left-full ml-1.5 whitespace-nowrap text-[10.5px] text-faint">
                            {!inside && <b className="font-semibold text-muted">{label} · </b>}
                            {laneItems.length > 1 ? laneItems.map((x) => `${x.end - x.start} d`).join(' + ') : `${it.end - it.start} d`}
                            {it.note && it.lane !== 'Build' ? ` · ${it.note}` : ''}
                          </span>
                        )}
                      </div>
                    )
                  })}
              </div>
            ))}
            {markers.map((m) => (
              <div key={m.label} className="pointer-events-none absolute inset-y-0" style={{ left: `${pct(m.at)}%`, borderLeft: `1.5px ${m.dashed ? 'dashed' : 'solid'} ${m.color}` }} />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-[10.5px] text-faint" style={{ paddingLeft: LABEL_W }}>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 bg-ioh-yellow" /> Critical path
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 border border-[#5AA9E6]/60 bg-[#5AA9E6]/20" /> Has slack
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 border border-dashed border-[#5AA9E6]/60" /> Stages 4 · 5 · 6 · 6b in parallel after the decision
        </span>
        <span className="ml-auto">Days from plan build (D0 = {dateShort(start)})</span>
      </div>
    </div>
  )
}
