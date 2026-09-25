import { db } from '@/data/db'
import { idr } from '@/lib/format'
import type { Program } from '@/data/types'
import { ASSUMPTIONS, avoidedTotals, cycleTimes, didLatest, median, programRoi, rollup, validationSites, type Horizon } from './calc'

export interface Pool {
  pool: string
  metric: string
  formula: string
  value: number | null
  valueNote: string
  basis: string
  fresh: 'D-1' | 'D-5' | 'live'
}

export interface Ranked {
  site_id: string
  name: string
  program_id: string
  h: Horizon
  v: number
  predicted: number
  outcome: string
}

export function ledgerSummary(programs: Program[]) {
  const D = db()
  const roi = programRoi(programs)
  const roll = rollup(roi)
  const av = avoidedTotals()
  const year = D.meta.now.slice(0, 4)
  const avYtd = D.avoided.filter((a) => a.date.startsWith(year)).reduce((a, x) => a + x.outage_cost_idr, 0)
  // Validated RFS dates all fall inside the last 180 days, i.e. the current year
  const revYtd = roll.revToDate
  const protectedYtd = revYtd + avYtd

  const cycles = cycleTimes(programs)
  const legacy = median(cycles.filter((c) => c.managed_by === 'legacy').map((c) => c.weeks))
  const nicc = median(cycles.filter((c) => c.managed_by === 'nicc').map((c) => c.weeks))
  const nLegacy = cycles.filter((c) => c.managed_by === 'legacy').length
  const nNicc = cycles.filter((c) => c.managed_by === 'nicc').length

  const sc = D.scorecard
  const capP = sc.find((s) => s.failure_class === 'capacity')!.precision_top_decile
  const powP = sc.find((s) => s.failure_class === 'power')!.precision_top_decile

  // Ten best / ten worst by realised CNX uplift (DiD at the latest horizon available)
  const ranked: Ranked[] = validationSites()
    .map((s): Ranked | null => {
      const d = didLatest(s.rows.cnx)
      if (!d) return null
      const site = D.sites[D.siteIdx.get(s.site_id)!]
      return { site_id: s.site_id, name: site?.name ?? s.site_id, program_id: s.program_id, h: d.h, v: d.v, predicted: s.rows.cnx.predicted_uplift, outcome: s.outcome }
    })
    .filter((x): x is Ranked => !!x)
    .sort((a, b) => b.v - a.v)
  const best = ranked.slice(0, 10)
  const worst = ranked.slice(-10).reverse()
  const split = {
    uplift: validationSites().filter((s) => s.outcome === 'uplift').length,
    flat: validationSites().filter((s) => s.outcome === 'flat').length,
    worse: validationSites().filter((s) => s.outcome === 'worse').length,
  }
  const at90 = validationSites().filter((s) => s.rows.cnx.post_90 !== null).length

  // Value pools (PRD §9)
  const cost = D.meta.per_site_cost_idr
  const cheaper = programs.filter((p) => p.managed_by === 'nicc' && (p.intervention === 'refarm' || p.intervention === 'carrier_add') && p.stage !== 'Decision')
  const capexAvoided = cheaper.reduce((a, p) => a + p.sites_planned * (cost.sector_add - (cost[p.intervention] ?? 0)), 0)
  const niccInflight = programs.filter((p) => p.managed_by === 'nicc' && p.stage !== 'Decision' && !p.complete)
  const niccSites = niccInflight.reduce((a, p) => a + p.site_ids.length, 0)
  // Incremental weekly revenue per treated site = realised revenue DiD per site, per week
  const weeklyUplift = roll.sites ? roll.revMonthly / roll.sites / 4.345 : 0
  const weeksSaved = Math.max(0, legacy - nicc)
  const cycleValue = weeksSaved * weeklyUplift * niccSites

  const pools: Pool[] = [
    {
      pool: 'Churn avoided',
      metric: 'Subscribers retained × ARPU × expected remaining tenure',
      formula: 'churn uplift × catchment subs × ARPU × 18 months',
      value: roll.churnIdr,
      valueNote: `${Math.round(roll.churnSubs).toLocaleString()} subs / month retained vs control`,
      basis: `Churn DiD on ${roll.sites} validated sites; subs and ARPU from customer cohorts`,
      fresh: 'D-1',
    },
    {
      pool: 'Revenue protected',
      metric: 'Monthly revenue on sites that would have degraded',
      formula: 'exposure × predicted outage days avoided / 30',
      value: av.outage,
      valueNote: `${av.n} proactive interventions, ${Math.round(av.hours)} outage hours avoided`,
      basis: 'Avoided-outage log (predicted, intervened before failure)',
      fresh: 'D-1',
    },
    {
      pool: 'GB Factory throughput',
      metric: 'Additional monetised GB on relieved sites',
      formula: 'traffic uplift × yield per GB',
      value: roll.gbToDate * ASSUMPTIONS.yieldPerGbIdr,
      valueNote: `${(roll.gbToDate / 1e6).toFixed(2)}m GB since RFS × IDR ${ASSUMPTIONS.yieldPerGbIdr.toLocaleString()}/GB (placeholder)`,
      basis: 'Traffic DiD (GB/day) × days since RFS; overlaps revenue DiD, not additive',
      fresh: 'D-1',
    },
    {
      pool: 'Energy OpEx',
      metric: 'Generator hours and fuel avoided, battery life extended',
      formula: 'generator hours avoided × fuel cost per hour + batteries not replaced × unit cost',
      value: null,
      valueNote: 'Method only',
      basis: 'Needs power telemetry and fuel logs on Netra (Energy and Power Agent, proposed by DevX)',
      fresh: 'D-5',
    },
    {
      pool: 'CapEx efficiency',
      metric: 'Refarming or carrier add chosen over hardware; emergency premiums avoided',
      formula: 'reactive cost × premium rate + hardware CapEx avoided',
      value: capexAvoided,
      valueNote: `${cheaper.map((p) => p.program_id).join(', ') || 'none'}: lower rung chosen over sector add`,
      basis: 'Hardware CapEx avoided only; reactive premium rate pending IOH procurement data',
      fresh: 'live',
    },
    {
      pool: 'OpEx efficiency',
      metric: 'Truck rolls avoided, emergency logistics avoided',
      formula: 'events × unit cost',
      value: av.n * ASSUMPTIONS.truckRollIdr,
      valueNote: `${av.n} emergency call-outs × IDR ${(ASSUMPTIONS.truckRollIdr / 1e6).toFixed(1)}m (placeholder)`,
      basis: 'Avoided-outage events; unit cost to be replaced with field-ops actuals',
      fresh: 'D-1',
    },
    {
      pool: 'Tower lease',
      metric: 'Loading changes negotiated in bulk, lease escalations avoided',
      formula: 'sites × lease delta per month × 12',
      value: null,
      valueNote: 'Method only',
      basis: 'Needs tower company lease terms (Tower Company Coordination Agent, proposed by DevX)',
      fresh: 'D-5',
    },
    {
      pool: 'Cycle time',
      metric: 'Weeks saved × revenue per week per site',
      formula: '(22 − 5) × weekly revenue',
      value: cycleValue,
      valueNote: `${weeksSaved.toFixed(1)} wk saved × ${niccSites} sites × ${idr(weeklyUplift)}/wk`,
      basis: `Median decision→RFS legacy ${legacy.toFixed(1)} wk vs NICC ${nicc.toFixed(1)} wk; weekly revenue = realised revenue DiD per site (incremental, not total)`,
      fresh: 'live',
    },
    {
      pool: 'CLV',
      metric: 'Change in expected lifetime value of the treated cohort',
      formula: 'retained subs × CLV delta',
      value: roll.clvIdr,
      valueNote: `${ASSUMPTIONS.clvHorizonMonths}-month horizon, ARPU-based`,
      basis: 'Treated cohort subscriber-months at actual post churn vs counterfactual churn (pre + control drift)',
      fresh: 'D-1',
    },
  ]

  return { roi, roll, av, avYtd, revYtd, protectedYtd, cycles, legacy, nicc, nLegacy, nNicc, capP, powP, best, worst, ranked, split, at90, pools }
}
