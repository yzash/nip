import clsx from 'clsx'
import { ArrowRight, Check, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Drawer, Fresh, Id, Label } from '@/components/ui'
import { idr, num } from '@/lib/format'
import { INTERVENTION_LABEL } from '@/lib/format'
import { INTERVENTIONS } from '@/lib/plan'
import { db } from '@/data/db'
import { useApp } from '@/store/app'
import { CLASS_META, optionsFor, type Cluster, type P1Data } from '../../model'
import { useP1Store } from '../../store'
import { ClassChip, CoverageBadge, GateBadge, bridgeFor, coverageText, districtName, fits, interventionFor, pctTxt, planForCluster, pts, recommendedOf, useBuildPlan, weekTxt, windowDays, type PredSite } from './common'

export function ClusterDrawer({ cluster: c, byId, p1, onClose }: { cluster: Cluster | null; byId: Map<string, PredSite>; p1: P1Data | null; onClose: () => void }) {
  const nav = useNavigate()
  const plans = useP1Store((s) => s.plans)
  const role = useApp((s) => s.role)
  const incidents = useApp((s) => s.incidents)
  const build = useBuildPlan()
  if (!c) return null
  const plan = planForCluster(plans, c.id)
  const sites = c.site_ids.map((id) => byId.get(id)).filter((x): x is PredSite => !!x)
  const opts = optionsFor(c)
  const rec = recommendedOf(c)
  const bridge = bridgeFor(c)
  const win = windowDays(c)
  const iv = INTERVENTIONS[interventionFor(c)]

  // cluster explanation: mean contribution per feature across sites with an explanation
  const cat = p1?.feature_catalog[c.cls] ?? []
  const withP1 = sites.filter((s) => s.p1)
  const agg = cat
    .map((f) => {
      const vals = withP1.map((s) => s.p1!.contrib[f.id] ?? 0)
      const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length)
      const v = withP1.map((s) => s.p1!.values[f.id] ?? 0)
      const vmean = v.reduce((a, b) => a + b, 0) / Math.max(1, v.length)
      const beyond = withP1.filter((s) => (f.direction === 1 ? s.p1!.values[f.id] >= f.pop_p90 : s.p1!.values[f.id] <= f.pop_p90)).length
      return { f, mean, vmean, beyond }
    })
    .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean))
    .slice(0, 5)
  const maxAbs = Math.max(0.01, ...agg.map((a) => Math.abs(a.mean)))
  const canBuild = role === 'PLAN' || role === 'EXEC' || role === 'OPS' || role === 'REGION'

  return (
    <Drawer open onClose={onClose} width={640} title={<span className="flex items-center gap-2"><Id>{c.id}</Id> <span className="truncate">{c.title}</span></span>}>
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <ClassChip cls={c.cls} className="font-semibold" />
          <GateBadge cls={c.cls} />
          <span className="text-faint">·</span>
          <span className="text-muted">{districtName(c.district_id)}, {c.region}</span>
          <span className="ml-auto text-faint">Forecast Orchestrator · source <Id>{c.incident_id}</Id> <Fresh f="D-1" /></span>
        </div>
        <p className="mt-2 text-sm leading-5">
          <span className="font-semibold">{c.site_ids.length} sites</span> cross the 60% red floor in <span className="font-semibold">{weekTxt(c.crossing_week, true)}</span> at {pctTxt(c.probability)} cluster probability, putting{' '}
          <span className="font-semibold text-ioh-yellow">{idr(c.exposure_idr)} a month</span> at risk. {c.coverage.verdict === 'not_covered' ? 'No program covers them.' : coverageText(c)}
        </p>
        <div className="mt-3 grid grid-cols-4 border border-line">
          {[
            ['Sites', num(c.site_ids.length)],
            ['Crossing', `W+${c.crossing_week}`],
            ['Window', `${win} d`],
            ['Priority', num(c.priority, 1)],
          ].map(([l, v], k) => (
            <div key={l} className={clsx('px-3 py-1.5', k < 3 && 'border-r border-line')}>
              <Label>{l}</Label>
              <div className="tnum text-base font-semibold">{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* sites */}
      <div className="border-b border-line">
        <div className="flex h-9 items-center justify-between px-4">
          <Label>Sites in the cluster</Label>
          <span className="text-[11px] text-faint">Click a site for the explainer</span>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-y border-line text-left text-2xs uppercase tracking-wider text-faint">
              <th className="px-4 py-1.5 font-semibold">Site</th>
              <th className="px-2 py-1.5 font-semibold">District</th>
              <th className="px-2 py-1.5 text-right font-semibold">p W+8</th>
              <th className="px-2 py-1.5 font-semibold">Crosses</th>
              <th className="px-4 py-1.5 font-semibold">Top factor</th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.id} onClick={() => nav(`/phase1/site/${s.id}`)} className="cursor-pointer border-b border-line/60 hover:bg-panel2">
                <td className="px-4 py-1.5">
                  <Id>{s.id}</Id> <span className="ml-1">{s.site.name}</span>
                </td>
                <td className="max-w-[120px] truncate px-2 py-1.5 text-muted">{districtName(s.site.district_id)}</td>
                <td className="tnum px-2 py-1.5 text-right font-semibold" style={{ color: s.p8 >= 0.6 ? '#FF3B3B' : '#F5A623' }}>
                  {pctTxt(s.p8)}
                </td>
                <td className="tnum px-2 py-1.5">{weekTxt(s.cw)}</td>
                <td className="max-w-[180px] truncate px-4 py-1.5 text-muted" title={s.topFactor}>
                  {s.topFactor}
                  {s.topContrib !== null && <span className="tnum ml-1 text-bad">{pts(s.topContrib)}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* explanation */}
      <div className="border-b border-line px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <Label>Why the model flags this cluster</Label>
          <span className="text-[11px] text-faint">Mean contribution across {withP1.length} sites, probability points</span>
        </div>
        {agg.map((a) => (
          <div key={a.f.id} className="grid grid-cols-[250px_1fr_56px] items-center gap-3 py-1 text-xs">
            <div className="min-w-0" title={a.f.definition}>
              <div className="truncate">{a.f.label}</div>
              <div className="tnum truncate text-[10.5px] text-faint">
                mean {num(a.vmean, a.vmean < 10 ? 2 : 1)} {a.f.unit} vs p90 {num(a.f.pop_p90, a.f.pop_p90 < 10 ? 2 : 1)} · <span className={a.beyond ? 'text-muted' : undefined}>{a.beyond}/{withP1.length} past p90</span>
              </div>
            </div>
            <div className="relative h-2.5 bg-line/50">
              <div className="absolute inset-y-0 left-1/2 w-px bg-line2" />
              <div className="absolute inset-y-0" style={a.mean >= 0 ? { left: '50%', width: `${(a.mean / maxAbs) * 50}%`, background: '#FF3B3B' } : { right: '50%', width: `${(-a.mean / maxAbs) * 50}%`, background: '#2ECC71' }} />
            </div>
            <div className={clsx('tnum text-right font-semibold', a.mean >= 0 ? 'text-bad' : 'text-ok')}>{pts(a.mean)}</div>
          </div>
        ))}
      </div>

      {/* coverage */}
      <div className="border-b border-line px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Program coverage</Label>
          <span className="text-[11px] text-faint">Program Match Agent <Fresh f="D-1" /></span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <CoverageBadge c={c} plan={plan} />
          <span className="text-muted">{coverageText(c)}</span>
        </div>
        {(() => {
          const wh = incidents.find((x) => x.incident_id === c.incident_id)?.stock_prepositioned
          const name = wh ? db().meta.warehouses.find((w) => w.warehouse_id === wh)?.name ?? wh : null
          return name ? (
            <div className="mt-1.5 text-xs text-muted">
              Stock pre-positioned at <span className="text-ink">{name}</span> by the Warehouse Agent: the plan draws on it first.
            </div>
          ) : null
        })()}
      </div>

      {/* ladder */}
      <div className="border-b border-line px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between">
          <Label>Action ladder · cheapest first</Label>
          <span className="text-[11px] text-faint">Action Ladder Agent · window {win} d</span>
        </div>
        <table className="w-full text-xs">
          <tbody>
            {opts.map((o) => {
              const isRec = o.rank === rec?.rank
              const ok = fits(o, c)
              return (
                <tr key={o.rank} className={clsx('border-b border-line/60', isRec && 'bg-ioh-yellow/[0.06]')}>
                  <td className="w-6 py-1.5 font-mono text-faint">{o.rank}</td>
                  <td className="py-1.5">
                    <span className={clsx(isRec && 'font-semibold text-ink')}>{o.name}</span>
                    {isRec && <Badge tone="yellow" className="ml-2">Recommended</Badge>}
                    <div className="text-[10.5px] text-faint">{INTERVENTION_LABEL[o.class]} · {o.predicted_uplift}</div>
                  </td>
                  <td className="tnum py-1.5 text-right">{o.cost_idr ? idr(o.cost_idr) : 'IDR 0'}</td>
                  <td className="tnum w-14 py-1.5 text-right text-muted">{o.lead_days} d</td>
                  <td className="w-16 py-1.5 text-right">{ok ? <span className="inline-flex items-center gap-0.5 text-ok"><Check size={12} />fits</span> : <span className="inline-flex items-center gap-0.5 text-bad"><X size={12} />late</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {bridge && rec && (
          <div className="mt-2 border-l-2 border-warn bg-warn/5 px-2 py-1.5 text-xs text-muted">
            <span className="font-semibold text-warn">Bridge needed.</span> {rec.name} lands in {rec.lead_days} d, after the {win}-day window. Bridge with <span className="text-ink">{bridge.name.toLowerCase()}</span> ({bridge.lead_days} d, {bridge.cost_idr ? idr(bridge.cost_idr) : 'zero cost'}).
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-panel px-4 py-3">
        <div className="min-w-0 text-xs text-muted">
          {plan ? (
            <>
              Plan <span className="font-mono text-ink">{plan.id}</span> already exists · {plan.status.replace('_', ' ')}
            </>
          ) : (
            <>
              Plan builder will draft <span className="text-ink">{iv?.label ?? CLASS_META[c.cls].defaultIntervention}</span> for {c.site_ids.length} sites: BOQ, stock, vendor, PO draft, critical path.
            </>
          )}
        </div>
        {plan ? (
          <Button variant="primary" onClick={() => nav(`/phase1/plans/${plan.id}`)}>
            Open plan {plan.id} <ArrowRight size={14} />
          </Button>
        ) : (
          <Button variant="primary" disabled={!canBuild} title={canBuild ? undefined : 'Planning, Operations, Region or Exec roles build plans'} onClick={() => build(c)}>
            Build plan <ArrowRight size={14} />
          </Button>
        )}
      </div>
    </Drawer>
  )
}
