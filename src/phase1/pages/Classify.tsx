import clsx from 'clsx'
import { ArrowLeftRight, ArrowRight, Check, ChevronDown, ChevronRight, Split, X } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Fresh, Id, Label, ReasonModal, Seg } from '@/components/ui'
import { db } from '@/data/db'
import type { FailureClass } from '@/data/types'
import { INTERVENTION_LABEL, date, idr, num } from '@/lib/format'
import { useApp } from '@/store/app'
import { CLASS_META, optionsFor, useP1 } from '../model'
import { useP1Store } from '../store'
import {
  ClassChip,
  CoverageBadge,
  STORY_LABEL,
  bridgeFor,
  classOrder,
  districtName,
  fits,
  pctTxt,
  planForCluster,
  useBuildPlan,
  useClusters,
  usePredSites,
  weekTxt,
  windowDays,
} from './forecast/common'
import { CLASSIFY_REASONS, classifyAll, type ClusterCall, type Verdict } from './forecast/smartcapex'

type Target = { kind: 'cluster'; call: ClusterCall; to: Verdict } | { kind: 'site'; siteId: string; to: Verdict }

const VLABEL: Record<Verdict, string> = { capex: 'CapEx', noncapex: 'Non-CapEx' }

function VerdictBadge({ v, className }: { v: Verdict; className?: string }) {
  return (
    <Badge tone={v === 'capex' ? 'blue' : 'neutral'} className={className}>
      {VLABEL[v]}
    </Badge>
  )
}

