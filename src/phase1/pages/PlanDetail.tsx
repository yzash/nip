import clsx from 'clsx'
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, Send } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Badge, Button, Fresh, Id } from '@/components/ui'
import { addDays, dateShort, idr } from '@/lib/format'
import { INTERVENTIONS } from '@/lib/plan'
import { useApp } from '@/store/app'
import { HANDOFFS } from '../content/golive'
import { CLASS_META, clustersFrom, type P1Plan } from '../model'
import { useP1Store } from '../store'
import { CriticalPath } from './plans/CriticalPath'
import { DecisionButtons, SubmitButton } from './plans/Decide'
import { BoqPanel, HistoryPanel, PoPanel, RoutePanel, Section, SitesPanel, StockPanel, TowercoPanel, VendorPanel, shortfallLines } from './plans/Panels'
import { CAPEX_LABEL, INTERVENTIONS_FOR, StatusBadge, day0, fitOf, handoffProgress, planClass, rebuildDraft, towercoRequired } from './plans/shared'

export function PlanDetailPage() {
  const { id } = useParams()
  const plan = useP1Store((s) => s.plans.find((p) => p.id === id))
  if (!plan)
    return (
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-6 py-10 text-sm text-muted">
          Plan <Id>{id}</Id> is not in this session.{' '}
          <Link to="/phase1/plans" className="text-ioh-yellow">
            Back to plans
          </Link>
        </div>
      </div>
    )
  return <PlanView p={plan} />
}

