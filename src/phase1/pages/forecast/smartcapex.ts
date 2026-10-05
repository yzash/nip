import type { ActionOption, FailureClass } from '@/data/types'
import { optionsFor, type Cluster, type P1Site } from '../../model'
import { isCapexClass, recommendedOf, type PredSite } from './common'

// Smart CapEx classification (consumed as-is from IOH's Smart CapEx, D-5). The prototype
// reproduces its published decision rules deterministically from the Phase 1 feature values so
// every call carries a rationale code that a planner can check against the explainer.

export type Verdict = 'capex' | 'noncapex'
export interface Code {
  code: string
  text: string
  capex: boolean // this code pushes towards CapEx
}
export interface SiteCall {
  siteId: string
  model: Verdict // Smart CapEx output
  verdict: Verdict // after planner override
  moved: { to: Verdict; reason: string; by: string } | null
  codes: Code[]
  action: string // what the verdict implies on site
}

const n1 = (v: number, d = 1) => (Number.isInteger(v) ? String(v) : v.toFixed(d))

/** Projected busy-hour PRB at W+8 after a 2G/4G refarm (−8 pts, the ladder's refarm uplift). */
export function prbAfterRefarm(v: Record<string, number>): number {
  return (v.prb_bh_p95_28d ?? 0) - 8 + Math.max(0, v.prb_slope_8w ?? 0) * 8
}

export function classifySite(cls: FailureClass, p: P1Site | undefined, cw: number, cluster?: Cluster): { verdict: Verdict; codes: Code[]; action: string } {
  if (!p) return { verdict: 'noncapex', codes: [{ code: 'NF-00', text: 'No feature vector (below watch threshold): defaults to non-CapEx review', capex: false }], action: 'Field review' }
  const v = p.values
  switch (cls) {
    case 'capacity': {
      // refarming buys ~3 weeks (ladder uplift −8 pts): it cannot carry a site that crosses by W+5
      // past the 8-week horizon, nor one whose PRB stays ≥ 85% after the refarm
      const after = prbAfterRefarm(v)
      const soon = cw > 0 && cw <= 5
      const insufficient = after >= 85
      const codes: Code[] = [
        { code: soon ? 'CAP-01' : 'CAP-11', text: soon ? `Crosses W+${cw}: refarm's ~3 wks cannot carry it past W+8` : cw ? `Crosses W+${cw}: refarm moves breach past the horizon` : 'Not red inside 8 weeks', capex: soon },
        { code: insufficient ? 'CAP-02' : 'CAP-12', text: `Busy-hour PRB ~${Math.round(after)}% by W+8 after refarm (${insufficient ? '≥' : '<'} 85%)`, capex: insufficient },
      ]
      const capex = soon || insufficient
      return { verdict: capex ? 'capex' : 'noncapex', codes, action: capex ? 'Carrier or sector add' : 'Refarm / parameter optimisation' }
    }
    case 'power': {
      // a battery swap restores autonomy on grid sites; on sites running half the day on genset
      // the bank cycles to death again, so end-of-life batteries there go to solar / Li-ion retrofit
      const soh = v.battery_health_pct ?? 100
      const gen = v.genset_hours_day ?? 0
      const grid = v.grid_outages_30d ?? 0
      const eol = soh < 55
      const offgrid = gen >= 12
      const codes: Code[] = [
        { code: eol ? 'PWR-01' : 'PWR-11', text: `Battery state of health ${Math.round(soh)}% ${eol ? '<' : '≥'} 55% end-of-life`, capex: eol },
        { code: offgrid ? 'PWR-02' : 'PWR-12', text: offgrid ? `Genset-dependent: ${n1(gen)} h/day, ${n1(grid, 0)} mains failures / 30 d` : `Grid site: genset ${n1(gen)} h/day, ${n1(grid, 0)} mains failures / 30 d`, capex: offgrid },
      ]
      const capex = eol && offgrid
      return { verdict: capex ? 'capex' : 'noncapex', codes, action: capex ? 'Solar / Li-ion retrofit' : 'Battery swap from stock' }
    }
    case 'transport': {
      // a reroute absorbs a hot link with headroom on the alternate path; a trunk carrying a chain
      // of sites, or a hop already at 95%, needs the capacity upgrade
      const util = v.link_util_p95 ?? 0
      const chain = !!cluster?.story?.includes('transport') || (cluster?.site_ids.length ?? 0) >= 5 || (v.dependent_sites ?? 0) >= 5
      const hot = util >= 95
      const codes: Code[] = [
        { code: chain ? 'TRN-02' : 'TRN-12', text: chain ? `Chain: ${cluster && cluster.site_ids.length > 1 ? `${cluster.site_ids.length} sites share the trunk` : `${n1(v.dependent_sites ?? 0, 0)} sites downstream`}` : `${n1(v.dependent_sites ?? 0, 0)} dependent sites; alternate path can absorb`, capex: chain },
        { code: hot ? 'TRN-01' : 'TRN-11', text: `First-hop backhaul P95 ${n1(util)}% ${hot ? '≥' : '<'} 95%`, capex: hot },
      ]
      const capex = hot || chain
      return { verdict: capex ? 'capex' : 'noncapex', codes, action: capex ? 'Microwave capacity upgrade' : 'Reroute + QoS' }
    }
    case 'ran_hardware': {
      const age = v.unit_age_years ?? 0
      const old = age >= 22
      const codes: Code[] = [{ code: old ? 'RAN-01' : 'RAN-11', text: `Oldest RRU/BBU ${n1(age)} yrs ${old ? '≥' : '<'} 22-yr vendor end of support`, capex: old }]
      if (v.mtbf_ratio !== undefined) codes.push({ code: v.mtbf_ratio >= 2.45 ? 'RAN-02' : 'RAN-12', text: `Age ${n1(v.mtbf_ratio, 2)}× vendor MTBF`, capex: v.mtbf_ratio >= 2.45 })
      return { verdict: old ? 'capex' : 'noncapex', codes, action: old ? 'RAN modernisation swap' : 'Unit swap from spares (OpEx)' }
    }
    case 'environmental': {
      const fl = v.flood_events_5y ?? 0
      const pl = v.plinth_cm ?? 100
      const rec = fl >= 3
      const low = pl < 20
      const codes: Code[] = [
        { code: rec ? 'ENV-01' : 'ENV-11', text: `${n1(fl, 0)} flood events within 2 km in 5 yrs (${rec ? '≥' : '<'} 3, recurrent)`, capex: rec },
        { code: low ? 'ENV-02' : 'ENV-12', text: `Cabinet plinth ${Math.round(pl)} cm ${low ? '<' : '≥'} 20 cm`, capex: low },
      ]
      const capex = rec && low
      return { verdict: capex ? 'capex' : 'noncapex', codes, action: capex ? 'Site hardening (raise cabinet)' : 'Pre-emptive visit + standby genset' }
    }
  }
}

