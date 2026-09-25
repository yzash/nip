import clsx from 'clsx'
import { ArrowDown, ArrowUp, Filter, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '@/data/db'
import type { Incident, Insight } from '@/data/types'
import { Badge, Drawer, Fresh, Id, Seg, Td, Th } from '@/components/ui'
import { CLASS_LABEL, STATUS_LABEL, ago, countdown, idr, num } from '@/lib/format'
import { incidentMatchesRole, isOpen, roleFilterLabel } from '@/lib/metrics'
import { canApprove, routeOption } from '@/lib/policy'
import { allInsights, nowIso, useApp, usePolicy, useRole, useScope } from '@/store/app'
import { IncidentDetail } from './IncidentDetail'

type SortKey = 'priority' | 'exposure' | 'churn' | 'due' | 'probability' | 'sla' | 'sites'

const FAMILY: Record<string, string> = {}
for (const a of [
  ['Sense', 'Site Health Agent', 'CNX Agent', 'CX Agent', 'Bad Session Agent', 'Backbone and Transport Agent', 'CDN Peering Agent', 'Energy and Power Agent'],
  ['Predict', 'Site Failure Prediction Agent', 'Capacity Exhaustion Agent', 'Churn Exposure Agent', 'Revenue Exposure Agent'],
  ['Decide', 'Smart CapEx Agent', 'Action Ladder Agent', 'Program Match Agent', 'Priority Scoring Agent', 'Approval Routing Agent', 'Spectrum and Refarming Agent'],
  ['Execute', 'BOQ Agent', 'Procurement Agent', 'Warehouse Readiness Agent', 'Vendor Allocation Agent', 'Work Order Agent', 'Dispatch Agent', 'RFS Acceptance Agent', 'Customer Outreach Agent', 'Tower Company Coordination Agent', 'Site Access and Permit Agent'],
  ['Validate', 'Post-RFS Validation Agent', 'ROI Attribution Agent', 'Model Drift Agent', 'Override Learning Agent'],
  ['Orchestrate', 'Incident Orchestrator', 'Program Orchestrator', 'Narrative Agent'],
])
  for (const n of a.slice(1)) FAMILY[n] = a[0]

export function IncidentsPage() {
  const [params, setParams] = useSearchParams()
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const incidents = useApp((s) => s.incidents)
  const workOrders = useApp((s) => s.workOrders)
  const sessionInsights = useApp((s) => s.sessionInsights)
  const [showAll, setShowAll] = useState(false)
  const [statusF, setStatusF] = useState<'open' | 'mine' | 'all'>('open')
  const [classF, setClassF] = useState<string>('all')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null)
  const selectedId = params.get('incident')
  const selected = incidents.find((x) => x.incident_id === selectedId) ?? null
  const D = db()

  const defaultSort: SortKey = role.queue_order === 'exposure' ? 'exposure' : role.queue_order === 'churn' ? 'churn' : role.queue_order === 'due' ? 'sla' : 'priority'
  const activeSort = sort ?? { key: defaultSort, dir: -1 as const }

  const roleMatches = useMemo(() => incidents.filter((x) => incidentMatchesRole(x, role, scope, policy, workOrders)), [incidents, role, scope, policy, workOrders])
  const mine = (x: Incident) => {
    if (x.pending_customer_action && role.role_code === 'CX') return true
    if (x.status !== 'Pending_approval') return false
    const rec = D.optionsByIncident.get(x.incident_id)?.find((o) => o.rank === x.recommended_rank)
    if (!rec) return false
    const r = routeOption(rec, x, policy)
    return !r.auto && canApprove(role, r, x, scope)
  }
  const rows = useMemo(() => {
    let r = showAll ? incidents : roleMatches
    if (statusF === 'open') r = r.filter(isOpen)
    if (statusF === 'mine') r = r.filter(mine)
    if (classF !== 'all') r = r.filter((x) => x.class === classF)
    if (q) {
      const t = q.toLowerCase()
      r = r.filter((x) => x.incident_id.toLowerCase().includes(t) || x.title.toLowerCase().includes(t) || x.site_ids.some((s) => s.toLowerCase().includes(t)))
    }
    const val = (x: Incident): number => {
      switch (activeSort.key) {
        case 'priority':
          return x.priority_score
        case 'exposure':
          return x.exposure_idr
        case 'churn':
          return x.churn_risk_subs
        case 'probability':
          return x.probability
        case 'sites':
          return x.site_ids.length
        case 'sla':
        case 'due':
          return -new Date(x.sla_due).getTime()
      }
    }
    return [...r].sort((a, b) => (activeSort.dir === -1 ? val(b) - val(a) : val(a) - val(b)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, roleMatches, showAll, statusF, classF, q, activeSort, role, scope, policy])

  const openCount = (showAll ? incidents : roleMatches).filter(isOpen).length
  const mineCount = incidents.filter(mine).length
  const classes = useMemo(() => [...new Set(incidents.map((x) => x.class))], [incidents])

  const select = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('incident', id)
    else p.delete('incident')
    setParams(p)
  }
  const sortBy = (key: SortKey) => setSort((s) => ({ key, dir: s?.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))
  const SortIcon = ({ k }: { k: SortKey }) => (activeSort.key === k ? activeSort.dir === -1 ? <ArrowDown size={11} className="inline" /> : <ArrowUp size={11} className="inline" /> : null)

  return (
    <div className="absolute inset-0 flex">
      <Feed insights={allInsights(sessionInsights)} incidents={incidents} onPick={select} />
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-line px-4 py-2.5">
          <div className="flex items-center gap-3">
            <div>
              <div className="text-base font-semibold">Incident queue</div>
              <div className="text-xs text-muted">Ranked by {activeSort.key === 'priority' ? 'priority score = revenue exposure × probability × urgency' : activeSort.key === 'exposure' ? 'revenue exposure' : activeSort.key === 'churn' ? 'churn-risk cohort size' : activeSort.key === 'sla' ? 'SLA due' : activeSort.key}</div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <div className="relative w-64">
                <Search size={13} className="absolute left-2.5 top-2 text-faint" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Incident, title or site" className="h-8 w-full border border-line2 bg-panel2 pl-8 pr-2 text-sm placeholder:text-faint" />
              </div>
              <select value={classF} onChange={(e) => setClassF(e.target.value)} className="h-8 border border-line2 bg-panel2 px-2 text-xs">
                <option value="all">All classes</option>
                {classes.map((c) => (
                  <option key={c} value={c}>
                    {CLASS_LABEL[c]}
                  </option>
                ))}
              </select>
              <Seg
                options={[
                  { id: 'open', label: `Open ${openCount}` },
                  { id: 'mine', label: `Awaiting me ${mineCount}` },
                  { id: 'all', label: 'All' },
                ]}
                value={statusF}
                onChange={setStatusF}
              />
            </div>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <Filter size={12} className="text-faint" />
            <span className="text-faint">Role lens:</span>
            <button onClick={() => setShowAll(false)} className={clsx('h-6 border px-2', !showAll ? 'border-ioh-yellow bg-ioh-yellow/10 text-ioh-yellow' : 'border-line2 text-muted')}>
              {roleFilterLabel(role, scope, policy)} · {roleMatches.filter((x) => statusF !== 'open' || isOpen(x)).length}
            </button>
            <button onClick={() => setShowAll(true)} className={clsx('h-6 border px-2', showAll ? 'border-ioh-yellow bg-ioh-yellow/10 text-ioh-yellow' : 'border-line2 text-muted')}>
              Show all · {incidents.filter((x) => statusF !== 'open' || isOpen(x)).length}
            </button>
            <span className="ml-2 text-faint">Nothing is hidden: the lens changes scope and order, not access.</span>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Incident</Th>
                <Th>Title</Th>
                <Th onClick={() => sortBy('sites')} className="text-right">
                  Sites <SortIcon k="sites" />
                </Th>
                <Th>Province</Th>
                <Th>Owner</Th>
                <Th>Status</Th>
                <Th onClick={() => sortBy('probability')} className="text-right">
                  p <SortIcon k="probability" />
                </Th>
                <Th onClick={() => sortBy('exposure')} className="text-right">
                  Exposure / mo <SortIcon k="exposure" />
                </Th>
                <Th onClick={() => sortBy('sla')}>
                  SLA <SortIcon k="sla" />
                </Th>
                <Th>Program</Th>
                <Th onClick={() => sortBy('priority')} className="text-right">
                  Priority <SortIcon k="priority" />
                </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => {
                const cd = countdown(x.sla_due, nowIso())
                const decisionOpen = ['Pending_approval', 'Enriched', 'Detected'].includes(x.status)
                return (
                  <tr key={x.incident_id} onClick={() => select(x.incident_id)} className={clsx('cursor-pointer', selectedId === x.incident_id ? 'bg-ioh-yellow/[0.07]' : 'hover:bg-panel2')}>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        {mine(x) && <span className="h-1.5 w-1.5 rounded-full bg-ioh-yellow" title="Awaiting your decision" />}
                        <Id>{x.incident_id}</Id>
                      </div>
                    </Td>
                    <Td className="max-w-[360px]">
                      <div className="truncate" title={x.title}>
                        {x.title}
                      </div>
                      <div className="text-[10.5px] text-faint">
                        {CLASS_LABEL[x.class]} · {x.source === 'prediction' ? `predicted W+${x.predicted_week}` : x.source === 'cx' ? 'CX signal' : 'alarm'}
                        {x.churn_risk_subs > 0 && ` · ${num(x.churn_risk_subs)} churn-risk`}
                      </div>
                    </Td>
                    <Td className="tnum text-right">{x.site_ids.length}</Td>
                    <Td className="text-muted">{D.provById[x.province_id]?.name}</Td>
                    <Td>
                      <span className="font-mono text-[11px]">{x.owner_role}</span>
                    </Td>
                    <Td>
                      <Badge tone={x.status === 'Pending_approval' ? 'warn' : x.status === 'In_program' ? 'prog' : x.status === 'Closed' || x.status === 'Rejected' ? 'neutral' : x.status === 'Approved' ? 'ok' : 'neutral'}>{STATUS_LABEL[x.status]}</Badge>
                    </Td>
                    <Td className="tnum text-right">{Math.round(x.probability * 100)}%</Td>
                    <Td className="tnum text-right">{idr(x.exposure_idr)}</Td>
                    <Td className={clsx('tnum', decisionOpen && cd.overdue ? 'text-bad' : 'text-muted')}>{decisionOpen ? cd.text : '—'}</Td>
                    <Td>
                      {x.program_match.program_id ? (
                        <span className={clsx('font-mono text-[11px]', x.program_match.verdict === 'covered' ? 'text-ok' : 'text-warn')}>{x.program_match.program_id}</span>
                      ) : (
                        <span className="text-[11px] text-bad">Not covered</span>
                      )}
                    </Td>
                    <Td className="tnum text-right font-semibold">{x.priority_score.toFixed(1)}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {rows.length === 0 && <div className="px-4 py-10 text-center text-sm text-faint">No incidents match. Try “Show all”.</div>}
          <div className="flex items-center gap-2 px-4 py-3 text-xs text-faint">
            <Fresh f="live" /> Incident Orchestrator groups signals into one incident per root cause after every Netra batch; predictions refresh daily (D-1).
          </div>
        </div>
        <Drawer open={!!selected} onClose={() => select(null)} width={680} title={selected ? <span className="font-mono text-xs text-muted">{selected.incident_id} · incident detail</span> : ''}>
          {selected && <IncidentDetail key={selected.incident_id} inc={selected} />}
        </Drawer>
      </div>
    </div>
  )
}

function Feed({ insights, incidents, onPick }: { insights: Insight[]; incidents: Incident[]; onPick: (id: string) => void }) {
  const [fam, setFam] = useState<string>('All')
  const [linked, setLinked] = useState(false)
  const now = nowIso()
  const incIds = useMemo(() => new Set(incidents.map((x) => x.incident_id)), [incidents])
  const list = useMemo(
    () => insights.filter((x) => (fam === 'All' || FAMILY[x.agent] === fam) && (!linked || (x.incident_id && incIds.has(x.incident_id)))).slice(0, 150),
    [insights, fam, linked, incIds],
  )
  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="shrink-0 border-b border-line px-3 py-2.5">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">Insight feed</div>
          <Fresh f="live" />
        </div>
        <div className="text-xs text-muted">Agents post what changed; the platform groups them into incidents.</div>
        <div className="mt-2 flex flex-wrap gap-1">
          {['All', 'Sense', 'Predict', 'Decide', 'Execute', 'Validate', 'Orchestrate'].map((f) => (
            <button key={f} onClick={() => setFam(f)} className={clsx('h-6 border px-1.5 text-[11px]', fam === f ? 'border-ioh-yellow text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}>
              {f}
            </button>
          ))}
        </div>
        <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
          <input type="checkbox" checked={linked} onChange={() => setLinked(!linked)} className="accent-[#FFD100]" /> Only insights grouped into incidents
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {list.map((x) => (
          <button key={x.insight_id} onClick={() => x.incident_id && onPick(x.incident_id)} className={clsx('block w-full border-b border-line px-3 py-2.5 text-left', x.incident_id ? 'hover:bg-panel2' : 'cursor-default')}>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="font-semibold text-ioh-yellow">{x.agent}</span>
              <span className="truncate text-faint">· {x.what_changed}</span>
              <span className="ml-auto shrink-0 text-faint">{ago(x.timestamp, now)}</span>
            </div>
            <div className="mt-0.5 text-[12.5px] leading-[17px] text-ink">{x.message}</div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10.5px] text-faint">
              <span>{x.scope.label}</span>
              {x.magnitude !== '—' && <span>· {x.magnitude}</span>}
              <span>· conf. {Math.round(x.confidence * 100)}%</span>
              {x.exposure_idr > 0 && <span className="text-ioh-yellow/80">· {idr(x.exposure_idr)}/mo</span>}
              <span>· → {x.suggested_function}</span>
            </div>
            {x.suggested_action && x.suggested_action !== 'None' && <div className="mt-0.5 text-[10.5px] text-muted">Suggested: {x.suggested_action}</div>}
            {x.incident_id && <div className="mt-0.5 font-mono text-[10px] text-faint">{x.incident_id}</div>}
          </button>
        ))}
      </div>
    </aside>
  )
}
