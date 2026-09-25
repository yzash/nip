import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import type { Incident } from '@/data/types'
import { Badge, Fresh, Id, Label, Panel } from '@/components/ui'
import { addDays, CLASS_LABEL, date, dateShort, idr, num } from '@/lib/format'
import { isOpen } from '@/lib/metrics'
import { buildPlan, INTERVENTIONS, interventionFromOption } from '@/lib/plan'
import { nextProgramId, todayIso, useApp } from '@/store/app'
import { AXIS, CLASSES, GRID, TOOLTIP } from './model'

// Placeholders for IOH calibration (PRD §3: every baseline is a placeholder, not a claim).
const ARPU = 60_000
const LIFETIME_MONTHS = 18
const CHURN_UPLIFT = 0.25
const EMERGENCY_PREMIUM = 0.15

export function Scenario() {
  const nav = useNavigate()
  const incidents = useApp((s) => s.incidents)
  const programs = useApp((s) => s.programs)
  const reservations = useApp((s) => s.reservations)
  const D = db()
  const candidates = useMemo(
    () => incidents.filter((i) => isOpen(i) && i.source === 'prediction' && (CLASSES as string[]).includes(i.class)).sort((a, b) => b.exposure_idr - a.exposure_idr),
    [incidents],
  )
  const [id, setId] = useState(D.meta.story_incidents.bekasi_capacity)
  const inc: Incident | undefined = candidates.find((c) => c.incident_id === id) ?? incidents.find((c) => c.incident_id === id) ?? candidates[0]

  const s = useMemo(() => {
    if (!inc) return null
    const opts = D.optionsByIncident.get(inc.incident_id) ?? []
    const rec = opts.find((o) => o.rank === inc.recommended_rank) ?? opts[0]
    const W = inc.days_to_breach ?? inc.predicted_week * 7
    const iv = rec ? interventionFromOption(rec.name) : 'refarm'
    const planable = !!rec && !(iv === 'refarm' && !/refarm|parameter/i.test(rec.name))
    const plan = planable
      ? buildPlan({ siteIds: inc.site_ids, intervention: iv, sourceIncident: inc.incident_id, programs, reservations, windowDays: W, today: todayIso(), nextProgramId: nextProgramId(programs) })
      : null
    const actCost = plan ? plan.capex_total_idr : rec?.cost_idr ?? 0
    const fullDays = plan ? plan.rfs_days : rec?.lead_days ?? 0
    const bridge = plan?.bridge ?? null
    const relief = bridge ? bridge.days : fullDays
    const actDeg = Math.max(0, relief - W)
    const legacyWeeks = Object.values(D.meta.legacy_stage_weeks).reduce((a, b) => a + b, 0)
    const L = Math.round(legacyWeeks * 7)
    const waitRelief = W + L
    const perDay = inc.exposure_idr / 30
    const churnFull = inc.churn_risk_subs * ARPU * LIFETIME_MONTHS * CHURN_UPLIFT
    const act = { cost: actCost, revenue: perDay * actDeg, churn: churnFull * (actDeg / L), relief, full: fullDays, deg: actDeg }
    const wait = { cost: actCost * (1 + EMERGENCY_PREMIUM), revenue: perDay * L, churn: churnFull, relief: waitRelief, full: waitRelief, deg: L }
    const tot = (x: typeof act) => x.cost + x.revenue + x.churn
    return { rec, plan, planable, W, bridge, act, wait, L, legacyWeeks, totAct: tot(act), totWait: tot(wait), iv }
  }, [inc, programs, reservations, D])

  if (!inc || !s) return <div className="p-6 text-muted">No open predicted incidents.</div>
  const protectedRev = s.wait.revenue - s.act.revenue + (s.wait.churn - s.act.churn)
  const net = s.totWait - s.totAct
  const chart = [
    { name: 'Act now', cost: s.act.cost / 1e9, revenue: s.act.revenue / 1e9, churn: s.act.churn / 1e9 },
    { name: 'Wait for alarm', cost: s.wait.cost / 1e9, revenue: s.wait.revenue / 1e9, churn: s.wait.churn / 1e9 },
  ]
  const ivLabel = s.plan ? s.plan.intervention_label : s.rec?.name ?? '—'
  const today = todayIso()

  return (
    <div className="space-y-4 p-6">
      <section className="border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Label>Act now vs wait for alarm</Label>
              <Fresh f="D-1" asOf={D.meta.as_of} />
            </div>
            <div className="tnum mt-1.5 text-[22px] font-semibold leading-8 tracking-tight">
              Acting now protects <span className="text-ioh-yellow">{idr(protectedRev)}</span> and relieves customers{' '}
              <span className="text-ioh-yellow">{s.wait.relief - s.act.relief} days sooner</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              <Id onClick={() => nav(`/incidents?incident=${inc.incident_id}`)} className="hover:underline">
                {inc.incident_id}
              </Id>{' '}
              {inc.title} · breach in {s.W} days ({date(addDays(today, s.W))}) · exposure {idr(inc.exposure_idr)}/month · {num(inc.churn_risk_subs)} churn-risk subscribers
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <label className="text-2xs font-semibold uppercase tracking-wider text-faint">Open predicted incident</label>
            <select value={inc.incident_id} onChange={(e) => setId(e.target.value)} className="h-8 w-[360px] border border-line2 bg-panel2 px-2 text-sm">
              {candidates.map((c) => (
                <option key={c.incident_id} value={c.incident_id}>
                  {c.incident_id} · {CLASS_LABEL[c.class]} · {c.site_ids.length} site{c.site_ids.length > 1 ? 's' : ''} · {idr(c.exposure_idr)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4">
        <ScenarioCard
          className="col-span-12 lg:col-span-6 2xl:col-span-4"
          tone="act"
          title="Act now · NICC plan"
          subtitle={`${ivLabel}${s.bridge ? ` + bridge: ${s.bridge.label.split(' (')[0]}` : ''}`}
          rows={[
            ['Intervention cost', idr(s.act.cost), s.planable ? 'BOQ at price book' : 'Action ladder estimate'],
            ['Days to relief', s.bridge ? `${s.bridge.days} d bridge · ${s.act.full} d full` : `${s.act.full} d`, `Full relief ${dateShort(addDays(today, s.act.full))}`],
            ['Degraded days', `${s.act.deg} d`, s.act.deg ? 'Between breach and relief' : 'Relief lands before breach'],
            ['Revenue lost', idr(s.act.revenue), 'Exposure × degraded days'],
            ['Churn exposure', idr(s.act.churn), 'Pro-rata to degraded days'],
          ]}
          total={s.totAct}
        />
        <ScenarioCard
          className="col-span-12 lg:col-span-6 2xl:col-span-4"
          tone="wait"
          title="Wait for alarm · legacy cycle"
          subtitle={`Breach at W+${inc.predicted_week || Math.ceil(s.W / 7)}, then ${s.legacyWeeks} weeks of sequential stages`}
          rows={[
            ['Intervention cost', idr(s.wait.cost), `+${Math.round(EMERGENCY_PREMIUM * 100)}% emergency premium`],
            ['Days to relief', `${s.wait.relief} d`, `Relief ${dateShort(addDays(today, s.wait.relief))}`],
            ['Degraded days', `${s.wait.deg} d`, `≈ ${(s.wait.deg / 30).toFixed(1)} months degraded`],
            ['Revenue lost', idr(s.wait.revenue), 'Exposure × degraded months'],
            ['Churn exposure', idr(s.wait.churn), `${num(inc.churn_risk_subs)} subs × IDR 60k × 18 mo × 25%`],
          ]}
          total={s.totWait}
        />
        <Panel className="col-span-12 2xl:col-span-4" title="Total economic cost · IDR bn" right={<Badge tone="yellow">Net {idr(net)}</Badge>}>
          <div className="h-[252px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: -8 }} barCategoryGap="30%">
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" {...AXIS} />
                <YAxis {...AXIS} tickFormatter={(v: number) => v.toFixed(0)} />
                <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [`IDR ${v.toFixed(2)}bn`, n === 'cost' ? 'Intervention cost' : n === 'revenue' ? 'Revenue lost' : 'Churn exposure']} />
                <Legend
                  iconType="square"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 11, color: '#A3AAB8' }}
                  formatter={(n: string) => (n === 'cost' ? 'Intervention cost' : n === 'revenue' ? 'Revenue lost' : 'Churn exposure')}
                />
                <Bar dataKey="cost" stackId="a" fill="#5AA9E6" isAnimationActive={false} />
                <Bar dataKey="revenue" stackId="a" fill="#FF3B3B" isAnimationActive={false} />
                <Bar dataKey="churn" stackId="a" fill="#F5A623" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel title="Time to relief · days from today" pad={false}>
        <Timeline W={s.W} act={s.act.relief} actFull={s.act.full} bridge={!!s.bridge} wait={s.wait.relief} />
      </Panel>

      <Panel title="Assumptions · placeholders for IOH calibration (PRD §3)">
        <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-sm text-muted lg:grid-cols-2">
          <Assume k="Revenue exposure" v={`${idr(inc.exposure_idr)} per month for the incident (Revenue Exposure Agent), lost pro-rata per degraded day`} />
          <Assume k="Breach date" v={`${s.W} days: first week the 8-week failure probability crosses the red threshold`} />
          <Assume k="Act-now plan" v={s.planable ? `buildPlan with ${INTERVENTIONS[s.iv]?.label ?? s.iv}: BOQ, stock, vendor, parallel stages 4/5/6/6b, RFS D+${s.act.full}` : `Recommended rung "${s.rec?.name}" at ${idr(s.rec?.cost_idr ?? 0)}, ${s.rec?.lead_days} d lead`} />
          <Assume k="Bridge" v={s.bridge ? `${s.bridge.label}, live in ${s.bridge.days} days and treated as full relief until RFS` : 'Not needed: relief lands inside the window'} />
          <Assume k="Legacy cycle" v={`${Object.entries(D.meta.legacy_stage_weeks).map(([k, v]) => `${k} ${v}`).join(' · ')} = ${s.legacyWeeks} weeks, sequential`} />
          <Assume k="Emergency premium" v={`${Math.round(EMERGENCY_PREMIUM * 100)}% on reactive procurement and expedited logistics`} />
          <Assume k="Churn" v={`Churn-risk subscribers × ARPU IDR ${num(ARPU)} × ${LIFETIME_MONTHS}-month lifetime × ${Math.round(CHURN_UPLIFT * 100)}% uplift share if degraded through the legacy cycle`} />
          <Assume k="Not modelled" v="Enterprise SLA penalties, GB Factory upside, brand and NPS effects" />
        </div>
        <div className="mt-3 text-xs text-faint">Every figure on this tab is indicative. The validation session replaces these parameters with IOH figures; the prototype shows the method, not the number.</div>
      </Panel>
    </div>
  )
}

function ScenarioCard({ title, subtitle, rows, total, tone, className }: { title: string; subtitle: string; rows: [string, string, string][]; total: number; tone: 'act' | 'wait'; className?: string }) {
  return (
    <section className={clsx('flex flex-col border border-line bg-panel', tone === 'act' ? 'border-t-2 border-t-ioh-yellow' : 'border-t-2 border-t-bad', className)}>
      <header className="border-b border-line px-4 py-2.5">
        <div className={clsx('text-sm font-semibold', tone === 'act' ? 'text-ioh-yellow' : 'text-bad')}>{title}</div>
        <div className="truncate text-xs text-muted">{subtitle}</div>
      </header>
      <div className="flex-1 divide-y divide-line/70">
        {rows.map(([k, v, sub]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 px-4 py-2">
            <div className="min-w-0">
              <div className="text-sm text-muted">{k}</div>
              <div className="truncate text-[10.5px] text-faint">{sub}</div>
            </div>
            <div className="tnum shrink-0 text-right text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between border-t border-line bg-panel2 px-4 py-2.5">
        <span className="text-2xs font-semibold uppercase tracking-wider text-faint">Total economic cost</span>
        <span className={clsx('tnum text-lg font-semibold', tone === 'act' ? 'text-ioh-yellow' : 'text-bad')}>{idr(total)}</span>
      </div>
    </section>
  )
}

function Timeline({ W, act, actFull, bridge, wait }: { W: number; act: number; actFull: number; bridge: boolean; wait: number }) {
  const max = Math.ceil((wait + 7) / 7) * 7
  const x = (d: number) => `${(d / max) * 100}%`
  const ticks = Array.from({ length: Math.floor(max / 28) + 1 }, (_, k) => k * 28)
  const today = todayIso()
  return (
    <div className="px-4 pb-7 pt-3">
      <div className="flex">
        <div className="w-[150px] shrink-0 pt-6">
          <div className="flex h-9 items-center text-sm text-ioh-yellow">Act now</div>
          <div className="flex h-9 items-center text-sm text-bad">Wait for alarm</div>
        </div>
        <div className="relative min-w-0 flex-1">
          <div className="relative h-6">
            {ticks.map((d) => (
              <div key={d} className="tnum absolute top-0 whitespace-nowrap text-[10px] leading-3 text-faint" style={{ left: x(d), transform: d ? 'translateX(-50%)' : undefined }}>
                <div className="font-semibold text-muted">D+{d}</div>
                <div>{dateShort(addDays(today, d))}</div>
              </div>
            ))}
          </div>
          {ticks.map((d) => (
            <div key={d} className="absolute bottom-0 top-6 border-l border-line" style={{ left: x(d) }} />
          ))}
          {/* Act now */}
          <div className="relative h-9">
            {bridge && <div className="absolute top-2 h-5 bg-ok/70" style={{ left: 0, width: x(act) }} title="Bridge (refarm)" />}
            <div className="absolute top-2 h-5 border border-ioh-yellow/70 bg-ioh-yellow/25" style={{ left: bridge ? x(act) : 0, width: `calc(${x(actFull)} - ${bridge ? x(act) : '0%'})` }} />
            <span className="tnum absolute top-2.5 ml-2 whitespace-nowrap text-[11px] text-ink" style={{ left: x(actFull) }}>
              {bridge ? `Bridge D+${act} · ` : ''}RFS D+{actFull}
            </span>
          </div>
          {/* Wait */}
          <div className="relative h-9">
            <div className="absolute top-2 h-5 border border-line2 bg-panel2" style={{ left: 0, width: x(W) }} title="Healthy until breach" />
            <div className="absolute top-2 h-5 bg-bad/60" style={{ left: x(W), width: `calc(${x(wait)} - ${x(W)})` }} />
            <span className="tnum absolute top-2.5 ml-2 whitespace-nowrap text-[11px] text-ink" style={{ left: x(wait) }}>
              Relief D+{wait}
            </span>
            <span className="tnum absolute top-2.5 whitespace-nowrap px-1.5 text-[11px] font-semibold text-white" style={{ left: x(W) }}>
              Degraded {wait - W} d
            </span>
          </div>
          <div className="pointer-events-none absolute bottom-0 top-6" style={{ left: x(W), borderLeft: '1.5px dashed #FF3B3B' }}>
            <span className="tnum absolute -bottom-5 ml-1 whitespace-nowrap px-1 text-[10px] font-semibold text-bad">Breach D+{W}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Assume({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3 border-b border-line/50 py-1">
      <span className="w-[140px] shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">{k}</span>
      <span className="min-w-0 text-sm">{v}</span>
    </div>
  )
}
