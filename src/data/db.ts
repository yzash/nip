import type {
  ActionOption,
  Agent,
  AgentRun,
  Approval,
  AvoidedOutage,
  BackboneLink,
  BoqLine,
  CdnPeer,
  Cell,
  Cohort,
  DistrictProps,
  Engineer,
  ForecastRaw,
  ForecastRow,
  Incident,
  Insight,
  InterventionClassDef,
  KpiDailyRaw,
  KpiKey,
  Meta,
  ModelScore,
  Policy,
  Program,
  ProvinceProps,
  PurchaseOrder,
  RevenueRaw,
  Role,
  Site,
  ValidationRow,
  Vendor,
  WarehouseStock,
  WorkOrder,
} from './types'
import { source } from './netra'

type FC<P> = GeoJSON.FeatureCollection<GeoJSON.Geometry, P>

export interface KpiStore {
  dates: string[]
  days: number
  q: Record<KpiKey, Uint8Array>
  scale: Record<KpiKey, number>
  offset: Record<KpiKey, number>
}

export interface DB {
  meta: Meta
  provincesGeo: FC<ProvinceProps>
  districtsGeo: FC<DistrictProps>
  provinces: ProvinceProps[]
  provById: Record<string, ProvinceProps>
  distById: Record<string, DistrictProps>
  sites: Site[]
  siteIdx: Map<string, number>
  cellsBySite: Map<string, Cell[]>
  kpi: KpiStore
  forecast: ForecastRow[]
  weekEndDates: string[]
  cohortsBySite: Map<string, Cohort[]>
  cohorts: Cohort[]
  revenue: { months: string[]; latest: Float64Array; series: number[][]; postpaid: number[]; enterprise: number[] }
  links: BackboneLink[]
  cdn: CdnPeer[]
  insights: Insight[]
  incidents: Incident[]
  optionsByIncident: Map<string, ActionOption[]>
  approvals: Approval[]
  programs: Program[]
  boq: BoqLine[]
  pos: PurchaseOrder[]
  stock: WarehouseStock[]
  vendors: Vendor[]
  workOrders: WorkOrder[]
  engineers: Engineer[]
  validation: ValidationRow[]
  avoided: AvoidedOutage[]
  agents: Agent[]
  agentRuns: AgentRun[]
  scorecard: ModelScore[]
  roles: Role[]
  policy: Policy
  interventionClasses: InterventionClassDef[]
}

let _db: DB | null = null
export function db(): DB {
  if (!_db) throw new Error('DB not loaded')
  return _db
}

function decode(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const a = m.get(k)
    if (a) a.push(r)
    else m.set(k, [r])
  }
  return m
}

const ENTITIES = [
  'meta',
  'geo/provinces.geojson',
  'geo/districts.geojson',
  'sites',
  'cells',
  'site_kpi_daily',
  'site_forecast',
  'customer_cohort',
  'revenue_site_monthly',
  'backbone_link',
  'cdn_peer',
  'insight',
  'incident',
  'action_option',
  'approval',
  'program',
  'boq_line',
  'purchase_order',
  'warehouse_stock',
  'vendor',
  'work_order',
  'engineer',
  'validation',
  'avoided_outage',
  'agent',
  'agent_run',
  'model_scorecard',
  'user_role',
] as const

