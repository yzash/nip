// Types mirror the entities written by generate.py (PRD §10). Keep in sync with /data.

export type RoleCode = 'EXEC' | 'PLAN' | 'DEPLOY' | 'OPS' | 'CX' | 'REGION' | 'FIELD' | 'PROC'
export type Region = 'Jabodetabek' | 'Java' | 'Sumatra' | 'Kalimantan' | 'Sulawesi' | 'Bali Nusra' | 'Papua Maluku'
export type Freshness = 'D-1' | 'D-5' | 'live'
export type FailureClass = 'capacity' | 'power' | 'transport' | 'ran_hardware' | 'environmental'
export type IncidentClass =
  | FailureClass
  | 'availability'
  | 'bad_session'
  | 'cdn'
  | 'energy'
  | 'cnx'
  | 'complaints'
export type IncidentStatus =
  | 'Detected'
  | 'Enriched'
  | 'Pending_approval'
  | 'Approved'
  | 'Rejected'
  | 'Deferred'
  | 'In_program'
  | 'RFS'
  | 'Validating'
  | 'Closed'
export type InterventionClass = 'noncapex_zero' | 'noncapex_opex' | 'capex_minor' | 'capex_major' | 'customer_action'
export type Stage =
  | 'Decision'
  | 'BOQ'
  | 'PO'
  | 'Vendor allocation'
  | 'Material dispatch'
  | 'Installation'
  | 'Integration'
  | 'RFS'
  | 'Validation'

export interface ProvinceProps {
  id: string
  name: string
  region: Region
  tz: 'WIB' | 'WITA' | 'WIT'
  population_m: number
  districts: number
  center: [number, number]
  bbox: [number, number, number, number]
}
export interface DistrictProps {
  id: string
  name: string
  province_id: string
  type: 'kota' | 'kabupaten'
  region: Region
  metro: boolean
  center: [number, number]
  area_km2: number
}

export interface Site {
  site_id: string
  name: string
  district_id: string
  province_id: string
  region: Region
  lat: number
  lon: number
  site_class: 'macro' | 'small_cell' | 'ibs' | 'das'
  vendor: string
  technologies: string[]
  backhaul: 'fibre' | 'microwave' | 'satellite'
  power_type: string
  on_air_date: string
  cluster: string
  tower_company: string
  structure: string
  elevation_m: number
  coastal: boolean
  urban: boolean
  story: string | null
  subscribers: number
  energy: {
    grid_outages_30d: number
    genset_hours_day: number
    battery_health_pct: number
    rectifier_alarms_30d: number
    energy_opex_idr_month: number
  }
  program_id: string | null
  as_of: string
  freshness: Freshness
}

export interface Cell {
  cell_id: string
  site_id: string
  band: string
  sector: string
  azimuth: number
  capacity_mbps: number
}

export interface KpiMetric {
  offset: number
  scale: number
  unit: string
  data: string
}
export interface KpiDailyRaw {
  as_of: string
  freshness: Freshness
  dates: string[]
  site_ids: string[]
  metrics: Record<KpiKey, KpiMetric>
}
export type KpiKey = 'availability' | 'prb_util' | 'throughput_mbps' | 'bad_session_pct' | 'alarms' | 'tickets' | 'cnx'

export interface ForecastRow {
  site_id: string
  failure_class: FailureClass
  failure_prob: number[]
  top_factors: { factor: string; weight: number }[]
  capacity_weeks_to_saturation: number
}
export interface ForecastRaw {
  as_of: string
  freshness: Freshness
  weeks: string[]
  week_end_dates: string[]
  rows: ForecastRow[]
}

export interface Cohort {
  cohort_id: string
  site_id: string
  segment: 'consumer_4g' | 'consumer_5g' | 'postpaid' | 'enterprise'
  subs: number
  arpu: number
  churn_risk: number
  churn_risk_subs: number
  cnx: number
  cnx_delta_28d: number
  top_complaint: string
}

export interface RevenueRaw {
  as_of: string
  months: string[]
  site_ids: string[]
  revenue_idr: number[][]
  postpaid_share: number[]
  enterprise_accounts: number[]
}

export interface BackboneLink {
  link_id: string
  name: string
  from_site: string
  to_site: string
  type: 'fibre' | 'microwave' | 'submarine' | 'satellite'
  capacity_gbps: number
  util_pct: number
  fault_state: 'ok' | 'degraded' | 'down'
  dependent_sites: number
  protected: boolean
  as_of: string
  freshness: Freshness
}

