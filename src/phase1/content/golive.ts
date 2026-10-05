// Phase 1 go-live: the Predictive Planner on live Netra data, all five failure classes,
// ending at an approved plan with BOQ and PO drafts handed off to ERP and the vendor portal.
// Durations and owners are DevX's proposal for agreement with IOH.

export const PHASE1 = {
  name: 'Phase 1 · Predictive Planner',
  weeks: 16,
  boundary: 'Predict → classify (CapEx / non-CapEx) → plan → approve → hand off BOQ and PO drafts. Execution (PO release, installation, RFS) stays in existing tools.',
  outcome: 'First predicted-to-approved plan inside 5 working days, with BOQ and PO drafts accepted by ERP without re-keying.',
}

export interface Workstream {
  id: string
  name: string
  lead: string
  start: number // week
  end: number
  deliverables: string[]
}

export const WORKSTREAMS: Workstream[] = [
  { id: 'WS1', name: 'Data onboarding and quality', lead: 'Netra data engineering', start: 1, end: 8, deliverables: ['OSS PM backfill to 24 months', 'Alarm taxonomy mapping', 'RMS, TNMS, BMKG, InaRISK onboarding', 'Site master quality sprint', 'Ticket root-cause labelling'] },
  { id: 'WS2', name: 'Features and models', lead: 'DevX data science · Netra Model Ops', start: 3, end: 11, deliverables: ['Feature Builder (40 features)', '5 class models with back-test', 'Calibration and explanations', 'Precision gate review per class'] },
  { id: 'WS3', name: 'Planner agents', lead: 'DevX engineering', start: 5, end: 12, deliverables: ['Forecast Orchestrator, Ladder, Match, Priority', 'BOQ, Warehouse, Procurement, Vendor, Tower co agents (draft only)', 'Approval Routing on IOH DoA'] },
  { id: 'WS4', name: 'Planner experience', lead: 'DevX product and design', start: 4, end: 13, deliverables: ['Forecast board, explainer, classification', 'Plan builder and approvals', 'Hand-off and audit'] },
  { id: 'WS5', name: 'Integrations', lead: 'IOH IT · DevX', start: 6, end: 14, deliverables: ['ERP read (price book, contracts, POs)', 'ERP PO-draft interface', 'WMS stock and reservations', 'Vendor portal read', 'SSO and role mapping'] },
  { id: 'WS6', name: 'UAT, training and cutover', lead: 'IOH Network Planning · DevX', start: 12, end: 16, deliverables: ['Parallel run against the current Smart CapEx process (4 weeks)', 'Planner and approver training', 'Go-live and hypercare'] },
]

export const MILESTONES = [
  { week: 2, name: 'Data contracts signed', gate: 'Field-level contracts for every blocking source agreed with owners' },
  { week: 6, name: 'Back-test v1', gate: 'All 5 class models back-tested on 24 months; precision report to Head of Network' },
  { week: 9, name: 'Planner on live data (read-only)', gate: 'Daily forecast and explanations on live Netra data, D-1 by 06:00 WIB' },
  { week: 12, name: 'Plan builder and approvals live in UAT', gate: 'BOQ, stock, vendor and PO drafts generated for real clusters' },
  { week: 14, name: 'ERP hand-off tested', gate: 'PO drafts accepted by ERP in test without re-keying' },
  { week: 16, name: 'Go-live', gate: 'Exit criteria met; parallel run reconciled' },
]

export type GateStatus = 'drives_approvals' | 'advisory' | 'shadow'

