import clsx from 'clsx'
import type { ReactNode } from 'react'
import type { FailureClass } from '@/data/types'
import { AGENTS, type AgentSpec, type Readiness, type Stage } from '../../content/agents'
import { SOURCES, STATUS_LABEL, type Criticality, type DataSource, type NetraStatus } from '../../content/sources'
import { CLASSES, CLASS_META, type P1Data } from '../../model'

// ---- Lookups ------------------------------------------------------------------------------
export const AGENT_BY_ID = new Map(AGENTS.map((a) => [a.id, a]))
export const SOURCE_BY_ID = new Map(SOURCES.map((s) => [s.id, s]))

export const STAGE_ORDER: Stage[] = ['Sense', 'Predict', 'Decide', 'Plan', 'Govern']

/** Display name without the trailing "Agent" (diagram chips). */
export function shortName(a: AgentSpec): string {
  return a.name.replace(/ Agent$/, '').replace('Tower Company', 'Tower co')
}

/** Short source label for dense layouts. */
export function shortSource(s: DataSource): string {
  const n = s.name.split(':')[0].replace(/\s*\(.*?\)\s*/g, ' ').trim()
  return n.length > 26 ? `${n.slice(0, 25)}…` : n
}

// ---- Colours ------------------------------------------------------------------------------
export const READINESS_COLOR: Record<Readiness, string> = { Exists: '#2ECC71', Extend: '#5AA9E6', Build: '#8B5CF6' }
export const READINESS_TEXT: Record<Readiness, string> = {
  Exists: 'Exists today, consumed as-is',
  Extend: 'Exists in part, extended on Netra',
  Build: 'Built new on Netra in Phase 1',
}
export const STATUS_COLOR: Record<NetraStatus, string> = { on_netra: '#2ECC71', partial: '#F5A623', not_on_netra: '#FF3B3B' }
export { STATUS_LABEL }
export const CRIT_RANK: Record<Criticality, number> = { blocking: 0, important: 1, enhancing: 2 }
export const CRIT_WEIGHT: Record<Criticality, number> = { blocking: 3, important: 2, enhancing: 1 }
export const STATUS_SCORE: Record<NetraStatus, number> = { on_netra: 1, partial: 0.5, not_on_netra: 0 }

// Recharts dark styling
export const AXIS = { stroke: '#6B7280', tick: { fill: '#6B7280', fontSize: 11 }, tickLine: false, axisLine: { stroke: '#2A2F3A' } } as const
export const GRID = { stroke: '#2A2F3A', strokeDasharray: '0' } as const
export const TT = {
  contentStyle: { background: '#171A21', border: '1px solid #353B48', borderRadius: 0, fontSize: 12, color: '#F2F3F5' },
  itemStyle: { color: '#F2F3F5' },
  labelStyle: { color: '#A3AAB8' },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
} as const

// ---- Small UI atoms -------------------------------------------------------------------------
export function ReadinessTag({ r, className }: { r: Readiness; className?: string }) {
  return (
    <span className={clsx('inline-flex h-5 items-center gap-1.5 whitespace-nowrap border px-1.5 text-2xs font-semibold uppercase tracking-wide', className)} style={{ borderColor: `${READINESS_COLOR[r]}66`, color: READINESS_COLOR[r], background: `${READINESS_COLOR[r]}14` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: READINESS_COLOR[r] }} />
      {r}
    </span>
  )
}

