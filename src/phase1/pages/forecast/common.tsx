import clsx from 'clsx'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/ui'
import { db } from '@/data/db'
import type { ActionOption, FailureClass, Site } from '@/data/types'
import { date, dateShort } from '@/lib/format'
import { INTERVENTIONS, buildPlan, interventionFromOption } from '@/lib/plan'
import { todayIso, useApp } from '@/store/app'
import { CLASS_GATES, type GateStatus } from '../../content/golive'
import { SOURCES } from '../../content/sources'
import { CLASSES, CLASS_META, clustersFrom, optionsFor, type Cluster, type P1Data, type P1Plan, type P1Site } from '../../model'
import { p1Reservations, useP1Store } from '../../store'

// Shared helpers for the Forecast, Site explainer and Classify pages (Phase 1 steps 1–2).

export const RED_FLOOR = 0.6
export const WATCH_FLOOR = 0.3

// ---- Chart tokens -------------------------------------------------------------------------
export const AX = '#6B7280'
export const GRID = '#2A2F3A'
export const TT = {
  contentStyle: { background: '#171A21', border: '1px solid #353B48', borderRadius: 0, fontSize: 11, padding: '6px 8px' },
  labelStyle: { color: '#A3AAB8', marginBottom: 2 },
  itemStyle: { color: '#F2F3F5', padding: 0 },
  cursor: { stroke: '#353B48' },
}
export const AXIS_TICK = { fill: AX, fontSize: 10.5 }

export function probColor(p: number): string {
  return p >= RED_FLOOR ? '#FF3B3B' : p >= WATCH_FLOOR ? '#F5A623' : '#4B5563'
}
export function pctTxt(p: number, d = 0): string {
  return `${(p * 100).toFixed(d)}%`
}
/** Probability points, signed: +17.6 pts */
export function pts(v: number, d = 1): string {
  const x = v * 100
  return `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`
}

export const GATE_LABEL: Record<GateStatus, string> = { drives_approvals: 'Drives approvals', advisory: 'Advisory', shadow: 'Shadow mode' }
export const GATE_TONE: Record<GateStatus, 'ok' | 'warn' | 'neutral'> = { drives_approvals: 'ok', advisory: 'warn', shadow: 'neutral' }
export function gateOf(cls: FailureClass) {
  return CLASS_GATES.find((g) => g.cls === cls)!
}
export function GateBadge({ cls }: { cls: FailureClass }) {
  const g = gateOf(cls).gateAtGoLive
  return <Badge tone={GATE_TONE[g]}>{GATE_LABEL[g]}</Badge>
}

export function ClassChip({ cls, short, className }: { cls: FailureClass; short?: boolean; className?: string }) {
  const m = CLASS_META[cls]
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap', className)}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m.color }} />
      {short ? m.short : m.label}
    </span>
  )
}

export function weekDate(w: number): string {
  const d = db().weekEndDates
  return d[Math.max(0, Math.min(d.length - 1, w - 1))]
}
export function weekTxt(w: number, long = false): string {
  if (!w) return '—'
  return long ? `W+${w} · ${date(weekDate(w))}` : `W+${w} · ${dateShort(weekDate(w))}`
}

export function sourceOf(id: string) {
  return SOURCES.find((s) => s.id === id)
}

// ---- Predicted sites ------------------------------------------------------------------------
export interface PredSite {
  id: string
  i: number
  site: Site
  cls: FailureClass
  probs: number[]
  p8: number
  cw: number // first week ≥ 60%, 0 = not red inside 8 weeks
  rev: number // monthly revenue IDR
  p1?: P1Site
  cluster?: Cluster
  topFactor: string
  topContrib: number | null
}

export function topFactorOf(p: P1Site | undefined, data: P1Data | null, fallback: string): { label: string; contrib: number | null } {
  if (!p || !data) return { label: fallback, contrib: null }
  let best: string | null = null
  for (const k of Object.keys(p.contrib)) if (best === null || p.contrib[k] > p.contrib[best]) best = k
  const f = data.feature_catalog[p.failure_class].find((x) => x.id === best)
  return { label: f?.label ?? fallback, contrib: best ? p.contrib[best] : null }
}

export function crossing(probs: number[], thr = RED_FLOOR): number {
  for (let k = 0; k < probs.length; k++) if (probs[k] >= thr) return k + 1
  return 0
}

/** All sites at ≥ 30% by W+8: the 60% set (predicted) plus the 30–60% watch list. */
export function usePredSites(p1: P1Data | null, clusters: Cluster[]): PredSite[] {
  return useMemo(() => {
    const D = db()
    const bySite = new Map<string, Cluster>()
    for (const c of clusters) for (const s of c.site_ids) bySite.set(s, c)
    const out: PredSite[] = []
    D.forecast.forEach((f, i) => {
      const p8 = f.failure_prob[7]
      if (p8 < WATCH_FLOOR) return
      const p = p1?.bySite.get(f.site_id)
      const tf = topFactorOf(p, p1, f.top_factors[0]?.factor ?? '—')
      out.push({
        id: f.site_id,
        i,
        site: D.sites[i],
        cls: f.failure_class,
        probs: f.failure_prob,
        p8,
        cw: crossing(f.failure_prob),
        rev: D.revenue.latest[i],
        p1: p,
        cluster: bySite.get(f.site_id),
        topFactor: tf.label,
        topContrib: tf.contrib,
      })
    })
    return out.sort((a, b) => b.p8 - a.p8)
  }, [p1, clusters])
}

