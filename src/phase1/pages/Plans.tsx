import clsx from 'clsx'
import { ArrowRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import { Empty, Fresh, Id, Kpi, Td, Th } from '@/components/ui'
import { date, idr, num } from '@/lib/format'
import { useApp } from '@/store/app'
import { CLASS_META, clustersFrom, type PlanStatus } from '../model'
import { useP1Store } from '../store'
import { CapexChip, ClassTag, FitBadge, HandoffDots, StatusBadge, ageText, approverOf, fitOf, handoffProgress, hoursBetween, nowTs, planClass, predictionToApprovalH } from './plans/shared'

type Tab = 'all' | 'draft' | 'pending_approval' | 'approved' | 'handed_off' | 'closed'
const TABS: { id: Tab; label: string; match: (s: PlanStatus) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'draft', label: 'Draft', match: (s) => s === 'draft' },
  { id: 'pending_approval', label: 'Pending approval', match: (s) => s === 'pending_approval' },
  { id: 'approved', label: 'Approved', match: (s) => s === 'approved' },
  { id: 'handed_off', label: 'Handed off', match: (s) => s === 'handed_off' },
  { id: 'closed', label: 'Rejected / Deferred', match: (s) => s === 'rejected' || s === 'deferred' },
]

function median(xs: number[]) {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function PlansPage() {
  const nav = useNavigate()
  const plans = useP1Store((s) => s.plans)
  const incidents = useApp((s) => s.incidents)
  const [tab, setTab] = useState<Tab>('all')
  const now = nowTs()

  const clusters = useMemo(() => clustersFrom(incidents), [incidents])
  const byId = useMemo(() => new Map(clusters.map((c) => [c.id, c])), [clusters])

  const stats = useMemo(() => {
    const inflight = plans.filter((p) => ['draft', 'pending_approval', 'approved'].includes(p.status))
    const p2a = plans.map(predictionToApprovalH).filter((x): x is number => x !== null)
    const planned = new Set(plans.filter((p) => p.status !== 'rejected').map((p) => p.cluster_id))
    const unplanned = clusters.filter((c) => c.coverage.verdict !== 'covered' && !planned.has(c.id))
    const handed = plans.filter((p) => p.status === 'handed_off')
    return {
      inflight,
      inflightIdr: inflight.reduce((s, p) => s + p.draft.capex_total_idr, 0),
      medianDays: median(p2a) === null ? null : median(p2a)! / 24,
      unplanned,
      handedIdr: handed.reduce((s, p) => s + p.draft.capex_total_idr, 0),
      handed,
    }
  }, [plans, clusters])

  const rows = plans.filter((p) => TABS.find((t) => t.id === tab)!.match(p.status))
  const count = (t: Tab) => plans.filter((p) => TABS.find((x) => x.id === t)!.match(p.status)).length

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        <div className="flex items-end justify-between gap-6">
          <div>
            <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Step 3 · Plans</div>
            <h1 className="mt-1 text-[22px] font-semibold leading-7">
              {stats.inflight.length} plans in flight · {idr(stats.inflightIdr)} · median prediction-to-approval {stats.medianDays === null ? '—' : `${stats.medianDays.toFixed(1)} days`}
            </h1>
            <p className="mt-1.5 max-w-[920px] text-sm text-muted">
              Each plan is drafted from one forecast cluster: BOQ, stock check, vendor proposal, PO draft and critical path, routed to a named approver and handed off to ERP, PMO and WMS. Exit criterion EC4: prediction-to-approved plan ≤ 5 working days.
            </p>
          </div>
          <button onClick={() => nav('/phase1/forecast')} className="flex h-8 shrink-0 items-center gap-1.5 border border-ioh-yellow bg-ioh-yellow px-3 text-sm font-semibold text-canvas hover:bg-[#ffe04d]">
            <Plus size={14} /> New plan from forecast
          </button>
        </div>

        <div className="mt-5 grid grid-cols-5 border border-line bg-panel">
          <Kpi className="border-r" label="Drafts" fresh="live" value={num(count('draft'))} sub="being built by planners" onClick={() => setTab('draft')} />
          <Kpi className="border-r" label="Pending approval" fresh="live" tone={count('pending_approval') ? 'warn' : undefined} value={num(count('pending_approval'))} sub="with a named approver" onClick={() => setTab('pending_approval')} />
          <Kpi className="border-r" label="Approved, not handed off" fresh="live" tone={count('approved') ? 'yellow' : undefined} value={num(count('approved'))} sub="Procurement and Deployment to send" onClick={() => setTab('approved')} />
          <Kpi className="border-r" label="Handed off" fresh="live" tone="ok" value={num(stats.handed.length)} sub={`${idr(stats.handedIdr)} in ERP, PMO, WMS`} onClick={() => setTab('handed_off')} />
          <Kpi label="Clusters without a plan" fresh="D-1" tone={stats.unplanned.length ? 'bad' : undefined} value={num(stats.unplanned.length)} sub="not covered by any program" onClick={() => document.getElementById('unplanned')?.scrollIntoView({ behavior: 'smooth' })} />
        </div>

        <section className="mt-5 border border-line bg-panel">
          <div className="flex items-stretch justify-between border-b border-line pr-4">
            <div className="flex h-10 items-stretch gap-1 px-2">
              {TABS.map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)} className={clsx('relative -mb-px flex items-center gap-1.5 border-b-2 px-3 text-sm font-semibold', tab === t.id ? 'border-ioh-yellow text-ink' : 'border-transparent text-muted hover:text-ink')}>
                  {t.label}
                  <span className="tnum text-[11px] font-normal text-faint">{count(t.id)}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-[11px] text-faint">
              Plan state <Fresh f="live" />
            </div>
          </div>
          {rows.length === 0 ? (
            <Empty>No plans in this state.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <Th>Plan</Th>
                    <Th>Class</Th>
                    <Th className="text-right">Sites</Th>
                    <Th>Intervention</Th>
                    <Th className="text-right">Total</Th>
                    <Th>RFS vs breach</Th>
                    <Th>Approver</Th>
                    <Th>Status</Th>
                    <Th>Hand-off</Th>
                    <Th className="text-right">Age</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => {
                    const cls = planClass(p, byId)
                    const f = fitOf(p.draft)
                    const ho = handoffProgress(p)
                    const ap = approverOf(p)
                    return (
                      <tr key={p.id} onClick={() => nav(`/phase1/plans/${p.id}`)} className="cursor-pointer hover:bg-panel2">
                        <Td className="max-w-[320px]">
                          <div className="flex items-center gap-2">
                            <Id className="text-ink">{p.id}</Id>
                            <span className="truncate font-medium">{p.name}</span>
                          </div>
                          <div className="text-[11px] text-faint">
                            {p.cluster_id ?? 'manual selection'} · {p.draft.region}
                          </div>
                        </Td>
                        <Td>
                          <ClassTag cls={cls} />
                        </Td>
                        <Td className="tnum text-right">{p.draft.site_ids.length}</Td>
                        <Td>
                          <div>{p.draft.intervention_label}</div>
                          <div className="mt-0.5">
                            <CapexChip cls={p.draft.capex_class} />
                          </div>
                        </Td>
                        <Td className="tnum text-right font-semibold">{idr(p.draft.capex_total_idr)}</Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <FitBadge d={p.draft} />
                            <span className="tnum text-[11px] text-muted">
                              D+{p.draft.rfs_days} vs {p.draft.window_days === null ? '—' : `D+${p.draft.window_days}`}
                            </span>
                          </div>
                          <div className="tnum text-[11px] text-faint">
                            RFS {date(p.draft.target_rfs)}
                            {f.kind === 'bridge' && ' · refarm bridge'}
                          </div>
                        </Td>
                        <Td>
                          <div className="text-[12.5px]">{ap.name}</div>
                          <div className="text-[11px] text-faint">
                            {p.route.label}
                            {p.route.cosign ? ` + ${p.route.cosign}` : ''}
                            {p.route.auto ? ' · auto' : ''}
                          </div>
                        </Td>
                        <Td>
                          <StatusBadge s={p.status} />
                        </Td>
                        <Td>
                          {p.status === 'approved' || p.status === 'handed_off' ? (
                            <div className="flex items-center gap-2">
                              <HandoffDots p={p} />
                              <span className="tnum text-[11px] text-muted">
                                {ho.ack} of {ho.req.length}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[11px] text-faint">after approval</span>
                          )}
                        </Td>
                        <Td className="tnum text-right text-muted">{ageText(hoursBetween(p.created, now))}</Td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section id="unplanned" className="mt-5 border border-line bg-panel">
          <header className="flex h-10 items-center justify-between border-b border-line px-4">
            <h3 className="text-sm font-semibold">
              Clusters without a plan · {stats.unplanned.length} · {idr(stats.unplanned.reduce((s, c) => s + c.exposure_idr, 0))}/month at risk
            </h3>
            <span className="flex items-center gap-1.5 text-[11px] text-faint">
              Forecast Orchestrator · Program Match Agent <Fresh f="D-1" />
            </span>
          </header>
          {stats.unplanned.length === 0 ? (
            <Empty>Every predicted cluster is covered by a program or a plan.</Empty>
          ) : (
            <div className="grid grid-cols-2">
              {stats.unplanned.slice(0, 12).map((c, k) => (
                <button key={c.id} onClick={() => nav(`/phase1/forecast?cluster=${c.id}`)} className={clsx('group flex items-center gap-3 border-b border-line/70 px-4 py-2 text-left hover:bg-panel2', k % 2 === 0 && 'border-r')}>
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: CLASS_META[c.cls].color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Id>{c.id}</Id>
                      <span className="truncate text-sm font-medium">{c.title}</span>
                    </div>
                    <div className="tnum text-[11px] text-faint">
                      {CLASS_META[c.cls].label} · {c.site_ids.length} sites · {db().distById[c.district_id]?.name ?? c.region} · {c.coverage.verdict === 'partial' ? 'partially covered' : 'not covered'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={clsx('tnum text-sm font-semibold', c.crossing_week <= 3 ? 'text-bad' : c.crossing_week <= 5 ? 'text-warn' : 'text-ink')}>W+{c.crossing_week}</div>
                    <div className="tnum text-[11px] text-muted">{idr(c.exposure_idr)}/mo</div>
                  </div>
                  <ArrowRight size={14} className="shrink-0 text-faint group-hover:text-ioh-yellow" />
                </button>
              ))}
            </div>
          )}
          {stats.unplanned.length > 12 && (
            <button onClick={() => nav('/phase1/forecast')} className="block w-full px-4 py-2 text-left text-xs text-muted hover:text-ink">
              {stats.unplanned.length - 12} more on the forecast board →
            </button>
          )}
        </section>
      </div>
    </div>
  )
}