export interface ClusterCall {
  cluster: Cluster
  sites: (SiteCall & { ps?: PredSite })[]
  model: Verdict
  verdict: Verdict
  capexSites: number
  moved: number
  codes: { code: string; text: string; capex: boolean; n: number }[]
  rec?: ActionOption
  recVerdict: Verdict | null
  agree: boolean | null
  capexRung?: ActionOption
  noncapexRung?: ActionOption
  capexIdr: number
  noncapexIdr: number
  rank: number // Smart CapEx rank inside its bucket
}

export function classifyCluster(c: Cluster, byId: Map<string, PredSite>, moves: Record<string, { to: Verdict; reason: string; by: string }>): Omit<ClusterCall, 'rank'> {
  const sites = c.site_ids.map((id) => {
    const ps = byId.get(id)
    const r = classifySite(c.cls, ps?.p1, ps?.cw ?? c.crossing_week, c)
    const mv = moves[id] ?? null
    return { siteId: id, model: r.verdict, verdict: mv ? mv.to : r.verdict, moved: mv, codes: r.codes, action: r.action, ps }
  })
  const n = sites.length
  const capexSites = sites.filter((s) => s.verdict === 'capex').length
  const modelCapex = sites.filter((s) => s.model === 'capex').length
  const verdict: Verdict = capexSites * 2 >= n ? 'capex' : 'noncapex'
  const model: Verdict = modelCapex * 2 >= n ? 'capex' : 'noncapex'
  // aggregate codes that support the cluster verdict
  const agg = new Map<string, { code: string; text: string; capex: boolean; n: number }>()
  for (const s of sites)
    for (const k of s.codes) {
      const a = agg.get(k.code)
      if (a) a.n++
      else agg.set(k.code, { ...k, n: 1 })
    }
  const codes = [...agg.values()].sort((a, b) => Number(b.capex === (verdict === 'capex')) - Number(a.capex === (verdict === 'capex')) || b.n - a.n)
  const opts = optionsFor(c)
  const rec = recommendedOf(c)
  const recVerdict: Verdict | null = rec ? (isCapexClass(rec.class) ? 'capex' : 'noncapex') : null
  const capexPool = opts.filter((o) => isCapexClass(o.class))
  const nonPool = opts.filter((o) => !isCapexClass(o.class))
  const capexRung = rec && recVerdict === 'capex' ? rec : capexPool[0]
  const noncapexRung = rec && recVerdict === 'noncapex' ? rec : nonPool[nonPool.length - 1]
  // Option costs are for the whole cluster: split them pro rata by the per-site verdicts.
  const capexIdr = n ? ((capexRung?.cost_idr ?? 0) * capexSites) / n : 0
  const noncapexIdr = n ? ((noncapexRung?.cost_idr ?? 0) * (n - capexSites)) / n : 0
  return {
    cluster: c,
    sites,
    model,
    verdict,
    capexSites,
    moved: sites.filter((s) => s.moved).length,
    codes,
    rec,
    recVerdict,
    agree: recVerdict ? recVerdict === verdict : null,
    capexRung,
    noncapexRung,
    capexIdr,
    noncapexIdr,
  }
}

export function classifyAll(clusters: Cluster[], byId: Map<string, PredSite>, moves: Record<string, { to: Verdict; reason: string; by: string }>): ClusterCall[] {
  const calls = clusters.map((c) => classifyCluster(c, byId, moves))
  const rankOf = new Map<string, number>()
  for (const v of ['capex', 'noncapex'] as const)
    calls
      .filter((x) => x.verdict === v)
      .sort((a, b) => b.cluster.priority - a.cluster.priority)
      .forEach((x, k) => rankOf.set(x.cluster.id, k + 1))
  return calls.map((x) => ({ ...x, rank: rankOf.get(x.cluster.id) ?? 0 }))
}

export const CLASSIFY_REASONS = [
  'Refarming headroom confirmed by RF engineering',
  'Battery swap sufficient after site audit',
  'Unit age wrong in site master',
  'Program already carries this scope',
  'Budget envelope exhausted this quarter',
  'Tower company constraint',
  'Local knowledge: already mitigated',
]
