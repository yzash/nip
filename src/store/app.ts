import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { db } from '@/data/db'
import type {
  Approval,
  BoqLine,
  Incident,
  Insight,
  Policy,
  Program,
  PurchaseOrder,
  Role,
  RoleCode,
  WorkOrder,
} from '@/data/types'
import { addDays } from '@/lib/format'
import { priorityScore } from '@/lib/policy'
import type { PlanDraft } from '@/lib/plan'

export type LayerId =
  | 'health'
  | 'cnx'
  | 'availability'
  | 'bad_session'
  | 'prb'
  | 'backbone'
  | 'cdn'
  | 'failure'
  | 'revenue'
  | 'program'

export interface MapFilters {
  regions: string[]
  provinces: string[]
  technologies: string[]
  vendors: string[]
  siteClasses: string[]
  segment: 'all' | 'consumer_4g' | 'consumer_5g' | 'postpaid' | 'enterprise'
  program: 'all' | 'in' | 'out'
  incident: 'all' | 'open' | 'none'
  availabilityWindow: 1 | 7 | 30
}

export const DEFAULT_FILTERS: MapFilters = {
  regions: [],
  provinces: [],
  technologies: [],
  vendors: [],
  siteClasses: [],
  segment: 'all',
  program: 'all',
  incident: 'all',
  availabilityWindow: 1,
}

export interface AuditEntry {
  id: string
  ts: string
  role: RoleCode
  actor: string
  action: string
  object: string
  detail?: string
  reason?: string | null
}

export interface OverrideRecord {
  id: string
  ts: string
  agent: string
  object: string
  recommended: string
  chosen: string
  reason: string
  role: RoleCode
}

export interface Toast {
  id: number
  text: string
  tone: 'ok' | 'warn' | 'info'
}

export interface Comment {
  ts: string
  role: RoleCode
  actor: string
  text: string
}

interface State {
  role: RoleCode
  scopes: Partial<Record<RoleCode, string>>
  filtersByRole: Partial<Record<RoleCode, MapFilters>>
  layer: LayerId
  overlays: { backbone: boolean; cdn: boolean; program: boolean }
  scrub: number // days relative to D-1: -30..0 past, 1..56 future
  compare: boolean
  railExpanded: boolean
  guideOpen: boolean
  guideStep: number

  // session workflow state (seeded from /data, reset on reload)
  seeded: boolean
  policy: Policy | null
  incidents: Incident[]
  approvals: Approval[]
  programs: Program[]
  workOrders: WorkOrder[]
  pos: PurchaseOrder[]
  boqExtra: BoqLine[]
  reservations: { warehouse_id: string; sku: string; qty: number; program_id: string }[]
  prepositioned: string[]
  sessionInsights: Insight[]
  audit: AuditEntry[]
  overrides: OverrideRecord[]
  classMoves: Record<string, { to: 'capex' | 'noncapex'; reason: string }>
  comments: Record<string, Comment[]>
  plan: PlanDraft | null
  toasts: Toast[]

  seed: () => void
  resetDemo: () => void
  setRole: (r: RoleCode) => void
  setScope: (r: RoleCode, s: string) => void
  setFilters: (f: Partial<MapFilters>) => void
  resetFilters: () => void
  setLayer: (l: LayerId) => void
  toggleOverlay: (k: keyof State['overlays']) => void
  setScrub: (d: number) => void
  setCompare: (b: boolean) => void
  setRail: (b: boolean) => void
  setGuide: (open: boolean, step?: number) => void
  toast: (text: string, tone?: Toast['tone']) => void
  dismissToast: (id: number) => void

