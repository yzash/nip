import clsx from 'clsx'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import type { Program, Stage } from '@/data/types'
import { Fresh, Kpi, Td, Th } from '@/components/ui'
import { daysBetween } from '@/lib/format'
import { useApp } from '@/store/app'
import { boqToPoDays, cycleComparable, cycleWeeks, median } from './lib'

// Cycle-time analytics (PRD §6 M5, §8): where the 20 weeks go today, and where the compression
// comes from. Everything below is computed from program stage_history; meta norms and targets are
// shown alongside for reference.

type Seg = 'Detect' | Stage
const SEGS: Seg[] = ['Detect', 'Decision', 'BOQ', 'PO', 'Vendor allocation', 'Material dispatch', 'Installation', 'Integration', 'RFS']
const SEG_LABEL: Record<string, string> = {
  Detect: 'Detect & triage',
  Decision: 'Decision',
  BOQ: 'BOQ',
  PO: 'PO & stock',
  'Vendor allocation': 'Vendor allocation',
  'Material dispatch': 'Material dispatch',
  Installation: 'Installation',
  Integration: 'Integration',
  RFS: 'RFS acceptance',
}
const SEG_COLOR: Record<string, string> = {
  Detect: '#4B5263',
  Decision: '#5AA9E6',
  BOQ: '#8B5CF6',
  PO: '#B79CFF',
  'Vendor allocation': '#4FB6A8',
  'Material dispatch': '#C9A227',
  Installation: '#FFD100',
  Integration: '#E08E5A',
  RFS: '#A3AAB8',
}
const META_KEY: Record<string, string> = {
  Detect: 'Incident',
  Decision: 'Decision',
  BOQ: 'BOQ',
  PO: 'PO and stock',
  'Vendor allocation': 'Vendor allocation',
  RFS: 'RFS acceptance',
}
const AXIS = { fill: '#6B7280', fontSize: 11 }
const TT = {
  contentStyle: {
    background: '#1D212A',
    border: '1px solid #353B48',
    borderRadius: 0,
    fontSize: 12,
  },
  itemStyle: { color: '#F2F3F5' },
  labelStyle: { color: '#A3AAB8' },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
}

function stageMeans(programs: Program[], mb: Program['managed_by']) {
  const ps = programs.filter((p) => p.managed_by === mb)
  const out: Record<string, { days: number; n: number }> = {}
  for (const s of SEGS) {
    if (s === 'Detect') continue
    const ds = ps.flatMap((p) => p.stage_history.filter((h) => h.stage === s && h.end).map((h) => daysBetween(h.start, h.end!)))
    out[s] = {
      days: ds.length ? ds.reduce((a, b) => a + b, 0) / ds.length : NaN,
      n: ds.length,
    }
  }
  // Elapsed window of the parallel BOQ / PO / vendor block (programs where all three closed).
  const par = ps
    .map((p) => {
      const hs = p.stage_history.filter((h) => h.stage === 'BOQ' || h.stage === 'PO' || h.stage === 'Vendor allocation')
      if (hs.length < 3 || hs.some((h) => !h.end)) return null
      const st = hs.map((h) => h.start).sort()[0]
      const en = hs.map((h) => h.end!).sort()[2]
      return daysBetween(st, en)
    })
    .filter((x): x is number => x !== null)
  return {
    stages: out,
    parallel: par.length ? par.reduce((a, b) => a + b, 0) / par.length : NaN,
    nPar: par.length,
  }
}

