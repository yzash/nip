import clsx from 'clsx'
import { Link } from 'react-router-dom'
import { db } from '@/data/db'
import type { FailureClass, Program, RoleCode, Vendor } from '@/data/types'
import { Badge, Fresh } from '@/components/ui'
import { addDays } from '@/lib/format'
import { INTERVENTIONS, buildPlan, vendorLoad, type PlanDraft } from '@/lib/plan'
import { roleDef, useApp } from '@/store/app'
import { CLASS_META, HANDOFF_TARGETS, type Cluster, type P1Plan, type PlanStatus } from '../../model'
import { requiredHandoffs } from '../../store'

// Shared helpers for the Plans, Plan detail, Approvals and Hand-off pages (Phase 1 steps 3–5).

export const STATUS_META: Record<PlanStatus, { label: string; tone: 'neutral' | 'warn' | 'yellow' | 'ok' | 'bad' | 'prog' }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending_approval: { label: 'Pending approval', tone: 'warn' },
  approved: { label: 'Approved', tone: 'yellow' },
  handed_off: { label: 'Handed off', tone: 'ok' },
  rejected: { label: 'Rejected', tone: 'bad' },
  deferred: { label: 'Deferred', tone: 'prog' },
}

export function StatusBadge({ s, className }: { s: PlanStatus; className?: string }) {
  return (
    <Badge tone={STATUS_META[s].tone} className={className}>
      {STATUS_META[s].label}
    </Badge>
  )
}

export const CAPEX_LABEL: Record<string, string> = {
  noncapex_zero: 'Non-CapEx · zero',
  noncapex_opex: 'Non-CapEx · OpEx',
  capex_minor: 'CapEx · minor',
  capex_major: 'CapEx · major',
  customer_action: 'Customer action',
}

export function CapexChip({ cls }: { cls: string }) {
  const capex = cls.startsWith('capex')
  return <span className={clsx('inline-flex h-5 items-center whitespace-nowrap border px-1.5 text-[10.5px] font-semibold', capex ? 'border-ioh-yellow/40 text-ioh-yellow' : 'border-[#5AA9E6]/40 text-[#8CC4F0]')}>{CAPEX_LABEL[cls] ?? cls}</span>
}

/** Failure class each intervention answers. */
const IV_CLASS: Record<string, FailureClass> = {
  sector_add: 'capacity',
  carrier_add: 'capacity',
  new_site: 'capacity',
  refarm: 'capacity',
  small_cell: 'capacity',
  '5g_add': 'capacity',
  power: 'power',
  solar: 'power',
  transport: 'transport',
  fibre: 'transport',
  ran_swap: 'ran_hardware',
  flood: 'environmental',
}

/** Interventions the Action Ladder offers per failure class (plan builder switcher). */
export const INTERVENTIONS_FOR: Record<FailureClass, string[]> = {
  capacity: ['sector_add', 'carrier_add', 'small_cell', '5g_add', 'new_site', 'refarm'],
  power: ['power', 'solar'],
  transport: ['transport', 'fibre'],
  ran_hardware: ['ran_swap'],
  environmental: ['flood', 'power'],
}

export function planClass(p: P1Plan, clusters: Map<string, Cluster>): FailureClass {
  const c = p.cluster_id ? clusters.get(p.cluster_id) : undefined
  if (c) return c.cls
  const iv = IV_CLASS[p.draft.intervention]
  if (iv) return iv
  const D = db()
  const i = D.siteIdx.get(p.draft.site_ids[0])
  return i !== undefined ? D.forecast[i].failure_class : 'capacity'
}

export function ClassTag({ cls }: { cls: FailureClass }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[cls].color }} />
      {CLASS_META[cls].label}
    </span>
  )
}

/** Target RFS against the predicted breach. */
export function fitOf(d: PlanDraft): { kind: 'fits' | 'bridge' | 'late' | 'none'; gap: number; text: string } {
  if (d.window_days === null) return { kind: 'none', gap: 0, text: 'No breach date' }
  const gap = d.rfs_days - d.window_days
  if (gap <= 0) return { kind: 'fits', gap, text: `Fits · ${-gap} d slack` }
  if (d.bridge) return { kind: 'bridge', gap, text: `Bridge · RFS ${gap} d after breach` }
  return { kind: 'late', gap, text: `RFS ${gap} d after breach` }
}

export function FitBadge({ d }: { d: PlanDraft }) {
  const f = fitOf(d)
  if (f.kind === 'fits') return <Badge tone="ok">Fits window</Badge>
  if (f.kind === 'bridge') return <Badge tone="warn">Bridge</Badge>
  if (f.kind === 'late') return <Badge tone="bad">Late</Badge>
  return <Badge>No breach</Badge>
}