  decideIncident: (id: string, decision: 'approve' | 'reject' | 'defer', opts: { rank?: number; reason?: string | null; auto?: boolean }) => void
  escalateIncident: (id: string) => void
  closeFalsePositive: (id: string, reason: string) => void
  createIncidentForSite: (siteId: string) => string
  addComment: (id: string, text: string) => void
  setPlan: (p: PlanDraft | null) => void
  submitPlan: (p: PlanDraft) => string
  approveProgram: (id: string, decision: 'approve' | 'defer', reason?: string) => void
  releasePO: (poId: string) => void
  confirmVendor: (programId: string, vendorId: string) => void
  reallocateVendor: (programId: string, toVendor: string) => void
  approvePreposition: (key: string, detail: string) => void
  updateWorkOrder: (woId: string, patch: Partial<WorkOrder>) => void
  dispatchSite: (siteId: string, reason: string) => void
  moveClass: (siteId: string, to: 'capex' | 'noncapex', reason: string, recommended: string) => void
  markFalsePositiveSite: (siteId: string, reason: string) => void
  setPolicy: (p: Policy) => void
  logAudit: (e: Omit<AuditEntry, 'id' | 'ts' | 'role' | 'actor'>) => void
}

let toastN = 1
let auditN = 1

export function nowIso(): string {
  return db().meta.now
}
export function todayIso(): string {
  return db().meta.now.slice(0, 10)
}

