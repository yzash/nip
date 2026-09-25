import { useMemo } from 'react'
import { db } from '@/data/db'
import type { ActionOption, FailureClass, Incident, Program, PurchaseOrder, Region, Role } from '@/data/types'
import { daysBetween } from '@/lib/format'
import { crossingWeek, isOpen, siteInScope } from '@/lib/metrics'
import { buildPlan, INTERVENTIONS, type PlanDraft } from '@/lib/plan'
import { nextProgramId, todayIso, useApp, usePolicy, useRole, useScope } from '@/store/app'

// ---- Constants -------------------------------------------------------------------------
export const CLASSES: FailureClass[] = ['power', 'transport', 'ran_hardware', 'capacity', 'environmental']
export const CLASS_CHIP_ORDER: FailureClass[] = ['capacity', 'power', 'transport', 'ran_hardware', 'environmental']
export const REGIONS: Region[] = ['Jabodetabek', 'Java', 'Sumatra', 'Kalimantan', 'Sulawesi', 'Bali Nusra', 'Papua Maluku']

export const DEFAULT_INTERVENTION: Record<FailureClass, string> = {
  capacity: 'sector_add',
  power: 'power',
  transport: 'transport',
  ran_hardware: 'ran_swap',
  environmental: 'flood',
}
/** Fallback lead times (days) when a site has no incident option. */
const DEFAULT_LEAD: Record<FailureClass, number> = { capacity: 35, power: 7, transport: 21, ran_hardware: 28, environmental: 21 }

export const AT_RISK_SHARE = 0.3

// ---- Chart styling (PRD §11) -------------------------------------------------------------
export const AXIS = { stroke: '#2A2F3A', tick: { fill: '#6B7280', fontSize: 11 }, tickLine: false as const }
export const GRID = '#2A2F3A'
export const TOOLTIP = {
  contentStyle: { background: '#171A21', border: '1px solid #353B48', borderRadius: 0, fontSize: 12, color: '#F2F3F5' },
  labelStyle: { color: '#A3AAB8', marginBottom: 4 },
  itemStyle: { padding: 0 },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
}

// ---- Forecast rows ----------------------------------------------------------------------
export interface FRow {
  i: number
  site_id: string
  name: string
  district: string
  region: Region
  cls: FailureClass
  cw: number
  failDate: string
  pAt: number
  p8: number
  exposure: number
  exposureFromIncident: boolean
  incident: Incident | null
  rec: ActionOption | null
  recName: string
  lead: number
  fits: boolean
  program: Program | null
  rfsLate: boolean
  /** RFS after failure, but a NICC plan put a zero-CapEx bridge (refarm) in place until RFS. */
  bridged: boolean
  covered: boolean
  trend: number | null
}

export function activeProgram(p: Program): boolean {
  return p.stage !== 'Validation' && !p.complete
}

function pickIncident(list: Incident[] | undefined, cls: FailureClass): Incident | null {
  if (!list?.length) return null
  return list.find((x) => x.class === cls) ?? list[0]
}

export function computeRows(incidents: Incident[], programs: Program[], thr: number): FRow[] {
  const D = db()
  const incBySite = new Map<string, Incident[]>()
  for (const inc of incidents) {
    if (!isOpen(inc)) continue
    for (const s of inc.site_ids) {
      const a = incBySite.get(s)
      if (a) a.push(inc)
      else incBySite.set(s, [inc])
    }
  }
  const progBySite = new Map<string, Program>()
  for (const p of programs) {
    if (!activeProgram(p)) continue
    for (const s of p.site_ids) {
      const cur = progBySite.get(s)
      if (!cur || p.forecast_rfs < cur.forecast_rfs) progBySite.set(s, p)
    }
  }
  const rows: FRow[] = []
  for (let i = 0; i < D.forecast.length; i++) {
    const fc = D.forecast[i]
    if (fc.failure_prob[7] < thr) continue
    const s = D.sites[i]
    const cls = fc.failure_class
    const cw = Math.max(1, crossingWeek(i, thr))
    const incident = pickIncident(incBySite.get(s.site_id), cls)
    const rec = incident ? (D.optionsByIncident.get(incident.incident_id) ?? []).find((o) => o.rank === (incident.chosen_rank ?? incident.recommended_rank)) ?? null : null
    const recName = rec?.name ?? INTERVENTIONS[DEFAULT_INTERVENTION[cls]].label
    const lead = rec?.lead_days ?? DEFAULT_LEAD[cls]
    const program = progBySite.get(s.site_id) ?? null
    const failDate = D.weekEndDates[cw - 1]
    const m = fc.top_factors.map((f) => /([+−-]?\d+(?:\.\d+)?) pts\/wk/.exec(f.factor)).find(Boolean)
    rows.push({
      i,
      site_id: s.site_id,
      name: s.name,
      district: D.distById[s.district_id]?.name ?? s.district_id,
      region: s.region,
      cls,
      cw,
      failDate,
      pAt: fc.failure_prob[cw - 1],
      p8: fc.failure_prob[7],
      exposure: incident ? incident.exposure_idr / incident.site_ids.length : D.revenue.latest[i] * AT_RISK_SHARE,
      exposureFromIncident: !!incident,
      incident,
      rec,
      recName,
      lead,
      fits: lead <= cw * 7,
      program,
      rfsLate: !!program && program.forecast_rfs > failDate && !(program.created_in_session && cls === 'capacity'),
      bridged: !!program && program.forecast_rfs > failDate && !!program.created_in_session && cls === 'capacity',
      covered: !!program,
      trend: m ? Number(m[1].replace('−', '-')) : null,
    })
  }
  rows.sort((a, b) => a.cw - b.cw || b.p8 - a.p8)
  return rows
}

