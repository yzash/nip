import { db } from '@/data/db'
import type { BoqLine, Program, PurchaseOrder, Stage, Vendor } from '@/data/types'
import { addDays, daysBetween } from '@/lib/format'
import { PIPELINE_STAGES } from '@/lib/metrics'
import { INTERVENTIONS, vendorLoad } from '@/lib/plan'

// Program Console helpers (PRD §6 M5, §8 nine-stage chain, §10 cycle-time rules).

export const STAGES: Stage[] = ['Decision', 'BOQ', 'PO', 'Vendor allocation', 'Material dispatch', 'Installation', 'Integration', 'RFS', 'Validation']
export const STAGE_SHORT: Record<Stage, string> = {
  Decision: 'Decision',
  BOQ: 'BOQ',
  PO: 'PO & stock',
  'Vendor allocation': 'Vendor',
  'Material dispatch': 'Dispatch',
  Installation: 'Install',
  Integration: 'Integrate',
  RFS: 'RFS',
  Validation: 'Validate',
}
export const STAGE_NO: Record<Stage, string> = {
  Decision: '3',
  BOQ: '4',
  PO: '5',
  'Vendor allocation': '6',
  'Material dispatch': '7a',
  Installation: '7b',
  Integration: '7c',
  RFS: '8',
  Validation: '9',
}
export const PARALLEL: Stage[] = ['BOQ', 'PO', 'Vendor allocation']

export function stageIdx(s: Stage): number {
  return STAGES.indexOf(s)
}

export type StageGroup = 'decision' | 'boq' | 'pipeline' | 'rfs'
export const STAGE_GROUPS: { id: StageGroup; label: string }[] = [
  { id: 'decision', label: 'Decision gate' },
  { id: 'boq', label: 'BOQ' },
  { id: 'pipeline', label: 'Deployment pipeline' },
  { id: 'rfs', label: 'RFS & validation' },
]
export function stageGroup(p: Program): StageGroup {
  if (p.stage === 'Decision') return 'decision'
  if (p.stage === 'BOQ') return 'boq'
  if (PIPELINE_STAGES.has(p.stage)) return 'pipeline'
  return 'rfs'
}
export function inPipeline(p: Program): boolean {
  return PIPELINE_STAGES.has(p.stage)
}

export const HEALTH_LABEL: Record<Program['health'], string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  late: 'Late',
}
export const HEALTH_TONE: Record<Program['health'], 'ok' | 'warn' | 'bad'> = {
  on_track: 'ok',
  at_risk: 'warn',
  late: 'bad',
}

export function slipDays(p: Program): number {
  return daysBetween(p.target_rfs, p.forecast_rfs)
}

export function vendorById(id: string): Vendor | undefined {
  return db().vendors.find((v) => v.vendor_id === id)
}

export function towerOverdue(p: Program): boolean {
  return p.tower_company_clock?.status === 'overdue'
}

/** Programs that sit in the Head of Deployment's pipeline and carry a vendor SLA risk. */
export function deployCounts(programs: Program[]) {
  const pipe = programs.filter(inPipeline)
  return {
    pipeline: pipe.length,
    vendorRisk: pipe.filter((p) => p.vendor_sla_risk).length,
    towerWait: pipe.filter(towerOverdue).length,
  }
}

// ---- Stage SLA (per-stage clock) -------------------------------------------------------
// meta.legacy_stage_weeks and meta.target_stage_days use chain-level keys; Stage 7 (build and
// integrate) is split into dispatch / install / integrate using the observed history mix.
const BUILD_SPLIT = {
  'Material dispatch': 0.2,
  Installation: 0.65,
  Integration: 0.15,
} as const
export function stageSlaDays(p: Program, s: Stage): number {
  const M = db().meta
  const nicc = p.managed_by === 'nicc'
  const src = nicc ? M.target_stage_days : Object.fromEntries(Object.entries(M.legacy_stage_weeks).map(([k, v]) => [k, v * 7]))
  switch (s) {
    case 'Decision':
      return src['Decision'] ?? 0
    case 'BOQ':
      return src['BOQ'] ?? 0
    case 'PO':
      return src['PO and stock'] ?? 0
    case 'Vendor allocation':
      return src['Vendor allocation'] ?? 0
    case 'Material dispatch':
    case 'Integration':
      return Math.max(1, Math.round((src['Build and integrate'] ?? 0) * BUILD_SPLIT[s]))
    case 'Installation': {
      if (nicc) return INTERVENTIONS[p.intervention]?.installDays ?? Math.round((src['Build and integrate'] ?? 0) * BUILD_SPLIT.Installation)
      return Math.round((src['Build and integrate'] ?? 0) * BUILD_SPLIT.Installation)
    }
    case 'RFS':
      return src['RFS acceptance'] ?? 0
    case 'Validation':
      return 90
  }
}

