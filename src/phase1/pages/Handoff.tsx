import clsx from 'clsx'
import { Braces, Check, Download, Loader2, Send, Table2, UserRound } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { RoleCode } from '@/data/types'
import { Badge, Button, Empty, Fresh, Id, Kpi } from '@/components/ui'
import { dateTime, idr, num } from '@/lib/format'
import { roleDef, useApp } from '@/store/app'
import { HANDOFFS } from '../content/golive'
import { HANDOFF_TARGETS, type P1Plan } from '../model'
import { requiredHandoffs, useP1Store } from '../store'
import { buildPayload, type Cell } from './plans/payloads'
import { StatusBadge, download, handoffProgress, toCsv } from './plans/shared'

const SENDER: Record<string, RoleCode> = { 'HO-ERP': 'PROC', 'HO-WMS': 'PROC', 'HO-BOQ': 'DEPLOY', 'HO-VENDOR': 'DEPLOY', 'HO-TOWERCO': 'DEPLOY' }
const SHORT: Record<string, string> = { 'HO-ERP': 'ERP · PO draft', 'HO-BOQ': 'PMO · BOQ', 'HO-VENDOR': 'Vendor portal', 'HO-TOWERCO': 'Tower company', 'HO-WMS': 'WMS · reservation' }

function notRequiredWhy(p: P1Plan, t: string) {
  if (t === 'HO-VENDOR') return 'Non-CapEx: field teams, no rollout vendor allocation'
  if (t === 'HO-TOWERCO') return p.draft.tower_companies.length ? `${p.draft.intervention_label} does not change tower loading` : 'IOH-owned structures'
  return 'Not required'
}

