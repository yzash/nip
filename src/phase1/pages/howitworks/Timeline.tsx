import clsx from 'clsx'
import { useNavigate } from 'react-router-dom'
import { SCHEDULE } from '../../content/agents'
import { AGENT_BY_ID, READINESS_COLOR, shortName } from './shared'

const toH = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}

/** Daily run, 01:00 → 23:00 WIB: a proportional 24 h strip on top, the run sheet below (one column per step). */
export function DailyTimeline() {
  const nav = useNavigate()
  const steps = SCHEDULE
  return (
    <div className="px-4 pb-4 pt-3">
      {/* proportional 24h strip */}
      <div className="relative mb-1 h-9">
        <div className="absolute inset-x-0 top-4 h-px bg-line2" />
        {/* night batch window */}
        <div className="absolute top-2.5 h-3 bg-prog/25" style={{ left: `${(1 / 24) * 100}%`, width: `${(5.5 / 24) * 100}%` }} title="Night batch 01:00–06:30 WIB" />
        <div className="absolute top-2.5 h-3 bg-ioh-yellow/15" style={{ left: `${(8 / 24) * 100}%`, width: `${(10 / 24) * 100}%` }} title="Working day" />
        {Array.from({ length: 25 }, (_, h) => (
          <div key={h} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: `${(h / 24) * 100}%` }}>
            {h % 3 === 0 && <span className="tnum font-mono text-[11px] text-faint">{String(h).padStart(2, '0')}</span>}
            <span className={clsx('w-px', h % 3 === 0 ? 'mt-0 h-2 bg-faint' : 'mt-3.5 h-1.5 bg-line2')} />
          </div>
        ))}
        {steps.map((s) => (
          <span key={s.time} className="absolute top-[13px] h-2 w-2 -translate-x-1/2 rounded-full border border-canvas bg-ioh-yellow" style={{ left: `${(toH(s.time) / 24) * 100}%` }} title={`${s.time} ${s.what}`} />
        ))}
      </div>
      <div className="mb-3 flex gap-4 text-[11px] text-faint">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 bg-prog/40" /> Night batch on Netra 01:00–06:30 WIB
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-4 bg-ioh-yellow/30" /> Planner working day
        </span>
        <span className="ml-auto">Forecast SLA: ready by 06:00 WIB on ≥ 98% of days (exit criterion EC2)</span>
      </div>

      {/* run sheet */}
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, i) => {
          const ids = s.owner.split('·').map((x) => x.trim())
          const agents = ids.map((id) => AGENT_BY_ID.get(id)).filter(Boolean)
          const gap = i > 0 ? toH(s.time) - toH(steps[i - 1].time) : 0
          const sla = s.time === '06:00'
          const people = s.owner === 'People'
          return (
            <div key={s.time} className={clsx('relative min-w-0 px-2', i > 0 && 'border-l border-line/60')}>
              <div className="flex items-baseline justify-between">
                <span className={clsx('tnum font-mono text-[15px] font-semibold', people ? 'text-ioh-yellow' : 'text-ink')}>{s.time}</span>
                {i > 0 && <span className="tnum text-[10.5px] text-faint">+{gap >= 1 ? `${Math.round(gap * 10) / 10} h` : `${Math.round(gap * 60)} m`}</span>}
              </div>
              <div className="relative my-1.5 h-3">
                <span className={clsx('absolute left-0 top-0.5 h-2.5 w-2.5 rounded-full border-2', people ? 'border-ioh-yellow bg-ioh-yellow' : sla ? 'border-ok bg-canvas' : 'border-ioh-yellow bg-canvas')} />
              </div>
              <div className="min-h-[48px] text-xs leading-4 text-muted">{s.what}</div>
              {sla && <div className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-ok">Forecast ready</div>}
              <div className="mt-2 flex flex-col gap-1">
                {agents.map((a) => (
                  <button key={a!.id} onClick={() => nav(`/phase1/agents/${a!.id}`)} className="flex min-w-0 items-start gap-1.5 border border-line2 bg-panel2 px-1.5 py-1 text-left hover:border-ioh-yellow" title={a!.name}>
                    <span className="mt-px h-3 w-[3px] shrink-0" style={{ background: READINESS_COLOR[a!.readiness] }} />
                    <span className="text-[11px] font-medium leading-tight text-ink">{shortName(a!)}</span>
                  </button>
                ))}
                {!agents.length && <span className="border border-dashed border-line2 px-1.5 py-1 text-[11px] text-faint">{people ? 'Planners and approvers' : `${s.owner} ingest`}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
