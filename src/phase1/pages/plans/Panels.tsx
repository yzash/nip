import clsx from 'clsx'
import { AlertTriangle, Check, ChevronDown, ChevronRight, CircleDot, Lock, ShieldCheck } from 'lucide-react'
import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { db } from '@/data/db'
import type { RoleCode } from '@/data/types'
import { Badge, Button, Fresh, Id, Seg } from '@/components/ui'
import { addDays, date, dateShort, dateTime, idr, num } from '@/lib/format'
import { crossingWeek } from '@/lib/metrics'
import { roleDef, useApp, usePolicy } from '@/store/app'
import { CLASS_META, useP1, type P1Plan } from '../../model'
import { requiredHandoffs, useP1Store } from '../../store'
import { AgentTag, DECISION_SLA_H, ageText, ceilingRemaining, contractId, day0, deliveryWarehouse, hoursBetween, lastDecision, matCode, nowTs, sitesByTowerco, towerLoad, vendorOptions, withVendor } from './shared'

export function Section({ title, right, children, className, pad }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={clsx('border border-line bg-panel', className)}>
      <header className="flex h-10 items-center justify-between gap-3 border-b border-line px-4">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </header>
      <div className={clsx(pad && 'p-4')}>{children}</div>
    </section>
  )
}

const th = 'h-8 whitespace-nowrap border-b border-line px-3 text-left text-2xs font-semibold uppercase tracking-wider text-faint'
const td = 'h-8 whitespace-nowrap border-b border-line/60 px-3 text-[12.5px]'

// ---- Approval route ------------------------------------------------------------------------