export async function loadDB(onProgress: (done: number, total: number, label: string) => void): Promise<DB> {
  let done = 0
  const raw: Record<string, unknown> = {}
  await Promise.all(
    ENTITIES.map(async (e) => {
      const name = e.endsWith('.geojson') ? e.replace('.geojson', '') : e
      raw[e] = e.endsWith('.geojson')
        ? await fetch(`/data/${e}`).then((r) => r.json())
        : await source.fetchEntity(name)
      done += 1
      onProgress(done, ENTITIES.length, e)
    }),
  )

  const sites = raw['sites'] as Site[]
  const siteIdx = new Map(sites.map((s, i) => [s.site_id, i]))
  const k = raw['site_kpi_daily'] as KpiDailyRaw
  const keys = Object.keys(k.metrics) as KpiKey[]
  const kpi: KpiStore = {
    dates: k.dates,
    days: k.dates.length,
    q: Object.fromEntries(keys.map((m) => [m, decode(k.metrics[m].data)])) as Record<KpiKey, Uint8Array>,
    scale: Object.fromEntries(keys.map((m) => [m, k.metrics[m].scale])) as Record<KpiKey, number>,
    offset: Object.fromEntries(keys.map((m) => [m, k.metrics[m].offset])) as Record<KpiKey, number>,
  }
  const fc = raw['site_forecast'] as ForecastRaw
  const rev = raw['revenue_site_monthly'] as RevenueRaw
  const latest = new Float64Array(sites.length)
  rev.site_ids.forEach((sid, j) => {
    const i = siteIdx.get(sid)!
    latest[i] = rev.revenue_idr[j][rev.revenue_idr[j].length - 1]
  })
  const provincesGeo = raw['geo/provinces.geojson'] as FC<ProvinceProps>
  const districtsGeo = raw['geo/districts.geojson'] as FC<DistrictProps>
  const ur = raw['user_role'] as { roles: Role[]; policy: Policy; intervention_classes: InterventionClassDef[] }
  const cohorts = raw['customer_cohort'] as Cohort[]

  _db = {
    meta: raw['meta'] as Meta,
    provincesGeo,
    districtsGeo,
    provinces: provincesGeo.features.map((f) => f.properties),
    provById: Object.fromEntries(provincesGeo.features.map((f) => [f.properties.id, f.properties])),
    distById: Object.fromEntries(districtsGeo.features.map((f) => [f.properties.id, f.properties])),
    sites,
    siteIdx,
    cellsBySite: groupBy(raw['cells'] as Cell[], (c) => c.site_id),
    kpi,
    forecast: fc.rows,
    weekEndDates: fc.week_end_dates,
    cohortsBySite: groupBy(cohorts, (c) => c.site_id),
    cohorts,
    revenue: { months: rev.months, latest, series: rev.revenue_idr, postpaid: rev.postpaid_share, enterprise: rev.enterprise_accounts },
    links: raw['backbone_link'] as BackboneLink[],
    cdn: raw['cdn_peer'] as CdnPeer[],
    insights: raw['insight'] as Insight[],
    incidents: raw['incident'] as Incident[],
    optionsByIncident: groupBy(raw['action_option'] as ActionOption[], (o) => o.incident_id),
    approvals: raw['approval'] as Approval[],
    programs: raw['program'] as Program[],
    boq: raw['boq_line'] as BoqLine[],
    pos: raw['purchase_order'] as PurchaseOrder[],
    stock: raw['warehouse_stock'] as WarehouseStock[],
    vendors: raw['vendor'] as Vendor[],
    workOrders: raw['work_order'] as WorkOrder[],
    engineers: raw['engineer'] as Engineer[],
    validation: raw['validation'] as ValidationRow[],
    avoided: raw['avoided_outage'] as AvoidedOutage[],
    agents: raw['agent'] as Agent[],
    agentRuns: raw['agent_run'] as AgentRun[],
    scorecard: raw['model_scorecard'] as ModelScore[],
    roles: ur.roles,
    policy: ur.policy,
    interventionClasses: ur.intervention_classes,
  }
  return _db
}

// ---- KPI accessors -------------------------------------------------------------------
export function kpiAt(metric: KpiKey, i: number, day: number): number {
  const K = db().kpi
  return K.offset[metric] + K.q[metric][i * K.days + day] * K.scale[metric]
}
export function kpiSeries(metric: KpiKey, i: number, from = 0, to?: number): number[] {
  const K = db().kpi
  const end = to ?? K.days
  const out: number[] = []
  for (let d = from; d < end; d++) out.push(K.offset[metric] + K.q[metric][i * K.days + d] * K.scale[metric])
  return out
}
export function kpiMean(metric: KpiKey, i: number, day: number, window: number): number {
  const K = db().kpi
  let s = 0
  const start = Math.max(0, day - window + 1)
  for (let d = start; d <= day; d++) s += K.offset[metric] + K.q[metric][i * K.days + d] * K.scale[metric]
  return s / (day - start + 1)
}
