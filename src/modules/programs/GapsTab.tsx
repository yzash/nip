import clsx from 'clsx'
import { AlertTriangle, ArrowRight, FolderPlus, PackageX, ShieldAlert, Wand2 } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { Incident } from '@/data/types'
import { Badge, Button, Empty, Fresh, Id, Td, Th } from '@/components/ui'
import { CLASS_LABEL, STATUS_LABEL, date, dateShort, daysBetween, idr, num } from '@/lib/format'
import { crossingWeek, isOpen } from '@/lib/metrics'
import { buildPlan, interventionFromOption } from '@/lib/plan'
import { nextProgramId, todayIso, useApp, usePolicy } from '@/store/app'
import { freeStockBySku, inPipeline } from './lib'
import { HealthBadge } from './parts'

// Gap flags (PRD §6 M5): programs with sites now predicted to fail before RFS; incidents not
// covered by any program; BOQ lines without stock. Each flag carries a suggested action.

export function GapsTab() {
  const programs = useApp((s) => s.programs)
  const incidents = useApp((s) => s.incidents)
  const reservations = useApp((s) => s.reservations)
  const boqExtra = useApp((s) => s.boqExtra)
  const flagged = programs.filter((p) => p.gap_flags.length)
  const uncovered = useMemo(() => incidents.filter((i) => isOpen(i) && i.program_match.verdict === 'not_covered').sort((a, b) => b.exposure_idr - a.exposure_idr), [incidents])
  const short = useMemo(() => stockGaps(programs, reservations, boqExtra), [programs, reservations, boqExtra])
  const exposure = uncovered.reduce((s, i) => s + i.exposure_idr, 0)

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="grid grid-cols-3 divide-x divide-line border border-line bg-panel">
        <Summary
          icon={<ShieldAlert size={16} />}
          tone="bad"
          n={flagged.length}
          label="programs off track"
          text={`${flagged.reduce((s, p) => s + p.gap_flags.reduce((a, g) => a + g.site_ids.length, 0), 0)} sites predicted to fail before the program's forecast RFS`}
        />
        <Summary icon={<AlertTriangle size={16} />} tone="warn" n={uncovered.length} label="open incidents not covered" text={`${idr(exposure)} monthly revenue exposure with no program behind it`} />
        <Summary
          icon={<PackageX size={16} />}
          tone="warn"
          n={short.length}
          label="BOQ SKUs without stock"
          text={`${num(short.reduce((s, x) => s + x.shortfall, 0))} units short across pipeline programs`}
        />
      </div>
      <FlaggedPrograms />
      <div className="grid grid-cols-1 min-[1400px]:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-4">
        <Uncovered list={uncovered} />
        <StockGaps rows={short} />
      </div>
    </div>
  )
}

function Summary({ icon, tone, n, label, text }: { icon: ReactNode; tone: 'bad' | 'warn'; n: number; label: string; text: string }) {
  return (
    <div className="flex items-start gap-3 px-5 py-3">
      <span className={clsx('mt-1', tone === 'bad' ? 'text-bad' : 'text-warn')}>{icon}</span>
      <div>
        <div className="flex items-baseline gap-2">
          <span className={clsx('tnum text-2xl font-semibold', tone === 'bad' ? 'text-bad' : 'text-warn')}>{n}</span>
          <span className="text-sm font-semibold">{label}</span>
          <Fresh f="D-1" />
        </div>
        <div className="text-xs text-muted">{text}</div>
      </div>
    </div>
  )
}