// ---- Planned timeline for stages not yet started ---------------------------------------
export interface TimelineRow {
  stage: Stage
  start: string
  end: string
  state: 'done' | 'current' | 'planned'
}
export function timeline(p: Program, today: string): TimelineRow[] {
  const hist = new Map(p.stage_history.map((h) => [h.stage, h]))
  const rows: TimelineRow[] = []
  for (const h of p.stage_history) {
    rows.push({
      stage: h.stage,
      start: h.start,
      end: h.end ?? (daysBetween(h.start, today) > 0 ? today : addDays(h.start, 1)),
      state: h.end ? 'done' : 'current',
    })
  }
  // Future stages spread between the latest known end and forecast RFS, weighted by stage SLA.
  const future = STAGES.filter((s) => !hist.has(s) && s !== 'Validation')
  let cursor = rows.reduce((m, r) => (r.end > m ? r.end : m), p.start)
  if (cursor < today) cursor = today
  const rfsEnd = p.forecast_rfs > cursor ? p.forecast_rfs : addDays(cursor, 2)
  const weights = future.map((s) => {
    // Parallel lanes of NICC programs run alongside the current stage: give them no sequential weight.
    if (p.managed_by === 'nicc' && PARALLEL.includes(s) && PARALLEL.includes(p.stage)) return 0
    return stageSlaDays(p, s)
  })
  const wsum = weights.reduce((a, b) => a + b, 0) || 1
  const span = daysBetween(cursor, rfsEnd)
  let c = cursor
  future.forEach((s, k) => {
    if (weights[k] === 0) {
      const cur = hist.get(p.stage)
      const st = cur?.start ?? cursor
      rows.push({
        stage: s,
        start: st,
        end: addDays(st, Math.max(1, stageSlaDays(p, s))),
        state: 'planned',
      })
      return
    }
    const d = Math.max(1, Math.round((span * weights[k]) / wsum))
    const end = s === 'RFS' ? rfsEnd : addDays(c, d)
    rows.push({ stage: s, start: c, end, state: 'planned' })
    c = end
  })
  if (!hist.has('Validation'))
    rows.push({
      stage: 'Validation',
      start: rfsEnd,
      end: addDays(rfsEnd, 90),
      state: 'planned',
    })
  return rows.sort((a, b) => stageIdx(a.stage) - stageIdx(b.stage))
}

// ---- Cycle time ----------------------------------------------------------------------
export function rfsReachedDate(p: Program): string | null {
  const r = p.stage_history.find((h) => h.stage === 'RFS')
  if (!r) return null
  return r.end ?? r.start
}
/** Decision-to-RFS in weeks: actual where RFS was reached, otherwise forecast. */
export function cycleWeeks(p: Program): { weeks: number; actual: boolean } {
  const r = rfsReachedDate(p)
  return r ? { weeks: daysBetween(p.start, r) / 7, actual: true } : { weeks: daysBetween(p.start, p.forecast_rfs) / 7, actual: false }
}
/** Comparable scope for cycle time: past the Decision gate, excluding major CapEx (new sites, fibre builds). */
export function cycleComparable(p: Program): boolean {
  return p.stage !== 'Decision' && p.capex_class !== 'capex_major'
}
export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
export function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0
}
export function cycleStats(programs: Program[]) {
  const by = (mb: Program['managed_by']) => programs.filter((p) => p.managed_by === mb && cycleComparable(p)).map((p) => cycleWeeks(p).weeks)
  const legacy = by('legacy')
  const nicc = by('nicc')
  return {
    legacy: median(legacy),
    nicc: median(nicc),
    legacyMean: mean(legacy),
    niccMean: mean(nicc),
    nLegacy: legacy.length,
    nNicc: nicc.length,
  }
}
export function boqToPoDays(p: Program): number | null {
  const b = p.stage_history.find((h) => h.stage === 'BOQ')
  const po = p.stage_history.find((h) => h.stage === 'PO')
  if (!b || !po?.end) return null
  return daysBetween(b.start, po.end)
}

// ---- BOQ and POs -----------------------------------------------------------------------
export interface BoqSku {
  sku: string
  description: string
  category: string
  qty: number
  unit_cost_idr: number
  price_book_idr: number
  total_idr: number
  variance_pct: number
  sites: number
}
export function programBoq(pid: string, extra: BoqLine[]): BoqSku[] {
  const D = db()
  const skuMeta = new Map(D.meta.skus.map((s) => [s.sku, s]))
  const lines = [...D.boq.filter((b) => b.program_id === pid), ...extra.filter((b) => b.program_id === pid)]
  const m = new Map<string, BoqSku & { book: number; siteSet: Set<string> }>()
  for (const b of lines) {
    let r = m.get(b.sku)
    if (!r) {
      r = {
        sku: b.sku,
        description: b.description,
        category: skuMeta.get(b.sku)?.category ?? (b.sku.startsWith('SVC') ? 'Service' : '—'),
        qty: 0,
        unit_cost_idr: 0,
        price_book_idr: 0,
        total_idr: 0,
        variance_pct: 0,
        sites: 0,
        book: 0,
        siteSet: new Set(),
      }
      m.set(b.sku, r)
    }
    r.qty += b.qty
    r.total_idr += b.qty * b.unit_cost_idr
    r.book += b.qty * b.price_book_idr
    r.siteSet.add(b.site_id)
  }
  return [...m.values()]
    .map((r) => ({
      sku: r.sku,
      description: r.description,
      category: r.category,
      qty: Math.round(r.qty * 100) / 100,
      unit_cost_idr: r.qty ? r.total_idr / r.qty : 0,
      price_book_idr: r.qty ? r.book / r.qty : 0,
      total_idr: r.total_idr,
      variance_pct: r.book ? ((r.total_idr - r.book) / r.book) * 100 : 0,
      sites: r.siteSet.size,
    }))
    .sort((a, b) => Number(a.category === 'Service') - Number(b.category === 'Service') || b.total_idr - a.total_idr)
}

