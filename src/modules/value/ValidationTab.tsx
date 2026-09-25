import clsx from 'clsx'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Bar as RBar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import { Badge, Fresh, Id, Label, Panel, Seg, Td, Th } from '@/components/ui'
import { SERIES, STATUS } from '@/lib/colors'
import { date, num } from '@/lib/format'
import { useApp } from '@/store/app'
import { AXIS, GRID, LegendItem, Stat, TOOLTIP } from './chart'
import { binWidth, ctrlPostOf, did, fmtKpi, histogram, kpiDef, KPIS, mean, postOf, validatedProgramIds, validationSites, type Horizon, type KpiId } from './calc'

const TREATED = SERIES[0]
const CONTROL = SERIES[6]

export function ValidationTab() {
  const [params, setParams] = useSearchParams()
  const programs = useApp((s) => s.programs)
  const D = db()
  const progIds = validatedProgramIds()
  const qp = params.get('program')
  const program = qp && progIds.includes(qp) ? qp : 'all'
  const [kpi, setKpi] = useState<KpiId>((params.get('kpi') as KpiId) || 'cnx')
  const [h, setH] = useState<Horizon>(90)
  const [sort, setSort] = useState<'uplift' | 'rfs' | 'site'>('uplift')

  const setProgram = (p: string) => {
    const n = new URLSearchParams(params)
    if (p === 'all') n.delete('program')
    else n.set('program', p)
    setParams(n, { replace: true })
  }

  const def = kpiDef(kpi)
  const pname = (id: string) => programs.find((p) => p.program_id === id)?.name ?? id

  const data = useMemo(() => {
    const all = validationSites().filter((s) => program === 'all' || s.program_id === program)
    const rows = all.map((s) => ({ s, r: s.rows[kpi] }))
    const measured = rows.filter(({ r }) => postOf(r, h) !== null)
    const pending = rows.length - measured.length
    const dids = measured.map(({ s, r }) => ({ s, r, v: did(r, h)! }))
    const m = mean(dids.map((x) => x.v))
    const pred = mean(dids.map((x) => x.r.predicted_uplift))
    // Trajectory: cohort = sites measured at the selected horizon; mean at each step up to h
    const steps: (0 | Horizon)[] = [0, 30, 60, 90].filter((x) => x <= h) as (0 | Horizon)[]
    const traj = steps.map((st) => ({
      step: st === 0 ? 'Pre-RFS' : `+${st} d`,
      treated: mean(measured.map(({ r }) => (st === 0 ? r.pre : postOf(r, st)!))),
      control: mean(measured.map(({ r }) => (st === 0 ? r.control_pre : ctrlPostOf(r, st)!))),
    }))
    const bw = binWidth(dids.map((x) => x.v))
    const hist = histogram(dids.map((x) => ({ v: x.v, outcome: x.s.outcome })), bw)
    const split = {
      uplift: dids.filter((x) => x.s.outcome === 'uplift').length,
      flat: dids.filter((x) => x.s.outcome === 'flat').length,
      worse: dids.filter((x) => x.s.outcome === 'worse').length,
    }
    const better = dids.filter((x) => x.v * x.r.direction > 0).length
    const byProg = validatedProgramIds()
      .map((pid) => {
        const rs = validationSites()
          .filter((x) => x.program_id === pid)
          .map((x) => x.rows[kpi])
          .filter((r) => postOf(r, h) !== null)
        return { pid, n: rs.length, predicted: mean(rs.map((r) => r.predicted_uplift)), realised: mean(rs.map((r) => did(r, h)!)) }
      })
      .filter((x) => x.n > 0)
    return { rows, measured: dids, pending, m, pred, traj, hist, split, better, byProg, bw }
  }, [program, kpi, h])

  const sorted = useMemo(() => {
    const a = [...data.rows]
    const v = (x: (typeof a)[number]) => did(x.r, h)
    const score = (x: (typeof a)[number]) => {
      const d = v(x)
      return d === null ? -Infinity : d * x.r.direction
    }
    if (sort === 'uplift') a.sort((x, y) => score(y) - score(x))
    if (sort === 'rfs') a.sort((x, y) => x.s.rfs_date.localeCompare(y.s.rfs_date))
    if (sort === 'site') a.sort((x, y) => x.s.site_id.localeCompare(y.s.site_id))
    return a
  }, [data.rows, sort, h])

  const dir = data.rows[0]?.r.direction ?? 1
  const goodDir = data.m * dir > 0
  const scope = program === 'all' ? `${progIds.length} programs` : `${program} ${pname(program)}`
  const valueStr = kpi === 'revenue' ? `IDR ${fmtKpi(kpi, data.m, { signed: true })}/mo per site` : `${fmtKpi(kpi, data.m, { signed: true })} ${def.unit}`
  const realisedPct = data.pred ? (data.m / data.pred) * 100 : 0
  const firstRfs = data.rows.length ? data.rows.map((x) => x.s.rfs_date).sort()[0] : null
  const lastRfs = data.rows.length ? data.rows.map((x) => x.s.rfs_date).sort().slice(-1)[0] : null
  const yDomain = trajDomain(data.traj)

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-4 border border-line bg-panel px-4 py-3">
        <div>
          <Label className="mb-1">Program</Label>
          <select value={program} onChange={(e) => setProgram(e.target.value)} className="h-7 min-w-[340px] border border-line2 bg-panel2 px-2 text-sm">
            <option value="all">All programs with RFS in the last 180 days ({validationSites().length} sites)</option>
            {progIds.map((p) => (
              <option key={p} value={p}>
                {p} · {pname(p)} ({validationSites().filter((s) => s.program_id === p).length})
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="mb-1">KPI</Label>
          <Seg options={KPIS.map((k) => ({ id: k.id, label: k.short }))} value={kpi} onChange={setKpi} />
        </div>
        <div>
          <Label className="mb-1">Horizon after RFS</Label>
          <Seg options={[30, 60, 90].map((x) => ({ id: x as Horizon, label: `${x} days` }))} value={h} onChange={setH} />
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-faint">
          Post-RFS Validation Agent · daily 07:00 <Fresh f="D-1" asOf={D.meta.as_of} />
        </div>
      </div>

      {/* Headline */}
      <div className="grid gap-4 xl:grid-cols-[1fr_500px]">
        <div className="border border-line bg-panel px-5 py-4">
          <Label>Realised uplift versus matched control · {scope}</Label>
          {data.measured.length ? (
            <div className="mt-1 text-[22px] font-semibold leading-8">
              <span className={goodDir ? 'text-ok' : 'text-bad'}>
                {def.short} {valueStr}
              </span>{' '}
              <span className="text-ink">vs control at {h} days on {data.measured.length} sites</span>
            </div>
          ) : (
            <div className="mt-1 text-lg font-semibold text-muted">No site in this selection has reached {h} days after RFS yet</div>
          )}
          <div className="mt-1 text-sm text-muted">
            {data.measured.length > 0 && (
              <>
                Predicted at approval {kpi === 'revenue' ? `IDR ${fmtKpi(kpi, data.pred, { signed: true })}` : `${fmtKpi(kpi, data.pred, { signed: true })} ${def.unit}`}; realised{' '}
                <span className="tnum font-semibold text-ink">{realisedPct.toFixed(0)}%</span> of prediction. {data.better} of {data.measured.length} sites moved in the right direction.{' '}
              </>
            )}
            {data.pending > 0 && (
              <span className="text-warn">
                {data.pending} site{data.pending > 1 ? 's' : ''} not yet at {h} days (shown as pending).
              </span>
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 md:grid-cols-5">
            <Stat label="Sites" value={data.rows.length} sub={firstRfs ? `RFS ${date(firstRfs).slice(0, 6)} – ${date(lastRfs!)}` : ''} />
            <Stat label="Uplift" value={data.split.uplift} tone="ok" sub="above control" />
            <Stat label="Flat" value={data.split.flat} sub="within noise" />
            <Stat label="Worse" value={data.split.worse} tone="bad" sub="below control" />
            <Stat label="Mean DiD" value={fmtKpi(kpi, data.m, { signed: true })} sub={def.unit} tone={goodDir ? 'ok' : 'bad'} />
          </div>
          {data.measured.length > 0 && <PredVsReal kpi={kpi} pred={data.pred} real={data.m} />}
        </div>
        <MethodCard />
      </div>

      {/* Charts */}
      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          title={`Treated vs matched control · mean ${def.short}`}
          right={
            <span className="flex gap-3">
              <LegendItem color={TREATED} label="Treated" />
              <LegendItem color={CONTROL} label="Control" dash />
            </span>
          }
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.traj} margin={{ top: 16, right: 20, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="step" {...AXIS} />
                <YAxis {...AXIS} width={kpi === 'revenue' ? 56 : 48} domain={yDomain?.domain ?? ['auto', 'auto']} ticks={yDomain?.ticks} tickFormatter={(v: number) => fmtAxis(kpi, v)} />
                <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [`${fmtKpi(kpi, v)} ${def.unit}`, n === 'treated' ? 'Treated' : 'Control']} />
                <Line type="linear" dataKey="control" stroke={CONTROL} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: CONTROL, strokeWidth: 0 }} isAnimationActive={false} />
                <Line type="linear" dataKey="treated" stroke={TREATED} strokeWidth={2.5} dot={{ r: 3.5, fill: TREATED, strokeWidth: 0 }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <TrajNote traj={data.traj} kpi={kpi} />
        </Panel>

        <Panel
          title={`Uplift distribution at ${h} days`}
          right={
            <span className="flex gap-3">
              <LegendItem square color={STATUS.ok} label={`Uplift ${data.split.uplift}`} />
              <LegendItem square color={STATUS.nodata} label={`Flat ${data.split.flat}`} />
              <LegendItem square color={STATUS.bad} label={`Worse ${data.split.worse}`} />
            </span>
          }
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.hist} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barCategoryGap={1}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={14} tickFormatter={(v: string) => (kpi === 'revenue' ? `${(Number(v) / 1e6).toFixed(0)}m` : v)} />
                <YAxis {...AXIS} width={30} allowDecimals={false} />
                <Tooltip {...TOOLTIP} labelFormatter={(l: string) => `DiD ≈ ${kpi === 'revenue' ? `${(Number(l) / 1e6).toFixed(0)}m` : l} ${def.unit}`} />
                {zeroLabel(data.hist) && <ReferenceLine x={zeroLabel(data.hist)} stroke="#A3AAB8" strokeDasharray="3 3" />}
                <RBar dataKey="uplift" name="Uplift" stackId="a" fill={STATUS.ok} isAnimationActive={false} />
                <RBar dataKey="flat" name="Flat" stackId="a" fill={STATUS.nodata} isAnimationActive={false} />
                <RBar dataKey="worse" name="Worse" stackId="a" fill={STATUS.bad} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-xs text-faint">
            Outcome class set by CNX DiD per site. Estate-wide: 140 uplift, 40 flat, 20 worse, so the ledger stays honest.
          </div>
        </Panel>

        <Panel
          title="Predicted vs realised by program"
          right={
            <span className="flex gap-3">
              <LegendItem square color="#4B5263" label="Predicted" />
              <LegendItem square color={TREATED} label="Realised DiD" />
            </span>
          }
        >
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byProg} margin={{ top: 16, right: 8, bottom: 0, left: 0 }} barGap={2}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="pid" {...AXIS} tickFormatter={(v: string) => v.replace('PRG-', '')} />
                <YAxis {...AXIS} width={kpi === 'revenue' ? 56 : 40} tickFormatter={(v: number) => fmtAxis(kpi, v)} />
                <Tooltip
                  {...TOOLTIP}
                  labelFormatter={(l: string) => `${l} · ${pname(l)}`}
                  formatter={(v: number, n: string) => [`${fmtKpi(kpi, v, { signed: true })} ${def.unit}`, n === 'predicted' ? 'Predicted' : 'Realised DiD']}
                />
                <ReferenceLine y={0} stroke="#6B7280" />
                <RBar dataKey="predicted" isAnimationActive={false} maxBarSize={16}>
                  {data.byProg.map((b) => (
                    <Cell key={b.pid} fill="#4B5263" fillOpacity={program === 'all' || program === b.pid ? 1 : 0.35} />
                  ))}
                </RBar>
                <RBar dataKey="realised" isAnimationActive={false} maxBarSize={16}>
                  {data.byProg.map((b) => (
                    <Cell key={b.pid} fill={b.realised * dir >= 0 ? TREATED : STATUS.bad} fillOpacity={program === 'all' || program === b.pid ? 1 : 0.3} />
                  ))}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-xs text-faint">Predicted uplift is the Action Ladder estimate at approval. Realised above predicted means the model under-promised; calibration is fed to the Model Drift Agent.</div>
        </Panel>
      </div>

      {/* Site table */}
      <Panel
        pad={false}
        title={`Sites · ${def.label} (${def.unit}) at ${h} days`}
        right={
          <span className="flex items-center gap-2">
            <span className="text-xs text-faint">Sort</span>
            <Seg
              options={[
                { id: 'uplift', label: 'Uplift' },
                { id: 'rfs', label: 'RFS date' },
                { id: 'site', label: 'Site' },
              ]}
              value={sort}
              onChange={setSort}
            />
            <Fresh f="D-1" />
          </span>
        }
      >
        <div className="max-h-[520px] overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Site</Th>
                <Th>Program</Th>
                <Th>RFS date</Th>
                <Th className="text-right">Treated pre</Th>
                <Th className="text-right">Treated +{h} d</Th>
                <Th className="text-right">Control pre</Th>
                <Th className="text-right">Control +{h} d</Th>
                <Th className="text-right">Predicted</Th>
                <Th className="text-right">Uplift (DiD)</Th>
                <Th>Outcome</Th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ s, r }) => {
                const p = postOf(r, h)
                const c = ctrlPostOf(r, h)
                const u = did(r, h)
                const site = D.sites[D.siteIdx.get(s.site_id)!]
                return (
                  <tr key={s.site_id} className="hover:bg-panel2">
                    <Td>
                      <Id>{s.site_id}</Id> <span className="ml-1 text-muted">{site?.name}</span>
                    </Td>
                    <Td className="text-muted">
                      <Id>{s.program_id}</Id> <span className="ml-1 text-xs">{pname(s.program_id).split(' — ')[0]}</span>
                    </Td>
                    <Td className="tnum text-muted">{date(s.rfs_date)}</Td>
                    <Td className="tnum text-right">{fmtKpi(kpi, r.pre)}</Td>
                    <Td className="tnum text-right">{p === null ? <span className="text-faint">pending</span> : fmtKpi(kpi, p)}</Td>
                    <Td className="tnum text-right text-muted">{fmtKpi(kpi, r.control_pre)}</Td>
                    <Td className="tnum text-right text-muted">{c === null ? <span className="text-faint">pending</span> : fmtKpi(kpi, c)}</Td>
                    <Td className="tnum text-right text-muted">{fmtKpi(kpi, r.predicted_uplift, { signed: true })}</Td>
                    <Td className={clsx('tnum text-right font-semibold', u === null ? 'text-faint' : u * r.direction > 0 ? 'text-ok' : 'text-bad')}>{u === null ? '—' : fmtKpi(kpi, u, { signed: true })}</Td>
                    <Td>
                      <Badge tone={s.outcome === 'uplift' ? 'ok' : s.outcome === 'worse' ? 'bad' : 'neutral'}>{s.outcome}</Badge>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-4 py-2 text-xs text-faint">
          {num(data.rows.length)} sites · Uplift sign follows the KPI direction ({dir > 0 ? 'higher is better' : 'lower is better'} for {def.short}). Days since RFS counted to {date(D.meta.now)}.
        </div>
      </Panel>
    </div>
  )
}

function PredVsReal({ kpi, pred, real }: { kpi: KpiId; pred: number; real: number }) {
  const d = kpiDef(kpi)
  const max = Math.max(Math.abs(pred), Math.abs(real)) * 1.1 || 1
  const f = (v: number) => (kpi === 'revenue' ? `IDR ${fmtKpi(kpi, v, { signed: true })}` : `${fmtKpi(kpi, v, { signed: true })} ${d.unit}`)
  const good = real * Math.sign(pred || 1) >= 0
  return (
    <div className="mt-3 space-y-1.5 border-t border-line pt-3">
      {[
        { l: 'Predicted at approval', v: pred, c: '#4B5263' },
        { l: 'Realised vs control', v: real, c: good ? TREATED : STATUS.bad },
      ].map((x) => (
        <div key={x.l} className="flex items-center gap-3 text-xs">
          <span className="w-36 shrink-0 text-muted">{x.l}</span>
          <div className="relative h-3 flex-1 bg-panel2">
            <div className="absolute inset-y-0 left-0" style={{ width: `${(Math.abs(x.v) / max) * 100}%`, background: x.c }} />
          </div>
          <span className="tnum w-32 shrink-0 text-right font-semibold">{f(x.v)}</span>
        </div>
      ))}
    </div>
  )
}

function MethodCard() {
  return (
    <div className="border border-line bg-panel px-5 py-4">
      <Label>Attribution method · difference-in-differences</Label>
      <div className="my-3 overflow-x-auto whitespace-nowrap border border-line2 bg-canvas px-3 py-2.5 text-center font-mono text-[12px] leading-6">
        <span className="text-ioh-yellow">Uplift</span> = (Y<sub>treated,post</sub> − Y<sub>treated,pre</sub>) − (Y<sub>control,post</sub> − Y<sub>control,pre</sub>)
      </div>
      <p className="text-xs leading-5 text-muted">
        Each treated site is compared with a <span className="text-ink">matched control group</span> of untreated sites with the same province, site class, technology mix, traffic band and pre-period
        CNX. Subtracting the control change removes seasonality, estate-wide trends and network-wide releases, which is what makes churn and revenue claims defensible to Finance (PRD §9).
      </p>
      <p className="mt-2 text-xs leading-5 text-faint">Pre window: 28 days before RFS. Post windows: 28-day means ending 30, 60 and 90 days after RFS.</p>
    </div>
  )
}

function TrajNote({ traj, kpi }: { traj: { treated: number; control: number }[]; kpi: KpiId }) {
  if (traj.length < 2) return null
  const t = traj[traj.length - 1].treated - traj[0].treated
  const c = traj[traj.length - 1].control - traj[0].control
  const d = kpiDef(kpi)
  const f = (v: number) => (kpi === 'revenue' ? `IDR ${fmtKpi(kpi, v, { signed: true })}` : `${fmtKpi(kpi, v, { signed: true })} ${d.unit}`)
  return (
    <div className="tnum mt-2 flex flex-wrap gap-x-4 text-xs text-muted">
      <span>
        Treated <span className="text-ioh-yellow">{f(t)}</span>
      </span>
      <span>
        Control <span className="text-ink">{f(c)}</span>
      </span>
      <span>
        DiD <span className="font-semibold text-ink">{f(t - c)}</span>
      </span>
    </div>
  )
}

function trajDomain(traj: { treated: number; control: number }[]): { domain: [number, number]; ticks: number[] } | null {
  if (!traj.length) return null
  const v = traj.flatMap((x) => [x.treated, x.control])
  const lo = Math.min(...v)
  const hi = Math.max(...v)
  const span = hi - lo || Math.abs(hi) * 0.01 || 1
  const raw = span / 4
  const p = Math.pow(10, Math.floor(Math.log10(raw)))
  const n = raw / p
  const step = (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p
  const a = Math.floor((lo - span * 0.1) / step) * step
  const b = Math.ceil((hi + span * 0.1) / step) * step
  const ticks: number[] = []
  for (let t = a; t <= b + step * 1e-6; t += step) ticks.push(Number(t.toPrecision(12)))
  return { domain: [a, b], ticks }
}

function fmtAxis(k: KpiId, v: number): string {
  if (k === 'revenue') return `${(v / 1e6).toFixed(0)}m`
  const d = kpiDef(k).digits
  return v.toFixed(Math.min(d, Math.abs(v) >= 100 ? 0 : d))
}

function zeroLabel(hist: { x0: number; label: string }[]): string | undefined {
  if (!hist.length || hist[0].x0 > 0 || hist[hist.length - 1].x0 < 0) return undefined
  let best = hist[0]
  for (const b of hist) if (Math.abs(b.x0) < Math.abs(best.x0) || (b.x0 <= 0 && b.x0 > best.x0)) best = b
  const zero = hist.find((b) => b.x0 === 0)
  return (zero ?? best).label
}
