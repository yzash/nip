import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '@/data/db'
import { Badge, Empty, Fresh, Id, Label, Panel, Td, Th } from '@/components/ui'
import { dateTime, num, time } from '@/lib/format'
import { useApp } from '@/store/app'
import { agentById, FAMILIES } from './stats'

const PAGE = 30

export function RunLog() {
  const D = db()
  const [, setParams] = useSearchParams()
  const audit = useApp((s) => s.audit)
  const [agent, setAgent] = useState<string>('all')
  const [family, setFamily] = useState<string>('all')
  const [overOnly, setOverOnly] = useState(false)
  const [page, setPage] = useState(0)

  const runs = useMemo(() => {
    return [...D.agentRuns]
      .filter((r) => {
        const a = agentById(r.agent_id)
        if (agent !== 'all' && r.agent_id !== agent) return false
        if (family !== 'all' && a?.family !== family) return false
        if (overOnly && r.overridden === 0) return false
        return true
      })
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [D.agentRuns, agent, family, overOnly])
  const pages = Math.max(1, Math.ceil(runs.length / PAGE))
  const p = Math.min(page, pages - 1)
  const slice = runs.slice(p * PAGE, p * PAGE + PAGE)
  const tot = runs.reduce((a, r) => ({ out: a.out + r.outputs, acc: a.acc + r.accepted, ovr: a.ovr + r.overridden, ign: a.ign + r.ignored }), { out: 0, acc: 0, ovr: 0, ign: 0 })
  const agentsInFamily = D.agents.filter((a) => family === 'all' || a.family === family)
  const openAgent = (id: string) => setParams(new URLSearchParams({ tab: 'registry', agent: id }))

  return (
    <div className="mx-auto grid max-w-[1600px] gap-4 p-5 2xl:grid-cols-[1fr_520px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-end gap-4 border border-line bg-panel px-4 py-3">
          <div>
            <Label className="mb-1">Family</Label>
            <select
              value={family}
              onChange={(e) => {
                setFamily(e.target.value)
                setAgent('all')
                setPage(0)
              }}
              className="h-7 border border-line2 bg-panel2 px-2 text-sm"
            >
              <option value="all">All families</option>
              {FAMILIES.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1">Agent</Label>
            <select
              value={agent}
              onChange={(e) => {
                setAgent(e.target.value)
                setPage(0)
              }}
              className="h-7 min-w-[260px] border border-line2 bg-panel2 px-2 text-sm"
            >
              <option value="all">All agents ({agentsInFamily.length})</option>
              {agentsInFamily.map((a) => (
                <option key={a.agent_id} value={a.agent_id}>
                  {a.agent_id} · {a.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex h-7 cursor-pointer items-center gap-2 border border-line2 px-2.5 text-xs font-semibold text-muted hover:text-ink">
            <input
              type="checkbox"
              checked={overOnly}
              onChange={(e) => {
                setOverOnly(e.target.checked)
                setPage(0)
              }}
              className="accent-[#FFD100]"
            />
            Overridden only
          </label>
          <div className="ml-auto flex gap-5 text-right">
            <Tot k="Runs" v={num(runs.length)} />
            <Tot k="Issued" v={num(tot.out)} />
            <Tot k="Accepted" v={`${tot.out ? Math.round((tot.acc / tot.out) * 100) : 0}%`} c="text-ok" />
            <Tot k="Overridden" v={`${tot.out ? Math.round((tot.ovr / tot.out) * 100) : 0}%`} c="text-warn" />
            <Tot k="Ignored" v={`${tot.out ? Math.round((tot.ign / tot.out) * 100) : 0}%`} />
          </div>
        </div>

        <Panel
          pad={false}
          title={
            <span>
              Run log <span className="font-normal text-faint">· every recommendation issued, accepted, overridden or ignored, with reasons</span>
            </span>
          }
          right={<Fresh f="live" />}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px]">
              <thead>
                <tr>
                  <Th>Run</Th>
                  <Th>Timestamp</Th>
                  <Th>Agent</Th>
                  <Th className="text-right">Issued</Th>
                  <Th className="text-right">Accepted</Th>
                  <Th className="text-right">Overridden</Th>
                  <Th className="text-right">Ignored</Th>
                  <Th className="w-[120px]">Mix</Th>
                  <Th>Override reason</Th>
                  <Th className="text-right">Duration</Th>
                </tr>
              </thead>
              <tbody>
                {slice.map((r) => {
                  const a = agentById(r.agent_id)
                  return (
                    <tr key={r.run_id} className="hover:bg-panel2">
                      <Td>
                        <Id>{r.run_id}</Id>
                      </Td>
                      <Td className="tnum text-muted">{dateTime(r.timestamp)}</Td>
                      <Td>
                        <button onClick={() => openAgent(r.agent_id)} className="text-left hover:text-ioh-yellow">
                          {a?.name ?? r.agent_id}
                        </button>
                        <span className="ml-1.5 font-mono text-[10.5px] text-faint">{a?.family === 'DevX proposed' ? 'DevX' : a?.family}</span>
                      </Td>
                      <Td className="tnum text-right">{r.outputs}</Td>
                      <Td className="tnum text-right text-ok">{r.accepted}</Td>
                      <Td className={clsx('tnum text-right', r.overridden ? 'text-warn' : 'text-faint')}>{r.overridden}</Td>
                      <Td className="tnum text-right text-muted">{r.ignored}</Td>
                      <Td>
                        <div className="flex h-2 w-full bg-line">
                          <div className="bg-ok" style={{ width: `${(r.accepted / Math.max(1, r.outputs)) * 100}%` }} />
                          <div className="bg-warn" style={{ width: `${(r.overridden / Math.max(1, r.outputs)) * 100}%` }} />
                        </div>
                      </Td>
                      <Td className="max-w-[230px] truncate text-xs text-muted" title={r.override_reason ?? ''}>
                        {r.override_reason && r.overridden > 0 ? r.override_reason : <span className="text-faint">—</span>}
                      </Td>
                      <Td className="tnum text-right text-muted">{r.duration_s >= 60 ? `${Math.floor(r.duration_s / 60)} m ${r.duration_s % 60} s` : `${r.duration_s} s`}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {runs.length === 0 && <Empty>No runs match these filters.</Empty>}
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-muted">
            <span className="tnum">
              {runs.length ? `${num(p * PAGE + 1)}–${num(Math.min(runs.length, (p + 1) * PAGE))} of ${num(runs.length)} runs` : '0 runs'} · last 14 days
            </span>
            <div className="flex items-center gap-1">
              <button disabled={p === 0} onClick={() => setPage(p - 1)} className="flex h-7 w-7 items-center justify-center border border-line2 disabled:opacity-30" aria-label="Previous page">
                <ChevronLeft size={14} />
              </button>
              <span className="tnum px-2">
                Page {p + 1} / {pages}
              </span>
              <button disabled={p >= pages - 1} onClick={() => setPage(p + 1)} className="flex h-7 w-7 items-center justify-center border border-line2 disabled:opacity-30" aria-label="Next page">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Panel>
      </div>

      <AuditLog audit={audit} />
    </div>
  )
}

function Tot({ k, v, c }: { k: string; v: string; c?: string }) {
  return (
    <div>
      <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={clsx('tnum text-base font-semibold', c ?? 'text-ink')}>{v}</div>
    </div>
  )
}

function actionTone(action: string): 'ok' | 'bad' | 'warn' | 'yellow' | 'neutral' | 'blue' {
  const a = action.toLowerCase()
  if (a.includes('reject') || a.includes('false positive')) return 'bad'
  if (a.includes('approv') || a.includes('released') || a.includes('confirmed') || a.includes('evidence')) return 'ok'
  if (a.includes('defer') || a.includes('escalat') || a.includes('moved')) return 'warn'
  if (a.includes('policy') || a.includes('export')) return 'yellow'
  if (a.includes('created') || a.includes('submitted') || a.includes('dispatch')) return 'blue'
  return 'neutral'
}

function AuditLog({ audit }: { audit: ReturnType<typeof useApp.getState>['audit'] }) {
  return (
    <Panel
      pad={false}
      className="self-start"
      title={
        <span>
          Human decision audit log <span className="font-normal text-faint">· this session</span>
        </span>
      }
      right={
        <span className="flex items-center gap-2 text-xs text-faint">
          {audit.length} entries <Fresh f="live" />
        </span>
      }
    >
      {audit.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <div className="text-sm font-semibold text-muted">No human decisions recorded yet in this session</div>
          <p className="mx-auto mt-1.5 max-w-[380px] text-xs leading-5 text-faint">
            Every recommendation, approval, override and execution taken in the demo (approving an incident, submitting a plan, releasing a PO, closing a work order, changing a threshold)
            appears here with the actor, role, reason code and timestamp. In the target state the audit log is retained for 5 years (PRD §5).
          </p>
        </div>
      ) : (
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
          {audit.map((e) => (
            <div key={e.id} className="border-b border-line/70 px-4 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Badge tone={actionTone(e.action)}>{e.action}</Badge>
                  <Id>{e.object}</Id>
                </div>
                <span className="tnum shrink-0 text-xs text-faint">{time(e.ts)}</span>
              </div>
              <div className="mt-1 text-xs text-muted">
                <span className="font-mono text-[10.5px] text-faint">{e.role}</span> <span className="text-ink">{e.actor}</span>
                {e.detail && <span> · {e.detail}</span>}
              </div>
              {e.reason && <div className="mt-0.5 text-xs text-warn">Reason: {e.reason}</div>}
            </div>
          ))}
          <div className="px-4 py-2 text-2xs text-faint">
            <span className="font-mono">{audit[audit.length - 1]?.id}</span> → <span className="font-mono">{audit[0]?.id}</span> · retained 5 years in target state · append-only
          </div>
        </div>
      )}
    </Panel>
  )
}
