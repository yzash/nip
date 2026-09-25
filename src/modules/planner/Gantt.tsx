import clsx from 'clsx'
import { addDays, dateShort } from '@/lib/format'
import type { PlanDraft } from '@/lib/plan'
import { todayIso } from '@/store/app'

const PARALLEL_LANES = new Set(['BOQ', 'PO & stock', 'Vendor', 'Tower co'])

/** Critical path (PRD §8): stages 4, 5, 6 and 6b overlap after the Stage 3 decision; Stage 7 is physical work. */
export function Gantt({ plan }: { plan: PlanDraft }) {
  const today = todayIso()
  const items = plan.critical_path
  const lanes: string[] = []
  for (const it of items) if (!lanes.includes(it.lane)) lanes.push(it.lane)
  const win = plan.window_days
  const max = Math.max(plan.rfs_days, win ?? 0) + 3
  const x = (d: number) => `${(d / max) * 100}%`
  const weeks = Array.from({ length: Math.floor(max / 7) + 1 }, (_, k) => k * 7)
  const par = items.filter((i) => PARALLEL_LANES.has(i.lane))
  const parStart = Math.min(...par.map((p) => p.start))
  const parEnd = Math.max(...par.map((p) => p.end))
  const parLaneIdx = lanes.map((l, k) => (PARALLEL_LANES.has(l) ? k : -1)).filter((k) => k >= 0)
  const ROW = 34
  const HEAD = 34

  return (
    <div className="px-4 pb-4 pt-2">
      <div className="flex">
        {/* Lane labels */}
        <div className="w-[190px] shrink-0">
          <div style={{ height: HEAD }} className="flex items-end pb-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
            Lane
          </div>
          {lanes.map((l) => {
            const first = items.find((i) => i.lane === l)!
            return (
              <div key={l} style={{ height: ROW }} className="flex items-center gap-2 border-t border-line/60 pr-3">
                <span className={clsx('h-2 w-2 shrink-0', items.some((i) => i.lane === l && i.critical) ? 'bg-ioh-yellow' : 'bg-[#5AA9E6]/70')} />
                <span className="truncate text-xs text-muted">{first.stage.replace(/ — wave \d.*$/, '')}</span>
              </div>
            )
          })}
        </div>
        {/* Track */}
        <div className="relative min-w-0 flex-1">
          {/* Week gridlines + axis */}
          {weeks.map((d) => (
            <div key={d} className="absolute bottom-0 top-0" style={{ left: x(d) }}>
              <div className="absolute bottom-0 border-l border-line" style={{ top: HEAD - 4 }} />
              <div className="tnum absolute top-0 -translate-x-1/2 whitespace-nowrap text-center text-[10px] leading-3 text-faint" style={{ transform: d === 0 ? 'none' : undefined }}>
                <div className="font-semibold text-muted">{d === 0 ? 'Today' : `W${d / 7}`}</div>
                <div>{dateShort(addDays(today, d))}</div>
              </div>
            </div>
          ))}
          {/* Parallel band */}
          {parLaneIdx.length > 1 && (
            <div
              className="absolute border border-dashed border-[#5AA9E6]/40 bg-[#5AA9E6]/[0.05]"
              style={{ left: x(parStart), width: `calc(${x(parEnd - parStart)} + 2px)`, top: HEAD + Math.min(...parLaneIdx) * ROW + 1, height: (Math.max(...parLaneIdx) - Math.min(...parLaneIdx) + 1) * ROW - 2 }}
            />
          )}
          <div style={{ height: HEAD }} />
          {lanes.map((l) => (
            <div key={l} style={{ height: ROW }} className="relative border-t border-line/60">
              {items
                .filter((i) => i.lane === l)
                .map((it, k) => {
                  const w = ((it.end - it.start) / max) * 100
                  const inside = w > 9
                  return (
                    <div key={k} className="absolute top-[7px] flex h-5 items-center" style={{ left: x(it.start), width: `max(${w}%, 3px)` }} title={`${it.stage}: D+${it.start} → D+${it.end}${it.note ? ` · ${it.note}` : ''}`}>
                      <div className={clsx('flex h-full w-full items-center overflow-hidden px-1.5', it.critical ? 'bg-ioh-yellow text-canvas' : 'border border-[#5AA9E6]/60 bg-[#5AA9E6]/25 text-ink')}>
                        {inside && <span className="truncate text-[10.5px] font-semibold">{it.stage.replace(/^\d+b?\.\s*/, '')}</span>}
                      </div>
                      <span className={clsx('tnum absolute left-full ml-1.5 whitespace-nowrap text-[10.5px]', inside ? 'text-faint' : 'text-muted')}>
                        {!inside && <b className="font-semibold text-ink">{it.stage.replace(/^\d+b?\.\s*/, '')} </b>}
                        {it.end - it.start} d{it.note && !inside ? '' : it.note ? ` · ${it.note}` : ''}
                      </span>
                    </div>
                  )
                })}
            </div>
          ))}
          {/* Markers */}
          {plan.bridge && <Marker at={plan.bridge.days} x={x} color="#2ECC71" label={`Bridge live D+${plan.bridge.days}`} top={HEAD} />}
          {win !== null && <Marker at={win} x={x} color="#FF3B3B" label={`Predicted breach D+${win} · ${dateShort(addDays(today, win))}`} top={HEAD} dashed />}
          <Marker at={plan.rfs_days} x={x} color="#FFD100" label={`RFS D+${plan.rfs_days} · ${dateShort(plan.target_rfs)}`} top={HEAD} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4 pl-[190px] text-[10.5px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 bg-ioh-yellow" /> Critical path
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 border border-[#5AA9E6]/60 bg-[#5AA9E6]/25" /> Parallel, has slack
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-4 border border-dashed border-[#5AA9E6]/50" /> Stages 4 · 5 · 6 · 6b run in parallel after the Stage 3 decision
        </span>
      </div>
    </div>
  )
}

function Marker({ at, x, color, label, top, dashed, bottom }: { at: number; x: (d: number) => string; color: string; label: string; top: number; dashed?: boolean; bottom?: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-0" style={{ left: x(at), top }}>
      <div className="absolute bottom-0 top-0" style={{ borderLeft: `1.5px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      <div className={clsx('tnum absolute ml-1 whitespace-nowrap bg-panel px-1 text-[10px] font-semibold', bottom ? 'bottom-0.5' : 'top-0.5')} style={{ color }}>
        {label}
      </div>
    </div>
  )
}
