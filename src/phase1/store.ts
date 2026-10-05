import { create } from 'zustand'
import { db } from '@/data/db'
import type { RoleCode } from '@/data/types'
import { addDays } from '@/lib/format'
import { buildPlan } from '@/lib/plan'
import { roleDef, todayIso, useApp } from '@/store/app'
import { CLASS_META, HANDOFF_TARGETS, clustersFrom, planRoute, type Cluster, type HandoffState, type P1Plan } from './model'

// Phase 1 session state: plans, approvals, hand-offs, classification overrides, audit.
// Seeded with a few plans in different states so the planner never opens empty.

export interface P1Audit {
  id: number
  ts: string
  role: RoleCode
  actor: string
  action: string
  object: string
  detail?: string
  reason?: string | null
}

interface P1State {
  seeded: boolean
  plans: P1Plan[]
  classMoves: Record<string, { to: 'capex' | 'noncapex'; reason: string; by: string }>
  prepositioned: string[]
  audit: P1Audit[]
  seed: () => void
  reset: () => void
  createPlan: (draft: P1Plan['draft'], clusterId: string | null) => string
  updateDraft: (id: string, draft: P1Plan['draft']) => void
  submit: (id: string) => void
  decide: (id: string, d: 'approve' | 'reject' | 'defer', reason?: string | null) => void
  sendHandoff: (id: string, target: string) => void
  moveClass: (siteId: string, to: 'capex' | 'noncapex', reason: string) => void
  approvePreposition: (key: string, detail: string) => void
  log: (a: Omit<P1Audit, 'id' | 'ts' | 'role' | 'actor'>) => void
}

let auditN = 1
const nowTs = () => db().meta.now

export function requiredHandoffs(p: P1Plan): string[] {
  const out = ['HO-ERP', 'HO-BOQ', 'HO-WMS']
  if (p.draft.capex_class === 'capex_minor' || p.draft.capex_class === 'capex_major') out.push('HO-VENDOR')
  if (p.draft.tower_companies.length && ['sector_add', 'transport', 'new_site', '5g_add'].includes(p.draft.intervention)) out.push('HO-TOWERCO')
  return out
}

function freshHandoffs(): P1Plan['handoffs'] {
  return Object.fromEntries(HANDOFF_TARGETS.map((t) => [t, { state: 'not_sent' as HandoffState }]))
}

function mkPlan(c: Cluster, n: number, status: P1Plan['status'], daysAgo: number, reservations: { warehouse_id: string; sku: string; qty: number }[]): P1Plan {
  const D = db()
  const today = todayIso()
  const iv = CLASS_META[c.cls].defaultIntervention
  const draft = buildPlan({ siteIds: c.site_ids, intervention: iv, sourceIncident: c.incident_id, programs: useApp.getState().programs, reservations, windowDays: c.crossing_week * 7, today, nextProgramId: `PL-${String(n).padStart(4, '0')}` })
  draft.name = `${D.distById[c.district_id]?.name ?? ''} · ${draft.intervention_label}`
  const policy = useApp.getState().policy ?? D.policy
  const route = planRoute(draft.capex_class, draft.capex_total_idr, policy)
  const created = `${addDays(today, -daysAgo)}T09:${10 + n}:00+07:00`
  const planner = roleDef('PLAN').user
  const history: P1Plan['history'] = [{ ts: created, who: planner, role: 'PLAN', what: 'Plan drafted from forecast cluster ' + c.id }]
  const handoffs = freshHandoffs()
  if (status !== 'draft') history.push({ ts: `${addDays(today, -daysAgo)}T11:02:00+07:00`, who: planner, role: 'PLAN', what: `Submitted · routed to ${route.label}` })
  if (status === 'approved' || status === 'handed_off') history.push({ ts: `${addDays(today, -daysAgo + 1)}T10:15:00+07:00`, who: roleDef(route.role).user, role: route.role, what: 'Approved' })
  const p: P1Plan = { id: draft.id, name: draft.name, status, cluster_id: c.id, draft, created, created_by: planner, route, history, handoffs }
  if (status === 'handed_off') {
    for (const t of requiredHandoffs(p)) {
      handoffs[t] = { state: 'acknowledged', ref: t === 'HO-ERP' ? `4500${812300 + n}` : t === 'HO-BOQ' ? `PMO-${2600 + n}` : t === 'HO-WMS' ? `RSV-${70110 + n}` : `${t.slice(3)}-${n}1`, ts: `${addDays(today, -daysAgo + 1)}T14:30:00+07:00` }
    }
    history.push({ ts: `${addDays(today, -daysAgo + 1)}T14:30:00+07:00`, who: 'Procurement Agent', role: 'system', what: 'Hand-off acknowledged by ERP, PMO and WMS' })
  }
  if (status !== 'draft') p.submitted = history[1].ts
  if (status === 'approved' || status === 'handed_off') {
    p.decided = history[2].ts
    p.decided_by = history[2].who
  }
  return p
}