export interface CdnPeer {
  pop_id: string
  city: string
  partner: string
  lon: number
  lat: number
  cache_hit_pct: number
  cache_hit_delta_7d: number
  egress_gbps: number
  latency_ms: number
  egress_cost_idr_month: number
  status: 'healthy' | 'degraded'
  as_of: string
  freshness: Freshness
}

export interface Insight {
  insight_id: string
  agent: string
  timestamp: string
  scope: { site_ids: string[]; province_id: string | null; district_id: string | null; label: string }
  what_changed: string
  message: string
  magnitude: string
  confidence: number
  exposure_idr: number
  suggested_function: string
  suggested_action: string
  incident_id: string | null
  as_of: string
  freshness: Freshness
}

export interface ProgramMatch {
  verdict: 'covered' | 'partial' | 'not_covered'
  program_id?: string | null
  eta?: string
  stage?: Stage
  reason?: string | null
}

export interface Incident {
  incident_id: string
  title: string
  class: IncidentClass
  source: 'prediction' | 'alarm' | 'cx'
  site_ids: string[]
  province_id: string
  province_ids: string[]
  district_id: string
  region: Region
  probability: number
  predicted_week: number
  exposure_idr: number
  urgency: number
  status: IncidentStatus
  owner_role: RoleCode
  functions: string[]
  detected_at: string
  sla_due: string
  owner_assigned_at: string | null
  program_id: string | null
  program_match: ProgramMatch
  customers: number
  churn_risk_subs: number
  recommended_rank: number
  flags: string[]
  insight_ids: string[]
  confidence: number
  priority_score: number
  story?: string
  days_to_breach?: number
  link_id?: string
  segment?: string
  technology?: string
  cnx_delta?: number
  pending_customer_action?: boolean
  stock_prepositioned?: string
  escalation_note?: string
  fp_note?: string
  closed_reason?: string | null
  opex_saving_idr_month?: number
  pop_id?: string
  chosen_rank?: number
  as_of: string
  freshness: Freshness
}

export interface ActionOption {
  incident_id: string
  rank: number
  name: string
  class: InterventionClass
  cost_idr: number
  lead_days: number
  predicted_uplift: string
  confidence: number
}

export interface Approval {
  incident_id: string
  step: string
  role: string
  actor: string
  decision: string
  reason_code: string | null
  timestamp: string
}

export interface StageHistory {
  stage: Stage
  start: string
  end: string | null
}

export interface Program {
  program_id: string
  name: string
  type: string
  intervention: string
  region: Region
  province_ids: string[]
  budget_idr: number
  spent_idr: number
  stage: Stage
  health: 'on_track' | 'at_risk' | 'late'
  sites_planned: number
  sites_rfs: number
  site_ids: string[]
  start: string
  target_rfs: string
  forecast_rfs: string
  managed_by: 'legacy' | 'nicc'
  vendor_id: string
  capex_class: InterventionClass
  gb_factory: boolean
  owner_role: RoleCode
  stage_history: StageHistory[]
  blockers: { type: string; text: string; since: string }[]
  gap_flags: { type: string; site_ids: string[]; text: string; suggested_action: string }[]
  documents: { name: string; type: string }[]
  tower_company_clock: {
    tower_company: string
    requested: string
    sla_days: number
    due: string
    status: 'pending' | 'approved' | 'overdue'
    items: string
  } | null
  vendor_sla_risk: boolean
  pending_approval: { role: RoleCode; cosign: string | null; since: string; gate: string } | null
  complete: boolean
  source_incident?: string
  created_in_session?: boolean
  as_of: string
  freshness: Freshness
}

export interface BoqLine {
  program_id: string
  site_id: string
  sku: string
  description: string
  qty: number
  unit_cost_idr: number
  price_book_idr: number
  vendor: string
}

export interface PurchaseOrder {
  po_id: string
  program_id: string
  vendor: string
  category: string
  amount_idr: number
  status: 'draft' | 'pending_release' | 'released' | 'acknowledged' | 'delivered' | 'invoiced'
  issued: string | null
  due: string
  contract: string
}

export interface WarehouseStock {
  warehouse_id: string
  warehouse: string
  sku: string
  description: string
  category: string
  on_hand: number
  reserved: number
  reorder_point: number
  lead_days: number
  unit_cost_idr: number
  as_of: string
  freshness: Freshness
}