export function CycleTab() {
  const programs = useApp((s) => s.programs)
  const nav = useNavigate()
  const M = db().meta
  const legacyNorm = (s: Seg) => {
    const k = META_KEY[s]
    if (k) return (M.legacy_stage_weeks[k] ?? 0) * 7
    const build = (M.legacy_stage_weeks['Build and integrate'] ?? 0) * 7
    return s === 'Material dispatch' ? build * 0.2 : s === 'Installation' ? build * 0.65 : build * 0.15
  }
  const target = (s: Seg) => {
    const k = META_KEY[s]
    if (k) return M.target_stage_days[k] ?? 0
    const build = M.target_stage_days['Build and integrate'] ?? 0
    return s === 'Material dispatch' ? build * 0.2 : s === 'Installation' ? build * 0.65 : build * 0.15
  }

  const a = useMemo(() => {
    const L = stageMeans(programs, 'legacy')
    const N = stageMeans(programs, 'nicc')
    const val = (m: ReturnType<typeof stageMeans>, s: Seg, fb: (s: Seg) => number) => {
      if (s === 'Detect') return { days: fb(s), src: 'norm' as const }
      const r = m.stages[s]
      return Number.isNaN(r.days) ? { days: fb(s), src: 'norm' as const } : { days: r.days, src: 'actual' as const, n: r.n }
    }
    const leg = Object.fromEntries(SEGS.map((s) => [s, val(L, s, legacyNorm)])) as Record<Seg, { days: number; src: 'actual' | 'norm'; n?: number }>
    const nic = Object.fromEntries(SEGS.map((s) => [s, val(N, s, target)])) as Record<Seg, { days: number; src: 'actual' | 'norm'; n?: number }>
    // Critical-path contribution: legacy runs everything in sequence; NICC runs BOQ, PO and vendor
    // inside one window, attributed to PO & stock (the longest lane).
    const legCP = Object.fromEntries(SEGS.map((s) => [s, leg[s].days])) as Record<Seg, number>
    const nicPar = Number.isNaN(N.parallel) ? Math.max(nic.BOQ.days, nic.PO.days, nic['Vendor allocation'].days) : N.parallel
    const nicCP = Object.fromEntries(SEGS.map((s) => [s, nic[s].days])) as Record<Seg, number>
    nicCP.BOQ = 0
    nicCP['Vendor allocation'] = 0
    nicCP.PO = nicPar
    const tgtCP = Object.fromEntries(SEGS.map((s) => [s, target(s)])) as Record<Seg, number>
    tgtCP.PO = Math.max(target('BOQ'), target('PO'), target('Vendor allocation'))
    tgtCP.BOQ = 0
    tgtCP['Vendor allocation'] = 0
    const sum = (r: Record<Seg, number>) => SEGS.reduce((s, k) => s + r[k], 0)
    const totL = sum(legCP)
    const totN = sum(nicCP)
    const totT = sum(tgtCP)

    // Compression attribution (days).
    const legMaxPar = Math.max(leg.BOQ.days, leg.PO.days, leg['Vendor allocation'].days)
    const levers = [
      {
        key: 'predict',
        label: 'Start 8 weeks early on a prediction',
        note: 'Incident and business case pre-built; decision in 2 days',
        days: legCP.Detect + legCP.Decision - (nicCP.Detect + nicCP.Decision),
      },
      {
        key: 'parallel',
        label: 'BOQ, stock and vendor in parallel',
        note: 'Stages 4, 5, 6 overlap instead of hand-offs',
        days: leg.BOQ.days + leg.PO.days + leg['Vendor allocation'].days - legMaxPar,
      },
      {
        key: 'rekey',
        label: 'Removing re-keying',
        note: 'BOQ Agent drafts PO; RFS pack auto-assembled',
        days: legMaxPar - nicPar + (legCP.Integration + legCP.RFS - (nicCP.Integration + nicCP.RFS)),
      },
      {
        key: 'stock',
        label: 'Pre-positioned stock',
        note: 'Warehouse Readiness Agent stages parts ahead',
        days: legCP['Material dispatch'] - nicCP['Material dispatch'],
      },
      {
        key: 'tower',
        label: 'Tower company fast track',
        note: 'Stage 6b drafted at approval, runs in parallel',
        days: legCP.Installation - nicCP.Installation,
      },
    ]
    return {
      leg,
      nic,
      legCP,
      nicCP,
      tgtCP,
      totL,
      totN,
      totT,
      levers,
      nPar: N.nPar,
    }
  }, [programs]) // eslint-disable-line react-hooks/exhaustive-deps

  const comp = programs.filter(cycleComparable)
  const medL = median(comp.filter((p) => p.managed_by === 'legacy').map((p) => cycleWeeks(p).weeks))
  const medN = median(comp.filter((p) => p.managed_by === 'nicc').map((p) => cycleWeeks(p).weeks))
  const b2p = (mb: Program['managed_by']) =>
    median(
      programs
        .filter((p) => p.managed_by === mb)
        .map(boqToPoDays)
        .filter((x): x is number => x !== null),
    )
  const b2pL = b2p('legacy')
  const b2pN = b2p('nicc')
  const nNicc = programs.filter((p) => p.managed_by === 'nicc').length

  const w = (d: number) => Math.round((d / 7) * 10) / 10
  const stackData = [
    {
      row: `Legacy · ${w(a.totL).toFixed(1)} wk`,
      ...Object.fromEntries(SEGS.map((s) => [s, w(a.legCP[s])])),
    },
    {
      row: `NICC · ${w(a.totN).toFixed(1)} wk`,
      ...Object.fromEntries(SEGS.map((s) => [s, w(a.nicCP[s])])),
    },
    {
      row: `Target · ${w(a.totT).toFixed(1)} wk`,
      ...Object.fromEntries(SEGS.map((s) => [s, w(a.tgtCP[s])])),
    },
  ]
  let run = a.totL
  const wf: {
    name: string
    base: number
    value: number
    kind: 'total' | 'lever'
    label: string
    note?: string
  }[] = [
    {
      name: 'Legacy today',
      base: 0,
      value: w(a.totL),
      kind: 'total',
      label: `${w(a.totL).toFixed(1)} wk`,
    },
  ]
  for (const l of a.levers) {
    run -= l.days
    wf.push({
      name: l.label,
      base: w(run),
      value: w(l.days),
      kind: 'lever',
      label: `−${w(l.days).toFixed(1)}`,
      note: l.note,
    })
  }
  wf.push({
    name: 'NICC-managed',
    base: 0,
    value: w(a.totN),
    kind: 'total',
    label: `${w(a.totN).toFixed(1)} wk`,
  })
  const topLever = [...a.levers].sort((x, y) => y.days - x.days)[0]

  return (
    <div className="flex flex-col gap-4 p-5">
      <section className="border border-line bg-panel px-5 py-4">
        <div className="mb-1 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">
          Where the 20 weeks go today and where the compression comes from <Fresh f="D-1" />
        </div>
        <div className="text-[19px] font-semibold leading-7 tracking-tight">
          Legacy programs take <span className="text-ink">{w(a.totL).toFixed(1)} weeks</span> from signal to RFS; NICC-managed programs run the same chain in{' '}
          <span className="text-ioh-yellow">{w(a.totN).toFixed(1)} weeks</span>.
        </div>
        <div className="mt-1 text-sm text-muted">
          The biggest lever is {topLever.label.toLowerCase()} (−
          {w(topLever.days).toFixed(1)} wk). Median decision-to-RFS on comparable programs: {medN.toFixed(1)} wk NICC vs {medL.toFixed(1)} wk legacy, against the 4–5 week target.
        </div>
      </section>

      <div className="grid grid-cols-4 divide-x divide-line border border-line bg-panel">
        <Kpi
          label="Median decision-to-RFS · NICC"
          value={`${medN.toFixed(1)} wk`}
          tone={medN <= 5 ? 'ok' : 'yellow'}
          sub={`${comp.filter((p) => p.managed_by === 'nicc').length} programs · target 4–5 wk`}
          fresh="D-1"
        />
        <Kpi label="Median decision-to-RFS · legacy" value={`${medL.toFixed(1)} wk`} sub={`${comp.filter((p) => p.managed_by === 'legacy').length} programs · baseline 20–22 wk`} fresh="D-1" />
        <Kpi
          label="Median BOQ-to-PO"
          value={
            <>
              {b2pN.toFixed(0)} d <span className="text-sm font-normal text-muted">vs {b2pL.toFixed(0)} d legacy</span>
            </>
          }
          tone={b2pN <= 3 ? 'ok' : 'yellow'}
          sub="PRD target 3 days · baseline 3–4 wk"
          fresh="D-1"
        />
        <Kpi
          label="Prediction headroom"
          value={<>+{Math.max(0, 8 - medN).toFixed(1)} wk</>}
          tone="ok"
          sub={`RFS lands before the W+8 predicted failure · ${nNicc} of ${programs.length} programs NICC-managed`}
          fresh="D-1"
        />
      </div>

      <section className="border border-line bg-panel">
        <header className="flex h-10 items-center justify-between border-b border-line px-4">
          <h3 className="text-sm font-semibold">Signal-to-RFS by stage, critical path (weeks)</h3>
          <span className="text-xs text-faint">legacy stages run in sequence · NICC BOQ and vendor run inside the PO window</span>
        </header>
        <div className="px-3 pt-3">
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={stackData} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barCategoryGap={10}>
              <CartesianGrid stroke="#2A2F3A" horizontal={false} />
              <XAxis type="number" tick={AXIS} stroke="#2A2F3A" domain={[0, 24]} ticks={[0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]} unit=" wk" />
              <YAxis type="category" dataKey="row" tick={{ ...AXIS, fill: '#A3AAB8' }} stroke="#2A2F3A" width={120} />
              <ReferenceArea x1={4} x2={5} fill="#2ECC71" fillOpacity={0.08} stroke="#2ECC71" strokeOpacity={0.35} strokeDasharray="3 3" />
              <Tooltip {...TT} formatter={(v: number, n: string) => [`${v.toFixed(1)} wk`, SEG_LABEL[n] ?? n]} />
              {SEGS.map((s) => (
                <Bar key={s} dataKey={s} stackId="a" fill={SEG_COLOR[s]} isAnimationActive={false}>
                  <LabelList dataKey={s} position="center" formatter={(v: number) => (v >= 1.2 ? v.toFixed(1) : '')} style={{ fill: '#0F1115', fontSize: 10, fontWeight: 600 }} />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line px-4 py-2 text-[11px] text-muted">
          {SEGS.map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5" style={{ background: SEG_COLOR[s] }} />
              {SEG_LABEL[s]}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-faint">
            <span className="inline-block h-2.5 w-2.5 border border-dashed border-ok bg-ok/10" /> 4–5 week target band
          </span>
        </div>
      </section>

      <div className="grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4">
        <section className="border border-line bg-panel">
          <header className="flex h-10 items-center justify-between border-b border-line px-4">
            <h3 className="text-sm font-semibold">Compression waterfall (weeks)</h3>
            <span className="text-xs text-faint">legacy → NICC, attributed to five levers</span>
          </header>
          <div className="px-3 pt-3">
            <ResponsiveContainer width="100%" height={290}>
              <BarChart data={wf} margin={{ top: 22, right: 12, bottom: 4, left: 0 }} barCategoryGap={14}>
                <CartesianGrid stroke="#2A2F3A" vertical={false} />
                <XAxis dataKey="name" tick={<WfTick />} interval={0} stroke="#2A2F3A" height={54} />
                <YAxis tick={AXIS} stroke="#2A2F3A" unit=" wk" width={48} domain={[0, 24]} ticks={[0, 4, 8, 12, 16, 20, 24]} />
                <Tooltip {...TT} formatter={(v: number, n: string) => (n === 'base' ? [null, null] : [`${v.toFixed(1)} wk`, 'Weeks'])} />
                <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
                <Bar dataKey="value" stackId="w" isAnimationActive={false}>
                  {wf.map((d, i) => (
                    <Cell key={i} fill={d.kind === 'total' ? (i === 0 ? '#6B7280' : '#FFD100') : '#2ECC71'} fillOpacity={d.kind === 'total' ? 1 : 0.75} />
                  ))}
                  <LabelList dataKey="label" position="top" style={{ fill: '#F2F3F5', fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-5 gap-px border-t border-line bg-line">
            {a.levers.map((l) => (
              <div key={l.key} className="bg-panel px-3 py-2">
                <div className="tnum text-sm font-semibold text-ok">−{w(l.days).toFixed(1)} wk</div>
                <div className="text-[11px] font-medium leading-4 text-ink">{l.label}</div>
                <div className="text-[10.5px] leading-4 text-faint">{l.note}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="border border-line bg-panel">
          <header className="flex h-10 items-center justify-between border-b border-line px-4">
            <h3 className="text-sm font-semibold">Stage by stage (days)</h3>
            <span className="text-xs text-faint">mean of closed stages in stage_history</span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Stage</Th>
                  <Th className="text-right">Legacy</Th>
                  <Th className="text-right">Norm</Th>
                  <Th className="text-right">NICC</Th>
                  <Th className="text-right">Target</Th>
                  <Th className="text-right">Saved (CP)</Th>
                </tr>
              </thead>
              <tbody>
                {SEGS.map((s) => {
                  const L = a.leg[s]
                  const N = a.nic[s]
                  const par = s === 'BOQ' || s === 'Vendor allocation'
                  return (
                    <tr key={s}>
                      <Td className="text-xs">
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5" style={{ background: SEG_COLOR[s] }} />
                          {SEG_LABEL[s]}
                          {par && (
                            <span className="text-[10px] text-ioh-yellow/70" title="Runs in parallel inside the PO window for NICC programs">
                              ∥
                            </span>
                          )}
                        </span>
                      </Td>
                      <Td className="tnum text-right text-xs text-ink">
                        {L.src === 'actual' ? (
                          <>
                            {L.days.toFixed(1)} <span className="text-faint">n={L.n}</span>
                          </>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </Td>
                      <Td className="tnum text-right text-xs text-muted">{legacyNorm(s).toFixed(1)}</Td>
                      <Td className="tnum text-right text-xs text-ioh-yellow">
                        {N.src === 'actual' ? (
                          <>
                            {N.days.toFixed(1)} <span className="text-faint">n={N.n}</span>
                          </>
                        ) : (
                          <span className="text-faint">target</span>
                        )}
                      </Td>
                      <Td className="tnum text-right text-xs text-muted">{target(s).toFixed(0)}</Td>
                      <Td className="tnum text-right text-xs text-ok">{(a.legCP[s] - a.nicCP[s]).toFixed(0)}</Td>
                    </tr>
                  )
                })}
                <tr>
                  <Td className="text-xs font-semibold">Critical path</Td>
                  <Td className="tnum text-right text-xs font-semibold">{a.totL.toFixed(0)}</Td>
                  <Td className="tnum text-right text-xs text-muted">{SEGS.reduce((s, k) => s + legacyNorm(k), 0).toFixed(0)}</Td>
                  <Td className="tnum text-right text-xs font-semibold text-ioh-yellow">{a.totN.toFixed(0)}</Td>
                  <Td className="tnum text-right text-xs text-muted">{a.totT.toFixed(0)}</Td>
                  <Td className="tnum text-right text-xs font-semibold text-ok">{(a.totL - a.totN).toFixed(0)}</Td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 text-[11px] leading-4 text-faint">
            Legacy and NICC = mean of closed stages (n = programs); norm and target from the PRD stage table; ∥ = parallel in NICC. Detect & triage is not in stage_history; it uses the legacy norm (
            {M.legacy_stage_weeks['Incident']} wk) and NICC target (same day). NICC PO & stock on the critical path = elapsed window of the parallel block ({a.nPar} programs). Stages with no closed
            NICC history use the PRD target.
          </div>
        </section>
      </div>

      <ProgramDots programs={comp} onOpen={(id) => nav(`/programs/${id}`)} />
    </div>
  )
}

function WfTick(props: { x?: number; y?: number; payload?: { value: string } }) {
  const { x = 0, y = 0, payload } = props
  const words = (payload?.value ?? '').split(' ')
  const lines: string[] = []
  let cur = ''
  for (const wd of words) {
    if ((cur + ' ' + wd).trim().length > 14) {
      lines.push(cur.trim())
      cur = wd
    } else cur += ' ' + wd
  }
  if (cur.trim()) lines.push(cur.trim())
  return (
    <g transform={`translate(${x},${y + 12})`}>
      {lines.slice(0, 3).map((l, i) => (
        <text key={i} x={0} y={i * 12} textAnchor="middle" fill="#A3AAB8" fontSize={10.5}>
          {l}
        </text>
      ))}
    </g>
  )
}

/** Every comparable program on one weeks axis: filled = actual RFS, hollow = forecast. */
function ProgramDots({ programs, onOpen }: { programs: Program[]; onOpen: (id: string) => void }) {
  const max = 28
  const rows: { mb: Program['managed_by']; label: string }[] = [
    { mb: 'legacy', label: 'Legacy' },
    { mb: 'nicc', label: 'NICC' },
  ]
  return (
    <section className="border border-line bg-panel">
      <header className="flex h-10 items-center justify-between border-b border-line px-4">
        <h3 className="text-sm font-semibold">
          Decision-to-RFS per program <span className="font-normal text-faint">· comparable scope: past Decision, excluding new sites and fibre builds</span>
        </h3>
        <span className="flex items-center gap-3 text-xs text-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-muted" /> actual RFS
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-muted" /> forecast
          </span>
          <Fresh f="D-1" />
        </span>
      </header>
      <div className="px-4 py-3">
        {rows.map((r) => {
          const ps = programs.filter((p) => p.managed_by === r.mb)
          const med = median(ps.map((p) => cycleWeeks(p).weeks))
          return (
            <div key={r.mb} className="flex items-center gap-3 py-2">
              <div className="w-[120px] shrink-0 text-xs">
                <div className={clsx('font-semibold', r.mb === 'nicc' ? 'text-ioh-yellow' : 'text-muted')}>{r.label}</div>
                <div className="tnum text-faint">
                  median {med.toFixed(1)} wk · n={ps.length}
                </div>
              </div>
              <div className="relative h-8 flex-1 border-b border-line">
                <div
                  className="absolute inset-y-0 border-x border-dashed border-ok/50 bg-ok/[0.06]"
                  style={{
                    left: `${(4 / max) * 100}%`,
                    width: `${(1 / max) * 100}%`,
                  }}
                />
                <div
                  className="absolute inset-y-0 border-l-2"
                  style={{
                    left: `${(med / max) * 100}%`,
                    borderColor: r.mb === 'nicc' ? '#FFD100' : '#A3AAB8',
                  }}
                />
                {ps.map((p, k) => {
                  const c = cycleWeeks(p)
                  const col = r.mb === 'nicc' ? '#FFD100' : '#A3AAB8'
                  return (
                    <button
                      key={p.program_id}
                      onClick={() => onOpen(p.program_id)}
                      title={`${p.program_id} ${p.name}: ${c.weeks.toFixed(1)} wk (${c.actual ? 'actual' : 'forecast'})`}
                      className="absolute h-2.5 w-2.5 -translate-x-1/2 rounded-full hover:scale-150"
                      style={{
                        left: `${(Math.min(max, c.weeks) / max) * 100}%`,
                        top: 6 + (k % 3) * 6,
                        background: c.actual ? col : 'transparent',
                        border: `1.5px solid ${col}`,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
        <div className="ml-[132px] flex justify-between text-[10px] text-faint">
          {Array.from({ length: max / 4 + 1 }, (_, i) => i * 4).map((t) => (
            <span key={t} className="tnum">
              {t} wk
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}
