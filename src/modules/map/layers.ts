import { db, kpiAt, kpiMean } from '@/data/db'
import type { Incident, Policy, Program, Role } from '@/data/types'
import { statusOf } from '@/lib/colors'
import { isOpen, lastDay, siteHealth, siteInScope } from '@/lib/metrics'
import type { LayerId, MapFilters } from '@/store/app'

export const LAYERS: { id: LayerId; label: string; short: string; unit: string; desc: string }[] = [
  { id: 'health', label: 'Site Health', short: 'Health', unit: 'score', desc: 'Composite: availability, CNX, bad sessions, PRB, alarms' },
  { id: 'cnx', label: 'CNX', short: 'CNX', unit: 'score', desc: 'Customer Network Experience by segment' },
  { id: 'availability', label: 'Availability', short: 'Avail.', unit: '%', desc: 'Cell availability, 24 h / 7 d / 30 d' },
  { id: 'bad_session', label: 'Bad Sessions', short: 'Bad sess.', unit: '%', desc: 'Share of sessions below throughput threshold' },
  { id: 'prb', label: 'Capacity Utilisation', short: 'PRB', unit: '%', desc: 'PRB load, peak hour' },
  { id: 'backbone', label: 'Backbone and Transport', short: 'Transport', unit: '%', desc: 'Fibre, microwave and submarine links: utilisation and faults' },
  { id: 'cdn', label: 'CDN Peering', short: 'CDN', unit: '%', desc: 'Per PoP: cache hit ratio and egress cost' },
  { id: 'failure', label: 'Predicted Failure', short: 'Predicted', unit: '%', desc: '8-week failure probability (Site Failure Prediction Agent)' },
  { id: 'revenue', label: 'Revenue Density', short: 'Revenue', unit: 'IDR', desc: 'Monthly revenue per site catchment' },
  { id: 'program', label: 'Program Coverage', short: 'Programs', unit: '', desc: 'Sites inside an active program' },
]

export const ACTIVE_STAGES = new Set(['Decision', 'BOQ', 'PO', 'Vendor allocation', 'Material dispatch', 'Installation', 'Integration', 'RFS'])

export interface LayerResult {
  value: Float32Array // NaN = no data
  status: Int8Array // -1 nodata, 0 ok, 1 warn, 2 bad, 3 in program, 10..15 sequential bucket
  visible: Uint8Array // passes filters
  inScope: Uint8Array // inside role scope
  inProgram: Uint8Array
  label: string // "Actual 27 Sep" / "Predicted W+4"
  mode: 'actual' | 'predicted'
}

let revenueQuantiles: number[] | null = null
function revQ(): number[] {
  if (revenueQuantiles) return revenueQuantiles
  const v = Array.from(db().revenue.latest).sort((a, b) => a - b)
  revenueQuantiles = [0.2, 0.4, 0.6, 0.8, 0.95].map((q) => v[Math.floor(q * (v.length - 1))])
  return revenueQuantiles
}
export function revenueBucket(v: number): number {
  const q = revQ()
  let b = 0
  while (b < q.length && v > q[b]) b++
  return b
}
export function revenueBreaks(): number[] {
  return revQ()
}

export function dayForScrub(scrub: number): number {
  return lastDay() + Math.min(0, scrub)
}
export function weekForScrub(scrub: number): number {
  return scrub > 0 ? Math.min(8, Math.ceil(scrub / 7)) : 0
}

