import clsx from 'clsx'
import { ArrowLeft, ArrowRight, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Fresh, Id, Label, Spark } from '@/components/ui'
import { db, kpiSeries } from '@/data/db'
import type { FailureClass, KpiKey } from '@/data/types'
import { SEGMENT_LABEL, date, dateShort, idr, num } from '@/lib/format'
import { CLASS_META, useP1, type P1Data, type P1Feature, type P1Site } from '../model'
import { useP1Store } from '../store'
import {
  AXIS_TICK,
  ClassChip,
  CoverageBadge,
  GRID,
  GateBadge,
  RED_FLOOR,
  STORY_LABEL,
  TT,
  WATCH_FLOOR,
  crossing,
  districtName,
  pctTxt,
  planForCluster,
  provinceName,
  pts,
  sourceOf,
  useClusters,
  weekDate,
} from './forecast/common'

const KPI_BY_CLASS: Record<FailureClass, { k: KpiKey; label: string; unit: string; color: string; ref?: number }[]> = {
  capacity: [
    { k: 'prb_util', label: 'PRB utilisation, busy hour', unit: '%', color: '#5AA9E6', ref: 85 },
    { k: 'throughput_mbps', label: 'DL user throughput', unit: 'Mbps', color: '#A3AAB8' },
    { k: 'cnx', label: 'CNX score', unit: '', color: '#FFD100', ref: 65 },
  ],
  power: [
    { k: 'availability', label: 'Cell availability', unit: '%', color: '#F5A623', ref: 99.5 },
    { k: 'alarms', label: 'Alarms per day', unit: '', color: '#A3AAB8' },
    { k: 'cnx', label: 'CNX score', unit: '', color: '#FFD100', ref: 65 },
  ],
  transport: [
    { k: 'availability', label: 'Cell availability', unit: '%', color: '#8B5CF6', ref: 99.5 },
    { k: 'bad_session_pct', label: 'Bad sessions', unit: '%', color: '#A3AAB8', ref: 10 },
    { k: 'cnx', label: 'CNX score', unit: '', color: '#FFD100', ref: 65 },
  ],
  ran_hardware: [
    { k: 'availability', label: 'Cell availability', unit: '%', color: '#E4572E', ref: 99.5 },
    { k: 'alarms', label: 'Alarms per day', unit: '', color: '#A3AAB8' },
    { k: 'cnx', label: 'CNX score', unit: '', color: '#FFD100', ref: 65 },
  ],
  environmental: [
    { k: 'availability', label: 'Cell availability', unit: '%', color: '#2ECC71', ref: 99.5 },
    { k: 'alarms', label: 'Alarms per day', unit: '', color: '#A3AAB8' },
    { k: 'cnx', label: 'CNX score', unit: '', color: '#FFD100', ref: 65 },
  ],
}

/** Lower-case a label for running text, keeping acronyms (PRB, DL, RRC, VSWR) intact. */
function lc(s: string): string {
  return s.replace(/^(\S+)/, (w) => (/^[A-Z0-9/+-]{2,}$/.test(w) || /[A-Z].*[A-Z]/.test(w) ? w : w.toLowerCase()))
}

function fmtV(v: number, unit: string): string {
  if (unit === '0/1') return v >= 0.5 ? 'Yes' : 'No'
  if (Number.isInteger(v)) return num(v)
  const a = Math.abs(v)
  return num(v, a >= 100 ? 0 : a >= 10 ? 1 : 2)
}
function beyondP90(f: P1Feature, v: number): boolean {
  if (f.unit === '0/1') return f.direction === 1 ? v >= 0.5 && f.pop_p90 < 0.5 : false
  return f.direction === 1 ? v >= f.pop_p90 : v <= f.pop_p90
}

