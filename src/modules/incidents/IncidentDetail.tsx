import clsx from 'clsx'
import { ArrowRight, CheckCircle2, CircleDot, ClipboardList, FolderPlus, MessageSquare, ShieldAlert, ShieldX, Sparkles, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { ActionOption, Incident, RoleCode, WorkOrder } from '@/data/types'
import { Badge, Button, Dot, Fresh, Id, Label, Progress, ReasonModal } from '@/components/ui'
import { statusOf } from '@/lib/colors'
import { CLASS_LABEL, INTERVENTION_LABEL, SEGMENT_LABEL, STATUS_LABEL, addDays, ago, countdown, date, dateTime, idr, num, type TZ } from '@/lib/format'
import { crossingWeek, lastDay, siteHealth } from '@/lib/metrics'
import { buildPlan, interventionFromOption } from '@/lib/plan'
import { REASON_CODES, canApprove, routeOption } from '@/lib/policy'
import { allInsights, nextProgramId, nowIso, roleDef, todayIso, useApp, usePolicy, useRole, useScope } from '@/store/app'
import { MiniMap } from './MiniMap'
import { execNarrative, fieldChecklist } from './narrative'

const LOOP = ['Recommend', 'Review', 'Approve / reject / defer', 'Execute', 'Verify', 'Close']
function loopIndex(s: Incident['status']): number {
  switch (s) {
    case 'Detected':
      return 0
    case 'Enriched':
      return 1
    case 'Pending_approval':
    case 'Deferred':
      return 2
    case 'Approved':
    case 'In_program':
      return 3
    case 'RFS':
    case 'Validating':
      return 4
    case 'Rejected':
      return 5
    case 'Closed':
      return 6
  }
}

const WO_TYPE: Record<string, WorkOrder['type']> = {
  transport: 'Transport reroute',
  power: 'Battery swap',
  environmental: 'Preventive maintenance',
  capacity: 'Site survey',
}

export function IncidentDetail({ inc }: { inc: Incident }) {
  const D = db()
  const nav = useNavigate()
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const approvals = useApp((s) => s.approvals)
  const sessionInsights = useApp((s) => s.sessionInsights)
  const programs = useApp((s) => s.programs)
  const reservations = useApp((s) => s.reservations)
  const comments = useApp((s) => s.comments[inc.incident_id]) ?? []
  const opts = useMemo(() => D.optionsByIncident.get(inc.incident_id) ?? [], [D, inc.incident_id])
  const rec = opts.find((o) => o.rank === inc.recommended_rank)
  const [sel, setSel] = useState<number>(inc.chosen_rank ?? inc.recommended_rank)
  const [modal, setModal] = useState<null | 'reject' | 'defer' | 'fp'>(null)
  const [comment, setComment] = useState('')
  const chosen = opts.find((o) => o.rank === sel) ?? rec
  const route = chosen ? routeOption(chosen, inc, policy) : null
  const tz = (D.provById[inc.province_id]?.tz ?? 'WIB') as TZ
  const windowDays = inc.days_to_breach ?? (inc.predicted_week > 0 ? inc.predicted_week * 7 : null)
  const sla = countdown(inc.sla_due, nowIso())
  const ownerH = inc.owner_assigned_at ? (new Date(inc.owner_assigned_at).getTime() - new Date(inc.detected_at).getTime()) / 3600e3 : null
  const customerMode = inc.class === 'cnx' || inc.class === 'complaints'
  const cxPending = !!inc.pending_customer_action
  const decidable = inc.status === 'Pending_approval' || inc.status === 'Enriched' || inc.status === 'Detected' || inc.status === 'Deferred' || cxPending
  const allowed = route ? (route.auto ? route.roles.includes(role.role_code) || role.role_code === 'EXEC' : canApprove(role, route, inc, scope)) : false
  const approverRole: RoleCode | undefined = allowed ? role.role_code : route?.roles[0]
  const approverName = approverRole ? `${roleDef(approverRole).user}${allowed ? ` (${roleDef(approverRole).title})` : ''}` : ''
  const alreadyPlanned = programs.some((p) => p.source_incident === inc.incident_id)
  const dispatched = inc.flags.includes('dispatched')

  const timeline = useMemo(() => {
    const ins = allInsights(sessionInsights).filter((x) => x.incident_id === inc.incident_id || inc.insight_ids.includes(x.insight_id))
    const ap = approvals.filter((a) => a.incident_id === inc.incident_id)
    return [
      ...ins.map((x) => ({ ts: x.timestamp, kind: 'agent' as const, who: x.agent, text: x.message, meta: `${x.what_changed} · confidence ${Math.round(x.confidence * 100)}%` })),
      ...ap.map((a) => ({ ts: a.timestamp, kind: 'human' as const, who: `${a.actor}${a.role !== 'system' ? ` (${a.role})` : ''}`, text: `${a.step}: ${a.decision}`, meta: a.reason_code ?? '' })),
    ].sort((a, b) => b.ts.localeCompare(a.ts))
  }, [sessionInsights, approvals, inc])

  const cohorts = useMemo(() => {
    const m = new Map<string, { subs: number; churn: number; cnxd: number; w: number }>()
    for (const sid of inc.site_ids)
      for (const c of D.cohortsBySite.get(sid) ?? []) {
        const r = m.get(c.segment) ?? { subs: 0, churn: 0, cnxd: 0, w: 0 }
        r.subs += c.subs
        r.churn += c.churn_risk_subs
        r.cnxd += c.cnx_delta_28d * c.subs
        r.w += c.subs
        m.set(c.segment, r)
      }
    return [...m.entries()]
  }, [inc, D])

  const siteStatus = (sid: string) => {
    const i = D.siteIdx.get(sid)!
    return crossingWeek(i, policy.red_min_probability) > 0 ? 2 : statusOf(siteHealth(i, lastDay()), policy.colour_thresholds.health)
  }

  const approve = () => {
    if (!chosen || !route) return
    const app = useApp.getState()
    if (cxPending && chosen.class === 'customer_action') {
      useApp.setState({
        incidents: app.incidents.map((x) => (x.incident_id === inc.incident_id ? { ...x, pending_customer_action: false, flags: [...x.flags, 'outreach_approved'] } : x)),
        approvals: [...app.approvals, { incident_id: inc.incident_id, step: 'Approve', role: role.role_code, actor: role.user, decision: `approved customer action: ${chosen.name}`, reason_code: null, timestamp: nowIso() }],
      })
      app.logAudit({ action: 'Customer action approved', object: inc.incident_id, detail: `${chosen.name} · ${num(inc.churn_risk_subs)} subscribers` })
      app.toast(`Customer Outreach Agent scheduled: ${chosen.name.toLowerCase()} to ${num(inc.churn_risk_subs)} subscribers${inc.program_match.eta ? `, citing RFS ${date(inc.program_match.eta)}` : ''}`)
      return
    }
    app.decideIncident(inc.incident_id, 'approve', { rank: chosen.rank, auto: route.auto })
    if (chosen.class === 'noncapex_opex' || chosen.class === 'noncapex_zero') {
      dispatchFor(inc, chosen)
      app.toast(`${route.auto ? 'Auto-approved' : 'Approved'}: ${chosen.name}. Work order dispatched.`)
    } else app.toast(`Approved by ${role.title}: ${chosen.name}. Build the plan next.`)
  }

  const buildAndOpenPlan = () => {
    if (!chosen) return
    const app = useApp.getState()
    const plan = buildPlan({
      siteIds: inc.site_ids,
      intervention: interventionFromOption(chosen.name),
      sourceIncident: inc.incident_id,
      programs,
      reservations,
      windowDays,
      today: todayIso(),
      nextProgramId: nextProgramId(programs),
    })
    app.setPlan(plan)
    nav('/planner?tab=builder')
  }

  return (
    <div className="pb-8">
      {/* header */}
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Id className="text-ioh-yellow">{inc.incident_id}</Id>
          <Badge tone="neutral">{CLASS_LABEL[inc.class]}</Badge>
          <Badge tone={inc.source === 'prediction' ? 'yellow' : inc.source === 'cx' ? 'blue' : 'neutral'}>{inc.source === 'prediction' ? 'Predicted' : inc.source === 'cx' ? 'CX signal' : 'Alarm'}</Badge>
          <Badge tone={inc.status === 'Pending_approval' ? 'warn' : inc.status === 'Closed' || inc.status === 'Rejected' ? 'neutral' : inc.status === 'In_program' ? 'prog' : 'ok'}>{STATUS_LABEL[inc.status]}</Badge>
          {inc.flags.includes('escalate_candidate') && <Badge tone="bad">Escalation candidate</Badge>}
          {inc.flags.includes('false_positive_candidate') && <Badge tone="neutral">Likely false positive</Badge>}
          <Fresh f={inc.freshness} asOf={inc.as_of} />
        </div>
        <div className="mt-1 text-[15px] font-semibold leading-5">{inc.title}</div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <Mini k="Exposure" v={`${idr(inc.exposure_idr)}/mo`} tone="yellow" />
          <Mini k="Probability" v={`${Math.round(inc.probability * 100)}%`} sub={inc.predicted_week > 0 ? `by W+${inc.predicted_week} · ${date(D.weekEndDates[inc.predicted_week - 1])}` : 'now'} />
          <Mini k="Priority score" v={inc.priority_score.toFixed(1)} sub="exposure × p × urgency" />
          <Mini k={inc.status === 'Pending_approval' ? 'Decision SLA' : 'SLA'} v={['Pending_approval', 'Enriched', 'Detected'].includes(inc.status) ? sla.text : '—'} tone={sla.overdue && ['Pending_approval', 'Enriched', 'Detected'].includes(inc.status) ? 'bad' : undefined} />
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted">
          <span>
            Detected {dateTime(inc.detected_at, tz)} ({ago(inc.detected_at, nowIso())})
          </span>
          <span>
            Owner <span className="font-semibold text-ink">{roleDef(inc.owner_role).title}</span>
            {ownerH !== null && <span className={ownerH <= policy.owner_assignment_sla_hours ? 'text-ok' : 'text-bad'}> · assigned in {ownerH.toFixed(1)} h (target {policy.owner_assignment_sla_hours} h)</span>}
          </span>
          <span>Functions {inc.functions.join(', ')}</span>
        </div>
      </div>

      {/* narrative */}
      <div className="border-b border-line bg-panel2/40 px-4 py-3">
        <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
          <Sparkles size={12} className="text-ioh-yellow" /> Narrative Agent · {role.role_code === 'FIELD' ? 'field checklist' : 'summary for ' + role.title}
        </div>
        {role.role_code === 'FIELD' ? (
          <ol className="list-decimal space-y-0.5 pl-4 text-sm text-muted">
            {fieldChecklist(inc).map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] leading-5 text-ink">{execNarrative(inc, rec)}</p>
        )}
        {inc.escalation_note && <p className="mt-1.5 text-xs text-bad">{inc.escalation_note}</p>}
        {inc.fp_note && <p className="mt-1.5 text-xs text-muted">Agent note: {inc.fp_note}</p>}
      </div>

      {/* program check */}
      <Section title="Program check" right={<span className="text-[10.5px] text-faint">Program Match Agent · live</span>}>
        <div className="flex items-center gap-3">
          <Badge tone={inc.program_match.verdict === 'covered' ? 'ok' : inc.program_match.verdict === 'partial' ? 'warn' : 'bad'} className="h-6 px-2 text-xs">
            {inc.program_match.verdict === 'covered' ? 'Covered' : inc.program_match.verdict === 'partial' ? 'Partially covered' : 'Not covered'}
          </Badge>
          <div className="min-w-0 flex-1 text-sm">
            {inc.program_match.program_id ? (
              <>
                <button onClick={() => nav(`/programs/${inc.program_match.program_id}`)} className="font-mono text-[12px] text-ioh-yellow hover:underline">
                  {inc.program_match.program_id}
                </button>{' '}
                <span className="text-muted">{programs.find((p) => p.program_id === inc.program_match.program_id)?.name}</span>
                {inc.program_match.eta && <span className="tnum text-muted"> · ETA {date(inc.program_match.eta)}</span>}
                {inc.program_match.reason && <div className="text-xs text-warn">{inc.program_match.reason}</div>}
              </>
            ) : (
              <span className="text-muted">No active or planned program includes these sites.</span>
            )}
          </div>
          {inc.program_match.verdict === 'not_covered' && !alreadyPlanned && !customerMode && (
            <Button size="sm" variant="primary" onClick={buildAndOpenPlan}>
              <FolderPlus size={13} /> Create program
            </Button>
          )}
        </div>
      </Section>

      {/* action ladder */}
      <Section title={cxPending ? 'Customer action ladder · pending Head of CX' : 'Action ladder'} right={<span className="text-[10.5px] text-faint">Action Ladder Agent · cheapest first</span>}>
        {cxPending && <div className="mb-2 text-xs text-muted">Network fix is in {inc.program_id} (revised RFS {inc.program_match.eta ? date(inc.program_match.eta) : 'tbc'}). Protect the cohort before then:</div>}
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-faint">
              <th className="w-6 py-1" />
              <th className="py-1 font-semibold">Option</th>
              <th className="py-1 text-right font-semibold">Cost</th>
              <th className="py-1 text-right font-semibold">Lead</th>
              <th className="py-1 pl-3 font-semibold">Expected uplift</th>
              <th className="py-1 text-right font-semibold">Conf.</th>
              <th className="py-1 pl-3 font-semibold">Approver</th>
            </tr>
          </thead>
          <tbody>
            {(cxPending ? optionsForCx(inc) : opts).map((o) => {
              const r = routeOption(o, inc, policy)
              const fits = windowDays === null || o.lead_days <= windowDays
              const isRec = o.rank === inc.recommended_rank && !cxPending
              return (
                <tr key={o.rank} onClick={() => setSel(o.rank)} className={clsx('cursor-pointer border-t border-line/60', sel === o.rank ? 'bg-ioh-yellow/[0.07]' : 'hover:bg-panel2')}>
                  <td className="py-1.5">
                    <span className={clsx('flex h-3.5 w-3.5 items-center justify-center rounded-full border', sel === o.rank ? 'border-ioh-yellow' : 'border-line2')}>{sel === o.rank && <span className="h-1.5 w-1.5 rounded-full bg-ioh-yellow" />}</span>
                  </td>
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10.5px] text-faint">{o.rank}</span>
                      <span className="font-medium text-ink">{o.name}</span>
                      {isRec && <Badge tone="yellow">Recommended</Badge>}
                    </div>
                    <div className="text-[10.5px] text-faint">{INTERVENTION_LABEL[o.class]}</div>
                  </td>
                  <td className="tnum whitespace-nowrap py-1.5 text-right">
                    {o.cost_idr ? idr(o.cost_idr) : 'No cost'}
                    {o.cost_idr > 0 && inc.site_ids.length > 1 && ['capex_minor', 'capex_major', 'noncapex_opex'].includes(o.class) && <div className="whitespace-nowrap text-[10.5px] text-faint">{idr(o.cost_idr / inc.site_ids.length)}/site</div>}
                  </td>
                  <td className={clsx('tnum py-1.5 text-right', !fits && 'text-warn')}>
                    {o.lead_days < 14 ? `${o.lead_days} d` : `${Math.round(o.lead_days / 7)} wk`}
                    {!fits && <div className="text-[10.5px]">beyond window</div>}
                  </td>
                  <td className="py-1.5 pl-3 text-muted">{o.predicted_uplift}</td>
                  <td className="tnum py-1.5 text-right">{Math.round(o.confidence * 100)}%</td>
                  <td className="py-1.5 pl-3">
                    <div className="text-ink">{r.label}</div>
                    <div className={clsx('text-[10.5px]', r.auto ? 'text-ok' : 'text-faint')}>{r.auto ? r.autoNote : r.cosign ? `+ ${r.cosign} co-sign` : r.gate}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {!cxPending && inc.class === 'capacity' && windowDays !== null && rec && rec.lead_days > windowDays && (
          <div className="mt-2 border-l-2 border-ioh-yellow bg-ioh-yellow/[0.06] px-3 py-2 text-xs text-muted">
            <span className="font-semibold text-ink">Bridge:</span> saturation in {windowDays} days but {rec.name.toLowerCase()} takes {Math.round(rec.lead_days / 7)} weeks. Run rung 2 (refarm 2G/4G spectrum, zero CapEx, 7 days, auto-approved) now to buy ~3 weeks while the sector add is built.
          </div>
        )}
      </Section>

      {/* approval */}
      <Section title="Approval loop" right={<span className="text-[10.5px] text-faint">Approval Routing Agent · named approver</span>}>
        <Progress steps={LOOP} current={loopIndex(inc.status)} done={inc.status === 'Closed'} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {route && decidable && (
            <div className="mr-auto min-w-0 text-xs">
              <div className="text-faint">{route.auto ? 'Auto-approval rule' : 'Named approver'}</div>
              <div className="font-semibold">
                {route.auto ? route.autoNote : allowed ? `${approverName} · authority: ${route.label}${route.cosign ? ` + ${route.cosign} co-sign` : ''}` : `${approverName} · ${route.label}${route.cosign ? ` + ${route.cosign} co-sign` : ''}`}
              </div>
            </div>
          )}
          {!decidable && (
            <div className="mr-auto text-xs text-muted">
              {inc.status === 'Approved' && (dispatched ? 'Approved and dispatched. Verification follows the work-order evidence.' : alreadyPlanned ? 'Approved; plan submitted.' : 'Approved. Next: build the plan (BOQ, PO, vendor) or dispatch.')}
              {inc.status === 'In_program' && `Executing inside ${inc.program_id ?? inc.program_match.program_id}.`}
              {['RFS', 'Validating'].includes(inc.status) && 'RFS done; Post-RFS Validation Agent measuring 30/60/90-day uplift.'}
              {inc.status === 'Rejected' && 'Rejected. Reason code sent to the Override Learning Agent.'}
              {inc.status === 'Closed' && `Closed${inc.closed_reason ? ` · ${inc.closed_reason}` : ''}.`}
            </div>
          )}
          {decidable && route && allowed && (
            <>
              <Button variant="primary" onClick={approve}>
                <CheckCircle2 size={14} /> {route.auto ? 'Execute (auto-approved)' : chosen?.class === 'noncapex_opex' ? 'Approve and dispatch' : 'Approve'} rung {chosen?.rank}
              </Button>
              {!route.auto && !cxPending && (
                <>
                  <Button variant="danger" onClick={() => setModal('reject')}>
                    Reject
                  </Button>
                  <Button onClick={() => setModal('defer')}>Defer</Button>
                </>
              )}
            </>
          )}
          {decidable && route && !allowed && (
            <>
              <span className="text-xs text-muted">
                Requires <span className="font-semibold text-ink">{route.label}</span>. You are {role.title}: you can review and comment.
              </span>
              {approverRole && (
                <Button size="sm" onClick={() => useApp.getState().setRole(approverRole)} title="Prototype shortcut for the presenter">
                  <UserCheck size={13} /> Switch to {approverRole}
                </Button>
              )}
            </>
          )}
          {inc.status === 'Approved' && !alreadyPlanned && chosen && ['capex_minor', 'capex_major'].includes(chosen.class) && (
            <Button variant="primary" onClick={buildAndOpenPlan}>
              <ClipboardList size={14} /> Build plan · BOQ, PO, vendor <ArrowRight size={13} />
            </Button>
          )}
          {alreadyPlanned && (
            <Button onClick={() => nav(`/programs/${programs.find((p) => p.source_incident === inc.incident_id)!.program_id}`)}>
              Open program <ArrowRight size={13} />
            </Button>
          )}
        </div>
        {role.role_code === 'REGION' && inc.region === scope && (inc.flags.includes('escalate_candidate') || inc.flags.includes('false_positive_candidate')) && (
          <div className="mt-3 flex gap-2 border-t border-line pt-3">
            {inc.flags.includes('escalate_candidate') && (
              <Button
                onClick={() => {
                  useApp.getState().escalateIncident(inc.incident_id)
                  useApp.getState().toast('Escalated to Head of Planning as a CapEx decision')
                }}
              >
                <ShieldAlert size={14} /> Escalate to CapEx
              </Button>
            )}
            {inc.flags.includes('false_positive_candidate') && (
              <Button onClick={() => setModal('fp')}>
                <ShieldX size={14} /> Close as false positive
              </Button>
            )}
          </div>
        )}
      </Section>

      {/* affected sites */}
      <Section title={`Affected sites · ${inc.site_ids.length}`} right={<Fresh f="D-1" />}>
        <MiniMap siteIds={inc.site_ids} status={siteStatus} linkId={inc.link_id} onSite={(id) => nav(`/map?site=${id}`)} />
        <div className="mt-2 grid grid-cols-2 gap-1">
          {inc.site_ids.slice(0, 16).map((sid) => {
            const i = D.siteIdx.get(sid)!
            const s = D.sites[i]
            const cw = crossingWeek(i, policy.red_min_probability)
            return (
              <button key={sid} onClick={() => nav(`/map?site=${sid}`)} className="flex items-center gap-2 border border-line px-2 py-1 text-left text-xs hover:border-line2">
                <Dot status={siteStatus(sid)} />
                <span className="font-mono text-[11px] text-muted">{sid}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {cw > 0 && <span className="text-2xs text-bad">W+{cw}</span>}
              </button>
            )
          })}
        </div>
      </Section>

      {/* cohorts */}
      <Section title="Affected customer cohorts" right={<span className="text-[10.5px] text-faint">CNX · CX · Churn Exposure agents</span>}>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-faint">
              <th className="py-1 font-semibold">Segment</th>
              <th className="py-1 text-right font-semibold">Subscribers</th>
              <th className="py-1 text-right font-semibold">Churn-risk</th>
              <th className="py-1 text-right font-semibold">CNX Δ 28 d</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map(([seg, r]) => (
              <tr key={seg} className="border-t border-line/60">
                <td className="py-1">{SEGMENT_LABEL[seg]}</td>
                <td className="tnum py-1 text-right">{num(r.subs)}</td>
                <td className="tnum py-1 text-right">{num(r.churn)}</td>
                <td className={clsx('tnum py-1 text-right', r.cnxd / r.w <= -2 ? 'text-bad' : 'text-muted')}>{(r.cnxd / r.w).toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* timeline */}
      <Section title="Evidence timeline" right={<span className="text-[10.5px] text-faint">{timeline.length} events</span>}>
        <div className="space-y-2.5">
          {timeline.map((e, k) => (
            <div key={k} className="flex gap-2.5">
              <div className="pt-0.5">{e.kind === 'agent' ? <CircleDot size={13} className="text-ioh-yellow" /> : <UserCheck size={13} className="text-ok" />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold">{e.who}</span>
                  <span className="tnum text-faint">{dateTime(e.ts, tz)}</span>
                </div>
                <div className="text-xs leading-4 text-muted">{e.text}</div>
                {e.meta && <div className="text-[10.5px] text-faint">{e.meta}</div>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* comments */}
      <Section title="Comments" right={<MessageSquare size={13} className="text-faint" />}>
        {comments.map((c, k) => (
          <div key={k} className="mb-2 text-xs">
            <span className="font-semibold">{c.actor}</span> <span className="text-faint">({c.role}) · {dateTime(c.ts, tz)}</span>
            <div className="text-muted">{c.text}</div>
          </div>
        ))}
        <div className="flex gap-2">
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment for the incident owner" className="h-8 flex-1 border border-line2 bg-panel2 px-2 text-sm placeholder:text-faint" />
          <Button
            size="md"
            disabled={!comment.trim()}
            onClick={() => {
              useApp.getState().addComment(inc.incident_id, comment.trim())
              setComment('')
            }}
          >
            Post
          </Button>
        </div>
      </Section>

      <ReasonModal
        open={modal === 'reject'}
        onClose={() => setModal(null)}
        title={`Reject ${chosen?.name ?? ''}`}
        onSubmit={(r) => {
          useApp.getState().decideIncident(inc.incident_id, 'reject', { rank: chosen?.rank, reason: r })
          useApp.getState().toast('Rejected; reason fed back to Netra as a training signal', 'info')
        }}
        codes={REASON_CODES}
      />
      <ReasonModal
        open={modal === 'defer'}
        onClose={() => setModal(null)}
        title="Defer decision"
        onSubmit={(r) => {
          useApp.getState().decideIncident(inc.incident_id, 'defer', { rank: chosen?.rank, reason: r })
          useApp.getState().toast('Deferred; incident returns to Enriched for re-evaluation', 'info')
        }}
        codes={['Awaiting tower company feasibility', 'Awaiting budget envelope', 'More evidence needed', 'Re-evaluate after next batch', ...REASON_CODES.slice(0, 2)]}
      />
      <ReasonModal
        open={modal === 'fp'}
        onClose={() => setModal(null)}
        title="Close as false positive"
        confirmLabel="Close incident"
        codes={['Event ended (festival, holiday)', 'Known sensor fault', 'BMKG outlook revised', 'Already mitigated locally', 'Duplicate signal']}
        onSubmit={(r) => {
          useApp.getState().closeFalsePositive(inc.incident_id, r)
          useApp.getState().toast('Closed as false positive; labelled for the Override Learning Agent', 'info')
        }}
      />
    </div>
  )
}

function optionsForCx(inc: Incident): ActionOption[] {
  const subs = inc.churn_risk_subs
  return [
    { incident_id: inc.incident_id, rank: 1, name: 'Proactive SMS with RFS date', class: 'customer_action', cost_idr: 150 * subs, lead_days: 1, predicted_uplift: 'Churn intent −8%', confidence: 0.62 },
    { incident_id: inc.incident_id, rank: 2, name: 'Service credit (5 GB data)', class: 'customer_action', cost_idr: 15_000 * subs, lead_days: 2, predicted_uplift: 'Churn −18%', confidence: 0.7 },
    { incident_id: inc.incident_id, rank: 3, name: 'Retention offer to high-ARPU postpaid', class: 'customer_action', cost_idr: 50_000 * subs, lead_days: 3, predicted_uplift: 'Churn −30%', confidence: 0.66 },
  ]
}

function dispatchFor(inc: Incident, o: ActionOption) {
  const D = db()
  const st = useApp.getState()
  const sid = inc.site_ids[0]
  const s = D.sites[D.siteIdx.get(sid)!]
  const eng = D.engineers.find((e) => e.region === s.region && e.engineer_id !== roleDef('FIELD').engineer_id) ?? D.engineers[0]
  const maxWo = Math.max(...st.workOrders.map((w) => Number(w.wo_id.slice(3))))
  const type = o.name.toLowerCase().includes('reroute') ? 'Transport reroute' : WO_TYPE[inc.class] ?? 'Fault repair'
  const wo: WorkOrder = {
    wo_id: `WO-${maxWo + 1}`,
    site_id: sid,
    program_id: null,
    incident_id: inc.incident_id,
    engineer_id: eng.engineer_id,
    type,
    status: 'open',
    priority: 'high',
    created: todayIso(),
    due: addDays(todayIso(), Math.max(1, Math.min(3, o.lead_days))),
    evidence: [],
    checklist: fieldChecklist(inc).map((step) => ({ step, done: false })),
    parts: [],
  }
  useApp.setState({
    workOrders: [wo, ...st.workOrders],
    incidents: st.incidents.map((x) => (x.incident_id === inc.incident_id ? { ...x, flags: [...x.flags, 'dispatched'] } : x)),
  })
  st.logAudit({ action: 'Dispatched', object: inc.incident_id, detail: `${wo.wo_id} ${type} → ${eng.name}` })
}

function Section({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <Label>{title}</Label>
        {right}
      </div>
      {children}
    </div>
  )
}

function Mini({ k, v, sub, tone }: { k: string; v: string; sub?: string; tone?: 'yellow' | 'bad' }) {
  return (
    <div className="border border-line px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-faint">{k}</div>
      <div className={clsx('tnum text-sm font-semibold', tone === 'yellow' && 'text-ioh-yellow', tone === 'bad' && 'text-bad')}>{v}</div>
      {sub && <div className="truncate text-[10px] text-faint">{sub}</div>}
    </div>
  )
}