export function handoffProgress(p: P1Plan) {
  const req = requiredHandoffs(p)
  const ack = req.filter((t) => p.handoffs[t]?.state === 'acknowledged').length
  const sent = req.filter((t) => p.handoffs[t]?.state === 'sent').length
  return { req, ack, sent, done: ack === req.length }
}

export function HandoffDots({ p }: { p: P1Plan }) {
  const req = requiredHandoffs(p)
  return (
    <span className="inline-flex items-center gap-[3px]" title={HANDOFF_TARGETS.map((t) => `${t}: ${req.includes(t) ? p.handoffs[t]?.state ?? 'not_sent' : 'not required'}`).join('\n')}>
      {HANDOFF_TARGETS.map((t) => {
        const st = req.includes(t) ? p.handoffs[t]?.state ?? 'not_sent' : 'na'
        return <span key={t} className={clsx('h-2 w-2', st === 'acknowledged' ? 'bg-ok' : st === 'sent' ? 'bg-ioh-yellow' : st === 'failed' ? 'bg-bad' : st === 'na' ? 'border border-dashed border-line2' : 'border border-line2 bg-line')} />
      })}
    </span>
  )
}

export const DECISION_SLA_H: Record<string, number> = { PLAN: 48, EXEC: 72, REGION: 24, OPS: 24, PROC: 48 }