export function HandoffPage() {
  const plans = useP1Store((s) => s.plans)
  const sendHandoff = useP1Store((s) => s.sendHandoff)
  const role = useApp((s) => s.role)
  const toast = useApp((s) => s.toast)
  const [sp, setSp] = useSearchParams()
  const rows = useMemo(() => plans.filter((p) => p.status === 'approved' || p.status === 'handed_off').sort((a, b) => Number(a.status === 'handed_off') - Number(b.status === 'handed_off') || b.id.localeCompare(a.id)), [plans])
  const selId = sp.get('plan') && rows.some((p) => p.id === sp.get('plan')) ? sp.get('plan')! : rows[0]?.id
  const sel = rows.find((p) => p.id === selId)
  const [target, setTarget] = useState<string>('HO-ERP')
  const [view, setView] = useState<'table' | 'json'>('table')
  useEffect(() => {
    if (sel && !requiredHandoffs(sel).includes(target)) setTarget('HO-ERP')
  }, [sel, target])

  const handed = plans.filter((p) => p.status === 'handed_off')
  const awaiting = plans.filter((p) => p.status === 'approved')
  const acks = rows.reduce((s, p) => s + handoffProgress(p).ack, 0)
  const reqTotal = rows.reduce((s, p) => s + handoffProgress(p).req.length, 0)
  const fieldsCarried = rows.reduce((s, p) => s + requiredHandoffs(p).filter((t) => p.handoffs[t]?.state === 'acknowledged').reduce((a, t) => { const pl = buildPayload(p, t); return a + pl.rows.length * pl.columns.length }, 0), 0)

  const send = (p: P1Plan, t: string) => {
    sendHandoff(p.id, t)
    toast(`${p.id} → ${HANDOFFS.find((h) => h.id === t)!.target}: sent, awaiting acknowledgement`, 'info')
  }
  const mineToSend = sel ? requiredHandoffs(sel).filter((t) => SENDER[t] === role && (sel.handoffs[t]?.state ?? 'not_sent') === 'not_sent') : []

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Step 5 · Hand-off</div>
        <h1 className="mt-1 text-[22px] font-semibold leading-7">
          {handed.length} plan{handed.length === 1 ? '' : 's'} handed off without re-keying · {awaiting.length} awaiting hand-off
        </h1>
        <p className="mt-1.5 max-w-[960px] text-sm text-muted">Phase 1 ends here. The approved plan goes out as drafts: PO lines to ERP, BOQ to the Deployment PMO, reservations to WMS, the allocation proposal to the vendor portal and the access request to tower companies. Each system returns a reference; execution stays in IOH’s existing tools.</p>

        <div className="mt-5 grid grid-cols-4 border border-line bg-panel">
          <Kpi className="border-r" label="Awaiting hand-off" fresh="live" tone={awaiting.length ? 'yellow' : undefined} value={num(awaiting.length)} sub={idr(awaiting.reduce((s, p) => s + p.draft.capex_total_idr, 0))} />
          <Kpi className="border-r" label="Handed off" fresh="live" tone="ok" value={num(handed.length)} sub={idr(handed.reduce((s, p) => s + p.draft.capex_total_idr, 0))} />
          <Kpi className="border-r" label="Acknowledged" fresh="live" value={`${acks} of ${reqTotal}`} sub="required hand-offs with a reference" />
          <Kpi label="Fields carried, 0 re-keyed" fresh="live" value={num(fieldsCarried)} sub="EC6: accepted by ERP without re-keying" />
        </div>

        {/* matrix */}
        <section className="mt-5 border border-line bg-panel">
          <header className="flex h-10 items-center justify-between border-b border-line px-4">
            <h3 className="text-sm font-semibold">Plans × target systems</h3>
            <div className="flex items-center gap-3 text-[10.5px] text-faint">
              <Legend c="bg-ok" l="Acknowledged" />
              <Legend c="bg-ioh-yellow" l="Sent" />
              <Legend c="border border-line2 bg-line" l="Not sent" />
              <Legend c="border border-dashed border-line2" l="Not required" />
              <Legend c="bg-bad" l="Failed" />
            </div>
          </header>
          {rows.length === 0 ? (
            <Empty>No approved plans yet. Approved plans appear here for Procurement and Deployment to hand off.</Empty>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                  <th className="h-8 border-b border-line px-4 font-semibold">Plan</th>
                  <th className="h-8 border-b border-line px-2 font-semibold">Status</th>
                  {HANDOFF_TARGETS.map((t) => (
                    <th key={t} className="h-8 border-b border-line px-2 font-semibold">
                      {SHORT[t]}
                    </th>
                  ))}
                  <th className="h-8 border-b border-line px-4 text-right font-semibold">Progress</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const req = requiredHandoffs(p)
                  const pr = handoffProgress(p)
                  return (
                    <tr key={p.id} onClick={() => setSp({ plan: p.id })} className={clsx('cursor-pointer border-b border-line/60', p.id === selId ? 'bg-panel2' : 'hover:bg-panel2')}>
                      <td className={clsx('relative px-4 py-2', p.id === selId && 'before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ioh-yellow')}>
                        <div className="flex items-center gap-2">
                          <Id className="text-ink">{p.id}</Id>
                          <span className="max-w-[260px] truncate text-[12.5px] font-medium">{p.name}</span>
                        </div>
                        <div className="tnum text-[11px] text-faint">
                          {idr(p.draft.capex_total_idr)} · approved by {p.decided_by ?? p.history.find((h) => h.what === 'Approved')?.who ?? p.route.label}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <StatusBadge s={p.status} />
                      </td>
                      {HANDOFF_TARGETS.map((t) => {
                        const h = p.handoffs[t]
                        const st = !req.includes(t) ? 'na' : h?.state ?? 'not_sent'
                        return (
                          <td key={t} className="px-2 py-2">
                            {st === 'na' ? (
                              <span className="text-[11px] text-faint">not required</span>
                            ) : st === 'acknowledged' ? (
                              <span className="flex items-center gap-1.5 font-mono text-[11.5px] text-ok">
                                <Check size={12} /> {h?.ref}
                              </span>
                            ) : st === 'sent' ? (
                              <span className="flex items-center gap-1.5 text-[11.5px] text-ioh-yellow">
                                <Loader2 size={12} className="animate-spin" /> sent
                              </span>
                            ) : st === 'failed' ? (
                              <Badge tone="bad">Failed</Badge>
                            ) : (
                              <span className="text-[11.5px] text-muted">not sent</span>
                            )}
                          </td>
                        )
                      })}
                      <td className="px-4 py-2 text-right">
                        <div className="tnum text-[12.5px] font-semibold">
                          {pr.ack} of {pr.req.length}
                        </div>
                        <div className="ml-auto mt-1 h-1 w-20 bg-line">
                          <div className="h-full bg-ok" style={{ width: `${(pr.ack / pr.req.length) * 100}%` }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>

        {sel && (
          <div className="mt-5 grid grid-cols-[340px_minmax(0,1fr)] gap-5">
            {/* targets */}
            <section className="self-start border border-line bg-panel">
              <header className="flex h-10 items-center justify-between border-b border-line px-4">
                <h3 className="truncate text-sm font-semibold">
                  <Id className="text-ink">{sel.id}</Id> · targets
                </h3>
                {mineToSend.length > 1 && (
                  <Button size="sm" variant="primary" onClick={() => mineToSend.forEach((t) => send(sel, t))}>
                    <Send size={12} /> Send my {mineToSend.length}
                  </Button>
                )}
              </header>
              {HANDOFFS.map((h) => {
                const req = requiredHandoffs(sel).includes(h.id)
                const s = sel.handoffs[h.id]
                const st = !req ? 'na' : s?.state ?? 'not_sent'
                return (
                  <button key={h.id} disabled={!req} onClick={() => setTarget(h.id)} className={clsx('relative block w-full border-b border-line/70 px-4 py-2.5 text-left', !req ? 'cursor-default opacity-60' : target === h.id ? 'bg-panel2 before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-ioh-yellow' : 'hover:bg-panel2')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-semibold">{h.target}</span>
                      <span className="shrink-0 whitespace-nowrap">{st === 'acknowledged' ? <span className="font-mono text-[11px] text-ok">{s?.ref}</span> : st === 'sent' ? <Badge tone="yellow">Sent</Badge> : st === 'na' ? <span className="text-[10.5px] text-faint">n/a</span> : <span className="text-[11px] text-muted">not sent</span>}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-faint">{req ? `${h.owner} · sent by ${roleDef(SENDER[h.id]).user} (${SENDER[h.id]})` : notRequiredWhy(sel, h.id)}</div>
                  </button>
                )
              })}
              <div className="px-4 py-2 text-[11px] leading-4 text-faint">
                Plan becomes <b className="text-muted">handed off</b> when every required target acknowledges. <Link to={`/phase1/plans/${sel.id}`} className="text-muted hover:text-ink">Open plan →</Link>
              </div>
            </section>

            <PayloadView p={sel} target={target} view={view} setView={setView} role={role} onSend={() => send(sel, target)} />
          </div>
        )}
      </div>
    </div>
  )
}

function Legend({ c, l }: { c: string; l: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={clsx('h-2 w-2', c)} /> {l}
    </span>
  )
}

function fmt(v: Cell, numeric: boolean) {
  if (v === null || v === undefined) return '—'
  if (Array.isArray(v)) return v.length > 4 ? `${v.slice(0, 4).join(', ')} +${v.length - 4}` : v.join(', ')
  if (numeric && typeof v === 'number') return num(v)
  return String(v)
}

function PayloadView({ p, target, view, setView, role, onSend }: { p: P1Plan; target: string; view: 'table' | 'json'; setView: (v: 'table' | 'json') => void; role: RoleCode; onSend: () => void }) {
  const spec = HANDOFFS.find((h) => h.id === target)!
  const pl = useMemo(() => buildPayload(p, target), [p, target])
  const h = p.handoffs[target]
  const state = h?.state ?? 'not_sent'
  const sender = SENDER[target]
  const canSend = role === sender && state !== 'sent' && state !== 'acknowledged'
  const json = useMemo(() => JSON.stringify({ target, plan_id: p.id, generated_by: 'NICC Predictive Planner', draft_only: true, rows: pl.rows }, null, 2), [pl, p.id, target])
  const shown = pl.rows.slice(0, 28)
  const base = `${p.id}_${target.replace('HO-', '').toLowerCase()}`
  return (
    <section className="min-w-0 border border-line bg-panel">
      <header className="flex h-10 items-center justify-between gap-3 border-b border-line px-4">
        <h3 className="truncate text-sm font-semibold">
          Payload preview · {spec.target}
        </h3>
        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex border border-line2">
            <button onClick={() => setView('table')} className={clsx('flex h-7 items-center gap-1 px-2 text-xs font-semibold', view === 'table' ? 'bg-ioh-yellow text-canvas' : 'text-muted hover:text-ink')}>
              <Table2 size={12} /> Table
            </button>
            <button onClick={() => setView('json')} className={clsx('flex h-7 items-center gap-1 px-2 text-xs font-semibold', view === 'json' ? 'bg-ioh-yellow text-canvas' : 'text-muted hover:text-ink')}>
              <Braces size={12} /> JSON
            </button>
          </div>
          <Button size="sm" onClick={() => download(`${base}.csv`, toCsv(pl.columns, pl.rows), 'text/csv')}>
            <Download size={12} /> CSV
          </Button>
          <Button size="sm" onClick={() => download(`${base}.json`, json, 'application/json')}>
            <Download size={12} /> JSON
          </Button>
        </div>
      </header>
      <div className="grid grid-cols-4 border-b border-line">
        {[
          { l: 'Owner', v: spec.owner },
          { l: 'Method', v: spec.method },
          { l: 'Trigger', v: spec.trigger },
          { l: 'Acknowledgement', v: spec.ack },
        ].map((x, k) => (
          <div key={x.l} className={clsx('px-4 py-2', k < 3 && 'border-r border-line')}>
            <div className="text-2xs uppercase tracking-wider text-faint">{x.l}</div>
            <div className="text-[12px] leading-4 text-muted">{x.v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-line px-4 py-2">
        {pl.header.map((x) => (
          <span key={x.label} className="text-[12px]">
            <span className="text-faint">{x.label}</span> <span className="tnum font-semibold">{x.value}</span>
          </span>
        ))}
      </div>
      {view === 'table' ? (
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr>
                {pl.columns.map((c) => (
                  <th key={c} className={clsx('h-8 whitespace-nowrap border-b border-line px-3 font-mono text-[10.5px] font-semibold text-faint', pl.numeric.includes(c) ? 'text-right' : 'text-left')}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, k) => (
                <tr key={k} className="hover:bg-panel2">
                  {pl.columns.map((c) => (
                    <td key={c} className={clsx('h-8 whitespace-nowrap border-b border-line/60 px-3 text-[12px]', pl.numeric.includes(c) ? 'tnum text-right' : '', /_id$|code|wbs|cost_centre|sku|warehouse/.test(c) ? 'font-mono text-[11.5px] text-muted' : '')}>
                      {fmt(r[c], pl.numeric.includes(c))}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {pl.rows.length > shown.length && <div className="px-4 py-2 text-[11px] text-faint">+{pl.rows.length - shown.length} more rows in the download ({pl.rows.length} total)</div>}
        </div>
      ) : (
        <pre className="max-h-[440px] overflow-auto bg-canvas/60 px-4 py-3 font-mono text-[11px] leading-[16px] text-muted">{json}</pre>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5">
        <div className="text-[11px] text-faint">
          {state === 'acknowledged' ? (
            <span className="text-ok">
              Acknowledged · reference <span className="font-mono">{h?.ref}</span> · {h?.ts ? dateTime(h.ts) : ''} <Fresh f="live" className="ml-1" />
            </span>
          ) : state === 'sent' ? (
            <span className="text-ioh-yellow">Sent · waiting for {spec.ack.split(';')[0].toLowerCase()}</span>
          ) : (
            <>
              {pl.rows.length} rows × {pl.columns.length} fields, generated from the approved plan. Draft only: nothing posts or commits until the owner acts in the target system.
            </>
          )}
        </div>
        {state === 'acknowledged' ? null : canSend ? (
          <Button variant="primary" onClick={onSend}>
            <Send size={13} /> Send to {SHORT[target]}
          </Button>
        ) : state === 'sent' ? (
          <Button disabled>
            <Loader2 size={13} className="animate-spin" /> Sending
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button disabled title={`Sent by ${roleDef(sender).title}`}>
              <Send size={13} /> Sent by {sender}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => useApp.getState().setRole(sender)} title="Presenter shortcut">
              <UserRound size={12} /> Switch to {sender}
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}
