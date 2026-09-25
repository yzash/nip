import { db } from '@/data/db'
import type { InterventionClass, Program, Region, Vendor, WarehouseStock } from '@/data/types'
import { addDays } from './format'

// Plan builder (PRD §6 M4, §8): BOQ, stock check, vendor allocation, PO draft, target RFS
// and critical path. Stages 4, 5 and 6 (+6b tower company) run in parallel once Stage 3 is
// approved; Stage 7 is the critical path.

export const INTERVENTIONS: Record<string, { label: string; template: string; class: InterventionClass; towerco: boolean; installDays: number }> = {
  sector_add: { label: 'Sector add', template: 'sector_add', class: 'capex_minor', towerco: true, installDays: 10 },
  carrier_add: { label: 'Carrier add', template: 'carrier_add', class: 'capex_minor', towerco: false, installDays: 5 },
  new_site: { label: 'New site', template: 'new_site', class: 'capex_major', towerco: true, installDays: 70 },
  refarm: { label: 'Spectrum refarming', template: 'refarm', class: 'noncapex_zero', towerco: false, installDays: 3 },
  power: { label: 'Battery swap', template: 'power', class: 'noncapex_opex', towerco: false, installDays: 5 },
  solar: { label: 'Solar / Li-ion retrofit', template: 'solar', class: 'capex_minor', towerco: false, installDays: 14 },
  transport: { label: 'Microwave capacity upgrade', template: 'transport', class: 'capex_minor', towerco: true, installDays: 10 },
  fibre: { label: 'Fibre build', template: 'fibre', class: 'capex_major', towerco: false, installDays: 90 },
  ran_swap: { label: 'RAN modernisation swap', template: 'ran_swap', class: 'capex_minor', towerco: false, installDays: 14 },
  flood: { label: 'Site hardening', template: 'flood', class: 'capex_minor', towerco: false, installDays: 10 },
  small_cell: { label: 'Small cell', template: 'small_cell', class: 'capex_minor', towerco: false, installDays: 10 },
  '5g_add': { label: '5G AAU add', template: '5g_add', class: 'capex_minor', towerco: true, installDays: 12 },
}

export function interventionFromOption(name: string): string {
  const n = name.toLowerCase()
  if (n.includes('sector add')) return 'sector_add'
  if (n.includes('carrier add')) return 'carrier_add'
  if (n.startsWith('new site')) return 'new_site'
  if (n.includes('refarm') || n.includes('parameter')) return 'refarm'
  if (n.includes('battery swap')) return 'power'
  if (n.includes('solar')) return 'solar'
  if (n.includes('microwave')) return 'transport'
  if (n.includes('fibre')) return 'fibre'
  if (n.includes('modernisation')) return 'ran_swap'
  if (n.includes('hardening')) return 'flood'
  return 'refarm'
}

export interface BoqAgg {
  sku: string
  description: string
  category: string
  qty: number
  unit_cost_idr: number
  total_idr: number
  lead_days: number
}
export interface StockCheck {
  sku: string
  description: string
  needed: number
  sources: { warehouse_id: string; warehouse: string; qty: number; transfer_days: number }[]
  shortfall: number
  lead_days: number
  readiness: 'green' | 'amber' | 'red'
  note: string
}
export interface PathItem {
  lane: string
  stage: string
  start: number
  end: number
  critical: boolean
  note?: string
}
export interface PlanDraft {
  id: string
  name: string
  source_incident: string | null
  site_ids: string[]
  region: Region
  district_label: string
  intervention: string
  intervention_label: string
  capex_class: InterventionClass
  boq: BoqAgg[]
  stock: StockCheck[]
  vendor: { vendor: Vendor; free_capacity: number; alternatives: { vendor: Vendor; free_capacity: number }[] }
  po_lines: { sku: string; description: string; qty: number; amount_idr: number }[]
  po_hardware_idr: number
  po_services_idr: number
  capex_total_idr: number
  target_rfs: string
  rfs_days: number
  critical_path: PathItem[]
  tower_companies: string[]
  bridge: { label: string; days: number } | null
  window_days: number | null
  approval_chain: { gate: string; role: string; label: string; state: 'done' | 'auto' | 'pending' | 'external' | 'later' }[]
}