export function hoursBetween(a: string, b: string) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 3600e3
}
export function nowTs() {
  return db().meta.now
}
export function ageText(h: number) {
  if (h < 1) return `${Math.max(0, Math.round(h * 60))} m`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} d`
}

export function canDecide(role: RoleCode, p: P1Plan) {
  return p.status === 'pending_approval' && (role === p.route.role || role === 'EXEC')
}
export const SUBMIT_ROLES: RoleCode[] = ['PLAN', 'OPS', 'REGION', 'EXEC']

export function approverOf(p: P1Plan) {
  return { name: roleDef(p.route.role as RoleCode).user, title: roleDef(p.route.role as RoleCode).title }
}

/** Day 0 of the plan's critical path (the day it was built). */
export function day0(d: PlanDraft) {
  return addDays(d.target_rfs, -d.rfs_days)
}

export function AgentTag({ id, name, f = 'live' }: { id: string; name: string; f?: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-faint">
      <Link to={`/phase1/agents/${id}`} className="hover:text-ink">
        {name}
      </Link>
      <Fresh f={f} />
    </span>
  )
}

// ---- Rebuilding a draft ---------------------------------------------------------------------

export function rebuildDraft(p: P1Plan, intervention: string): PlanDraft {
  const app = useApp.getState()
  const d = buildPlan({
    siteIds: p.draft.site_ids,
    intervention,
    sourceIncident: p.draft.source_incident,
    programs: app.programs,
    reservations: app.reservations,
    windowDays: p.draft.window_days,
    today: day0(p.draft),
    nextProgramId: p.id,
  })
  d.name = `${d.district_label} · ${intervention === 'sector_add' ? 'Capacity Relief — Sector Add' : INTERVENTIONS[intervention]?.label ?? intervention}`
  return d
}

export interface VendorOption {
  vendor: Vendor
  free_capacity: number
  inRegion: boolean
}

/** In-region vendors first (as the Vendor Allocation Agent ranks them), then cross-region with mobilisation. */
export function vendorOptions(d: PlanDraft, programs: Program[]): VendorOption[] {
  return db()
    .vendors.map((v) => ({ vendor: v, free_capacity: v.capacity_sites_per_month - vendorLoad(programs, v.vendor_id), inRegion: v.regions.includes(d.region) }))
    .sort((a, b) => Number(b.inRegion) - Number(a.inRegion) || b.free_capacity * b.vendor.sla_pct - a.free_capacity * a.vendor.sla_pct)
}

export function withVendor(d: PlanDraft, o: VendorOption, programs: Program[]): PlanDraft {
  const alts = vendorOptions(d, programs).filter((x) => x.inRegion && x.vendor.vendor_id !== o.vendor.vendor_id)
  return {
    ...d,
    vendor: { vendor: o.vendor, free_capacity: o.free_capacity, alternatives: alts.map((x) => ({ vendor: x.vendor, free_capacity: x.free_capacity })) },
    critical_path: d.critical_path.map((x) => (x.lane === 'Vendor' ? { ...x, note: o.vendor.name } : x)),
  }
}

// ---- Commercial references (placeholders until ERP read is live) ----------------------------

export const contractId = (v: Vendor) => `FA-${v.vendor_id}-2025-41`
/** Remaining framework ceiling: placeholder derived from vendor capacity until the ERP contract read lands. */
export const ceilingRemaining = (v: Vendor) => v.capacity_sites_per_month * 450e6
export const costCentre = (d: PlanDraft) => `CC-NW-${d.region.replace(/\s+/g, '').toUpperCase()}`
export const wbs = (p: P1Plan) => `WBS-${p.id}`
export const matCode = (sku: string) => `MAT-${sku}`

/** Delivery warehouse: the nearest warehouse in the plan's region. */
export function deliveryWarehouse(d: PlanDraft) {
  const D = db()
  const sites = d.site_ids.map((id) => D.sites[D.siteIdx.get(id)!])
  const cx = sites.reduce((s, x) => s + x.lon, 0) / sites.length
  const cy = sites.reduce((s, x) => s + x.lat, 0) / sites.length
  const whs = [...D.meta.warehouses].sort((a, b) => Math.hypot(a.lon - cx, a.lat - cy) - Math.hypot(b.lon - cx, b.lat - cy))
  return whs.find((w) => w.region === d.region) ?? whs[0]
}

// ---- Tower loading (Tower Company Coordination Agent) ----------------------------------------

/** Spec-sheet weights (kg) of tower-mounted equipment, incl. brackets. */
const TOWER_KG: Record<string, number> = {
  'ANT-MB-4T4R': 28,
  'ANT-MB-8T8R': 40,
  'AAU-64T-N21': 47,
  'RRU-4T-L18': 24,
  'RRU-4T-L21': 24,
  'RRU-2T-L09': 18,
  'MNT-KIT': 14,
  'CPRI-KIT': 3,
  'DC-CBL-KIT': 6,
  'MW-ODU-E': 7,
  'MW-ODU-18': 6,
  'MW-DISH-1.2': 45,
  'SC-OUT-4G': 22,
}

export function towerLoad(d: PlanDraft) {
  const n = d.site_ids.length
  const items = d.boq.filter((b) => TOWER_KG[b.sku]).map((b) => ({ sku: b.sku, description: b.description, perSite: b.qty / n, kg: TOWER_KG[b.sku] * (b.qty / n) }))
  return { items, kgPerSite: Math.round(items.reduce((s, x) => s + x.kg, 0)) }
}

export function towercoRequired(p: P1Plan) {
  return requiredHandoffs(p).includes('HO-TOWERCO')
}

export function sitesByTowerco(d: PlanDraft) {
  const D = db()
  const m = new Map<string, string[]>()
  for (const id of d.site_ids) {
    const tc = D.sites[D.siteIdx.get(id)!].tower_company
    if (!d.tower_companies.includes(tc)) continue
    m.set(tc, [...(m.get(tc) ?? []), id])
  }
  return m
}

// ---- Downloads ------------------------------------------------------------------------------

export function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(';') : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n')
}

/** Hours from the plan being drafted off the forecast to its approval (history timestamps). */
export function predictionToApprovalH(p: P1Plan): number | null {
  const appr = p.history.find((h) => h.what === 'Approved' || h.what.startsWith('Zero cost') || h.what.startsWith('OpEx below')) ?? (p.decided && (p.status === 'approved' || p.status === 'handed_off') ? { ts: p.decided } : null)
  if (!appr) return null
  return hoursBetween(p.history[0]?.ts ?? p.created, appr.ts)
}


/** Smart CapEx call for the plan's sites (planner overrides win) vs the plan's intervention class. */
export function smartCapexCheck(p: P1Plan, cls: FailureClass, moves: Record<string, { to: 'capex' | 'noncapex' }>) {
  const def = INTERVENTIONS[CLASS_META[cls].defaultIntervention]?.class.startsWith('capex') ? 'capex' : 'noncapex'
  const votes = p.draft.site_ids.map((id) => moves[id]?.to ?? def)
  const capexVotes = votes.filter((v) => v === 'capex').length
  const smart: 'capex' | 'noncapex' = capexVotes * 2 >= votes.length ? 'capex' : 'noncapex'
  const plan: 'capex' | 'noncapex' = p.draft.capex_class.startsWith('capex') ? 'capex' : 'noncapex'
  return { smart, plan, agree: smart === plan, overridden: p.draft.site_ids.filter((id) => moves[id]).length }
}

/** Last decision in the plan's history (approve / reject / defer / auto). */
export function lastDecision(p: P1Plan) {
  const h = [...p.history].reverse().find((x) => ['Approved', 'Rejected', 'Deferred'].includes(x.what) || (x.role === 'system' && /auto-approved/i.test(x.what)))
  if (!h) return null
  const kind = h.what === 'Rejected' ? 'rejected' : h.what === 'Deferred' ? 'deferred' : 'approved'
  return { ...h, kind: kind as 'approved' | 'rejected' | 'deferred', auto: h.role === 'system' }
}