type Tone = 'ok' | 'warn' | 'bad' | 'yellow' | 'prog' | 'neutral' | 'faint'
const TONE_TXT: Record<Tone, string> = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', yellow: 'text-ioh-yellow', prog: 'text-[#B79CFF]', neutral: 'text-muted', faint: 'text-faint' }
const TONE_BG: Record<Tone, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad', yellow: 'bg-ioh-yellow', prog: 'bg-prog', neutral: 'bg-line2', faint: 'bg-line' }

function hoState(p: P1Plan, t: string, labelDone: string): { text: string; tone: Tone } {
  if (!requiredHandoffs(p).includes(t)) return { text: t === 'HO-VENDOR' ? 'Not required · field teams' : 'Not required · no loading change', tone: 'faint' }
  if (p.status !== 'approved' && p.status !== 'handed_off') return { text: 'After approval', tone: 'faint' }
  const h = p.handoffs[t]
  if (h?.state === 'acknowledged') return { text: `${labelDone} · ${h.ref}`, tone: 'ok' }
  if (h?.state === 'sent') return { text: 'Sent · awaiting acknowledgement', tone: 'yellow' }
  if (h?.state === 'failed') return { text: 'Hand-off failed', tone: 'bad' }
  return { text: 'Ready to hand off', tone: 'yellow' }
}

function decidedTs(p: P1Plan) {
  return p.decided ?? lastDecision(p)?.ts
}

export function chainStates(p: P1Plan) {
  const r = roleDef(p.route.role as RoleCode)
  return p.draft.approval_chain.map((g) => {
    let who = `${g.label}${g.role !== 'EXT' ? ` · ${roleDef(g.role as RoleCode)?.user ?? ''}` : ''}`
    let st: { text: string; tone: Tone }
    if (g.gate.startsWith('Stage 3')) {
      who = `${p.route.label} · ${r.user}${p.route.cosign ? ` + ${p.route.cosign}` : ''}`
      st =
        p.status === 'draft'
          ? { text: 'Not submitted', tone: 'neutral' }
          : p.status === 'pending_approval'
            ? { text: `Awaiting ${r.user}`, tone: 'warn' }
            : p.status === 'rejected'
              ? { text: `Rejected · ${p.decided_by}`, tone: 'bad' }
              : p.status === 'deferred'
                ? { text: `Deferred · ${p.decided_by}`, tone: 'prog' }
                : { text: `${p.route.auto ? 'Auto-approved' : 'Approved'}${decidedTs(p) ? ` · ${dateTime(decidedTs(p)!)}` : ''}`, tone: 'ok' }
    } else if (g.gate.startsWith('Stage 4')) st = { text: 'Auto-pass · variance 0.0% ≤ 10%', tone: 'ok' }
    else if (g.gate.startsWith('Stage 5')) st = hoState(p, 'HO-ERP', 'PO draft in ERP')
    else if (g.gate.startsWith('Stage 6b')) st = hoState(p, 'HO-TOWERCO', 'Request')
    else if (g.gate.startsWith('Stage 6')) st = hoState(p, 'HO-VENDOR', 'Proposal')
    else st = { text: 'Later · Program Console', tone: 'faint' }
    return { ...g, who, st }
  })
}

export function RoutePanel({ p }: { p: P1Plan }) {
  const policy = usePolicy()
  const r = roleDef(p.route.role as RoleCode)
  const sla = DECISION_SLA_H[p.route.role] ?? 48
  const waited = p.submitted ? hoursBetween(p.submitted, p.status === 'pending_approval' ? nowTs() : decidedTs(p) ?? nowTs()) : 0
  const chain = chainStates(p)
  return (
    <Section title="Approval route" right={<AgentTag id="AG-ROUTE" name="Approval Routing Agent" />}>
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-ioh-yellow/60 font-mono text-[11px] font-bold text-ioh-yellow">{p.route.role}</div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-5">{r.user}</div>
          <div className="text-xs text-muted">
            {p.route.label}
            {p.route.cosign && <span className="text-warn"> · co-sign {p.route.cosign}</span>}
          </div>
          <div className="mt-1 text-[11px] text-faint">
            {p.route.note || 'Default route'} · {p.route.auto ? 'auto-approve rule applies' : 'no auto-approve'}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xs uppercase tracking-wider text-faint">Decision SLA</div>
          <div className="tnum text-sm font-semibold">{sla} h</div>
          {p.submitted && (
            <div className={clsx('tnum text-[11px]', waited > sla ? 'text-bad' : 'text-muted')}>
              {p.status === 'pending_approval' ? `waiting ${ageText(waited)}` : `decided in ${ageText(waited)}`}
            </div>
          )}
        </div>
      </div>
      <div className="px-4 py-2">
        <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-faint">Stage gates</div>
        {chain.map((g, k) => (
          <div key={g.gate} className="relative flex gap-3 py-1.5">
            {k < chain.length - 1 && <div className="absolute bottom-[-6px] left-[4px] top-[18px] w-px bg-line2" />}
            <span className={clsx('mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full', TONE_BG[g.st.tone])} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12.5px] font-medium">{g.gate}</span>
                <span className={clsx('truncate text-right text-[11px] font-semibold', TONE_TXT[g.st.tone])}>{g.st.text}</span>
              </div>
              <div className="truncate text-[11px] text-faint">{g.who}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] leading-4 text-faint">
        DoA in force: minor CapEx above IDR {Math.round(policy.decision_threshold_idr / 1e6)}m → Head of Planning; major CapEx → Head of Network, CFO co-sign above IDR {(policy.cfo_cosign_above_idr / 1e9).toFixed(0)}bn; OpEx below IDR {Math.round(policy.opex_auto_approve_below_idr / 1e6)}m auto. Placeholders pending IOH’s DoA matrix.
      </div>
    </Section>
  )
}

// ---- BOQ ---------------------------------------------------------------------------------

export function BoqPanel({ p }: { p: P1Plan }) {
  const d = p.draft
  const D = db()
  const [view, setView] = useState<'sku' | 'site'>('sku')
  const [open, setOpen] = useState<string | null>(null)
  const n = d.site_ids.length
  const cats = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of d.boq) m.set(b.category, (m.get(b.category) ?? 0) + b.total_idr)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [d.boq])
  const perSite = d.capex_total_idr / n
  return (
    <Section
      title={
        <span>
          Bill of quantities · {d.boq.length} lines · {idr(d.capex_total_idr)}
        </span>
      }
      right={
        <>
          <Seg options={[{ id: 'sku', label: 'By SKU' }, { id: 'site', label: 'By site' }]} value={view} onChange={setView} />
          <AgentTag id="AG-BOQ" name="BOQ Agent" />
        </>
      }
    >
      {view === 'sku' ? (
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>SKU</th>
              <th className={th}>Description</th>
              <th className={th}>Category</th>
              <th className={clsx(th, 'text-right')}>Qty</th>
              <th className={clsx(th, 'text-right')}>Unit</th>
              <th className={clsx(th, 'text-right')}>Total</th>
              <th className={clsx(th, 'text-right')} title="Variance vs ERP price book">Var.</th>
            </tr>
          </thead>
          <tbody>
            {d.boq.map((b) => (
              <tr key={b.sku} className="hover:bg-panel2">
                <td className={td}>
                  <Id>{b.sku}</Id>
                </td>
                <td className={clsx(td, 'max-w-[260px] truncate')} title={b.description}>
                  {b.description}
                </td>
                <td className={clsx(td, 'text-muted')}>{b.category}</td>
                <td className={clsx(td, 'tnum text-right')}>{b.qty}</td>
                <td className={clsx(td, 'tnum text-right text-muted')}>{idr(b.unit_cost_idr, { digits: 1 })}</td>
                <td className={clsx(td, 'tnum text-right font-semibold')}>{idr(b.total_idr)}</td>
                <td className={clsx(td, 'tnum text-right text-ok')}>0.0%</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Site</th>
              <th className={th}>Name</th>
              <th className={th}>District</th>
              <th className={clsx(th, 'text-right')}>Lines</th>
              <th className={clsx(th, 'text-right')}>Site total</th>
            </tr>
          </thead>
          <tbody>
            {d.site_ids.map((id) => {
              const s = D.sites[D.siteIdx.get(id)!]
              const isOpen = open === id
              return (
                <Fragment key={id}>
                  <tr onClick={() => setOpen(isOpen ? null : id)} className="cursor-pointer hover:bg-panel2">
                    <td className={td}>
                      <span className="flex items-center gap-1.5">
                        {isOpen ? <ChevronDown size={13} className="text-faint" /> : <ChevronRight size={13} className="text-faint" />}
                        <Id>{id}</Id>
                      </span>
                    </td>
                    <td className={td}>{s.name}</td>
                    <td className={clsx(td, 'text-muted')}>{D.distById[s.district_id]?.name}</td>
                    <td className={clsx(td, 'tnum text-right')}>{d.boq.length}</td>
                    <td className={clsx(td, 'tnum text-right font-semibold')}>{idr(perSite)}</td>
                  </tr>
                  {isOpen &&
                    d.boq.map((b) => (
                      <tr key={b.sku} className="bg-canvas/40">
                        <td className={clsx(td, 'pl-9')}>
                          <Id>{b.sku}</Id>
                        </td>
                        <td className={clsx(td, 'text-muted')} colSpan={2}>
                          {b.description}
                        </td>
                        <td className={clsx(td, 'tnum text-right text-muted')}>{b.qty / n}</td>
                        <td className={clsx(td, 'tnum text-right text-muted')}>{idr((b.qty / n) * b.unit_cost_idr)}</td>
                      </tr>
                    ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-xs">
        {cats.map(([c, v]) => (
          <span key={c} className="tnum text-muted">
            {c} <b className="font-semibold text-ink">{idr(v)}</b> <span className="text-faint">{Math.round((v / d.capex_total_idr) * 100)}%</span>
          </span>
        ))}
        <span className="tnum ml-auto text-muted">
          {idr(perSite)} per site · price book <Fresh f="D-1" className="ml-0.5" />
        </span>
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] text-faint">Unit prices are the ERP price book, so variance is 0.0% on the draft; Stage 4 routes to the Deployment lead only if edits move a line more than 10%.</div>
    </Section>
  )
}

// ---- Stock readiness ----------------------------------------------------------------------

const NOUN: Record<string, string> = {
  'ANT-MB-4T4R': 'multi-band antennas',
  'ANT-MB-8T8R': '8T8R antennas',
  'AAU-64T-N21': '5G AAUs',
  'RRU-4T-L18': 'L1800 RRUs',
  'RRU-4T-L21': 'L2100 RRUs',
  'RRU-2T-L09': 'L900 RRUs',
  'BBU-CAP-BRD': 'baseband boards',
  'BBU-MAIN': 'BBU main units',
  'BAT-LI-100': '100Ah Li-ion batteries',
  'BAT-LI-200': '200Ah Li-ion batteries',
  'RECT-MOD-3K': 'rectifier modules',
  'SOL-PNL-5K': 'solar arrays',
  'MW-ODU-E': 'E-band ODUs',
  'MW-DISH-1.2': 'MW dishes',
  'CAB-RAISE': 'cabinet raise platforms',
}
const shortWh = (w: string) => w.split(' ')[0]

export function shortfallLines(p: P1Plan) {
  return p.draft.stock
    .filter((s) => s.shortfall > 0)
    .map((s) => {
      const noun = NOUN[s.sku] ?? `${s.description.toLowerCase()} units`
      const have = s.sources.reduce((a, x) => a + x.qty, 0)
      const where = s.sources.length ? `${s.sources.map((x) => `${shortWh(x.warehouse)}${s.sources.length > 1 ? ` ${x.qty}` : ''}`).join(' + ')} has ${have} of ${s.needed} ${noun}` : `No ${noun} in any warehouse (0 of ${s.needed})`
      return { sku: s.sku, text: `${where} · ${s.shortfall} on PO, ${s.lead_days}-day lead`, red: s.readiness === 'red' }
    })
}

const RD: Record<string, { c: string; l: string }> = { green: { c: '#2ECC71', l: 'Ready' }, amber: { c: '#F5A623', l: 'Amber' }, red: { c: '#FF3B3B', l: 'Red' } }

export function StockPanel({ p }: { p: P1Plan }) {
  const d = p.draft
  const role = useApp((s) => s.role)
  const prepositioned = useP1Store((s) => s.prepositioned)
  const approvePreposition = useP1Store((s) => s.approvePreposition)
  const toast = useApp((s) => s.toast)
  const short = shortfallLines(p)
  const wh = deliveryWarehouse(d)
  const green = d.stock.filter((s) => s.readiness === 'green').length
  const pre = prepositioned.includes(p.id)
  const canPre = role === 'PROC' && !pre && ['pending_approval', 'approved'].includes(p.status) && d.stock.some((s) => s.sources.some((x) => x.warehouse_id !== wh.warehouse_id))
  return (
    <Section
      title={
        <span>
          Stock readiness · {green} of {d.stock.length} hardware lines ready
        </span>
      }
      right={<AgentTag id="AG-WAREHOUSE" name="Warehouse Readiness Agent" f="D-1" />}
    >
      {short.length > 0 && (
        <div className="space-y-1 border-b border-line bg-warn/[0.06] px-4 py-2.5">
          {short.map((s) => (
            <div key={s.sku} className="flex items-center gap-2 text-[13px] font-semibold">
              <AlertTriangle size={14} className={s.red ? 'text-bad' : 'text-warn'} />
              <span>{s.text}</span>
            </div>
          ))}
          <div className="pl-[22px] text-[11px] text-faint">Stock-covered sites build in wave 1; the PO quantity builds in wave 2 when it lands (see critical path).</div>
        </div>
      )}
      {d.stock.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-faint">No hardware lines: services only.</div>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Line</th>
              <th className={clsx(th, 'text-right')}>Need</th>
              <th className={th}>Sources (free stock)</th>
              <th className={clsx(th, 'text-right')}>Short</th>
              <th className={clsx(th, 'text-right')}>Lead</th>
              <th className={th}>Readiness</th>
            </tr>
          </thead>
          <tbody>
            {d.stock.map((s) => (
              <tr key={s.sku} className="hover:bg-panel2">
                <td className={clsx(td, 'max-w-[220px]')}>
                  <div className="truncate" title={s.description}>
                    {s.description}
                  </div>
                  <Id className="text-[10.5px] text-faint">{s.sku}</Id>
                </td>
                <td className={clsx(td, 'tnum text-right')}>{s.needed}</td>
                <td className={td}>
                  {s.sources.length === 0 ? (
                    <span className="text-faint">none</span>
                  ) : (
                    <span className="tnum">
                      {s.sources.map((x, k) => (
                        <span key={x.warehouse_id}>
                          {k > 0 && <span className="text-faint"> + </span>}
                          {shortWh(x.warehouse)} <b className="font-semibold">{x.qty}</b>
                          <span className="text-faint"> · {x.transfer_days} d</span>
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className={clsx(td, 'tnum text-right', s.shortfall ? 'font-semibold text-warn' : 'text-faint')}>{s.shortfall || '—'}</td>
                <td className={clsx(td, 'tnum text-right text-muted')}>{s.shortfall ? `${s.lead_days} d` : '—'}</td>
                <td className={td}>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: RD[s.readiness].c }} />
                    <span className="text-xs" style={{ color: RD[s.readiness].c }}>
                      {s.shortfall ? `PO ${s.shortfall}` : s.sources.some((x) => x.transfer_days > 1) ? 'Transfer' : RD[s.readiness].l}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-[11px] text-faint">
        <span>
          Delivery to {wh.name} ({wh.warehouse_id}). Reservations are soft until Procurement approves pre-positioning.
        </span>
        {pre ? (
          <span className="flex items-center gap-1 whitespace-nowrap text-ok">
            <Check size={12} /> Pre-positioning approved
          </span>
        ) : canPre ? (
          <Button
            size="sm"
            onClick={() => {
              approvePreposition(p.id, `${d.stock.reduce((a, s) => a + s.sources.reduce((b, x) => b + x.qty, 0), 0)} units to ${wh.warehouse_id}`)
              toast(`Pre-positioning approved for ${p.id}: transfers to ${wh.name} start now`)
            }}
          >
            Approve pre-positioning
          </Button>
        ) : null}
      </div>
    </Section>
  )
}

// ---- Vendor proposal ----------------------------------------------------------------------

export function VendorPanel({ p }: { p: P1Plan }) {
  const d = p.draft
  const programs = useApp((s) => s.programs)
  const updateDraft = useP1Store((s) => s.updateDraft)
  const log = useP1Store((s) => s.log)
  const toast = useApp((s) => s.toast)
  const editable = p.status === 'draft' || p.status === 'pending_approval'
  const opts = vendorOptions(d, programs)
  const v = d.vendor.vendor
  const cap = v.capacity_sites_per_month
  const n = d.site_ids.length
  const fits = d.vendor.free_capacity >= n
  return (
    <Section title="Vendor proposal" right={<AgentTag id="AG-VENDOR" name="Vendor Allocation Agent" />}>
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-5">{v.name}</div>
            <div className="text-xs text-muted">
              <Id>{v.vendor_id}</Id> · {v.short} · {v.regions.join(', ')}
            </div>
          </div>
          <Badge tone={fits ? 'ok' : 'warn'}>{fits ? 'Capacity fits' : 'Over capacity'}</Badge>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <div>
            <div className="text-2xs uppercase tracking-wider text-faint">Free capacity</div>
            <div className="tnum text-sm font-semibold">
              {d.vendor.free_capacity} <span className="text-xs font-normal text-muted">of {cap} sites/mo</span>
            </div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-wider text-faint">SLA history</div>
            <div className="tnum text-sm font-semibold">{v.sla_pct}%</div>
          </div>
          <div>
            <div className="text-2xs uppercase tracking-wider text-faint">This plan</div>
            <div className="tnum text-sm font-semibold">{n} sites</div>
          </div>
        </div>
        <div className="relative mt-2 h-1.5 bg-line">
          <div className="absolute inset-y-0 left-0 bg-line2" style={{ width: `${((cap - d.vendor.free_capacity) / cap) * 100}%` }} />
          <div className={clsx('absolute inset-y-0', fits ? 'bg-ioh-yellow' : 'bg-bad')} style={{ left: `${((cap - d.vendor.free_capacity) / cap) * 100}%`, width: `${Math.min(n, d.vendor.free_capacity) / cap * 100}%` }} />
        </div>
        <div className="mt-1 text-[11px] text-faint">In-flight work · this plan · remaining free {Math.max(0, d.vendor.free_capacity - n)} sites</div>
      </div>
      <div className="px-4 py-2">
        <div className="mb-1 flex items-center justify-between text-2xs font-semibold uppercase tracking-wider text-faint">
          <span>Alternatives</span>
          <span className="font-normal normal-case tracking-normal">score = free capacity × SLA</span>
        </div>
        {opts
          .filter((o) => o.vendor.vendor_id !== v.vendor_id)
          .slice(0, 4)
          .map((o) => (
            <div key={o.vendor.vendor_id} className="flex items-center gap-2 border-t border-line/60 py-1.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px]">{o.vendor.name}</div>
                <div className="tnum text-[11px] text-faint">
                  {o.free_capacity} free · SLA {o.vendor.sla_pct}% · {o.inRegion ? 'in region' : <span className="text-warn">cross-region, +mobilisation</span>}
                </div>
              </div>
              {editable && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    updateDraft(p.id, withVendor(d, o, programs))
                    log({ action: 'Vendor changed', object: p.id, detail: `${v.vendor_id} → ${o.vendor.vendor_id}` })
                    toast(`${p.id}: vendor switched to ${o.vendor.name}`, 'info')
                  }}
                >
                  Use
                </Button>
              )}
            </div>
          ))}
        {!opts.some((o) => o.inRegion && o.vendor.vendor_id !== v.vendor_id) && <div className="pt-1 text-[11px] text-faint">{v.short} is the only framework vendor in {d.region}; others need cross-region mobilisation.</div>}
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] text-faint">Proposal only: the Deployment lead confirms the allocation (Stage 6); the vendor portal is read-only in Phase 1.</div>
    </Section>
  )
}

// ---- PO draft --------------------------------------------------------------------------------

export function PoPanel({ p }: { p: P1Plan }) {
  const d = p.draft
  const v = d.vendor.vendor
  const total = d.po_hardware_idr + d.po_services_idr
  const ceiling = ceilingRemaining(v)
  const stockValue = d.capex_total_idr - total
  return (
    <Section
      title={
        <span>
          PO draft · {idr(total)}
        </span>
      }
      right={<AgentTag id="AG-PROC" name="Procurement Agent" />}
    >
      <div className="grid grid-cols-3 border-b border-line">
        <div className="border-r border-line px-4 py-2">
          <div className="text-2xs uppercase tracking-wider text-faint">Hardware (shortfall)</div>
          <div className="tnum text-sm font-semibold">{idr(d.po_hardware_idr)}</div>
        </div>
        <div className="border-r border-line px-4 py-2">
          <div className="text-2xs uppercase tracking-wider text-faint">Services</div>
          <div className="tnum text-sm font-semibold">{idr(d.po_services_idr)}</div>
        </div>
        <div className="px-4 py-2">
          <div className="text-2xs uppercase tracking-wider text-faint">From stock, not bought</div>
          <div className="tnum text-sm font-semibold text-muted">{idr(stockValue)}</div>
        </div>
      </div>
      <table className="w-full">
        <thead>
          <tr>
            <th className={th}>ERP material</th>
            <th className={clsx(th, 'text-right')}>Qty</th>
            <th className={clsx(th, 'text-right')}>Unit</th>
            <th className={clsx(th, 'text-right')}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.po_lines.map((l) => (
            <tr key={l.sku} className="hover:bg-panel2">
              <td className={clsx(td, 'max-w-[220px]')}>
                <Id className="text-ink">{matCode(l.sku)}</Id>
                <div className="truncate text-[11px] text-faint">{l.description}</div>
              </td>
              <td className={clsx(td, 'tnum text-right')}>{l.qty}</td>
              <td className={clsx(td, 'tnum text-right text-muted')}>{idr(l.amount_idr / l.qty, { digits: 1 })}</td>
              <td className={clsx(td, 'tnum text-right font-semibold')}>{idr(l.amount_idr)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="space-y-1 px-4 py-2.5 text-xs">
        <div className="flex justify-between">
          <span className="text-muted">Framework agreement</span>
          <span className="font-mono text-[11.5px]">{contractId(v)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Ceiling remaining</span>
          <span className="tnum">
            {idr(ceiling)} <span className={total <= ceiling ? 'text-ok' : 'text-bad'}>{total <= ceiling ? `· ${Math.round((total / ceiling) * 100)}% used ✓` : '· breach, draft blocked'}</span>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-line bg-panel2/60 px-4 py-2 text-[11px] text-muted">
        <Lock size={12} className="shrink-0 text-faint" /> Draft only: Procurement releases the PO in ERP. Ceiling is a placeholder until the ERP contract read is live.
      </div>
    </Section>
  )
}

// ---- Tower company request ---------------------------------------------------------------

export function TowercoPanel({ p, required }: { p: P1Plan; required: boolean }) {
  const d = p.draft
  const groups = [...sitesByTowerco(d).entries()].sort((a, b) => b[1].length - a[1].length)
  const load = towerLoad(d)
  const req = p.decided && (p.status === 'approved' || p.status === 'handed_off') ? p.decided.slice(0, 10) : addDays(day0(d), 2)
  const h = p.handoffs['HO-TOWERCO']
  if (!required)
    return (
      <Section title="Tower company" right={<AgentTag id="AG-TOWERCO" name="Tower Co Agent" />}>
        <div className="px-4 py-3 text-xs text-muted">
          {d.intervention_label} does not change tower loading: no access or loading request needed.
          {d.tower_companies.length > 0 && <span className="text-faint"> Sites sit on {d.tower_companies.join(', ')}.</span>}
        </div>
      </Section>
    )
  return (
    <Section title="Tower company request · 6b" right={<AgentTag id="AG-TOWERCO" name="Tower Co Agent" />}>
      <div className="grid grid-cols-3 border-b border-line">
        <div className="border-r border-line px-4 py-2">
          <div className="text-2xs uppercase tracking-wider text-faint">Loading delta</div>
          <div className="tnum text-sm font-semibold">+{load.kgPerSite} kg/site</div>
        </div>
        <div className="border-r border-line px-4 py-2">
          <div className="text-2xs uppercase tracking-wider text-faint">SLA</div>
          <div className="tnum text-sm font-semibold">10 d fast-track</div>
        </div>
        <div className="px-4 py-2">
          <div className="text-2xs uppercase tracking-wider text-faint">Requested</div>
          <div className="tnum text-sm font-semibold">{dateShort(req)}</div>
        </div>
      </div>
      <div className="px-4 py-2">
        {groups.map(([tc, ids]) => (
          <div key={tc} className="flex items-center justify-between gap-2 border-t border-line/60 py-1.5 first:border-t-0">
            <span className="text-[12.5px] font-medium">{tc}</span>
            <span className="tnum text-[11px] text-muted">
              {ids.length} sites · +{num(load.kgPerSite * ids.length)} kg total
            </span>
          </div>
        ))}
        {groups.length === 0 && <div className="text-xs text-faint">All sites are IOH-owned structures.</div>}
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] leading-4 text-faint">
        Equipment per site: {load.items.map((x) => `${x.perSite}× ${x.sku}`).join(', ')} (spec-sheet weights; structural review if over lease allowance). Drafted at approval so the 10-day clock runs alongside vendor allocation, not after it.
        {h?.state === 'acknowledged' && <span className="text-ok"> Reference {h.ref}: SLA clock started.</span>}
      </div>
    </Section>
  )
}

// ---- Sites -------------------------------------------------------------------------------

export function SitesPanel({ p }: { p: P1Plan }) {
  const D = db()
  const policy = usePolicy()
  const p1 = useP1()
  const start = day0(p.draft)
  const rows = p.draft.site_ids
    .map((id) => {
      const i = D.siteIdx.get(id)!
      const s = D.sites[i]
      const f = D.forecast[i]
      const wk = crossingWeek(i, policy.red_min_probability)
      return { id, s, f, wk, p8: p1?.bySite.get(id)?.p8 ?? f.failure_prob[7] }
    })
    .sort((a, b) => (a.wk || 99) - (b.wk || 99) || b.p8 - a.p8)
  return (
    <Section title={`Sites · ${rows.length}`} right={<span className="flex items-center gap-1.5 text-[11px] text-faint">Site Failure Prediction Agent <Fresh f="D-1" /></span>}>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr>
              <th className={th}>Site</th>
              <th className={th}>Name</th>
              <th className={th}>District</th>
              <th className={th}>Class</th>
              <th className={clsx(th, 'text-right')}>p(W+8)</th>
              <th className={th}>Predicted crossing</th>
              <th className={th}>Tower</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-panel2">
                <td className={td}>
                  <Link to={`/phase1/site/${r.id}`} className="font-mono text-[11.5px] text-muted hover:text-ioh-yellow">
                    {r.id}
                  </Link>
                </td>
                <td className={td}>
                  <Link to={`/phase1/site/${r.id}`} className="hover:text-ioh-yellow">
                    {r.s.name}
                  </Link>
                </td>
                <td className={clsx(td, 'text-muted')}>{D.distById[r.s.district_id]?.name}</td>
                <td className={td}>
                  <span className="flex items-center gap-1.5 text-xs">
                    <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[r.f.failure_class].color }} />
                    {CLASS_META[r.f.failure_class].label}
                  </span>
                </td>
                <td className={clsx(td, 'tnum text-right')}>{Math.round(r.p8 * 100)}%</td>
                <td className={clsx(td, 'tnum')}>
                  {r.wk ? (
                    <span className={r.wk <= 3 ? 'text-bad' : r.wk <= 5 ? 'text-warn' : ''}>
                      W+{r.wk} <span className="text-faint">· by {dateShort(D.weekEndDates[r.wk - 1] ?? addDays(start, r.wk * 7))}</span>
                    </span>
                  ) : (
                    <span className="text-faint">below threshold</span>
                  )}
                </td>
                <td className={clsx(td, 'text-muted')}>{r.s.tower_company}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

// ---- History ------------------------------------------------------------------------------

export function HistoryPanel({ p }: { p: P1Plan }) {
  return (
    <Section title="History and audit" right={<Fresh f="live" />}>
      <div className="max-h-[420px] overflow-y-auto px-4 py-2">
        {[...p.history].reverse().map((h, k) => (
          <div key={k} className="relative flex gap-3 py-1.5">
            {k < p.history.length - 1 && <div className="absolute bottom-[-6px] left-[4px] top-[18px] w-px bg-line" />}
            {h.role === 'system' ? <CircleDot size={9} className="mt-[5px] shrink-0 text-[#8CC4F0]" /> : h.what.startsWith('Approved') ? <ShieldCheck size={9} className="mt-[5px] shrink-0 text-ok" /> : <span className="mt-[5px] h-[9px] w-[9px] shrink-0 rounded-full bg-line2" />}
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px]">{h.what}</div>
              {h.reason && <div className="text-[11px] text-warn">Reason: {h.reason}</div>}
              <div className="tnum text-[11px] text-faint">
                {dateTime(h.ts)} · {h.who} {h.role !== 'system' && <span className="font-mono">({h.role})</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-line px-4 py-2 text-[11px] text-faint">
        Created {date(p.created)} by {p.created_by}. Every transition is timestamped and attributed (5-year retention).
      </div>
    </Section>
  )
}