export function roleDef(code: RoleCode): Role {
  return db().roles.find((r) => r.role_code === code)!
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

export const useApp = create<State>()(
  persist(
    (set, get) => ({
      role: 'EXEC',
      scopes: {},
      filtersByRole: {},
      layer: 'health',
      overlays: { backbone: false, cdn: false, program: false },
      scrub: 0,
      compare: false,
      railExpanded: false,
      guideOpen: false,
      guideStep: 0,

      seeded: false,
      policy: null,
      incidents: [],
      approvals: [],
      programs: [],
      workOrders: [],
      pos: [],
      boqExtra: [],
      reservations: [],
      prepositioned: [],
      sessionInsights: [],
      audit: [],
      overrides: [],
      classMoves: {},
      comments: {},
      plan: null,
      toasts: [],

      seed: () => {
        const D = db()
        set({
          seeded: true,
          policy: clone(D.policy),
          incidents: clone(D.incidents),
          approvals: clone(D.approvals),
          programs: clone(D.programs),
          workOrders: clone(D.workOrders),
          pos: clone(D.pos),
          boqExtra: [],
          reservations: [],
          prepositioned: [],
          sessionInsights: [],
          audit: [],
          overrides: [],
          classMoves: {},
          comments: {},
          plan: null,
        })
      },
      resetDemo: () => {
        get().seed()
        set({ role: 'EXEC', layer: 'health', scrub: 0, compare: false, overlays: { backbone: false, cdn: false, program: false }, guideStep: 0 })
        get().toast('Demo reset to the Monday 08:00 WIB state', 'info')
      },

      setRole: (r) => set({ role: r }),
      setScope: (r, s) => set((st) => ({ scopes: { ...st.scopes, [r]: s } })),
      setFilters: (f) =>
        set((st) => ({ filtersByRole: { ...st.filtersByRole, [st.role]: { ...(st.filtersByRole[st.role] ?? DEFAULT_FILTERS), ...f } } })),
      resetFilters: () => set((st) => ({ filtersByRole: { ...st.filtersByRole, [st.role]: DEFAULT_FILTERS } })),
      setLayer: (l) => set((st) => ({ layer: l, scrub: l === 'failure' ? st.scrub : Math.min(0, st.scrub) })),
      toggleOverlay: (k) => set((st) => ({ overlays: { ...st.overlays, [k]: !st.overlays[k] } })),
      setScrub: (d) => set({ scrub: d }),
      setCompare: (b) => set({ compare: b }),
      setRail: (b) => set({ railExpanded: b }),
      setGuide: (open, step) => set((st) => ({ guideOpen: open, guideStep: step ?? st.guideStep })),
      toast: (text, tone = 'ok') => {
        const id = toastN++
        set((st) => ({ toasts: [...st.toasts, { id, text, tone }] }))
        setTimeout(() => get().dismissToast(id), 4200)
      },
      dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),

      logAudit: (e) => {
        const st = get()
        const r = roleDef(st.role)
        set({ audit: [{ id: `AUD-${auditN++}`, ts: nowIso(), role: st.role, actor: r.user, ...e }, ...st.audit] })
      },

      decideIncident: (id, decision, { rank, reason, auto }) => {
        const st = get()
        const r = roleDef(st.role)
        const inc = st.incidents.find((x) => x.incident_id === id)
        if (!inc) return
        const opts = db().optionsByIncident.get(id) ?? []
        const chosen = opts.find((o) => o.rank === (rank ?? inc.recommended_rank))
        const rec = opts.find((o) => o.rank === inc.recommended_rank)
        const status = decision === 'approve' ? 'Approved' : decision === 'reject' ? 'Rejected' : 'Deferred'
        const actor = auto ? 'Approval Routing Agent (auto)' : r.user
        set({
          incidents: st.incidents.map((x) =>
            x.incident_id === id ? { ...x, status, chosen_rank: chosen?.rank, flags: x.flags.filter((f) => f !== 'escalate_candidate') } : x,
          ),
          approvals: [
            ...st.approvals,
            { incident_id: id, step: 'Approve', role: st.role, actor, decision: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'deferred', reason_code: reason ?? null, timestamp: nowIso() },
          ],
        })
        get().logAudit({ action: `Incident ${status.toLowerCase()}`, object: id, detail: chosen ? `${chosen.name}` : undefined, reason: reason ?? null })
        if (decision === 'reject' || (decision === 'approve' && rec && chosen && chosen.rank !== rec.rank)) {
          set((s) => ({
            overrides: [
              { id: `OVR-${s.overrides.length + 1}`, ts: nowIso(), agent: 'Action Ladder Agent', object: id, recommended: rec?.name ?? '—', chosen: decision === 'reject' ? 'Rejected' : chosen?.name ?? '—', reason: reason ?? 'Different rung chosen', role: s.role },
              ...s.overrides,
            ],
          }))
        }
      },
      escalateIncident: (id) => {
        const st = get()
        set({
          incidents: st.incidents.map((x) =>
            x.incident_id === id ? { ...x, status: 'Pending_approval', owner_role: 'PLAN', flags: [...x.flags.filter((f) => f !== 'escalate_candidate'), 'escalated_capex'], functions: [...new Set([...x.functions, 'Planning'])] } : x,
          ),
          approvals: [...st.approvals, { incident_id: id, step: 'Review', role: st.role, actor: roleDef(st.role).user, decision: 'escalated to CapEx', reason_code: 'Non-CapEx options exhausted', timestamp: nowIso() }],
        })
        get().logAudit({ action: 'Escalated to CapEx (Head of Planning)', object: id })
      },
      closeFalsePositive: (id, reason) => {
        const st = get()
        const inc = st.incidents.find((x) => x.incident_id === id)
        set({
          incidents: st.incidents.map((x) => (x.incident_id === id ? { ...x, status: 'Closed', closed_reason: 'False positive', flags: x.flags.filter((f) => f !== 'false_positive_candidate') } : x)),
          approvals: [...st.approvals, { incident_id: id, step: 'Close', role: st.role, actor: roleDef(st.role).user, decision: 'closed as false positive', reason_code: reason, timestamp: nowIso() }],
          overrides: [
            { id: `OVR-${st.overrides.length + 1}`, ts: nowIso(), agent: inc?.source === 'prediction' ? 'Site Failure Prediction Agent' : 'Site Health Agent', object: id, recommended: 'Incident', chosen: 'False positive', reason, role: st.role },
            ...st.overrides,
          ],
        })
        get().logAudit({ action: 'Closed as false positive', object: id, reason })
      },
      createIncidentForSite: (siteId) => {
        const D = db()
        const st = get()
        const i = D.siteIdx.get(siteId)!
        const s = D.sites[i]
        const fc = D.forecast[i]
        const n = Math.max(...st.incidents.map((x) => Number(x.incident_id.slice(4)))) + 3
        const id = `INC-${n}`
        const inc: Incident = {
          incident_id: id,
          title: `Manual incident — ${s.name} (${siteId})`,
          class: fc.failure_class,
          source: 'alarm',
          site_ids: [siteId],
          province_id: s.province_id,
          province_ids: [s.province_id],
          district_id: s.district_id,
          region: s.region,
          probability: fc.failure_prob[7],
          predicted_week: 0,
          exposure_idr: Math.round((D.revenue.latest[i] * 0.2) / 1e6) * 1e6,
          urgency: 1.2,
          status: 'Detected',
          owner_role: fc.failure_class === 'capacity' ? 'PLAN' : 'OPS',
          functions: ['Operations'],
          detected_at: nowIso(),
          sla_due: new Date(new Date(nowIso()).getTime() + 24 * 3600e3).toISOString(),
          owner_assigned_at: null,
          program_id: s.program_id,
          program_match: s.program_id ? { verdict: 'partial', program_id: s.program_id, reason: 'Site in program; scope to confirm' } : { verdict: 'not_covered' },
          customers: s.subscribers,
          churn_risk_subs: 0,
          recommended_rank: 1,
          flags: ['manual'],
          insight_ids: [],
          confidence: 0.5,
          priority_score: 0,
          as_of: D.meta.as_of,
          freshness: 'live',
        }
        inc.priority_score = priorityScore(inc, st.policy!)
        set({ incidents: [inc, ...st.incidents] })
        get().logAudit({ action: 'Incident created manually', object: id, detail: siteId })
        return id
      },
      addComment: (id, text) => {
        const st = get()
        const r = roleDef(st.role)
        set({ comments: { ...st.comments, [id]: [...(st.comments[id] ?? []), { ts: nowIso(), role: st.role, actor: r.user, text }] } })
      },
      setPlan: (p) => set({ plan: p }),

      submitPlan: (p) => {
        const D = db()
        const st = get()
        const today = todayIso()
        const pid = p.id
        const fieldRole = roleDef('FIELD')
        const fieldDistrict = st.scopes.FIELD ?? fieldRole.scope_ids[0]
        const program: Program = {
          program_id: pid,
          name: p.name,
          type: p.intervention === 'sector_add' || p.intervention === 'carrier_add' ? 'Capacity' : p.intervention_label,
          intervention: p.intervention,
          region: p.region,
          province_ids: [...new Set(p.site_ids.map((s) => D.sites[D.siteIdx.get(s)!].province_id))],
          budget_idr: Math.round(p.capex_total_idr * 1.03),
          spent_idr: 0,
          stage: 'PO',
          health: 'on_track',
          sites_planned: p.site_ids.length,
          sites_rfs: 0,
          site_ids: p.site_ids,
          start: today,
          target_rfs: p.target_rfs,
          forecast_rfs: p.target_rfs,
          managed_by: 'nicc',
          vendor_id: p.vendor.vendor.vendor_id,
          capex_class: p.capex_class,
          gb_factory: ['sector_add', 'carrier_add', 'refarm', '5g_add', 'small_cell'].includes(p.intervention),
          owner_role: 'DEPLOY',
          stage_history: [
            { stage: 'Decision', start: today, end: today },
            { stage: 'BOQ', start: today, end: addDays(today, 1) },
            { stage: 'PO', start: today, end: null },
          ],
          blockers: [],
          gap_flags: [],
          documents: [
            { name: `${pid} plan (NICC draft).pdf`, type: 'business_case' },
            { name: `${pid} BOQ export.xlsx`, type: 'boq' },
          ],
          tower_company_clock: p.tower_companies.length
            ? { tower_company: p.tower_companies.join(', '), requested: today, sla_days: 10, due: addDays(today, 10), status: 'pending', items: 'Loading feasibility and site access (fast-track, bulk loading agreement)' }
            : null,
          vendor_sla_risk: false,
          pending_approval: { role: 'PROC', cosign: null, since: today, gate: 'PO' },
          complete: false,
          source_incident: p.source_incident ?? undefined,
          created_in_session: true,
          as_of: D.meta.as_of,
          freshness: 'live',
        }
        const boqLines: BoqLine[] = p.site_ids.flatMap((sid) =>
          p.boq.map((b) => ({ program_id: pid, site_id: sid, sku: b.sku, description: b.description, qty: b.qty / p.site_ids.length, unit_cost_idr: b.unit_cost_idr, price_book_idr: b.unit_cost_idr, vendor: p.vendor.vendor.vendor_id })),
        )
        const maxPo = Math.max(...st.pos.map((x) => Number(x.po_id.split('-')[2])))
        const newPos: PurchaseOrder[] = []
        if (p.po_hardware_idr > 0)
          newPos.push({ po_id: `PO-26-${maxPo + 1}`, program_id: pid, vendor: p.vendor.vendor.vendor_id, category: 'Hardware (shortfall)', amount_idr: p.po_hardware_idr, status: 'pending_release', issued: null, due: addDays(today, 21), contract: `FA-${p.vendor.vendor.vendor_id}-2025-41` })
        if (p.po_services_idr > 0)
          newPos.push({ po_id: `PO-26-${maxPo + 2}`, program_id: pid, vendor: p.vendor.vendor.vendor_id, category: 'Services', amount_idr: p.po_services_idr, status: 'pending_release', issued: null, due: addDays(today, 30), contract: `FA-${p.vendor.vendor.vendor_id}-2025-41` })
        const newRes = p.stock.flatMap((s) => s.sources.map((x) => ({ warehouse_id: x.warehouse_id, sku: s.sku, qty: x.qty, program_id: pid })))
        const maxWo = Math.max(...st.workOrders.map((w) => Number(w.wo_id.slice(3))))
        const regionEng = D.engineers.filter((e) => e.region === p.region && e.engineer_id !== fieldRole.engineer_id)
        const newWos: WorkOrder[] = p.site_ids.map((sid, k) => {
          const s = D.sites[D.siteIdx.get(sid)!]
          const inField = D.distById[s.district_id].name === fieldDistrict
          return {
            wo_id: `WO-${maxWo + 1 + k}`,
            site_id: sid,
            program_id: pid,
            incident_id: p.source_incident,
            engineer_id: inField ? fieldRole.engineer_id! : regionEng[k % Math.max(1, regionEng.length)]?.engineer_id ?? fieldRole.engineer_id!,
            type: 'Site survey',
            status: 'open',
            priority: 'high',
            created: today,
            due: addDays(today, Math.min(6, 1 + Math.floor(k / 3))),
            evidence: [],
            checklist: ['Measure mounting space and azimuths', 'Check tower loading plate', 'Power budget check', 'Photo evidence: 360° rooftop / tower', 'Upload survey form'].map((step) => ({ step, done: false })),
            parts: p.stock.slice(0, 2).map((x) => ({ sku: x.sku, qty: Math.max(1, Math.round(x.needed / p.site_ids.length)), status: x.readiness === 'green' ? 'Ready at warehouse' : x.shortfall > 0 ? 'Awaiting PO' : 'Transfer in progress' })),
          }
        })
        const ins: Insight = {
          insight_id: `INS-S${st.sessionInsights.length + 1}`,
          agent: 'Program Orchestrator',
          timestamp: nowIso(),
          scope: { site_ids: p.site_ids, province_id: program.province_ids[0], district_id: D.sites[D.siteIdx.get(p.site_ids[0])!].district_id, label: p.district_label },
          what_changed: 'Program created',
          message: `${pid} ${p.name} created from ${p.source_incident ?? 'planner'}: ${p.site_ids.length} sites, ${p.vendor.vendor.short} allocated, target RFS ${p.target_rfs}. PO release pending Procurement.`,
          magnitude: `${p.site_ids.length} sites`,
          confidence: 0.95,
          exposure_idr: 0,
          suggested_function: 'Deployment',
          suggested_action: 'Confirm vendor allocation; release PO',
          incident_id: p.source_incident,
          as_of: D.meta.as_of,
          freshness: 'live',
        }
        set({
          programs: [program, ...st.programs],
          boqExtra: [...st.boqExtra, ...boqLines],
          pos: [...newPos, ...st.pos],
          reservations: [...st.reservations, ...newRes],
          workOrders: [...newWos, ...st.workOrders],
          sessionInsights: [ins, ...st.sessionInsights],
          plan: null,
          incidents: st.incidents.map((x) =>
            x.incident_id === p.source_incident
              ? { ...x, status: 'In_program', program_id: pid, program_match: { verdict: 'covered', program_id: pid, eta: p.target_rfs, stage: 'PO', reason: null } }
              : x,
          ),
        })
        get().logAudit({ action: 'Plan submitted, program created', object: pid, detail: `${p.site_ids.length} sites · ${p.intervention_label}` })
        return pid
      },

      approveProgram: (id, decision, reason) => {
        const st = get()
        const today = todayIso()
        set({
          programs: st.programs.map((p) => {
            if (p.program_id !== id) return p
            if (decision === 'defer') return { ...p, pending_approval: p.pending_approval ? { ...p.pending_approval, since: today } : null, health: p.health }
            if (p.pending_approval?.gate === 'Decision')
              return {
                ...p,
                stage: 'BOQ',
                owner_role: 'DEPLOY',
                pending_approval: null,
                stage_history: [...p.stage_history.map((h) => (h.end ? h : { ...h, end: today })), { stage: 'BOQ', start: today, end: null }],
              }
            if (p.pending_approval?.gate === 'BOQ variance') return { ...p, pending_approval: null, blockers: p.blockers.filter((b) => b.type !== 'boq_variance') }
            return { ...p, pending_approval: null }
          }),
        })
        get().logAudit({ action: decision === 'approve' ? 'Program approved' : 'Program deferred', object: id, reason: reason ?? null })
      },
      releasePO: (poId) => {
        const st = get()
        const po = st.pos.find((x) => x.po_id === poId)
        const today = todayIso()
        const pos = st.pos.map((x) => (x.po_id === poId ? { ...x, status: 'released' as const, issued: today } : x))
        const stillPending = pos.some((x) => x.program_id === po?.program_id && x.status === 'pending_release')
        set({
          pos,
          programs: st.programs.map((p) =>
            p.program_id === po?.program_id && !stillPending && p.pending_approval?.gate === 'PO' ? { ...p, pending_approval: null } : p,
          ),
        })
        get().logAudit({ action: 'PO released', object: poId, detail: po?.program_id })
      },
      confirmVendor: (programId, vendorId) => {
        const st = get()
        const today = todayIso()
        set({
          programs: st.programs.map((p) =>
            p.program_id === programId
              ? { ...p, vendor_id: vendorId, stage_history: p.stage_history.some((h) => h.stage === 'Vendor allocation') ? p.stage_history : [...p.stage_history, { stage: 'Vendor allocation', start: today, end: today }] }
              : p,
          ),
        })
        get().logAudit({ action: 'Vendor allocation confirmed', object: programId, detail: vendorId })
      },
      reallocateVendor: (programId, toVendor) => {
        const st = get()
        const p = st.programs.find((x) => x.program_id === programId)
        set({
          programs: st.programs.map((x) =>
            x.program_id === programId
              ? { ...x, vendor_id: toVendor, vendor_sla_risk: false, blockers: x.blockers.filter((b) => b.type !== 'vendor_sla'), health: x.health === 'at_risk' ? 'on_track' : x.health }
              : x,
          ),
        })
        get().logAudit({ action: 'Vendor capacity reallocated', object: programId, detail: `${p?.vendor_id} → ${toVendor}` })
      },
      approvePreposition: (key, detail) => {
        set((st) => ({ prepositioned: [...st.prepositioned, key] }))
        get().logAudit({ action: 'Stock pre-positioning approved', object: key, detail })
      },
      updateWorkOrder: (woId, patch) => {
        set((st) => ({ workOrders: st.workOrders.map((w) => (w.wo_id === woId ? { ...w, ...patch } : w)) }))
        if (patch.status) get().logAudit({ action: `Work order ${patch.status.replace('_', ' ')}`, object: woId })
      },
      dispatchSite: (siteId, reason) => {
        const D = db()
        const st = get()
        const s = D.sites[D.siteIdx.get(siteId)!]
        const maxWo = Math.max(...st.workOrders.map((w) => Number(w.wo_id.slice(3))))
        const eng = D.engineers.find((e) => e.region === s.region)!
        const wo: WorkOrder = {
          wo_id: `WO-${maxWo + 1}`,
          site_id: siteId,
          program_id: null,
          incident_id: null,
          engineer_id: eng.engineer_id,
          type: 'Fault repair',
          status: 'open',
          priority: 'high',
          created: todayIso(),
          due: addDays(todayIso(), 1),
          evidence: [],
          checklist: ['Confirm alarm on arrival', 'Replace faulty module', 'Verify KPI recovery with NOC', 'Photo evidence: replaced part serial', 'Close alarm in NMS'].map((step) => ({ step, done: false })),
          parts: [],
        }
        set({ workOrders: [wo, ...st.workOrders] })
        get().logAudit({ action: 'Dispatched field engineer', object: siteId, detail: `${wo.wo_id} → ${eng.name}`, reason })
      },
      moveClass: (siteId, to, reason, recommended) => {
        const st = get()
        set({
          classMoves: { ...st.classMoves, [siteId]: { to, reason } },
          overrides: [
            { id: `OVR-${st.overrides.length + 1}`, ts: nowIso(), agent: 'Smart CapEx Agent', object: siteId, recommended, chosen: to === 'capex' ? 'CapEx' : 'Non-CapEx', reason, role: st.role },
            ...st.overrides,
          ],
        })
        get().logAudit({ action: `Moved to ${to === 'capex' ? 'CapEx' : 'non-CapEx'}`, object: siteId, reason })
      },
      markFalsePositiveSite: (siteId, reason) => {
        const st = get()
        set({
          overrides: [
            { id: `OVR-${st.overrides.length + 1}`, ts: nowIso(), agent: 'Site Failure Prediction Agent', object: siteId, recommended: 'At-risk prediction', chosen: 'False positive', reason, role: st.role },
            ...st.overrides,
          ],
        })
        get().logAudit({ action: 'Prediction marked false positive', object: siteId, reason })
      },
      setPolicy: (p) => {
        const st = get()
        set({ policy: p, incidents: st.incidents.map((x) => ({ ...x, priority_score: priorityScore(x, p) })) })
        get().logAudit({ action: 'Policy updated', object: 'Threshold and policy editor' })
      },
    }),
    {
      name: 'nicc-prefs',
      version: 1,
      storage: createJSONStorage(() => {
        try {
          return localStorage
        } catch {
          return sessionStorage
        }
      }),
      partialize: (s) => ({ filtersByRole: s.filtersByRole, scopes: s.scopes, railExpanded: s.railExpanded }),
    },
  ),
)

export function useRole(): Role {
  const code = useApp((s) => s.role)
  return roleDef(code)
}

export function useScope(): string {
  const code = useApp((s) => s.role)
  const scopes = useApp((s) => s.scopes)
  return scopes[code] ?? roleDef(code).scope_ids[0]
}

export function useFilters(): MapFilters {
  const code = useApp((s) => s.role)
  const f = useApp((s) => s.filtersByRole[code])
  return f ?? DEFAULT_FILTERS
}

export function usePolicy(): Policy {
  return useApp((s) => s.policy) ?? db().policy
}

export function nextProgramId(programs: Program[]): string {
  const n = Math.max(...programs.map((p) => Number(p.program_id.split('-')[1])))
  return `PRG-${n + 1}`
}

export function allInsights(session: Insight[]): Insight[] {
  return [...session, ...db().insights]
}