function PlanView({ p }: { p: P1Plan }) {
  const nav = useNavigate()
  const incidents = useApp((s) => s.incidents)
  const toast = useApp((s) => s.toast)
  const updateDraft = useP1Store((s) => s.updateDraft)
  const log = useP1Store((s) => s.log)
  const byId = useMemo(() => new Map(clustersFrom(incidents).map((c) => [c.id, c])), [incidents])
  const d = p.draft
  const cls = planClass(p, byId)
  const fit = fitOf(d)
  const start = day0(d)
  const short = shortfallLines(p)
  const tcReq = towercoRequired(p)
  const ho = handoffProgress(p)
  const ivOptions = [...new Set([...INTERVENTIONS_FOR[cls], d.intervention])]

  const fromStock = d.capex_total_idr - d.po_hardware_idr - d.po_services_idr
  const driver = d.critical_path.filter((x) => x.critical && ['PO delivery', 'Tower co', 'Dispatch'].includes(x.lane)).map((x) => (x.lane === 'PO delivery' ? `the ${x.end - x.start}-day PO delivery` : x.lane === 'Tower co' ? `tower company access (${x.end - x.start} d)` : 'warehouse transfers'))

  const switchIv = (iv: string) => {
    if (iv === d.intervention) return
    const nd = rebuildDraft(p, iv)
    updateDraft(p.id, nd)
    log({ action: 'Intervention changed', object: p.id, detail: `${d.intervention_label} → ${nd.intervention_label}` })
    toast(`${p.id} rebuilt as ${nd.intervention_label}: ${idr(nd.capex_total_idr)}, RFS D+${nd.rfs_days}`, 'info')
  }

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        {/* header */}
        <div className="flex items-center gap-2 text-xs text-faint">
          <Link to="/phase1/plans" className="flex items-center gap-1 hover:text-ink">
            <ChevronLeft size={13} /> Plans
          </Link>
          <span>/</span>
          <Id>{p.id}</Id>
        </div>
        <div className="mt-1.5 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="truncate text-[22px] font-semibold leading-7">{p.name}</h1>
              <StatusBadge s={p.status} />
              <Fresh f="live" />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
              <Id className="text-ink">{p.id}</Id>
              <span className="text-faint">·</span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[cls].color }} />
                {CLASS_META[cls].label}
              </span>
              <span className="text-faint">·</span>
              {p.cluster_id ? (
                <Link to={`/phase1/forecast?cluster=${p.cluster_id}`} className="font-mono text-[11.5px] hover:text-ioh-yellow">
                  {p.cluster_id} ↗
                </Link>
              ) : (
                <span>manual site selection</span>
              )}
              <span className="text-faint">·</span>
              <span>
                {d.district_label}, {d.region}
              </span>
              <span className="text-faint">·</span>
              <span>
                drafted by {p.created_by} {dateShort(p.created)}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <div className="flex items-center gap-2">
              <SubmitButton p={p} />
              <DecisionButtons p={p} />
              {p.status === 'approved' && (
                <Button variant="primary" onClick={() => nav(`/phase1/handoff?plan=${p.id}`)}>
                  <Send size={13} /> Hand off · {ho.ack} of {ho.req.length} acknowledged
                </Button>
              )}
              {p.status === 'handed_off' && (
                <Button onClick={() => nav(`/phase1/handoff?plan=${p.id}`)}>
                  <CheckCircle2 size={13} className="text-ok" /> Handed off · view payloads
                </Button>
              )}
            </div>
            {p.status === 'draft' && (
              <div className="text-[11px] text-faint">
                Routes to {p.route.label}
                {p.route.auto ? ' (auto-approve)' : ''} on submit
              </div>
            )}
            {(p.status === 'rejected' || p.status === 'deferred') && p.reason && (
              <div className="max-w-[420px] text-right text-[11px] text-warn">
                {p.status === 'rejected' ? 'Rejected' : 'Deferred'} by {p.decided_by}: {p.reason}
              </div>
            )}
          </div>
        </div>

        {/* facts */}
        <div className="mt-4 grid grid-cols-[0.7fr_1.5fr_1fr_1fr_1.1fr_1.1fr_1.2fr] border border-line bg-panel">
          <Fact label="Sites" value={String(d.site_ids.length)} sub={d.district_label} />
          <Fact
            label="Intervention"
            value={
              p.status === 'draft' ? (
                <select value={d.intervention} onChange={(e) => switchIv(e.target.value)} className="-ml-1 h-7 max-w-full border border-line2 bg-panel2 px-1 text-[14px] font-semibold hover:border-muted">
                  {ivOptions.map((iv) => (
                    <option key={iv} value={iv}>
                      {INTERVENTIONS[iv]?.label ?? iv}
                    </option>
                  ))}
                </select>
              ) : (
                d.intervention_label
              )
            }
            sub={p.status === 'draft' ? 'switch to rebuild BOQ, stock, PO, path' : 'locked after submit'}
          />
          <Fact label="CapEx class" value={CAPEX_LABEL[d.capex_class]} sub="Smart CapEx · Action Ladder" />
          <Fact label="Total" value={idr(d.capex_total_idr)} sub={`${idr(d.capex_total_idr / d.site_ids.length)} per site`} tone="yellow" />
          <Fact label="Target RFS" value={dateShort(d.target_rfs)} sub={`D+${d.rfs_days} from plan build`} />
          <Fact label="Window to breach" value={d.window_days === null ? '—' : `${d.window_days} days`} sub={d.window_days === null ? 'no predicted breach' : `breach ${dateShort(addDays(start, d.window_days))}`} tone={d.window_days !== null && d.window_days <= 28 ? 'bad' : undefined} />
          <Fact
            label="Fit"
            value={fit.kind === 'fits' ? 'Fits window' : fit.kind === 'bridge' ? 'Needs bridge' : fit.kind === 'late' ? 'Late' : '—'}
            sub={fit.kind === 'fits' ? `${-fit.gap} d slack` : fit.kind === 'none' ? '' : `RFS ${fit.gap} d after breach`}
            tone={fit.kind === 'fits' ? 'ok' : fit.kind === 'bridge' ? 'warn' : fit.kind === 'late' ? 'bad' : undefined}
            last
          />
        </div>

        {/* callouts */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div className={clsx('border px-4 py-3', fit.kind === 'fits' ? 'border-ok/40 bg-ok/[0.05]' : fit.kind === 'late' ? 'border-bad/50 bg-bad/[0.06]' : 'border-warn/50 bg-warn/[0.06]')}>
            {fit.kind === 'bridge' && d.bridge ? (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <AlertTriangle size={15} className="text-warn" /> Saturation lands in {d.window_days} days, RFS in {d.rfs_days}: bridge {fit.gap} days with refarming
                </div>
                <div className="mt-1 pl-[23px] text-xs text-muted">
                  {d.bridge.label}, live D+{d.bridge.days} under the NOC’s zero-cost auto-approval, holds the cluster from {dateShort(addDays(start, d.window_days ?? 0))} until the sector add is on air {dateShort(d.target_rfs)}.
                </div>
              </>
            ) : fit.kind === 'fits' ? (
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 size={15} className="text-ok" /> RFS {dateShort(d.target_rfs)} lands {-fit.gap} days before the predicted breach: no bridge needed
              </div>
            ) : fit.kind === 'late' ? (
              <div className="flex items-center gap-2 text-sm font-semibold">
                <AlertTriangle size={15} className="text-bad" /> RFS lands {fit.gap} days after the predicted breach and no zero-cost bridge applies
              </div>
            ) : (
              <div className="text-sm text-muted">No predicted breach date for this selection.</div>
            )}
          </div>
          <div className="border border-line bg-panel px-4 py-3">
            <div className="text-sm font-semibold">
              {idr(fromStock)} of hardware comes from stock; the PO draft is {idr(d.po_hardware_idr + d.po_services_idr)}
            </div>
            <div className="mt-1 text-xs text-muted">
              {short.length ? short.map((s) => s.text).join('. ') + '. ' : 'Every hardware line is covered from warehouse stock. '}
              {driver.length ? `The critical path runs through ${driver.join(' and ')}.` : 'Physical build is the critical path.'}
            </div>
          </div>
        </div>

        {/* main grid */}
        <div className="mt-4 grid grid-cols-[minmax(0,1fr)_400px] gap-4">
          <div className="min-w-0 space-y-4">
            <Section
              title={`Critical path · RFS D+${d.rfs_days}`}
              right={<span className="text-[11px] text-faint">Stages 4 · 5 · 6 · 6b in parallel · PRD §8</span>}
            >
              <CriticalPath d={d} />
            </Section>
            <BoqPanel p={p} />
            <StockPanel p={p} />
            <PoPanel p={p} />
            <SitesPanel p={p} />
          </div>
          <div className="space-y-4">
            <RoutePanel p={p} />
            {(p.status === 'approved' || p.status === 'handed_off') && (
              <Section title={`Hand-off · ${ho.ack} of ${ho.req.length} acknowledged`} right={<Fresh f="live" />}>
                <div className="px-4 py-1">
                  {HANDOFFS.filter((h) => ho.req.includes(h.id)).map((h) => {
                    const s = p.handoffs[h.id]
                    return (
                      <div key={h.id} className="flex items-center justify-between gap-2 border-t border-line/60 py-1.5 first:border-t-0">
                        <span className="truncate text-[12.5px]">{h.target}</span>
                        {s?.state === 'acknowledged' ? <span className="font-mono text-[11.5px] text-ok">{s.ref}</span> : s?.state === 'sent' ? <Badge tone="yellow">Sent</Badge> : <span className="text-[11px] text-faint">not sent</span>}
                      </div>
                    )
                  })}
                </div>
                {p.status === 'approved' && (
                  <button onClick={() => nav(`/phase1/handoff?plan=${p.id}`)} className="flex w-full items-center justify-between border-t border-line px-4 py-2 text-xs text-muted hover:text-ink">
                    Open hand-off and payload preview <ArrowRight size={13} />
                  </button>
                )}
              </Section>
            )}
            <VendorPanel p={p} />
            <TowercoPanel p={p} required={tcReq} />
            <HistoryPanel p={p} />
          </div>
        </div>
      </div>
    </div>
  )
}

function Fact({ label, value, sub, tone, last }: { label: string; value: ReactNode; sub?: string; tone?: 'ok' | 'warn' | 'bad' | 'yellow'; last?: boolean }) {
  const tc = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'yellow' ? 'text-ioh-yellow' : 'text-ink'
  return (
    <div className={clsx('min-w-0 px-4 py-2.5', !last && 'border-r border-line')}>
      <div className="text-2xs font-medium uppercase tracking-wider text-faint">{label}</div>
      <div className={clsx('tnum mt-0.5 truncate text-[17px] font-semibold leading-7', tc)}>{value}</div>
      {sub && <div className="truncate text-[11px] text-muted">{sub}</div>}
    </div>
  )
}
