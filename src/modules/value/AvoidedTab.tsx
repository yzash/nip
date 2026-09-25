import { useMemo, useState } from 'react'
import { Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import { Badge, Fresh, Id, Kpi, Label, Panel, Seg, Td, Th } from '@/components/ui'
import { SERIES } from '@/lib/colors'
import { CLASS_LABEL, date, idr, num } from '@/lib/format'
import { AXIS, GRID, LegendItem, SyntheticNote, TOOLTIP } from './chart'
import { avoidedTotals } from './calc'

export function AvoidedTab() {
  const D = db()
  const T = avoidedTotals()
  const [cls, setCls] = useState<string>('all')
  const byClass = useMemo(() => {
    const m = new Map<string, { cls: string; n: number; outage: number; cost: number; hours: number }>()
    for (const a of D.avoided) {
      const r = m.get(a.class) ?? { cls: a.class, n: 0, outage: 0, cost: 0, hours: 0 }
      r.n++
      r.outage += a.outage_cost_idr
      r.cost += a.intervention_cost_idr
      r.hours += a.predicted_outage_hours
      m.set(a.class, r)
    }
    return [...m.values()].sort((a, b) => b.outage - a.outage)
  }, [D.avoided])
  const rows = useMemo(() => [...D.avoided].filter((a) => cls === 'all' || a.class === cls).sort((a, b) => b.date.localeCompare(a.date)), [D.avoided, cls])
  const best = byClass[0]
  const neg = byClass.filter((c) => c.outage < c.cost)

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      <div className="border border-line bg-panel px-5 py-4">
        <Label>Avoided cost · proactive interventions that would otherwise have become outages</Label>
        <div className="mt-1 text-[20px] font-semibold leading-8">
          {T.n} predicted failures fixed before they happened avoided {num(Math.round(T.hours))} outage hours worth {idr(T.outage)}, for {idr(T.cost)} of intervention cost
        </div>
        <div className="mt-1 text-sm text-muted">
          {best ? `${CLASS_LABEL[best.cls]} returns the most (${idr(best.outage)} avoided). ` : ''}
          {neg.length > 0 && `${neg.map((c) => CLASS_LABEL[c.cls]).join(' and ')} cost more than the outage revenue avoided: the case there rests on SLA penalties and churn, not revenue alone.`}
        </div>
      </div>

      <div className="grid grid-cols-2 border border-line bg-panel xl:grid-cols-4">
        <Kpi className="border-r max-xl:border-b" label="Outage cost avoided" fresh="D-1" value={idr(T.outage)} tone="yellow" sub={`${T.n} interventions since ${date(D.avoided.map((a) => a.date).sort()[0])}`} />
        <Kpi className="border-r max-xl:border-b xl:border-r" label="Intervention cost" fresh="D-1" value={idr(T.cost)} sub="OpEx and minor CapEx actually spent" />
        <Kpi className="border-r" label="Net avoided" fresh="D-1" value={idr(T.net)} tone={T.net >= 0 ? 'ok' : 'bad'} sub={`${(T.outage / Math.max(1, T.cost)).toFixed(2)}x return on intervention`} />
        <Kpi label="Outage hours avoided" fresh="D-1" value={num(Math.round(T.hours))} sub={`${(T.hours / T.n).toFixed(1)} h per event (predicted)`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[480px_1fr]">
        <Panel
          title="By failure class"
          right={
            <span className="flex gap-3">
              <LegendItem square color={SERIES[0]} label="Outage avoided" />
              <LegendItem square color={SERIES[6]} label="Intervention" />
            </span>
          }
        >
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byClass.map((c) => ({ ...c, label: CLASS_LABEL[c.cls] }))} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} width={44} tickFormatter={(v: number) => `${(v / 1e6).toFixed(0)}m`} />
                <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [idr(v), n === 'outage' ? 'Outage cost avoided' : 'Intervention cost']} />
                <RBar dataKey="outage" fill={SERIES[0]} isAnimationActive={false} maxBarSize={28} />
                <RBar dataKey="cost" fill={SERIES[6]} isAnimationActive={false} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="mt-3 w-full">
            <thead>
              <tr>
                <Th className="px-0">Class</Th>
                <Th className="text-right">Events</Th>
                <Th className="text-right">Avoided</Th>
                <Th className="text-right">Cost</Th>
                <Th className="pr-0 text-right">Net</Th>
              </tr>
            </thead>
            <tbody>
              {byClass.map((c) => (
                <tr key={c.cls}>
                  <Td className="px-0">{CLASS_LABEL[c.cls]}</Td>
                  <Td className="tnum text-right">{c.n}</Td>
                  <Td className="tnum text-right">{idr(c.outage)}</Td>
                  <Td className="tnum text-right text-muted">{idr(c.cost)}</Td>
                  <Td className={`tnum pr-0 text-right font-semibold ${c.outage - c.cost >= 0 ? 'text-ok' : 'text-bad'}`}>{idr(c.outage - c.cost)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel
          pad={false}
          title="Interventions"
          right={
            <span className="flex items-center gap-2">
              <Seg options={[{ id: 'all', label: 'All' }, ...byClass.map((c) => ({ id: c.cls, label: CLASS_LABEL[c.cls] }))]} value={cls} onChange={setCls} />
              <Fresh f="D-1" />
            </span>
          }
        >
          <div className="max-h-[470px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Site</Th>
                  <Th>Class</Th>
                  <Th>Intervention</Th>
                  <Th className="text-right">Predicted outage</Th>
                  <Th className="text-right">Outage cost avoided</Th>
                  <Th className="text-right">Intervention cost</Th>
                  <Th className="text-right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const s = D.sites[D.siteIdx.get(a.site_id)!]
                  const net = a.outage_cost_idr - a.intervention_cost_idr
                  return (
                    <tr key={`${a.site_id}-${i}`} className="hover:bg-panel2">
                      <Td className="tnum text-muted">{date(a.date)}</Td>
                      <Td>
                        <Id>{a.site_id}</Id> <span className="ml-1 text-muted">{s?.name}</span>
                        <div className="text-xs text-faint">{s ? D.provById[s.province_id]?.name : ''}</div>
                      </Td>
                      <Td>
                        <Badge>{CLASS_LABEL[a.class]}</Badge>
                      </Td>
                      <Td>{a.intervention}</Td>
                      <Td className="tnum text-right">{a.predicted_outage_hours.toFixed(1)} h</Td>
                      <Td className="tnum text-right">{idr(a.outage_cost_idr)}</Td>
                      <Td className="tnum text-right text-muted">{idr(a.intervention_cost_idr)}</Td>
                      <Td className={`tnum text-right font-semibold ${net >= 0 ? 'text-ok' : 'text-bad'}`}>{idr(net)}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-2 text-xs text-faint">Outage cost = site revenue exposure × predicted outage hours. Counterfactual outage hours come from the prediction at the time of intervention.</div>
        </Panel>
      </div>
      <SyntheticNote />
    </div>
  )
}