// (a) programs with sites predicted to fail before forecast RFS
function FlaggedPrograms() {
  const D = db()
  const nav = useNavigate()
  const programs = useApp((s) => s.programs)
  const reservations = useApp((s) => s.reservations)
  const policy = usePolicy()
  const flagged = programs.filter((p) => p.gap_flags.length)
  const interim = (pid: string, ids: string[]) => {
    const p = programs.find((x) => x.program_id === pid)!
    const app = useApp.getState()
    const plan = buildPlan({
      siteIds: ids,
      intervention: 'refarm',
      sourceIncident: null,
      programs,
      reservations,
      today: todayIso(),
      nextProgramId: nextProgramId(programs),
    })
    app.setPlan({
      ...plan,
      name: `${p.name.split(' — ')[0]} — interim relief (refarm)`,
    })
    app.logAudit({
      action: 'Interim relief plan drafted from gap flag',
      object: pid,
      detail: `${ids.length} sites`,
    })
    nav('/planner?tab=builder')
  }
  return (
    <section className="border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">
          Programs with sites predicted to fail before RFS <span className="tnum font-normal text-faint">{flagged.length}</span>
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-faint">
          Site Failure Prediction × program forecast RFS · p ≥ {Math.round(policy.red_min_probability * 100)}% <Fresh f="D-1" />
        </span>
      </header>
      {!flagged.length && <Empty>No program has a site predicted to fail before its RFS.</Empty>}
      <div className="divide-y divide-line">
        {flagged.map((p) =>
          p.gap_flags.map((g, k) => {
            const sites = g.site_ids.map((sid) => {
              const i = D.siteIdx.get(sid)
              const cw = i !== undefined ? crossingWeek(i, policy.red_min_probability) : 0
              return {
                sid,
                name: i !== undefined ? D.sites[i].name : sid,
                cw,
                date: cw ? D.weekEndDates[cw - 1] : null,
              }
            })
            const first = sites.filter((s) => s.date).sort((a, b) => (a.date! < b.date! ? -1 : 1))[0]
            const lead = first?.date ? daysBetween(first.date, p.forecast_rfs) : 0
            return (
              <div key={`${p.program_id}-${k}`} className="grid grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,340px)] gap-5 px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Id onClick={() => nav(`/programs/${p.program_id}`)}>{p.program_id}</Id>
                    <HealthBadge h={p.health} />
                  </div>
                  <button onClick={() => nav(`/programs/${p.program_id}`)} className="mt-0.5 block max-w-full truncate text-left text-[13px] font-semibold hover:text-ioh-yellow">
                    {p.name}
                  </button>
                  <div className="text-xs text-muted">
                    {p.region} · {p.stage} · {p.sites_planned} sites
                  </div>
                  {p.blockers[0] && <div className="mt-1 line-clamp-2 text-[11px] text-faint">{p.blockers[0].text}</div>}
                </div>
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-baseline gap-3 text-xs">
                    <span className="text-muted">
                      First predicted failure <span className="tnum font-semibold text-bad">{first?.date ? `W+${first.cw} · ${date(first.date)}` : '—'}</span>
                    </span>
                    <span className="text-muted">
                      Forecast RFS <span className="tnum font-semibold text-ink">{date(p.forecast_rfs)}</span>
                    </span>
                    {lead > 0 && <span className="tnum font-semibold text-bad">{Math.round(lead / 7)} wk gap</span>}
                  </div>
                  <GapTimeline sites={sites} forecast={p.forecast_rfs} target={p.target_rfs} />
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {sites.map((s) => (
                      <span key={s.sid} className="flex items-center gap-1 border border-line2 px-1 text-[11px]" title={s.name}>
                        <Id onClick={() => nav(`/site/${s.sid}`)}>{s.sid}</Id>
                        <span className="tnum text-bad">{s.cw ? `W+${s.cw}` : '—'}</span>
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="border border-line bg-panel2 px-3 py-2 text-xs">
                    <div className="mb-0.5 text-2xs font-semibold uppercase tracking-wider text-faint">Suggested action</div>
                    <div className="text-ink">{g.suggested_action}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => interim(p.program_id, g.site_ids)}>
                      <Wand2 size={12} /> Draft interim relief
                    </Button>
                    <Button size="sm" onClick={() => nav(`/programs/${p.program_id}`)}>
                      Open program <ArrowRight size={12} />
                    </Button>
                  </div>
                </div>
              </div>
            )
          }),
        )}
      </div>
    </section>
  )
}

/** Week axis W0..W8 plus the program forecast RFS: shows which sites break first. */
function GapTimeline({ sites, forecast, target }: { sites: { sid: string; cw: number; date: string | null }[]; forecast: string; target: string }) {
  const today = todayIso()
  const horizon = Math.max(8 * 7, daysBetween(today, forecast) + 7)
  const x = (d: string) => Math.max(0, Math.min(100, (daysBetween(today, d) / horizon) * 100))
  const counts = new Map<string, number>()
  for (const s of sites) if (s.date) counts.set(s.date, (counts.get(s.date) ?? 0) + 1)
  const first = [...counts.keys()].sort()[0] ?? forecast
  return (
    <div className="relative h-11">
      {Array.from({ length: Math.floor(horizon / 7) + 1 }, (_, k) => k).map((k) => (
        <div key={k} className="absolute bottom-0 top-0" style={{ left: `${((k * 7) / horizon) * 100}%` }}>
          {k % 2 === 0 && <span className="absolute left-0.5 top-0 text-[9.5px] leading-3 text-faint">W+{k}</span>}
          <div className="absolute bottom-0 h-1.5 border-l border-line2" />
        </div>
      ))}
      <div className="absolute bottom-0 left-0 right-0 border-b border-line" />
      <div
        className="absolute bottom-0 top-4 bg-bad/10"
        style={{
          left: `${x(first)}%`,
          width: `${Math.max(0, x(forecast) - x(first))}%`,
        }}
      />
      {[...counts.entries()].map(([d, n]) => (
        <div key={d} className="absolute top-[22px] -translate-x-1/2" style={{ left: `${x(d)}%` }} title={`${n} site(s) predicted to fail by ${date(d)}`}>
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[9.5px] font-bold text-canvas">{n}</span>
        </div>
      ))}
      <div className="absolute bottom-0 top-3 border-l border-dashed border-ok" style={{ left: `${x(target)}%` }} title={`Target RFS ${date(target)}`} />
      <div className="absolute bottom-0 top-3 border-l-2 border-ink" style={{ left: `${x(forecast)}%` }}>
        <span className="absolute left-1 top-0 whitespace-nowrap text-[9.5px] font-semibold text-ink">RFS {dateShort(forecast)}</span>
      </div>
    </div>
  )
}

const CLASS_IV: Record<string, string> = { capacity: 'sector_add', power: 'power', transport: 'transport', ran_hardware: 'ran_swap', environmental: 'flood' }

// (b) open incidents not covered by any program
function Uncovered({ list }: { list: Incident[] }) {
  const nav = useNavigate()
  const programs = useApp((s) => s.programs)
  const reservations = useApp((s) => s.reservations)
  const [n, setN] = useState(12)
  const create = (inc: Incident) => {
    const D = db()
    const opts = D.optionsByIncident.get(inc.incident_id) ?? []
    const rec = opts.find((o) => o.rank === (inc.chosen_rank ?? inc.recommended_rank)) ?? opts[0]
    // interventionFromOption falls back to refarming for names it does not know (e.g. "unit swap");
    // use the failure-class default in that case.
    const mapped = interventionFromOption(rec?.name ?? '')
    const iv = mapped === 'refarm' && !/refarm|parameter/i.test(rec?.name ?? '') ? (CLASS_IV[inc.class] ?? mapped) : mapped
    const cw = inc.days_to_breach ?? (inc.predicted_week ? inc.predicted_week * 7 : null)
    const plan = buildPlan({
      siteIds: inc.site_ids,
      intervention: iv,
      sourceIncident: inc.incident_id,
      programs,
      reservations,
      windowDays: cw,
      today: todayIso(),
      nextProgramId: nextProgramId(programs),
    })
    const app = useApp.getState()
    app.setPlan(plan)
    app.logAudit({
      action: 'Program drafted from uncovered incident',
      object: inc.incident_id,
      detail: rec?.name,
    })
    app.toast(`Plan drafted for ${inc.incident_id}: ${rec?.name ?? plan.intervention_label}, ${inc.site_ids.length} site${inc.site_ids.length > 1 ? 's' : ''}`)
    nav('/planner?tab=builder')
  }
  return (
    <section className="flex min-w-0 flex-col border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">
          Open incidents not covered by any program <span className="tnum font-normal text-faint">{list.length}</span>
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-faint">
          Program Match Agent · by exposure <Fresh f="live" />
        </span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Incident</Th>
              <Th className="text-right">Sites</Th>
              <Th className="text-right">Exposure / mo</Th>
              <Th>Recommended</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.slice(0, n).map((inc) => {
              const opts = db().optionsByIncident.get(inc.incident_id) ?? []
              const rec = opts.find((o) => o.rank === (inc.chosen_rank ?? inc.recommended_rank))
              return (
                <tr key={inc.incident_id} className="hover:bg-panel2">
                  <Td className="max-w-[300px] pr-2">
                    <div className="flex items-center gap-2">
                      <Id onClick={() => nav(`/incidents?incident=${inc.incident_id}`)}>{inc.incident_id}</Id>
                      <Badge tone={inc.status === 'Approved' ? 'ok' : inc.status === 'Pending_approval' ? 'yellow' : 'neutral'}>{STATUS_LABEL[inc.status]}</Badge>
                      <span className="truncate text-[11px] text-faint">
                        {CLASS_LABEL[inc.class]} · {inc.region}
                      </span>
                    </div>
                    <div className="truncate text-xs text-ink" title={inc.title}>
                      {inc.title}
                    </div>
                  </Td>
                  <Td className="tnum text-right text-xs">{inc.site_ids.length}</Td>
                  <Td className="tnum text-right text-xs font-semibold text-ioh-yellow">{idr(inc.exposure_idr)}</Td>
                  <Td className="max-w-[160px] px-2 text-xs">
                    <div className="truncate text-ink">{rec?.name ?? '—'}</div>
                    {rec && (
                      <div className="tnum text-faint">
                        {rec.cost_idr ? idr(rec.cost_idr) : 'zero cost'} · {rec.lead_days} d
                      </div>
                    )}
                  </Td>
                  <Td className="text-right">
                    <Button size="sm" onClick={() => create(inc)}>
                      <FolderPlus size={12} /> Create program
                    </Button>
                  </Td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!list.length && <Empty>Every open incident is covered by a program.</Empty>}
      </div>
      {list.length > n && (
        <button onClick={() => setN(n + 20)} className="h-9 border-t border-line text-xs text-muted hover:text-ink">
          Show {Math.min(20, list.length - n)} more of {list.length - n} remaining
        </button>
      )}
    </section>
  )
}

// (c) BOQ lines without stock
interface StockGap {
  sku: string
  description: string
  need: number
  free: number
  shortfall: number
  lead_days: number
  unit_cost_idr: number
  programs: string[]
  top: { warehouse: string; free: number }[]
}
function stockGaps(
  programs: ReturnType<typeof useApp.getState>['programs'],
  reservations: { warehouse_id: string; sku: string; qty: number }[],
  extra: ReturnType<typeof useApp.getState>['boqExtra'],
): StockGap[] {
  const D = db()
  const pipe = new Set(programs.filter(inPipeline).map((p) => p.program_id))
  const need = new Map<string, { qty: number; programs: Set<string>; description: string }>()
  for (const b of [...D.boq, ...extra]) {
    if (!pipe.has(b.program_id) || b.sku.startsWith('SVC')) continue
    const r = need.get(b.sku) ?? {
      qty: 0,
      programs: new Set<string>(),
      description: b.description,
    }
    r.qty += b.qty
    r.programs.add(b.program_id)
    need.set(b.sku, r)
  }
  const free = freeStockBySku(reservations)
  const out: StockGap[] = []
  for (const [sku, r] of need) {
    const f = free.get(sku)
    const fr = f?.free ?? 0
    const q = Math.round(r.qty)
    if (q > fr)
      out.push({
        sku,
        description: r.description,
        need: q,
        free: fr,
        shortfall: q - fr,
        lead_days: f?.lead_days ?? D.meta.skus.find((s) => s.sku === sku)?.lead_days ?? 0,
        unit_cost_idr: f?.unit_cost_idr ?? D.meta.skus.find((s) => s.sku === sku)?.unit_cost_idr ?? 0,
        programs: [...r.programs].sort(),
        top: (f?.byWh ?? [])
          .filter((w) => w.free > 0)
          .sort((a, b) => b.free - a.free)
          .slice(0, 3),
      })
  }
  return out.sort((a, b) => b.shortfall * b.unit_cost_idr - a.shortfall * a.unit_cost_idr)
}

function StockGaps({ rows }: { rows: StockGap[] }) {
  const nav = useNavigate()
  return (
    <section className="flex min-w-0 flex-col border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">
          BOQ lines without stock <span className="tnum font-normal text-faint">{rows.length} SKUs</span>
        </h3>
        <span className="flex items-center gap-1.5 text-xs text-faint">
          pipeline need vs free stock, 8 warehouses <Fresh f="D-1" />
        </span>
      </header>
      {!rows.length ? (
        <Empty>Free stock covers every hardware line in the pipeline.</Empty>
      ) : (
        <div className="divide-y divide-line">
          {rows.map((r) => (
            <div key={r.sku} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Id>{r.sku}</Id>
                    <span className="truncate text-xs text-ink">{r.description}</span>
                  </div>
                  <div className="tnum mt-0.5 text-xs text-muted">
                    need <span className="text-ink">{num(r.need)}</span> · free <span className="text-ink">{num(r.free)}</span> ·{' '}
                    <span className="font-semibold text-bad">short {num(r.shortfall)}</span> · lead {r.lead_days} d
                  </div>
                </div>
                <div className="tnum shrink-0 text-right text-xs">
                  <div className="font-semibold text-ink">{idr(r.shortfall * r.unit_cost_idr)}</div>
                  <div className="text-faint">to order</div>
                </div>
              </div>
              <div className="mt-1.5 flex h-1.5 w-full bg-line">
                <div className="h-full bg-muted" style={{ width: `${(r.free / r.need) * 100}%` }} />
                <div className="h-full bg-bad/70" style={{ width: `${(r.shortfall / r.need) * 100}%` }} />
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
                <span>Programs</span>
                {r.programs.map((pid) => (
                  <Id key={pid} onClick={() => nav(`/programs/${pid}`)} className="text-[11px]">
                    {pid}
                  </Id>
                ))}
              </div>
              <div className="mt-1 text-[11px] text-muted">
                <span className="font-semibold text-faint">Suggested: </span>
                Raise PO for {num(r.shortfall)} ({r.lead_days} d lead)
                {r.top.length ? `; draw ${r.top.map((w) => `${w.warehouse.split(' ')[0]} ${w.free}`).join(', ')} first` : ''}.
              </div>
            </div>
          ))}
          <div className="px-4 py-2">
            <button onClick={() => nav('/planner?tab=readiness')} className="text-xs text-muted hover:text-ioh-yellow">
              Open Warehouse readiness to pre-position →
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
