import clsx from 'clsx'
import { ArrowLeft, Camera, Check, CircleDashed, Clock, ExternalLink, FileSpreadsheet, FileText, History, RadioTower, ShieldAlert, Truck, Wand2, Zap } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { Program, PurchaseOrder, WorkOrder } from '@/data/types'
import { Badge, Button, Dot, Empty, Fresh, Id, Label, Panel, ReasonModal, Td, Th } from '@/components/ui'
import { STATUS, statusOf } from '@/lib/colors'
import { INTERVENTION_LABEL, date, dateShort, dateTime, daysBetween, idr, num, pct } from '@/lib/format'
import { crossingWeek, lastDay, siteHealth } from '@/lib/metrics'
import { INTERVENTIONS, buildPlan } from '@/lib/plan'
import { nextProgramId, todayIso, useApp, usePolicy, useRole } from '@/store/app'
import { STAGES, cycleWeeks, pendingPos, programBoq, stageSlaDays, vendorById, vendorRows } from './lib'
import { HealthBadge, ManagedChip, ReallocateModal } from './parts'
import { StageTracker } from './StageTracker'

const WO_TONE: Record<WorkOrder['status'], 'neutral' | 'blue' | 'bad' | 'ok' | 'prog'> = {
  open: 'neutral',
  in_progress: 'blue',
  overdue: 'bad',
  completed: 'ok',
  evidence_submitted: 'prog',
}
const PO_TONE: Record<PurchaseOrder['status'], 'neutral' | 'yellow' | 'blue' | 'ok' | 'prog'> = {
  draft: 'neutral',
  pending_release: 'yellow',
  released: 'blue',
  acknowledged: 'blue',
  delivered: 'ok',
  invoiced: 'prog',
}

export function ProgramDetail({ id }: { id: string }) {
  const nav = useNavigate()
  const programs = useApp((s) => s.programs)
  const p = programs.find((x) => x.program_id === id)
  if (!p)
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="text-sm text-muted">
          Program <span className="font-mono">{id}</span> not found in this session.
        </div>
        <Button onClick={() => nav('/programs')}>
          <ArrowLeft size={13} /> Program Console
        </Button>
      </div>
    )
  return <Detail p={p} />
}

function Detail({ p }: { p: Program }) {
  const nav = useNavigate()
  const today = todayIso()
  const v = vendorById(p.vendor_id)
  const weeks = daysBetween(today, p.forecast_rfs) / 7
  const slip = daysBetween(p.target_rfs, p.forecast_rfs)
  const cw = cycleWeeks(p)
  const rfsReached = p.stage === 'RFS' || p.stage === 'Validation'

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* header */}
      <header className="shrink-0 border-b border-line bg-panel px-5 py-3">
        <div className="mb-1.5 flex items-center gap-2 text-xs">
          <button onClick={() => nav('/programs')} className="flex items-center gap-1 text-muted hover:text-ioh-yellow">
            <ArrowLeft size={13} /> Program Console
          </button>
          <span className="text-faint">/</span>
          <Id>{p.program_id}</Id>
          <span className="ml-2 flex items-center gap-1 text-faint">
            as of {date(p.as_of)} <Fresh f={p.freshness} />
          </span>
        </div>
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className={clsx('font-mono text-sm', p.created_in_session ? 'text-ioh-yellow' : 'text-muted')}>{p.program_id}</span>
              <h1 className="truncate text-lg font-semibold tracking-tight">{p.name}</h1>
              {p.created_in_session && <Badge tone="yellow">New · this session</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
              <HealthBadge h={p.health} />
              <ManagedChip p={p} />
              <span>{p.type}</span>
              <span className="text-faint">·</span>
              <span>{INTERVENTIONS[p.intervention]?.label ?? p.intervention}</span>
              <span className="text-faint">·</span>
              <span>{p.region}</span>
              <span className="text-faint">·</span>
              <span>{p.province_ids.map((pr) => db().provById[pr]?.name ?? pr).join(', ')}</span>
              <span className="text-faint">·</span>
              <span>{INTERVENTION_LABEL[p.capex_class]}</span>
              {p.gb_factory && (
                <Badge tone="neutral">
                  <Zap size={10} /> GB Factory
                </Badge>
              )}
              {p.source_incident && (
                <button onClick={() => nav(`/incidents?incident=${p.source_incident}`)} className="flex items-center gap-1 text-muted hover:text-ioh-yellow">
                  from <span className="font-mono">{p.source_incident}</span> <ExternalLink size={11} />
                </button>
              )}
            </div>
          </div>
          <div className="flex shrink-0 divide-x divide-line border border-line">
            <HeadStat
              label="Budget · spent"
              value={<>{idr(p.budget_idr)}</>}
              sub={
                <>
                  {idr(p.spent_idr)} spent · {pct((p.spent_idr / Math.max(1, p.budget_idr)) * 100)}
                </>
              }
            />
            <HeadStat
              label="Sites RFS"
              value={
                <>
                  {p.sites_rfs} <span className="text-sm text-faint">/ {p.sites_planned}</span>
                </>
              }
              sub={`stage ${STAGES.indexOf(p.stage) + 1} of 9 · ${p.stage}`}
            />
            <HeadStat label="Target RFS" value={date(p.target_rfs)} sub={`${cw.actual ? 'actual' : 'plan'} decision-to-RFS ${cw.weeks.toFixed(1)} wk`} />
            <HeadStat
              label="Forecast RFS"
              value={<span className={slip > 0 ? 'text-bad' : 'text-ink'}>{date(p.forecast_rfs)}</span>}
              sub={
                rfsReached ? (
                  <span>RFS reached{slip > 0 ? ` · ${slip} d late` : ''}</span>
                ) : (
                  <span>
                    <span className="text-ioh-yellow">in {weeks.toFixed(1)} weeks</span>
                    {slip > 0 ? <span className="text-bad"> · +{slip} d vs target</span> : ' · on target'}
                  </span>
                )
              }
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-4 p-5">
          <div className="flex min-w-0 flex-col gap-4">
            <Panel
              title={
                <span className="flex items-center gap-2">
                  Stage tracker <span className="font-normal text-faint">· nine-stage chain, Decision → Validation</span>
                </span>
              }
              right={
                <span className="flex items-center gap-1.5 text-xs text-faint">
                  {p.managed_by === 'nicc' ? 'NICC: BOQ, PO and vendor in parallel' : 'Legacy: sequential hand-offs'} <Fresh f={p.created_in_session ? 'live' : 'D-1'} />
                </span>
              }
            >
              <StageTracker p={p} today={today} />
            </Panel>
            <SitesPanel p={p} />
            <BoqPanel p={p} />
            <PoPanel p={p} />
            <EvidencePanel p={p} />
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <ActionsPanel p={p} />
            <VendorClock p={p} vendorName={v?.name ?? p.vendor_id} />
            <TowerClock p={p} />
            <BlockersPanel p={p} />
            <GapPanel p={p} />
            <DocumentsPanel p={p} />
            <ActivityPanel p={p} />
          </div>
        </div>
      </div>
    </div>
  )
}