// Each class goes live in the product; whether it drives approvals depends on its precision gate.
export const CLASS_GATES: { cls: string; label: string; gateAtGoLive: GateStatus; today: string; toClear: string; blockingSources: string[] }[] = [
  { cls: 'capacity', label: 'Capacity', gateAtGoLive: 'drives_approvals', today: 'Back-test precision 78% (top decile): clears the 70% gate', toClear: 'Keep: monthly recalibration', blockingSources: ['SRC-OSS-PM', 'SRC-CM'] },
  { cls: 'power', label: 'Power', gateAtGoLive: 'drives_approvals', today: '74%: clears the gate on alarm proxies', toClear: 'RMS telemetry raises recall from 58% towards 70%', blockingSources: ['SRC-RMS', 'SRC-FM'] },
  { cls: 'transport', label: 'Transport', gateAtGoLive: 'advisory', today: '69%: 1 pt below the gate', toClear: 'Access-link utilisation, MW fade events and topology from TNMS (WS1, week 8)', blockingSources: ['SRC-TNMS'] },
  { cls: 'ran_hardware', label: 'RAN hardware', gateAtGoLive: 'advisory', today: '66%: below the gate', toClear: 'Unit install dates (site master sprint) and VSWR alarm normalisation', blockingSources: ['SRC-SITE', 'SRC-FM'] },
  { cls: 'environmental', label: 'Environmental', gateAtGoLive: 'shadow', today: '52%: shadow mode, no weather feed yet', toClear: 'BMKG forecasts + InaRISK hazard join, then 3 months of shadow scoring', blockingSources: ['SRC-BMKG', 'SRC-INARISK'] },
]

export const EXIT_CRITERIA = [
  { id: 'EC1', text: 'Back-test precision ≥ 70% at the top decile for every class that drives approvals', metric: 'Model scorecard' },
  { id: 'EC2', text: 'Forecast available by 06:00 WIB on ≥ 98% of days in the last 4 weeks of UAT', metric: 'Run log' },
  { id: 'EC3', text: 'Feature completeness ≥ 98% of sites (missing shown grey, never guessed)', metric: 'Feature Builder report' },
  { id: 'EC4', text: 'Prediction-to-approved plan ≤ 5 working days for the UAT clusters', metric: 'Approval log' },
  { id: 'EC5', text: 'BOQ variance vs final PO ≤ 10% on 90% of UAT plans', metric: 'BOQ vs ERP' },
  { id: 'EC6', text: 'PO drafts accepted by ERP without re-keying', metric: 'ERP interface log' },
  { id: 'EC7', text: 'Named approver for 100% of plans per the IOH DoA matrix', metric: 'Approval Routing' },
  { id: 'EC8', text: 'Revenue exposure method signed off by Finance', metric: 'Sign-off' },
]

export const HANDOFFS = [
  {
    id: 'HO-ERP',
    target: 'ERP · purchase order draft',
    owner: 'Procurement',
    method: 'ERP API (BAPI / IDoc) or CSV file drop, to agree with IOH IT',
    trigger: 'Plan approved',
    ack: 'ERP returns draft PO number; Procurement releases in ERP',
    fields: ['plan_id', 'vendor_id', 'contract_id', 'erp_material_code', 'qty', 'unit_price_idr', 'delivery_warehouse', 'need_by_date', 'cost_centre', 'wbs_element'],
  },
  {
    id: 'HO-BOQ',
    target: 'Deployment PMO · BOQ',
    owner: 'Deployment PMO',
    method: 'XLSX export + API for the PMO tracker',
    trigger: 'Plan approved',
    ack: 'PMO tracker reference',
    fields: ['plan_id', 'site_id', 'sku', 'erp_material_code', 'qty', 'unit_price_idr', 'variance_pct'],
  },
  {
    id: 'HO-VENDOR',
    target: 'Vendor portal · allocation proposal',
    owner: 'Deployment PMO',
    method: 'Portal API or structured email (read-only portal in Phase 1)',
    trigger: 'Plan approved and vendor confirmed',
    ack: 'Vendor accepts capacity',
    fields: ['plan_id', 'vendor_id', 'site_ids', 'scope', 'target_rfs'],
  },
  {
    id: 'HO-TOWERCO',
    target: 'Tower company · access and loading request',
    owner: 'Tower relations',
    method: 'Request document per tower company template',
    trigger: 'Plan approved (loading-changing interventions)',
    ack: 'Tower company reference; SLA clock starts',
    fields: ['plan_id', 'tower_company', 'site_ids', 'equipment_added', 'loading_delta_kg', 'requested_date'],
  },
  {
    id: 'HO-WMS',
    target: 'WMS · stock reservation and transfers',
    owner: 'Supply Chain',
    method: 'Reservation API or daily file',
    trigger: 'Pre-positioning approved',
    ack: 'Reservation id',
    fields: ['plan_id', 'warehouse_id', 'sku', 'qty', 'to_warehouse', 'need_by_date'],
  },
]

