import type { ActionOption, Incident, Policy, Program, Role, RoleCode } from '@/data/types'
import { idr } from './format'

// Approval routing (PRD §5 human in the loop, §8 intervention classes and Stage 3 gate).
//
// Two tables in the PRD overlap for minor CapEx: the class table names the Head of Planning,
// while the Stage 3 gate gives the Regional Manager decisions below IDR 200m. The routing
// below applies both: minor CapEx at or under the Stage 3 threshold goes to the Regional
// Manager, above it to the Head of Planning. Thresholds are editable in Agent Studio.

export interface Route {
  roles: RoleCode[]
  label: string
  auto: boolean
  autoNote?: string
  cosign?: string | null
  gate: string
}

export function routeOption(o: ActionOption, inc: Incident, p: Policy): Route {
  switch (o.class) {
    case 'noncapex_zero':
      return { roles: ['OPS', 'REGION'], label: 'NOC shift lead', auto: true, autoNote: 'Auto-approved, post-hoc review', gate: 'Non-CapEx' }
    case 'noncapex_opex':
      if (o.cost_idr < p.opex_auto_approve_below_idr)
        return { roles: ['REGION', 'OPS'], label: 'Regional Network Manager', auto: true, autoNote: `Auto-approved below ${idr(p.opex_auto_approve_below_idr)}`, gate: 'Non-CapEx' }
      return { roles: ['REGION', 'OPS'], label: 'Regional Network Manager', auto: false, gate: 'Non-CapEx' }
    case 'capex_minor':
      if (o.cost_idr <= p.decision_threshold_idr)
        return { roles: ['REGION', 'PLAN'], label: `Regional Network Manager (≤ ${idr(p.decision_threshold_idr)})`, auto: false, gate: 'Stage 3 decision' }
      return { roles: ['PLAN'], label: 'Head of Planning', auto: false, gate: 'Stage 3 decision' }
    case 'capex_major':
      return {
        roles: ['EXEC'],
        label: 'Head of Network',
        auto: false,
        cosign: o.cost_idr > p.cfo_cosign_above_idr ? 'CFO' : null,
        gate: 'Stage 3 decision',
      }
    case 'customer_action': {
      const n = inc.churn_risk_subs || inc.customers
      if (n < p.customer_auto_approve_below)
        return { roles: ['CX'], label: 'Head of CX', auto: true, autoNote: `Auto-approved below ${p.customer_auto_approve_below.toLocaleString()} customers`, gate: 'Customer action' }
      return { roles: ['CX'], label: 'Head of CX', auto: false, gate: 'Customer action' }
    }
  }
}

export function canApprove(role: Role, route: Route, inc: Incident, scope: string): boolean {
  if (!route.roles.includes(role.role_code)) return false
  if (role.role_code === 'REGION') return inc.region === scope
  return true
}

export function programApprover(p: Program): RoleCode | null {
  return p.pending_approval?.role ?? null
}

export function priorityScore(inc: Pick<Incident, 'exposure_idr' | 'probability' | 'urgency'>, p: Policy): number {
  const w = p.priority_weights
  const e = Math.max(inc.exposure_idr / 1e9, 0.001)
  return Math.round(Math.pow(e, w.exposure) * Math.pow(inc.probability, w.probability) * Math.pow(inc.urgency, w.urgency) * 1000) / 10
}

export const REASON_CODES = [
  'Covered by upcoming program',
  'Cost exceeds exposure',
  'Prediction confidence too low',
  'Local knowledge: already mitigated',
  'Tower company constraint',
  'Vendor capacity unavailable',
  'Duplicate of existing incident',
  'Budget envelope exhausted',
]
