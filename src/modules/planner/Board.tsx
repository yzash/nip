import clsx from 'clsx'
import { AlertTriangle, ArrowRight, Check, Search, Wand2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db } from '@/data/db'
import type { FailureClass } from '@/data/types'
import { Badge, Button, Empty, Fresh, Id, Label, Panel, Seg, Td, Th } from '@/components/ui'
import { CLASS_LABEL, date, dateShort, idr, num } from '@/lib/format'
import { useApp, useRole } from '@/store/app'
import { bekasiPlan, CLASS_CHIP_ORDER, CLASSES, clusters, planForSites, REGIONS, summarise, useForecast, type FRow } from './model'

type Cov = 'all' | 'covered' | 'not'

export function Board({ selected, setSelected, goBuilder }: { selected: string[]; setSelected: (s: string[]) => void; goBuilder: () => void }) {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const role = useRole()
  const setPlan = useApp((s) => s.setPlan)
  const toast = useApp((s) => s.toast)
  const incidents = useApp((s) => s.incidents)
  const { rows, thr } = useForecast()
  const D = db()

  const initCls = params.get('class') as FailureClass | null
  const initCov = params.get('cov')
  const [cls, setCls] = useState<FailureClass | 'all'>(initCls && CLASSES.includes(initCls) ? initCls : 'all')
  const [cov, setCov] = useState<Cov>(initCov === 'not' ? 'not' : initCov === 'covered' ? 'covered' : 'all')
  const [region, setRegion] = useState<string>('all')
  const [week, setWeek] = useState<number | null>(null)
  const [q, setQ] = useState('')

  // Rows after scope + region + coverage + search (the matrix navigates within these).
  const base = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (region === 'all' || r.region === region) &&
        (cov === 'all' || (cov === 'covered' ? r.covered : !r.covered)) &&
        (!s || r.site_id.toLowerCase().includes(s) || r.name.toLowerCase().includes(s) || r.district.toLowerCase().includes(s) || (r.incident?.incident_id.toLowerCase().includes(s) ?? false)),
    )
  }, [rows, region, cov, q])
  const list = useMemo(() => base.filter((r) => (cls === 'all' || r.cls === cls) && (week === null || r.cw === week)), [base, cls, week])

  const headRows = useMemo(() => rows.filter((r) => (cls === 'all' || r.cls === cls) && (region === 'all' || r.region === region)), [rows, cls, region])
  const sum = summarise(headRows)
  const byClass = useMemo(() => Object.fromEntries(CLASSES.map((c) => [c, summarise(rows.filter((r) => r.cls === c && (region === 'all' || r.region === region)))])), [rows, region])
  const uncoveredClusters = useMemo(() => clusters(headRows.filter((r) => !r.covered)), [headRows])
  const gaps = useMemo(() => headRows.filter((r) => r.rfsLate), [headRows])

  const matrix = useMemo(() => {
    const m: Record<string, number[]> = Object.fromEntries(CLASSES.map((c) => [c, Array(8).fill(0)]))
    for (const r of base) m[r.cls][r.cw - 1]++
    return m
  }, [base])
  const maxCell = Math.max(1, ...Object.values(matrix).flat())

  const bekasiId = D.meta.story_incidents.bekasi_capacity
  const bekasiInc = incidents.find((x) => x.incident_id === bekasiId)
  const bekasiOpen = bekasiInc && !bekasiInc.program_id && rows.some((r) => r.incident?.incident_id === bekasiId && !r.covered)

  const selSet = new Set(selected)
  const toggle = (id: string) => setSelected(selSet.has(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const allVisibleSelected = list.length > 0 && list.every((r) => selSet.has(r.site_id))
  const toggleAll = () => {
    if (allVisibleSelected) setSelected(selected.filter((id) => !list.some((r) => r.site_id === id)))
    else setSelected([...new Set([...selected, ...list.map((r) => r.site_id)])])
  }

  const build = () => {
    const plan = planForSites(selected, rows)
    setPlan(plan)
    toast(`Draft plan ${plan.id}: ${plan.site_ids.length} sites · ${plan.intervention_label} · RFS ${date(plan.target_rfs)}`)
    goBuilder()
  }
  const planBekasi = () => {
    const plan = bekasiPlan()
    setPlan(plan)
    setSelected(plan.site_ids)
    toast(`Draft plan ${plan.id}: 14 Bekasi sites · sector add · stock check done`)
    goBuilder()
  }
  const selectCluster = (ids: string[]) => {
    setSelected(ids)
  }

  const verb = cls === 'capacity' ? 'saturate' : cls === 'all' ? 'fail or saturate' : 'fail'
  const selClasses = new Set(rows.filter((r) => selSet.has(r.site_id)).map((r) => r.cls))

  return (
    <div className="space-y-4 p-6">
      {/* Headline: insight before data */}
      <section className="border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Label>{cls === 'all' ? 'All failure classes' : CLASS_LABEL[cls]} · 8-week horizon · p ≥ {Math.round(thr * 100)}%</Label>
              <Fresh f="D-1" asOf={D.meta.as_of} />
            </div>
            <div className="tnum mt-1.5 text-[22px] font-semibold leading-8 tracking-tight">
              <span className="text-ioh-yellow">{sum.n}</span> sites predicted to {verb} inside 8 weeks
              <span className="mx-2 text-faint">·</span>
              <span className="text-[#B79CFF]">{sum.covered}</span> already covered
              <span className="mx-2 text-faint">·</span>
              <span className={sum.not ? 'text-bad' : 'text-ok'}>{sum.not}</span> not
            </div>
            <div className="mt-1 text-sm text-muted">
              {uncoveredClusters.length > 0 ? (
                <>
                  Largest uncovered cluster: <b className="text-ink">{uncoveredClusters[0].length} {CLASS_LABEL[uncoveredClusters[0][0].cls].toLowerCase()} sites</b> in {uncoveredClusters[0][0].district}
                  {uncoveredClusters[0][0].incident && (
                    <>
                      {' '}
                      (<Id onClick={() => nav(`/incidents?incident=${uncoveredClusters[0][0].incident!.incident_id}`)}>{uncoveredClusters[0][0].incident.incident_id}</Id>)
                    </>
                  )}
                  , crossing W+{Math.min(...uncoveredClusters[0].map((r) => r.cw))}, exposure {idr(uncoveredClusters[0].reduce((s, r) => s + r.exposure, 0))}/month.
                </>
              ) : (
                <>Every predicted site in this view is inside an active program.</>
              )}
              {gaps.length > 0 && (
                <>
                  {' '}
                  <span className="text-warn">{gaps.length} covered sites have a program RFS after the predicted failure.</span>
                </>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {role.role_code === 'PLAN' && bekasiOpen && (
              <Button variant="primary" onClick={planBekasi}>
                <Wand2 size={14} /> Plan the 14 uncovered Bekasi sites
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-6 divide-x divide-line border-t border-line">
          <Stat label="Predicted · 8 wks" value={num(sum.n)} sub={`${Math.round(thr * 100)}% probability threshold`} />
          <Stat label="Covered by program" value={num(sum.covered)} sub={`${sum.n ? Math.round((sum.covered / sum.n) * 100) : 0}% of predicted`} tone="prog" />
          <Stat label="Not covered" value={num(sum.not)} sub="Need a decision" tone={sum.not ? 'bad' : 'ok'} onClick={() => setCov('not')} />
          <Stat label="Exposure not covered" value={idr(sum.exposureNot)} sub="Revenue at risk / month" tone="yellow" />
          <Stat label="Needs a bridge" value={num(sum.bridge)} sub="Lead time > window" tone={sum.bridge ? 'warn' : undefined} />
          <Stat label="RFS after failure" value={num(sum.late)} sub="Program too late" tone={sum.late ? 'bad' : undefined} />
        </div>
      </section>

      {/* Class chips */}
      <div className="flex flex-wrap items-stretch gap-2">
        <Chip active={cls === 'all'} onClick={() => setCls('all')} label="All classes" n={CLASSES.reduce((s, c) => s + byClass[c].n, 0)} covered={CLASSES.reduce((s, c) => s + byClass[c].covered, 0)} />
        {CLASS_CHIP_ORDER.map((c) => (
          <Chip key={c} active={cls === c} onClick={() => setCls(cls === c ? 'all' : c)} label={CLASS_LABEL[c]} n={byClass[c].n} covered={byClass[c].covered} />
        ))}
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Week x class matrix */}
        <Panel
          className="col-span-12 2xl:col-span-8"
          title="Predicted crossings by week and failure class"
          right={
            <>
              <span className="text-xs text-faint">Click a cell to filter the list</span>
              <Fresh f="D-1" asOf={D.meta.as_of} />
            </>
          }
          pad={false}
        >
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <th className="h-12 w-[150px] border-b border-line px-4 text-left text-2xs font-semibold uppercase tracking-wider text-faint">Failure class</th>
                {D.weekEndDates.map((d, k) => (
                  <th key={d} onClick={() => setWeek(week === k + 1 ? null : k + 1)} className={clsx('h-12 cursor-pointer border-b border-l border-line text-center hover:bg-panel2', week === k + 1 && 'bg-ioh-yellow/10')}>
                    <div className={clsx('text-xs font-semibold', week === k + 1 ? 'text-ioh-yellow' : 'text-ink')}>W+{k + 1}</div>
                    <div className="tnum text-[10.5px] font-normal text-faint">to {dateShort(d)}</div>
                  </th>
                ))}
                <th className="h-12 w-[72px] border-b border-l border-line text-center text-2xs font-semibold uppercase tracking-wider text-faint">Total</th>
              </tr>
            </thead>
            <tbody>
              {CLASSES.map((c) => {
                const tot = matrix[c].reduce((s, x) => s + x, 0)
                return (
                  <tr key={c}>
                    <td onClick={() => setCls(cls === c ? 'all' : c)} className={clsx('h-10 cursor-pointer border-b border-line/70 px-4 text-sm font-medium hover:text-ioh-yellow', cls === c ? 'text-ioh-yellow' : 'text-ink')}>
                      {CLASS_LABEL[c]}
                    </td>
                    {matrix[c].map((n, k) => {
                      const on = (cls === c || cls === 'all') && (week === null || week === k + 1)
                      const exact = cls === c && week === k + 1
                      return (
                        <td
                          key={k}
                          onClick={() => {
                            if (exact) {
                              setCls('all')
                              setWeek(null)
                            } else {
                              setCls(c)
                              setWeek(k + 1)
                            }
                          }}
                          className={clsx('tnum h-10 cursor-pointer border-b border-l border-line/70 text-center text-sm hover:outline hover:outline-1 hover:-outline-offset-1 hover:outline-muted', exact && 'outline outline-2 -outline-offset-2 outline-ioh-yellow')}
                          style={{ background: n ? `rgba(255,59,59,${0.1 + 0.55 * (n / maxCell)})` : undefined, opacity: on ? 1 : 0.35 }}
                        >
                          {n ? <span className="font-semibold text-ink">{n}</span> : <span className="text-faint">·</span>}
                        </td>
                      )
                    })}
                    <td className="tnum h-10 border-b border-l border-line/70 text-center text-sm font-semibold">{tot}</td>
                  </tr>
                )
              })}
              <tr>
                <td className="h-9 px-4 text-2xs font-semibold uppercase tracking-wider text-faint">All classes</td>
                {D.weekEndDates.map((_, k) => (
                  <td key={k} className="tnum h-9 border-l border-line/70 text-center text-xs text-muted">
                    {CLASSES.reduce((s, c) => s + matrix[c][k], 0) || '·'}
                  </td>
                ))}
                <td className="tnum h-9 border-l border-line/70 text-center text-sm font-semibold text-ioh-yellow">{base.length}</td>
              </tr>
            </tbody>
          </table>
        </Panel>

        {/* Uncovered clusters */}
        <Panel className="col-span-12 2xl:col-span-4" title="Uncovered clusters · largest first" right={<Fresh f="live" />} pad={false}>
          {uncoveredClusters.length === 0 ? (
            <Empty>No uncovered predicted sites in this view.</Empty>
          ) : (
            <div className="max-h-[284px] divide-y divide-line/70 overflow-y-auto">
              {uncoveredClusters.slice(0, 12).map((cl) => {
                const r0 = cl[0]
                const exp = cl.reduce((s, r) => s + r.exposure, 0)
                const allSel = cl.every((r) => selSet.has(r.site_id))
                return (
                  <div key={r0.incident?.incident_id ?? r0.site_id} className="flex items-center gap-3 px-4 py-2">
                    <div className="tnum w-8 text-right text-lg font-semibold text-bad">{cl.length}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {CLASS_LABEL[r0.cls]} · {r0.district}
                        <span className="text-faint"> · {r0.region}</span>
                      </div>
                      <div className="tnum flex items-center gap-2 text-xs text-muted">
                        {r0.incident && <Id onClick={() => nav(`/incidents?incident=${r0.incident!.incident_id}`)}>{r0.incident.incident_id}</Id>}
                        <span>W+{Math.min(...cl.map((r) => r.cw))}</span>
                        <span>{idr(exp)}/mo</span>
                      </div>
                    </div>
                    <Button size="sm" variant={allSel ? 'ok' : 'default'} onClick={() => selectCluster(cl.map((r) => r.site_id))}>
                      {allSel ? <Check size={12} /> : null}
                      {allSel ? 'Selected' : 'Select'}
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Site list */}
      <Panel
        pad={false}
        title={
          <span className="flex items-center gap-2">
            Predicted sites
            <span className="tnum font-normal text-muted">
              {list.length} of {rows.length}
            </span>
            {(cls !== 'all' || week !== null) && (
              <button
                onClick={() => {
                  setCls('all')
                  setWeek(null)
                }}
                className="flex items-center gap-1 border border-ioh-yellow/50 bg-ioh-yellow/10 px-1.5 text-2xs font-semibold text-ioh-yellow"
              >
                {cls !== 'all' ? CLASS_LABEL[cls] : 'All classes'}
                {week !== null && ` · W+${week}`}
                <X size={11} />
              </button>
            )}
          </span>
        }
        right={
          <>
            {selected.length > 0 && (
              <button onClick={() => setSelected([])} className="text-xs text-muted hover:text-ink">
                Clear selection
              </button>
            )}
            {selClasses.size > 1 && <span className="text-xs text-warn">Mixed classes: plan uses the majority class</span>}
            <Button variant="primary" size="sm" disabled={!selected.length} onClick={build}>
              Build plan for {selected.length} site{selected.length === 1 ? '' : 's'} <ArrowRight size={13} />
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
          <select value={cls} onChange={(e) => setCls(e.target.value as FailureClass | 'all')} className="h-7 border border-line2 bg-panel2 px-2 text-xs">
            <option value="all">All classes</option>
            {CLASS_CHIP_ORDER.map((c) => (
              <option key={c} value={c}>
                {CLASS_LABEL[c]}
              </option>
            ))}
          </select>
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="h-7 border border-line2 bg-panel2 px-2 text-xs">
            <option value="all">All regions</option>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <Seg<Cov>
            value={cov}
            onChange={setCov}
            options={[
              { id: 'all', label: 'All' },
              { id: 'covered', label: 'Covered' },
              { id: 'not', label: 'Not covered' },
            ]}
          />
          <div className="relative">
            <Search size={13} className="absolute left-2 top-2 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Site, name, district, incident" className="h-7 w-60 border border-line2 bg-panel2 pl-7 pr-2 text-xs" />
          </div>
          <div className="ml-auto flex items-center gap-3 text-xs text-faint">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 bg-ok" /> fits window
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 bg-warn" /> needs bridge
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 bg-bad" /> RFS after failure
            </span>
          </div>
        </div>
        {list.length === 0 ? (
          <Empty>No predicted sites match these filters.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th className="w-9 pr-0">
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="accent-[#FFD100]" />
                  </Th>
                  <Th>Site</Th>
                  <Th>Class</Th>
                  <Th>Crossing</Th>
                  <Th className="text-right">Prob. at cross / W+8</Th>
                  <Th className="text-right">Exposure / mo</Th>
                  <Th>Recommended intervention</Th>
                  <Th className="text-right">Lead</Th>
                  <Th>Fits window?</Th>
                  <Th>Program coverage</Th>
                  <Th>Incident</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => (
                  <SiteRow key={r.site_id} r={r} checked={selSet.has(r.site_id)} onToggle={() => toggle(r.site_id)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  )
}

function SiteRow({ r, checked, onToggle }: { r: FRow; checked: boolean; onToggle: () => void }) {
  const nav = useNavigate()
  return (
    <tr className={clsx('hover:bg-panel2', checked && 'bg-ioh-yellow/[0.06]')}>
      <Td className="w-9 pr-0">
        <input type="checkbox" checked={checked} onChange={onToggle} className="accent-[#FFD100]" />
      </Td>
      <Td className="h-11 max-w-[240px]">
        <div className="flex items-center gap-2">
          <Id onClick={() => nav(`/site/${r.site_id}`)} className="text-ink">
            {r.site_id}
          </Id>
          <span className="truncate">{r.name}</span>
        </div>
        <div className="truncate text-xs text-faint">
          {r.district} · {r.region}
        </div>
      </Td>
      <Td className="text-muted">{CLASS_LABEL[r.cls]}</Td>
      <Td>
        <span className="font-semibold">W+{r.cw}</span>
        <span className="tnum ml-1.5 text-xs text-faint">{dateShort(r.failDate)}</span>
      </Td>
      <Td className="tnum text-right">
        <span className="font-semibold">{Math.round(r.pAt * 100)}%</span>
        <span className="text-faint"> / </span>
        <span className="text-muted">{Math.round(r.p8 * 100)}%</span>
      </Td>
      <Td className="tnum text-right" title={r.exposureFromIncident ? 'Share of incident exposure' : 'Revenue × at-risk share (0.3)'}>
        {idr(r.exposure)}
      </Td>
      <Td className="max-w-[230px] truncate" title={r.recName}>
        {r.recName}
      </Td>
      <Td className="tnum text-right text-muted">{r.lead} d</Td>
      <Td>
        {r.fits ? (
          <span className="flex items-center gap-1.5 text-xs text-ok">
            <Check size={12} /> Fits {r.cw * 7} d
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-warn" title={`Lead ${r.lead} d > window ${r.cw * 7} d`}>
            <AlertTriangle size={12} /> Needs bridge
          </span>
        )}
      </Td>
      <Td>
        {r.program ? (
          <div className="flex items-center gap-1.5">
            <Id onClick={() => nav(`/programs/${r.program!.program_id}`)} className={r.rfsLate ? 'text-bad' : r.program.created_in_session ? 'text-ioh-yellow' : 'text-[#B79CFF]'}>
              {r.program.program_id}
            </Id>
            <span className={clsx('tnum text-xs', r.rfsLate ? 'text-bad' : 'text-muted')}>RFS {dateShort(r.program.forecast_rfs)}</span>
            {r.rfsLate && <Badge tone="bad">After failure</Badge>}
            {r.bridged && (
              <span title="Plan includes a zero-CapEx refarm bridge, live in 7 days, holding the site until RFS">
                <Badge tone="warn">Bridged</Badge>
              </span>
            )}
          </div>
        ) : (
          <Badge tone="bad">Not covered</Badge>
        )}
      </Td>
      <Td>
        {r.incident ? (
          <Id onClick={() => nav(`/incidents?incident=${r.incident!.incident_id}`)} className="hover:underline">
            {r.incident.incident_id}
          </Id>
        ) : (
          <span className="text-faint">—</span>
        )}
      </Td>
    </tr>
  )
}

function Stat({ label, value, sub, tone, onClick }: { label: string; value: string; sub?: string; tone?: 'bad' | 'ok' | 'warn' | 'yellow' | 'prog'; onClick?: () => void }) {
  const tc = tone === 'bad' ? 'text-bad' : tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'yellow' ? 'text-ioh-yellow' : tone === 'prog' ? 'text-[#B79CFF]' : 'text-ink'
  return (
    <div onClick={onClick} className={clsx('min-w-0 px-5 py-2.5', onClick && 'cursor-pointer hover:bg-panel2')}>
      <div className="truncate text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={clsx('tnum truncate text-lg font-semibold leading-7', tc)}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  )
}

function Chip({ label, n, covered, active, onClick }: { label: string; n: number; covered: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={clsx('flex min-w-[150px] flex-col gap-1.5 border px-3 py-2 text-left', active ? 'border-ioh-yellow bg-ioh-yellow/10' : 'border-line bg-panel hover:border-line2')}>
      <div className="flex w-full items-baseline justify-between gap-3">
        <span className={clsx('text-xs font-semibold', active ? 'text-ioh-yellow' : 'text-muted')}>{label}</span>
        <span className="tnum text-lg font-semibold leading-6">{n}</span>
      </div>
      <div className={clsx("flex h-1 w-full", n ? "bg-bad/70" : "bg-line")}>
        <div className="h-full bg-prog" style={{ width: `${n ? (covered / n) * 100 : 0}%` }} />
      </div>
      <div className="tnum text-[10.5px] text-faint">
        {covered} covered · <span className={n - covered ? 'text-bad' : ''}>{n - covered} not</span>
      </div>
    </button>
  )
}