/** All predicted rows (national) + the subset in the viewer's scope. Memoised on store state. */
export function useForecast() {
  const incidents = useApp((s) => s.incidents)
  const programs = useApp((s) => s.programs)
  const policy = usePolicy()
  const role = useRole()
  const scope = useScope()
  const thr = policy.red_min_probability
  const all = useMemo(() => computeRows(incidents, programs, thr), [incidents, programs, thr])
  const rows = useMemo(() => filterScope(all, role, scope), [all, role, scope])
  return { all, rows, thr }
}

function filterScope(all: FRow[], role: Role, scope: string): FRow[] {
  if (role.scope_type === 'national') return all
  const D = db()
  return all.filter((r) => siteInScope(D.sites[r.i], role, scope))
}

export function summarise(rows: FRow[]) {
  const covered = rows.filter((r) => r.covered).length
  return {
    n: rows.length,
    covered,
    not: rows.length - covered,
    exposureNot: rows.filter((r) => !r.covered).reduce((s, r) => s + r.exposure, 0),
    exposure: rows.reduce((s, r) => s + r.exposure, 0),
    bridge: rows.filter((r) => !r.fits).length,
    late: rows.filter((r) => r.rfsLate).length,
  }
}

export function clusters(rows: FRow[]) {
  const m = new Map<string, FRow[]>()
  for (const r of rows) {
    const k = r.incident?.incident_id ?? r.site_id
    const a = m.get(k)
    if (a) a.push(r)
    else m.set(k, [r])
  }
  return [...m.values()].sort((a, b) => b.length - a.length || b.reduce((s, r) => s + r.exposure, 0) - a.reduce((s, r) => s + r.exposure, 0))
}