export function StatusTag({ s, className }: { s: NetraStatus; className?: string }) {
  return (
    <span className={clsx('inline-flex h-5 items-center gap-1.5 whitespace-nowrap border px-1.5 text-2xs font-semibold uppercase tracking-wide', className)} style={{ borderColor: `${STATUS_COLOR[s]}55`, color: STATUS_COLOR[s], background: `${STATUS_COLOR[s]}12` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
      {STATUS_LABEL[s]}
    </span>
  )
}

export function StatusDot({ s, className }: { s: NetraStatus; className?: string }) {
  return <span title={STATUS_LABEL[s]} className={clsx('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: STATUS_COLOR[s] }} />
}

export function CritTag({ c }: { c: Criticality }) {
  const n = 3 - CRIT_RANK[c]
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs" title={`${c}: weight ${CRIT_WEIGHT[c]}`}>
      <span className="flex gap-[2px]">
        {[0, 1, 2].map((i) => (
          <span key={i} className={clsx('h-2.5 w-1', i < n ? (c === 'blocking' ? 'bg-ink' : 'bg-muted') : 'bg-line2')} />
        ))}
      </span>
      <span className={clsx('capitalize', c === 'blocking' ? 'font-semibold text-ink' : c === 'important' ? 'text-muted' : 'text-faint')}>{c}</span>
    </span>
  )
}

export function ClassDots({ classes, labels = false }: { classes: string[]; labels?: boolean }) {
  if (classes.includes('all'))
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted" title="All five failure classes">
        <span className="flex">
          {CLASSES.map((c) => (
            <span key={c} className="-mr-0.5 h-2 w-2 rounded-full ring-1 ring-panel" style={{ background: CLASS_META[c].color }} />
          ))}
        </span>
        <span className="ml-1">All</span>
      </span>
    )
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {classes.map((c) => {
        const m = CLASS_META[c as FailureClass]
        if (!m) return null
        return (
          <span key={c} className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-muted" title={m.label}>
            <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
            {labels ? m.label : m.short}
          </span>
        )
      })}
    </span>
  )
}

export function PageHead({ kicker, title, children, right }: { kicker: string; title: ReactNode; children?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6">
      <div className="min-w-0">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">{kicker}</div>
        <h1 className="mt-1 max-w-[980px] text-[22px] font-semibold leading-7">{title}</h1>
        {children && <div className="mt-1.5 max-w-[980px] text-sm text-muted">{children}</div>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}

export function Section({ id, title, sub, right, children, className, pad = false }: { id?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section id={id} className={clsx('scroll-mt-4 border border-line bg-panel', className)}>
      <header className="flex min-h-10 items-center justify-between gap-4 border-b border-line px-4 py-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {sub && <div className="text-xs text-faint">{sub}</div>}
        </div>
        {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
      </header>
      <div className={clsx(pad && 'p-4')}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone, className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'yellow'; className?: string }) {
  const tc = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : tone === 'yellow' ? 'text-ioh-yellow' : 'text-ink'
  return (
    <div className={clsx('min-w-0 px-4 py-3', className)}>
      <div className="truncate text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={clsx('tnum mt-0.5 text-2xl font-semibold leading-8', tc)}>{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  )
}

export function KV({ k, children, mono }: { k: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 border-b border-line/60 py-2 last:border-b-0">
      <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={clsx('text-sm text-ink', mono && 'font-mono text-[12px]')}>{children}</div>
    </div>
  )
}

/** Wrap text into lines of at most `max` characters (SVG labels). */
export function wrap(text: string, max: number, maxLines = 3): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let cur = ''
  for (const w of words) {
    if (!cur) cur = w
    else if ((cur + ' ' + w).length <= max) cur += ' ' + w
    else {
      lines.push(cur)
      cur = w
    }
  }
  if (cur) lines.push(cur)
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines)
    keep[maxLines - 1] = keep[maxLines - 1].replace(/.{0,1}$/, '…')
    return keep
  }
  return lines
}

// ---- Agent graph ------------------------------------------------------------------------------
/** Upstream agents: dependsOn plus any AG-* input (the two lists are not always in sync). */
export function agentDeps(a: AgentSpec): string[] {
  return [...new Set([...a.dependsOn, ...a.inputs.filter((i) => i.ref.startsWith('AG-')).map((i) => i.ref)])].filter((id) => AGENT_BY_ID.has(id))
}

export const DOWNSTREAM: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>(AGENTS.map((a) => [a.id, []]))
  for (const a of AGENTS) for (const d of agentDeps(a)) m.get(d)?.push(a.id)
  return m
})()

export function upstreamClosure(id: string): Set<string> {
  const out = new Set<string>()
  const walk = (x: string) => {
    const a = AGENT_BY_ID.get(x)
    if (!a) return
    for (const d of agentDeps(a))
      if (!out.has(d)) {
        out.add(d)
        walk(d)
      }
  }
  walk(id)
  return out
}

export function downstreamClosure(id: string): Set<string> {
  const out = new Set<string>()
  const walk = (x: string) => {
    for (const d of DOWNSTREAM.get(x) ?? [])
      if (!out.has(d)) {
        out.add(d)
        walk(d)
      }
  }
  walk(id)
  return out
}

export function directSources(a: AgentSpec): string[] {
  return a.inputs.filter((i) => i.ref.startsWith('SRC-') && SOURCE_BY_ID.has(i.ref)).map((i) => i.ref)
}