function HeadStat({ label, value, sub }: { label: string; value: ReactNode; sub: ReactNode }) {
  return (
    <div className="min-w-[150px] px-4 py-2">
      <div className="text-2xs font-medium uppercase tracking-wider text-faint">{label}</div>
      <div className="tnum text-base font-semibold leading-6">{value}</div>
      <div className="tnum text-[11px] text-muted">{sub}</div>
    </div>
  )
}

// ---- Actions and approval gates ---------------------------------------------------------
function ActionsPanel({ p }: { p: Program }) {
  const role = useRole()
  const pos = useApp((s) => s.pos)
  const audit = useApp((s) => s.audit)
  const [defer, setDefer] = useState(false)
  const [realloc, setRealloc] = useState(false)
  const app = useApp.getState
  const pa = p.pending_approval
  const myGate = pa && pa.role === role.role_code && pa.gate !== 'PO'
  const pend = pendingPos(pos, p.program_id)
  const v = vendorById(p.vendor_id)
  const vendorConfirmed = p.stage_history.some((h) => h.stage === 'Vendor allocation')
  const needsVendorConfirm = !!p.created_in_session && !vendorConfirmed
  const deferred = audit.find((a) => a.object === p.program_id && a.action === 'Program deferred')
  const hasStage = (s: string) => p.stage_history.find((h) => h.stage === s)
  const past = (s: (typeof STAGES)[number]) => STAGES.indexOf(p.stage) > STAGES.indexOf(s)

  type GateState = 'done' | 'pending' | 'external' | 'later' | 'overdue' | 'auto'
  const gates: {
    gate: string
    who: string
    state: GateState
    note?: string
  }[] = [
    {
      gate: 'Stage 3 · Decision',
      who: p.capex_class === 'capex_major' ? `Head of Network${pa?.cosign ? ` + ${pa.cosign}` : ''}` : p.capex_class === 'capex_minor' ? 'Head of Planning' : 'Regional Network Manager',
      state: pa?.gate === 'Decision' ? 'pending' : 'done',
      note: hasStage('Decision')?.end ? dateShort(hasStage('Decision')!.end!) : undefined,
    },
    {
      gate: 'Stage 4 · BOQ variance',
      who: 'Deployment lead (> 10% vs price book)',
      state: pa?.gate === 'BOQ variance' ? 'pending' : past('BOQ') || (p.managed_by === 'nicc' && past('Decision')) ? 'auto' : 'later',
      note: pa?.gate === 'BOQ variance' ? 'variance flagged' : past('BOQ') || (p.managed_by === 'nicc' && past('Decision')) ? 'within tolerance' : undefined,
    },
    {
      gate: 'Stage 5 · PO release',
      who: 'Procurement',
      state: pend.length ? 'pending' : past('PO') || pos.some((x) => x.program_id === p.program_id && x.status !== 'draft' && x.status !== 'pending_release') ? 'done' : 'later',
      note: pend.length ? `${pend.length} PO${pend.length > 1 ? 's' : ''} · ${idr(pend.reduce((s, x) => s + x.amount_idr, 0))}` : undefined,
    },
    {
      gate: 'Stage 6 · Vendor allocation',
      who: `Deployment lead · ${v?.short ?? p.vendor_id}`,
      state: needsVendorConfirm ? 'pending' : vendorConfirmed ? 'done' : 'later',
      note: needsVendorConfirm ? 'agent proposal' : undefined,
    },
  ]
  if (p.tower_company_clock)
    gates.push({
      gate: 'Stage 6b · Tower company',
      who: p.tower_company_clock.tower_company,
      state: p.tower_company_clock.status === 'approved' ? 'done' : p.tower_company_clock.status === 'overdue' ? 'overdue' : 'external',
      note: `due ${dateShort(p.tower_company_clock.due)}`,
    })
  gates.push({
    gate: 'Stage 8 · RFS acceptance',
    who: 'Deployment lead',
    state: past('RFS') ? 'done' : p.stage === 'RFS' ? 'pending' : 'later',
  })

  const icon = (s: GateState) =>
    s === 'done' || s === 'auto' ? (
      <Check size={12} className="text-ok" strokeWidth={3} />
    ) : s === 'pending' ? (
      <Clock size={12} className="text-ioh-yellow" />
    ) : s === 'overdue' ? (
      <ShieldAlert size={12} className="text-bad" />
    ) : s === 'external' ? (
      <RadioTower size={12} className="text-warn" />
    ) : (
      <CircleDashed size={12} className="text-faint" />
    )

  const actions: ReactNode[] = []
  if (myGate)
    actions.push(
      <div key="gate" className="border border-ioh-yellow/40 bg-ioh-yellow/5 p-3">
        <div className="mb-1 text-sm font-semibold">{pa!.gate === 'Decision' ? 'Stage 3 decision awaits you' : 'BOQ variance awaits your review'}</div>
        <div className="mb-2 text-xs text-muted">
          {pa!.gate === 'Decision'
            ? `${idr(p.budget_idr)} · ${INTERVENTION_LABEL[p.capex_class]}${pa!.cosign ? ` · ${pa!.cosign} co-sign required` : ''} · waiting ${daysBetween(pa!.since, todayIso())} d`
            : p.blockers.find((b) => b.type === 'boq_variance')?.text}
          {deferred && <span className="text-warn"> · deferred earlier: {deferred.reason}</span>}
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ok"
            onClick={() => {
              app().approveProgram(p.program_id, 'approve')
              app().toast(
                pa!.gate === 'Decision'
                  ? `${p.program_id} approved${pa!.cosign ? `, routed to ${pa!.cosign} for co-sign` : ''}. BOQ Agent started.`
                  : `${p.program_id} BOQ variance approved. PO drafting unblocked.`,
              )
            }}
          >
            <Check size={12} /> Approve
          </Button>
          <Button size="sm" onClick={() => setDefer(true)}>
            Defer
          </Button>
        </div>
      </div>,
    )
  if (needsVendorConfirm && role.role_code === 'DEPLOY')
    actions.push(
      <div key="vendor" className="border border-ioh-yellow/40 bg-ioh-yellow/5 p-3">
        <div className="mb-1 text-sm font-semibold">Confirm vendor allocation</div>
        <div className="mb-2 text-xs text-muted">
          Vendor Allocation Agent proposes <span className="text-ink">{v?.name}</span>: covers {p.region},{' '}
          {vendorRows(useApp.getState().programs).find((r) => r.vendor.vendor_id === p.vendor_id)?.free ?? 0} sites/month free, {v?.sla_pct}% SLA.
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ok"
            onClick={() => {
              app().confirmVendor(p.program_id, p.vendor_id)
              app().toast(`${v?.short} confirmed on ${p.program_id}. ${p.sites_planned} site survey work orders released to the field.`)
            }}
          >
            <Check size={12} /> Confirm {v?.short}
          </Button>
          <Button size="sm" onClick={() => setRealloc(true)}>
            Choose another vendor
          </Button>
        </div>
      </div>,
    )
  if (pend.length && role.role_code === 'PROC')
    actions.push(
      <div key="po" className="border border-ioh-yellow/40 bg-ioh-yellow/5 p-3">
        <div className="mb-2 text-sm font-semibold">
          Release {pend.length} PO{pend.length > 1 ? 's' : ''} · {idr(pend.reduce((s, x) => s + x.amount_idr, 0))}
        </div>
        <div className="flex flex-wrap gap-2">
          {pend.map((po) => (
            <Button
              key={po.po_id}
              size="sm"
              variant="ok"
              onClick={() => {
                app().releasePO(po.po_id)
                app().toast(`${po.po_id} released to ${vendorById(po.vendor)?.short}.`)
              }}
            >
              Release {po.po_id}
            </Button>
          ))}
        </div>
      </div>,
    )
  if (p.vendor_sla_risk && (role.role_code === 'DEPLOY' || role.role_code === 'EXEC'))
    actions.push(
      <div key="sla" className="border border-warn/40 bg-warn/5 p-3">
        <div className="mb-1 text-sm font-semibold text-warn">Vendor SLA at risk</div>
        <div className="mb-2 text-xs text-muted">{p.blockers.find((b) => b.type === 'vendor_sla')?.text ?? `${v?.short} running behind contractual RFS.`}</div>
        <Button size="sm" variant="primary" onClick={() => setRealloc(true)}>
          <Truck size={12} /> Reallocate vendor capacity
        </Button>
      </div>,
    )

  return (
    <Panel
      title="Approvals and actions"
      right={
        <span className="flex items-center gap-1.5 text-xs text-faint">
          as {role.role_code} <Fresh f="live" />
        </span>
      }
    >
      <div className="flex flex-col gap-3">
        {actions.length ? (
          actions
        ) : (
          <div className="text-xs text-faint">
            No action needed from {role.title} on this program.
            {pend.length > 0 && role.role_code !== 'PROC' ? ` Awaiting Procurement release of ${pend.length} PO${pend.length > 1 ? 's' : ''}.` : ''}
          </div>
        )}
        {!p.vendor_sla_risk && !needsVendorConfirm && role.role_code === 'DEPLOY' && STAGES.indexOf(p.stage) >= 2 && STAGES.indexOf(p.stage) <= 6 && (
          <button onClick={() => setRealloc(true)} className="flex items-center gap-1 self-start text-xs text-muted hover:text-ioh-yellow">
            <Truck size={12} /> Reallocate vendor
          </button>
        )}
        <div>
          <Label className="mb-1.5">Approval gates</Label>
          <div className="divide-y divide-line/70 border border-line">
            {gates.map((g) => (
              <div key={g.gate} className="flex items-start gap-2 px-2.5 py-1.5 text-xs">
                <span className="mt-0.5 flex w-4 justify-center">{icon(g.state)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={clsx('font-medium', g.state === 'later' ? 'text-muted' : 'text-ink')}>{g.gate}</span>
                    <span
                      className={clsx(
                        'tnum shrink-0 text-[11px]',
                        g.state === 'pending' ? 'text-ioh-yellow' : g.state === 'overdue' ? 'text-bad' : g.state === 'external' ? 'text-warn' : 'text-faint',
                      )}
                    >
                      {g.note ?? (g.state === 'done' ? 'done' : g.state === 'pending' ? 'pending' : g.state === 'external' ? 'external' : g.state === 'auto' ? 'auto' : 'later')}
                    </span>
                  </div>
                  <div className="truncate text-[11px] text-faint" title={g.who}>
                    {g.who}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <ReasonModal
        open={defer}
        onClose={() => setDefer(false)}
        title={`Defer ${p.program_id}`}
        confirmLabel="Defer"
        onSubmit={(reason) => {
          app().approveProgram(p.program_id, 'defer', reason)
          app().toast(`${p.program_id} deferred: ${reason}`, 'warn')
        }}
      />
      {realloc && <ReallocateModal program={p} onClose={() => setRealloc(false)} />}
    </Panel>
  )
}

// ---- Clocks ------------------------------------------------------------------------------
function ClockBar({ elapsed, total, tone }: { elapsed: number; total: number; tone: 'ok' | 'warn' | 'bad' }) {
  const c = tone === 'ok' ? STATUS.ok : tone === 'warn' ? STATUS.warn : STATUS.bad
  const over = elapsed > total
  return (
    <div className="relative h-2 w-full bg-line">
      <div
        className="absolute inset-y-0 left-0"
        style={{
          width: `${Math.min(100, (Math.min(elapsed, total) / Math.max(1, over ? elapsed : total)) * 100)}%`,
          background: c,
        }}
      />
      {over && <div className="absolute inset-y-0 border-l border-canvas bg-bad/60" style={{ left: `${(total / elapsed) * 100}%`, right: 0 }} />}
    </div>
  )
}

function KV({ k, v, className }: { k: string; v: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-3 text-xs', className)}>
      <span className="text-faint">{k}</span>
      <span className="tnum text-right text-ink">{v}</span>
    </div>
  )
}

function VendorClock({ p, vendorName }: { p: Program; vendorName: string }) {
  const today = todayIso()
  const v = vendorById(p.vendor_id)
  const idx = STAGES.indexOf(p.stage)
  const vendorHist = p.stage_history.find((h) => h.stage === 'Vendor allocation')
  // Vendor clock: not started before the vendor is engaged; for NICC programs the vendor lane runs
  // in parallel from the PO stage, so an unconfirmed allocation carries its own 1-day clock.
  const notStarted = idx < STAGES.indexOf('PO') || (p.managed_by === 'legacy' && idx < STAGES.indexOf('Vendor allocation'))
  const clockStage: (typeof STAGES)[number] = !vendorHist && p.managed_by === 'nicc' && idx <= STAGES.indexOf('Vendor allocation') ? 'Vendor allocation' : p.stage
  const cur =
    clockStage === 'Vendor allocation' && !vendorHist
      ? (p.stage_history.find((h) => h.stage === 'PO') ?? p.stage_history[p.stage_history.length - 1])
      : (p.stage_history.find((h) => h.stage === p.stage && !h.end) ?? p.stage_history[p.stage_history.length - 1])
  const sla = stageSlaDays(p, clockStage)
  const elapsed = cur ? Math.max(0, daysBetween(cur.start, today)) : 0
  const left = sla - elapsed
  const toTarget = daysBetween(today, p.target_rfs)
  const slip = daysBetween(p.target_rfs, p.forecast_rfs)
  const tone: 'ok' | 'warn' | 'bad' = p.vendor_sla_risk || (left < 0 && p.stage !== 'Validation' && !notStarted) ? 'bad' : slip > 0 || (left <= 0 && !notStarted) ? 'warn' : 'ok'
  const blocker = p.blockers.find((b) => b.type === 'vendor_sla')
  const done = p.stage === 'Validation'
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <Truck size={14} className="text-muted" /> Vendor SLA clock
        </span>
      }
      right={
        <Badge tone={notStarted ? 'neutral' : done ? 'ok' : tone}>{notStarted ? 'Not started' : done ? 'Build complete' : tone === 'ok' ? 'Within SLA' : tone === 'warn' ? 'Watch' : 'At risk'}</Badge>
      }
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm font-semibold">{vendorName}</div>
        <span className="font-mono text-[11px] text-faint">{v?.short}</span>
      </div>
      {notStarted ? (
        <div className="text-xs text-muted">
          Clock starts when the vendor is engaged after the {p.stage === 'Decision' ? 'Decision gate' : 'BOQ'}; proposed vendor shown. Contractual RFS is already committed.
        </div>
      ) : !done ? (
        <>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-muted">
              {clockStage}
              {clockStage !== p.stage ? ' (parallel lane)' : ''} · day {elapsed} of {sla}
            </span>
            <span className={clsx('tnum font-semibold', left < 0 ? 'text-bad' : left <= 1 ? 'text-warn' : 'text-ink')}>{left < 0 ? `${-left} d over SLA` : `${left} d left`}</span>
          </div>
          <ClockBar elapsed={elapsed} total={Math.max(1, sla)} tone={left < 0 ? 'bad' : left <= 1 ? 'warn' : 'ok'} />
        </>
      ) : (
        <div className="text-xs text-muted">Build complete; vendor in 90-day warranty window.</div>
      )}
      <div className="mt-3 flex flex-col gap-1">
        {!notStarted && !done && <KV k="Clock started" v={cur ? date(cur.start) : '—'} />}
        {!notStarted && !done && <KV k="Stage SLA" v={`${sla} d (${p.managed_by === 'nicc' ? 'NICC target' : 'legacy norm'})`} />}
        <KV
          k="Contractual RFS"
          v={
            <>
              {date(p.target_rfs)} <span className="text-faint">· {toTarget >= 0 ? `${toTarget} d to go` : `${-toTarget} d ago`}</span>
            </>
          }
        />
        <KV
          k="Forecast RFS"
          v={
            <span className={slip > 0 ? 'text-bad' : ''}>
              {date(p.forecast_rfs)}
              {slip > 0 ? ` (+${slip} d)` : ''}
            </span>
          }
        />
        <KV k="Vendor SLA compliance, trailing 6 mo" v={<span className={v && v.sla_pct < 88 ? 'text-warn' : ''}>{v?.sla_pct ?? '—'}%</span>} />
      </div>
      {blocker && <div className="mt-3 border-l-2 border-bad bg-bad/5 px-2 py-1.5 text-xs text-bad">{blocker.text}</div>}
    </Panel>
  )
}

function TowerClock({ p }: { p: Program }) {
  const tc = p.tower_company_clock
  const today = todayIso()
  if (!tc)
    return (
      <Panel
        title={
          <span className="flex items-center gap-2">
            <RadioTower size={14} className="text-muted" /> Stage 6b · tower company clock
          </span>
        }
      >
        <div className="text-xs text-faint">No tower company dependency: no loading change on third-party structures for this intervention.</div>
      </Panel>
    )
  const elapsed = Math.max(0, daysBetween(tc.requested, tc.status === 'approved' ? tc.due : today))
  const left = daysBetween(today, tc.due)
  const tone = tc.status === 'approved' ? 'ok' : tc.status === 'overdue' || left < 0 ? 'bad' : left <= 3 ? 'warn' : 'warn'
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <RadioTower size={14} className="text-muted" /> Stage 6b · tower company clock
        </span>
      }
      right={<Badge tone={tc.status === 'approved' ? 'ok' : tc.status === 'overdue' ? 'bad' : 'warn'}>{tc.status}</Badge>}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">{tc.tower_company}</div>
        <div className={clsx('tnum text-sm font-semibold', tc.status === 'approved' ? 'text-ok' : left < 0 ? 'text-bad' : 'text-ink')}>
          {tc.status === 'approved' ? 'Access granted' : left < 0 ? `${-left} d overdue` : `${left} d remaining`}
        </div>
      </div>
      <ClockBar elapsed={elapsed} total={tc.sla_days} tone={tone} />
      <div className="mt-1 flex justify-between text-[10.5px] text-faint">
        <span>requested {dateShort(tc.requested)}</span>
        <span>
          day {Math.min(elapsed, 999)} of {tc.sla_days} SLA
        </span>
        <span>due {dateShort(tc.due)}</span>
      </div>
      <div className="mt-3 flex flex-col gap-1">
        <KV k="Scope" v={<span className="text-muted">{tc.items}</span>} />
        <KV k="Requested" v={date(tc.requested)} />
        <KV k="SLA" v={`${tc.sla_days} days`} />
        <KV k="Due" v={date(tc.due)} />
      </div>
      <div className="mt-3 text-[11px] leading-4 text-faint">Tower Company Coordination Agent drafted the access and loading request at approval and runs it in parallel with vendor allocation.</div>
    </Panel>
  )
}

