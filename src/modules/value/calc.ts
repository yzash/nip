import { db } from '@/data/db'
import type { Program, ValidationRow } from '@/data/types'
import { daysBetween } from '@/lib/format'

// Value Ledger calculations (PRD §9). Every figure is derived from the synthetic validation,
// avoided-outage and program data; the unit costs marked ASSUMPTIONS are placeholders pending
// IOH calibration.

export type KpiId = ValidationRow['kpi']
export type Horizon = 30 | 60 | 90

export const KPIS: { id: KpiId; label: string; short: string; unit: string; digits: number }[] = [
  { id: 'cnx', label: 'CNX score', short: 'CNX', unit: 'pts', digits: 1 },
  { id: 'availability', label: 'Availability', short: 'Availability', unit: '%', digits: 2 },
  { id: 'bad_session', label: 'Bad sessions', short: 'Bad sessions', unit: '%', digits: 1 },
  { id: 'throughput', label: 'User throughput', short: 'Throughput', unit: 'Mbps', digits: 1 },
  { id: 'traffic_gb', label: 'Traffic (GB Factory)', short: 'Traffic', unit: 'GB/day', digits: 0 },
  { id: 'churn', label: 'Churn in catchment', short: 'Churn', unit: '%/mo', digits: 2 },
  { id: 'revenue', label: 'Site revenue', short: 'Revenue', unit: 'IDR/mo', digits: 0 },
]
export const kpiDef = (k: KpiId) => KPIS.find((x) => x.id === k)!

export const ASSUMPTIONS = {
  clvTenureMonths: 18, // PRD §9: expected remaining tenure
  clvHorizonMonths: 12, // horizon for the treated-cohort CLV change
  yieldPerGbIdr: 1_450, // blended data yield per GB (placeholder)
  truckRollIdr: 6_500_000, // emergency truck roll + logistics per avoided outage (placeholder)
  legacyWeeks: 22, // PRD §9 cycle-time pool: (22 − 5) × weekly revenue
  niccWeeks: 5,
}

export function now(): string {
  return db().meta.now
}
export function today(): string {
  return db().meta.now.slice(0, 10)
}

export function postOf(r: ValidationRow, h: Horizon): number | null {
  return h === 30 ? r.post_30 : h === 60 ? r.post_60 : r.post_90
}
export function ctrlPostOf(r: ValidationRow, h: Horizon): number | null {
  return h === 30 ? r.control_post_30 : h === 60 ? r.control_post_60 : r.control_post_90
}

/** Difference-in-differences: (Yt,post − Yt,pre) − (Yc,post − Yc,pre). Null when the horizon has not elapsed. */
export function did(r: ValidationRow, h: Horizon): number | null {
  const p = postOf(r, h)
  const c = ctrlPostOf(r, h)
  if (p === null || c === null) return null
  return p - r.pre - (c - r.control_pre)
}

export function latestHorizon(r: ValidationRow): Horizon | null {
  if (r.post_90 !== null) return 90
  if (r.post_60 !== null) return 60
  if (r.post_30 !== null) return 30
  return null
}

export function didLatest(r: ValidationRow): { h: Horizon; v: number } | null {
  const h = latestHorizon(r)
  if (!h) return null
  return { h, v: did(r, h)! }
}

export function monthsSince(d: string): number {
  return Math.max(0, daysBetween(d, today()) / 30.4)
}

export function siteSubs(siteId: string): { subs: number; arpu: number } {
  const cs = db().cohortsBySite.get(siteId) ?? []
  const subs = cs.reduce((a, c) => a + c.subs, 0)
  const arpu = subs ? cs.reduce((a, c) => a + c.subs * c.arpu, 0) / subs : 0
  return { subs, arpu }
}