// ---- Plan construction ------------------------------------------------------------------
export function planForSites(siteIds: string[], rows: FRow[], opts: { intervention?: string; sourceIncident?: string | null; windowDays?: number | null } = {}): PlanDraft {
  const st = useApp.getState()
  const sel = rows.filter((r) => siteIds.includes(r.site_id))
  const clsCount = new Map<FailureClass, number>()
  for (const r of sel) clsCount.set(r.cls, (clsCount.get(r.cls) ?? 0) + 1)
  const major = [...clsCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'capacity'
  let source = opts.sourceIncident
  if (source === undefined) {
    const ids = new Set(sel.map((r) => r.incident?.incident_id ?? null))
    const only = ids.size === 1 ? [...ids][0] : null
    source = only && sel[0].incident && isOpen(sel[0].incident) ? only : null
  }
  const minCw = sel.length ? Math.min(...sel.map((r) => r.cw)) : null
  return buildPlan({
    siteIds,
    intervention: opts.intervention ?? DEFAULT_INTERVENTION[major],
    sourceIncident: source,
    programs: st.programs,
    reservations: st.reservations,
    windowDays: opts.windowDays !== undefined ? opts.windowDays : minCw !== null ? minCw * 7 : null,
    today: todayIso(),
    nextProgramId: nextProgramId(st.programs),
  })
}

export function bekasiPlan(): PlanDraft {
  const D = db()
  const st = useApp.getState()
  const id = D.meta.story_incidents.bekasi_capacity
  const inc = st.incidents.find((x) => x.incident_id === id) ?? D.incidents.find((x) => x.incident_id === id)!
  return buildPlan({
    siteIds: inc.site_ids,
    intervention: 'sector_add',
    sourceIncident: id,
    programs: st.programs,
    reservations: st.reservations,
    windowDays: inc.days_to_breach ?? 23,
    today: todayIso(),
    nextProgramId: nextProgramId(st.programs),
  })
}

// ---- Smart CapEx split (D-5) ----------------------------------------------------------------
export type Bucket = 'capex' | 'noncapex'
export interface SplitRow {
  row: FRow
  rec: Bucket
  recLabel: string
  intervention: string
  rationale: string
  cost: number
  final: Bucket
  moved: boolean
  reason?: string
}

function linkUtil(siteId: string, row: FRow): { util: number; link: string | null } {
  const D = db()
  let best = { util: 0, link: null as string | null }
  for (const l of D.links) if ((l.from_site === siteId || l.to_site === siteId) && l.util_pct > best.util) best = { util: l.util_pct, link: l.link_id }
  const fc = D.forecast[row.i]
  const m = fc.top_factors.map((f) => /Backhaul peak utilisation (\d+(?:\.\d+)?)%/.exec(f.factor)).find(Boolean)
  const peak = m ? Number(m[1]) : 0
  return peak > best.util ? { util: peak, link: null } : best
}

function unitAge(i: number): number {
  const D = db()
  const fc = D.forecast[i]
  const m = fc.top_factors.map((f) => /Unit age (\d+(?:\.\d+)?) yrs/.exec(f.factor)).find(Boolean)
  if (m) return Number(m[1])
  return daysBetween(D.sites[i].on_air_date, todayIso()) / 365.25
}

/** Deterministic Smart CapEx Agent rule set (prototype stand-in for the D-5 batch output). */
export function classify(row: FRow): Omit<SplitRow, 'final' | 'moved' | 'reason'> {
  const D = db()
  const cost = D.meta.per_site_cost_idr
  const s = D.sites[row.i]
  const optCost = row.rec && (row.rec.class === 'noncapex_opex' || row.rec.class === 'noncapex_zero') && row.incident ? row.rec.cost_idr / row.incident.site_ids.length : null
  switch (row.cls) {
    case 'capacity': {
      const t = row.trend ?? 0.3
      if (row.cw <= 5) {
        const sector = t >= 1 || row.cw <= 3
        return {
          row,
          rec: 'capex',
          intervention: sector ? 'sector_add' : 'carrier_add',
          recLabel: sector ? 'CapEx · sector add' : 'CapEx · carrier add',
          rationale: `PRB +${t.toFixed(1)} pts/wk, saturates W+${row.cw}; refarming buys < 3 wks`,
          cost: sector ? cost.sector_add : cost.carrier_add,
        }
      }
      return { row, rec: 'noncapex', intervention: 'refarm', recLabel: 'Non-CapEx · refarm', rationale: `PRB +${t.toFixed(1)} pts/wk, saturates W+${row.cw}; refarming (~3 wks) covers the window`, cost: cost.refarm }
    }
    case 'power': {
      const bh = s.energy.battery_health_pct
      if (bh < 55)
        return { row, rec: 'capex', intervention: 'solar', recLabel: 'CapEx · Li-ion / solar retrofit', rationale: `Battery health ${bh}% < 55%; ${s.energy.grid_outages_30d} grid outages in 30 d, swap alone lasts < 12 mo`, cost: cost.solar }
      return { row, rec: 'noncapex', intervention: 'power', recLabel: 'Non-CapEx · battery swap', rationale: `Battery health ${bh}% (≥ 55%); like-for-like swap from stock restores autonomy`, cost: optCost ?? cost.power }
    }
    case 'transport': {
      const chain = !!row.incident?.link_id && row.incident.site_ids.length > 1
      const lu = linkUtil(row.site_id, row)
      if (chain || lu.util > 90)
        return {
          row,
          rec: 'capex',
          intervention: 'transport',
          recLabel: 'CapEx · MW capacity upgrade',
          rationale: chain ? `Part of ${row.incident!.site_ids.length}-site chain on ${row.incident!.link_id}; reroute headroom < 4 wks` : `Link util ${lu.util.toFixed(0)}% > 90%${lu.link ? ` on ${lu.link}` : ''}; reroute has no headroom`,
          cost: cost.transport,
        }
      return { row, rec: 'noncapex', intervention: 'reroute', recLabel: 'Non-CapEx · reroute', rationale: `Peak util ${lu.util.toFixed(0)}% ≤ 90%; alternate path has headroom`, cost: optCost ?? 15_000_000 }
    }
    case 'ran_hardware': {
      const age = unitAge(row.i)
      if (age >= 21)
        return { row, rec: 'capex', intervention: 'ran_swap', recLabel: 'CapEx · modernisation swap', rationale: `${s.vendor} unit age ${age.toFixed(1)} yrs, past end-of-support; spares pool thin`, cost: cost.ran_swap }
      return { row, rec: 'noncapex', intervention: 'spares', recLabel: 'OpEx · swap from spares', rationale: `${s.vendor} unit age ${age.toFixed(1)} yrs, spares in pool; swap restores MTBF`, cost: optCost ?? 30_000_000 }
    }
    case 'environmental':
      return { row, rec: 'noncapex', intervention: 'visit', recLabel: 'Non-CapEx · pre-emptive visit', rationale: `${s.coastal ? 'Coastal site, ' : ''}flood / heat exposure; drainage, sandbags and fuel top-up`, cost: optCost ?? 25_000_000 }
  }
}

// ---- Readiness -----------------------------------------------------------------------------
export interface StockRow {
  warehouse_id: string
  warehouse: string
  sku: string
  description: string
  category: string
  on_hand: number
  reserved: number
  session: number
  free: number
  reorder_point: number
  lead_days: number
  below: boolean
}

export function stockRows(reservations: { warehouse_id: string; sku: string; qty: number }[]): StockRow[] {
  const D = db()
  return D.stock.map((w) => {
    const session = reservations.filter((r) => r.warehouse_id === w.warehouse_id && r.sku === w.sku).reduce((s, r) => s + r.qty, 0)
    const free = w.on_hand - w.reserved - session
    return {
      warehouse_id: w.warehouse_id,
      warehouse: w.warehouse,
      sku: w.sku,
      description: w.description,
      category: w.category,
      on_hand: w.on_hand,
      reserved: w.reserved,
      session,
      free,
      reorder_point: w.reorder_point,
      lead_days: w.lead_days,
      below: free < w.reorder_point,
    }
  })
}

export const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8]
export const PRE_RFS_STAGES = new Set(['Decision', 'BOQ', 'PO', 'Vendor allocation', 'Material dispatch'])

