import clsx from 'clsx'
import { ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import { addDays, idr, num, time } from '@/lib/format'
import { PIPELINE_STAGES, crossingWeek, isOpen, lastDay, siteHealth } from '@/lib/metrics'
import { todayIso, useApp, usePolicy, useRole, useScope } from '@/store/app'

interface Brief {
  lines: { v: string; l: string; tone?: 'bad' | 'warn' | 'yellow' | 'ok' }[]
  decision: string
  cta: string
  to: string
  done?: boolean
}

// "Monday morning by role" (PRD §4): what each role sees first and the one decision NICC asks for.
export function RoleBrief() {
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const incidents = useApp((s) => s.incidents)
  const programs = useApp((s) => s.programs)
  const pos = useApp((s) => s.pos)
  const workOrders = useApp((s) => s.workOrders)
  const reservations = useApp((s) => s.reservations)
  const [open, setOpen] = useState(true)
  const nav = useNavigate()
  const D = db()

  const b: Brief = useMemo(() => {
    const thr = policy.red_min_probability
    const active = (p: (typeof programs)[number]) => p.stage !== 'Validation' && !p.complete
    switch (role.role_code) {
      case 'EXEC': {
        const atRisk = incidents.filter(isOpen).reduce((s, x) => s + x.exposure_idr, 0)
        const pred = D.forecast.filter((f) => f.failure_prob[7] >= thr).length
        const off = programs.filter((p) => p.gap_flags.length && active(p)).length
        const pending = programs.filter((p) => p.pending_approval?.role === 'EXEC').length
        return {
          lines: [
            { v: idr((atRisk * 7) / 30), l: 'revenue at risk this week', tone: 'yellow' },
            { v: num(pred), l: 'sites predicted to fail inside 8 weeks', tone: 'bad' },
            { v: num(off), l: 'programs off track (failure before RFS)', tone: 'warn' },
          ],
          decision: pending ? `Approve or defer ${pending === 2 ? 'two' : pending} CapEx program${pending > 1 ? 's' : ''} above threshold` : 'CapEx approvals cleared for today',
          cta: 'Review programs',
          to: '/programs?tab=portfolio',
          done: pending === 0,
        }
      }
      case 'PLAN': {
        const cap = D.forecast.map((f, i) => ({ f, i })).filter(({ f, i }) => f.failure_class === 'capacity' && crossingWeek(i, thr) > 0)
        const covered = cap.filter(({ i }) => programs.some((p) => active(p) && p.site_ids.includes(D.sites[i].site_id))).length
        const not = cap.length - covered
        return {
          lines: [
            { v: num(cap.length), l: 'sites predicted to saturate inside 8 weeks', tone: 'bad' },
            { v: num(covered), l: 'already covered by a program', tone: 'ok' },
            { v: num(not), l: 'not covered', tone: not ? 'warn' : 'ok' },
          ],
          decision: not ? `Approve the plan for the ${not} uncovered sites` : 'All predicted capacity sites are covered',
          cta: 'Open forecast board',
          to: '/planner?tab=board&class=capacity&cov=not',
          done: not === 0,
        }
      }
      case 'DEPLOY': {
        const pipe = programs.filter((p) => PIPELINE_STAGES.has(p.stage))
        const sla = pipe.filter((p) => p.vendor_sla_risk).length
        const tc = pipe.filter((p) => p.tower_company_clock?.status === 'overdue').length
        return {
          lines: [
            { v: num(pipe.length), l: 'programs in the pipeline' },
            { v: num(sla), l: 'at risk on vendor SLA', tone: sla ? 'warn' : 'ok' },
            { v: num(tc), l: 'waiting on tower company access', tone: tc ? 'warn' : 'ok' },
          ],
          decision: sla ? `Reallocate vendor capacity on the ${sla} at-risk program${sla > 1 ? 's' : ''}` : 'Vendor capacity balanced',
          cta: 'Open vendor lane',
          to: '/programs?tab=vendors',
          done: sla === 0,
        }
      }
      case 'OPS': {
        const top = [...incidents].filter(isOpen).sort((a, b) => b.exposure_idr - a.exposure_idr)[0]
        const link = top?.link_id ? D.links.find((l) => l.link_id === top.link_id) : null
        const decided = top?.status !== 'Pending_approval'
        return {
          lines: [
            { v: link ? `${link.util_pct.toFixed(0)}%` : idr(top?.exposure_idr ?? 0), l: link ? `${link.name} · ${link.dependent_sites} dependent sites` : top?.title ?? '', tone: 'bad' },
            { v: idr(top?.exposure_idr ?? 0), l: 'exposure per month, top of the queue', tone: 'yellow' },
            { v: num(incidents.filter((x) => isOpen(x) && x.functions.includes('Operations')).length), l: 'open Operations incidents' },
          ],
          decision: decided ? 'Transport reroute approved and dispatched' : 'Approve the transport reroute and dispatch',
          cta: 'Open incident',
          to: `/incidents?incident=${top?.incident_id ?? ''}`,
          done: decided,
        }
      }
      case 'CX': {
        const sby = incidents.find((x) => x.story === 'surabaya_cnx')!
        return {
          lines: [
            { v: `${sby.cnx_delta?.toFixed(1)} pts`, l: 'postpaid 5G CNX in Surabaya (28 d)', tone: 'bad' },
            { v: num(sby.churn_risk_subs), l: 'subscribers in the churn-risk cohort', tone: 'warn' },
            { v: sby.program_match.eta ? sby.program_match.eta.slice(5).split('-').reverse().join('/') : '—', l: `revised RFS of ${sby.program_id}`, tone: 'yellow' },
          ],
          decision: sby.pending_customer_action ? 'Approve proactive outreach to the cohort ahead of RFS' : 'Outreach approved',
          cta: 'Open CX incident',
          to: `/incidents?incident=${sby.incident_id}`,
          done: !sby.pending_customer_action,
        }
      }
      case 'REGION': {
        const reg = incidents.filter((x) => x.region === scope && isOpen(x))
        const overdue = workOrders.filter((w) => w.status === 'overdue' && D.sites[D.siteIdx.get(w.site_id)!].region === scope).length
        const esc = reg.filter((x) => x.flags.includes('escalate_candidate')).length
        const fp = reg.filter((x) => x.flags.includes('false_positive_candidate')).length
        let hs = 0
        let n = 0
        D.sites.forEach((s, i) => {
          if (s.region === scope) {
            hs += siteHealth(i, lastDay())
            n++
          }
        })
        return {
          lines: [
            { v: (hs / Math.max(1, n)).toFixed(0), l: `mean site health · ${num(n)} sites` },
            { v: num(reg.length), l: 'open incidents in region', tone: 'warn' },
            { v: num(overdue), l: 'work orders overdue', tone: overdue ? 'bad' : 'ok' },
          ],
          decision: esc || fp ? `Escalate ${esc} incident${esc === 1 ? '' : 's'} to CapEx, close ${fp} as false positive${fp === 1 ? '' : 's'}` : 'Regional queue triaged',
          cta: 'Open regional queue',
          to: '/incidents',
          done: !esc && !fp,
        }
      }
      case 'FIELD': {
        const end = addDays(todayIso(), 6)
        const mine = workOrders.filter((w) => w.engineer_id === role.engineer_id && ['open', 'in_progress', 'overdue'].includes(w.status) && w.due <= end)
        const ready = mine.filter((w) => w.parts.every((p) => /ready|delivered/i.test(p.status))).length
        return {
          lines: [
            { v: num(mine.length), l: `work orders this week · ${scope}` },
            { v: num(ready), l: 'with parts ready', tone: 'ok' },
            { v: num(mine.filter((w) => w.priority === 'high').length), l: 'high priority', tone: 'warn' },
          ],
          decision: `Complete and evidence ${mine.length} work orders`,
          cta: 'Open my week',
          to: '/field',
          done: mine.length === 0,
        }
      }
      case 'PROC': {
        const low = D.stock.filter((w) => w.warehouse_id === 'WH-SMG' && w.on_hand - w.reserved - reservations.filter((r) => r.warehouse_id === w.warehouse_id && r.sku === w.sku).reduce((s, r) => s + r.qty, 0) < w.reorder_point).length
        const pend = pos.filter((p) => p.status === 'pending_release').length
        return {
          lines: [
            { v: '8 wks', l: 'BOQ demand forecast by SKU' },
            { v: num(low), l: 'SKUs below reorder point in Semarang', tone: 'warn' },
            { v: num(pend), l: 'POs pending release', tone: pend ? 'yellow' : 'ok' },
          ],
          decision: pend ? `Release ${pend} PO${pend > 1 ? 's' : ''} and approve pre-positioning` : 'POs released; review pre-positioning',
          cta: 'Open readiness',
          to: '/planner?tab=readiness',
          done: pend === 0,
        }
      }
    }
  }, [role, scope, policy, incidents, programs, pos, workOrders, reservations, D])

  return (
    <div className="absolute bottom-[92px] left-[252px] z-20 w-[380px] border border-line bg-panel/95">
      <button onClick={() => setOpen(!open)} className="flex h-9 w-full items-center gap-2 border-b border-line px-3 text-left">
        <span className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Monday brief · {time(D.meta.now)}</span>
        <span className="truncate text-2xs text-faint">{role.title}</span>
        <span className="ml-auto text-faint">{open ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
      </button>
      {open && (
        <>
          <div className="space-y-1.5 px-3 py-2.5">
            {b.lines.map((l) => (
              <div key={l.l} className="flex items-baseline gap-2.5">
                <span className={clsx('tnum w-[76px] shrink-0 text-right text-base font-semibold', l.tone === 'bad' ? 'text-bad' : l.tone === 'warn' ? 'text-warn' : l.tone === 'yellow' ? 'text-ioh-yellow' : l.tone === 'ok' ? 'text-ok' : 'text-ink')}>{l.v}</span>
                <span className="text-xs leading-4 text-muted">{l.l}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-line px-3 py-2.5">
            <div className="text-2xs font-semibold uppercase tracking-wider text-faint">The decision NICC asks for today</div>
            <div className={clsx('mt-0.5 text-sm font-semibold', b.done && 'text-ok')}>{b.decision}</div>
            <button onClick={() => nav(b.to)} className="mt-2 flex h-8 w-full items-center justify-center gap-1.5 bg-ioh-yellow text-xs font-semibold text-canvas hover:bg-[#ffe04d]">
              {b.cta} <ArrowRight size={13} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