export function mean(a: number[]): number {
  return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
}
export function median(a: number[]): number {
  if (!a.length) return 0
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// ---- Index by site ----------------------------------------------------------------------------
export interface SiteVal {
  site_id: string
  program_id: string
  rfs_date: string
  outcome: ValidationRow['outcome']
  rows: Record<KpiId, ValidationRow>
}

let _sites: SiteVal[] | null = null
export function validationSites(): SiteVal[] {
  if (_sites) return _sites
  const m = new Map<string, SiteVal>()
  for (const r of db().validation) {
    let s = m.get(r.site_id)
    if (!s) {
      s = { site_id: r.site_id, program_id: r.program_id, rfs_date: r.rfs_date, outcome: r.outcome, rows: {} as Record<KpiId, ValidationRow> }
      m.set(r.site_id, s)
    }
    s.rows[r.kpi] = r
    if (r.kpi === 'cnx') s.outcome = r.outcome
  }
  _sites = [...m.values()]
  return _sites
}

export function validatedProgramIds(): string[] {
  return [...new Set(validationSites().map((s) => s.program_id))].sort()
}

// ---- Program ROI (PRD §6 M6, §9) ---------------------------------------------------------------
export interface ProgramRoi {
  program: Program
  sites: number
  sitesMeasured: number
  spent: number
  revMonthly: number // revenue DiD, IDR / month (sum over sites at latest horizon)
  revToDate: number // revenue DiD × months since RFS
  revAnnual: number
  churnSubs: number // subscribers retained per month versus control
  churnIdr: number // churn uplift × subs × ARPU × 18
  clvIdr: number
  cnxDid: number // mean CNX DiD
  paybackMonths: number | null
  roi: number
  gbToDate: number
}

/** Expected active subscriber-months over the CLV horizon at a monthly churn rate (in %). */
function clvLifetime(churnPct: number): number {
  const c = Math.max(0, churnPct) / 100
  const H = ASSUMPTIONS.clvHorizonMonths
  if (c === 0) return H
  const r = 1 - c
  return (r * (1 - Math.pow(r, H))) / c
}

export function programRoi(programs: Program[]): ProgramRoi[] {
  const byProg = new Map<string, SiteVal[]>()
  for (const s of validationSites()) {
    const a = byProg.get(s.program_id)
    if (a) a.push(s)
    else byProg.set(s.program_id, [s])
  }
  const out: ProgramRoi[] = []
  for (const [pid, sites] of byProg) {
    const program = programs.find((p) => p.program_id === pid) ?? db().programs.find((p) => p.program_id === pid)
    if (!program) continue
    let revMonthly = 0
    let revToDate = 0
    let churnSubs = 0
    let churnIdr = 0
    let clvIdr = 0
    let gbToDate = 0
    let measured = 0
    const cnx: number[] = []
    for (const s of sites) {
      const m = monthsSince(s.rfs_date)
      const rv = didLatest(s.rows.revenue)
      if (rv) {
        revMonthly += rv.v
        revToDate += rv.v * m
        measured += 1
      }
      const tg = didLatest(s.rows.traffic_gb)
      if (tg) gbToDate += tg.v * m * 30.4
      const c = didLatest(s.rows.cnx)
      if (c) cnx.push(c.v)
      const ch = s.rows.churn
      const chd = didLatest(ch)
      if (chd) {
        const { subs, arpu } = siteSubs(s.site_id)
        const retained = (-chd.v / 100) * subs
        churnSubs += retained
        churnIdr += retained * arpu * ASSUMPTIONS.clvTenureMonths
        // CLV: cohort lifetime with actual post churn versus counterfactual (pre + control drift)
        const post = postOf(ch, chd.h)!
        const cf = ch.pre + (ctrlPostOf(ch, chd.h)! - ch.control_pre)
        clvIdr += subs * arpu * (clvLifetime(post) - clvLifetime(cf))
      }
    }
    const spent = program.spent_idr
    const revAnnual = revMonthly * 12
    out.push({
      program,
      sites: sites.length,
      sitesMeasured: measured,
      spent,
      revMonthly,
      revToDate,
      revAnnual,
      churnSubs,
      churnIdr,
      clvIdr,
      cnxDid: mean(cnx),
      paybackMonths: revMonthly > 0 ? spent / revMonthly : null,
      roi: spent > 0 ? (revAnnual + churnIdr) / spent : 0,
      gbToDate,
    })
  }
  return out.sort((a, b) => a.program.program_id.localeCompare(b.program.program_id))
}

export function rollup(rows: ProgramRoi[]) {
  const sum = (f: (r: ProgramRoi) => number) => rows.reduce((a, r) => a + f(r), 0)
  const spent = sum((r) => r.spent)
  const revMonthly = sum((r) => r.revMonthly)
  const revAnnual = sum((r) => r.revAnnual)
  const churnIdr = sum((r) => r.churnIdr)
  const allCnx = validationSites()
    .map((s) => didLatest(s.rows.cnx)?.v)
    .filter((v): v is number => v !== undefined)
  return {
    sites: sum((r) => r.sites),
    spent,
    revMonthly,
    revToDate: sum((r) => r.revToDate),
    revAnnual,
    churnSubs: sum((r) => r.churnSubs),
    churnIdr,
    clvIdr: sum((r) => r.clvIdr),
    gbToDate: sum((r) => r.gbToDate),
    cnxDid: mean(allCnx),
    paybackMonths: revMonthly > 0 ? spent / revMonthly : null,
    roi: spent > 0 ? (revAnnual + churnIdr) / spent : 0,
  }
}

// ---- Cycle time ---------------------------------------------------------------------------------
export interface CycleRow {
  program_id: string
  name: string
  managed_by: 'legacy' | 'nicc'
  weeks: number
  actual: boolean
}

/** Decision → RFS (actual RFS stage start when reached, otherwise forecast), programs past the Decision gate. */
export function cycleTimes(programs: Program[]): CycleRow[] {
  return programs
    .filter((p) => p.stage !== 'Decision')
    .map((p) => {
      const start = p.stage_history[0]?.start ?? p.start
      const rfs = p.stage_history.find((h) => h.stage === 'RFS')?.start
      const end = rfs ?? p.forecast_rfs
      return { program_id: p.program_id, name: p.name, managed_by: p.managed_by, weeks: daysBetween(start, end) / 7, actual: !!rfs }
    })
}

// ---- Avoided cost -------------------------------------------------------------------------------
export function avoidedTotals() {
  const A = db().avoided
  const outage = A.reduce((a, x) => a + x.outage_cost_idr, 0)
  const cost = A.reduce((a, x) => a + x.intervention_cost_idr, 0)
  const hours = A.reduce((a, x) => a + x.predicted_outage_hours, 0)
  return { n: A.length, outage, cost, net: outage - cost, hours }
}

// ---- Distribution ---------------------------------------------------------------------------------
export function histogram(values: { v: number; outcome: string }[], binW: number) {
  if (!values.length) return []
  const lo = Math.floor(Math.min(...values.map((x) => x.v)) / binW) * binW
  const hi = Math.ceil(Math.max(...values.map((x) => x.v)) / binW) * binW
  const bins: { x0: number; label: string; uplift: number; flat: number; worse: number }[] = []
  for (let x = lo; x < hi + 1e-9; x += binW) bins.push({ x0: x, label: fmtBin(x, binW), uplift: 0, flat: 0, worse: 0 })
  for (const { v, outcome } of values) {
    const i = Math.min(bins.length - 1, Math.max(0, Math.floor((v - lo) / binW)))
    const b = bins[i]
    if (outcome === 'uplift') b.uplift++
    else if (outcome === 'flat') b.flat++
    else b.worse++
  }
  return bins
}
function fmtBin(x: number, w: number): string {
  const d = w < 1 ? (w < 0.1 ? 2 : 1) : 0
  const v = x + w / 2
  return (v > 0 ? '+' : '') + v.toFixed(d)
}

/** Nice bin width for ~14 bins. */
export function binWidth(values: number[]): number {
  if (!values.length) return 1
  const r = Math.max(...values) - Math.min(...values) || 1
  const raw = r / 14
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  return (n < 1.5 ? 1 : n < 3.5 ? 2.5 : n < 7.5 ? 5 : 10) * p
}

/** Format a KPI value in its own unit. */
export function fmtKpi(k: KpiId, v: number, opts: { signed?: boolean } = {}): string {
  const d = kpiDef(k)
  if (k === 'revenue') {
    const a = Math.abs(v)
    const s = v < 0 ? '−' : opts.signed && v > 0 ? '+' : ''
    return a >= 1e9 ? `${s}${(a / 1e9).toFixed(2)}bn` : `${s}${(a / 1e6).toFixed(1)}m`
  }
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d.digits, maximumFractionDigits: d.digits })
  if (v < 0) return `−${s}`
  return opts.signed && v > 0 ? `+${s}` : s
}