export interface DemandRow {
  sku: string
  description: string
  category: string
  pipeline: number[]
  predicted: number[]
  total: number
  free: number
}

/** BOQ demand forecast W+1..W+8 by SKU: pipeline programs + predicted demand for uncovered sites. */
export function demandForecast(programs: Program[], boqExtra: { program_id: string; sku: string; qty: number }[], uncovered: FRow[], free: Map<string, number>): DemandRow[] {
  const D = db()
  const today = todayIso()
  const skuMeta = new Map(D.meta.skus.map((s) => [s.sku, s]))
  const out = new Map<string, DemandRow>()
  const get = (sku: string) => {
    let r = out.get(sku)
    if (!r) {
      const m = skuMeta.get(sku)
      r = { sku, description: m?.description ?? sku, category: m?.category ?? '', pipeline: WEEKS.map(() => 0), predicted: WEEKS.map(() => 0), total: 0, free: free.get(sku) ?? 0 }
      out.set(sku, r)
    }
    return r
  }
  const hardware = (sku: string) => !sku.startsWith('SVC') && skuMeta.get(sku)?.category !== 'Service' && sku !== 'TWR-NEW-42'
  const pipe = programs.filter((p) => activeProgram(p) && PRE_RFS_STAGES.has(p.stage))
  const pipeIds = new Set(pipe.map((p) => p.program_id))
  const qtyBy = new Map<string, Map<string, number>>()
  for (const b of [...D.boq, ...boqExtra]) {
    if (!pipeIds.has(b.program_id) || !hardware(b.sku)) continue
    let m = qtyBy.get(b.program_id)
    if (!m) qtyBy.set(b.program_id, (m = new Map()))
    m.set(b.sku, (m.get(b.sku) ?? 0) + b.qty)
  }
  for (const p of pipe) {
    const m = qtyBy.get(p.program_id)
    if (!m) continue
    const weeks = Math.max(1, Math.ceil(daysBetween(today, p.forecast_rfs) / 7))
    const n = Math.min(8, weeks)
    for (const [sku, q] of m) {
      const r = get(sku)
      const per = q / weeks
      for (let k = 0; k < n; k++) r.pipeline[k] += per
    }
  }
  // Predicted demand: class default template, needed ahead of the crossing week.
  for (const row of uncovered) {
    const tmpl = D.meta.boq_templates[INTERVENTIONS[DEFAULT_INTERVENTION[row.cls]].template] ?? []
    const wk = Math.max(1, row.cw - 2)
    for (const [sku, q] of tmpl) {
      if (!hardware(sku) || !q) continue
      get(sku).predicted[wk - 1] += q
    }
  }
  const rows = [...out.values()]
  for (const r of rows) {
    r.pipeline = r.pipeline.map((x) => Math.round(x * 10) / 10)
    r.total = r.pipeline.reduce((s, x) => s + x, 0) + r.predicted.reduce((s, x) => s + x, 0)
  }
  return rows.filter((r) => r.total > 0.05).sort((a, b) => b.total - a.total)
}

export const OPEN_PO = new Set<PurchaseOrder['status']>(['draft', 'pending_release', 'released', 'acknowledged', 'delivered'])

export function weekOfDate(d: string): number {
  const D = db()
  for (let k = 0; k < D.weekEndDates.length; k++) if (d <= D.weekEndDates[k]) return k + 1
  return 9
}