/** Sources the Site Failure Prediction Agent reaches through its features (feature catalog + Feature Builder inputs). */
export function featureSources(p1: P1Data | null): string[] {
  const s = new Set<string>(directSources(AGENT_BY_ID.get('AG-FEAT')!))
  if (p1) for (const c of CLASSES) for (const f of p1.feature_catalog[c] ?? []) if (SOURCE_BY_ID.has(f.source)) s.add(f.source)
  return [...s]
}

/** Sources an agent uses: 'direct' input or 'via' features (SFP only). */
export function agentSourceMap(a: AgentSpec, p1: P1Data | null): Map<string, 'direct' | 'via'> {
  const m = new Map<string, 'direct' | 'via'>()
  for (const s of directSources(a)) m.set(s, 'direct')
  if (a.id === 'AG-SFP') for (const s of featureSources(p1)) if (!m.has(s)) m.set(s, 'via')
  return m
}

/** Critical path through the build: longest chain of buildWeeks along dependencies. */
export const CRITICAL_PATH: { weeks: number; path: string[] } = (() => {
  const memo = new Map<string, { weeks: number; path: string[] }>()
  const f = (id: string): { weeks: number; path: string[] } => {
    const hit = memo.get(id)
    if (hit) return hit
    const a = AGENT_BY_ID.get(id)!
    let best = { weeks: 0, path: [] as string[] }
    for (const d of agentDeps(a)) {
      const x = f(d)
      if (x.weeks > best.weeks) best = x
    }
    const r = { weeks: best.weeks + a.buildWeeks, path: [...best.path, id] }
    memo.set(id, r)
    return r
  }
  let best = { weeks: 0, path: [] as string[] }
  for (const a of AGENTS) {
    const x = f(a.id)
    if (x.weeks > best.weeks) best = x
  }
  return best
})()

// ---- Data readiness -------------------------------------------------------------------------
export function readinessPct(list: DataSource[]): number {
  let n = 0
  let d = 0
  for (const s of list) {
    n += CRIT_WEIGHT[s.criticality] * STATUS_SCORE[s.status]
    d += CRIT_WEIGHT[s.criticality]
  }
  return d ? (100 * n) / d : 0
}

export function sourcesForClass(c: string): DataSource[] {
  return SOURCES.filter((s) => s.classes.includes(c) || s.classes.includes('all'))
}

// Target weeks for each source's go-live gap, mapped to the WS1 / WS5 timeline (DevX proposal).
export const GAP_PLAN: Record<string, { ws: string; week: number; deliverable: string }> = {
  'SRC-ITSM': { ws: 'WS1', week: 4, deliverable: 'Ticket root-cause labelling (risk: weeks 1–4)' },
  'SRC-FM': { ws: 'WS1', week: 4, deliverable: 'Alarm taxonomy mapping' },
  'SRC-OSS-PM': { ws: 'WS1', week: 6, deliverable: 'OSS PM backfill to 24 months (before back-test v1)' },
  'SRC-CM': { ws: 'WS1', week: 6, deliverable: 'Daily CM extract, four vendors' },
  'SRC-SITE': { ws: 'WS1', week: 8, deliverable: 'Site master quality sprint' },
  'SRC-RMS': { ws: 'WS1', week: 8, deliverable: 'RMS onboarding (partner contracts)' },
  'SRC-TNMS': { ws: 'WS1', week: 8, deliverable: 'TNMS access links, RSL and topology' },
  'SRC-BMKG': { ws: 'WS1', week: 8, deliverable: 'BMKG forecasts and archive' },
  'SRC-INARISK': { ws: 'WS1', week: 8, deliverable: 'InaRISK hazard and DEM join' },
  'SRC-FUEL': { ws: 'WS1', week: 8, deliverable: 'Fuel-log template and weekly upload' },
  'SRC-REV': { ws: 'WS1', week: 8, deliverable: 'Catchment revenue load (method signed off by Finance, EC8)' },
  'SRC-ERP': { ws: 'WS5', week: 14, deliverable: 'ERP read in week 10; PO-draft interface tested by week 14' },
  'SRC-WMS': { ws: 'WS5', week: 12, deliverable: 'WMS stock and reservations (plan builder UAT)' },
  'SRC-VPORTAL': { ws: 'WS5', week: 12, deliverable: 'Vendor portal read' },
  'SRC-TOWERCO': { ws: 'WS5', week: 12, deliverable: 'Lease DB extract and request templates' },
}

// ---- Example API payloads ----------------------------------------------------------------------
interface FieldTok {
  name: string
  kind: 'scalar' | 'array' | 'objarray' | 'enum'
  options?: string[]
  children?: FieldTok[]
  note?: string
}