export function SiteExplainPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const D = db()
  const p1 = useP1()
  const plans = useP1Store((s) => s.plans)
  const clusters = useClusters()
  const i = D.siteIdx.get(id)

  if (i === undefined)
    return (
      <div className="absolute inset-0 flex items-center justify-center text-sm text-faint">
        Site <span className="mx-1 font-mono">{id}</span> is not in the site master.
      </div>
    )
  const site = D.sites[i]
  const f = D.forecast[i]
  const cls = f.failure_class
  const probs = f.failure_prob
  const p8 = probs[7]
  const cw = crossing(probs)
  const ps = p1?.bySite.get(id)
  const model = p1?.models.find((m) => m.failure_class === cls)
  const cluster = clusters.find((c) => c.site_ids.includes(id))
  const plan = cluster ? planForCluster(plans, cluster.id) : undefined
  const ci: [number, number] | null = ps?.ci90 ?? null
  const contribs = ps ? Object.entries(ps.contrib).sort((a, b) => b[1] - a[1]) : []
  const cat = p1?.feature_catalog[cls] ?? []
  const top2 = contribs.filter(([, v]) => v > 0).slice(0, 2)
  const labelOf = (fid: string) => cat.find((x) => x.id === fid)?.label ?? fid

  const headline = (() => {
    const what = cls === 'capacity' ? 'capacity saturation' : `${CLASS_META[cls].label.toLowerCase()} failure`
    let s = `The ${CLASS_META[cls].label.toLowerCase()} model gives ${site.name} a ${pctTxt(p8)} chance of ${what} by W+8 (${date(weekDate(8))})`
    if (cw) s += `, crossing the 60% red floor in W+${cw} (${dateShort(weekDate(cw))})`
    s += '.'
    if (top2.length) s += ` The biggest drivers are ${top2.map(([k, v]) => `${lc(labelOf(k))} (${pts(v)} pts)`).join(' and ')}.`
    return s
  })()

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        {/* breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-faint">
          <button onClick={() => nav(`/phase1/forecast${cluster ? `?cluster=${cluster.id}` : `?class=${cls}`}`)} className="flex items-center gap-1 hover:text-ink">
            <ArrowLeft size={13} /> Forecast
          </button>
          {cluster && (
            <>
              <span>/</span>
              <button onClick={() => nav(`/phase1/forecast?cluster=${cluster.id}`)} className="font-mono hover:text-ioh-yellow">
                {cluster.id}
              </button>
            </>
          )}
          <span>/</span>
          <span className="font-mono text-muted">{id}</span>
          <span className="ml-auto">Site Failure Prediction Agent · explanation</span>
        </div>

        {/* header */}
        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <Id className="text-sm text-ink">{id}</Id>
              <h1 className="text-[22px] font-semibold leading-7">{site.name}</h1>
              <ClassChip cls={cls} className="border border-line2 px-1.5 py-0.5 text-xs font-semibold" />
              <GateBadge cls={cls} />
              {site.story && STORY_LABEL[site.story] && <Badge tone="yellow">{STORY_LABEL[site.story]}</Badge>}
            </div>
            <div className="mt-1 text-sm text-muted">
              {districtName(site.district_id)}, {provinceName(site.province_id)} · {site.region} · {site.site_class} · {site.vendor} · {site.technologies.join('/')} · {site.backhaul} backhaul · {site.power_type} power · {site.tower_company}
            </div>
            <p className="mt-2 max-w-[900px] text-[15px] leading-6">{headline}</p>
          </div>
          {cluster && (
            <div className="w-[300px] shrink-0 border border-line bg-panel px-3 py-2">
              <div className="flex items-center justify-between">
                <Label>Forecast cluster</Label>
                <Fresh f="D-1" />
              </div>
              <button onClick={() => nav(`/phase1/forecast?cluster=${cluster.id}`)} className="mt-0.5 block w-full truncate text-left text-sm font-semibold hover:text-ioh-yellow">
                <span className="font-mono text-xs text-muted">{cluster.id}</span> {cluster.title}
              </button>
              <div className="mt-1 flex items-center justify-between gap-2">
                <CoverageBadge c={cluster} plan={plan} />
                {plan ? (
                  <Button size="sm" onClick={() => nav(`/phase1/plans/${plan.id}`)}>
                    Open {plan.id} <ArrowRight size={12} />
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => nav(`/phase1/forecast?cluster=${cluster.id}`)}>
                    Plan the cluster <ArrowRight size={12} />
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-6 border border-line bg-panel">
          {[
            { l: 'p(fail) by W+8', v: <span style={{ color: p8 >= RED_FLOOR ? '#FF3B3B' : p8 >= WATCH_FLOOR ? '#F5A623' : undefined }}>{pctTxt(p8, 1)}</span>, s: ci ? `90% interval ${pctTxt(ci[0])}–${pctTxt(ci[1])}` : 'No interval below 30%', f: 'D-1' },
            { l: 'Crosses 60%', v: cw ? `W+${cw}` : '—', s: cw ? date(weekDate(cw)) : 'Not red inside 8 weeks', f: 'D-1' },
            { l: 'Base rate', v: pctTxt(p1?.base_rate[cls] ?? model?.base_rate ?? 0, 1), s: 'Prior, any 8 weeks', f: undefined },
            { l: 'Model', v: <span className="font-mono">v{model?.current_version ?? '—'}</span>, s: model ? `Precision ${Math.round(model.precision_top_decile * 100)}% at alert (60% threshold)` : '—', f: undefined },
            { l: 'First flagged red', v: ps && ps.first_flagged_run !== null && p1 ? dateShort(p1.run_dates[ps.first_flagged_run]) : '—', s: ps ? stabilityText(ps, p1) : 'Never above the floor', f: 'D-1' },
            { l: 'Revenue / month', v: idr(D.revenue.latest[i]), s: `${num(site.subscribers)} subscribers`, f: 'M-1' },
          ].map((k, n) => (
            <div key={k.l} className={clsx('min-w-0 px-4 py-2.5', n < 5 && 'border-r border-line')}>
              <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
                <span className="truncate">{k.l}</span>
                {k.f && <Fresh f={k.f} />}
              </div>
              <div className="tnum mt-0.5 truncate text-xl font-semibold leading-7">{k.v}</div>
              <div className="tnum truncate text-xs text-muted" title={typeof k.s === 'string' ? k.s : undefined}>{k.s}</div>
            </div>
          ))}
        </div>

        {/* curve + stability */}
        <div className="mt-4 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4">
          <ProbCurve probs={probs} ci={ci} />
          {ps && p1 ? <Stability ps={ps} p1={p1} /> : <BelowWatch p8={p8} />}
        </div>

        {ps && p1 && (
          <>
            {/* waterfall + what would change */}
            <div className="mt-4 grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] items-start gap-4">
              <Waterfall ps={ps} p1={p1} />
              <div className="flex flex-col gap-4">
                <WhatWouldChange ps={ps} p1={p1} />
                <Customers i={i} />
              </div>
            </div>
            <FeatureTable ps={ps} p1={p1} />
          </>
        )}
        {!ps && (
          <div className="mt-4">
            <Customers i={i} />
          </div>
        )}

        <KpiHistory i={i} cls={cls} />
        <div className="mt-2 pb-2 text-[11px] text-faint">
          Contributions are SHAP-style attributions in probability points: base rate plus every contribution equals the calibrated probability. Explanations are computed for every site at ≥ 30% by W+8 on each daily run.
        </div>
      </div>
    </div>
  )
}

function stabilityText(ps: P1Site, p1: P1Data | null): string {
  if (!p1) return ''
  let n = 0
  for (let k = ps.runs.length - 1; k >= 0 && ps.runs[k] >= RED_FLOOR; k--) n++
  if (n === 0) return 'Not red on the latest run'
  return n === ps.runs.length ? `Red on all ${n} weekly runs` : `Red for ${n} consecutive weekly run${n > 1 ? 's' : ''}`
}

// ---- Probability curve ----------------------------------------------------------------------
function ProbCurve({ probs, ci }: { probs: number[]; ci: [number, number] | null }) {
  const p8 = probs[7]
  const data = probs.map((p, k) => {
    // 90% interval is published for W+8; earlier weeks scale it by p(k)/p(8)
    const lo = ci && p8 > 0 ? (p * ci[0]) / p8 : p
    const hi = ci && p8 > 0 ? Math.min(1, (p * ci[1]) / p8) : p
    return { w: `W+${k + 1}`, d: dateShort(weekDate(k + 1)), p: +(p * 100).toFixed(1), band: [+(lo * 100).toFixed(1), +(hi * 100).toFixed(1)] }
  })
  return (
    <section className="border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">8-week failure probability</h3>
        <span className="flex items-center gap-3 text-[11px] text-faint">
          <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-ioh-yellow" />p(fail by week)</span>
          {ci && <span className="flex items-center gap-1"><span className="h-2.5 w-4 bg-ioh-yellow/20" />90% interval</span>}
          <span className="flex items-center gap-1"><span className="w-4 border-t border-dashed border-bad" />60% red floor</span>
          <Fresh f="D-1" />
        </span>
      </header>
      <div className="h-[230px] px-2 pt-3">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 6, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="w" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} />
            <YAxis domain={[0, 100]} ticks={[0, 30, 60, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="%" />
            <Tooltip {...TT} formatter={(v: number | number[], n: string) => (Array.isArray(v) ? [`${v[0]}–${v[1]}%`, '90% interval'] : [`${v}%`, n === 'p' ? 'p(fail)' : n])} labelFormatter={(l, pl) => `${l} · week ending ${pl?.[0]?.payload?.d ?? ''}`} />
            <ReferenceLine y={60} stroke="#FF3B3B" strokeDasharray="4 3" />
            <ReferenceLine y={30} stroke="#F5A623" strokeDasharray="2 4" strokeOpacity={0.6} />
            {ci && <Area dataKey="band" stroke="none" fill="#FFD100" fillOpacity={0.14} isAnimationActive={false} />}
            <Line dataKey="p" stroke="#FFD100" strokeWidth={2} dot={{ r: 2.5, fill: '#FFD100', stroke: 'none' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

function BelowWatch({ p8 }: { p8: number }) {
  return (
    <section className="flex flex-col justify-center border border-line bg-panel px-6 py-6">
      <Badge tone="neutral" className="self-start">Below watch threshold</Badge>
      <div className="mt-3 text-lg font-semibold">{pctTxt(p8, 1)} by W+8: nothing to explain yet.</div>
      <p className="mt-1 text-sm text-muted">
        The Site Failure Prediction Agent computes feature contributions, intervals and run history only for sites at or above 30% by W+8 (the watch list). This site stays on the daily score and is re-evaluated on every run.
      </p>
    </section>
  )
}

// ---- Stability ------------------------------------------------------------------------------
function Stability({ ps, p1 }: { ps: P1Site; p1: P1Data }) {
  const data = ps.runs.map((r, k) => ({ d: dateShort(p1.run_dates[k]), p: +(r * 100).toFixed(1) }))
  const ff = ps.first_flagged_run
  const delta = ps.runs[ps.runs.length - 1] - ps.runs[0]
  const prev = ps.runs[ps.runs.length - 2]
  const txt = stabilityText(ps, p1)
  return (
    <section className="border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">Prediction stability · last 9 weekly runs</h3>
        <Fresh f="D-1" />
      </header>
      <div className="px-4 pt-2 text-sm">
        <span className="font-semibold">{txt}.</span>{' '}
        <span className="text-muted">
          {ff !== null ? `First flagged on the ${date(p1.run_dates[ff])} run. ` : ''}
          p(W+8) moved {pts(delta)} pts since {dateShort(p1.run_dates[0])}, {pts(ps.runs[ps.runs.length - 1] - prev)} pts on the last run.
        </span>
      </div>
      <div className="h-[178px] px-2 pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="d" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} interval={1} />
            <YAxis domain={[0, 100]} ticks={[0, 30, 60, 100]} tick={AXIS_TICK} axisLine={false} tickLine={false} unit="%" />
            <Tooltip {...TT} formatter={(v: number) => [`${v}%`, 'p(W+8) on that run']} labelFormatter={(l) => `Run ${l}`} />
            <ReferenceLine y={60} stroke="#FF3B3B" strokeDasharray="4 3" />
            <Line dataKey="p" stroke="#A3AAB8" strokeWidth={1.8} dot={(pr: { cx?: number; cy?: number; index?: number; payload?: { p: number } }) => <circle key={pr.index} cx={pr.cx} cy={pr.cy} r={2.6} fill={(pr.payload?.p ?? 0) >= 60 ? '#FF3B3B' : '#A3AAB8'} />} isAnimationActive={false} />
            {ff !== null && <ReferenceDot x={data[ff].d} y={data[ff].p} r={6} fill="none" stroke="#FFD100" strokeWidth={1.5} label={{ value: 'first flagged', position: 'top', fill: '#FFD100', fontSize: 10 }} />}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

// ---- Waterfall ------------------------------------------------------------------------------
function Waterfall({ ps, p1 }: { ps: P1Site; p1: P1Data }) {
  const base = p1.base_rate[ps.failure_class]
  const cat = p1.feature_catalog[ps.failure_class]
  // positives first (largest down), then negatives, so the running total never dips below zero
  const items = Object.entries(ps.contrib).sort((a, b) => (b[1] >= 0 ? 1 : 0) - (a[1] >= 0 ? 1 : 0) || Math.abs(b[1]) - Math.abs(a[1]))
  let run = base
  const rows = items.map(([k, v]) => {
    const start = run
    run += v
    return { k, label: cat.find((x) => x.id === k)?.label ?? k, v, start, end: run }
  })
  const sum = items.reduce((s, [, v]) => s + v, 0)
  const hi = Math.min(1, Math.max(ps.p8, ...rows.map((r) => Math.max(r.start, r.end))) + 0.05)
  const x = (p: number) => `${(Math.max(0, p) / hi) * 100}%`
  return (
    <section className="border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">Why the model thinks this site fails · contribution waterfall</h3>
        <span className="flex items-center gap-3 text-[11px] text-faint">
          <span className="flex items-center gap-1"><span className="h-2 w-3 bg-bad" />raises risk</span>
          <span className="flex items-center gap-1"><span className="h-2 w-3 bg-ok" />lowers risk</span>
        </span>
      </header>
      <div className="px-4 py-3">
        <WRow label="Base rate" sub={`${CLASS_META[ps.failure_class].label} model prior`} left={x(0)} width={x(base)} color="#6B7280" val={pctTxt(base, 1)} floor={x(RED_FLOOR)} />
        {rows.map((r) => (
          <WRow
            key={r.k}
            label={r.label}
            left={x(Math.min(r.start, r.end))}
            width={x(Math.abs(r.v))}
            color={r.v >= 0 ? '#FF3B3B' : '#2ECC71'}
            val={`${pts(r.v)} pts`}
            valClass={r.v >= 0 ? 'text-bad' : 'text-ok'}
            floor={x(RED_FLOOR)}
            connector={x(r.end)}
          />
        ))}
        <WRow label="p(fail) by W+8" left={x(0)} width={x(ps.p8)} color="#FFD100" val={pctTxt(ps.p8, 1)} bold floor={x(RED_FLOOR)} />
        <div className="relative mt-1 h-4 pl-[220px] pr-[70px] text-[10px] text-faint">
          <div className="relative h-full">
            {[0, 0.2, 0.4, 0.6, 0.8, 1].filter((t) => t <= hi + 0.001).map((t) => (
              <span key={t} className="tnum absolute -translate-x-1/2" style={{ left: x(t) }}>
                {Math.round(t * 100)}%
              </span>
            ))}
          </div>
        </div>
        <div className="tnum mt-2 border-t border-line pt-2 text-[11px] text-faint">
          Check: base {pctTxt(base, 1)} {sum >= 0 ? '+' : '−'} {Math.abs(sum * 100).toFixed(1)} pts of contributions = {pctTxt(base + sum, 1)} (model output {pctTxt(ps.p8, 1)}). Dashed line is the 60% red floor.
        </div>
      </div>
    </section>
  )
}

function WRow({ label, sub, left, width, color, val, valClass, bold, floor, connector }: { label: string; sub?: string; left: string; width: string; color: string; val: string; valClass?: string; bold?: boolean; floor: string; connector?: string }) {
  return (
    <div className="grid grid-cols-[220px_1fr_70px] items-center py-[3px] text-xs">
      <div className={clsx('truncate pr-3', bold && 'font-semibold text-ink')} title={sub}>
        {label}
      </div>
      <div className="relative h-5">
        <div className="absolute inset-y-[-3px] w-px border-l border-dashed border-bad/70" style={{ left: floor }} />
        <div className="absolute inset-y-[3px]" style={{ left, width, background: color, minWidth: 2 }} />
        {connector && <div className="absolute bottom-[-6px] top-[17px] w-px bg-line2" style={{ left: connector }} />}
      </div>
      <div className={clsx('tnum text-right', bold ? 'font-semibold text-ioh-yellow' : valClass ?? 'text-muted')}>{val}</div>
    </div>
  )
}

// ---- What would change the prediction -------------------------------------------------------
function WhatWouldChange({ ps, p1 }: { ps: P1Site; p1: P1Data }) {
  const cat = p1.feature_catalog[ps.failure_class]
  const need = ps.p8 - (RED_FLOOR - 0.005) // points to remove to drop below the floor
  const top = Object.entries(ps.contrib)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
  const both = top.reduce((s, [, v]) => s + v, 0)
  return (
    <section className="border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">What would change the prediction</h3>
        <Badge tone="neutral">Estimate</Badge>
      </header>
      <div className="space-y-2.5 px-4 py-3 text-sm">
        {ps.p8 < RED_FLOOR ? (
          <p className="text-muted">The site is below the 60% red floor. The two largest drivers would need to rise for it to turn red.</p>
        ) : (
          <p className="text-muted">
            To fall below the 60% red floor the site needs <span className="tnum font-semibold text-ink">{(need * 100).toFixed(1)} pts</span> less risk.
          </p>
        )}
        {top.map(([k, c]) => {
          const f = cat.find((x) => x.id === k)
          if (!f) return null
          const v = ps.values[k]
          const binary = f.unit === '0/1'
          let target: string
          if (ps.p8 < RED_FLOOR) target = `Contributes ${pts(c)} pts today.`
          else if (binary) target = c >= need ? `Changing it (${fmtV(v, f.unit)} → ${fmtV(1 - v, f.unit)}) alone would take the site below the floor.` : `Changing it removes up to ${(c * 100).toFixed(1)} pts; not enough on its own.`
          else if (c >= need && Math.abs(v - f.pop_p50) > 1e-6) {
            // contribution assumed proportional to the distance from the population median
            let t = f.pop_p50 + ((v - f.pop_p50) * (c - need)) / c
            if (f.unit === 'count') t = f.direction === 1 ? Math.floor(t) : Math.ceil(t)
            target = `Below the floor at about ${fmtV(t, f.unit)} ${f.unit} (from ${fmtV(v, f.unit)}), all else equal.`
          } else target = `Even at the population median (${fmtV(f.pop_p50, f.unit)} ${f.unit}) it removes only ${(c * 100).toFixed(1)} pts; not enough on its own.`
          return (
            <div key={k} className="border-l-2 border-bad/70 pl-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{f.label}</span>
                <span className="tnum text-xs text-bad">{pts(c)} pts</span>
              </div>
              <div className="tnum text-xs text-muted">{target}</div>
            </div>
          )
        })}
        {ps.p8 >= RED_FLOOR && top.length === 2 && (
          <div className="tnum text-xs text-muted">
            Both back to the population median: p ≈ <span className="font-semibold text-ink">{pctTxt(Math.max(0, ps.p8 - both), 0)}</span>
            {ps.p8 - both < RED_FLOOR ? ', below the floor.' : ', still red: the risk is spread across several features.'}
          </div>
        )}
        <div className="flex items-start gap-1.5 text-[10.5px] leading-4 text-faint">
          <Info size={11} className="mt-0.5 shrink-0" /> Linear estimate from the attributions, assuming each contribution scales with the distance from the population median. The model is non-linear; use it to judge what an intervention must move, not as a forecast.
        </div>
      </div>
    </section>
  )
}

// ---- Feature table --------------------------------------------------------------------------
function FeatureTable({ ps, p1 }: { ps: P1Site; p1: P1Data }) {
  const [open, setOpen] = useState<string | null>(null)
  const cat = [...p1.feature_catalog[ps.failure_class]].sort((a, b) => Math.abs(ps.contrib[b.id] ?? 0) - Math.abs(ps.contrib[a.id] ?? 0))
  const maxImp = Math.max(...cat.map((f) => f.importance))
  return (
    <section className="mt-4 border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">
          {CLASS_META[ps.failure_class].label} features · {cat.length} inputs to the model
        </h3>
        <span className="text-[11px] text-faint">Values beyond the population p90 (risk side) in red · click a row for source and definition</span>
      </header>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wider text-faint">
            <th className="w-6 py-2 pl-4" />
            <th className="py-2 pr-3 font-semibold">Feature</th>
            <th className="px-3 py-2 text-right font-semibold">This site</th>
            <th className="px-3 py-2 font-semibold">vs population</th>
            <th className="px-3 py-2 text-right font-semibold">p50</th>
            <th className="px-3 py-2 text-right font-semibold">p90</th>
            <th className="px-3 py-2 text-right font-semibold">Contribution</th>
            <th className="px-3 py-2 font-semibold">Importance</th>
            <th className="px-3 py-2 font-semibold">Source · window</th>
            <th className="px-4 py-2 font-semibold">Freshness</th>
          </tr>
        </thead>
        <tbody>
          {cat.map((f) => {
            const v = ps.values[f.id]
            const c = ps.contrib[f.id] ?? 0
            const hot = beyondP90(f, v)
            const src = sourceOf(f.source)
            const isOpen = open === f.id
            return (
              <FeatureRow key={f.id} f={f} v={v} c={c} hot={hot} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : f.id)} maxImp={maxImp} src={src} />
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function FeatureRow({ f, v, c, hot, isOpen, onToggle, maxImp, src }: { f: P1Feature; v: number; c: number; hot: boolean; isOpen: boolean; onToggle: () => void; maxImp: number; src: ReturnType<typeof sourceOf> }) {
  const live = src?.status === 'on_netra'
  return (
    <>
      <tr onClick={onToggle} className={clsx('cursor-pointer border-t border-line/70 hover:bg-panel2', isOpen && 'bg-panel2')}>
        <td className="py-2 pl-4 text-faint">{isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
        <td className="py-2 pr-3" title={f.definition}>
          {f.label}
        </td>
        <td className={clsx('tnum whitespace-nowrap px-3 py-2 text-right font-semibold', hot ? 'text-bad' : 'text-ink')}>
          {fmtV(v, f.unit)} <span className="text-xs font-normal text-faint">{f.unit === '0/1' ? '' : f.unit}</span>
        </td>
        <td className="px-3 py-2">
          <PopBar f={f} v={v} hot={hot} />
        </td>
        <td className="tnum px-3 py-2 text-right text-muted">{fmtV(f.pop_p50, f.unit)}</td>
        <td className="tnum px-3 py-2 text-right text-muted">{fmtV(f.pop_p90, f.unit)}</td>
        <td className={clsx('tnum px-3 py-2 text-right font-semibold', c >= 0 ? 'text-bad' : 'text-ok')}>{pts(c)} pts</td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-16 bg-line">
              <div className="h-full bg-muted" style={{ width: `${(f.importance / maxImp) * 100}%` }} />
            </div>
            <span className="tnum text-xs text-muted">{Math.round(f.importance * 100)}%</span>
          </div>
        </td>
        <td className="whitespace-nowrap px-3 py-2 text-xs">
          <span className="font-mono text-muted">{f.source}</span> <span className="text-faint">· {f.window}</span>
        </td>
        <td className="px-4 py-2">
          <span className="flex items-center gap-1.5">
            <Fresh f={src?.latency ?? 'D-1'} />
            {!live && <span className={clsx('text-[10.5px]', src?.status === 'partial' ? 'text-warn' : 'text-faint')}>{src?.status === 'partial' ? 'partial' : 'proxy'}</span>}
          </span>
        </td>
      </tr>
      {isOpen && (
        <tr className="bg-panel2">
          <td />
          <td colSpan={9} className="pb-3 pr-4 text-xs text-muted">
            <div className="grid grid-cols-3 gap-6">
              <div>
                <Label className="mb-0.5">Definition</Label>
                {f.definition}. Direction: higher value {f.direction === 1 ? 'raises' : 'lowers'} risk.
              </div>
              <div>
                <Label className="mb-0.5">Source</Label>
                <span className="font-mono">{f.source}</span> · {src?.name ?? '—'}
                <div className="text-faint">{src?.systems}</div>
                <div className="text-faint">Window {f.window} · refresh {src?.refresh ?? '—'}</div>
              </div>
              <div>
                <Label className="mb-0.5">Readiness on Netra</Label>
                {src ? (src.status === 'on_netra' ? 'On Netra today.' : src.status === 'partial' ? `Partially on Netra. ${src.gap ?? ''}` : `Not on Netra yet: scored on a proxy until onboarded. ${src.gap ?? ''}`) : '—'}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function PopBar({ f, v, hot }: { f: P1Feature; v: number; hot: boolean }) {
  if (f.unit === '0/1') return <span className="text-xs text-faint">binary</span>
  const spread = Math.abs(f.pop_p90 - f.pop_p50) || Math.abs(f.pop_p50) * 0.5 || 1
  const lo = Math.min(v, f.pop_p50, f.pop_p90) - spread * 0.6
  const hi = Math.max(v, f.pop_p50, f.pop_p90) + spread * 0.6
  const x = (t: number) => `${((t - lo) / (hi - lo)) * 100}%`
  return (
    <div className="relative h-3 w-28" title={`p50 ${fmtV(f.pop_p50, f.unit)} · p90 ${fmtV(f.pop_p90, f.unit)} · site ${fmtV(v, f.unit)}`}>
      <div className="absolute inset-x-0 top-1/2 h-px bg-line2" />
      <div className="absolute top-1/2 h-1 -translate-y-1/2 bg-bad/25" style={f.direction === 1 ? { left: x(f.pop_p90), right: 0 } : { left: 0, width: x(f.pop_p90) }} />
      <div className="absolute top-0.5 h-2 w-px bg-muted" style={{ left: x(f.pop_p50) }} />
      <div className="absolute top-0 h-3 w-px bg-bad/80" style={{ left: x(f.pop_p90) }} />
      <div className={clsx('absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full', hot ? 'bg-bad' : 'bg-ink')} style={{ left: x(v) }} />
    </div>
  )
}

// ---- Customers and revenue --------------------------------------------------------------------
function Customers({ i }: { i: number }) {
  const D = db()
  const site = D.sites[i]
  const cohorts = D.cohortsBySite.get(site.site_id) ?? []
  const series = D.revenue.series[i] ?? []
  const churn = cohorts.reduce((s, c) => s + c.churn_risk_subs, 0)
  return (
    <section className="border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">Customers and revenue at this site</h3>
        <span className="flex items-center gap-1.5 text-[11px] text-faint">
          revenue <Fresh f="M-1" /> cohorts <Fresh f="D-1" />
        </span>
      </header>
      <div className="flex items-center gap-6 px-4 pt-2.5">
        <div>
          <Label>Revenue / month</Label>
          <div className="tnum text-base font-semibold">{idr(D.revenue.latest[i])}</div>
        </div>
        <div>
          <Spark values={series} width={110} height={26} color="#FFD100" />
          <div className="tnum text-[10px] text-faint">
            {D.revenue.months[0]} → {D.revenue.months[D.revenue.months.length - 1]}
          </div>
        </div>
        <div>
          <Label>Subscribers</Label>
          <div className="tnum text-base font-semibold">{num(site.subscribers)}</div>
        </div>
        <div>
          <Label>Churn-risk subs</Label>
          <div className="tnum text-base font-semibold text-warn">{num(churn)}</div>
        </div>
      </div>
      <table className="mt-2 w-full text-xs">
        <thead>
          <tr className="border-t border-line text-left text-2xs uppercase tracking-wider text-faint">
            <th className="px-4 py-1.5 font-semibold">Segment</th>
            <th className="px-2 py-1.5 text-right font-semibold">Subs</th>
            <th className="px-2 py-1.5 text-right font-semibold">ARPU</th>
            <th className="px-2 py-1.5 text-right font-semibold">Churn risk</th>
            <th className="px-4 py-1.5 text-right font-semibold">CNX · 28 d</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort_id} className="border-t border-line/60">
              <td className="px-4 py-1.5">{SEGMENT_LABEL[c.segment]}</td>
              <td className="tnum px-2 py-1.5 text-right">{num(c.subs)}</td>
              <td className="tnum px-2 py-1.5 text-right text-muted">{idr(c.arpu)}</td>
              <td className="tnum px-2 py-1.5 text-right">{(c.churn_risk * 100).toFixed(1)}%</td>
              <td className="tnum px-4 py-1.5 text-right">
                {c.cnx.toFixed(1)} <span className={c.cnx_delta_28d < 0 ? 'text-bad' : 'text-ok'}>{c.cnx_delta_28d >= 0 ? '+' : '−'}{Math.abs(c.cnx_delta_28d).toFixed(1)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

// ---- KPI history --------------------------------------------------------------------------
function KpiHistory({ i, cls }: { i: number; cls: FailureClass }) {
  const D = db()
  const days = D.kpi.days
  const dates = D.kpi.dates.slice(days - 30)
  const charts = useMemo(
    () =>
      KPI_BY_CLASS[cls].map((m) => {
        const s = kpiSeries(m.k, i, days - 30)
        return { ...m, data: s.map((v, k) => ({ d: dateShort(dates[k]), v: +v.toFixed(2) })), last: s[s.length - 1], first: s[0] }
      }),
    [i, cls, days, dates],
  )
  return (
    <section className="mt-4 border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">Relevant KPI history · last 30 days</h3>
        <span className="text-[11px] text-faint">
          OSS PM daily to {date(dates[dates.length - 1])} <Fresh f="D-1" />
        </span>
      </header>
      <div className="grid grid-cols-3">
        {charts.map((c, k) => (
          <div key={c.k} className={clsx('px-4 py-3', k < 2 && 'border-r border-line')}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-muted">{c.label}</span>
              <span className="tnum text-sm font-semibold">
                {num(c.last, c.last >= 100 ? 0 : 1)}
                {c.unit} <span className={clsx('text-[11px] font-normal', 'text-faint')}>({c.last - c.first >= 0 ? '+' : '−'}{num(Math.abs(c.last - c.first), 1)} in 30 d)</span>
              </span>
            </div>
            <div className="mt-1 h-[110px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={c.data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="d" tick={AXIS_TICK} axisLine={{ stroke: GRID }} tickLine={false} interval={9} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} domain={['auto', 'auto']} width={44} />
                  <Tooltip {...TT} formatter={(v: number) => [`${v}${c.unit}`, c.label]} />
                  {c.ref !== undefined && <ReferenceLine y={c.ref} stroke="#F5A623" strokeDasharray="3 3" strokeOpacity={0.7} />}
                  <Line dataKey="v" stroke={c.color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