export function pendingPos(pos: PurchaseOrder[], pid?: string): PurchaseOrder[] {
  return pos.filter((x) => x.status === 'pending_release' && (!pid || x.program_id === pid))
}

// ---- Vendor lane ------------------------------------------------------------------------
export interface VendorRow {
  vendor: Vendor
  inflight: Program[]
  committed: Program[]
  sitesInflight: number
  load: number
  committedLoad: number
  free: number
  atRisk: Program[]
  rfsAcceptance: number | null
  rfsSites: number
}
export function vendorRows(programs: Program[]): VendorRow[] {
  const D = db()
  const progVendor = new Map(programs.map((p) => [p.program_id, p.vendor_id]))
  return D.vendors.map((v) => {
    const inflight = programs.filter((p) => p.vendor_id === v.vendor_id && inPipeline(p))
    const committed = programs.filter((p) => p.vendor_id === v.vendor_id && p.stage === 'BOQ')
    const load = vendorLoad(programs, v.vendor_id)
    const committedLoad = Math.round(committed.reduce((s, p) => s + p.sites_planned, 0) / 2)
    // First-pass RFS acceptance: share of RFS'd sites whose post-RFS availability did not worsen
    // (validation set, last 180 days).
    const rows = D.validation.filter((r) => r.kpi === 'availability' && progVendor.get(r.program_id) === v.vendor_id)
    const ok = rows.filter((r) => r.outcome !== 'worse').length
    return {
      vendor: v,
      inflight,
      committed,
      sitesInflight: inflight.reduce((s, p) => s + (p.sites_planned - p.sites_rfs), 0),
      load,
      committedLoad,
      free: v.capacity_sites_per_month - load,
      atRisk: programs.filter((p) => p.vendor_id === v.vendor_id && p.vendor_sla_risk),
      rfsAcceptance: rows.length ? (ok / rows.length) * 100 : null,
      rfsSites: rows.length,
    }
  })
}

export interface VendorCandidate {
  vendor: Vendor
  free: number
  inRegion: boolean
  mobilisationDays: number
  need: number
}
/** Candidate vendors for a reallocation: in-region first, then cross-region mobilisation. */
export function reallocationCandidates(p: Program, programs: Program[]): VendorCandidate[] {
  const need = Math.max(1, Math.ceil((p.sites_planned - p.sites_rfs) / 2))
  return db()
    .vendors.filter((v) => v.vendor_id !== p.vendor_id)
    .map((v) => {
      const inRegion = v.regions.includes(p.region)
      return {
        vendor: v,
        free: v.capacity_sites_per_month - vendorLoad(programs, v.vendor_id),
        inRegion,
        mobilisationDays: inRegion ? 0 : 7,
        need,
      }
    })
    .filter((c) => c.free > 0)
    .sort((a, b) => Number(b.inRegion) - Number(a.inRegion) || b.free * b.vendor.sla_pct - a.free * a.vendor.sla_pct)
    .filter((c, i, arr) => c.inRegion || arr.slice(0, i).filter((x) => !x.inRegion).length < 3)
}

// ---- Stock -----------------------------------------------------------------------------
export function freeStockBySku(reservations: { warehouse_id: string; sku: string; qty: number }[]) {
  const D = db()
  const out = new Map<
    string,
    {
      free: number
      byWh: { warehouse: string; warehouse_id: string; free: number }[]
      lead_days: number
      unit_cost_idr: number
      description: string
      reorder: number
    }
  >()
  for (const w of D.stock) {
    const res = reservations.filter((r) => r.warehouse_id === w.warehouse_id && r.sku === w.sku).reduce((s, r) => s + r.qty, 0)
    const f = Math.max(0, w.on_hand - w.reserved - res)
    let r = out.get(w.sku)
    if (!r) {
      r = {
        free: 0,
        byWh: [],
        lead_days: w.lead_days,
        unit_cost_idr: w.unit_cost_idr,
        description: w.description,
        reorder: 0,
      }
      out.set(w.sku, r)
    }
    r.free += f
    r.reorder += w.reorder_point
    r.byWh.push({
      warehouse: w.warehouse,
      warehouse_id: w.warehouse_id,
      free: f,
    })
  }
  return out
}

export function weeksTo(d: string, today: string): number {
  return daysBetween(today, d) / 7
}
