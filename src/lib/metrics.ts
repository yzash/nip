import { db, kpiAt, kpiMean } from '@/data/db'
import type { Incident, Policy, Program, Role, Site, WorkOrder } from '@/data/types'
import { statusOf } from './colors'

// Composite site health, identical weights to generate.py:
// availability 30%, CNX 25%, bad sessions 15%, PRB 15%, alarms 15%.
export function healthFrom(av: number, cx: number, bd: number, pr: number, al: number): number {
  const c01 = (x: number) => Math.max(0, Math.min(1, x))
  const a = c01((av - 97) / 3) * 100
  const c = c01((cx - 50) / 40) * 100
  const b = c01(1 - (bd - 2) / 14) * 100
  const p = c01(1 - (pr - 55) / 45) * 100
  const l = c01(1 - al / 10) * 100
  return 0.3 * a + 0.25 * c + 0.15 * b + 0.15 * p + 0.15 * l
}

export function siteHealth(i: number, day: number): number {
  return healthFrom(
    kpiAt('availability', i, day),
    kpiAt('cnx', i, day),
    kpiAt('bad_session_pct', i, day),
    kpiAt('prb_util', i, day),
    kpiMean('alarms', i, day, 7),
  )
}

export function lastDay(): number {
  return db().kpi.days - 1
}

/** Probability of failure/breach by the end of week k (1..8); 0 = today. */
export function failureProb(i: number, week: number): number {
  if (week <= 0) return 0
  return db().forecast[i].failure_prob[Math.min(8, week) - 1]
}

export function maxFailureProb(i: number): number {
  const p = db().forecast[i].failure_prob
  return p[p.length - 1]
}

export function crossingWeek(i: number, threshold: number): number {
  const p = db().forecast[i].failure_prob
  for (let k = 0; k < p.length; k++) if (p[k] >= threshold) return k + 1
  return 0
}

// ---- Scope ---------------------------------------------------------------------------
export function districtIdByName(name: string): string | undefined {
  return Object.values(db().distById).find((d) => d.name === name)?.id
}

export function siteInScope(s: Site, role: Role, scope: string): boolean {
  if (role.scope_type === 'national') return true
  if (role.scope_type === 'region') return s.region === scope
  return db().distById[s.district_id]?.name === scope
}

export function scopeLabel(role: Role, scope: string): string {
  if (role.scope_type === 'national') return 'National'
  if (role.scope_type === 'region') return `Region · ${scope}`
  const d = Object.values(db().distById).find((x) => x.name === scope)
  return `District · ${d?.type === 'kabupaten' ? 'Kab. ' : ''}${scope}`
}

export function scopeBounds(role: Role, scope: string): [number, number, number, number] | null {
  const D = db()
  if (role.scope_type === 'national') return [94.9, -11.2, 141.1, 6.2]
  const pts = D.sites.filter((s) => siteInScope(s, role, scope))
  if (!pts.length) return null
  let [x0, y0, x1, y1] = [180, 90, -180, -90]
  for (const s of pts) {
    x0 = Math.min(x0, s.lon)
    y0 = Math.min(y0, s.lat)
    x1 = Math.max(x1, s.lon)
    y1 = Math.max(y1, s.lat)
  }
  return [x0, y0, x1, y1]
}

// ---- Incidents by role (PRD §6 M3 role behaviour) ---------------------------------------
export const OPEN_STATUSES = new Set(['Detected', 'Enriched', 'Pending_approval', 'Approved', 'Deferred', 'In_program', 'RFS'])
export function isOpen(i: Incident): boolean {
  return OPEN_STATUSES.has(i.status)
}

export function roleFilterLabel(role: Role, scope: string, p: Policy): string {
  switch (role.role_code) {
    case 'EXEC':
      return `Exposure > IDR ${p.exec_incident_min_exposure_idr / 1e6}m or > ${p.exec_incident_min_sites} sites`
    case 'CX':
      return `Churn-risk cohort > ${p.cx_incident_min_churn_subs.toLocaleString()} subscribers`
    case 'FIELD':
      return `${scope} with assigned work`
    case 'REGION':
      return `Region ${scope}`
    case 'PLAN':
      return 'Planning incidents'
    case 'DEPLOY':
      return 'Deployment incidents'
    case 'OPS':
      return 'Operations incidents'
    case 'PROC':
      return 'Procurement incidents'
  }
}

export function incidentMatchesRole(inc: Incident, role: Role, scope: string, p: Policy, workOrders: WorkOrder[]): boolean {
  switch (role.role_code) {
    case 'EXEC':
      return inc.exposure_idr > p.exec_incident_min_exposure_idr || inc.site_ids.length > p.exec_incident_min_sites
    case 'CX':
      return inc.churn_risk_subs > p.cx_incident_min_churn_subs
    case 'FIELD': {
      const d = db().distById[inc.district_id]
      if (d?.name !== scope) return false
      const sites = new Set(inc.site_ids)
      return workOrders.some((w) => w.engineer_id === role.engineer_id && (w.incident_id === inc.incident_id || sites.has(w.site_id)))
    }
    case 'REGION':
      return inc.region === scope
    case 'PLAN':
      return inc.functions.includes('Planning') || inc.owner_role === 'PLAN'
    case 'DEPLOY':
      return inc.functions.includes('Deployment') || !!inc.program_id
    case 'OPS':
      return inc.functions.includes('Operations')
    case 'PROC':
      return inc.functions.includes('Procurement')
  }
}

export function programHealthCounts(programs: Program[]) {
  return {
    on_track: programs.filter((p) => p.health === 'on_track').length,
    at_risk: programs.filter((p) => p.health === 'at_risk').length,
    late: programs.filter((p) => p.health === 'late').length,
  }
}

export const PIPELINE_STAGES = new Set(['PO', 'Vendor allocation', 'Material dispatch', 'Installation', 'Integration'])

export function siteStatusToday(i: number, p: Policy): -1 | 0 | 1 | 2 {
  return statusOf(siteHealth(i, lastDay()), p.colour_thresholds.health)
}
