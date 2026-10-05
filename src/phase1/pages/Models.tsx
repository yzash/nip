import clsx from 'clsx'
import { ArrowRight, FlaskConical, History, ShieldAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts'
import type { FailureClass } from '@/data/types'
import { date } from '@/lib/format'
import { CLASS_GATES, type GateStatus } from '../content/golive'
import { CLASSES, CLASS_META, useP1, type P1Data, type P1Model } from '../model'
import { AXIS, GRID, PageHead, SOURCE_BY_ID, Section, StatusDot, TT, shortSource } from './howitworks/shared'

const GATE = 0.7
const GATE_LABEL: Record<GateStatus, string> = { drives_approvals: 'Drives approvals', advisory: 'Advisory', shadow: 'Shadow mode' }
const GATE_TONE: Record<GateStatus, string> = { drives_approvals: 'text-ok border-ok/40 bg-ok/10', advisory: 'text-warn border-warn/40 bg-warn/10', shadow: 'text-muted border-line2' }
const pctTxt = (v: number, d = 0) => `${(v * 100).toFixed(d)}%`
const precColor = (p: number) => (p >= GATE ? '#2ECC71' : p >= 0.6 ? '#F5A623' : '#FF3B3B')
const psiTone = (v: number) => (v < 0.1 ? 'text-ok' : v < 0.2 ? 'text-warn' : 'text-bad')
const monthLbl = (m: string) => {
  const [y, mo] = m.split('-')
  return `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(mo) - 1]} ${y.slice(2)}`
}

function GateTag({ g }: { g: GateStatus }) {
  return <span className={clsx('inline-flex h-5 items-center whitespace-nowrap border px-1.5 text-2xs font-semibold uppercase tracking-wide', GATE_TONE[g])}>{GATE_LABEL[g]}</span>
}

export function ModelsPage() {
  const p1 = useP1()
  const [params, setParams] = useSearchParams()
  const sel = (params.get('class') as FailureClass | null) ?? 'all'
  const setSel = (c: string) => setParams(c === 'all' ? {} : { class: c }, { replace: true })

  if (!p1)
    return (
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-6 py-5 text-sm text-faint">Loading model cards…</div>
      </div>
    )

  const clearing = p1.models.filter((m) => m.precision_top_decile >= GATE)
  const nGate = (g: GateStatus) => CLASS_GATES.filter((x) => x.gateAtGoLive === g).length

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        <PageHead
          kicker="Phase 1 · Predictive Planner · How it works · Models"
          title={`Five models, one per failure class. ${clearing.length} clear the 70% precision gate and drive approvals at go-live; ${nGate('advisory')} are advisory; ${nGate('shadow') === 1 ? 'environmental' : nGate('shadow')} scores in shadow until the weather feed lands.`}
          right={
            <div className="border border-line bg-panel px-4 py-2.5 text-right">
              <div className="text-2xs uppercase tracking-wider text-faint">Back-tested on</div>
              <div className="tnum text-xl font-semibold text-ioh-yellow">{Math.max(...p1.models.map((m) => m.backtest_months))} months</div>
              <div className="text-[10.5px] text-faint">scores as of {date(p1.as_of)} · {p1.freshness}</div>
            </div>
          }
        >
          Precision at the alert threshold answers the Head of Network’s question: of the sites we flag as most at risk, how many really fail inside the horizon? A class drives approvals only once that number clears 70% on a 24-month back-test. Below it, the class is still shown, marked advisory, and planners decide on their own judgement.
        </PageHead>

        <div className="mt-5 flex h-10 items-stretch gap-1 border-b border-line">
          {['all', ...CLASSES].map((c) => {
            const on = sel === c
            const meta = c === 'all' ? null : CLASS_META[c as FailureClass]
            const m = p1.models.find((x) => x.failure_class === c)
            return (
              <button
                key={c}
                onClick={() => setSel(c)}
                className={clsx('relative -mb-px flex items-center gap-2 border-b-2 px-3 text-sm font-semibold', on ? 'text-ink' : 'border-transparent text-muted hover:text-ink')}
                style={on ? { borderColor: meta?.color ?? '#FFD100' } : undefined}
              >
                {meta && <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />}
                {meta ? meta.label : 'All classes'}
                {m && <span className="tnum text-xs font-normal" style={{ color: precColor(m.precision_top_decile) }}>{pctTxt(m.precision_top_decile)}</span>}
              </button>
            )
          })}
        </div>

        {sel === 'all' ? <Comparison p1={p1} onPick={setSel} /> : <ModelCard p1={p1} m={p1.models.find((x) => x.failure_class === sel)!} />}

        <ColdStart />
      </div>
    </div>
  )
}

