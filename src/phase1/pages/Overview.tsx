import clsx from 'clsx'
import { ArrowRight, Check, CircleDashed, Minus } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import { Badge, Fresh, Label } from '@/components/ui'
import { idr, num } from '@/lib/format'
import { crossingWeek } from '@/lib/metrics'
import { useApp, usePolicy, useRole } from '@/store/app'
import { CLASS_GATES, MILESTONES, PHASE1, WORKSTREAMS } from '../content/golive'
import { SOURCES } from '../content/sources'
import { AGENTS } from '../content/agents'
import { CLASSES, CLASS_META, clustersFrom, useP1 } from '../model'
import { useP1Store } from '../store'

const GATE_LABEL = { drives_approvals: 'Drives approvals', advisory: 'Advisory', shadow: 'Shadow mode' } as const

export function OverviewPage() {
  const D = db()
  const nav = useNavigate()
  const role = useRole()
  const policy = usePolicy()
  const incidents = useApp((s) => s.incidents)
  const plans = useP1Store((s) => s.plans)
  const classMoves = useP1Store((s) => s.classMoves)
  const p1 = useP1()

  const stats = useMemo(() => {
    const thr = policy.red_min_probability
    const byClass = Object.fromEntries(CLASSES.map((c) => [c, 0])) as Record<string, number>
    let pred = 0
    D.forecast.forEach((f, i) => {
      if (crossingWeek(i, thr) > 0) {
        pred++
        byClass[f.failure_class]++
      }
    })
    const clusters = clustersFrom(incidents)
    const planned = new Set(plans.filter((p) => p.status !== 'rejected').map((p) => p.cluster_id))
    const uncovered = clusters.filter((c) => c.coverage.verdict === 'not_covered' && !planned.has(c.id))
    const exposure = clusters.reduce((s, c) => s + c.exposure_idr, 0)
    return { pred, byClass, clusters, uncovered, exposure }
  }, [D, incidents, plans, policy])

  const count = (st: string) => plans.filter((p) => p.status === st).length
  const myPending = plans.filter((p) => p.status === 'pending_approval' && p.route.role === role.role_code)
  const toSend = plans.filter((p) => p.status === 'approved')
  const sourcesReady = SOURCES.filter((s) => s.status === 'on_netra').length
  const blockingGaps = SOURCES.filter((s) => s.criticality === 'blocking' && s.status !== 'on_netra').length

  const flow = [
    { n: '1', label: 'Predict', value: num(stats.pred), sub: `sites fail inside 8 wks · ${stats.clusters.length} clusters`, to: '/phase1/forecast' },
    { n: '2', label: 'Classify', value: num(stats.clusters.length), sub: `clusters with CapEx / non-CapEx call · ${Object.keys(classMoves).length} overrides`, to: '/phase1/classify' },
    { n: '3', label: 'Plan', value: num(plans.filter((p) => p.status === 'draft').length + stats.uncovered.length), sub: `${count('draft')} drafts · ${stats.uncovered.length} clusters need a plan`, to: '/phase1/plans' },
    { n: '4', label: 'Approve', value: num(count('pending_approval')), sub: 'plans awaiting a named approver', to: '/phase1/approvals' },
    { n: '5', label: 'Hand off', value: num(count('handed_off')), sub: `handed off · ${toSend.length} approved, ready to send`, to: '/phase1/handoff' },
  ]

  const decisions: { text: string; sub: string; to: string }[] = []
  for (const p of myPending) decisions.push({ text: `Approve ${p.id} · ${p.name}`, sub: `${p.draft.site_ids.length} sites · ${idr(p.draft.capex_total_idr)} · ${p.route.label}`, to: `/phase1/plans/${p.id}` })
  if (role.role_code === 'PLAN' || role.role_code === 'EXEC') {
    for (const c of stats.uncovered.slice(0, 3)) decisions.push({ text: `Plan ${c.id} · ${c.title}`, sub: `${CLASS_META[c.cls].label} · W+${c.crossing_week} · ${idr(c.exposure_idr)}/mo at risk · not covered`, to: `/phase1/forecast?cluster=${c.id}` })
  }
  if (role.role_code === 'PROC' || role.role_code === 'DEPLOY') for (const p of toSend) decisions.push({ text: `Hand off ${p.id} to ERP and PMO`, sub: `${p.name} · approved by ${p.decided_by ?? p.route.label}`, to: '/phase1/handoff' })

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        {/* headline */}
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">{PHASE1.name} · {PHASE1.weeks}-week go-live</div>
            <h1 className="mt-1 max-w-[920px] text-[22px] font-semibold leading-7">
              Know which sites will fail in the next 8 weeks, decide CapEx or non-CapEx, and hand an approved plan with BOQ and PO drafts to ERP.
            </h1>
            <p className="mt-1.5 max-w-[920px] text-sm text-muted">{PHASE1.boundary}</p>
          </div>
          <div className="shrink-0 border border-line bg-panel px-4 py-2.5 text-right">
            <div className="text-2xs uppercase tracking-wider text-faint">Revenue at risk in predicted clusters</div>
            <div className="tnum text-xl font-semibold text-ioh-yellow">{idr(stats.exposure)} / month</div>
            <div className="text-[10.5px] text-faint">
              Revenue Exposure Agent <Fresh f="D-1" />
            </div>
          </div>
        </div>

        {/* flow */}
        <div className="mt-5 grid grid-cols-5 border border-line bg-panel">
          {flow.map((f, k) => (
            <button key={f.label} onClick={() => nav(f.to)} className={clsx('group relative px-4 py-3 text-left hover:bg-panel2', k < 4 && 'border-r border-line')}>
              <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-faint">
                <span className="flex h-4 w-4 items-center justify-center rounded-full border border-ioh-yellow font-mono text-[9px] text-ioh-yellow">{f.n}</span>
                {f.label}
              </div>
              <div className="tnum mt-1 text-2xl font-semibold">{f.value}</div>
              <div className="text-xs text-muted">{f.sub}</div>
              <ArrowRight size={14} className="absolute right-3 top-3 text-faint group-hover:text-ioh-yellow" />
            </button>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_420px] gap-5">
          {/* classes */}
          <section className="border border-line bg-panel">
            <header className="flex h-10 items-center justify-between border-b border-line px-4">
              <h3 className="text-sm font-semibold">Five failure classes · what goes live</h3>
              <button onClick={() => nav('/phase1/models')} className="text-xs text-muted hover:text-ink">
                Model cards →
              </button>
            </header>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                  <th className="px-4 py-2 font-semibold">Class</th>
                  <th className="px-2 py-2 text-right font-semibold">Predicted</th>
                  <th className="px-2 py-2 font-semibold">Horizon</th>
                  <th className="px-2 py-2 font-semibold">Precision vs 70% gate</th>
                  <th className="px-2 py-2 font-semibold">At go-live</th>
                  <th className="px-4 py-2 font-semibold">To clear the gate</th>
                </tr>
              </thead>
              <tbody>
                {CLASS_GATES.map((g) => {
                  const m = p1?.models.find((x) => x.failure_class === g.cls)
                  const prec = m?.precision_top_decile ?? 0
                  return (
                    <tr key={g.cls} onClick={() => nav(`/phase1/forecast?class=${g.cls}`)} className="cursor-pointer border-t border-line/70 hover:bg-panel2">
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-2 font-semibold">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_META[g.cls as keyof typeof CLASS_META].color }} />
                          {g.label}
                          <span className="text-2xs font-normal text-faint">Wave {CLASS_META[g.cls as keyof typeof CLASS_META].wave}</span>
                        </span>
                      </td>
                      <td className="tnum px-2 py-2.5 text-right font-semibold">{stats.byClass[g.cls]}</td>
                      <td className="px-2 py-2.5 text-muted">{CLASS_META[g.cls as keyof typeof CLASS_META].horizon}</td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="relative h-1.5 w-28 bg-line">
                            <div className="h-full" style={{ width: `${prec * 100}%`, background: prec >= 0.7 ? '#2ECC71' : prec >= 0.6 ? '#F5A623' : '#FF3B3B' }} />
                            <div className="absolute -top-1 h-3.5 w-px bg-ink" style={{ left: '70%' }} />
                          </div>
                          <span className="tnum text-xs">{Math.round(prec * 100)}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5">
                        <Badge tone={g.gateAtGoLive === 'drives_approvals' ? 'ok' : g.gateAtGoLive === 'advisory' ? 'warn' : 'neutral'}>{GATE_LABEL[g.gateAtGoLive]}</Badge>
                      </td>
                      <td className="max-w-[300px] truncate px-4 py-2.5 text-xs text-muted" title={g.toClear}>
                        {g.toClear}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="border-t border-line px-4 py-2 text-[11px] text-faint">
              All five classes are in the product from day one. A class drives approvals only after it clears 70% precision in the top decile on a 24-month back-test; below that it is advisory, and environmental scores in shadow until the BMKG feed lands.
            </div>
          </section>

          {/* decisions */}
          <section className="border border-line bg-panel">
            <header className="flex h-10 items-center justify-between border-b border-line px-4">
              <h3 className="text-sm font-semibold">Waiting on you · {role.title}</h3>
              <Fresh f="live" />
            </header>
            <div className="divide-y divide-line/70">
              {decisions.length === 0 && <div className="px-4 py-8 text-center text-sm text-faint">Nothing waiting on this role. Switch to PLAN to see the planning queue.</div>}
              {decisions.slice(0, 6).map((d) => (
                <button key={d.text} onClick={() => nav(d.to)} className="block w-full px-4 py-2.5 text-left hover:bg-panel2">
                  <div className="truncate text-sm font-medium">{d.text}</div>
                  <div className="truncate text-xs text-faint">{d.sub}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-5">
          {/* agent layer */}
          <button onClick={() => nav('/phase1/agents')} className="flex flex-col items-start justify-start border border-line bg-panel p-4 text-left hover:border-line2">
            <Label>Agent layer</Label>
            <div className="mt-1 text-lg font-semibold">{AGENTS.length} agents in the Planner</div>
            <div className="mt-1 text-xs text-muted">
              {AGENTS.filter((a) => a.readiness === 'Exists').length} exist (Smart CapEx, consumed as-is) · {AGENTS.filter((a) => a.readiness === 'Extend').length} extended · {AGENTS.filter((a) => a.readiness === 'Build').length} built on Netra. Agents that touch money draft, never execute.
            </div>
            <div className="mt-3 flex flex-wrap gap-1">
              {['Sense', 'Predict', 'Decide', 'Plan', 'Govern'].map((s) => (
                <span key={s} className="border border-line2 px-1.5 py-0.5 text-[10.5px] text-muted">
                  {s} {AGENTS.filter((a) => a.stage === s).length}
                </span>
              ))}
            </div>
          </button>
          {/* data */}
          <button onClick={() => nav('/phase1/data')} className="flex flex-col items-start justify-start border border-line bg-panel p-4 text-left hover:border-line2">
            <Label>Data needed</Label>
            <div className="mt-1 text-lg font-semibold">
              {SOURCES.length} sources · {sourcesReady} already on Netra
            </div>
            <div className="mt-1 text-xs text-muted">
              {SOURCES.filter((s) => s.status === 'partial').length} partial, {SOURCES.filter((s) => s.status === 'not_on_netra').length} to onboard. <span className="text-warn">{blockingGaps} blocking gaps</span> before go-live (RMS, TNMS, BMKG, site master quality, ticket labels, ERP and WMS).
            </div>
            <div className="mt-3 flex h-2 w-full">
              <div className="bg-ok" style={{ width: `${(sourcesReady / SOURCES.length) * 100}%` }} />
              <div className="bg-warn" style={{ width: `${(SOURCES.filter((s) => s.status === 'partial').length / SOURCES.length) * 100}%` }} />
              <div className="flex-1 bg-line2" />
            </div>
          </button>
          {/* go-live */}
          <button onClick={() => nav('/phase1/golive')} className="flex flex-col items-start justify-start border border-line bg-panel p-4 text-left hover:border-line2">
            <Label>Go-live plan</Label>
            <div className="mt-1 text-lg font-semibold">
              {PHASE1.weeks} weeks · {WORKSTREAMS.length} workstreams
            </div>
            <div className="mt-1 text-xs text-muted">{PHASE1.outcome}</div>
            <div className="mt-3 space-y-1">
              {MILESTONES.slice(0, 6).map((m) => (
                <div key={m.week} className="flex items-center gap-2 text-[11px]">
                  <span className="tnum w-10 text-faint">Wk {m.week}</span>
                  <span className="text-muted">{m.name}</span>
                </div>
              ))}
            </div>
          </button>
        </div>

        {/* scope */}
        <section className="mt-5 grid grid-cols-2 border border-line bg-panel">
          <div className="border-r border-line p-4">
            <Label className="mb-2">In Phase 1</Label>
            {[
              '8-week failure forecast for all 60k sites, five classes, with explanations',
              'Forecast clusters (one per root cause), revenue exposure and priority',
              'CapEx vs non-CapEx classification (Smart CapEx, consumed as-is) with overrides',
              'Action ladder and plan builder: BOQ, stock check, vendor proposal, PO draft, critical path',
              'Approval routing on IOH delegation of authority, with audit',
              'Hand-off of BOQ and PO drafts to ERP, PMO, WMS, vendor portal and tower companies',
            ].map((t) => (
              <div key={t} className="mb-1 flex items-start gap-2 text-sm">
                <Check size={14} className="mt-0.5 shrink-0 text-ok" /> {t}
              </div>
            ))}
          </div>
          <div className="p-4">
            <Label className="mb-2">Later phases</Label>
            {[
              'PO release, installation tracking, RFS acceptance (Program Console)',
              'Incident queue for live alarms and CX outreach',
              'Post-RFS validation and ROI (Value Ledger)',
              'Field work orders and evidence capture',
              'Write-back beyond drafts (ERP posting, vendor portal commits)',
            ].map((t) => (
              <div key={t} className="mb-1 flex items-start gap-2 text-sm text-muted">
                <Minus size={14} className="mt-0.5 shrink-0 text-faint" /> {t}
              </div>
            ))}
            <a href="/map" className="mt-2 inline-flex items-center gap-1 text-xs text-faint hover:text-ink">
              <CircleDashed size={12} /> These are shown in the full NICC prototype
            </a>
          </div>
        </section>
      </div>
    </div>
  )
}
