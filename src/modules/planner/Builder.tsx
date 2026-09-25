import clsx from 'clsx'
import { ArrowRight, Boxes, CheckCircle2, Circle, Clock, ExternalLink, Layers, MousePointerClick, Send, Truck, Wand2, Zap } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import { Badge, Button, Fresh, Id, Label, Panel, Td, Th } from '@/components/ui'
import { STATUS } from '@/lib/colors'
import { addDays, CLASS_LABEL, date, dateShort, idr, INTERVENTION_LABEL, num } from '@/lib/format'
import { buildPlan, INTERVENTIONS, interventionFromOption, type PlanDraft, type StockCheck } from '@/lib/plan'
import { todayIso, useApp, useRole } from '@/store/app'
import { bekasiPlan, planForSites, useForecast } from './model'
import { Gantt } from './Gantt'

const DECIDED = new Set(['Approved', 'In_program', 'RFS', 'Validating', 'Closed'])

export function Builder({ selected, goBoard }: { selected: string[]; goBoard: () => void }) {
  const plan = useApp((s) => s.plan)
  if (!plan) return <EmptyBuilder selected={selected} goBoard={goBoard} />
  return <PlanView plan={plan} />
}

function EmptyBuilder({ selected, goBoard }: { selected: string[]; goBoard: () => void }) {
  const setPlan = useApp((s) => s.setPlan)
  const toast = useApp((s) => s.toast)
  const incidents = useApp((s) => s.incidents)
  const { rows } = useForecast()
  const D = db()
  const bid = D.meta.story_incidents.bekasi_capacity
  const binc = incidents.find((x) => x.incident_id === bid)
  const bexp = binc?.exposure_idr ?? 0
  return (
    <div className="flex min-h-full items-start justify-center p-6 pt-16">
      <div className="w-[720px] max-w-full border border-line bg-panel">
        <div className="border-b border-line px-6 py-5">
          <Label>Plan builder</Label>
          <div className="mt-1 text-lg font-semibold">No draft plan yet</div>
          <div className="mt-1 text-sm text-muted">
            Select sites on the forecast board, or start from a predicted cluster. NICC drafts the BOQ, checks stock across 8 warehouses, allocates a vendor, drafts the PO and lays out the critical path in one pass.
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-line">
          <button
            onClick={() => {
              setPlan(bekasiPlan())
              toast('Draft plan: Bekasi capacity cluster · 14 sites · sector add')
            }}
            className="group flex flex-col gap-2 px-6 py-5 text-left hover:bg-panel2"
          >
            <div className="flex items-center gap-2 text-ioh-yellow">
              <Wand2 size={15} />
              <span className="text-sm font-semibold">Bekasi capacity cluster (14 sites)</span>
            </div>
            <div className="text-xs text-muted">
              <Id>{bid}</Id> · saturation in {binc?.days_to_breach ?? 23} days · exposure {idr(bexp)}/month · {binc?.program_id ? `in ${binc.program_id}` : 'not in any program'}
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-ink group-hover:text-ioh-yellow">
              Draft sector-add plan <ArrowRight size={12} />
            </div>
          </button>
          <button
            disabled={!selected.length}
            onClick={() => {
              setPlan(planForSites(selected, rows))
              toast(`Draft plan for ${selected.length} board-selected sites`)
            }}
            className="group flex flex-col gap-2 px-6 py-5 text-left enabled:hover:bg-panel2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex items-center gap-2">
              <MousePointerClick size={15} className="text-muted" />
              <span className="text-sm font-semibold">Use board selection</span>
            </div>
            <div className="text-xs text-muted">{selected.length ? `${selected.length} sites selected on the forecast board` : 'Nothing selected on the forecast board yet'}</div>
            <div className="mt-1 flex items-center gap-1 text-xs font-semibold text-ink group-hover:text-ioh-yellow">
              {selected.length ? (
                <>
                  Draft plan <ArrowRight size={12} />
                </>
              ) : (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    goBoard()
                  }}
                  className="cursor-pointer underline"
                >
                  Open forecast board
                </span>
              )}
            </div>
          </button>
        </div>
      </div>
    </div>
  )
}