export function useClusters(): Cluster[] {
  const incidents = useApp((s) => s.incidents)
  return useMemo(() => clustersFrom(incidents), [incidents])
}

/** Class order by role: Operations owns the non-capacity classes and sees them first. */
export function classOrder(role: string): FailureClass[] {
  return role === 'OPS' ? [...CLASSES.filter((c) => c !== 'capacity'), 'capacity'] : CLASSES
}

// ---- Clusters ------------------------------------------------------------------------------
export function windowDays(c: Cluster): number {
  return c.days_to_breach ?? c.crossing_week * 7
}
export function recommendedOf(c: Cluster): ActionOption | undefined {
  return optionsFor(c).find((o) => o.rank === c.recommended_rank)
}
export function fits(o: ActionOption, c: Cluster): boolean {
  return o.lead_days <= windowDays(c)
}
export function isCapexClass(ic: string): boolean {
  return ic === 'capex_minor' || ic === 'capex_major'
}
/** A rung that lands inside the window, offered as a bridge when the recommended rung does not. */
export function bridgeFor(c: Cluster): ActionOption | null {
  const rec = recommendedOf(c)
  if (!rec || fits(rec, c)) return null
  // the most capable non-CapEx rung that lands in time (refarm for capacity, reroute for transport)
  const ok = optionsFor(c).filter((o) => fits(o, c) && o.rank < rec.rank)
  return [...ok].reverse().find((o) => !isCapexClass(o.class)) ?? ok[ok.length - 1] ?? null
}

/** Plan-builder intervention for a cluster. The ladder names map onto the builder's templates;
 *  rungs the builder has no template for (QoS, reroute, pre-emptive visit, remote reset) fall back
 *  to the class default so the BOQ is never a spectrum refarm for a non-capacity class. */
export function interventionFor(c: Cluster, verdict?: 'capex' | 'noncapex'): string {
  const def = CLASS_META[c.cls].defaultIntervention
  const opts = optionsFor(c)
  let o = recommendedOf(c)
  if (verdict) {
    const pool = opts.filter((x) => isCapexClass(x.class) === (verdict === 'capex'))
    if (o && isCapexClass(o.class) !== (verdict === 'capex')) o = verdict === 'capex' ? pool[0] : pool[pool.length - 1]
  }
  if (!o) return def
  const iv = interventionFromOption(o.name)
  if (!INTERVENTIONS[iv]) return def
  if (iv === 'refarm' && c.cls !== 'capacity') return def
  return iv
}

export function planForCluster(plans: P1Plan[], clusterId: string): P1Plan | undefined {
  return plans.find((p) => p.cluster_id === clusterId && p.status !== 'rejected')
}

export function useBuildPlan() {
  const nav = useNavigate()
  return (c: Cluster, verdict?: 'capex' | 'noncapex') => {
    const st = useP1Store.getState()
    const existing = planForCluster(st.plans, c.id)
    if (existing) {
      nav(`/phase1/plans/${existing.id}`)
      return
    }
    const app = useApp.getState()
    const draft = buildPlan({
      siteIds: c.site_ids,
      intervention: interventionFor(c, verdict),
      sourceIncident: c.incident_id,
      programs: app.programs,
      // stock already held by session programmes and by Phase 1 plans in flight
      reservations: [...app.reservations, ...p1Reservations(st.plans)],
      windowDays: windowDays(c),
      today: todayIso(),
      nextProgramId: 'PL-new',
    })
    draft.name = `${db().distById[c.district_id]?.name ?? draft.district_label} · ${draft.intervention_label}`
    const id = st.createPlan(draft, c.id)
    app.toast(`${id} drafted from ${c.id} · ${c.site_ids.length} sites`, 'ok')
    nav(`/phase1/plans/${id}`)
  }
}

export function CoverageBadge({ c, plan }: { c: Cluster; plan?: P1Plan }) {
  const v = c.coverage.verdict
  return (
    <span className="inline-flex items-center gap-1.5">
      <Badge tone={v === 'covered' ? 'prog' : v === 'partial' ? 'warn' : 'bad'}>{v === 'covered' ? 'Covered' : v === 'partial' ? 'Partial' : 'Not covered'}</Badge>
      {plan && <Badge tone="yellow">{plan.id}</Badge>}
    </span>
  )
}
export function coverageText(c: Cluster): string {
  const m = c.coverage
  if (m.verdict === 'not_covered') return 'No active program covers these sites.'
  return `${m.program_id ?? 'Program'}${m.stage ? ` at ${m.stage}` : ''}${m.eta ? `, RFS ${date(m.eta)}` : ''}${m.reason ? ` · ${m.reason}` : ''}`
}

export const STORY_LABEL: Record<string, string> = {
  bekasi_capacity: 'Bekasi capacity',
  sulsel_transport: 'South Sulawesi transport chain',
  cjava_power: 'Central Java power',
}

export function districtName(id: string): string {
  return db().distById[id]?.name ?? id
}
export function provinceName(id: string): string {
  return db().provById[id]?.name ?? id
}
