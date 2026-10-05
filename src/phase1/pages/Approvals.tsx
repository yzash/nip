import clsx from 'clsx'
import { ArrowRight, Check } from 'lucide-react'
import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { RoleCode } from '@/data/types'
import { Badge, Empty, Fresh, Id, Kpi } from '@/components/ui'
import { dateTime, idr, num } from '@/lib/format'
import { roleDef, useApp, usePolicy, useRole } from '@/store/app'
import { clustersFrom, type P1Plan } from '../model'
import { useP1Store } from '../store'
import { DecisionButtons } from './plans/Decide'
import { CapexChip, ClassTag, DECISION_SLA_H, FitBadge, StatusBadge, ageText, fitOf, hoursBetween, lastDecision, nowTs, planClass, smartCapexCheck } from './plans/shared'

export function ApprovalsPage() {
  const nav = useNavigate()
  const role = useRole()
  const policy = usePolicy()
  const plans = useP1Store((s) => s.plans)
  const moves = useP1Store((s) => s.classMoves)
  const incidents = useApp((s) => s.incidents)
  const byId = useMemo(() => new Map(clustersFrom(incidents).map((c) => [c.id, c])), [incidents])
  const now = nowTs()

  const pending = plans.filter((p) => p.status === 'pending_approval')
  const mine = pending.filter((p) => p.route.role === role.role_code)
  const others = pending.filter((p) => p.route.role !== role.role_code)
  const decided = plans
    .map((p) => ({ p, d: lastDecision(p) }))
    .filter((x): x is { p: P1Plan; d: NonNullable<ReturnType<typeof lastDecision>> } => x.d !== null)
    .sort((a, b) => b.d.ts.localeCompare(a.d.ts))
  const waitH = (p: P1Plan) => (p.submitted ? hoursBetween(p.submitted, now) : 0)
  const oldest = pending.reduce<P1Plan | null>((a, p) => (!a || waitH(p) > waitH(a) ? p : a), null)
  const decisionTimes = decided.map(({ p, d }) => (p.submitted ? hoursBetween(p.submitted, d.ts) : null)).filter((x): x is number => x !== null)
  const medianH = decisionTimes.length ? [...decisionTimes].sort((a, b) => a - b)[Math.floor(decisionTimes.length / 2)] : null
  const inSla = decided.filter(({ p, d }) => p.submitted && hoursBetween(p.submitted, d.ts) <= (DECISION_SLA_H[p.route.role] ?? 48)).length

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Step 4 · Approvals</div>
        <h1 className="mt-1 text-[22px] font-semibold leading-7">
          {mine.length ? `${mine.length} plan${mine.length > 1 ? 's' : ''} waiting on you · ${idr(mine.reduce((s, p) => s + p.draft.capex_total_idr, 0))}` : `Nothing waiting on ${role.title}`}
          <span className="text-muted"> · {pending.length} pending in total</span>
        </h1>
        <p className="mt-1.5 max-w-[920px] text-sm text-muted">The Approval Routing Agent names one approver per plan from the intervention class and IDR value under IOH’s delegation of authority. Approve, reject or defer; rejections and deferrals carry a reason code that goes back to Netra as a training signal.</p>

        <div className="mt-5 grid grid-cols-5 border border-line bg-panel">
          <Kpi className="border-r" label={`Waiting on ${role.role_code}`} fresh="live" tone={mine.length ? 'warn' : undefined} value={num(mine.length)} sub={role.user} />
          <Kpi className="border-r" label="All pending" fresh="live" value={num(pending.length)} sub={idr(pending.reduce((s, p) => s + p.draft.capex_total_idr, 0))} />
          <Kpi className="border-r" label="Oldest wait" fresh="live" tone={oldest && waitH(oldest) > (DECISION_SLA_H[oldest.route.role] ?? 48) ? 'bad' : undefined} value={oldest ? ageText(waitH(oldest)) : '—'} sub={oldest ? `${oldest.id} · SLA ${DECISION_SLA_H[oldest.route.role] ?? 48} h` : 'queue empty'} />
          <Kpi className="border-r" label="Median decision time" fresh="live" value={medianH === null ? '—' : ageText(medianH)} sub={`${decided.length} decisions in session`} />
          <Kpi label="Decided inside SLA" fresh="live" tone="ok" value={decided.length ? `${Math.round((inSla / decided.length) * 100)}%` : '—'} sub="EC7: named approver for 100%" />
        </div>

        <Queue title={`Waiting on you · ${role.title} · ${role.user}`} plans={mine} empty={`No plans routed to ${role.title}. ${others.length ? 'Plans routed to other approvers are below.' : ''}`} byId={byId} moves={moves} now={now} onOpen={(id) => nav(`/phase1/plans/${id}`)} highlight />
        {others.length > 0 && <Queue title="Pending with other approvers" plans={others} empty="" byId={byId} moves={moves} now={now} onOpen={(id) => nav(`/phase1/plans/${id}`)} />}

        <div className="mt-5 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-5">
          <section className="border border-line bg-panel">
            <header className="flex h-10 items-center justify-between border-b border-line px-4">
              <h3 className="text-sm font-semibold">Recent decisions</h3>
              <Fresh f="live" />
            </header>
            {decided.length === 0 ? (
              <Empty>No decisions yet.</Empty>
            ) : (
              <div className="divide-y divide-line/70">
                {decided.slice(0, 8).map(({ p, d }) => (
                  <Link key={p.id} to={`/phase1/plans/${p.id}`} className="flex items-start gap-3 px-4 py-2.5 hover:bg-panel2">
                    <span className={clsx('mt-1 h-2 w-2 shrink-0 rounded-full', d.kind === 'approved' ? 'bg-ok' : d.kind === 'rejected' ? 'bg-bad' : 'bg-prog')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Id>{p.id}</Id>
                        <span className="truncate text-sm font-medium">{p.name}</span>
                      </div>
                      <div className="tnum text-[11px] text-faint">
                        {d.auto ? 'Auto-approved by rule' : `${d.what} by ${d.who}`} · {dateTime(d.ts)} · {idr(p.draft.capex_total_idr)}
                      </div>
                      {d.reason && <div className="text-[11px] text-warn">Reason code: {d.reason}</div>}
                    </div>
                    <StatusBadge s={p.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="border border-line bg-panel">
            <header className="flex h-10 items-center justify-between border-b border-line px-4">
              <h3 className="text-sm font-semibold">Delegation of authority · in force</h3>
              <span className="text-[11px] text-faint">Policy v1 · placeholder</span>
            </header>
            <table className="w-full">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                  <th className="h-8 border-b border-line px-4 font-semibold">Class</th>
                  <th className="h-8 border-b border-line px-2 font-semibold">Approver</th>
                  <th className="h-8 border-b border-line px-2 font-semibold">Threshold</th>
                  <th className="h-8 border-b border-line px-4 text-right font-semibold">SLA</th>
                </tr>
              </thead>
              <tbody>
                {db().interventionClasses.map((c) => {
                  const r = c.approver_roles[0] as RoleCode
                  const thr =
                    c.id === 'noncapex_zero'
                      ? 'Auto, post-hoc review'
                      : c.id === 'noncapex_opex'
                        ? `Auto below IDR ${Math.round(policy.opex_auto_approve_below_idr / 1e6)}m`
                        : c.id === 'capex_minor'
                          ? `≤ IDR ${Math.round(policy.decision_threshold_idr / 1e6)}m Regional Manager; above → Head of Planning`
                          : c.id === 'capex_major'
                            ? `CFO co-sign above IDR ${(policy.cfo_cosign_above_idr / 1e9).toFixed(0)}bn`
                            : `Auto below ${num(policy.customer_auto_approve_below)} customers`
                  return (
                    <tr key={c.id} className="border-b border-line/60 align-top">
                      <td className="px-4 py-2">
                        <div className="text-[12.5px] font-medium">{c.label}</div>
                        <div className="max-w-[280px] text-[11px] leading-4 text-faint">{c.examples}</div>
                      </td>
                      <td className="px-2 py-2">
                        <div className="text-[12.5px]">{c.approver}</div>
                        <div className="text-[11px] text-faint">{roleDef(r)?.user ?? '—'}</div>
                      </td>
                      <td className="px-2 py-2 text-[11.5px] leading-4 text-muted">{thr}</td>
                      <td className="tnum whitespace-nowrap px-4 py-2 text-right text-[12px] text-muted">{c.id === 'customer_action' ? '—' : `${DECISION_SLA_H[c.id === 'capex_major' ? 'EXEC' : c.id === 'capex_minor' ? 'PLAN' : 'REGION']} h`}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="px-4 py-2 text-[11px] leading-4 text-faint">Thresholds are the PRD placeholders, editable and versioned, pending IOH’s DoA matrix (open question for Network PMO). Customer action is outside Phase 1.</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function Queue({ title, plans, empty, byId, moves, now, onOpen, highlight }: { title: string; plans: P1Plan[]; empty: string; byId: Map<string, ReturnType<typeof clustersFrom>[number]>; moves: Record<string, { to: 'capex' | 'noncapex' }>; now: string; onOpen: (id: string) => void; highlight?: boolean }) {
  return (
    <section className={clsx('mt-5 border bg-panel', highlight && plans.length ? 'border-ioh-yellow/50' : 'border-line')}>
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">
          {title} <span className="tnum font-normal text-faint">· {plans.length}</span>
        </h3>
        <Fresh f="live" />
      </header>
      {plans.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        <div className="divide-y divide-line/70">
          {plans.map((p) => {
            const cls = planClass(p, byId)
            const sla = DECISION_SLA_H[p.route.role] ?? 48
            const waited = p.submitted ? hoursBetween(p.submitted, now) : 0
            const sc = smartCapexCheck(p, cls, moves)
            const f = fitOf(p.draft)
            const r = roleDef(p.route.role as RoleCode)
            return (
              <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_120px_236px_170px_auto] items-center gap-4 px-4 py-3">
                <button onClick={() => onOpen(p.id)} className="min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <Id className="shrink-0 whitespace-nowrap text-ink">{p.id}</Id>
                    <span className="truncate text-sm font-semibold hover:text-ioh-yellow">{p.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-x-2 overflow-hidden whitespace-nowrap text-[11.5px] text-muted">
                    <ClassTag cls={cls} />
                    <span className="text-faint">·</span>
                    <span className="tnum">{p.draft.site_ids.length} sites</span>
                    <span className="text-faint">·</span>
                    <span>{p.draft.intervention_label}</span>
                    <CapexChip cls={p.draft.capex_class} />
                  </div>
                </button>
                <div className="min-w-0">
                  <div className="tnum text-[15px] font-semibold text-ioh-yellow">{idr(p.draft.capex_total_idr)}</div>
                  <div className="tnum text-[11px] text-faint">PO draft {idr(p.draft.po_hardware_idr + p.draft.po_services_idr)}</div>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1">
                    <FitBadge d={p.draft} />
                    <Badge tone={sc.agree ? 'ok' : 'warn'}>{sc.agree ? 'Smart CapEx agrees' : 'Smart CapEx differs'}</Badge>
                  </div>
                  <div className="tnum mt-1 truncate text-[11px] text-faint">
                    RFS D+{p.draft.rfs_days} vs breach {p.draft.window_days === null ? '—' : `D+${p.draft.window_days}`}
                    {f.kind === 'bridge' && ` · bridge ${f.gap} d`}
                    {!sc.agree && ` · Smart CapEx says ${sc.smart === 'capex' ? 'CapEx' : 'non-CapEx'}`}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted">{r.user}</span>
                    <span className={clsx('tnum', waited > sla ? 'text-bad' : 'text-faint')}>
                      {ageText(waited)} / {sla} h
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 bg-line">
                    <div className={clsx('h-full', waited > sla ? 'bg-bad' : waited > sla * 0.75 ? 'bg-warn' : 'bg-ok')} style={{ width: `${Math.max(3, Math.min(100, (waited / sla) * 100))}%` }} />
                  </div>
                  <div className="mt-0.5 truncate text-[10.5px] text-faint">
                    {p.route.label}
                    {p.route.cosign ? ` + ${p.route.cosign}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <DecisionButtons p={p} size="sm" compact />
                  <button onClick={() => onOpen(p.id)} className="flex h-7 w-7 items-center justify-center border border-line2 text-muted hover:text-ink" title="Open plan">
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
      {highlight && plans.length > 0 && (
        <div className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-[11px] text-faint">
          <Check size={12} /> Approval releases the hand-off: Procurement sends the PO draft to ERP and the reservation to WMS; Deployment sends the BOQ, vendor proposal and tower company request.
        </div>
      )}
    </section>
  )
}
