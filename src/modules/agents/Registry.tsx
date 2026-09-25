import clsx from 'clsx'
import { ArrowRight, Check, ShieldCheck, X } from 'lucide-react'
import { Fragment, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Bar as RBar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import type { Agent } from '@/data/types'
import { Badge, Fresh, Id, Label, Panel, Td, Th } from '@/components/ui'
import { STATUS } from '@/lib/colors'
import { ago, CLASS_LABEL, dateShort, dateTime, num } from '@/lib/format'
import { AXIS, GRID, LegendItem, TOOLTIP } from '@/modules/value/chart'
import { Orchestration } from './Orchestration'
import { agentStats, EXISTS_ORDER, EXISTS_TONE, existsGroup, FAMILIES, MONEY_AGENTS, runsFor, type ExistsGroup } from './stats'

export function Registry() {
  const D = db()
  const [params, setParams] = useSearchParams()
  const [family, setFamily] = useState<string | null>(null)
  const [exists, setExists] = useState<ExistsGroup | null>(null)
  const selected = params.get('agent')
  const stats = agentStats()

  const byFamily = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of D.agents) m[a.family] = (m[a.family] ?? 0) + 1
    return m
  }, [D.agents])
  const byExists = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of D.agents) m[existsGroup(a)] = (m[existsGroup(a)] ?? 0) + 1
    return m
  }, [D.agents])
  const inScope = D.agents.filter((a) => a.family !== 'DevX proposed').length
  const proposed = D.agents.length - inScope
  const insights = D.agents.reduce((a, x) => a + x.insights_14d, 0)
  const totals = [...stats.values()].reduce((a, s) => ({ out: a.out + s.outputs, acc: a.acc + s.accepted, ovr: a.ovr + s.overridden }), { out: 0, acc: 0, ovr: 0 })
  const staleD5 = D.agents.filter((a) => a.freshness === 'D-5')

  const rows = D.agents.filter((a) => (!family || a.family === family) && (!exists || existsGroup(a) === exists))
  const open = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('agent', id)
    else p.delete('agent')
    setParams(p, { replace: true })
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      {/* Headline and counts */}
      <div className="border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <Label>Agent registry · Netra runtime</Label>
            <div className="mt-1 text-[22px] font-semibold leading-8">
              {inScope} agents in scope <span className="text-faint">+</span> <span className="text-[#B79CFF]">{proposed} proposed by DevX</span>
            </div>
            <div className="mt-0.5 text-sm text-muted">
              {byExists.Yes ?? 0} exist today (Smart CapEx, CNX, CX), {byExists.Partial ?? 0} partially; the rest are built on Netra as the process chain needs them. {num(insights)} insights in 14 days,{' '}
              {Math.round((totals.acc / totals.out) * 100)}% accepted, {Math.round((totals.ovr / totals.out) * 100)}% overridden with a reason code.
              {staleD5.length > 0 && <span className="text-warn"> {staleD5.map((a) => a.name).join(', ')} runs on D-5 data.</span>}
            </div>
          </div>
          <div className="flex shrink-0 gap-6">
            <Big label="Runs · 14 days" value={num(D.agentRuns.length)} fresh="live" />
            <Big label="Outputs" value={num(totals.out)} fresh="live" />
            <Big label="Accepted" value={`${Math.round((totals.acc / totals.out) * 100)}%`} tone="ok" fresh="live" />
            <Big label="Overridden" value={`${Math.round((totals.ovr / totals.out) * 100)}%`} tone="warn" fresh="live" />
          </div>
        </div>
        <div className="grid border-t border-line xl:grid-cols-[1fr_auto]">
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-2.5 xl:border-r xl:border-line">
            <span className="mr-1 text-2xs font-semibold uppercase tracking-wider text-faint">By family</span>
            {FAMILIES.map((f) => (
              <Chip key={f} active={family === f} onClick={() => setFamily(family === f ? null : f)}>
                {f} <span className="tnum text-faint">{byFamily[f] ?? 0}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-5 py-2.5 max-xl:border-t max-xl:border-line">
            <span className="mr-1 text-2xs font-semibold uppercase tracking-wider text-faint">Exists today</span>
            {EXISTS_ORDER.map((e) => (
              <Chip key={e} active={exists === e} onClick={() => setExists(exists === e ? null : e)}>
                <span className={clsx('inline-block h-2 w-2', { 'bg-ok': e === 'Yes', 'bg-warn': e === 'Partial', 'bg-ioh-yellow': e === 'To build', 'bg-nodata': e === 'No', 'bg-prog': e === 'Proposed' })} />
                {e} <span className="tnum text-faint">{byExists[e] ?? 0}</span>
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {/* Orchestration */}
      <Panel title="Orchestration pattern" right={<span className="text-xs text-faint">Click a stage to filter the registry · PRD §7</span>}>
        <div className="mx-auto max-w-[1280px]">
          <Orchestration counts={byFamily} active={family} onPick={(f) => setFamily(f)} />
        </div>
      </Panel>

      <SfpCallout onOpen={() => open('AG-07')} />

      {/* Table */}
      <Panel
        pad={false}
        title={
          <span>
            Agents{' '}
            <span className="font-normal text-faint">
              {rows.length} of {D.agents.length}
              {(family || exists) && ' · filtered'}
            </span>
          </span>
        }
        right={
          (family || exists) && (
            <button
              className="text-xs text-muted hover:text-ink"
              onClick={() => {
                setFamily(null)
                setExists(null)
              }}
            >
              Clear filters
            </button>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1280px] table-fixed">
            <thead>
              <tr>
                <Th className="w-[230px]">Agent</Th>
                <Th className="w-[100px]">Function</Th>
                <Th>Inputs → outputs</Th>
                <Th className="w-[104px]">Exists today</Th>
                <Th className="w-[118px]">Schedule</Th>
                <Th className="w-[92px]">Last run</Th>
                <Th className="w-[54px]">Data</Th>
                <Th className="w-[150px]">Owner</Th>
                <Th className="w-[92px] text-right">Insights 14 d</Th>
                <Th className="w-[92px] text-right">Accepted</Th>
                <Th className="w-[74px] text-right">Override</Th>
              </tr>
            </thead>
            <tbody>
              {FAMILIES.filter((f) => rows.some((a) => a.family === f)).map((f) => (
                <Fragment key={f}>
                  <tr>
                    <td colSpan={11} className="h-7 border-b border-line bg-panel2 px-3 text-2xs font-semibold uppercase tracking-wider text-muted">
                      {f} <span className="tnum ml-1 text-faint">{rows.filter((a) => a.family === f).length}</span>
                      {f === 'DevX proposed' && <span className="ml-2 font-normal normal-case tracking-normal text-faint">energy cost, tower company dependency, spectrum and site access</span>}
                    </td>
                  </tr>
                  {rows
                    .filter((a) => a.family === f)
                    .map((a) => (
                      <AgentRow key={a.agent_id} a={a} selected={selected === a.agent_id} onClick={() => open(a.agent_id)} />
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {selected && D.agents.some((a) => a.agent_id === selected) && <AgentDetail id={selected} onClose={() => open(null)} />}
    </div>
  )
}

function Big({ label, value, tone, fresh }: { label: string; value: string; tone?: 'ok' | 'warn'; fresh: string }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
        {label} <Fresh f={fresh} />
      </div>
      <div className={clsx('tnum text-xl font-semibold', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{value}</div>
    </div>
  )
}

function Chip({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={clsx('flex h-7 items-center gap-1.5 border px-2 text-xs font-semibold', active ? 'border-ioh-yellow bg-ioh-yellow/10 text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}>
      {children}
    </button>
  )
}

function AgentRow({ a, selected, onClick }: { a: Agent; selected: boolean; onClick: () => void }) {
  const D = db()
  const g = existsGroup(a)
  return (
    <tr onClick={onClick} className={clsx('cursor-pointer align-top', selected ? 'bg-ioh-yellow/[0.06]' : 'hover:bg-panel2')}>
      <Td className="whitespace-normal py-2">
        <div className="flex items-center gap-2">
          <span className={clsx('font-semibold', selected && 'text-ioh-yellow')}>{a.name}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Id>{a.agent_id}</Id>
          {MONEY_AGENTS.has(a.name) && <span className="text-2xs text-warn">drafts only</span>}
          {a.agent_id === 'AG-07' && <span className="text-2xs text-ioh-yellow">North Star agent</span>}
        </div>
      </Td>
      <Td className="whitespace-normal py-2 text-xs text-muted">{a.function}</Td>
      <Td className="whitespace-normal py-2 text-xs leading-5">
        <span className="text-muted">{a.inputs}</span> <span className="text-faint">→</span> <span>{a.outputs}</span>
      </Td>
      <Td className="py-2">
        <Badge tone={EXISTS_TONE[g]}>{a.exists_today.replace(' on Netra', '')}</Badge>
      </Td>
      <Td className="py-2 text-xs text-muted">{a.schedule}</Td>
      <Td className="tnum py-2 text-xs" title={dateTime(a.last_run)}>
        {ago(a.last_run, D.meta.now)}
      </Td>
      <Td className="py-2">
        <Fresh f={a.freshness} asOf={a.freshness === 'D-5' ? D.meta.as_of_d5 : D.meta.as_of} />
      </Td>
      <Td className="truncate py-2 text-xs text-muted" title={a.owner}>
        {a.owner}
      </Td>
      <Td className="tnum py-2 text-right">{a.insights_14d}</Td>
      <Td className="py-2 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <div className="h-1.5 w-8 bg-line">
            <div className="h-full bg-ok" style={{ width: `${a.acceptance_rate * 100}%` }} />
          </div>
          <span className="tnum w-8">{Math.round(a.acceptance_rate * 100)}%</span>
        </div>
      </Td>
      <Td className={clsx('tnum py-2 text-right', a.override_rate >= 0.15 ? 'text-warn' : 'text-muted')}>{Math.round(a.override_rate * 100)}%</Td>
    </tr>
  )
}

function SfpCallout({ onOpen }: { onOpen: () => void }) {
  const D = db()
  const nav = useNavigate()
  const SPEC: Record<string, { what: string; signals: string }> = {
    capacity: { what: 'PRB or throughput exhaustion', signals: 'traffic growth, PRB trend, device mix, events' },
    power: { what: 'Battery, rectifier or generator failure', signals: 'discharge curves, genset hours, grid outages' },
    transport: { what: 'Backhaul degradation or link failure', signals: 'link utilisation, MW fade, fibre cuts, weather' },
    ran_hardware: { what: 'Radio or baseband unit failure', signals: 'alarm recurrence, temperature, age, MTBF' },
    environmental: { what: 'Flood, storm or landslide impact', signals: 'BMKG forecasts, incident map, elevation' },
  }
  return (
    <div className="grid border border-ioh-yellow/40 bg-panel xl:grid-cols-[360px_1fr]">
      <div className="border-line px-5 py-4 max-xl:border-b xl:border-r">
        <div className="flex items-center gap-2">
          <Badge tone="yellow">Spec</Badge>
          <Id>AG-07</Id>
        </div>
        <div className="mt-2 text-base font-semibold">Site Failure Prediction Agent</div>
        <p className="mt-1 text-xs leading-5 text-muted">
          The agent the North Star depends on. Does not exist today; built new on Netra, owned by IOH Network Operations with DevX as delivery partner, launched with its own precision scorecard.
        </p>
        <div className="mt-2 space-y-1 text-xs leading-5">
          <div>
            <span className="text-faint">Method </span>
            <span className="text-muted">one gradient-boosted classifier per class, rolling 90-day feature window, top factors per site in Site 360</span>
          </div>
          <div>
            <span className="text-faint">Cold start </span>
            <span className="text-muted">24 months back-test; no site turns red below 60%</span>
          </div>
          <div>
            <span className="text-faint">Acceptance </span>
            <span className="font-semibold text-ok">≥ 70% top-decile precision</span>
            <span className="text-muted"> before a class drives approvals</span>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={onOpen} className="flex h-7 items-center gap-1 border border-line2 px-2.5 text-xs font-semibold text-muted hover:text-ink">
            Runs and overrides
          </button>
          <button onClick={() => nav('/value?tab=models')} className="flex h-7 items-center gap-1 border border-ioh-yellow/60 px-2.5 text-xs font-semibold text-ioh-yellow hover:bg-ioh-yellow/10">
            Model scorecard <ArrowRight size={12} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Class</Th>
              <Th>What it predicts</Th>
              <Th>Horizon</Th>
              <Th>Strongest signals</Th>
              <Th>Wave</Th>
              <Th className="text-right">Precision</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {D.scorecard.map((s) => (
              <tr key={s.failure_class}>
                <Td className="font-semibold">{CLASS_LABEL[s.failure_class]}</Td>
                <Td className="text-muted">{SPEC[s.failure_class]?.what}</Td>
                <Td className="text-muted">{s.horizon}</Td>
                <Td className="whitespace-normal text-xs leading-4 text-faint">{SPEC[s.failure_class]?.signals}</Td>
                <Td>
                  <Badge tone={s.wave === 1 ? 'yellow' : s.wave === 2 ? 'blue' : 'neutral'}>Wave {s.wave}</Badge>
                </Td>
                <Td className={clsx('tnum text-right font-semibold', s.precision_top_decile >= 0.7 ? 'text-ok' : 'text-warn')}>{Math.round(s.precision_top_decile * 100)}%</Td>
                <Td className="whitespace-normal text-xs leading-4 text-muted">{s.status}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function AgentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const D = db()
  const a = D.agents.find((x) => x.agent_id === id)!
  const s = agentStats().get(id)!
  const runs = useMemo(() => runsFor(id), [id])
  const daily = useMemo(() => {
    const m = new Map<string, { day: string; accepted: number; overridden: number; ignored: number }>()
    for (const r of [...runs].reverse()) {
      const d = r.timestamp.slice(0, 10)
      const x = m.get(d) ?? { day: d, accepted: 0, overridden: 0, ignored: 0 }
      x.accepted += r.accepted
      x.overridden += r.overridden
      x.ignored += r.ignored
      m.set(d, x)
    }
    return [...m.values()]
  }, [runs])
  const reasons = Object.entries(s.reasons).sort((x, y) => y[1] - x[1])
  const rmax = Math.max(1, ...reasons.map((r) => r[1]))
  const money = MONEY_AGENTS.has(a.name)
  const g = existsGroup(a)

  return (
    <aside className="fixed bottom-0 right-0 top-14 z-40 flex w-[560px] max-w-full flex-col border-l border-line2 bg-panel">
      <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Id>{a.agent_id}</Id>
          <span className="truncate text-sm font-semibold">{a.name}</span>
          <Badge tone={EXISTS_TONE[g]}>{a.exists_today}</Badge>
        </div>
        <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <div className="text-[15px] font-semibold leading-6">{a.outputs}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 border border-line p-3 text-xs">
          <Fact k="Family" v={a.family} />
          <Fact k="Function" v={a.function} />
          <Fact k="Inputs (from Netra)" v={a.inputs} wide />
          <Fact k="Owner" v={a.owner} />
          <Fact k="Schedule" v={a.schedule} />
          <Fact k="Last run" v={`${dateTime(a.last_run)} · ${ago(a.last_run, D.meta.now)}`} />
          <Fact k="Data freshness" v={<Fresh f={a.freshness} />} />
        </div>

        <div className="grid grid-cols-4 border border-line">
          <MiniStat k="Runs 14 d" v={num(s.runs)} />
          <MiniStat k="Accepted" v={`${s.outputs ? Math.round((s.accepted / s.outputs) * 100) : 0}%`} tone="ok" />
          <MiniStat k="Overridden" v={`${s.outputs ? Math.round((s.overridden / s.outputs) * 100) : 0}%`} tone="warn" />
          <MiniStat k="Ignored" v={`${s.outputs ? Math.round((s.ignored / s.outputs) * 100) : 0}%`} last />
        </div>

        {daily.length > 0 && (
          <div>
            <div className="mb-1 flex items-center justify-between">
              <Label>Recommendations per day · last 14 days</Label>
              <span className="flex gap-2">
                <LegendItem square color={STATUS.ok} label="Accepted" />
                <LegendItem square color={STATUS.warn} label="Overridden" />
                <LegendItem square color="#4B5263" label="Ignored" />
              </span>
            </div>
            <div className="h-[130px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} barCategoryGap={3}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="day" {...AXIS} tickFormatter={(d: string) => dateShort(d)} minTickGap={20} />
                  <YAxis {...AXIS} width={30} allowDecimals={false} />
                  <Tooltip {...TOOLTIP} labelFormatter={(d: string) => dateShort(d)} />
                  <RBar dataKey="accepted" name="Accepted" stackId="a" fill={STATUS.ok} isAnimationActive={false} />
                  <RBar dataKey="overridden" name="Overridden" stackId="a" fill={STATUS.warn} isAnimationActive={false} />
                  <RBar dataKey="ignored" name="Ignored" stackId="a" fill="#4B5263" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {reasons.length > 0 && (
          <div>
            <Label className="mb-1.5">Override reasons (fed to Netra)</Label>
            <div className="space-y-1">
              {reasons.map(([r, n]) => (
                <div key={r} className="flex items-center gap-2 text-xs">
                  <span className="w-56 shrink-0 truncate text-muted">{r}</span>
                  <div className="h-1.5 flex-1 bg-line">
                    <div className="h-full bg-warn" style={{ width: `${(n / rmax) * 100}%` }} />
                  </div>
                  <span className="tnum w-8 text-right">{n}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <Label className="mb-1">Recent runs</Label>
          {runs.length === 0 ? (
            <div className="border border-line px-3 py-3 text-xs text-faint">No runs logged in the last 14 days. Event-driven agents run on state change.</div>
          ) : (
            <table className="w-full border border-line">
              <thead>
                <tr>
                  <Th>Run</Th>
                  <Th>When</Th>
                  <Th className="text-right">Out</Th>
                  <Th className="text-right">Acc</Th>
                  <Th className="text-right">Ovr</Th>
                  <Th>Reason</Th>
                </tr>
              </thead>
              <tbody>
                {runs.slice(0, 12).map((r) => (
                  <tr key={r.run_id}>
                    <Td>
                      <Id>{r.run_id}</Id>
                    </Td>
                    <Td className="tnum text-xs text-muted">{dateTime(r.timestamp)}</Td>
                    <Td className="tnum text-right">{r.outputs}</Td>
                    <Td className="tnum text-right text-ok">{r.accepted}</Td>
                    <Td className={clsx('tnum text-right', r.overridden ? 'text-warn' : 'text-faint')}>{r.overridden}</Td>
                    <Td className="max-w-[150px] truncate text-xs text-muted" title={r.override_reason ?? ''}>
                      {r.override_reason ?? '—'}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border border-line">
          <div className="flex h-8 items-center gap-2 border-b border-line px-3 text-2xs font-semibold uppercase tracking-wider text-faint">
            <ShieldCheck size={13} /> Design rules (PRD §7)
          </div>
          <ul className="space-y-1.5 p-3 text-xs leading-5">
            <Rule ok>One agent, one job, one owner: {a.owner}.</Rule>
            <Rule ok>No agent both recommends and approves. Approvals go to a named approver through the Approval Routing Agent.</Rule>
            <Rule ok>Every output carries confidence, evidence links and data as-of date ({a.freshness}).</Rule>
            <Rule ok={money} muted={!money}>
              Agents that touch money (BOQ, Procurement, Vendor Allocation) never execute; they draft.{money ? ' This agent drafts only.' : ' Not a money-touching agent.'}
            </Rule>
          </ul>
        </div>
      </div>
    </aside>
  )
}

function Fact({ k, v, wide }: { k: string; v: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <div className="text-faint">{k}</div>
      <div className="text-ink">{v}</div>
    </div>
  )
}
function MiniStat({ k, v, tone, last }: { k: string; v: string; tone?: 'ok' | 'warn'; last?: boolean }) {
  return (
    <div className={clsx('px-3 py-2', !last && 'border-r border-line')}>
      <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={clsx('tnum text-base font-semibold', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{v}</div>
    </div>
  )
}
function Rule({ children, ok, muted }: { children: React.ReactNode; ok?: boolean; muted?: boolean }) {
  return (
    <li className={clsx('flex gap-2', muted ? 'text-faint' : 'text-muted')}>
      <Check size={13} className={clsx('mt-[3px] shrink-0', ok ? 'text-ok' : 'text-faint')} />
      <span>{children}</span>
    </li>
  )
}
