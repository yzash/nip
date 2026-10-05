import clsx from 'clsx'
import { Check, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, Fresh, Id, Label, Seg, Tabs, Td, Th } from '@/components/ui'
import { db } from '@/data/db'
import type { FailureClass } from '@/data/types'
import { date, idr, num } from '@/lib/format'
import { useApp } from '@/store/app'
import { CLASSES, CLASS_META, useP1 } from '../model'
import { useP1Store } from '../store'
import { ClusterDrawer } from './forecast/ClusterDrawer'
import { ForecastMap } from './forecast/ForecastMap'
import {
  ClassChip,
  CoverageBadge,
  GATE_LABEL,
  GATE_TONE,
  GateBadge,
  STORY_LABEL,
  classOrder,
  districtName,
  fits,
  gateOf,
  pctTxt,
  planForCluster,
  recommendedOf,
  useBuildPlan,
  useClusters,
  usePredSites,
  weekDate,
  weekTxt,
  windowDays,
} from './forecast/common'

type ClsFilter = 'all' | FailureClass
const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8]

export function ForecastPage() {
  const D = db()
  const nav = useNavigate()
  const [sp, setSp] = useSearchParams()
  const p1 = useP1()
  const role = useApp((s) => s.role)
  const plans = useP1Store((s) => s.plans)
  const build = useBuildPlan()
  const clusters = useClusters()
  const all = usePredSites(p1, clusters)
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all])
  const order = classOrder(role)

  const rawCls = sp.get('class')
  const cls: ClsFilter = rawCls && (CLASSES as string[]).includes(rawCls) ? (rawCls as FailureClass) : 'all'
  const selId = sp.get('cluster')
  const selCluster = selId ? clusters.find((c) => c.id === selId) ?? null : null
  const [week, setWeek] = useState(8)
  const [wk, setWk] = useState<number | null>(null)
  const [view, setView] = useState<'clusters' | 'sites'>('clusters')
  const [watch, setWatch] = useState(false)
  const [limit, setLimit] = useState(60)

  const setParam = (k: string, v: string | null) => {
    const n = new URLSearchParams(sp)
    if (v === null || v === 'all') n.delete(k)
    else n.set(k, v)
    setSp(n, { replace: true })
  }

  const pred = useMemo(() => all.filter((s) => s.cw > 0), [all])
  const inCls = <T extends { cls: FailureClass }>(x: T) => cls === 'all' || x.cls === cls
  const predCls = pred.filter(inCls)
  const clCls = clusters.filter(inCls)
  const counts = useMemo(() => {
    const m: Record<string, number> = { all: pred.length }
    for (const c of order) m[c] = pred.filter((s) => s.cls === c).length
    return m
  }, [pred, order])
  const matrix = useMemo(() => {
    const m: Record<string, number[]> = {}
    for (const c of order) m[c] = WEEKS.map((w) => pred.filter((s) => s.cls === c && s.cw === w).length)
    return m
  }, [pred, order])
  const matrixMax = Math.max(1, ...Object.values(matrix).flat())

  // headline
  const exposure = clCls.reduce((s, c) => s + c.exposure_idr, 0)
  const uncovered = clCls.filter((c) => c.coverage.verdict === 'not_covered')
  const unplanned = uncovered.filter((c) => !planForCluster(plans, c.id))
  const earliest = [...clCls].sort((a, b) => a.crossing_week - b.crossing_week || b.priority - a.priority)[0]
  const loose = predCls.filter((s) => !s.cluster)
  const verb = cls === 'all' ? 'fail or saturate' : cls === 'capacity' ? 'saturate' : 'fail'
  const noun = cls === 'all' ? 'sites' : `${CLASS_META[cls].label.toLowerCase()} sites`
  const runDate = p1?.run_dates[p1.run_dates.length - 1] ?? D.meta.now.slice(0, 10)
  const redAtWeek = predCls.filter((s) => s.probs[week - 1] >= 0.6).length

  // lists
  const clRows = clCls
    .filter((c) => wk === null || c.crossing_week === wk)
    .sort((a, b) => (role === 'OPS' ? Number(a.cls === 'capacity') - Number(b.cls === 'capacity') : 0) || b.priority - a.priority)
  const siteRows = all.filter((s) => inCls(s) && (watch ? true : s.cw > 0) && (wk === null || s.cw === wk)).sort((a, b) => (a.cw || 99) - (b.cw || 99) || b.p8 - a.p8)
  const watchCount = all.filter((s) => inCls(s) && s.cw === 0).length

  const mapSites = useMemo(() => all.filter((s) => cls === 'all' || s.cls === cls), [all, cls])
  const stories = clusters.filter((c) => c.story && STORY_LABEL[c.story])

  const tabs = [{ id: 'all' as ClsFilter, label: <span className="flex items-center gap-1.5">All classes <span className="tnum text-faint">{counts.all}</span></span> }].concat(
    order.map((c) => ({
      id: c as ClsFilter,
      label: (
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[c].color }} />
          {CLASS_META[c].label} <span className="tnum text-faint">{counts[c]}</span>
        </span>
      ),
    })),
  )

  return (
    <div className="absolute inset-0">
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-6 py-5">
          {/* headline */}
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0">
              <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Step 1 · Predict · Site Failure Prediction Agent + Forecast Orchestrator</div>
              <h1 className="mt-1 text-[22px] font-semibold leading-7">
                {num(predCls.length)} {noun} will {verb} in the next 8 weeks across {num(clCls.length)} clusters; <span className="text-ioh-yellow">{idr(exposure)} a month</span> at risk.
              </h1>
              <p className="mt-1.5 max-w-[900px] text-sm text-muted">
                {unplanned.length > 0 ? (
                  <>
                    {unplanned.length} of the {uncovered.length} uncovered clusters have no plan yet ({idr(unplanned.reduce((s, c) => s + c.exposure_idr, 0))}/mo).{' '}
                  </>
                ) : (
                  <>Every uncovered cluster has a plan. </>
                )}
                {earliest && (
                  <>
                    Earliest crossing:{' '}
                    <button className="text-ink underline decoration-line2 underline-offset-2 hover:decoration-ioh-yellow" onClick={() => setParam('cluster', earliest.id)}>
                      {earliest.story ? STORY_LABEL[earliest.story] : `${earliest.id} · ${CLASS_META[earliest.cls].label} · ${earliest.title}`}
                    </button>{' '}
                    in {weekTxt(earliest.crossing_week, true)}.{' '}
                  </>
                )}
                {loose.length > 0 && (
                  <>
                    {loose.length} predicted site{loose.length > 1 ? 's sit' : ' sits'} outside any open cluster
                    {loose.every((x) => x.site.program_id) ? `, already inside ${[...new Set(loose.map((x) => x.site.program_id))].join(', ')}` : ''}.
                  </>
                )}
              </p>
            </div>
            <div className="w-[340px] shrink-0 border border-line bg-panel px-4 py-2.5">
              {cls === 'all' ? (
                <>
                  <div className="flex items-center justify-between text-2xs uppercase tracking-wider text-faint">
                    <span>5 class models · gate at go-live</span>
                    <Fresh f="D-1" asOf={p1?.as_of} />
                  </div>
                  <div className="mt-1.5 grid grid-cols-5 gap-1">
                    {order.map((c) => {
                      const g = gateOf(c).gateAtGoLive
                      const m = p1?.models.find((x) => x.failure_class === c)
                      return (
                        <button key={c} onClick={() => setParam('class', c)} title={`${CLASS_META[c].label}: ${GATE_LABEL[g]} · v${m?.current_version ?? '—'}`} className="border border-line px-1 py-1 text-left hover:border-line2">
                          <div className="flex items-center gap-1 text-[10px] font-semibold">
                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: CLASS_META[c].color }} />
                            {CLASS_META[c].short}
                          </div>
                          <div className={clsx('text-[9.5px] font-semibold uppercase', GATE_TONE[g] === 'ok' ? 'text-ok' : GATE_TONE[g] === 'warn' ? 'text-warn' : 'text-faint')}>{g === 'drives_approvals' ? 'Drives' : g === 'advisory' ? 'Advisory' : 'Shadow'}</div>
                          <div className="tnum text-[9.5px] text-faint">{m ? `${Math.round(m.precision_top_decile * 100)}%` : '—'}</div>
                        </button>
                      )
                    })}
                  </div>
                </>
              ) : (
                (() => {
                  const m = p1?.models.find((x) => x.failure_class === cls)
                  return (
                    <>
                      <div className="flex items-center justify-between text-2xs uppercase tracking-wider text-faint">
                        <span>{CLASS_META[cls].label} model</span>
                        <Fresh f="D-1" asOf={p1?.as_of} />
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="font-mono text-sm font-semibold">v{m?.current_version ?? '—'}</span>
                        <GateBadge cls={cls} />
                      </div>
                      <div className="tnum mt-0.5 text-[11px] text-muted">
                        Precision {m ? Math.round(m.precision_top_decile * 100) : '—'}% at the 60% alert threshold vs 70% gate · recall {m ? Math.round(m.recall * 100) : '—'}% · horizon {CLASS_META[cls].horizon}
                      </div>
                    </>
                  )
                })()
              )}
              <div className="tnum mt-1.5 border-t border-line pt-1.5 text-[10.5px] text-faint">
                Forecast run {date(runDate)} 05:00 WIB · features as of {date(p1?.as_of ?? D.meta.as_of)}
              </div>
            </div>
          </div>

          {/* class tabs */}
          <Tabs className="mt-4" tabs={tabs} value={cls} onChange={(v) => { setParam('class', v); setWk(null) }} />

          {/* map + matrix */}
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_400px] gap-4">
            <section className="relative h-[470px] border border-line bg-panel">
              <ForecastMap sites={mapSites} week={week} clusters={clCls} selected={selId} showLink={cls === 'all' || cls === 'transport'} onSite={(id) => nav(`/phase1/site/${id}`)} onCluster={(id) => setParam('cluster', id)} />
              <div className="pointer-events-none absolute left-3 top-3 border border-line bg-panel/95 px-2.5 py-1.5 text-[11px]">
                <div className="font-semibold">
                  Predicted failure at W+{week} <span className="font-normal text-faint">· {date(weekDate(week))}</span>
                </div>
                <div className="tnum text-muted">
                  <span className="font-semibold text-bad">{redAtWeek}</span> red of {predCls.length} predicted by W+8
                </div>
                <div className="mt-1 flex items-center gap-3 text-faint">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-bad" />≥ 60%</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn" />30–60%</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-[#4B5563]" />&lt; 30% yet</span>
                  <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-ioh-yellow" />cluster</span>
                </div>
              </div>
              <div className="absolute bottom-3 left-3 right-3 border border-line bg-panel/95 px-3 pb-1.5 pt-2">
                <div className="flex items-center gap-3">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-faint">Today</span>
                  <div className="relative flex-1">
                    <input type="range" min={1} max={8} step={1} value={week} onChange={(e) => setWeek(Number(e.target.value))} className="block w-full accent-[#FFD100]" aria-label="Forecast week" />
                    <div className="mt-0.5 flex justify-between px-[2px]">
                      {WEEKS.map((w) => (
                        <button key={w} onClick={() => setWeek(w)} className={clsx('tnum w-10 text-center text-[11px] font-semibold first:text-left last:text-right', week === w ? 'text-ioh-yellow' : 'text-faint hover:text-ink')}>
                          W+{w}
                        </button>
                      ))}
                    </div>
                  </div>
                  <span className="tnum w-[92px] text-right text-[11px] text-muted">{date(weekDate(week))}</span>
                </div>
              </div>
            </section>

            <section className="flex flex-col border border-line bg-panel">
              <header className="flex h-10 items-center justify-between border-b border-line px-4">
                <h3 className="text-sm font-semibold">Sites crossing 60%, by week</h3>
                <Fresh f="D-1" />
              </header>
              <div className="px-3 pt-2">
                <table className="w-full table-fixed text-xs">
                  <thead>
                    <tr className="text-2xs uppercase tracking-wider text-faint">
                      <th className="w-[74px] pb-1 text-left font-semibold">Class</th>
                      {WEEKS.map((w) => (
                        <th key={w} className="pb-1 text-center font-semibold">W+{w}</th>
                      ))}
                      <th className="w-9 pb-1 text-right font-semibold">Σ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.map((c) => (
                      <tr key={c} className={clsx(cls !== 'all' && cls !== c && 'opacity-40')}>
                        <td className="py-0.5">
                          <button onClick={() => { setParam('class', c); setWk(null) }} className="hover:text-ioh-yellow">
                            <ClassChip cls={c} short />
                          </button>
                        </td>
                        {matrix[c].map((n, k) => {
                          const w = k + 1
                          const on = wk === w && cls === c
                          return (
                            <td key={w} className="p-0.5">
                              <button
                                disabled={!n}
                                onClick={() => {
                                  if (on) setWk(null)
                                  else {
                                    setWk(w)
                                    setParam('class', c)
                                    setWeek(w)
                                  }
                                }}
                                className={clsx('tnum flex h-7 w-full items-center justify-center text-[11.5px] font-semibold', on ? 'outline outline-2 outline-ioh-yellow' : n && 'hover:outline hover:outline-1 hover:outline-line2', !n && 'text-faint/50')}
                                style={n ? { background: `${CLASS_META[c].color}${Math.round(25 + (n / matrixMax) * 150).toString(16).padStart(2, '0')}` } : undefined}
                              >
                                {n || '·'}
                              </button>
                            </td>
                          )
                        })}
                        <td className="tnum py-0.5 text-right font-semibold">{matrix[c].reduce((a, b) => a + b, 0)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-line text-muted">
                      <td className="pt-1 text-2xs uppercase tracking-wider text-faint">Cum.</td>
                      {WEEKS.map((w) => (
                        <td key={w} className="tnum pt-1 text-center text-[11px]">
                          {order.reduce((s, c) => s + matrix[c].slice(0, w).reduce((a, b) => a + b, 0), 0)}
                        </td>
                      ))}
                      <td className="tnum pt-1 text-right font-semibold text-ink">{pred.length}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-1.5 text-[10.5px] text-faint">Week a site first crosses the 60% red floor. Click a cell to filter the list and move the map to that week.</div>
              </div>
              <div className="mt-3 flex-1 border-t border-line">
                <div className="px-4 pb-1 pt-2.5">
                  <Label>Story clusters</Label>
                </div>
                {stories.map((c) => {
                  const pl = planForCluster(plans, c.id)
                  return (
                    <button key={c.id} onClick={() => { setParam('cluster', c.id) }} className={clsx('flex w-full items-center gap-3 border-t border-line/60 px-4 py-2 text-left hover:bg-panel2', selId === c.id && 'bg-panel2')}>
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: CLASS_META[c.cls].color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold">{STORY_LABEL[c.story!]}</span>
                        <span className="tnum block truncate text-[11px] text-faint">
                          {c.id} · {c.site_ids.length} sites · W+{c.crossing_week} · {idr(c.exposure_idr)}/mo
                        </span>
                      </span>
                      <CoverageBadge c={c} plan={pl} />
                    </button>
                  )
                })}
              </div>
            </section>
          </div>

          {/* lists */}
          <section className="mt-4 border border-line bg-panel">
            <header className="flex h-11 items-center gap-3 border-b border-line px-4">
              <Seg
                options={[
                  { id: 'clusters', label: `Clusters ${clCls.length}` },
                  { id: 'sites', label: `Sites ${predCls.length}` },
                ]}
                value={view}
                onChange={(v) => setView(v as 'clusters' | 'sites')}
              />
              {view === 'sites' && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" checked={watch} onChange={(e) => setWatch(e.target.checked)} className="accent-[#FFD100]" />
                  Include watch list (30–60% by W+8) <span className="tnum text-faint">{watchCount}</span>
                </label>
              )}
              {wk !== null && (
                <button onClick={() => setWk(null)} className="flex items-center gap-1 border border-ioh-yellow/60 px-1.5 py-0.5 text-[11px] text-ioh-yellow">
                  Crossing W+{wk} <X size={11} />
                </button>
              )}
              <span className="ml-auto text-[11px] text-faint">
                {view === 'clusters' ? (role === 'OPS' ? 'Operations view: non-capacity classes first, then priority' : 'Ranked by priority (exposure × probability × urgency)') : 'Sorted by crossing week, then probability'}
              </span>
              <Fresh f="D-1" />
            </header>
            {view === 'clusters' ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th className="w-8 text-right">#</Th>
                      <Th>Cluster</Th>
                      <Th>Class</Th>
                      <Th className="text-right">Sites</Th>
                      <Th>Crosses 60%</Th>
                      <Th className="text-right">Prob.</Th>
                      <Th className="text-right">IDR / mo</Th>
                      <Th>Coverage</Th>
                      <Th>Recommended rung</Th>
                      <Th>Lead · window</Th>
                      <Th className="text-right"> </Th>
                    </tr>
                  </thead>
                  <tbody>
                    {clRows.map((c, k) => {
                      const rec = recommendedOf(c)
                      const ok = rec ? fits(rec, c) : false
                      const pl = planForCluster(plans, c.id)
                      return (
                        <tr key={c.id} onClick={() => setParam('cluster', c.id)} className={clsx('cursor-pointer hover:bg-panel2', selId === c.id && 'bg-panel2')}>
                          <Td className="tnum text-right text-faint">{k + 1}</Td>
                          <Td className="max-w-[200px] 2xl:max-w-[270px]">
                            <div className="flex items-center gap-2">
                              <Id>{c.id}</Id>
                              <span className="truncate" title={c.title}>{c.title}</span>
                              {c.story && STORY_LABEL[c.story] && <Badge tone="yellow">Story</Badge>}
                            </div>
                          </Td>
                          <Td>
                            <ClassChip cls={c.cls} short className="2xl:hidden" />
                            <ClassChip cls={c.cls} className="hidden 2xl:inline-flex" />
                          </Td>
                          <Td className="tnum text-right">{c.site_ids.length}</Td>
                          <Td className="tnum">{weekTxt(c.crossing_week)}</Td>
                          <Td className="tnum text-right font-semibold">{pctTxt(c.probability)}</Td>
                          <Td className="tnum text-right">{idr(c.exposure_idr)}</Td>
                          <Td><CoverageBadge c={c} plan={pl} /></Td>
                          <Td className="max-w-[170px] 2xl:max-w-[230px]">
                            {rec ? (
                              <div className="truncate" title={`${rec.name} · ${idr(rec.cost_idr)}`}>
                                {rec.name} <span className="tnum hidden text-faint 2xl:inline">· {rec.cost_idr ? idr(rec.cost_idr) : 'IDR 0'}</span>
                              </div>
                            ) : (
                              <span className="text-faint">—</span>
                            )}
                          </Td>
                          <Td className="tnum" title={rec ? `Recommended rung lead ${rec.lead_days} d vs ${windowDays(c)} d to breach` : undefined}>
                            {rec ? (
                              <span className={clsx('inline-flex items-center gap-1', ok ? 'text-ok' : 'text-bad')}>
                                {ok ? <Check size={13} /> : <X size={13} />}
                                <span className="text-ink">{rec.lead_days} d</span>
                                <span className="text-faint">/ {windowDays(c)} d</span>
                              </span>
                            ) : (
                              '—'
                            )}
                          </Td>
                          <Td className="text-right">
                            <span onClick={(e) => e.stopPropagation()}>
                              {pl ? (
                                <Button size="sm" onClick={() => nav(`/phase1/plans/${pl.id}`)}>
                                  Open {pl.id}
                                </Button>
                              ) : (
                                <Button size="sm" variant={c.coverage.verdict === 'covered' ? 'ghost' : 'default'} onClick={() => build(c)}>
                                  Build plan
                                </Button>
                              )}
                            </span>
                          </Td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {clRows.length === 0 && <div className="px-4 py-8 text-center text-sm text-faint">No clusters cross in W+{wk} for this class.</div>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr>
                      <Th>Site</Th>
                      <Th>District</Th>
                      <Th>Class</Th>
                      <Th className="text-right">p W+8</Th>
                      <Th>90% interval</Th>
                      <Th>Crosses 60%</Th>
                      <Th>Top factor</Th>
                      <Th>Cluster</Th>
                      <Th className="text-right">Revenue / mo</Th>
                      <Th>Program</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {siteRows.slice(0, limit).map((s) => (
                      <tr key={s.id} onClick={() => nav(`/phase1/site/${s.id}`)} className="cursor-pointer hover:bg-panel2">
                        <Td>
                          <Id>{s.id}</Id> <span className="ml-1">{s.site.name}</span>
                        </Td>
                        <Td className="max-w-[120px] truncate text-muted 2xl:max-w-[170px]">{districtName(s.site.district_id)}</Td>
                        <Td>
                          <ClassChip cls={s.cls} short className="2xl:hidden" />
                          <ClassChip cls={s.cls} className="hidden 2xl:inline-flex" />
                        </Td>
                        <Td className="tnum text-right font-semibold" >
                          <span style={{ color: s.p8 >= 0.6 ? '#FF3B3B' : '#F5A623' }}>{pctTxt(s.p8)}</span>
                        </Td>
                        <Td className="tnum text-muted">{s.p1 ? `${pctTxt(s.p1.ci90[0])}–${pctTxt(s.p1.ci90[1])}` : '—'}</Td>
                        <Td className="tnum">{s.cw ? weekTxt(s.cw) : <Badge tone="warn">Watch</Badge>}</Td>
                        <Td className="max-w-[170px] truncate text-muted 2xl:max-w-[240px]" title={s.topFactor}>{s.topFactor}</Td>
                        <Td>
                          {s.cluster ? (
                            <button onClick={(e) => { e.stopPropagation(); setParam('cluster', s.cluster!.id) }} className="font-mono text-[11.5px] text-muted hover:text-ioh-yellow">
                              {s.cluster.id}
                            </button>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </Td>
                        <Td className="tnum text-right">{idr(s.rev)}</Td>
                        <Td>{s.site.program_id ? <Badge tone="prog">{s.site.program_id}</Badge> : <span className="text-faint">—</span>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {siteRows.length > limit && (
                  <div className="flex items-center justify-center border-t border-line py-2">
                    <Button size="sm" variant="ghost" onClick={() => setLimit(limit + 200)}>
                      Show {Math.min(200, siteRows.length - limit)} more of {siteRows.length - limit}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </section>
          <div className="mt-2 pb-2 text-[11px] text-faint">
            Probabilities from the Site Failure Prediction Agent (one gradient-boosted model per class, calibrated monthly). No site turns red below 60%. Exposure from the Revenue Exposure Agent; coverage from the Program Match Agent.
          </div>
        </div>
      </div>
      <ClusterDrawer cluster={selCluster} byId={byId} p1={p1} onClose={() => setParam('cluster', null)} />
    </div>
  )
}