export function ClassifyPage() {
  const D = db()
  const nav = useNavigate()
  const p1 = useP1()
  const role = useApp((s) => s.role)
  const plans = useP1Store((s) => s.plans)
  const moves = useP1Store((s) => s.classMoves)
  const build = useBuildPlan()
  const clusters = useClusters()
  const all = usePredSites(p1, clusters)
  const byId = useMemo(() => new Map(all.map((s) => [s.id, s])), [all])
  const calls = useMemo(() => classifyAll(clusters, byId, moves), [clusters, byId, moves])
  const order = classOrder(role)
  const canMove = role === 'PLAN' || role === 'EXEC'

  const [cls, setCls] = useState<'all' | FailureClass>('all')
  const [region, setRegion] = useState('all')
  const [cov, setCov] = useState('all')
  const [bucket, setBucket] = useState<'all' | Verdict>('all')
  const [disagree, setDisagree] = useState(false)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [target, setTarget] = useState<Target | null>(null)

  // Smart CapEx runs on D-5 data; sites first flagged after that snapshot carry a provisional call.
  const asOfD5 = D.meta.as_of_d5
  const provisional = (siteId: string) => {
    const ps = byId.get(siteId)?.p1
    if (!ps || ps.first_flagged_run === null || !p1) return false
    return p1.run_dates[ps.first_flagged_run] > asOfD5
  }

  const totals = useMemo(() => {
    const t = { capexClusters: 0, nonClusters: 0, capexSites: 0, nonSites: 0, capexIdr: 0, nonIdr: 0, agree: 0, rated: 0, overrides: 0, bridges: 0, prov: 0 }
    for (const c of calls) {
      if (c.verdict === 'capex') t.capexClusters++
      else t.nonClusters++
      t.capexSites += c.capexSites
      t.nonSites += c.sites.length - c.capexSites
      t.capexIdr += c.capexIdr
      t.nonIdr += c.noncapexIdr
      if (c.agree !== null) {
        t.rated++
        if (c.agree) t.agree++
      }
      t.overrides += c.sites.filter((s) => s.moved && s.moved.to !== s.model).length
      if (bridgeFor(c.cluster)) t.bridges++
      t.prov += c.sites.filter((s) => provisional(s.siteId)).length
    }
    return t
  }, [calls]) // eslint-disable-line react-hooks/exhaustive-deps

  const regions = [...new Set(clusters.map((c) => c.region))].sort()
  const rows = calls
    .filter((c) => (cls === 'all' || c.cluster.cls === cls) && (region === 'all' || c.cluster.region === region) && (cov === 'all' || c.cluster.coverage.verdict === cov) && (bucket === 'all' || c.verdict === bucket) && (!disagree || c.agree === false))
    .sort((a, b) => (role === 'OPS' ? Number(a.cluster.cls === 'capacity') - Number(b.cluster.cls === 'capacity') : 0) || b.cluster.priority - a.cluster.priority)
  const disagreeN = calls.filter((c) => c.agree === false).length

  const toggle = (id: string) => {
    const n = new Set(open)
    if (n.has(id)) n.delete(id)
    else n.add(id)
    setOpen(n)
  }

  const apply = (reason: string) => {
    if (!target) return
    const st = useP1Store.getState()
    if (target.kind === 'site') st.moveClass(target.siteId, target.to, reason)
    else for (const s of target.call.sites) if (s.verdict !== target.to) st.moveClass(s.siteId, target.to, reason)
    useApp.getState().toast(
      target.kind === 'site' ? `${target.siteId} moved to ${VLABEL[target.to]} · sent to Override Learning and the Smart CapEx owner` : `${target.call.cluster.id} moved to ${VLABEL[target.to]} (${target.call.sites.filter((s) => s.verdict !== target.to).length} sites) · sent to Override Learning`,
      'ok',
    )
  }

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        {/* headline */}
        <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Step 2 · Classify · Smart CapEx Agent + Action Ladder Agent</div>
        <h1 className="mt-1 max-w-[1100px] text-[22px] font-semibold leading-7">
          Smart CapEx puts {num(totals.capexSites)} of {num(totals.capexSites + totals.nonSites)} predicted sites into CapEx (<span className="text-[#8CC4F0]">{idr(totals.capexIdr)}</span>) and {num(totals.nonSites)} into non-CapEx ({idr(totals.nonIdr)}); the Action Ladder disagrees on {disagreeN} of {calls.length} clusters.
        </h1>
        <p className="mt-1.5 max-w-[1100px] text-sm text-muted">
          Where they disagree, the ladder usually has a cheaper rung that lands inside the window; the CapEx call is the durable fix. Planners settle it here, with a reason, before a plan is built.
        </p>

        {/* D-5 banner */}
        <div className="mt-4 flex items-center gap-3 border border-warn/40 bg-warn/[0.06] px-4 py-2.5">
          <Fresh f="D-5" className="h-5 px-1.5 text-[11px]" />
          <div className="min-w-0 flex-1 text-sm">
            <span className="font-semibold text-warn">Smart CapEx classification as of {date(asOfD5)}.</span>{' '}
            <span className="text-muted">
              Consumed as-is and read-only from <span className="font-mono text-[11.5px]">SRC-SMARTCAPEX</span>; the forecast is D-1 ({date(D.meta.as_of)}).{' '}
              {totals.prov > 0 ? `${totals.prov} sites first flagged after the snapshot carry a provisional call from the same rules until the next Smart CapEx run.` : 'Every predicted site is in the latest snapshot.'}
            </span>
          </div>
          <button onClick={() => nav('/phase1/agents/AG-SMARTCAPEX')} className="shrink-0 text-xs text-muted hover:text-ink">
            Smart CapEx Agent →
          </button>
        </div>

        {/* KPI strip */}
        <div className="mt-4 grid grid-cols-6 border border-line bg-panel">
          {[
            { l: 'CapEx', f: 'D-5', v: <span className="text-[#8CC4F0]">{idr(totals.capexIdr)}</span>, s: `${totals.capexClusters} clusters · ${totals.capexSites} sites` },
            { l: 'Non-CapEx', f: 'D-5', v: idr(totals.nonIdr), s: `${totals.nonClusters} clusters · ${totals.nonSites} sites` },
            { l: 'Smart CapEx vs ladder', f: 'D-1', v: `${totals.agree} / ${totals.rated}`, s: `agree · ${totals.rated - totals.agree} disagree` },
            { l: 'Bridge needed', f: 'D-1', v: num(totals.bridges), s: 'rung lands after window' },
            { l: 'Planner overrides', f: 'live', v: num(totals.overrides), s: 'sites moved this session' },
            { l: 'Provisional calls', f: 'D-1', v: num(totals.prov), s: `flagged after ${date(asOfD5)}` },
          ].map((k, n) => (
            <div key={k.l} className={clsx('min-w-0 px-4 py-2.5', n < 5 && 'border-r border-line')}>
              <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
                <span className="truncate">{k.l}</span>
                <Fresh f={k.f} />
              </div>
              <div className="tnum mt-0.5 truncate text-xl font-semibold leading-7">{k.v}</div>
              <div className="tnum truncate text-xs text-muted">{k.s}</div>
            </div>
          ))}
        </div>

        {/* filters */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border border-line bg-panel px-3 py-2">
          <Seg
            options={[{ id: 'all', label: 'All' } as { id: 'all' | FailureClass; label: ReactNode }].concat(order.map((c) => ({ id: c, label: <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: CLASS_META[c].color }} />{CLASS_META[c].short}</span> })))}
            value={cls}
            onChange={setCls}
          />
          <select value={region} onChange={(e) => setRegion(e.target.value)} className="h-7 border border-line2 bg-panel2 px-2 text-xs">
            <option value="all">All regions</option>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          <select value={cov} onChange={(e) => setCov(e.target.value)} className="h-7 border border-line2 bg-panel2 px-2 text-xs">
            <option value="all">Any coverage</option>
            <option value="not_covered">Not covered</option>
            <option value="partial">Partial</option>
            <option value="covered">Covered</option>
          </select>
          <Seg options={[{ id: 'all', label: 'CapEx + non-CapEx' }, { id: 'capex', label: 'CapEx' }, { id: 'noncapex', label: 'Non-CapEx' }]} value={bucket} onChange={(v) => setBucket(v as 'all' | Verdict)} />
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
            <input type="checkbox" checked={disagree} onChange={(e) => setDisagree(e.target.checked)} className="accent-[#FFD100]" />
            Disagreements only <span className="tnum text-faint">{disagreeN}</span>
          </label>
          <span className="ml-auto text-[11px] text-faint">
            {rows.length} of {calls.length} clusters · {role === 'OPS' ? 'non-capacity first, then priority' : 'by priority'}
          </span>
        </div>

        {/* clusters */}
        <section className="mt-3 overflow-x-auto border border-line bg-panel">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                <th className="w-7 border-b border-line py-2 pl-3" />
                <th className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold">Cluster</th>
                <th className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold">Sites · crosses</th>
                <th className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold">
                  Smart CapEx <Fresh f="D-5" className="ml-1" />
                </th>
                <th className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold">Action ladder recommends</th>
                <th className="whitespace-nowrap border-b border-line px-2 py-2 font-semibold">Agree</th>
                <th className="whitespace-nowrap border-b border-line px-2 py-2 text-right font-semibold">Cost of call</th>
                <th className="whitespace-nowrap border-b border-line px-3 py-2 text-right font-semibold"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const cl = c.cluster
                const isOpen = open.has(cl.id)
                const plan = planForCluster(plans, cl.id)
                const ok = c.rec ? fits(c.rec, cl) : false
                const overridden = c.sites.filter((s) => s.moved && s.moved.to !== s.model).length
                const other: Verdict = c.verdict === 'capex' ? 'noncapex' : 'capex'
                return (
                  <Fragment key={cl.id}>
                    <tr onClick={() => toggle(cl.id)} className={clsx('cursor-pointer border-b border-line/70 hover:bg-panel2', isOpen && 'bg-panel2')}>
                      <td className="py-2 pl-3 text-faint">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                      <td className="max-w-[280px] px-2 py-2">
                        <div className="flex items-center gap-2">
                          <Id>{cl.id}</Id>
                          <span className="truncate font-medium" title={cl.title}>{cl.story && STORY_LABEL[cl.story] ? STORY_LABEL[cl.story] : cl.title}</span>
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-faint">
                          <ClassChip cls={cl.cls} />
                          <span>·</span>
                          <span className="truncate">{districtName(cl.district_id)}, {cl.region}</span>
                          <CoverageBadge c={cl} plan={plan} />
                        </div>
                      </td>
                      <td className="tnum whitespace-nowrap px-2 py-2">
                        <div>
                          {cl.site_ids.length} site{cl.site_ids.length > 1 ? 's' : ''}
                        </div>
                        <div className="text-[11px] text-muted">{weekTxt(cl.crossing_week)}</div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <div className="flex flex-wrap items-center gap-1">
                          <VerdictBadge v={c.verdict} />
                          <span className="tnum mr-0.5 text-[11px] text-faint" title="Smart CapEx rank inside its bucket">
                            #{c.rank}
                          </span>
                          {c.capexSites > 0 && c.capexSites < c.sites.length && (
                            <span className="tnum mr-0.5 text-[11px] text-muted">
                              {c.capexSites}/{c.sites.length}
                            </span>
                          )}
                          {c.codes
                            .filter((k) => k.capex === (c.verdict === 'capex'))
                            .slice(0, 1)
                            .map((k) => (
                              <span key={k.code} title={`${k.text}${c.sites.length > 1 ? ` (${k.n} of ${c.sites.length} sites)` : ''}`} className="inline-flex h-5 items-center border border-line2 px-1 font-mono text-[10px] text-muted">
                                {k.code}
                                {c.sites.length > 1 && <span className="text-faint">&nbsp;×{k.n}</span>}
                              </span>
                            ))}
                          {overridden > 0 && <Badge tone="yellow">Moved by planner · {overridden}</Badge>}
                        </div>
                      </td>
                      <td className="max-w-[240px] px-2 py-2">
                        {c.rec ? (
                          <>
                            <div className="truncate" title={c.rec.name}>{c.rec.name}</div>
                            <div className="tnum flex items-center gap-1.5 text-[11px] text-faint">
                              <span>{INTERVENTION_LABEL[c.rec.class]}</span>·<span>{c.rec.cost_idr ? idr(c.rec.cost_idr) : 'IDR 0'}</span>·
                              <span className={ok ? 'text-ok' : 'text-bad'}>
                                {c.rec.lead_days} d / {windowDays(cl)} d
                              </span>
                            </div>
                          </>
                        ) : (
                          <span className="text-faint">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        {c.agree === null ? (
                          <span className="text-faint">—</span>
                        ) : c.agree ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ok">
                            <Check size={13} /> Agree
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-warn">
                            <Split size={13} /> Disagree
                          </span>
                        )}
                      </td>
                      <td className="tnum whitespace-nowrap px-2 py-2 text-right">{idr(c.capexIdr + c.noncapexIdr)}</td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <Button size="sm" variant="ghost" disabled={!canMove} title={canMove ? `Move every site in ${cl.id} to ${VLABEL[other]} (reason required)` : 'Only the Head of Planning moves sites between classes'} onClick={() => setTarget({ kind: 'cluster', call: c, to: other })}>
                            <ArrowLeftRight size={12} /> {other === 'capex' ? 'CapEx' : 'Non-CapEx'}
                          </Button>
                          {plan ? (
                            <Button size="sm" onClick={() => nav(`/phase1/plans/${plan.id}`)}>
                              Open {plan.id}
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => build(cl, c.verdict)}>
                              Build plan <ArrowRight size={12} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-line bg-canvas/40">
                        <td />
                        <td colSpan={7} className="px-2 pb-4 pt-2">
                          <Expanded call={c} canMove={canMove} provisional={provisional} onMove={(siteId, to) => setTarget({ kind: 'site', siteId, to })} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-faint">No clusters match these filters.</div>}
        </section>
        <div className="mt-2 pb-2 text-[11px] text-faint">
          Overrides carry a reason code, go to the Override Learning Agent as a training signal and are exported to the Smart CapEx owner; the Smart CapEx model itself is never changed from here. # is the Smart CapEx priority rank inside its bucket (CapEx or non-CapEx). Cost of call prices each site at the ladder rung that matches its class.
        </div>
      </div>
      <ReasonModal
        key={target ? (target.kind === 'site' ? target.siteId : target.call.cluster.id) + target.to : 'none'}
        open={!!target}
        onClose={() => setTarget(null)}
        onSubmit={apply}
        codes={CLASSIFY_REASONS}
        confirmLabel={target ? `Move to ${VLABEL[target.to]}` : 'Move'}
        title={target ? (target.kind === 'site' ? `Move ${target.siteId} to ${VLABEL[target.to]}` : `Move ${target.call.cluster.id} (${target.call.sites.filter((s) => s.verdict !== target.to).length} sites) to ${VLABEL[target.to]}`) : ''}
      />
    </div>
  )
}

function Expanded({ call: c, canMove, provisional, onMove }: { call: ClusterCall; canMove: boolean; provisional: (id: string) => boolean; onMove: (siteId: string, to: Verdict) => void }) {
  const nav = useNavigate()
  const cl = c.cluster
  const opts = optionsFor(cl)
  const bridge = bridgeFor(cl)
  const win = windowDays(cl)
  const capexAction = c.sites.find((s) => s.model === 'capex')?.action
  const nonAction = c.sites.find((s) => s.model === 'noncapex')?.action
  const narrative = (() => {
    if (!c.rec) return ''
    const what = c.verdict === 'capex' ? `CapEx (${capexAction ?? c.capexRung?.name ?? 'CapEx rung'})` : `non-CapEx (${nonAction ?? c.noncapexRung?.name ?? 'non-CapEx rung'})`
    const sc = c.verdict !== c.model ? `The planner moved it to ${what} against Smart CapEx's ${VLABEL[c.model]} call` : `Smart CapEx calls it ${what}`
    const lad = `the Action Ladder recommends ${c.rec.name.toLowerCase()} (${INTERVENTION_LABEL[c.rec.class]}, ${c.rec.lead_days} d against a ${win}-day window)`
    if (c.agree) return `${sc}, and ${lad}. Both point the same way: build the plan.`
    return c.verdict === 'capex'
      ? `${sc}; ${lad}. Typical resolution: take the ladder rung now as the bridge and keep the CapEx scope in the Smart CapEx queue, or move the cluster to non-CapEx with a reason if the cheaper rung is the durable fix.`
      : `${sc}; ${lad}. The ladder ranks the CapEx rung first because the non-CapEx rungs only buy time. Move the cluster to CapEx with a reason, or keep it non-CapEx and let the next forecast run confirm the cheaper rung held.`
  })()
  return (
    <div className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] gap-4">
      <div className="border border-line bg-panel">
        <div className="flex h-8 items-center justify-between border-b border-line px-3">
          <Label>Per site · Smart CapEx rule and rationale</Label>
          <Fresh f="D-5" />
        </div>
        <table className="w-full text-xs">
          <tbody>
            {c.sites.map((s) => {
              const moved = s.moved && s.moved.to !== s.model
              const prov = provisional(s.siteId)
              return (
                <tr key={s.siteId} className="border-b border-line/60 align-top last:border-0">
                  <td className="whitespace-nowrap px-3 py-1.5">
                    <button onClick={() => nav(`/phase1/site/${s.siteId}`)} className="font-mono text-[11.5px] text-muted hover:text-ioh-yellow">
                      {s.siteId}
                    </button>
                    <div className="tnum text-[10.5px] text-faint">
                      {s.ps ? `${pctTxt(s.ps.p8)} · W+${s.ps.cw || '—'}` : '—'}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {s.codes.map((k) => (
                      <div key={k.code} className="flex gap-1.5">
                        <span className={clsx('w-[46px] shrink-0 font-mono text-[10px]', k.capex ? 'text-[#8CC4F0]' : 'text-faint')}>{k.code}</span>
                        <span className="text-muted">{k.text}</span>
                      </div>
                    ))}
                    {moved && (
                      <div className="mt-0.5 text-[10.5px] text-ioh-yellow">
                        Moved by {s.moved!.by}: {s.moved!.reason}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <VerdictBadge v={s.verdict} />
                      {moved && <Badge tone="yellow">Moved</Badge>}
                      {prov && <Badge tone="warn" className="normal-case">Provisional</Badge>}
                    </div>
                    <div className="mt-0.5 text-[10.5px] text-faint">{moved ? `Smart CapEx: ${VLABEL[s.model]}` : s.action}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right">
                    <button disabled={!canMove} onClick={() => onMove(s.siteId, s.verdict === 'capex' ? 'noncapex' : 'capex')} className="text-[11px] text-muted hover:text-ioh-yellow disabled:cursor-not-allowed disabled:opacity-40">
                      Move to {VLABEL[s.verdict === 'capex' ? 'noncapex' : 'capex']}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-3">
        <div className="border border-line bg-panel">
          <div className="flex h-8 items-center justify-between border-b border-line px-3">
            <Label>Action ladder · cheapest first · window {win} d</Label>
            <Fresh f="D-1" />
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[9.5px] uppercase tracking-wider text-faint">
                <th className="px-3 py-1 font-semibold">Rung</th>
                <th className="whitespace-nowrap px-2 py-1 text-right font-semibold">Cost</th>
                <th className="whitespace-nowrap px-2 py-1 text-right font-semibold">Lead</th>
                <th className="px-2 py-1 font-semibold">Uplift</th>
                <th className="whitespace-nowrap px-2 py-1 text-right font-semibold">Conf.</th>
                <th className="px-3 py-1 font-semibold">Fits</th>
              </tr>
            </thead>
            <tbody>
              {opts.map((o) => {
                const isRec = o.rank === c.rec?.rank
                const ok = fits(o, cl)
                return (
                  <tr key={o.rank} className={clsx('border-t border-line/60', isRec && 'bg-ioh-yellow/[0.06]')}>
                    <td className="px-3 py-1.5">
                      <span className="mr-1.5 font-mono text-faint">{o.rank}</span>
                      <span className={clsx(isRec && 'font-semibold')}>{o.name}</span>
                      {isRec && <Badge tone="yellow" className="ml-1.5">Rec.</Badge>}
                      <div className="pl-4 text-[10.5px] text-faint">{INTERVENTION_LABEL[o.class]}</div>
                    </td>
                    <td className="tnum whitespace-nowrap px-2 py-1.5 text-right">{o.cost_idr ? idr(o.cost_idr) : 'IDR 0'}</td>
                    <td className="tnum whitespace-nowrap px-2 py-1.5 text-right text-muted">{o.lead_days} d</td>
                    <td className="max-w-[170px] truncate px-2 py-1.5 text-muted" title={o.predicted_uplift}>{o.predicted_uplift}</td>
                    <td className="tnum px-2 py-1.5 text-right text-muted">{Math.round(o.confidence * 100)}%</td>
                    <td className="px-3 py-1.5">{ok ? <Check size={13} className="text-ok" /> : <X size={13} className="text-bad" />}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {bridge && c.rec && (
            <div className="border-t border-line px-3 py-2 text-xs text-muted">
              <span className="font-semibold text-warn">Bridge.</span> {c.rec.name} lands at day {c.rec.lead_days}, after the {win}-day window: bridge with {bridge.name.toLowerCase()} ({bridge.lead_days} d, {bridge.cost_idr ? idr(bridge.cost_idr) : 'zero cost'}).
            </div>
          )}
        </div>
        <div className={clsx('border-l-2 px-3 py-2 text-xs leading-5', c.agree === false ? 'border-warn bg-warn/5 text-muted' : 'border-ok bg-ok/5 text-muted')}>{narrative}</div>
      </div>
    </div>
  )
}