function PlanView({ plan }: { plan: PlanDraft }) {
  const nav = useNavigate()
  const role = useRole()
  const setPlan = useApp((s) => s.setPlan)
  const submitPlan = useApp((s) => s.submitPlan)
  const decideIncident = useApp((s) => s.decideIncident)
  const toast = useApp((s) => s.toast)
  const incidents = useApp((s) => s.incidents)
  const programs = useApp((s) => s.programs)
  const reservations = useApp((s) => s.reservations)
  const D = db()

  const inc = plan.source_incident ? incidents.find((x) => x.incident_id === plan.source_incident) ?? null : null
  const decided = !!inc && DECIDED.has(inc.status)
  const stage3Role = plan.approval_chain[0]?.role
  const canDecide = role.role_code === stage3Role || role.role_code === 'EXEC'
  const chain = plan.approval_chain.map((c, k) => (k === 0 ? { ...c, state: decided ? ('done' as const) : ('pending' as const) } : c))

  const rebuild = (intervention: string) => {
    const p = buildPlan({
      siteIds: plan.site_ids,
      intervention,
      sourceIncident: plan.source_incident,
      programs,
      reservations,
      windowDays: plan.window_days,
      today: todayIso(),
      nextProgramId: plan.id,
    })
    setPlan(p)
    toast(`Plan rebuilt for ${p.intervention_label}: BOQ, stock, vendor and critical path updated`, 'info')
  }

  const switchVendor = (vid: string) => {
    const alt = plan.vendor.alternatives.find((a) => a.vendor.vendor_id === vid)
    if (!alt) return
    const cur = { vendor: plan.vendor.vendor, free_capacity: plan.vendor.free_capacity }
    setPlan({
      ...plan,
      vendor: { vendor: alt.vendor, free_capacity: alt.free_capacity, alternatives: [cur, ...plan.vendor.alternatives.filter((a) => a.vendor.vendor_id !== vid)] },
      critical_path: plan.critical_path.map((c) => (c.lane === 'Vendor' ? { ...c, note: alt.vendor.name } : c)),
    })
    toast(`Vendor switched to ${alt.vendor.name}`, 'info')
  }

  const submit = () => {
    if (inc && !decided && canDecide) {
      const opts = D.optionsByIncident.get(inc.incident_id) ?? []
      const match = opts.find((o) => interventionFromOption(o.name) === plan.intervention && o.name.toLowerCase().includes(plan.intervention_label.split(' ')[0].toLowerCase()))
      decideIncident(inc.incident_id, 'approve', { rank: match?.rank ?? inc.recommended_rank })
    }
    const pid = submitPlan(plan)
    toast(`${pid} created · approval chain pre-populated · PO release pending Procurement`)
    nav(`/programs/${pid}`)
  }

  const hw = plan.boq.filter((b) => b.category !== 'Service')
  const svc = plan.boq.filter((b) => b.category === 'Service')
  const hwTotal = hw.reduce((s, b) => s + b.total_idr, 0)
  const svcTotal = svc.reduce((s, b) => s + b.total_idr, 0)
  const exceeds = plan.window_days !== null && plan.rfs_days > plan.window_days
  const perSite = plan.capex_total_idr / plan.site_ids.length
  const focus = plan.stock.find((s) => s.sku.startsWith('ANT')) ?? [...plan.stock].sort((a, b) => b.shortfall - a.shortfall)[0]
  const readyCounts = { green: plan.stock.filter((s) => s.readiness === 'green').length, amber: plan.stock.filter((s) => s.readiness === 'amber').length, red: plan.stock.filter((s) => s.readiness === 'red').length }
  const sites = plan.site_ids.map((id) => D.sites[D.siteIdx.get(id)!])
  const { all } = useForecast()
  const cwBySite = new Map(all.map((r) => [r.site_id, r]))

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <section className="border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 pb-3 pt-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Label>Draft plan</Label>
              <Id>{plan.id}</Id>
              <Fresh f="live" />
              {plan.source_incident && (
                <span className="text-xs text-muted">
                  from{' '}
                  <Id onClick={() => nav(`/incidents?incident=${plan.source_incident}`)} className="hover:underline">
                    {plan.source_incident}
                  </Id>
                </span>
              )}
            </div>
            <div className="mt-1 text-xl font-semibold tracking-tight">{plan.name}</div>
            <div className="mt-0.5 text-sm text-muted">
              {plan.site_ids.length} sites · {plan.district_label} · {plan.region}
              {plan.tower_companies.length > 0 && <> · towers: {plan.tower_companies.join(', ')}</>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <label className="text-xs text-muted">Intervention</label>
            <select value={plan.intervention} onChange={(e) => rebuild(e.target.value)} className="h-8 border border-line2 bg-panel2 px-2 text-sm">
              {Object.entries(INTERVENTIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} · {INTERVENTION_LABEL[v.class]}
                </option>
              ))}
            </select>
            <Button variant="ghost" onClick={() => setPlan(null)}>
              Discard
            </Button>
            <Button variant="primary" onClick={submit}>
              <Send size={14} /> {inc && !decided && canDecide ? 'Approve and submit' : 'Submit for approval'}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-5 divide-x divide-line border-t border-line">
          <HStat label="CapEx class" value={INTERVENTION_LABEL[plan.capex_class]} sub={plan.intervention_label} />
          <HStat label="Total CapEx" value={idr(plan.capex_total_idr)} sub={`${idr(perSite)} per site · price book`} tone="yellow" />
          <HStat label="Target RFS" value={date(plan.target_rfs)} sub={`D+${plan.rfs_days} from decision · legacy 20–22 wks`} />
          <HStat label="Window to breach" value={plan.window_days !== null ? `${plan.window_days} days` : '—'} sub={plan.window_days !== null ? `Predicted breach ${dateShort(addDays(todayIso(), plan.window_days))}` : 'No prediction window'} />
          <HStat
            label="Fits window?"
            value={plan.window_days === null ? '—' : exceeds ? `Over by ${plan.rfs_days - plan.window_days} d` : `Fits · ${plan.window_days - plan.rfs_days} d slack`}
            sub={exceeds ? (plan.bridge ? 'Bridge recommended below' : 'No bridge available') : 'RFS before predicted breach'}
            tone={exceeds ? 'warn' : 'ok'}
          />
        </div>
        {plan.bridge && (
          <div className="flex items-center gap-3 border-t border-warn/30 bg-warn/[0.06] px-5 py-2.5 text-sm">
            <Zap size={15} className="shrink-0 text-warn" />
            <span>
              RFS lands <b>{plan.rfs_days - (plan.window_days ?? 0)} days after</b> the predicted breach. Bridge with <b className="text-ink">{plan.bridge.label}</b>: live in {plan.bridge.days} days, holds the cluster until RFS on {date(plan.target_rfs)}.
            </span>
          </div>
        )}
      </section>

      {/* Approval chain */}
      <Panel title="Approval chain · pre-populated on submit" right={<span className="text-xs text-faint">PRD §8 gates and intervention classes</span>} pad={false}>
        <div className="flex items-stretch overflow-x-auto">
          {chain.map((c, k) => (
            <div key={c.gate} className="flex min-w-[150px] flex-1 basis-0 items-stretch">
              <div className={clsx('min-w-0 flex-1 px-4 py-3', k > 0 && 'border-l border-line')}>
                <div className="flex items-center gap-1.5">
                  <ChainIcon state={c.state} />
                  <span className="truncate text-2xs font-semibold uppercase tracking-wider text-faint">{c.gate}</span>
                </div>
                <div className="mt-1 truncate text-sm font-medium">{c.label}</div>
                <div className="mt-0.5 text-xs">
                  <ChainState state={c.state} first={k === 0} canDecide={canDecide} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-12 gap-4">
        {/* BOQ */}
        <Panel className="col-span-12 xl:col-span-7" title="Bill of quantities · BOQ Agent draft" right={<span className="tnum text-xs text-muted">{plan.boq.length} lines · variance vs price book 0%</span>} pad={false}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Unit cost</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody>
              {[...hw, ...svc].map((b) => (
                <tr key={b.sku} className="hover:bg-panel2">
                  <Td>
                    <Id className="text-ink">{b.sku}</Id>
                  </Td>
                  <Td className="max-w-[260px] truncate">{b.description}</Td>
                  <Td className="text-muted">{b.category}</Td>
                  <Td className="tnum text-right">{num(b.qty)}</Td>
                  <Td className="tnum text-right text-muted">{idr(b.unit_cost_idr, { digits: 1 })}</Td>
                  <Td className="tnum text-right font-medium">{idr(b.total_idr)}</Td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} className="h-9 border-b border-line/70 px-3 text-right text-xs text-muted">
                  Hardware
                </td>
                <Td className="tnum text-right">{idr(hwTotal)}</Td>
              </tr>
              <tr>
                <td colSpan={5} className="h-9 border-b border-line/70 px-3 text-right text-xs text-muted">
                  Services
                </td>
                <Td className="tnum text-right">{idr(svcTotal)}</Td>
              </tr>
              <tr className="bg-panel2">
                <td colSpan={5} className="h-9 border-b border-line/70 px-3 text-right text-xs font-semibold uppercase tracking-wider text-faint">
                  Total CapEx
                </td>
                <Td className="tnum text-right text-base font-semibold text-ioh-yellow">{idr(plan.capex_total_idr)}</Td>
              </tr>
            </tbody>
          </table>
        </Panel>

        {/* Stock readiness */}
        <Panel
          className="col-span-12 xl:col-span-5"
          title="Stock readiness · Warehouse Readiness Agent"
          right={
            <span className="flex items-center gap-2 text-xs text-muted">
              <Dot3 c={STATUS.ok} n={readyCounts.green} />
              <Dot3 c={STATUS.warn} n={readyCounts.amber} />
              <Dot3 c={STATUS.bad} n={readyCounts.red} />
              <Fresh f="D-1" asOf={D.meta.as_of} />
            </span>
          }
          pad={false}
        >
          {focus && <StockCallout s={focus} />}
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th className="w-6 pr-0" />
                <Th>SKU</Th>
                <Th className="text-right">Need</Th>
                <Th>Sources</Th>
                <Th className="text-right">Short</Th>
                <Th className="text-right">Lead</Th>
              </tr>
            </thead>
            <tbody>
              {plan.stock.map((s) => (
                <tr key={s.sku} className={clsx('hover:bg-panel2', s === focus && 'bg-ioh-yellow/[0.05]')}>
                  <Td className="w-6 pr-0">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.readiness === 'green' ? STATUS.ok : s.readiness === 'amber' ? STATUS.warn : STATUS.bad }} />
                  </Td>
                  <Td>
                    <Id className="text-ink">{s.sku}</Id>
                  </Td>
                  <Td className="tnum text-right">{s.needed}</Td>
                  <Td className="max-w-[200px] truncate text-xs text-muted" title={s.note}>
                    {s.sources.length ? s.sources.map((x) => `${x.warehouse.split(' ')[0]} ${x.qty}`).join(' · ') : <span className="text-bad">none in stock</span>}
                  </Td>
                  <Td className={clsx('tnum text-right', s.shortfall ? 'font-semibold text-bad' : 'text-faint')}>{s.shortfall || '—'}</Td>
                  <Td className="tnum text-right text-muted">{s.shortfall ? `${s.lead_days} d` : s.sources.some((x) => x.transfer_days > 1) ? `${Math.max(...s.sources.map((x) => x.transfer_days))} d tr.` : '1 d'}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
            <Mini className="px-4 py-2.5" label="Hardware units in stock" value={`${plan.stock.reduce((a, s) => a + s.needed - s.shortfall, 0)} of ${plan.stock.reduce((a, s) => a + s.needed, 0)}`} />
            <Mini className="px-4 py-2.5" label="Lines on PO" value={`${plan.stock.filter((s) => s.shortfall > 0).length} of ${plan.stock.length}`} tone={plan.stock.some((s) => s.shortfall > 0) ? 'warn' : 'ok'} />
            <Mini className="px-4 py-2.5" label="Warehouses used" value={`${new Set(plan.stock.flatMap((s) => s.sources.map((x) => x.warehouse_id))).size}`} />
          </div>
          <div className="border-t border-line px-4 py-2 text-xs text-muted">Stock is reserved on submit. Stage 5 auto-approves pre-positioned lines; only the shortfall goes to Procurement.</div>
        </Panel>
      </div>

      {/* Critical path */}
      <Panel
        title="Critical path · days from decision"
        right={
          <span className="tnum text-xs text-muted">
            RFS D+{plan.rfs_days} · {date(plan.target_rfs)}
            {plan.window_days !== null && <> · breach D+{plan.window_days}</>}
          </span>
        }
        pad={false}
      >
        <Gantt plan={plan} />
      </Panel>

      <div className="grid grid-cols-12 gap-4">
        {/* Vendor */}
        <Panel className="col-span-12 xl:col-span-4" title="Vendor allocation" right={<Truck size={14} className="text-faint" />}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{plan.vendor.vendor.name}</div>
              <div className="text-xs text-muted">
                <Id>{plan.vendor.vendor.vendor_id}</Id> · {plan.vendor.vendor.regions.join(', ')}
              </div>
            </div>
            <Badge tone="yellow">Allocated</Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3">
            <Mini label="Free capacity" value={`${plan.vendor.free_capacity} sites/mo`} tone={plan.vendor.free_capacity >= plan.site_ids.length ? 'ok' : 'warn'} />
            <Mini label="SLA" value={`${plan.vendor.vendor.sla_pct.toFixed(1)}%`} tone={plan.vendor.vendor.sla_pct >= 90 ? 'ok' : 'warn'} />
            <Mini label="Plan needs" value={`${plan.site_ids.length} sites`} />
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>Monthly capacity after this plan</span>
              <span className="tnum">
                {Math.max(0, plan.vendor.free_capacity - plan.site_ids.length)} of {plan.vendor.vendor.capacity_sites_per_month} sites left
              </span>
            </div>
            <div className="mt-1 flex h-2 w-full bg-line">
              <div className="h-full bg-line2" style={{ width: `${((plan.vendor.vendor.capacity_sites_per_month - plan.vendor.free_capacity) / plan.vendor.vendor.capacity_sites_per_month) * 100}%` }} title="In-flight programs" />
              <div className="h-full bg-ioh-yellow" style={{ width: `${(Math.min(plan.site_ids.length, plan.vendor.free_capacity) / plan.vendor.vendor.capacity_sites_per_month) * 100}%` }} title="This plan" />
            </div>
            <div className="mt-1 flex gap-3 text-[10.5px] text-faint">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 bg-line2" /> In-flight programs
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 bg-ioh-yellow" /> This plan
              </span>
            </div>
          </div>
          {plan.vendor.alternatives.length === 0 && <div className="mt-4 border-t border-line/70 pt-2 text-xs text-faint">No alternative framework vendor covers {plan.region}; Vendor Allocation Agent ranks by free capacity × SLA.</div>}
          {plan.vendor.alternatives.length > 0 && (
            <div className="mt-4">
              <Label className="mb-1.5">Alternatives in {plan.region}</Label>
              {plan.vendor.alternatives.map((a) => (
                <div key={a.vendor.vendor_id} className="flex items-center justify-between gap-2 border-t border-line/70 py-1.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm">{a.vendor.name}</div>
                    <div className="tnum text-xs text-muted">
                      {a.free_capacity} free sites/mo · SLA {a.vendor.sla_pct.toFixed(1)}%
                    </div>
                  </div>
                  <Button size="sm" onClick={() => switchVendor(a.vendor.vendor_id)}>
                    Switch
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {/* PO draft */}
        <Panel className="col-span-12 xl:col-span-4" title="PO draft" right={<Badge tone="warn">Pending Procurement release</Badge>} pad={false}>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>Line</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {plan.po_lines.map((l) => (
                <tr key={l.sku}>
                  <Td className="max-w-[220px]">
                    <Id className={l.sku.startsWith('SVC') ? '' : 'text-bad'}>{l.sku}</Id>
                    <div className="truncate text-xs text-faint">{l.description}</div>
                  </Td>
                  <Td className="tnum text-right">{l.qty}</Td>
                  <Td className="tnum text-right">{idr(l.amount_idr)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid grid-cols-2 divide-x divide-line border-t border-line">
            <Mini className="px-4 py-2.5" label="Hardware (shortfall)" value={idr(plan.po_hardware_idr)} />
            <Mini className="px-4 py-2.5" label="Services" value={idr(plan.po_services_idr)} />
          </div>
          <div className="border-t border-line px-4 py-2 text-xs text-muted">
            Stock-covered lines ({idr(plan.capex_total_idr - plan.po_hardware_idr - plan.po_services_idr)}) are reserved, not purchased. Framework agreement <span className="font-mono">FA-{plan.vendor.vendor.vendor_id}</span>.
          </div>
        </Panel>

        {/* Sites */}
        <Panel className="col-span-12 xl:col-span-4" title={`Sites in plan · ${plan.site_ids.length}`} pad={false}>
          <div className="max-h-[340px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>Site</Th>
                  <Th>District</Th>
                  <Th className="text-right">Crossing</Th>
                </tr>
              </thead>
              <tbody>
                {sites.map((s) => {
                  const r = cwBySite.get(s.site_id)
                  return (
                    <tr key={s.site_id} className="hover:bg-panel2">
                      <Td className="max-w-[200px]">
                        <Id onClick={() => nav(`/site/${s.site_id}`)} className="text-ink">
                          {s.site_id}
                        </Id>
                        <span className="ml-2 truncate text-xs text-muted">{s.name}</span>
                      </Td>
                      <Td className="text-muted">{D.distById[s.district_id]?.name}</Td>
                      <Td className="tnum text-right">{r ? <span>W+{r.cw}</span> : <span className="text-faint">—</span>}</Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      <div className="flex items-center justify-between border border-line bg-panel px-5 py-3">
        <div className="text-sm text-muted">
          Submitting creates <Id>{plan.id}</Id> in the Program Console, reserves stock, drafts {plan.po_hardware_idr > 0 ? 2 : 1} POs for Procurement, opens the tower company clock and issues {plan.site_ids.length} survey work orders.
          {inc && <> Incident {inc.incident_id} ({CLASS_LABEL[inc.class] ?? inc.class}) moves to In program.</>}
        </div>
        <Button variant="primary" onClick={submit}>
          <Send size={14} /> {inc && !decided && canDecide ? 'Approve and submit' : 'Submit for approval'}
        </Button>
      </div>
    </div>
  )
}

function StockCallout({ s }: { s: StockCheck }) {
  const inStock = s.sources.reduce((a, x) => a + x.qty, 0)
  const noun = s.sku.startsWith('ANT') ? 'multi-band antennas' : s.description.toLowerCase()
  const lead = s.sources.length ? s.sources[0] : null
  return (
    <div className={clsx('border-b border-line px-4 py-3', s.readiness === 'green' ? 'bg-ok/[0.06]' : s.readiness === 'amber' ? 'bg-warn/[0.07]' : 'bg-bad/[0.07]')}>
      <div className="flex items-start gap-3">
        <Boxes size={18} className={clsx('mt-0.5 shrink-0', s.readiness === 'green' ? 'text-ok' : s.readiness === 'amber' ? 'text-warn' : 'text-bad')} />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-6">
            {s.sources.length === 0 ? (
              <>No {noun} in stock: {s.needed} on PO</>
            ) : s.sources.length === 1 ? (
              <>
                {lead!.warehouse.split(' ')[0]} has {inStock} of {s.needed} {noun}
              </>
            ) : (
              <>
                {inStock} of {s.needed} {noun} in stock ({s.sources.map((x) => `${x.warehouse.split(' ')[0]} ${x.qty}`).join(', ')})
              </>
            )}
          </div>
          <div className="tnum mt-0.5 text-xs text-muted">
            {s.shortfall > 0 ? (
              <>
                <b className="text-bad">{s.shortfall} on PO</b> ({s.lead_days}-day supplier lead) · {inStock} transferred to site in {Math.max(0, ...s.sources.map((x) => x.transfer_days))} days, wave 1 builds from stock, wave 2 from PO
              </>
            ) : (
              <>{s.note}</>
            )}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-faint">
            {s.sku} · {s.description}
          </div>
        </div>
      </div>
    </div>
  )
}

function ChainIcon({ state }: { state: PlanDraft['approval_chain'][number]['state'] }) {
  if (state === 'done') return <CheckCircle2 size={13} className="text-ok" />
  if (state === 'auto') return <Layers size={13} className="text-[#8CC4F0]" />
  if (state === 'pending') return <Clock size={13} className="text-warn" />
  if (state === 'external') return <ExternalLink size={13} className="text-[#B79CFF]" />
  return <Circle size={13} className="text-faint" />
}

function ChainState({ state, first, canDecide }: { state: PlanDraft['approval_chain'][number]['state']; first: boolean; canDecide: boolean }) {
  if (state === 'done') return <span className="text-ok">Approved</span>
  if (state === 'auto') return <span className="text-[#8CC4F0]">Auto unless variance &gt; 10%</span>
  if (state === 'pending')
    return first ? (
      <span className="text-warn">{canDecide ? 'Your decision · approved on submit' : 'Awaiting decision'}</span>
    ) : (
      <span className="text-warn">Pending after submit</span>
    )
  if (state === 'external') return <span className="text-[#B79CFF]">External · 10-day SLA clock</span>
  return <span className="text-faint">After build</span>
}

function HStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'yellow' }) {
  const tc = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'yellow' ? 'text-ioh-yellow' : 'text-ink'
  return (
    <div className="min-w-0 px-5 py-2.5">
      <div className="truncate text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={clsx('tnum truncate text-lg font-semibold leading-7', tc)}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  )
}

function Mini({ label, value, tone, className }: { label: string; value: string; tone?: 'ok' | 'warn'; className?: string }) {
  return (
    <div className={clsx('min-w-0', className)}>
      <div className="truncate text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={clsx('tnum truncate text-sm font-semibold', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{value}</div>
    </div>
  )
}

function Dot3({ c, n }: { c: string; n: number }) {
  return (
    <span className="tnum flex items-center gap-1">
      <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
      {n}
    </span>
  )
}

