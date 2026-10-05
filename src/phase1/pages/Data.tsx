import clsx from 'clsx'
import { ChevronDown, ChevronRight, Clock, GitMerge, Lock, MapPin, Search } from 'lucide-react'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Id, Seg } from '@/components/ui'
import type { FailureClass } from '@/data/types'
import { AGENTS } from '../content/agents'
import { CLASS_GATES, NFRS, PHASE1, WORKSTREAMS } from '../content/golive'
import { SOURCES, type Criticality, type DataSource, type NetraStatus } from '../content/sources'
import { CLASSES, CLASS_META, useP1 } from '../model'
import { FeatureCatalog } from './howitworks/FeatureCatalog'
import {
  CRIT_RANK,
  CritTag,
  ClassDots,
  GAP_PLAN,
  PageHead,
  STATUS_COLOR,
  STATUS_LABEL,
  Section,
  Stat,
  StatusDot,
  StatusTag,
  agentSourceMap,
  readinessPct,
  shortName,
  shortSource,
  sourcesForClass,
} from './howitworks/shared'

const GATE_LABEL = { drives_approvals: 'Drives approvals', advisory: 'Advisory', shadow: 'Shadow mode' } as const
const GATE_TONE = { drives_approvals: 'text-ok border-ok/40 bg-ok/10', advisory: 'text-warn border-warn/40 bg-warn/10', shadow: 'text-muted border-line2' } as const
const STATUS_RANK: Record<NetraStatus, number> = { not_on_netra: 0, partial: 1, on_netra: 2 }
const DOMAINS = [...new Set(SOURCES.map((s) => s.domain))]
const isGap = (s: DataSource) => s.status !== 'on_netra'