function BlockersPanel({ p }: { p: Program }) {
  const today = todayIso()
  return (
    <Panel
      title={
        <>
          Blockers <span className="tnum font-normal text-faint">{p.blockers.length}</span>
        </>
      }
      right={<Fresh f="D-1" />}
    >
      {!p.blockers.length ? (
        <div className="text-xs text-faint">No open blockers.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {p.blockers.map((b, i) => (
            <div key={i} className={clsx('border-l-2 px-2.5 py-1.5', b.type === 'vendor_sla' || b.type === 'tower_company' ? 'border-bad bg-bad/5' : 'border-warn bg-warn/5')}>
              <div className="flex items-center justify-between gap-2 text-2xs font-semibold uppercase tracking-wider text-muted">
                <span>{b.type.replace(/_/g, ' ')}</span>
                <span className="tnum font-normal normal-case tracking-normal text-faint">
                  since {dateShort(b.since)} · {daysBetween(b.since, today)} d
                </span>
              </div>
              <div className="mt-0.5 text-xs text-ink">{b.text}</div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}

function GapPanel({ p }: { p: Program }) {
  const nav = useNavigate()
  const programs = useApp((s) => s.programs)
  const reservations = useApp((s) => s.reservations)
  if (!p.gap_flags.length) return null
  const interim = (ids: string[]) => {
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
      object: p.program_id,
      detail: `${ids.length} sites`,
    })
    nav('/planner?tab=builder')
  }
  return (
    <Panel
      className="border-bad/50"
      title={
        <span className="flex items-center gap-2 text-bad">
          <ShieldAlert size={14} /> Gap flag · predicted failure before RFS
        </span>
      }
      right={<Fresh f="D-1" />}
    >
      {p.gap_flags.map((g, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="text-sm text-ink">{g.text}</div>
          <div className="flex flex-wrap gap-1">
            {g.site_ids.map((s) => (
              <Id key={s} onClick={() => nav(`/site/${s}`)} className="border border-line2 px-1">
                {s}
              </Id>
            ))}
          </div>
          <div className="border border-line bg-panel2 px-2.5 py-2 text-xs">
            <div className="mb-0.5 text-2xs font-semibold uppercase tracking-wider text-faint">Suggested action · Program Orchestrator</div>
            <div className="text-ink">{g.suggested_action}</div>
          </div>
          <Button size="sm" variant="primary" className="self-start" onClick={() => interim(g.site_ids)}>
            <Wand2 size={12} /> Draft interim relief in the planner
          </Button>
        </div>
      ))}
    </Panel>
  )
}

function DocumentsPanel({ p }: { p: Program }) {
  const app = useApp.getState
  const icon = (t: string) => (t === 'boq' ? <FileSpreadsheet size={14} className="text-ok" /> : <FileText size={14} className="text-muted" />)
  const label: Record<string, string> = {
    business_case: 'Business case',
    boq: 'BOQ',
    rfs: 'RFS acceptance',
  }
  return (
    <Panel
      title={
        <>
          Documents <span className="tnum font-normal text-faint">{p.documents.length}</span>
        </>
      }
      pad={false}
    >
      <div className="divide-y divide-line/70">
        {p.documents.map((d) => (
          <button
            key={d.name}
            onClick={() => app().toast('Document preview connects to the IOH document store in the pilot', 'info')}
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-panel2"
          >
            {icon(d.type)}
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{d.name}</span>
            <span className="text-[10.5px] text-faint">{label[d.type] ?? d.type}</span>
          </button>
        ))}
      </div>
    </Panel>
  )
}

function ActivityPanel({ p }: { p: Program }) {
  const audit = useApp((s) => s.audit)
  const items = audit.filter((a) => a.object === p.program_id || a.detail === p.program_id)
  if (!items.length) return null
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <History size={14} className="text-muted" /> Session activity
        </span>
      }
      right={<Fresh f="live" />}
      pad={false}
    >
      <div className="divide-y divide-line/70">
        {items.map((a) => (
          <div key={a.id} className="px-4 py-2 text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-ink">{a.action}</span>
              <span className="tnum text-faint">{dateTime(a.ts)}</span>
            </div>
            <div className="text-faint">
              {a.actor} · {a.role}
              {a.detail && a.detail !== p.program_id ? ` · ${a.detail}` : ''}
              {a.reason ? ` · ${a.reason}` : ''}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  )
}

// ---- Sites -------------------------------------------------------------------------------
function SitesPanel({ p }: { p: Program }) {
  const D = db()
  const nav = useNavigate()
  const policy = usePolicy()
  const workOrders = useApp((s) => s.workOrders)
  const day = lastDay()
  const rows = useMemo(
    () =>
      p.site_ids
        .filter((s) => D.siteIdx.has(s))
        .map((sid) => {
          const i = D.siteIdx.get(sid)!
          const s = D.sites[i]
          const h = siteHealth(i, day)
          const cw = crossingWeek(i, policy.red_min_probability)
          const wkEnd = cw ? D.weekEndDates[cw - 1] : null
          const wos = workOrders.filter((w) => w.program_id === p.program_id && w.site_id === sid)
          const wo = wos[0]
          return {
            sid,
            s,
            h,
            st: statusOf(h, policy.colour_thresholds.health),
            cw,
            wkEnd,
            before: !!wkEnd && wkEnd < p.forecast_rfs && p.stage !== 'Validation',
            wo,
            dist: D.distById[s.district_id]?.name ?? s.district_id,
          }
        })
        .sort((a, b) => Number(b.before) - Number(a.before) || (a.cw || 99) - (b.cw || 99) || a.h - b.h),
    [p, workOrders, policy, D, day],
  )
  const nBefore = rows.filter((r) => r.before).length
  const bridge = p.source_incident ? (D.optionsByIncident.get(p.source_incident) ?? []).find((o) => o.class === 'noncapex_zero' && /refarm/i.test(o.name)) : undefined
  const woCounts = rows.reduce<Record<string, number>>((m, r) => {
    if (r.wo) m[r.wo.status] = (m[r.wo.status] ?? 0) + 1
    return m
  }, {})
  return (
    <Panel
      pad={false}
      title={
        <span className="flex items-center gap-2">
          Sites <span className="tnum font-normal text-faint">{rows.length}</span>
          {nBefore > 0 && <span className="text-xs font-normal text-bad">· {nBefore} predicted to fail before forecast RFS</span>}
        </span>
      }
      right={
        <span className="flex items-center gap-2 text-xs text-faint">
          {Object.entries(woCounts).map(([k, n]) => (
            <span key={k}>
              {n} {k.replace('_', ' ')}
            </span>
          ))}
          <Fresh f="D-1" />
        </span>
      }
    >
      {nBefore > 0 && bridge && (
        <div className="flex items-center gap-2 border-b border-line bg-panel2 px-4 py-2 text-xs">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Bridge to RFS</span>
          <span className="text-ink">{bridge.name}</span>
          <span className="text-muted">
            · {bridge.predicted_uplift} · zero CapEx · {bridge.lead_days} d lead, from the action ladder on {p.source_incident}
          </span>
        </div>
      )}
      <div className="max-h-[360px] overflow-y-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>Site</Th>
              <Th>District</Th>
              <Th>Health today</Th>
              <Th>Predicted failure</Th>
              <Th>Work order</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sid} onClick={() => nav(`/site/${r.sid}`)} className="cursor-pointer hover:bg-panel2">
                <Td>
                  <Id>{r.sid}</Id> <span className="ml-1 text-ink">{r.s.name}</span>
                </Td>
                <Td className="text-xs text-muted">{r.dist}</Td>
                <Td>
                  <span className="tnum flex items-center gap-2 text-xs">
                    <Dot status={r.st} /> {r.h.toFixed(0)}
                  </span>
                </Td>
                <Td className="text-xs">
                  {r.cw ? (
                    <span className={r.before ? 'text-bad' : 'text-warn'}>
                      W+{r.cw} · {dateShort(r.wkEnd!)}
                      {r.before && <span className="ml-1.5 text-[10.5px] font-semibold uppercase">before RFS</span>}
                    </span>
                  ) : (
                    <span className="text-faint">none in 8 wks</span>
                  )}
                </Td>
                <Td className="text-xs">
                  {r.wo ? (
                    <span className="flex items-center gap-2">
                      <Badge tone={WO_TONE[r.wo.status]}>{r.wo.status.replace('_', ' ')}</Badge>
                      <Id>{r.wo.wo_id}</Id>
                      <span className="text-faint">{r.wo.type}</span>
                    </span>
                  ) : (
                    <span className="text-faint">—</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

// ---- BOQ and PO ------------------------------------------------------------------------
function BoqPanel({ p }: { p: Program }) {
  const extra = useApp((s) => s.boqExtra)
  const policy = usePolicy()
  const reservations = useApp((s) => s.reservations)
  const lines = useMemo(() => programBoq(p.program_id, extra), [p.program_id, extra])
  const res = reservations.filter((r) => r.program_id === p.program_id)
  const whName = (id: string) =>
    db()
      .meta.warehouses.find((w) => w.warehouse_id === id)
      ?.name.split(' ')[0] ?? id
  const stockText = (sku: string, qty: number, cat: string) => {
    if (cat === 'Service') return <span className="text-faint">service</span>
    const rs = res.filter((r) => r.sku === sku)
    const got = rs.reduce((s, r) => s + r.qty, 0)
    const shortfall = Math.max(0, Math.round(qty - got))
    return (
      <span>
        {rs.map((r) => `${r.qty} ${whName(r.warehouse_id)}`).join(' · ') || <span className="text-faint">none in stock</span>}
        {shortfall > 0 && <span className="text-warn"> · {shortfall} on PO</span>}
      </span>
    )
  }
  const total = lines.reduce((s, l) => s + l.total_idr, 0)
  const book = lines.reduce((s, l) => s + l.price_book_idr * l.qty, 0)
  const varPct = book ? ((total - book) / book) * 100 : 0
  return (
    <Panel
      pad={false}
      title={
        <span className="flex items-center gap-2">
          Bill of quantities{' '}
          <span className="tnum font-normal text-faint">
            {lines.length} SKUs · {idr(total)}
          </span>
        </span>
      }
      right={
        <span className="flex items-center gap-1.5 text-xs text-faint">
          <span className={Math.abs(varPct) > policy.boq_variance_pct ? 'text-warn' : ''}>
            {varPct >= 0 ? '+' : '−'}
            {Math.abs(varPct).toFixed(1)}% vs price book
          </span>
          · BOQ Agent <Fresh f={p.created_in_session ? 'live' : 'D-1'} />
        </span>
      }
    >
      {!lines.length ? (
        <Empty>BOQ not yet drafted: the BOQ Agent starts when the Decision gate is approved.</Empty>
      ) : (
        <div className="max-h-[320px] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Unit cost</Th>
                <Th className="text-right">vs book</Th>
                <Th className="text-right">Total</Th>
                {res.length > 0 && <Th>Stock reserved · source</Th>}
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.sku}>
                  <Td>
                    <Id>{l.sku}</Id>
                  </Td>
                  <Td className="max-w-[260px] truncate text-xs text-ink">{l.description}</Td>
                  <Td className="text-xs text-muted">{l.category}</Td>
                  <Td className="tnum text-right text-xs">{num(l.qty, l.qty % 1 ? 1 : 0)}</Td>
                  <Td className="tnum text-right text-xs text-muted">{idr(l.unit_cost_idr)}</Td>
                  <Td className={clsx('tnum text-right text-xs', Math.abs(l.variance_pct) > policy.boq_variance_pct ? 'text-warn' : 'text-faint')}>
                    {l.variance_pct >= 0 ? '+' : '−'}
                    {Math.abs(l.variance_pct).toFixed(1)}%
                  </Td>
                  <Td className="tnum text-right text-xs text-ink">{idr(l.total_idr)}</Td>
                  {res.length > 0 && <Td className="tnum text-xs text-muted">{stockText(l.sku, l.qty, l.category)}</Td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  )
}

function PoPanel({ p }: { p: Program }) {
  const pos = useApp((s) => s.pos)
  const role = useRole()
  const list = pos.filter((x) => x.program_id === p.program_id)
  const app = useApp.getState
  const total = list.reduce((s, x) => s + x.amount_idr, 0)
  return (
    <Panel
      pad={false}
      title={
        <span className="flex items-center gap-2">
          Purchase orders{' '}
          <span className="tnum font-normal text-faint">
            {list.length} · {idr(total)}
          </span>
        </span>
      }
      right={<Fresh f={p.created_in_session ? 'live' : 'D-1'} />}
    >
      {!list.length ? (
        <Empty>No purchase orders yet.</Empty>
      ) : (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <Th>PO</Th>
              <Th>Category</Th>
              <Th>Vendor</Th>
              <Th className="text-right">Amount</Th>
              <Th>Status</Th>
              <Th>Issued</Th>
              <Th>Due</Th>
              <Th>Contract</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {list.map((po) => (
              <tr key={po.po_id}>
                <Td>
                  <Id>{po.po_id}</Id>
                </Td>
                <Td className="text-xs text-ink">{po.category}</Td>
                <Td className="font-mono text-xs text-muted">{vendorById(po.vendor)?.short ?? po.vendor}</Td>
                <Td className="tnum text-right text-xs text-ink">{idr(po.amount_idr)}</Td>
                <Td>
                  <Badge tone={PO_TONE[po.status]}>{po.status.replace('_', ' ')}</Badge>
                </Td>
                <Td className="tnum text-xs text-muted">{po.issued ? dateShort(po.issued) : '—'}</Td>
                <Td className="tnum text-xs text-muted">{dateShort(po.due)}</Td>
                <Td className="font-mono text-[11px] text-faint">{po.contract}</Td>
                <Td className="text-right">
                  {po.status === 'pending_release' &&
                    (role.role_code === 'PROC' ? (
                      <Button
                        size="sm"
                        variant="ok"
                        onClick={() => {
                          app().releasePO(po.po_id)
                          app().toast(`${po.po_id} released to ${vendorById(po.vendor)?.short}.`)
                        }}
                      >
                        Release
                      </Button>
                    ) : (
                      <span className="text-[11px] text-faint">awaiting Procurement</span>
                    ))}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  )
}

// ---- Evidence from field ------------------------------------------------------------------
function EvidencePanel({ p }: { p: Program }) {
  const D = db()
  const nav = useNavigate()
  const workOrders = useApp((s) => s.workOrders)
  const wos = workOrders.filter((w) => w.program_id === p.program_id)
  const withEv = wos.filter((w) => w.evidence.length)
  const files = withEv.reduce((s, w) => s + w.evidence.length, 0)
  const open = wos.filter((w) => w.status === 'open' || w.status === 'in_progress' || w.status === 'overdue')
  const nextDue = open.map((w) => w.due).sort()[0]
  const eng = (id: string) => D.engineers.find((e) => e.engineer_id === id)?.name ?? id
  return (
    <Panel
      pad={false}
      title={
        <span className="flex items-center gap-2">
          <Camera size={14} className="text-muted" /> Evidence uploads from field
          <span className="tnum font-normal text-faint">
            {files} files · {withEv.length} of {wos.length} work orders
          </span>
        </span>
      }
      right={
        <button onClick={() => nav('/field')} className="flex items-center gap-1 text-xs text-muted hover:text-ioh-yellow">
          Field view <ExternalLink size={11} />
        </button>
      }
    >
      {!withEv.length ? (
        <Empty>
          {wos.length
            ? `No evidence yet. ${open.length} work order${open.length === 1 ? '' : 's'} open (${wos[0]?.type.toLowerCase()})${nextDue ? `, first due ${date(nextDue)}` : ''}. Photos and survey forms land here as engineers submit them.`
            : 'No field work orders on this program yet.'}
        </Empty>
      ) : (
        <div className="grid grid-cols-2 gap-px bg-line xl:grid-cols-3">
          {withEv.map((w) => (
            <div key={w.wo_id} className="bg-panel p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Id>{w.wo_id}</Id>
                  <Id onClick={() => nav(`/site/${w.site_id}`)}>{w.site_id}</Id>
                </span>
                <Badge tone={WO_TONE[w.status]}>{w.status.replace('_', ' ')}</Badge>
              </div>
              <div className="mt-1 truncate text-xs text-ink">
                {w.type} · <span className="text-muted">{eng(w.engineer_id)}</span>
              </div>
              <div className="mt-2 flex gap-1">
                {w.evidence.slice(0, 4).map((e) => (
                  <div key={e.name} className="flex h-10 w-12 items-center justify-center border border-line2 bg-panel2 text-faint" title={e.name}>
                    {e.type === 'photo' ? <Camera size={13} /> : <FileText size={13} />}
                  </div>
                ))}
                {w.evidence.length > 4 && <div className="flex h-10 w-8 items-center justify-center text-[11px] text-faint">+{w.evidence.length - 4}</div>}
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-faint">
                <span>
                  {w.checklist.filter((c) => c.done).length}/{w.checklist.length} checklist
                </span>
                <span className="tnum">due {dateShort(w.due)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  )
}
