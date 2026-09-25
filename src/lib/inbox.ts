import { db } from '@/data/db'
import type { Incident, Program, PurchaseOrder, Role, WorkOrder, Policy } from '@/data/types'
import { canApprove, routeOption } from './policy'
import { addDays } from './format'

export interface InboxItem {
  id: string
  kind: 'incident' | 'program' | 'po' | 'wo' | 'vendor' | 'flag' | 'cx'
  title: string
  sub: string
  to: string
}

// "The decision NICC asks for": items waiting on the current role (PRD §4).
export function inboxFor(
  role: Role,
  scope: string,
  st: { incidents: Incident[]; programs: Program[]; pos: PurchaseOrder[]; workOrders: WorkOrder[]; policy: Policy },
  today: string,
): InboxItem[] {
  const out: InboxItem[] = []
  const opts = db().optionsByIncident
  for (const inc of st.incidents) {
    if (inc.status === 'Pending_approval') {
      const rec = opts.get(inc.incident_id)?.find((o) => o.rank === inc.recommended_rank)
      if (!rec) continue
      const route = routeOption(rec, inc, st.policy)
      if (!route.auto && canApprove(role, route, inc, scope))
        out.push({ id: inc.incident_id, kind: 'incident', title: inc.title, sub: `${rec.name} · awaiting ${route.label}`, to: `/incidents?incident=${inc.incident_id}` })
    }
    if (role.role_code === 'CX' && inc.pending_customer_action && inc.status !== 'Closed')
      out.push({ id: `${inc.incident_id}-cx`, kind: 'cx', title: 'Proactive outreach ahead of RFS', sub: `${inc.churn_risk_subs.toLocaleString()} churn-risk subscribers · ${inc.title}`, to: `/incidents?incident=${inc.incident_id}` })
    if (role.role_code === 'REGION' && inc.region === scope) {
      if (inc.flags.includes('escalate_candidate'))
        out.push({ id: `${inc.incident_id}-esc`, kind: 'flag', title: 'Escalate to CapEx?', sub: inc.title, to: `/incidents?incident=${inc.incident_id}` })
      if (inc.flags.includes('false_positive_candidate'))
        out.push({ id: `${inc.incident_id}-fp`, kind: 'flag', title: 'Close as false positive?', sub: inc.title, to: `/incidents?incident=${inc.incident_id}` })
    }
  }
  for (const p of st.programs) {
    if (p.pending_approval?.role === role.role_code && p.pending_approval.gate !== 'PO')
      out.push({ id: p.program_id, kind: 'program', title: `${p.program_id} ${p.name}`, sub: `${p.pending_approval.gate} gate${p.pending_approval.cosign ? ` · ${p.pending_approval.cosign} co-sign` : ''}`, to: `/programs/${p.program_id}` })
    if (role.role_code === 'DEPLOY' && p.vendor_sla_risk && ['PO', 'Vendor allocation', 'Material dispatch', 'Installation', 'Integration'].includes(p.stage))
      out.push({ id: `${p.program_id}-v`, kind: 'vendor', title: `Vendor SLA at risk · ${p.program_id}`, sub: p.name, to: '/programs?tab=vendors' })
    if (role.role_code === 'DEPLOY' && p.created_in_session && !p.stage_history.some((h) => h.stage === 'Vendor allocation'))
      out.push({ id: `${p.program_id}-va`, kind: 'vendor', title: `Confirm vendor allocation · ${p.program_id}`, sub: p.name, to: `/programs/${p.program_id}` })
  }
  if (role.role_code === 'PROC')
    for (const po of st.pos.filter((x) => x.status === 'pending_release'))
      out.push({ id: po.po_id, kind: 'po', title: `Release ${po.po_id}`, sub: `${po.program_id} · ${po.category}`, to: '/planner?tab=readiness' })
  if (role.role_code === 'FIELD') {
    const end = addDays(today, 6)
    for (const w of st.workOrders.filter((w) => w.engineer_id === role.engineer_id && ['open', 'in_progress', 'overdue'].includes(w.status) && w.due <= end))
      out.push({ id: w.wo_id, kind: 'wo', title: `${w.type} · ${w.site_id}`, sub: `Due ${w.due}`, to: `/field?wo=${w.wo_id}` })
  }
  return out
}