export function DataPage() {
  const p1 = useP1()
  const loc = useLocation()
  const [params] = useSearchParams()
  const focusSource = params.get('source')
  const focusClass = (params.get('class') as FailureClass | null) ?? 'capacity'

  useEffect(() => {
    if (!loc.hash) return
    const t = setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ block: 'start' }), 60)
    return () => clearTimeout(t)
  }, [loc.hash, focusSource])

  const by = (st: NetraStatus) => SOURCES.filter((s) => s.status === st).length
  const blocking = SOURCES.filter((s) => s.criticality === 'blocking' && isGap(s))
  const overall = readinessPct(SOURCES)
  const sharedBlockers = blocking.filter((s) => s.classes.includes('all'))

  // agent usage of each source (direct, plus via features for the Site Failure Prediction Agent)
  const usage = useMemo(() => {
    const m = new Map<string, { id: string; how: 'direct' | 'via' }[]>(SOURCES.map((s) => [s.id, []]))
    for (const a of AGENTS) for (const [sid, how] of agentSourceMap(a, p1)) m.get(sid)?.push({ id: a.id, how })
    return m
  }, [p1])

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        <PageHead
          kicker={`${PHASE1.name} · How it works · Data needed`}
          title={`The Planner needs ${SOURCES.length} data sources. ${by('on_netra')} are on Netra today, ${by('partial')} in part and ${by('not_on_netra')} still to onboard; ${blocking.length} blocking gaps close in the first 8 weeks.`}
          right={
            <div className="border border-line bg-panel px-4 py-2.5 text-right">
              <div className="text-2xs uppercase tracking-wider text-faint">Data readiness today</div>
              <div className="tnum text-2xl font-semibold text-warn">{Math.round(overall)}%</div>
              <div className="text-[10.5px] text-faint">weighted by criticality</div>
            </div>
          }
        >
          Prediction runs on network data Netra already holds (performance counters, alarms, tickets, Smart CapEx). The gaps are power telemetry from managed-service partners, transport topology, weather and hazard feeds, site-master quality, and the supply-chain reads (ERP, warehouse) that turn a prediction into a costed plan. Statuses are DevX’s working assumption; the Netra team confirms each row in the validation session.
        </PageHead>

        {/* summary strip */}
        <div className="mt-5 border border-line bg-panel">
          <div className="grid grid-cols-6 divide-x divide-line">
            <Stat label="Sources" value={SOURCES.length} sub={`${DOMAINS.length} domains`} />
            <Stat label="On Netra" value={<span className="text-ok">{by('on_netra')}</span>} sub="ready to use" />
            <Stat label="Partial" value={<span className="text-warn">{by('partial')}</span>} sub="extend or fix quality" />
            <Stat label="Not on Netra" value={<span className="text-bad">{by('not_on_netra')}</span>} sub="onboard in WS1 / WS5" />
            <Stat label="Blocking gaps" value={blocking.length} sub={blocking.map((s) => shortSource(s).split(' ')[0]).join(', ')} />
            <Stat label="Weighted readiness" value={`${overall.toFixed(0)}%`} tone="warn" sub="blocking ×3 · important ×2 · enhancing ×1" />
          </div>
          <div className="flex h-2">
            {(['on_netra', 'partial', 'not_on_netra'] as NetraStatus[]).map((st) => (
              <div key={st} style={{ width: `${(by(st) / SOURCES.length) * 100}%`, background: STATUS_COLOR[st] }} />
            ))}
          </div>
        </div>

        {/* readiness per class */}
        <Section
          className="mt-5"
          title="Readiness per failure class"
          sub="Which class is held back by which source. A class counts every source tagged to it plus the sources every class needs."
          right={<span className="text-[11px] text-faint">readiness = Σ weight × status ÷ Σ weight · on Netra 1, partial 0.5, not on Netra 0</span>}
        >
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[170px]" />
              <col className="w-[190px]" />
              <col className="w-[130px]" />
              <col />
              <col className="w-[140px]" />
              <col className="w-[300px]" />
            </colgroup>
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                <th className="px-4 py-2 font-semibold">Class</th>
                <th className="px-3 py-2 font-semibold">Data readiness</th>
                <th className="px-3 py-2 font-semibold">Sources</th>
                <th className="px-3 py-2 font-semibold">Held back by (class-specific)</th>
                <th className="px-3 py-2 font-semibold">At go-live</th>
                <th className="px-4 py-2 font-semibold">What clears it</th>
              </tr>
            </thead>
            <tbody>
              {CLASSES.map((c) => {
                const list = sourcesForClass(c)
                const pct = readinessPct(list)
                const own = list.filter((s) => !s.classes.includes('all') && isGap(s)).sort((a, b) => CRIT_RANK[a.criticality] - CRIT_RANK[b.criticality] || STATUS_RANK[a.status] - STATUS_RANK[b.status])
                const g = CLASS_GATES.find((x) => x.cls === c)!
                return (
                  <tr key={c} className="border-t border-line/70 align-top">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2 font-semibold">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: CLASS_META[c].color }} />
                        {CLASS_META[c].label}
                      </div>
                      <div className="pl-[18px] text-[11px] text-faint">Wave {CLASS_META[c].wave}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 bg-line">
                          <div className="h-full" style={{ width: `${pct}%`, background: pct >= 65 ? '#2ECC71' : pct >= 50 ? '#F5A623' : '#FF3B3B' }} />
                        </div>
                        <span className="tnum w-10 text-right font-semibold">{Math.round(pct)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex h-2 w-full">
                        {(['on_netra', 'partial', 'not_on_netra'] as NetraStatus[]).map((st) => (
                          <div key={st} style={{ width: `${(list.filter((s) => s.status === st).length / list.length) * 100}%`, background: STATUS_COLOR[st] }} />
                        ))}
                      </div>
                      <div className="tnum mt-1 text-[11px] text-faint">
                        {list.length} · {list.filter((s) => s.status === 'on_netra').length} / {list.filter((s) => s.status === 'partial').length} / {list.filter((s) => s.status === 'not_on_netra').length}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-wrap gap-x-3 gap-y-1">
                        {own.map((s) => (
                          <a key={s.id} href={`#src-${s.id}`} className="inline-flex items-center gap-1.5 text-xs hover:text-ioh-yellow" title={s.gap}>
                            <StatusDot s={s.status} />
                            <span className={s.criticality === 'blocking' ? 'font-semibold text-ink' : 'text-muted'}>{shortSource(s)}</span>
                            {s.criticality === 'blocking' && <span className="text-[10px] uppercase tracking-wide text-faint">blocking</span>}
                          </a>
                        ))}
                        {!own.length && <span className="text-xs text-faint">No class-specific gaps</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={clsx('inline-flex h-5 items-center border px-1.5 text-2xs font-semibold uppercase tracking-wide', GATE_TONE[g.gateAtGoLive])}>{GATE_LABEL[g.gateAtGoLive]}</span>
                      <div className="mt-1 text-[11px] text-faint">{g.today}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{g.toClear}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
            <span className="font-semibold text-ink">Shared by every class:</span>{' '}
            {sharedBlockers.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ', '}
                <span className="inline-flex items-center gap-1">
                  <StatusDot s={s.status} /> {s.name}
                </span>
              </span>
            ))}
            . Site master quality affects every prediction; ERP and warehouse reads are needed to cost and stock a plan, not to predict. RAN hardware scores highest on data presence but stays advisory: its gap is quality (unit install dates), not availability.
          </div>
        </Section>

        <SourceCatalog usage={usage} focus={focusSource} />
        <AgentSourceMatrix p1={p1} />

        <Section id="features" className="mt-5" title="Feature catalog · 40 features, 8 per class" sub="What the Feature Builder computes nightly for 60k sites, and where each feature comes from">
          <FeatureCatalog key={focusClass} p1={p1} initial={focusClass} />
        </Section>

        <GapList />
        <Governance />
      </div>
    </div>
  )
}

// ---- Source catalog -------------------------------------------------------------------------------
function SourceCatalog({ usage, focus }: { usage: Map<string, { id: string; how: 'direct' | 'via' }[]>; focus: string | null }) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(focus ? [focus] : []))
  const [status, setStatus] = useState<NetraStatus | 'all'>('all')
  const [crit, setCrit] = useState<Criticality | 'all'>('all')
  const [domain, setDomain] = useState<string>('all')
  const [q, setQ] = useState('')
  useEffect(() => {
    if (focus) setOpen((o) => new Set([...o, focus]))
  }, [focus])

  const rows = SOURCES.filter(
    (s) =>
      (status === 'all' || s.status === status) &&
      (crit === 'all' || s.criticality === crit) &&
      (domain === 'all' || s.domain === domain) &&
      (!q || `${s.name} ${s.systems} ${s.owner} ${s.id}`.toLowerCase().includes(q.toLowerCase())),
  ).sort((a, b) => CRIT_RANK[a.criticality] - CRIT_RANK[b.criticality] || STATUS_RANK[a.status] - STATUS_RANK[b.status])

  const toggle = (id: string) =>
    setOpen((o) => {
      const n = new Set(o)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <Section
      id="catalog"
      className="mt-5"
      title="Source catalog"
      sub="Click a row for the field-level schema, integration method, quality notes and the go-live gap"
      right={
        <>
          <label className="flex h-7 items-center gap-1.5 border border-line2 px-2">
            <Search size={12} className="text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className="w-28 bg-transparent text-xs" />
          </label>
          <select value={domain} onChange={(e) => setDomain(e.target.value)} className="h-7 border border-line2 bg-panel2 px-2 text-xs">
            <option value="all">All domains</option>
            {DOMAINS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
          <Seg options={[{ id: 'all' as const, label: 'All' }, { id: 'on_netra' as const, label: 'On Netra' }, { id: 'partial' as const, label: 'Partial' }, { id: 'not_on_netra' as const, label: 'Not on Netra' }]} value={status} onChange={setStatus} />
          <Seg options={[{ id: 'all' as const, label: 'All' }, { id: 'blocking' as const, label: 'Blocking' }, { id: 'important' as const, label: 'Important' }, { id: 'enhancing' as const, label: 'Enhancing' }]} value={crit} onChange={setCrit} />
        </>
      }
    >
      <table className="w-full table-fixed text-sm">
        <colgroup>
          <col className="w-[28px]" />
          <col className="w-[230px]" />
          <col className="w-[250px]" />
          <col className="w-[150px]" />
          <col />
          <col className="w-[118px]" />
          <col className="w-[104px]" />
          <col className="w-[96px]" />
          <col className="w-[44px]" />
        </colgroup>
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wider text-faint">
            <th />
            <th className="px-2 py-2 font-semibold">Source</th>
            <th className="px-3 py-2 font-semibold">Owner · systems</th>
            <th className="px-3 py-2 font-semibold">Refresh · latency</th>
            <th className="px-3 py-2 font-semibold">History needed / available</th>
            <th className="px-3 py-2 font-semibold">Netra</th>
            <th className="px-3 py-2 font-semibold">Criticality</th>
            <th className="px-3 py-2 font-semibold">Quality</th>
            <th className="px-2 py-2 font-semibold">PII</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const on = open.has(s.id)
            const used = usage.get(s.id) ?? []
            return (
              <Fragment key={s.id}>
                <tr id={`src-${s.id}`} onClick={() => toggle(s.id)} className={clsx('scroll-mt-16 cursor-pointer border-t border-line/70 align-top hover:bg-panel2', on && 'bg-panel2', focusRow(s.id, focus))}>
                  <td className="py-2.5 pl-3 text-faint">{on ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                  <td className="px-2 py-2">
                    <div className="font-semibold leading-5">{s.name}</div>
                    <div className="flex items-center gap-2">
                      <Id className="text-[11px]">{s.id}</Id>
                      <span className="text-[11px] text-faint">{s.domain}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="text-muted">{s.owner}</div>
                    <div className="text-faint">{s.systems}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div>{s.refresh}</div>
                    <div className="font-mono text-[11px] text-faint">{s.latency}</div>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <div className="text-ink">{s.historyNeeded}</div>
                    <div className={clsx(isGap(s) ? 'text-warn/90' : 'text-faint')}>{s.historyAvailable}</div>
                  </td>
                  <td className="px-3 py-2">
                    <StatusTag s={s.status} />
                  </td>
                  <td className="px-3 py-2">
                    <CritTag c={s.criticality} />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1.5">
                      <div className="h-1.5 flex-1 bg-line">
                        <div className="h-full" style={{ width: `${s.quality}%`, background: s.quality >= 80 ? '#2ECC71' : s.quality >= 65 ? '#F5A623' : '#FF3B3B' }} />
                      </div>
                      <span className="tnum w-6 text-right text-xs">{s.quality}</span>
                    </div>
                  </td>
                  <td className="px-2 py-2">{s.pii ? <Lock size={13} className="text-warn" aria-label="Contains personal data" /> : <span className="text-faint">–</span>}</td>
                </tr>
                {on && (
                  <tr className="bg-panel2/60">
                    <td />
                    <td colSpan={8} className="px-2 pb-4 pt-1">
                      <div className="grid grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-5">
                        <div className="border border-line bg-panel">
                          <div className="border-b border-line px-3 py-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">Field-level schema · {s.fields.length} fields</div>
                          <table className="w-full text-xs">
                            <tbody>
                              {s.fields.map((f) => (
                                <tr key={f.name} className="border-t border-line/60 first:border-t-0 align-top">
                                  <td className="w-[38%] px-3 py-1.5 font-mono text-[11.5px] text-ink">{f.name}</td>
                                  <td className="w-[20%] px-2 py-1.5 font-mono text-[11px] text-muted">{f.type}</td>
                                  <td className="px-3 py-1.5 text-muted">{f.description}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="space-y-2.5 text-xs">
                          <Detail k="Grain">{s.grain}</Detail>
                          <Detail k="Volume">{s.volume}</Detail>
                          <Detail k="Integration">{s.integration}</Detail>
                          <Detail k="Quality notes">{s.qualityNotes}</Detail>
                          {s.gap && (
                            <Detail k="Go-live gap">
                              <span className={isGap(s) ? 'text-warn' : 'text-muted'}>{s.gap}</span>
                              {GAP_PLAN[s.id] && (
                                <span className="mt-0.5 block text-faint">
                                  {GAP_PLAN[s.id].ws} · target week {GAP_PLAN[s.id].week}: {GAP_PLAN[s.id].deliverable}
                                </span>
                              )}
                            </Detail>
                          )}
                          <Detail k="Failure classes">
                            <ClassDots classes={s.classes} labels />
                          </Detail>
                          <Detail k="Used by">
                            <span className="flex flex-wrap gap-1">
                              {used.map((u) => (
                                <Link key={u.id} to={`/phase1/agents/${u.id}`} className="border border-line2 px-1.5 py-0.5 text-[11px] text-muted hover:text-ink">
                                  {shortName(AGENTS.find((a) => a.id === u.id)!)}
                                  {u.how === 'via' && <span className="text-faint"> · via features</span>}
                                </Link>
                              ))}
                              {!used.length && <span className="text-faint">Not referenced by an agent input yet</span>}
                            </span>
                          </Detail>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
      {!rows.length && <div className="px-4 py-8 text-center text-sm text-faint">No sources match the filters.</div>}
    </Section>
  )
}

function focusRow(id: string, focus: string | null) {
  return id === focus ? 'outline outline-1 -outline-offset-1 outline-ioh-yellow/60' : ''
}

function Detail({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
      <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className="text-muted">{children}</div>
    </div>
  )
}

// ---- Agent x source matrix --------------------------------------------------------------------------
function AgentSourceMatrix({ p1 }: { p1: ReturnType<typeof useP1> }) {
  const [hoverCol, setHoverCol] = useState<string | null>(null)
  const [hoverRow, setHoverRow] = useState<string | null>(null)
  const cols = DOMAINS.flatMap((d) => SOURCES.filter((s) => s.domain === d))
  const maps = useMemo(() => new Map(AGENTS.map((a) => [a.id, agentSourceMap(a, p1)])), [p1])
  const rows = AGENTS.filter((a) => (maps.get(a.id)?.size ?? 0) > 0)
  const noData = AGENTS.filter((a) => (maps.get(a.id)?.size ?? 0) === 0)

  return (
    <Section
      id="matrix"
      className="mt-5"
      title="Which agent reads which source"
      sub={`${rows.length} agents read data directly; the other ${noData.length} work only on other agents’ outputs or people’s input`}
      right={
        <div className="flex items-center gap-4 text-[11px] text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 bg-ok" /> direct input
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 border-2 border-ok" /> via features
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-ok" />
            <span className="h-2 w-2 rounded-full bg-warn" />
            <span className="h-2 w-2 rounded-full bg-bad" /> on / partial / not on Netra
          </span>
        </div>
      }
    >
      <div className="overflow-x-auto px-4 py-3">
        <table className="border-collapse text-sm" onMouseLeave={() => (setHoverCol(null), setHoverRow(null))}>
          <thead>
            <tr>
              <th />
              {DOMAINS.map((d) => {
                const n = SOURCES.filter((s) => s.domain === d).length
                return (
                  <th key={d} colSpan={n} className="border-x border-line px-1 pb-1 text-center text-[10.5px] font-semibold uppercase leading-3 tracking-wide text-faint">
                    {n > 1 ? d : d.split(' ')[0]}
                  </th>
                )
              })}
              <th />
            </tr>
            <tr>
              <th className="w-[230px]" />
              {cols.map((s) => (
                <th key={s.id} className={clsx('h-[150px] w-[34px] min-w-[34px] align-bottom', hoverCol === s.id && 'bg-panel2')} title={`${s.name} · ${STATUS_LABEL[s.status]}`}>
                  <div className="mx-auto flex h-full items-end justify-center pb-1">
                    <span className="whitespace-nowrap text-[11px] font-medium text-muted [transform:rotate(180deg)] [writing-mode:vertical-rl]">{shortSource(s)}</span>
                  </div>
                  <div className="flex justify-center pb-1">
                    <StatusDot s={s.status} />
                  </div>
                </th>
              ))}
              <th className="w-[96px] pl-3 text-left align-bottom text-2xs font-semibold uppercase tracking-wider text-faint">Sources · gaps</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const m = maps.get(a.id)!
              const gaps = [...m.keys()].filter((id) => SOURCES.find((s) => s.id === id)!.status !== 'on_netra').length
              return (
                <tr key={a.id} className={clsx('border-t border-line/60', hoverRow === a.id && 'bg-panel2')}>
                  <td className="whitespace-nowrap py-1 pr-3">
                    <Link to={`/phase1/agents/${a.id}`} className="text-[12.5px] hover:text-ioh-yellow">
                      {shortName(a)}
                    </Link>
                    <span className="ml-2 text-[10.5px] text-faint">{a.stage}</span>
                  </td>
                  {cols.map((s) => {
                    const how = m.get(s.id)
                    const col = STATUS_COLOR[s.status]
                    return (
                      <td
                        key={s.id}
                        onMouseEnter={() => (setHoverCol(s.id), setHoverRow(a.id))}
                        className={clsx('h-7 border-x border-line/40 text-center', hoverCol === s.id && 'bg-panel2')}
                        title={how ? `${a.name} ← ${s.name} (${how === 'via' ? 'via features' : 'direct'}) · ${STATUS_LABEL[s.status]}` : undefined}
                      >
                        {how === 'direct' && <span className="mx-auto block h-3.5 w-3.5" style={{ background: col }} />}
                        {how === 'via' && <span className="mx-auto block h-3.5 w-3.5 border-2" style={{ borderColor: col }} />}
                        {!how && <span className="mx-auto block h-[3px] w-[3px] rounded-full bg-line2" />}
                      </td>
                    )
                  })}
                  <td className="tnum whitespace-nowrap pl-3 text-xs">
                    <span className="font-semibold">{m.size}</span>
                    <span className="text-faint"> · </span>
                    <span className={gaps ? 'text-warn' : 'text-faint'}>{gaps}</span>
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-line">
              <td className="py-1.5 pr-3 text-2xs font-semibold uppercase tracking-wider text-faint">Agents reading it</td>
              {cols.map((s) => {
                const n = rows.filter((a) => maps.get(a.id)!.has(s.id)).length
                return (
                  <td key={s.id} className={clsx('tnum text-center text-xs', n ? 'text-muted' : 'text-faint')}>
                    {n}
                  </td>
                )
              })}
              <td />
            </tr>
          </tbody>
        </table>
        <div className="mt-2 text-[11px] text-faint">
          Agents without a direct data feed: {noData.map((a) => shortName(a)).join(', ')}. Open squares for the Site Failure Prediction Agent are the sources its 40 features come from (through the Feature Builder).
        </div>
      </div>
    </Section>
  )
}

// ---- Gap list → actions -------------------------------------------------------------------------------
function GapList() {
  const ws = new Map(WORKSTREAMS.map((w) => [w.id, w]))
  const sorter = (a: DataSource, b: DataSource) => CRIT_RANK[a.criticality] - CRIT_RANK[b.criticality] || STATUS_RANK[a.status] - STATUS_RANK[b.status] || (GAP_PLAN[a.id]?.week ?? 99) - (GAP_PLAN[b.id]?.week ?? 99)
  const primary = SOURCES.filter((s) => isGap(s) && s.criticality !== 'enhancing').sort(sorter)
  const onNetraWork = SOURCES.filter((s) => !isGap(s) && s.gap && s.criticality !== 'enhancing').sort(sorter)
  const enhancing = SOURCES.filter((s) => isGap(s) && s.criticality === 'enhancing')

  const Row = ({ s }: { s: DataSource }) => {
    const plan = GAP_PLAN[s.id]
    const w = plan ? ws.get(plan.ws) : undefined
    return (
      <tr className="border-t border-line/70 align-top">
        <td className="px-4 py-2.5">
          <a href={`#src-${s.id}`} className="font-semibold hover:text-ioh-yellow">
            {s.name}
          </a>
          <div className="mt-0.5 flex items-center gap-2">
            <StatusTag s={s.status} />
            <CritTag c={s.criticality} />
          </div>
        </td>
        <td className="px-3 py-2.5 text-xs text-ink">{s.gap ?? s.integration}</td>
        <td className="px-3 py-2.5 text-xs text-muted">{s.owner}</td>
        <td className="px-3 py-2.5 text-xs">
          {plan ? (
            <>
              <div className="font-semibold">
                {plan.ws} · {w?.name}
              </div>
              <div className="text-faint">{plan.deliverable}</div>
            </>
          ) : (
            <span className="text-faint">To schedule</span>
          )}
        </td>
        <td className="px-3 py-2.5">
          {plan && (
            <div>
              <div className="relative flex h-3 gap-px">
                {Array.from({ length: PHASE1.weeks }, (_, i) => {
                  const wk = i + 1
                  const inWs = w && wk >= w.start && wk <= w.end
                  return <span key={i} className="flex-1" style={{ background: wk === plan.week ? '#FFD100' : inWs ? '#353B48' : '#22262F' }} />
                })}
              </div>
              <div className="tnum mt-0.5 text-[11px] text-muted">Week {plan.week}</div>
            </div>
          )}
        </td>
        <td className="px-4 py-2.5">
          <ClassDots classes={s.classes} />
        </td>
      </tr>
    )
  }

  const head = (
    <thead>
      <tr className="text-left text-2xs uppercase tracking-wider text-faint">
        <th className="px-4 py-2 font-semibold">Source</th>
        <th className="px-3 py-2 font-semibold">What must happen before go-live</th>
        <th className="px-3 py-2 font-semibold">Owner</th>
        <th className="px-3 py-2 font-semibold">Workstream</th>
        <th className="px-3 py-2 font-semibold">Target · weeks 1–{PHASE1.weeks}</th>
        <th className="px-4 py-2 font-semibold">Classes</th>
      </tr>
    </thead>
  )
  const cols = (
    <colgroup>
      <col className="w-[260px]" />
      <col />
      <col className="w-[180px]" />
      <col className="w-[250px]" />
      <col className="w-[170px]" />
      <col className="w-[120px]" />
    </colgroup>
  )

  return (
    <Section
      id="gaps"
      className="mt-5"
      title={`Gaps to close · ${primary.length} sources not yet on Netra, plus ${onNetraWork.length} on Netra that still need work`}
      sub="Blocking first. Target weeks follow WS1 (data onboarding, weeks 1–8) and WS5 (integrations, weeks 6–14); DevX proposal for agreement with each owner."
    >
      <table className="w-full table-fixed text-sm">
        {cols}
        {head}
        <tbody>
          {primary.map((s) => (
            <Row key={s.id} s={s} />
          ))}
          <tr className="border-t border-line bg-panel2/60">
            <td colSpan={6} className="px-4 py-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
              On Netra, but the back-test depends on this work
            </td>
          </tr>
          {onNetraWork.map((s) => (
            <Row key={s.id} s={s} />
          ))}
        </tbody>
      </table>
      <div className="border-t border-line px-4 py-2 text-[11px] text-faint">
        Enhancing, not on the critical path: {enhancing.map((s) => s.name).join(', ')}. Each improves recall or plan quality and is onboarded as capacity allows.
      </div>
    </Section>
  )
}

// ---- Governance ------------------------------------------------------------------------------------
function Governance() {
  const pii = SOURCES.filter((s) => s.pii)
  const nfr = (area: string) => NFRS.find((n) => n.area === area)?.text ?? ''
  const items = [
    { icon: MapPin, title: 'Residency', text: nfr('Residency') || 'All data and models hosted in Indonesia.' },
    { icon: Lock, title: 'Personal data', text: `${pii.map((s) => s.name).join(' and ')} contain customer-level data. It stays in Netra; the Planner reads site × segment aggregates only (UU PDP).` },
    { icon: Clock, title: 'Retention and audit', text: `${nfr('Audit')}. Raw extracts keep the history each source needs (up to 24 months for back-tests).` },
    { icon: GitMerge, title: 'Point-in-time joins', text: 'Features are joined as of the run date, so back-tests never see the future. Each feature records its source as-of date and a quality flag; missing values are shown grey, never guessed.' },
  ]
  return (
    <div className="mt-5 grid grid-cols-4 gap-px border border-line bg-line">
      {items.map((it) => (
        <div key={it.title} className="bg-panel p-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <it.icon size={15} className="text-ioh-yellow" /> {it.title}
          </div>
          <div className="mt-1.5 text-xs leading-[17px] text-muted">{it.text}</div>
        </div>
      ))}
    </div>
  )
}