const WH_REGION: Record<string, Region[]> = {
  'WH-CKR': ['Jabodetabek', 'Java'],
  'WH-SMG': ['Java'],
  'WH-SBY': ['Java', 'Bali Nusra'],
  'WH-MDN': ['Sumatra'],
  'WH-PLB': ['Sumatra'],
  'WH-BPN': ['Kalimantan'],
  'WH-MKS': ['Sulawesi'],
  'WH-JYP': ['Papua Maluku'],
}

function dist(a: [number, number], b: [number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1])
}

export function vendorLoad(programs: Program[], vendorId: string): number {
  const inflight = programs.filter(
    (p) => p.vendor_id === vendorId && ['PO', 'Vendor allocation', 'Material dispatch', 'Installation', 'Integration'].includes(p.stage),
  )
  return Math.round(inflight.reduce((s, p) => s + (p.sites_planned - p.sites_rfs), 0) / 2)
}

export function buildPlan(opts: {
  siteIds: string[]
  intervention: string
  sourceIncident?: string | null
  programs: Program[]
  reservations: { warehouse_id: string; sku: string; qty: number }[]
  windowDays?: number | null
  today: string
  nextProgramId: string
}): PlanDraft {
  const D = db()
  const iv = INTERVENTIONS[opts.intervention] ?? INTERVENTIONS.refarm
  const sites = opts.siteIds.map((id) => D.sites[D.siteIdx.get(id)!])
  const n = sites.length
  const region = sites[0].region
  const cx = sites.reduce((s, x) => s + x.lon, 0) / n
  const cy = sites.reduce((s, x) => s + x.lat, 0) / n
  const dnames = [...new Set(sites.map((s) => D.distById[s.district_id].name))]
  const district_label = dnames.length === 1 ? dnames[0] : `${D.provById[sites[0].province_id].name} (${dnames.length} districts)`

  // BOQ aggregated by SKU
  const tmpl = D.meta.boq_templates[iv.template] ?? []
  const skuMeta = Object.fromEntries(D.meta.skus.map((s) => [s.sku, s]))
  const boq: BoqAgg[] = tmpl
    .map(([sku, q]) => {
      const m = skuMeta[sku]
      const qty = (q || 1) * n
      return { sku, description: m.description, category: m.category, qty, unit_cost_idr: m.unit_cost_idr, total_idr: qty * m.unit_cost_idr, lead_days: m.lead_days }
    })
    .filter((b) => b.qty > 0)

  // Stock check: nearest warehouse in region first, then cross-region transfers, then PO.
  const whs = D.meta.warehouses
    .map((w) => ({ ...w, d: dist([w.lon, w.lat], [cx, cy]), home: WH_REGION[w.warehouse_id]?.includes(region) }))
    .sort((a, b) => Number(b.home) - Number(a.home) || a.d - b.d)
  const free = (w: WarehouseStock) =>
    w.on_hand - w.reserved - opts.reservations.filter((r) => r.warehouse_id === w.warehouse_id && r.sku === w.sku).reduce((s, r) => s + r.qty, 0)
  const stock: StockCheck[] = []
  for (const b of boq) {
    if (b.category === 'Service') continue
    let need = b.qty
    const sources: StockCheck['sources'] = []
    for (const w of whs) {
      const rec = D.stock.find((s) => s.warehouse_id === w.warehouse_id && s.sku === b.sku)
      if (!rec) continue
      const f = Math.max(0, free(rec))
      if (f <= 0) continue
      const take = Math.min(f, need)
      sources.push({ warehouse_id: w.warehouse_id, warehouse: w.name, qty: take, transfer_days: w.home && w.d < 1 ? 1 : Math.max(2, Math.round(w.d * 0.9)) })
      need -= take
      if (need <= 0) break
    }
    const cross = sources.some((s) => s.transfer_days > 1)
    const readiness: StockCheck['readiness'] = need > 0 ? (b.lead_days > 28 ? 'red' : 'amber') : cross ? 'amber' : 'green'
    const note =
      need > 0
        ? `${sources.reduce((s, x) => s + x.qty, 0)} of ${b.qty} in stock${sources.length ? ` (${sources.map((s) => `${s.warehouse.split(' ')[0]} ${s.qty}`).join(', ')})` : ''}; PO ${need} × ${b.lead_days} d lead`
        : cross
          ? `Transfer from ${sources.filter((s) => s.transfer_days > 1).map((s) => s.warehouse.split(' ')[0]).join(', ')}`
          : `Ready at ${sources[0]?.warehouse.split(' ')[0] ?? '—'}`
    stock.push({ sku: b.sku, description: b.description, needed: b.qty, sources, shortfall: Math.max(0, need), lead_days: b.lead_days, readiness, note })
  }

  // Vendor allocation: regional vendors ranked by free capacity x SLA.
  const cands = D.vendors
    .filter((v) => v.regions.includes(region))
    .map((v) => ({ vendor: v, free_capacity: v.capacity_sites_per_month - vendorLoad(opts.programs, v.vendor_id) }))
    .sort((a, b) => b.free_capacity * b.vendor.sla_pct - a.free_capacity * a.vendor.sla_pct)
  const vendor = cands[0] ?? { vendor: D.vendors[0], free_capacity: 0 }

  // PO lines: hardware shortfall + all services.
  const po_lines = [
    ...stock.filter((s) => s.shortfall > 0).map((s) => ({ sku: s.sku, description: s.description, qty: s.shortfall, amount_idr: s.shortfall * skuMeta[s.sku].unit_cost_idr })),
    ...boq.filter((b) => b.category === 'Service').map((b) => ({ sku: b.sku, description: b.description, qty: b.qty, amount_idr: b.total_idr })),
  ]
  const po_hardware_idr = po_lines.filter((l) => !l.sku.startsWith('SVC')).reduce((s, l) => s + l.amount_idr, 0)
  const po_services_idr = po_lines.filter((l) => l.sku.startsWith('SVC')).reduce((s, l) => s + l.amount_idr, 0)
  const capex_total_idr = boq.reduce((s, b) => s + b.total_idr, 0)

  // Critical path (days from today). Decision 2 d, then parallel lanes.
  const dec = 2
  const maxTransfer = Math.max(0, ...stock.flatMap((s) => s.sources.map((x) => x.transfer_days)))
  const shortLead = Math.max(0, ...stock.filter((s) => s.shortfall > 0).map((s) => Math.min(s.lead_days, 21)))
  const towerco = iv.towerco ? 10 : 0
  const poEnd = dec + 3
  const vendorEnd = dec + 1
  const boqEnd = dec + 1
  const wave1Start = Math.max(dec + maxTransfer + 1, dec + towerco, vendorEnd)
  const installDays = iv.installDays
  const hasShort = shortLead > 0
  const wave2Ready = hasShort ? poEnd + shortLead : 0
  const wave1End = wave1Start + installDays
  const wave2End = hasShort ? Math.max(wave1End, wave2Ready) + Math.max(4, Math.round(installDays * 0.55)) : wave1End
  const integEnd = Math.max(wave1End, wave2End) + 2
  const rfsEnd = integEnd + 2
  const path: PathItem[] = [
    { lane: 'Decision', stage: '3. Decision', start: 0, end: dec, critical: true },
    { lane: 'BOQ', stage: '4. BOQ', start: dec, end: boqEnd, critical: false, note: 'BOQ Agent draft, variance check vs price book' },
    { lane: 'PO & stock', stage: '5. PO and stock', start: dec, end: poEnd, critical: false, note: 'Release PO for shortfall; reserve stock' },
    { lane: 'Vendor', stage: '6. Vendor allocation', start: dec, end: vendorEnd, critical: false, note: vendor.vendor.name },
  ]
  if (iv.towerco) path.push({ lane: 'Tower co', stage: '6b. Tower company access', start: dec, end: dec + towerco, critical: towerco + dec >= dec + maxTransfer + 1, note: 'Loading feasibility and access, drafted at approval' })
  if (maxTransfer) path.push({ lane: 'Dispatch', stage: 'Material dispatch', start: dec, end: dec + maxTransfer + 1, critical: false, note: 'Warehouse transfers' })
  if (hasShort) path.push({ lane: 'PO delivery', stage: 'PO delivery (shortfall)', start: poEnd, end: wave2Ready, critical: true, note: `Supplier lead ${shortLead} d` })
  path.push({ lane: 'Build', stage: hasShort ? '7. Build — wave 1 (stock)' : '7. Build and integrate', start: wave1Start, end: wave1End, critical: !hasShort })
  if (hasShort) path.push({ lane: 'Build', stage: '7. Build — wave 2 (PO)', start: Math.max(wave1End, wave2Ready), end: wave2End, critical: true })
  path.push({ lane: 'Integrate', stage: 'Integration', start: Math.max(wave1End, wave2End), end: integEnd, critical: true })
  path.push({ lane: 'RFS', stage: '8. RFS acceptance', start: integEnd, end: rfsEnd, critical: true })

  const towerCos = [...new Set(sites.map((s) => s.tower_company).filter((t) => t && t !== 'IOH-owned' && t !== 'Building owner'))]
  const windowDays = opts.windowDays ?? null
  const bridge = windowDays !== null && rfsEnd > windowDays && iv.class !== 'noncapex_zero' ? { label: 'Refarm 2G/4G spectrum to the loaded band (zero CapEx)', days: 7 } : null
  const chain: PlanDraft['approval_chain'] = [
    { gate: 'Stage 3 · Decision', role: iv.class === 'capex_major' ? 'EXEC' : iv.class === 'capex_minor' ? 'PLAN' : 'REGION', label: iv.class === 'capex_major' ? 'Head of Network' : iv.class === 'capex_minor' ? 'Head of Planning' : 'Regional Network Manager', state: opts.sourceIncident ? 'done' : 'pending' },
    { gate: 'Stage 4 · BOQ variance', role: 'DEPLOY', label: 'Deployment lead (variance > 10%)', state: 'auto' },
    { gate: 'Stage 5 · PO release', role: 'PROC', label: 'Procurement', state: 'pending' },
    { gate: 'Stage 6 · Vendor allocation', role: 'DEPLOY', label: 'Deployment lead', state: 'pending' },
  ]
  if (iv.towerco) chain.push({ gate: 'Stage 6b · Tower company access', role: 'EXT', label: towerCos.join(', ') || 'Tower company', state: 'external' })
  chain.push({ gate: 'Stage 8 · RFS acceptance', role: 'DEPLOY', label: 'Deployment lead', state: 'later' })

  return {
    id: opts.nextProgramId,
    name: `${district_label} ${iv.label === 'Sector add' ? 'Capacity Relief — Sector Add' : iv.label}`,
    source_incident: opts.sourceIncident ?? null,
    site_ids: opts.siteIds,
    region,
    district_label,
    intervention: opts.intervention,
    intervention_label: iv.label,
    capex_class: iv.class,
    boq,
    stock,
    vendor: { vendor: vendor.vendor, free_capacity: vendor.free_capacity, alternatives: cands.slice(1) },
    po_lines,
    po_hardware_idr,
    po_services_idr,
    capex_total_idr,
    target_rfs: addDays(opts.today, rfsEnd),
    rfs_days: rfsEnd,
    critical_path: path,
    tower_companies: towerCos,
    bridge,
    window_days: windowDays,
    approval_chain: chain,
  }
}
