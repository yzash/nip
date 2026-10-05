import { addDays } from '@/lib/format'
import { HANDOFFS } from '../../content/golive'
import type { P1Plan } from '../../model'
import { contractId, costCentre, day0, deliveryWarehouse, matCode, sitesByTowerco, towerLoad, wbs } from './shared'

// Hand-off payloads built from the approved plan: the exact fields each target system receives
// (content/golive HANDOFFS), with real values from the plan draft. Nothing is re-keyed.

export type Cell = string | number | string[] | null
export interface Payload {
  target: string
  columns: string[]
  rows: Record<string, Cell>[]
  header: { label: string; value: string }[]
  /** Columns rendered as money / numbers. */
  numeric: string[]
}

export function buildPayload(p: P1Plan, target: string): Payload {
  const d = p.draft
  const spec = HANDOFFS.find((h) => h.id === target)!
  const columns = spec.fields
  const wh = deliveryWarehouse(d)
  const start = day0(d)
  const n = d.site_ids.length
  const build = d.critical_path.find((x) => x.lane === 'Build')
  const buildStart = addDays(start, Math.max(1, (build?.start ?? 2) - 1))
  const decided = p.decided ? p.decided.slice(0, 10) : addDays(start, 2)
  // Hardware is needed when the supplier can land it for build wave 2; services when build starts.
  const poDelivery = d.critical_path.find((x) => x.lane === 'PO delivery')
  const hwNeedBy = poDelivery ? addDays(start, poDelivery.end) : buildStart

  switch (target) {
    case 'HO-ERP': {
      const rows = d.po_lines.map((l) => ({
        plan_id: p.id,
        vendor_id: d.vendor.vendor.vendor_id,
        contract_id: contractId(d.vendor.vendor),
        erp_material_code: matCode(l.sku),
        qty: l.qty,
        unit_price_idr: Math.round(l.amount_idr / l.qty),
        delivery_warehouse: l.sku.startsWith('SVC') ? null : wh.warehouse_id,
        need_by_date: l.sku.startsWith('SVC') ? buildStart : hwNeedBy,
        cost_centre: costCentre(d),
        wbs_element: wbs(p),
      }))
      return {
        target,
        columns,
        rows,
        numeric: ['qty', 'unit_price_idr'],
        header: [
          { label: 'Vendor', value: `${d.vendor.vendor.name} (${d.vendor.vendor.vendor_id})` },
          { label: 'Framework', value: contractId(d.vendor.vendor) },
          { label: 'PO draft total', value: `IDR ${(d.po_hardware_idr + d.po_services_idr).toLocaleString('en-US')}` },
          { label: 'Cost centre · WBS', value: `${costCentre(d)} · ${wbs(p)}` },
        ],
      }
    }
    case 'HO-BOQ': {
      const rows = d.site_ids.flatMap((site) =>
        d.boq.map((b) => ({ plan_id: p.id, site_id: site, sku: b.sku, erp_material_code: matCode(b.sku), qty: b.qty / n, unit_price_idr: b.unit_cost_idr, variance_pct: '0.0' })),
      )
      return {
        target,
        columns,
        rows,
        numeric: ['qty', 'unit_price_idr', 'variance_pct'],
        header: [
          { label: 'Sites × lines', value: `${n} × ${d.boq.length} = ${rows.length} rows` },
          { label: 'BOQ total', value: `IDR ${d.capex_total_idr.toLocaleString('en-US')}` },
          { label: 'Variance vs price book', value: '0.0% (Stage 4 gate auto-pass ≤ 10%)' },
        ],
      }
    }
    case 'HO-VENDOR': {
      const rows = [{ plan_id: p.id, vendor_id: d.vendor.vendor.vendor_id, site_ids: d.site_ids, scope: `${d.intervention_label} × ${n} sites (install, integrate, drive test)`, target_rfs: d.target_rfs }]
      return {
        target,
        columns,
        rows,
        numeric: [],
        header: [
          { label: 'Vendor', value: d.vendor.vendor.name },
          { label: 'Free capacity', value: `${d.vendor.free_capacity} sites/month · SLA ${d.vendor.vendor.sla_pct}%` },
          { label: 'Portal', value: 'Read-only in Phase 1: proposal by structured email' },
        ],
      }
    }
    case 'HO-TOWERCO': {
      const load = towerLoad(d)
      const equip = load.items.map((x) => `${x.perSite}× ${x.sku}`).join(' + ')
      const rows = [...sitesByTowerco(d).entries()].map(([tc, ids]) => ({ plan_id: p.id, tower_company: tc, site_ids: ids, equipment_added: equip || '—', loading_delta_kg: load.kgPerSite, requested_date: decided }))
      return {
        target,
        columns,
        rows,
        numeric: ['loading_delta_kg'],
        header: [
          { label: 'Tower companies', value: `${rows.length} · ${rows.reduce((s, r) => s + r.site_ids.length, 0)} sites` },
          { label: 'Loading delta', value: `+${load.kgPerSite} kg per site (spec-sheet estimate)` },
          { label: 'SLA', value: '10 days fast-track · clock starts on reference' },
        ],
      }
    }
    default: {
      const rows = d.stock.flatMap((s) => s.sources.map((src) => ({ plan_id: p.id, warehouse_id: src.warehouse_id, sku: s.sku, qty: src.qty, to_warehouse: wh.warehouse_id, need_by_date: buildStart })))
      return {
        target,
        columns,
        rows,
        numeric: ['qty'],
        header: [
          { label: 'Reservations', value: `${rows.length} lines · ${rows.reduce((s, r) => s + r.qty, 0)} units` },
          { label: 'Transfers', value: `${rows.filter((r) => r.warehouse_id !== wh.warehouse_id).length} cross-warehouse → ${wh.warehouse_id}` },
          { label: 'Shortfall on PO', value: `${d.stock.reduce((s, x) => s + x.shortfall, 0)} units (ERP)` },
        ],
      }
    }
  }
}