export const RACI: { activity: string; R: string; A: string; C: string; I: string }[] = [
  { activity: 'Data contracts and quality', R: 'Netra data engineering', A: 'Head of Netra', C: 'Source owners', I: 'Head of Planning' },
  { activity: 'Prediction models and gates', R: 'DevX data science', A: 'Head of Network Operations', C: 'Netra Model Ops', I: 'Head of Network' },
  { activity: 'Smart CapEx consumption', R: 'DevX', A: 'Head of Planning', C: 'Smart CapEx owner', I: 'Netra' },
  { activity: 'Planner agents and UI', R: 'DevX engineering', A: 'NICC product owner (IOH)', C: 'Planning, Procurement, Deployment', I: 'Head of Network' },
  { activity: 'ERP and WMS integration', R: 'IOH IT · DevX', A: 'Head of Procurement', C: 'Supply Chain', I: 'Deployment PMO' },
  { activity: 'DoA and approval policy', R: 'Network PMO', A: 'Head of Network', C: 'Finance', I: 'All approvers' },
  { activity: 'UAT and cutover', R: 'Network Planning', A: 'Head of Planning', C: 'DevX', I: 'Regional managers' },
]

export const NFRS = [
  { area: 'Access', text: 'IOH SSO; role and geography scope enforced at query level' },
  { area: 'Audit', text: 'Every recommendation, approval, override and hand-off logged; 5-year retention' },
  { area: 'Residency', text: 'All data and models hosted in Indonesia; customer-level CNX stays in Netra (UU PDP)' },
  { area: 'Freshness', text: 'Forecast by 06:00 WIB daily; age shown next to every number' },
  { area: 'Availability', text: '99.5% in Phase 1 (business hours critical), 99.9% target platform-wide' },
  { area: 'Performance', text: 'Forecast board < 2 s for 60k sites; plan build < 30 s' },
  { area: 'Explainability', text: 'Every prediction shows its top contributing factors and model version' },
]

export const RISKS = [
  { risk: 'Ticket root causes too noisy to build labels', impact: 'Back-test precision overstated or unknown', mitigation: 'Root-cause classifier on ticket text in week 1–4; manual label audit on 500 tickets', owner: 'DevX · Network Ops' },
  { risk: 'RMS telemetry not available from partners in time', impact: 'Power class recall stays ~58%', mitigation: 'Go live on alarm proxies (already above the gate); add RMS as it lands', owner: 'Network Ops · Power' },
  { risk: 'TNMS topology incomplete', impact: 'Transport stays advisory', mitigation: 'Topology from TNMS export + field audit of top-500 revenue sites', owner: 'Transport Engineering' },
  { risk: 'ERP PO-draft interface not available', impact: 'Hand-off falls back to CSV', mitigation: 'CSV drop agreed as fallback in week 2; API in Phase 2', owner: 'IOH IT' },
  { risk: 'DoA thresholds differ from the PRD placeholders', impact: 'Wrong approver', mitigation: 'Load IOH DoA matrix into policy before UAT; editable, versioned', owner: 'Network PMO' },
  { risk: 'Planners keep the spreadsheet in parallel', impact: 'Adoption stalls', mitigation: '4-week parallel run with reconciliation; Smart CapEx output visible inside the planner', owner: 'Head of Planning' },
]

export const OPEN_QUESTIONS = [
  'Which ERP interface can accept PO drafts in Phase 1 (BAPI, IDoc or file drop), and who owns it?',
  'Is the 8-week horizon right for every class, or should capacity use 12 weeks and environmental 4?',
  'What are the real approval thresholds by IDR and intervention class (DoA matrix)?',
  'Which managed service partners hold RMS telemetry, and can data sharing be added to their contracts?',
  'Does Finance accept the catchment revenue allocation for exposure?',
  'Who is the IOH product owner for the Predictive Planner?',
  'Should transport and RAN hardware drive approvals at go-live if they clear 70% during UAT?',
]