// ---- Comparison -------------------------------------------------------------------------------
function Comparison({ p1, onPick }: { p1: P1Data; onPick: (c: string) => void }) {
  const bars = p1.models.map((m) => ({ cls: CLASS_META[m.failure_class].label, key: m.failure_class, p: m.precision_top_decile * 100, color: CLASS_META[m.failure_class].color }))
  const months = p1.models[0].precision_monthly.map((x, i) => ({
    month: monthLbl(x.month),
    ...Object.fromEntries(p1.models.map((m) => [m.failure_class, Math.round(m.precision_monthly[i].precision * 1000) / 10])),
  }))
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-5">
        <Section title="Precision at the 60% alert threshold vs the 70% gate" sub="24-month back-test, current model version">
          <div className="h-[280px] px-2 pb-2 pt-4">
            <ResponsiveContainer>
              <BarChart data={bars} margin={{ top: 18, right: 64, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="cls" {...AXIS} interval={0} />
                <YAxis {...AXIS} domain={[0, 100]} ticks={[0, 20, 40, 60, 70, 80, 100]} tickFormatter={(v: number) => `${v}%`} width={44} />
                <Tooltip {...TT} formatter={(v: number) => [`${v.toFixed(0)}%`, 'Precision at alert threshold']} />
                <ReferenceLine y={70} stroke="#FFD100" strokeDasharray="4 3" label={{ value: '70% gate', position: 'right', fill: '#FFD100', fontSize: 11 }} />
                <Bar dataKey="p" isAnimationActive={false} maxBarSize={56} onClick={(d: { key?: string }) => d.key && onPick(d.key)} className="cursor-pointer">
                  {bars.map((b) => (
                    <Cell key={b.key} fill={b.color} fillOpacity={b.p >= 70 ? 1 : 0.55} />
                  ))}
                  <LabelList dataKey="p" position="top" formatter={(v: number) => `${v.toFixed(0)}%`} style={{ fill: '#F2F3F5', fontSize: 12, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Section>
        <Section title="Realised precision by month" sub="Back-test months, at the alert threshold · a class drops to advisory after two months below 70%">
          <div className="h-[280px] px-2 pb-2 pt-4">
            <ResponsiveContainer>
              <LineChart data={months} margin={{ top: 8, right: 64, left: 0, bottom: 0 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="month" {...AXIS} interval={1} />
                <YAxis {...AXIS} domain={[40, 90]} ticks={[40, 50, 60, 70, 80, 90]} tickFormatter={(v: number) => `${v}%`} width={44} />
                <Tooltip {...TT} formatter={(v: number, n: string) => [`${v.toFixed(1)}%`, CLASS_META[n as FailureClass]?.label ?? n]} />
                <ReferenceLine y={70} stroke="#FFD100" strokeDasharray="4 3" label={{ value: '70% gate', position: 'right', fill: '#FFD100', fontSize: 11 }} />
                {CLASSES.map((c) => (
                  <Line key={c} dataKey={c} stroke={CLASS_META[c].color} strokeWidth={1.8} dot={false} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-line px-4 py-2">
            {CLASSES.map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-0.5 w-4" style={{ background: CLASS_META[c].color }} />
                {CLASS_META[c].label}
              </span>
            ))}
          </div>
        </Section>
      </div>

      <Section title="All classes side by side" sub="Click a class for its full model card">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-faint">
              <th className="px-4 py-2 font-semibold">Class</th>
              <th className="px-3 py-2 font-semibold">Horizon</th>
              <th className="px-3 py-2 font-semibold">Precision · at alert</th>
              <th className="px-3 py-2 text-right font-semibold">Recall</th>
              <th className="px-3 py-2 text-right font-semibold">False-positive rate</th>
              <th className="px-3 py-2 text-right font-semibold">Override rate</th>
              <th className="px-3 py-2 text-right font-semibold">Drift PSI</th>
              <th className="px-3 py-2 font-semibold">Version</th>
              <th className="px-3 py-2 font-semibold">At go-live</th>
              <th className="px-4 py-2 font-semibold">What clears the gate</th>
            </tr>
          </thead>
          <tbody>
            {p1.models.map((m) => {
              const g = CLASS_GATES.find((x) => x.cls === m.failure_class)!
              const meta = CLASS_META[m.failure_class]
              return (
                <tr key={m.failure_class} onClick={() => onPick(m.failure_class)} className="cursor-pointer border-t border-line/70 align-top hover:bg-panel2">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 font-semibold">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                      {meta.label}
                    </div>
                    <div className="pl-[18px] text-[11px] text-faint">Wave {m.wave}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{m.horizon}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="relative h-2 w-32 bg-line">
                        <div className="h-full" style={{ width: `${m.precision_top_decile * 100}%`, background: precColor(m.precision_top_decile) }} />
                        <div className="absolute -top-1 h-4 w-px bg-ioh-yellow" style={{ left: '70%' }} />
                      </div>
                      <span className="tnum font-semibold">{pctTxt(m.precision_top_decile)}</span>
                    </div>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right">{pctTxt(m.recall)}</td>
                  <td className="tnum px-3 py-2.5 text-right">{pctTxt(m.false_positive_rate, 1)}</td>
                  <td className="tnum px-3 py-2.5 text-right">{pctTxt(m.override_rate)}</td>
                  <td className={clsx('tnum px-3 py-2.5 text-right', psiTone(m.drift_psi))}>{m.drift_psi.toFixed(2)}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px] text-muted">v{m.current_version}</td>
                  <td className="px-3 py-2.5">
                    <GateTag g={g.gateAtGoLive} />
                  </td>
                  <td className="max-w-[360px] px-4 py-2.5 text-xs text-muted">{g.toClear}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-2 text-[11px] text-faint">
          Drift PSI: below 0.10 stable, 0.10–0.20 watch, above 0.20 retrain. Override rate is the share of predictions planners rejected or marked false positive in the parallel run.
        </div>
      </Section>
    </div>
  )
}

// ---- Model card -------------------------------------------------------------------------------
function ModelCard({ p1, m }: { p1: P1Data; m: P1Model }) {
  const meta = CLASS_META[m.failure_class]
  const g = CLASS_GATES.find((x) => x.cls === m.failure_class)!
  const c = m.confusion_at_threshold
  const opPrec = c.tp / (c.tp + c.fp)
  const opRec = c.tp / (c.tp + c.fn)
  const feats = p1.feature_catalog[m.failure_class] ?? []
  const lift = m.lift_by_decile.map((v, i) => ({ d: `D${i + 1}`, v }))
  const monthly = m.precision_monthly.map((x) => ({ month: monthLbl(x.month), p: Math.round(x.precision * 1000) / 10 }))
  const below = m.precision_monthly.slice(-2).every((x) => x.precision < GATE)
  const pr = [...m.pr_curve].sort((a, b) => a.recall - b.recall)

  return (
    <div className="mt-5 space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-7 divide-x divide-line border border-line bg-panel">
        <div className="px-4 py-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-faint">Precision · at alert</div>
          <div className="tnum mt-0.5 text-2xl font-semibold" style={{ color: precColor(m.precision_top_decile) }}>
            {pctTxt(m.precision_top_decile)}
          </div>
          <div className="text-xs text-muted">{m.precision_top_decile >= GATE ? `+${Math.round((m.precision_top_decile - GATE) * 100)} pts over the gate` : `${Math.round((GATE - m.precision_top_decile) * 100)} pt${Math.round((GATE - m.precision_top_decile) * 100) === 1 ? '' : 's'} below the gate`}</div>
        </div>
        <Mini label="Recall" value={pctTxt(m.recall)} sub="of real failures caught" />
        <Mini label="False-positive rate" value={pctTxt(m.false_positive_rate, 1)} sub="healthy sites flagged" />
        <Mini label="Override rate" value={pctTxt(m.override_rate)} sub="planner rejections" />
        <Mini label="Drift PSI" value={<span className={psiTone(m.drift_psi)}>{m.drift_psi.toFixed(2)}</span>} sub={m.drift_psi < 0.1 ? 'stable' : m.drift_psi < 0.2 ? 'watch' : 'retrain'} />
        <Mini label="Base rate" value={pctTxt(m.base_rate, 1)} sub="sites failing per horizon" />
        <div className="px-4 py-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-faint">At go-live</div>
          <div className="mt-1.5">
            <GateTag g={g.gateAtGoLive} />
          </div>
          <div className="mt-1 text-xs text-muted">{m.status}</div>
        </div>
      </div>

      <div className="grid grid-cols-[400px_minmax(0,1fr)] gap-5">
        {/* card facts */}
        <div className="space-y-5">
          <Section
            title={
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} /> {meta.label} model card
              </span>
            }
            right={<span className="font-mono text-[12px] text-muted">v{m.current_version}</span>}
            pad
          >
            <Fact k="Predicts">{m.label}</Fact>
            <Fact k="Algorithm">{m.algorithm}</Fact>
            <Fact k="Horizon">{m.horizon}</Fact>
            <Fact k="Training">{m.training_window}</Fact>
            <Fact k="Back-test">{m.backtest_months} months, point-in-time features</Fact>
            <Fact k="Calibration">Isotonic; 90% interval on every score</Fact>
            <Fact k="Retrain">{m.retrain}</Fact>
            <Fact k="Owner">{m.owner}</Fact>
            <Fact k="Wave">
              Wave {m.wave} · {meta.label} owned by {meta.owner}
            </Fact>
          </Section>

          <Section title={`Features · ${m.features}`} right={<Link to={`/phase1/data?class=${m.failure_class}#features`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">Feature catalog <ArrowRight size={12} /></Link>}>
            <div className="divide-y divide-line/60">
              {feats.map((f) => {
                const s = SOURCE_BY_ID.get(f.source)
                return (
                  <div key={f.id} className="flex items-center gap-3 px-4 py-1.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{f.label}</div>
                      <div className="flex items-center gap-1.5 text-[11px] text-faint">
                        {s && <StatusDot s={s.status} />} {s ? shortSource(s) : f.source} · {f.window}
                      </div>
                    </div>
                    <div className="h-1.5 w-16 bg-line">
                      <div className="h-full" style={{ width: `${(f.importance / 0.25) * 100}%`, background: meta.color }} />
                    </div>
                    <span className="tnum w-8 text-right text-[11px] text-muted">{Math.round(f.importance * 100)}%</span>
                  </div>
                )
              })}
            </div>
          </Section>

          <Section title="Versions" right={<History size={14} className="text-faint" />} pad>
            <ol className="relative ml-1.5 border-l border-line2">
              {[...m.versions].reverse().map((v) => (
                <li key={v.version} className="relative pb-3 pl-4 last:pb-0">
                  <span className={clsx('absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full border', v.version === m.current_version ? 'border-ioh-yellow bg-ioh-yellow' : 'border-line2 bg-panel')} />
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-[12px] font-semibold">v{v.version}</span>
                    <span className="text-[11px] text-faint">{date(v.date)}</span>
                    {v.version === m.current_version && <span className="text-[10px] font-semibold uppercase tracking-wide text-ioh-yellow">champion</span>}
                  </div>
                  <div className="text-xs text-muted">{v.note}</div>
                </li>
              ))}
            </ol>
          </Section>
        </div>

        {/* charts */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5">
            <Section title="Precision vs recall" sub={`Operating point at the ${Math.round(c.threshold * 100)}% red floor: precision ${pctTxt(opPrec)}, recall ${pctTxt(opRec)}`}>
              <div className="h-[240px] px-2 pb-2 pt-3">
                <ResponsiveContainer>
                  <LineChart data={pr} margin={{ top: 6, right: 16, left: 0, bottom: 14 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="recall" type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={(v: number) => `${v * 100}%`} {...AXIS} label={{ value: 'Recall', position: 'insideBottom', offset: -8, fill: '#6B7280', fontSize: 11 }} />
                    <YAxis domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.7, 0.8, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} {...AXIS} width={44} />
                    <Tooltip {...TT} formatter={(v: number) => [pctTxt(v, 1), 'Precision']} labelFormatter={(l: number) => `Recall ${pctTxt(l)}`} />
                    <ReferenceLine y={GATE} stroke="#FFD100" strokeDasharray="4 3" />
                    <Line dataKey="precision" stroke={meta.color} strokeWidth={2} dot={false} isAnimationActive={false} />
                    <ReferenceDot x={opRec} y={opPrec} r={5} fill="#FFD100" stroke="#0F1115" strokeWidth={2} label={{ value: 'operating point', position: 'bottom', fill: '#F2F3F5', fontSize: 11, offset: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title="Calibration" sub="Predicted probability vs observed failure rate, by score bin">
              <div className="h-[240px] px-2 pb-2 pt-3">
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 6, right: 16, left: 0, bottom: 14 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="predicted" type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={(v: number) => `${v * 100}%`} {...AXIS} label={{ value: 'Predicted', position: 'insideBottom', offset: -8, fill: '#6B7280', fontSize: 11 }} />
                    <YAxis dataKey="observed" type="number" domain={[0, 1]} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} tickFormatter={(v: number) => `${Math.round(v * 100)}%`} {...AXIS} width={44} />
                    <ZAxis dataKey="n" range={[30, 160]} />
                    <Tooltip {...TT} cursor={false} formatter={(v: number, n: string) => (n === 'n' ? [v.toLocaleString('en-US'), 'Sites'] : [pctTxt(v, 1), n === 'predicted' ? 'Predicted' : 'Observed'])} />
                    <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="#6B7280" strokeDasharray="4 3" />
                    <Scatter data={m.calibration} fill={meta.color} line={{ stroke: meta.color, strokeWidth: 1.5 }} isAnimationActive={false} />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title="Lift by risk decile" sub="Failure rate in each decile of risk score, as a multiple of the base rate">
              <div className="h-[240px] px-2 pb-2 pt-3">
                <ResponsiveContainer>
                  <BarChart data={lift} margin={{ top: 18, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} vertical={false} />
                    <XAxis dataKey="d" {...AXIS} />
                    <YAxis {...AXIS} width={44} tickFormatter={(v: number) => `${v}×`} />
                    <Tooltip {...TT} formatter={(v: number) => [`${v.toFixed(1)}× base rate`, 'Lift']} />
                    <ReferenceLine y={1} stroke="#6B7280" strokeDasharray="4 3" />
                    <Bar dataKey="v" isAnimationActive={false} maxBarSize={34}>
                      {lift.map((x, i) => (
                        <Cell key={x.d} fill={meta.color} fillOpacity={i === 0 ? 1 : 0.45} />
                      ))}
                      <LabelList dataKey="v" position="top" formatter={(v: number) => (v >= 2 ? `${v.toFixed(1)}×` : '')} style={{ fill: '#A3AAB8', fontSize: 11 }} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title="Precision by month" sub={below ? 'Last two months below 70%: the class is advisory' : 'Realised precision at the alert threshold against the 70% gate'}>
              <div className="h-[240px] px-2 pb-2 pt-3">
                <ResponsiveContainer>
                  <LineChart data={monthly} margin={{ top: 6, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} vertical={false} />
                    <XAxis dataKey="month" {...AXIS} interval={1} />
                    <YAxis {...AXIS} domain={[40, 90]} ticks={[40, 50, 60, 70, 80, 90]} tickFormatter={(v: number) => `${v}%`} width={44} />
                    <Tooltip {...TT} formatter={(v: number) => [`${v.toFixed(1)}%`, 'Precision']} />
                    <ReferenceLine y={70} stroke="#FFD100" strokeDasharray="4 3" label={{ value: '70%', position: 'insideTopRight', fill: '#FFD100', fontSize: 11 }} />
                    <Line
                      dataKey="p"
                      stroke={meta.color}
                      strokeWidth={2}
                      isAnimationActive={false}
                      dot={(props: { cx?: number; cy?: number; payload?: { p: number }; index?: number }) => (
                        <circle key={props.index} cx={props.cx} cy={props.cy} r={3} fill={(props.payload?.p ?? 0) >= 70 ? meta.color : '#FF3B3B'} stroke="#171A21" strokeWidth={1} />
                      )}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Section>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
            <Section title={`Confusion matrix at the ${Math.round(c.threshold * 100)}% threshold`} sub="Back-test sites, one horizon. No site turns red below 60%.">
              <div className="grid grid-cols-[110px_1fr_1fr] gap-px bg-line p-px text-sm">
                <div className="bg-panel" />
                <div className="bg-panel px-3 py-1.5 text-center text-2xs font-semibold uppercase tracking-wider text-faint">Failed</div>
                <div className="bg-panel px-3 py-1.5 text-center text-2xs font-semibold uppercase tracking-wider text-faint">Did not fail</div>
                <div className="flex items-center bg-panel px-3 text-2xs font-semibold uppercase tracking-wider text-faint">Flagged red</div>
                <Cellx n={c.tp} label="True positive" tone="ok" />
                <Cellx n={c.fp} label="False alarm" tone="warn" />
                <div className="flex items-center bg-panel px-3 text-2xs font-semibold uppercase tracking-wider text-faint">Not flagged</div>
                <Cellx n={c.fn} label="Missed" tone="bad" />
                <Cellx n={c.tn} label="True negative" tone="none" />
              </div>
              <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
                <Mini label="Precision" value={pctTxt(opPrec)} />
                <Mini label="Recall" value={pctTxt(opRec)} />
                <Mini label="Sites flagged red" value={(c.tp + c.fp).toLocaleString('en-US')} />
              </div>
            </Section>

            <Section title="Go-live gate" sub="What it takes for this class to drive approvals" pad>
              <div className="flex items-center gap-2">
                <GateTag g={g.gateAtGoLive} />
                <span className="text-sm">{g.today}</span>
              </div>
              <div className="mt-3 text-2xs font-semibold uppercase tracking-wider text-faint">To clear or keep the gate</div>
              <div className="mt-0.5 text-sm text-muted">{g.toClear}</div>
              <div className="mt-3 text-2xs font-semibold uppercase tracking-wider text-faint">Sources it depends on</div>
              <div className="mt-1 space-y-1">
                {g.blockingSources.map((id) => {
                  const s = SOURCE_BY_ID.get(id)
                  if (!s) return null
                  return (
                    <Link key={id} to={`/phase1/data?source=${id}#catalog`} className="flex items-center gap-2 text-sm hover:text-ioh-yellow">
                      <StatusDot s={s.status} /> {s.name}
                      <span className="text-[11px] text-faint">{s.status.replace(/_/g, ' ')}</span>
                    </Link>
                  )
                })}
              </div>
            </Section>
          </div>
        </div>
      </div>
    </div>
  )
}

function Mini({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="px-4 py-3">
      <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className="tnum mt-0.5 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

function Fact({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 border-b border-line/60 py-1.5 last:border-b-0">
      <div className="pt-0.5 text-2xs font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className="text-sm">{children}</div>
    </div>
  )
}

function Cellx({ n, label, tone }: { n: number; label: string; tone: 'ok' | 'warn' | 'bad' | 'none' }) {
  const c = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-muted'
  return (
    <div className="bg-panel px-3 py-3 text-center">
      <div className={clsx('tnum text-xl font-semibold', c)}>{n.toLocaleString('en-US')}</div>
      <div className="text-[11px] text-faint">{label}</div>
    </div>
  )
}

function ColdStart() {
  return (
    <div className="mt-5 grid grid-cols-3 gap-px border border-line bg-line">
      {[
        { icon: FlaskConical, title: 'Cold start: real numbers, not projections', text: 'Wave 1 launches on 24 months of history, back-tested with point-in-time features, so the first precision number the Head of Network sees is measured, not promised.' },
        { icon: ShieldAlert, title: 'No site turns red below 60%', text: 'Every score is calibrated and carries a 90% interval. The 60% red floor is policy; below it a site is watched, not escalated.' },
        { icon: History, title: 'Gates are re-checked every month', text: 'The Model Drift Agent compares predictions with realised failures. A class drops to advisory if realised precision stays below 70% for two months; champion / challenger on every retrain.' },
      ].map((x) => (
        <div key={x.title} className="bg-panel p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <x.icon size={15} className="text-ioh-yellow" /> {x.title}
          </div>
          <div className="mt-1.5 text-xs leading-[17px] text-muted">{x.text}</div>
        </div>
      ))}
    </div>
  )
}