export interface Vendor {
  vendor_id: string
  name: string
  short: string
  regions: Region[]
  capacity_sites_per_month: number
  sla_pct: number
}

export interface WorkOrder {
  wo_id: string
  site_id: string
  program_id: string | null
  incident_id: string | null
  engineer_id: string
  type: string
  status: 'open' | 'in_progress' | 'overdue' | 'completed' | 'evidence_submitted'
  priority: 'normal' | 'high'
  created: string
  due: string
  evidence: { name: string; type: string }[]
  checklist: { step: string; done: boolean }[]
  parts: { sku: string; qty: number; status: string }[]
}

export interface Engineer {
  engineer_id: string
  name: string
  region: Region
  province_id: string
}

export interface ValidationRow {
  site_id: string
  program_id: string
  rfs_date: string
  kpi: 'availability' | 'cnx' | 'bad_session' | 'throughput' | 'traffic_gb' | 'churn' | 'revenue'
  unit: string
  direction: 1 | -1
  outcome: 'uplift' | 'flat' | 'worse'
  pre: number
  control_pre: number
  post_30: number | null
  post_60: number | null
  post_90: number | null
  control_post_30: number | null
  control_post_60: number | null
  control_post_90: number | null
  predicted_uplift: number
}

export interface AvoidedOutage {
  site_id: string
  class: FailureClass
  date: string
  predicted_outage_hours: number
  outage_cost_idr: number
  intervention_cost_idr: number
  intervention: string
}

export interface Agent {
  agent_id: string
  name: string
  family: string
  function: string
  inputs: string
  outputs: string
  exists_today: string
  schedule: string
  last_run: string
  freshness: Freshness
  owner: string
  status: 'live' | 'prototype' | 'proposed'
  insights_14d: number
  acceptance_rate: number
  override_rate: number
  as_of: string
}

export interface AgentRun {
  run_id: string
  agent_id: string
  timestamp: string
  outputs: number
  accepted: number
  overridden: number
  ignored: number
  override_reason: string | null
  duration_s: number
}

export interface ModelScore {
  failure_class: FailureClass
  wave: number
  horizon: string
  precision_top_decile: number
  recall: number
  false_positive_rate: number
  override_rate: number
  drift_psi: number
  status: string
  backtest_months: number
}

export interface ColourThreshold {
  green: number
  amber: number
  dir: 'high' | 'low'
}
export interface Policy {
  decision_threshold_idr: number
  cfo_cosign_above_idr: number
  opex_auto_approve_below_idr: number
  customer_auto_approve_below: number
  boq_variance_pct: number
  exec_incident_min_exposure_idr: number
  exec_incident_min_sites: number
  cx_incident_min_churn_subs: number
  red_min_probability: number
  owner_assignment_sla_hours: number
  priority_weights: { exposure: number; probability: number; urgency: number }
  colour_thresholds: Record<
    'health' | 'cnx' | 'availability' | 'bad_session' | 'prb' | 'failure' | 'link_util' | 'cache_hit',
    ColourThreshold
  >
}

export interface Role {
  role_code: RoleCode
  title: string
  user: string
  engineer_id?: string
  scope_type: 'national' | 'region' | 'district'
  scope_ids: string[]
  scope_options?: string[]
  functions: string[]
  decision_rights: string[]
  approves: string[]
  landing: string
  monday_decision: string
  queue_order: 'priority' | 'exposure' | 'churn' | 'due'
}

export interface InterventionClassDef {
  id: InterventionClass
  label: string
  examples: string
  approver: string
  approver_roles: RoleCode[]
  auto: string
}

export interface Meta {
  seed: number
  now: string
  as_of: string
  as_of_d5: string
  freshness: Record<string, string>
  stages: Stage[]
  failure_classes: FailureClass[]
  sample_note: string
  warehouses: { warehouse_id: string; name: string; region: Region; lon: number; lat: number }[]
  skus: { sku: string; description: string; category: string; unit_cost_idr: number; lead_days: number }[]
  boq_templates: Record<string, [string, number][]>
  per_site_cost_idr: Record<string, number>
  story_link_id: string
  story_incidents: Record<'bekasi_capacity' | 'sulsel_transport' | 'surabaya_cnx' | 'cjava_power', string>
  surabaya_comparable_program: string
  legacy_stage_weeks: Record<string, number>
  target_stage_days: Record<string, number>
  counts: Record<string, number>
}
