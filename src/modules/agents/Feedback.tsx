import clsx from 'clsx'
import { Download, Send } from 'lucide-react'
import { useMemo, useState } from 'react'
import { db } from '@/data/db'
import { Badge, Button, Empty, Fresh, Id, Label, Panel, Seg, Td, Th } from '@/components/ui'
import { dateTime, num } from '@/lib/format'
import { useApp } from '@/store/app'
import { agentById, agentByName } from './stats'

interface Labelled {
  record_id: string
  source: 'session' | 'historical'
  ts: string
  agent_id: string
  agent: string
  object: string
  recommended: string
  chosen: string
  reason: string
  count: number
  role: string | null
  label: 'override'
}

export function Feedback() {
  const D = db()
  const overrides = useApp((s) => s.overrides)
  const toast = useApp((s) => s.toast)
  const logAudit = useApp((s) => s.logAudit)
  const [view, setView] = useState<'all' | 'session' | 'historical'>('all')
  const [exported, setExported] = useState<{ n: number; ts: string; file: string } | null>(null)

  const session: Labelled[] = useMemo(
    () =>
      overrides.map((o) => {
        const a = agentByName(o.agent)
        return { record_id: o.id, source: 'session', ts: o.ts, agent_id: a?.agent_id ?? '—', agent: o.agent, object: o.object, recommended: o.recommended, chosen: o.chosen, reason: o.reason, count: 1, role: o.role, label: 'override' }
      }),
    [overrides],
  )
  const historical: Labelled[] = useMemo(
    () =>
      D.agentRuns
        .filter((r) => r.override_reason && r.overridden > 0)
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .map((r) => ({
          record_id: r.run_id,
          source: 'historical',
          ts: r.timestamp,
          agent_id: r.agent_id,
          agent: agentById(r.agent_id)?.name ?? r.agent_id,
          object: `${r.outputs} recommendations`,
          recommended: 'Agent recommendation',
          chosen: 'Overridden by approver',
          reason: r.override_reason!,
          count: r.overridden,
          role: null,
          label: 'override',
        })),
    [D.agentRuns],
  )
  const all = useMemo(() => [...session, ...historical], [session, historical])
  const rows = view === 'all' ? all : view === 'session' ? session : historical

  const byReason = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of all) m.set(r.reason.split(' — ')[0], (m.get(r.reason.split(' — ')[0]) ?? 0) + r.count)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [all])
  const byAgent = useMemo(() => {
    const m = new Map<string, { n: number; name: string; id: string }>()
    for (const r of all) {
      const x = m.get(r.agent) ?? { n: 0, name: r.agent, id: r.agent_id }
      x.n += r.count
      m.set(r.agent, x)
    }
    return [...m.values()].sort((a, b) => b.n - a.n).slice(0, 10)
  }, [all])
  const totalLabels = all.reduce((a, r) => a + r.count, 0)
  const rmax = Math.max(1, ...byReason.map((r) => r[1]))
  const amax = Math.max(1, ...byAgent.map((r) => r.n))

  const exportBatch = () => {
    const ts = D.meta.now
    const batch = {
      batch_id: `NETRA-FB-${ts.slice(0, 10).replace(/-/g, '')}-${String(overrides.length).padStart(3, '0')}`,
      exported_at: ts,
      destination: 'Netra feature store · model-owner feedback topic',
      schema: 'nicc.override.v1',
      note: 'Synthetic prototype data. Overrides and outcomes as labelled training signal for model owners (PRD §6 M7).',
      counts: { session: session.length, historical: historical.length, labels: totalLabels },
      outcomes_attached: { validation_sites: new Set(D.validation.map((v) => v.site_id)).size, avoided_outages: D.avoided.length },
      records: all,
    }
    const file = `${batch.batch_id}.json`
    try {
      const blob = new Blob([JSON.stringify(batch, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      /* download blocked: still record the export */
    }
    setExported({ n: all.length, ts, file })
    logAudit({ action: 'Override batch exported to Netra', object: batch.batch_id, detail: `${num(all.length)} records · ${num(totalLabels)} labels` })
    toast(`Exported ${num(all.length)} labelled records (${session.length} from this session) to Netra`)
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border border-line bg-panel px-5 py-4">
        <div className="min-w-0 max-w-[1000px]">
          <Label>Feedback loop · Override Learning Agent</Label>
          <div className="mt-1 text-[19px] font-semibold leading-7">
            Every override carries a reason code and goes back to Netra as labelled data: {num(totalLabels)} labels from {num(historical.length)} agent runs
            {session.length > 0 ? (
              <span className="text-ioh-yellow">
                {' '}
                + {session.length} from this session
              </span>
            ) : (
              ''
            )}
          </div>
          <div className="mt-1 text-sm text-muted">
            Top reason: <span className="text-ink">{byReason[0]?.[0]}</span> ({num(byReason[0]?.[1] ?? 0)}). Model owners use these with realised post-RFS outcomes to recalibrate: a high
            &quot;tower company constraint&quot; share tells Planning the ladder is ignoring loading limits, not that the prediction is wrong.
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Button variant="primary" onClick={exportBatch}>
            <Send size={13} /> Export batch to Netra
          </Button>
          <div className="text-right text-xs text-faint">
            {exported ? (
              <span className="flex items-center gap-1.5 text-ok">
                <Download size={12} /> {exported.file} · {num(exported.n)} records
              </span>
            ) : (
              <span>JSON, schema nicc.override.v1 · nightly 23:00 in target state</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Overrides by reason code" right={<Fresh f="live" />}>
          <div className="space-y-1.5">
            {byReason.map(([r, n]) => (
              <div key={r} className="flex items-center gap-3 text-sm">
                <span className="w-[260px] shrink-0 truncate text-muted">{r}</span>
                <div className="h-2 flex-1 bg-line">
                  <div className="h-full bg-warn" style={{ width: `${(n / rmax) * 100}%` }} />
                </div>
                <span className="tnum w-14 text-right">{num(n)}</span>
                <span className="tnum w-10 text-right text-xs text-faint">{Math.round((n / totalLabels) * 100)}%</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Overrides by agent · top 10" right={<Fresh f="live" />}>
          <div className="space-y-1.5">
            {byAgent.map((a) => (
              <div key={a.name} className="flex items-center gap-3 text-sm">
                <span className="w-[260px] shrink-0 truncate">
                  <span className="mr-1.5 font-mono text-[10.5px] text-faint">{a.id}</span>
                  <span className="text-muted">{a.name}</span>
                </span>
                <div className="h-2 flex-1 bg-line">
                  <div className="h-full bg-ioh-yellow" style={{ width: `${(a.n / amax) * 100}%` }} />
                </div>
                <span className="tnum w-14 text-right">{num(a.n)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel
        pad={false}
        title={
          <span>
            Labelled records <span className="font-normal text-faint">· {num(rows.length)} shown</span>
          </span>
        }
        right={
          <Seg
            options={[
              { id: 'all', label: `All ${num(all.length)}` },
              { id: 'session', label: `This session ${session.length}` },
              { id: 'historical', label: `Historical ${num(historical.length)}` },
            ]}
            value={view}
            onChange={setView}
          />
        }
      >
        {view === 'session' && session.length === 0 ? (
          <Empty>
            No overrides in this session yet. Rejecting an incident, choosing a different rung of the action ladder, closing a false positive or moving a site between CapEx and non-CapEx records an override
            here, with its reason code.
          </Empty>
        ) : (
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Record</Th>
                  <Th>When</Th>
                  <Th>Source</Th>
                  <Th>Agent</Th>
                  <Th>Object</Th>
                  <Th>Recommended → chosen</Th>
                  <Th>Reason code</Th>
                  <Th className="text-right">Labels</Th>
                  <Th>Role</Th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.record_id} className={clsx(r.source === 'session' && 'bg-ioh-yellow/[0.04]')}>
                    <Td>
                      <Id>{r.record_id}</Id>
                    </Td>
                    <Td className="tnum text-xs text-muted">{dateTime(r.ts)}</Td>
                    <Td>{r.source === 'session' ? <Badge tone="yellow">Session</Badge> : <Badge>Run log</Badge>}</Td>
                    <Td className="text-muted">{r.agent}</Td>
                    <Td>{r.source === 'session' ? <Id>{r.object}</Id> : <span className="text-xs text-faint">{r.object}</span>}</Td>
                    <Td className="max-w-[320px] truncate text-xs">
                      <span className="text-muted">{r.recommended}</span> <span className="text-faint">→</span> <span>{r.chosen}</span>
                    </Td>
                    <Td className="max-w-[300px] truncate text-xs text-warn" title={r.reason}>
                      {r.reason}
                    </Td>
                    <Td className="tnum text-right">{r.count}</Td>
                    <Td className="font-mono text-[11px] text-faint">{r.role ?? '—'}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && <div className="px-4 py-2 text-xs text-faint">Showing the latest 300 of {num(rows.length)}; the export includes all records.</div>}
          </div>
        )}
      </Panel>
    </div>
  )
}