function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '[' || ch === '{' || ch === '(') depth++
    if (ch === ']' || ch === '}' || ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

export function parseFields(fields: string): FieldTok[] {
  const toks: FieldTok[] = []
  for (let raw of splitTop(fields)) {
    let note: string | undefined
    const paren = raw.match(/\((.*?)\)\s*$/)
    if (paren) {
      note = paren[1]
      raw = raw.replace(/\s*\(.*?\)\s*$/, '')
    }
    if (raw.includes(' | ')) {
      const alt = raw.split(' | ').map((x) => x.trim())
      toks.push({ name: alt[0], kind: 'scalar', note: `or ${alt.slice(1).join(', ')}` })
      continue
    }
    const range = raw.match(/^(.*?)(\d+)\.\.(.*?)(\d+)$/)
    if (range) {
      const base = range[1]
      for (let i = Number(range[2]); i <= Number(range[4]); i++) toks.push({ name: `${base}${i}`, kind: 'scalar' })
      continue
    }
    const objArr = raw.match(/^(\w+)\[\{(.*)\}\]$/)
    if (objArr) {
      toks.push({ name: objArr[1], kind: 'objarray', children: parseFields(objArr[2]), note })
      continue
    }
    const arr = raw.match(/^(\w+)\[\]$/)
    if (arr) {
      toks.push({ name: arr[1], kind: 'array', note })
      continue
    }
    const en = raw.match(/^(\w+):\s*(.+)$/)
    if (en) {
      const opts = en[2].split('|').map((x) => x.trim())
      if (opts.length > 1) toks.push({ name: en[1], kind: 'enum', options: opts, note })
      else toks.push({ name: en[1], kind: 'scalar', note: en[2] })
      continue
    }
    toks.push({ name: raw.trim(), kind: 'scalar', note })
  }
  return toks
}

export function fieldType(t: FieldTok): string {
  if (t.kind === 'objarray') return 'object[]'
  if (t.kind === 'enum') return `enum(${t.options!.join(' | ')})`
  const n = t.name
  if (t.kind === 'array') return 'string[]'
  if (/_idr(_|$)|_idr_month$/.test(n)) return 'int (IDR)'
  if (/(^|_)(date|eta|as_of)$|_date$/.test(n)) return 'date'
  if (n === 'ts' || n.endsWith('_at')) return 'timestamp WIB'
  if (/^p_w\d+$|^ci90|confidence|probability/.test(n)) return 'float 0–1'
  if (/_pct$|^sla_pct$|psi|precision|recall|error|util|score|uplift|value|contribution|relief|dependence/.test(n)) return 'float'
  if (/(^|_)(id|sku|code|version|class|tower_company|role|name|vendor_id|driver|intervention|reason|text|window|feature_id|month|agent|recommended|chosen)$/.test(n) || n.endsWith('_id')) return 'string'
  if (/rank|qty|count|weeks|days|events|needed|shortfall|capacity|mhz|kg|week|lead|month$/.test(n)) return 'int'
  if (/protected|fits_window|ceiling_check|flag/.test(n)) return 'bool'
  return 'string'
}

const EX_STR: Record<string, unknown> = {
  site_id: 'JBR-1104',
  cell_id: 'JBR-1104-L18-2',
  cluster_id: 'CL-0412',
  plan_id: 'PL-0031',
  object_id: 'CL-0412',
  link_id: 'MW-JBR-0412-0388',
  vendor_id: 'VND-ERI-03',
  contract_id: 'FA-2025-117',
  program_id: 'PRG-2026-14',
  feature_id: 'prb_bh_p95_28d',
  class: 'capacity',
  model_version: '1.2.1',
  method_version: 'rev-exposure-0.3',
  sku: 'ANT-4T4R-1800',
  erp_material_code: '10048213',
  warehouse: 'WH-SMG',
  tower_company: 'Mitratel',
  approver_role: 'PLAN',
  approver_name: 'Head of Planning',
  cosign: null,
  auto_rule: null,
  role: 'PLAN',
  driver: 'traffic_growth',
  intervention: 'sector_add',
  from_band: 'L900',
  to_band: 'L1800',
  window: '28 d',
  quality_flag: 'ok',
  reason: 'No open program overlaps the cluster sites',
  reason_code: 'already_planned_elsewhere',
  agent: 'AG-SMARTCAPEX',
  recommended: 'capex',
  chosen: 'noncapex',
  text: '14 Bekasi sites saturate in 23 days; a sector add on 6 sites plus L900 refarming covers the window.',
  rationale_codes: ['PRB_TREND', 'REV_DENSITY'],
  components: { exposure: 0.46, probability: 0.31, urgency: 0.23 },
  sources: [{ warehouse: 'WH-SMG', qty: 9, transfer_days: 2 }, { warehouse: 'WH-JKT', qty: 5, transfer_days: 4 }],
  alternatives: ['VND-NOK-01', 'VND-HUA-02'],
  dependent_site_ids: ['JBR-1104', 'JBR-1107', 'JBR-1121'],
  site_ids: ['JBR-1104', 'JBR-1107', 'JBR-1121'],
  ts: '2026-09-28T23:00:00+07:00',
  run_date: '2026-09-28',
  date: '2026-09-27',
  crossing_week: 6,
  month: '2026-09',
  bridge: 'L900 refarming (+3 wks)',
  sla_days: 14,
}

function exValue(t: FieldTok, i: number): unknown {
  const n = t.name
  if (t.kind === 'enum') return t.options![0]
  if (t.kind === 'objarray') return [Object.fromEntries(t.children!.map((c, k) => [c.name, exValue(c, k)]))]
  if (n in EX_STR) return EX_STR[n]
  if (t.kind === 'array') return ['…']
  const p = n.match(/^p_w(\d+)$/)
  if (p) return Math.round((0.18 + Number(p[1]) * 0.075) * 100) / 100
  if (n === 'ci90_low') return 0.68
  if (n === 'ci90_high') return 0.86
  if (/_idr/.test(n)) return n.includes('price') ? 18_500_000 : n.includes('total') ? 1_240_000_000 : n.includes('opex') ? 42_000_000 : 685_000_000
  if (n === 'price') return 18_500_000
  if (/date|eta|as_of/.test(n)) return n === 'as_of' ? '2026-09-23' : '2026-10-21'
  if (n.endsWith('_at')) return '2026-09-28T05:00:00+07:00'
  if (/pct/.test(n)) return 12.4
  if (/confidence/.test(n)) return 0.82
  if (/score/.test(n)) return 0.87
  if (/uplift/.test(n)) return 0.21
  if (/psi/.test(n)) return 0.06
  if (/precision/.test(n)) return 0.78
  if (/recall/.test(n)) return 0.64
  if (/error/.test(n)) return 0.031
  if (/contribution/.test(n)) return 6.2
  if (n === 'value') return 87.4
  if (/util/.test(n)) return 91.2
  if (/relief/.test(n)) return 14
  if (/dependence/.test(n)) return 0.38
  if (/weeks_to|crossing_week/.test(n)) return 3
  if (/weeks/.test(n)) return 3
  if (/lead_days|transfer_days/.test(n)) return 21
  if (/fade/.test(n)) return 7
  if (/rank/.test(n)) return 1 + i
  if (/qty|needed/.test(n)) return 14
  if (/shortfall/.test(n)) return 0
  if (/free_capacity/.test(n)) return 22
  if (/mhz/.test(n)) return 5
  if (/kg/.test(n)) return 46
  if (/protected|fits_window|ceiling_check/.test(n)) return n === 'protected' ? false : true
  if (n === 'readiness') return 'green'
  if (n === 'genset_dependence') return 0.38
  return `<${n}>`
}

export function exampleObject(fields: string): Record<string, unknown> {
  const toks = parseFields(fields)
  return Object.fromEntries(toks.map((t, i) => [t.name, exValue(t, i)]))
}

export function fillEndpoint(ep: string): string {
  return ep
    .replace(/\{site_id\}/g, 'JBR-1104')
    .replace(/\{link_id\}/g, 'MW-JBR-0412-0388')
    .replace(/\{object_id\}/g, 'CL-0412')
    .replace(/\{class\}/g, 'capacity')
    .replace(/plans\/\{id\}/g, 'plans/PL-0031')
    .replace(/clusters\/\{id\}/g, 'clusters/CL-0412')
    .replace(/class=(&|$)/, 'class=capacity$1')
    .replace(/week=(&|$)/, 'week=4$1')
    .replace(/min_p=(&|$)/, 'min_p=0.6$1')
    .replace(/date=(&|$)/, 'date=2026-09-28$1')
    .replace(/role=(&|$)/, 'role=PLAN$1')
    .replace(/since=(&|$)/, 'since=2026-09-27$1')
}