export const useP1Store = create<P1State>()((set, get) => ({
  seeded: false,
  plans: [],
  classMoves: {},
  prepositioned: [],
  audit: [],

  seed: () => {
    if (get().seeded) return
    const clusters = clustersFrom(db().incidents)
    const pick = (cls: string, pred: (c: Cluster) => boolean) => clusters.find((c) => c.cls === cls && !c.story && pred(c))
    const plans: P1Plan[] = []
    const res: { warehouse_id: string; sku: string; qty: number }[] = []
    const cj = clusters.find((c) => c.story === 'cjava_power')
    const seeds: [Cluster | undefined, P1Plan['status'], number][] = [
      [cj, 'handed_off', 9],
      [pick('ran_hardware', (c) => c.coverage.verdict === 'not_covered' && c.site_ids.length >= 2), 'approved', 2],
      [pick('power', (c) => c.coverage.verdict === 'not_covered') ?? pick('transport', (c) => c.coverage.verdict === 'not_covered'), 'pending_approval', 1],
      [pick('environmental', (c) => c.coverage.verdict === 'not_covered'), 'draft', 0],
    ]
    let n = 1
    for (const [c, status, ago] of seeds) {
      if (!c) continue
      const p = mkPlan(c, n++, status, ago, res)
      for (const s of p.draft.stock) for (const src of s.sources) res.push({ warehouse_id: src.warehouse_id, sku: s.sku, qty: src.qty })
      plans.push(p)
    }
    set({ seeded: true, plans })
  },
  reset: () => {
    set({ seeded: false, plans: [], classMoves: {}, prepositioned: [], audit: [] })
    get().seed()
  },

  log: (a) => {
    const app = useApp.getState()
    set((s) => ({ audit: [{ id: auditN++, ts: nowTs(), role: app.role, actor: roleDef(app.role).user, ...a }, ...s.audit] }))
  },

  createPlan: (draft, clusterId) => {
    const app = useApp.getState()
    const nums = get().plans.map((p) => Number(p.id.split('-')[1]))
    const id = `PL-${String(Math.max(0, ...nums) + 1).padStart(4, '0')}`
    const d = { ...draft, id }
    const route = planRoute(d.capex_class, d.capex_total_idr, app.policy ?? db().policy)
    const p: P1Plan = {
      id,
      name: d.name,
      status: 'draft',
      cluster_id: clusterId,
      draft: d,
      created: nowTs(),
      created_by: roleDef(app.role).user,
      route,
      history: [{ ts: nowTs(), who: roleDef(app.role).user, role: app.role, what: clusterId ? `Plan drafted from forecast cluster ${clusterId}` : 'Plan drafted from forecast selection' }],
      handoffs: freshHandoffs(),
    }
    set((s) => ({ plans: [p, ...s.plans] }))
    get().log({ action: 'Plan drafted', object: id, detail: `${d.site_ids.length} sites · ${d.intervention_label}` })
    return id
  },
  updateDraft: (id, draft) => {
    const policy = useApp.getState().policy ?? db().policy
    set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, draft: { ...draft, id }, name: draft.name, route: planRoute(draft.capex_class, draft.capex_total_idr, policy) } : p)) }))
  },
  submit: (id) => {
    const app = useApp.getState()
    const p = get().plans.find((x) => x.id === id)
    if (!p) return
    const who = roleDef(app.role).user
    const auto = p.route.auto
    set((s) => ({
      plans: s.plans.map((x) =>
        x.id === id
          ? {
              ...x,
              status: auto ? 'approved' : 'pending_approval',
              submitted: nowTs(),
              decided: auto ? nowTs() : undefined,
              decided_by: auto ? 'Approval Routing Agent (auto)' : undefined,
              history: [...x.history, { ts: nowTs(), who, role: app.role, what: `Submitted · routed to ${x.route.label}${x.route.cosign ? ` + ${x.route.cosign}` : ''}` }, ...(auto ? [{ ts: nowTs(), who: 'Approval Routing Agent', role: 'system', what: x.route.note }] : [])],
            }
          : x,
      ),
    }))
    get().log({ action: auto ? 'Plan auto-approved' : 'Plan submitted for approval', object: id, detail: p.route.label })
  },
  decide: (id, d, reason) => {
    const app = useApp.getState()
    const who = roleDef(app.role).user
    const status = d === 'approve' ? 'approved' : d === 'reject' ? 'rejected' : 'deferred'
    set((s) => ({
      plans: s.plans.map((x) =>
        x.id === id ? { ...x, status, decided: nowTs(), decided_by: who, reason: reason ?? null, history: [...x.history, { ts: nowTs(), who, role: app.role, what: d === 'approve' ? 'Approved' : d === 'reject' ? 'Rejected' : 'Deferred', reason: reason ?? null }] } : x,
      ),
    }))
    get().log({ action: `Plan ${status}`, object: id, reason: reason ?? null })
  },
  sendHandoff: (id, target) => {
    const stamp = (state: HandoffState, ref?: string) =>
      set((s) => ({
        plans: s.plans.map((x) => {
          if (x.id !== id) return x
          const handoffs = { ...x.handoffs, [target]: { state, ref, ts: nowTs() } }
          const done = requiredHandoffs(x).every((t) => handoffs[t]?.state === 'acknowledged')
          return {
            ...x,
            handoffs,
            status: done ? 'handed_off' : x.status,
            history: [...x.history, { ts: nowTs(), who: state === 'sent' ? roleDef(useApp.getState().role).user : 'Integration', role: state === 'sent' ? useApp.getState().role : 'system', what: `${target} ${state}${ref ? ` · ${ref}` : ''}` }],
          }
        }),
      }))
    stamp('sent')
    get().log({ action: 'Hand-off sent', object: id, detail: target })
    const n = Number(id.split('-')[1])
    const ref = target === 'HO-ERP' ? `4500${812300 + n}` : target === 'HO-BOQ' ? `PMO-${2600 + n}` : target === 'HO-WMS' ? `RSV-${70110 + n}` : target === 'HO-VENDOR' ? `ALLOC-${n}7` : `TC-REQ-${n}3`
    setTimeout(() => stamp('acknowledged', ref), 1400)
  },
  moveClass: (siteId, to, reason) => {
    const who = roleDef(useApp.getState().role).user
    set((s) => ({ classMoves: { ...s.classMoves, [siteId]: { to, reason, by: who } } }))
    get().log({ action: `Moved to ${to === 'capex' ? 'CapEx' : 'non-CapEx'}`, object: siteId, reason })
  },
  approvePreposition: (key, detail) => {
    set((s) => ({ prepositioned: [...s.prepositioned, key] }))
    get().log({ action: 'Pre-positioning approved', object: key, detail })
  },
}))

/** Stock reservations held by Phase 1 plans that are approved or handed off. */
export function p1Reservations(plans: P1Plan[]) {
  return plans
    .filter((p) => p.status === 'approved' || p.status === 'handed_off' || p.status === 'pending_approval')
    .flatMap((p) => p.draft.stock.flatMap((s) => s.sources.map((x) => ({ warehouse_id: x.warehouse_id, sku: s.sku, qty: x.qty, program_id: p.id }))))
}
