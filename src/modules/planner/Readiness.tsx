import clsx from 'clsx'
import { ArrowRight, CheckCircle2, PackageCheck, Truck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import type { PurchaseOrder } from '@/data/types'
import { Badge, Button, Empty, Fresh, Id, Label, Panel, Td, Th } from '@/components/ui'
import { date, dateShort, idr, num } from '@/lib/format'
import { useApp, useRole } from '@/store/app'
import { AXIS, demandForecast, GRID, OPEN_PO, stockRows, TOOLTIP, useForecast, WEEKS, type StockRow } from './model'

interface Suggestion {
  key: string
  title: string
  detail: string
  why: string
  sku: string
  qty: number
  from: string
  to: string
  value: number
}

const PO_TONE: Record<PurchaseOrder['status'], 'warn' | 'blue' | 'prog' | 'ok' | 'neutral'> = {
  draft: 'neutral',
  pending_release: 'warn',
  released: 'blue',
  acknowledged: 'prog',
  delivered: 'ok',
  invoiced: 'neutral',
}
const PO_LABEL: Record<PurchaseOrder['status'], string> = {
  draft: 'Draft',
  pending_release: 'Pending release',
  released: 'Released',
  acknowledged: 'Acknowledged',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
}

export function Readiness() {
  const nav = useNavigate()
  const role = useRole()
  const programs = useApp((s) => s.programs)
  const boqExtra = useApp((s) => s.boqExtra)
  const reservations = useApp((s) => s.reservations)
  const pos = useApp((s) => s.pos)
  const prepositioned = useApp((s) => s.prepositioned)
  const releasePO = useApp((s) => s.releasePO)
  const approvePreposition = useApp((s) => s.approvePreposition)
  const toast = useApp((s) => s.toast)
  const { all } = useForecast()
  const D = db()
  const skuMeta = useMemo(() => new Map(D.meta.skus.map((s) => [s.sku, s])), [D])
  const whDist = (a: string, b: string) => {
    const A = D.meta.warehouses.find((w) => w.warehouse_id === a)
    const B = D.meta.warehouses.find((w) => w.warehouse_id === b)
    return A && B ? Math.hypot(A.lon - B.lon, A.lat - B.lat) : 99
  }
  const whName = (id: string) => D.meta.warehouses.find((w) => w.warehouse_id === id)?.name.split(' ')[0] ?? id

  // Stock with session reservations (raw), then suggestions, then approved transfers applied for display.
  const stock = useMemo(() => stockRows(reservations), [reservations])
  const belowBy = useMemo(() => {
    const m = new Map<string, StockRow[]>()
    for (const w of D.meta.warehouses) m.set(w.warehouse_id, [])
    for (const r of stock) if (r.below) m.get(r.warehouse_id)!.push(r)
    return m
  }, [stock, D])
  // Semarang is the Java hub and the PROC persona's focus warehouse (PRD §4).
  const worstId = 'WH-SMG'
  const worstRows = belowBy.get(worstId) ?? []
  const otherBelow = [...belowBy.entries()].filter(([k]) => k !== worstId)
  const otherBelowN = otherBelow.reduce((s, [, v]) => s + v.length, 0)
  const otherTop = otherBelow.sort((a, b) => b[1].length - a[1].length)[0]

  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = []
    const find = (wh: string, sku: string) => stock.find((r) => r.warehouse_id === wh && r.sku === sku)
    // (1) top up SKUs below reorder at the worst warehouse from the warehouse with the most surplus
    for (const r of worstRows) {
      // Nearest warehouse that can restore the reorder point without dropping below its own; else the largest surplus.
      const gap = r.reorder_point - r.free
      const donors = stock
        .filter((x) => x.sku === r.sku && x.warehouse_id !== r.warehouse_id)
        .map((x) => ({ x, surplus: x.free - x.reorder_point, dist: whDist(x.warehouse_id, r.warehouse_id) }))
        .sort((a, b) => Number(b.surplus >= gap) - Number(a.surplus >= gap) || a.dist - b.dist || b.surplus - a.surplus)
      const d = donors[0]
      if (!d || d.surplus <= 0) continue
      const qty = Math.min(d.surplus, Math.max(1, r.reorder_point * 2 - r.free))
      out.push({
        key: `PP-${r.sku}-${d.x.warehouse_id}-${r.warehouse_id}`,
        title: `Top up ${r.sku} at ${whName(r.warehouse_id)}`,
        detail: `Move ${qty} × ${r.sku} ${whName(d.x.warehouse_id)} → ${whName(r.warehouse_id)}`,
        why: `${r.free} free vs reorder point ${r.reorder_point}; ${whName(d.x.warehouse_id)} has ${d.x.free} free (${d.surplus} above its reorder point)`,
        sku: r.sku,
        qty,
        from: d.x.warehouse_id,
        to: r.warehouse_id,
        value: qty * (skuMeta.get(r.sku)?.unit_cost_idr ?? 0),
      })
    }
    // (2) antennas to Cikarang ahead of the Bekasi plan
    const bid = D.meta.story_incidents.bekasi_capacity
    const bekasiProg = programs.find((p) => p.source_incident === bid)
    const smgAnt = find('WH-SMG', 'ANT-MB-4T4R')
    if (smgAnt) {
      const qty = smgAnt.on_hand - smgAnt.reserved
      if (qty > 0)
        out.push({
          key: 'PP-ANT-MB-4T4R-WH-SMG-WH-CKR',
          title: 'Stage antennas at Cikarang for Bekasi',
          detail: `Move ${qty} × ANT-MB-4T4R Semarang → Cikarang`,
          why: bekasiProg
            ? `Reserved for ${bekasiProg.program_id} (${bid}); staging at Cikarang cuts wave-1 transfer from 3 days to 1`
            : `Ahead of the Bekasi sector-add plan (${bid}, 14 sites, saturation in 23 days); Cikarang has 0 free`,
          sku: 'ANT-MB-4T4R',
          qty,
          from: 'WH-SMG',
          to: 'WH-CKR',
          value: qty * (skuMeta.get('ANT-MB-4T4R')?.unit_cost_idr ?? 0),
        })
    }
    // (3) batteries for the largest uncovered power cluster by region
    const pw = all.filter((r) => r.cls === 'power' && !r.covered)
    const byRegion = new Map<string, number>()
    for (const r of pw) byRegion.set(r.region, (byRegion.get(r.region) ?? 0) + 1)
    const topR = [...byRegion.entries()].sort((a, b) => b[1] - a[1])[0]
    if (topR) {
      const home = D.meta.warehouses.find((w) => w.region === topR[0]) ?? D.meta.warehouses[0]
      const need = topR[1]
      const donors = stock
        .filter((x) => x.sku === 'BAT-LI-200' && x.warehouse_id !== home.warehouse_id && x.warehouse_id !== worstId)
        .sort((a, b) => Number(b.free - b.reorder_point >= need) - Number(a.free - a.reorder_point >= need) || whDist(a.warehouse_id, home.warehouse_id) - whDist(b.warehouse_id, home.warehouse_id))
      const d = donors[0]
      const qty = d ? Math.min(need, d.free - d.reorder_point) : 0
      if (d && qty > 0)
        out.push({
          key: `PP-BAT-LI-200-${d.warehouse_id}-${home.warehouse_id}`,
          title: `Batteries for ${topR[0]} power predictions`,
          detail: `Move ${qty} × BAT-LI-200 ${whName(d.warehouse_id)} → ${whName(home.warehouse_id)}`,
          why: `${need} uncovered power-failure predictions in ${topR[0]} inside 8 weeks; pre-positioned stock lets Stage 5 auto-approve (as done for the Central Java cluster at Semarang)`,
          sku: 'BAT-LI-200',
          qty,
          from: d.warehouse_id,
          to: home.warehouse_id,
          value: qty * (skuMeta.get('BAT-LI-200')?.unit_cost_idr ?? 0),
        })
    }
    return out.slice(0, 5)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock, worstRows, programs, all])

  const approvedSet = new Set(prepositioned)
  const inbound = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of suggestions) {
      if (!approvedSet.has(s.key)) continue
      m.set(`${s.to}|${s.sku}`, (m.get(`${s.to}|${s.sku}`) ?? 0) + s.qty)
      m.set(`${s.from}|${s.sku}`, (m.get(`${s.from}|${s.sku}`) ?? 0) - s.qty)
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, prepositioned])

  // Demand forecast
  const freeNational = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of stock) m.set(r.sku, (m.get(r.sku) ?? 0) + Math.max(0, r.free))
    return m
  }, [stock])
  const uncovered = useMemo(() => all.filter((r) => !r.covered), [all])
  const demand = useMemo(() => demandForecast(programs, boqExtra, uncovered, freeNational), [programs, boqExtra, uncovered, freeNational])
  const chart = WEEKS.map((k) => ({
    week: `W+${k}`,
    pipeline: demand.reduce((s, r) => s + r.pipeline[k - 1] * (skuMeta.get(r.sku)?.unit_cost_idr ?? 0), 0) / 1e9,
    predicted: demand.reduce((s, r) => s + r.predicted[k - 1] * (skuMeta.get(r.sku)?.unit_cost_idr ?? 0), 0) / 1e9,
  }))
  const demandValue = chart.reduce((s, c) => s + c.pipeline + c.predicted, 0) * 1e9
  const predictedValue = chart.reduce((s, c) => s + c.predicted, 0) * 1e9
  const shortSkus = demand.filter((r) => r.total > r.free).length

  const openPos = useMemo(
    () => pos.filter((p) => OPEN_PO.has(p.status)).sort((a, b) => Number(b.status === 'pending_release') - Number(a.status === 'pending_release') || a.due.localeCompare(b.due)),
    [pos],
  )
  const pending = openPos.filter((p) => p.status === 'pending_release')
  const canRelease = role.role_code === 'PROC' || role.role_code === 'DEPLOY' || role.role_code === 'EXEC'
  const [wh, setWh] = useState<string>(worstId)
  const whRows = stock.filter((r) => r.warehouse_id === wh).map((r) => ({ ...r, inbound: inbound.get(`${r.warehouse_id}|${r.sku}`) ?? 0 }))
  const sortedWh = [...whRows].sort((a, b) => Number(b.free + b.inbound < b.reorder_point) - Number(a.free + a.inbound < a.reorder_point) || a.category.localeCompare(b.category) || a.sku.localeCompare(b.sku))
  const toppedUp = worstRows.filter((r) => (inbound.get(`${r.warehouse_id}|${r.sku}`) ?? 0) > 0).length
  const suggPending = suggestions.filter((s) => !approvedSet.has(s.key)).length
  const worstName = whName(worstId)
  const vendorShort = (id: string) => D.vendors.find((v) => v.vendor_id === id)?.short ?? id

  return (
    <div className="space-y-4 p-6">
      <section className="border border-line bg-panel">
        <div className="px-5 pb-3 pt-4">
          <div className="flex items-center gap-2">
            <Label>Procurement and Warehouse · national, by SKU</Label>
            <Fresh f="D-1" asOf={D.meta.as_of} />
          </div>
          <div className="tnum mt-1.5 text-[22px] font-semibold leading-8 tracking-tight">
            BOQ demand forecast for 8 weeks by SKU<span className="mx-2 text-faint">·</span>
            <span className={worstRows.length ? 'text-warn' : 'text-ok'}>{worstRows.length}</span> SKUs below reorder point in {worstName}
            {toppedUp > 0 && <span className="ml-2 text-base font-medium text-ok">· {toppedUp} top-up{toppedUp === 1 ? '' : 's'} in transit</span>}
          </div>
          <div className="mt-1 text-sm text-muted">
            Decision today:{' '}
            <b className="text-ink">
              Release {pending.length} PO{pending.length === 1 ? '' : 's'} and approve pre-positioning
            </b>
            {pending.length === 0 && suggPending === 0 ? <span className="text-ok"> · all done for today</span> : <> · {suggPending} pre-positioning move{suggPending === 1 ? '' : 's'} waiting</>}
            <span className="text-faint"> · </span>
            {otherBelowN} more SKU-warehouse pairs below reorder nationally{otherTop && otherTop[1].length ? <> (most in {whName(otherTop[0])}: {otherTop[1].length})</> : null}
          </div>
        </div>
        <div className="grid grid-cols-5 divide-x divide-line border-t border-line">
          <RStat label="8-wk hardware demand" value={idr(demandValue)} sub={`${demand.length} SKUs · pipeline + predicted`} />
          <RStat label="From predictions" value={idr(predictedValue)} sub={`${uncovered.length} uncovered predicted sites`} tone="yellow" />
          <RStat label="SKUs short vs free stock" value={num(shortSkus)} sub="8-week demand > national free" tone={shortSkus ? 'warn' : 'ok'} />
          <RStat label="POs pending release" value={num(pending.length)} sub={pending.length ? idr(pending.reduce((s, p) => s + p.amount_idr, 0)) : 'None'} tone={pending.length ? 'warn' : 'ok'} />
          <RStat label="Pre-positioning" value={`${suggestions.length - suggPending} / ${suggestions.length}`} sub="Moves approved" tone={suggPending ? undefined : 'ok'} />
        </div>
      </section>

      <div className="grid grid-cols-12 gap-4">
        {/* Open POs */}
        <Panel className="col-span-12 xl:col-span-7" title={`Open purchase orders · ${openPos.length}`} right={<Fresh f="live" />} pad={false}>
          <div className="max-h-[330px] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>PO</Th>
                  <Th>Program</Th>
                  <Th>Vendor</Th>
                  <Th>Category</Th>
                  <Th className="text-right">Amount</Th>
                  <Th>Due</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Decision</Th>
                </tr>
              </thead>
              <tbody>
                {openPos.map((p) => (
                  <tr key={p.po_id} className={clsx('hover:bg-panel2', p.status === 'pending_release' && 'bg-warn/[0.05]')}>
                    <Td>
                      <Id className="text-ink">{p.po_id}</Id>
                    </Td>
                    <Td>
                      <Id onClick={() => nav(`/programs/${p.program_id}`)} className="hover:underline">
                        {p.program_id}
                      </Id>
                    </Td>
                    <Td className="text-muted">{vendorShort(p.vendor)}</Td>
                    <Td className="max-w-[120px] truncate text-muted">{p.category}</Td>
                    <Td className="tnum text-right">{idr(p.amount_idr)}</Td>
                    <Td className="tnum text-muted">{dateShort(p.due)}</Td>
                    <Td>
                      <Badge tone={PO_TONE[p.status]}>{PO_LABEL[p.status]}</Badge>
                    </Td>
                    <Td className="text-right">
                      {p.status === 'pending_release' ? (
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={!canRelease}
                          title={canRelease ? undefined : 'Procurement decision'}
                          onClick={() => {
                            releasePO(p.po_id)
                            toast(`${p.po_id} released to ${vendorShort(p.vendor)} · ${idr(p.amount_idr)}`)
                          }}
                        >
                          Release
                        </Button>
                      ) : p.issued ? (
                        <span className="tnum text-xs text-faint">issued {dateShort(p.issued)}</span>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Pre-positioning */}
        <Panel className="col-span-12 xl:col-span-5" title="Pre-positioning suggestions · Warehouse Readiness Agent" right={<Truck size={14} className="text-faint" />} pad={false}>
          {suggestions.length === 0 ? (
            <Empty>No pre-positioning moves suggested.</Empty>
          ) : (
            <div className="divide-y divide-line/70">
              {suggestions.map((s) => {
                const done = approvedSet.has(s.key)
                return (
                  <div key={s.key} className={clsx('flex items-start gap-3 px-4 py-2.5', done && 'bg-ok/[0.04]')}>
                    <PackageCheck size={16} className={clsx('mt-0.5 shrink-0', done ? 'text-ok' : 'text-ioh-yellow')} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold">{s.title}</span>
                      </div>
                      <div className="tnum flex items-center gap-1.5 text-xs text-ink">
                        {s.detail.split('→')[0]}
                        <ArrowRight size={11} className="text-faint" />
                        {s.detail.split('→')[1]}
                        <span className="text-faint">· {idr(s.value)}</span>
                      </div>
                      <div className="text-xs text-muted">{s.why}</div>
                    </div>
                    {done ? (
                      <Badge tone="ok">
                        <CheckCircle2 size={11} /> Approved
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant={role.role_code === 'PROC' ? 'primary' : 'default'}
                        onClick={() => {
                          approvePreposition(s.key, s.detail)
                          toast(`Pre-positioning approved: ${s.detail}`)
                        }}
                      >
                        Approve
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Panel>
      </div>

      {/* Demand forecast */}
      <div className="grid grid-cols-12 gap-4">
        <Panel className="col-span-12 2xl:col-span-4" title="Hardware demand by week · IDR bn" right={<Fresh f="D-1" asOf={D.meta.as_of} />}>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="week" {...AXIS} />
                <YAxis {...AXIS} tickFormatter={(v: number) => v.toFixed(1)} />
                <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [`IDR ${v.toFixed(2)}bn`, n === 'pipeline' ? 'Pipeline programs' : 'Predicted, uncovered']} />
                <Bar dataKey="pipeline" stackId="a" fill="#8B5CF6" isAnimationActive={false} />
                <Bar dataKey="predicted" stackId="a" fill="#FFD100" isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-prog" /> Pipeline programs (BOQ lines)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 bg-ioh-yellow" /> Predicted, not yet in a program
            </span>
          </div>
          <div className="mt-2 text-xs text-faint">Pipeline qty spread evenly from today to each program's forecast RFS (stages Decision to Material dispatch). Predicted demand uses the class default BOQ template, needed 2 weeks before the crossing week.</div>
        </Panel>
        <Panel className="col-span-12 2xl:col-span-8" title="BOQ demand forecast · units by SKU, W+1 to W+8" right={<span className="text-xs text-faint">Cover = national free stock vs 8-week demand</span>} pad={false}>
          <div className="max-h-[330px] overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <Th>SKU</Th>
                  {WEEKS.map((k) => (
                    <Th key={k} className="text-right">
                      <div>W+{k}</div>
                      <div className="font-normal normal-case tracking-normal">{dateShort(D.weekEndDates[k - 1])}</div>
                    </Th>
                  ))}
                  <Th className="text-right">Total</Th>
                  <Th className="text-right">Free</Th>
                  <Th>Cover</Th>
                </tr>
              </thead>
              <tbody>
                {demand.map((r) => {
                  const ratio = r.free / Math.max(0.01, r.total)
                  const tone = ratio >= 1 ? 'ok' : ratio >= 0.5 ? 'warn' : 'bad'
                  return (
                    <tr key={r.sku} className="hover:bg-panel2">
                      <Td className="max-w-[210px]">
                        <Id className="text-ink">{r.sku}</Id>
                        <div className="truncate text-[10.5px] text-faint">{r.description}</div>
                      </Td>
                      {WEEKS.map((k) => {
                        const v = r.pipeline[k - 1] + r.predicted[k - 1]
                        return (
                          <Td key={k} className={clsx('tnum text-right', v ? 'text-ink' : 'text-faint')} title={v ? `Pipeline ${r.pipeline[k - 1].toFixed(1)} · predicted ${r.predicted[k - 1]}` : undefined}>
                            {v ? (
                              <span className={r.predicted[k - 1] > r.pipeline[k - 1] ? 'text-ioh-yellow' : ''}>{v >= 10 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')}</span>
                            ) : (
                              '·'
                            )}
                          </Td>
                        )
                      })}
                      <Td className="tnum text-right font-semibold">{Math.round(r.total)}</Td>
                      <Td className="tnum text-right text-muted">{r.free}</Td>
                      <Td>
                        <Badge tone={tone}>{tone === 'ok' ? 'Covered' : tone === 'warn' ? 'Partial' : 'Short'}</Badge>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>

      {/* Stock by warehouse */}
      <Panel
        title="Stock by warehouse"
        right={
          <span className="flex items-center gap-2 text-xs text-muted">
            Free = on hand − reserved − session reservations
            <Fresh f="D-1" asOf={D.meta.as_of} />
          </span>
        }
        pad={false}
      >
        <div className="grid grid-cols-4 border-b border-line lg:grid-cols-8">
          {D.meta.warehouses.map((w) => {
            const n = belowBy.get(w.warehouse_id)!.length
            return (
              <button
                key={w.warehouse_id}
                onClick={() => setWh(w.warehouse_id)}
                className={clsx('-mb-px flex min-w-0 flex-col items-start border-b-2 px-3 py-2 text-left', wh === w.warehouse_id ? 'border-ioh-yellow bg-panel2' : 'border-transparent hover:bg-panel2')}
              >
                <span className={clsx('text-sm font-semibold', wh === w.warehouse_id ? 'text-ink' : 'text-muted')}>{w.name.split(' (')[0]}</span>
                <span className="flex w-full items-center gap-1.5 truncate text-[10.5px] text-faint">
                  <span className="font-mono">{w.warehouse_id}</span>
                  {n > 0 && <span className="tnum bg-warn px-1 font-semibold text-canvas">{n} below</span>}
                </span>
              </button>
            )
          })}
        </div>
        <div className="max-h-[420px] overflow-y-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reserved</Th>
                <Th className="text-right">Session res.</Th>
                <Th className="text-right">Free</Th>
                <Th className="text-right">In transit</Th>
                <Th className="text-right">Reorder pt</Th>
                <Th className="text-right">Lead</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {sortedWh.map((r) => {
                const below = r.free + r.inbound < r.reorder_point
                const fixed = r.below && !below
                return (
                  <tr key={r.sku} className={clsx('hover:bg-panel2', below && 'bg-warn/[0.06]')}>
                    <Td>
                      <Id className="text-ink">{r.sku}</Id>
                    </Td>
                    <Td className="max-w-[240px] truncate">{r.description}</Td>
                    <Td className="text-muted">{r.category}</Td>
                    <Td className="tnum text-right">{r.on_hand}</Td>
                    <Td className="tnum text-right text-muted">{r.reserved}</Td>
                    <Td className={clsx('tnum text-right', r.session ? 'text-ioh-yellow' : 'text-faint')}>{r.session || '—'}</Td>
                    <Td className={clsx('tnum text-right font-semibold', r.free < r.reorder_point ? 'text-warn' : 'text-ink')}>{r.free}</Td>
                    <Td className={clsx('tnum text-right', r.inbound > 0 ? 'text-ok' : r.inbound < 0 ? 'text-muted' : 'text-faint')}>{r.inbound > 0 ? `+${r.inbound}` : r.inbound < 0 ? `−${-r.inbound}` : '—'}</Td>
                    <Td className="tnum text-right text-muted">{r.reorder_point}</Td>
                    <Td className="tnum text-right text-muted">{r.lead_days} d</Td>
                    <Td>{below ? <Badge tone="warn">Below reorder</Badge> : fixed ? <Badge tone="ok">Top-up approved</Badge> : <span className="text-xs text-faint">OK</span>}</Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="text-xs text-faint">Stock snapshot as of {date(D.meta.as_of)}. Approved pre-positioning shows as in transit until the warehouse confirms receipt.</div>
    </div>
  )
}

function RStat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'yellow' }) {
  const tc = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'yellow' ? 'text-ioh-yellow' : 'text-ink'
  return (
    <div className="min-w-0 px-5 py-2.5">
      <div className="truncate text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={clsx('tnum truncate text-lg font-semibold leading-7', tc)}>{value}</div>
      {sub && <div className="truncate text-xs text-muted">{sub}</div>}
    </div>
  )
}