export function computeLayer(opts: {
  layer: LayerId
  scrub: number
  filters: MapFilters
  policy: Policy
  role: Role
  scope: string
  programs: Program[]
  incidents: Incident[]
}): LayerResult {
  const D = db()
  const N = D.sites.length
  const { layer, scrub, filters, policy } = opts
  const T = policy.colour_thresholds
  const value = new Float32Array(N)
  const status = new Int8Array(N)
  const visible = new Uint8Array(N)
  const inScope = new Uint8Array(N)
  const inProgram = new Uint8Array(N)
  const day = dayForScrub(scrub)
  const week = weekForScrub(scrub)

  const progSites = new Set<string>()
  for (const p of opts.programs) if (ACTIVE_STAGES.has(p.stage) && !p.complete) for (const s of p.site_ids) progSites.add(s)
  const openSites = new Set<string>()
  for (const x of opts.incidents) if (isOpen(x)) for (const s of x.site_ids) openSites.add(s)

  const f = filters
  const segOffset = (i: number): number | null => {
    if (f.segment === 'all') return 0
    const c = D.cohortsBySite.get(D.sites[i].site_id)?.find((x) => x.segment === f.segment)
    if (!c) return null
    return c.cnx - kpiAt('cnx', i, lastDay())
  }

  for (let i = 0; i < N; i++) {
    const s = D.sites[i]
    inProgram[i] = progSites.has(s.site_id) ? 1 : 0
    inScope[i] = siteInScope(s, opts.role, opts.scope) ? 1 : 0
    let ok = true
    if (f.regions.length && !f.regions.includes(s.region)) ok = false
    if (ok && f.provinces.length && !f.provinces.includes(s.province_id)) ok = false
    if (ok && f.technologies.length && !f.technologies.some((t) => s.technologies.includes(t))) ok = false
    if (ok && f.vendors.length && !f.vendors.includes(s.vendor)) ok = false
    if (ok && f.siteClasses.length && !f.siteClasses.includes(s.site_class)) ok = false
    if (ok && f.program !== 'all' && (f.program === 'in') !== !!inProgram[i]) ok = false
    if (ok && f.incident !== 'all' && (f.incident === 'open') !== openSites.has(s.site_id)) ok = false
    visible[i] = ok ? 1 : 0

    let v = NaN
    let st = -1
    switch (layer) {
      case 'health':
      case 'backbone':
      case 'cdn':
        v = siteHealth(i, day)
        st = statusOf(v, T.health)
        break
      case 'cnx': {
        const off = segOffset(i)
        if (off === null) break
        v = kpiAt('cnx', i, day) + off
        st = statusOf(v, T.cnx)
        break
      }
      case 'availability':
        v = f.availabilityWindow === 1 ? kpiAt('availability', i, day) : kpiMean('availability', i, day, f.availabilityWindow)
        st = statusOf(v, T.availability)
        break
      case 'bad_session':
        v = kpiAt('bad_session_pct', i, day)
        st = statusOf(v, T.bad_session)
        break
      case 'prb':
        v = kpiAt('prb_util', i, day)
        st = statusOf(v, T.prb)
        break
      case 'failure':
        if (week === 0) {
          v = siteHealth(i, day)
          st = statusOf(v, T.health)
        } else {
          v = D.forecast[i].failure_prob[week - 1] * 100
          st = v >= policy.red_min_probability * 100 ? 2 : statusOf(v, { ...T.failure, amber: policy.red_min_probability * 100 })
        }
        break
      case 'revenue':
        v = D.revenue.latest[i]
        st = 10 + revenueBucket(v)
        break
      case 'program':
        v = inProgram[i]
        st = inProgram[i] ? 3 : -1
        break
    }
    value[i] = v
    status[i] = st
  }
  const dates = D.kpi.dates
  const label =
    layer === 'failure' && week > 0
      ? `Predicted W+${week} · to ${D.weekEndDates[week - 1]}`
      : `Actual · ${dates[day]}`
  return { value, status, visible, inScope, inProgram, label, mode: layer === 'failure' && week > 0 ? 'predicted' : 'actual' }
}

/** Province roll-up for the national choropleth. */
export function provinceRollup(res: LayerResult, layer: LayerId): Map<string, { n: number; red: number; amber: number; mean: number; status: number; revenue: number }> {
  const D = db()
  const m = new Map<string, { n: number; red: number; amber: number; sum: number; cnt: number; revenue: number }>()
  for (let i = 0; i < D.sites.length; i++) {
    if (!res.visible[i]) continue
    const p = D.sites[i].province_id
    let r = m.get(p)
    if (!r) {
      r = { n: 0, red: 0, amber: 0, sum: 0, cnt: 0, revenue: 0 }
      m.set(p, r)
    }
    r.n++
    const st = res.status[i]
    if (st === 2) r.red++
    if (st === 1) r.amber++
    if (!Number.isNaN(res.value[i])) {
      r.sum += res.value[i]
      r.cnt++
    }
    r.revenue += D.revenue.latest[i]
  }
  const out = new Map<string, { n: number; red: number; amber: number; mean: number; status: number; revenue: number }>()
  for (const [p, r] of m) {
    let status: number
    if (layer === 'failure' && res.mode === 'predicted') status = r.red >= 5 || (r.red >= 3 && r.red / r.n >= 0.05) ? 2 : r.red > 0 ? 1 : 0
    else if (layer === 'revenue') status = 10 + revenueBucket(r.revenue / r.n)
    else if (layer === 'program') status = -1
    else status = r.red / r.n >= 0.06 ? 2 : (r.red + r.amber) / r.n >= 0.12 ? 1 : 0
    out.set(p, { n: r.n, red: r.red, amber: r.amber, mean: r.cnt ? r.sum / r.cnt : NaN, status, revenue: r.revenue })
  }
  return out
}
