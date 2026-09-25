import clsx from 'clsx'
import { AlertTriangle, ArrowRight, ChevronDown, ChevronUp, ExternalLink, RadioTower, RotateCcw, Sparkles, Truck, Zap } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { Program, RoleCode } from '@/data/types'
import { Badge, Bar, Button, Empty, Fresh, Id, Kpi, ReasonModal, Seg, Td, Th } from '@/components/ui'
import { STATUS } from '@/lib/colors'
import { INTERVENTION_LABEL, date, daysBetween, idr, num, pct } from '@/lib/format'
import { programHealthCounts } from '@/lib/metrics'
import { todayIso, useApp, usePolicy, useRole, useScope } from '@/store/app'
import { STAGE_GROUPS, cycleStats, deployCounts, pendingPos, slipDays, stageGroup, stageIdx, towerOverdue, vendorById, type StageGroup } from './lib'
import { HealthBadge, ManagedChip, SlipCell, StageLabel, StageStrip } from './parts'

type HealthF = 'all' | Program['health']
type SortKey = 'default' | 'id' | 'slip' | 'budget' | 'burn' | 'stage'

export function PortfolioTab() {
  const programs = useApp((s) => s.programs)
  const role = useRole()
  const scope = useScope()
  const nav = useNavigate()
  const [health, setHealth] = useState<HealthF>('all')
  const [region, setRegion] = useState<string>(role.role_code === 'REGION' ? scope : 'all')
  const [type, setType] = useState('all')
  const [vendor, setVendor] = useState('all')
  const [group, setGroup] = useState<'all' | StageGroup>('all')
  const [gb, setGb] = useState(false)
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({
    k: 'default',
    dir: 1,
  })

  const D = db()
  const regions = [...new Set(programs.map((p) => p.region))].sort()
  const types = [...new Set(programs.map((p) => p.type))].sort()

  const base = useMemo(
    () =>
      programs.filter(
        (p) =>
          (region === 'all' || p.region === region) &&
          (type === 'all' || p.type === type) &&
          (vendor === 'all' || p.vendor_id === vendor) &&
          (group === 'all' || stageGroup(p) === group) &&
          (!gb || p.gb_factory),
      ),
    [programs, region, type, vendor, group, gb],
  )
  const hc = programHealthCounts(base)
  const rows = useMemo(() => {
    const sev = { late: 0, at_risk: 1, on_track: 2 }
    const r = base.filter((p) => health === 'all' || p.health === health)
    const cmp = (a: Program, b: Program): number => {
      switch (sort.k) {
        case 'id':
          return a.program_id.localeCompare(b.program_id)
        case 'slip':
          return slipDays(a) - slipDays(b)
        case 'budget':
          return a.budget_idr - b.budget_idr
        case 'burn':
          return a.spent_idr / Math.max(1, a.budget_idr) - b.spent_idr / Math.max(1, b.budget_idr)
        case 'stage':
          return stageIdx(a.stage) - stageIdx(b.stage)
        default: {
          // Role-aware default ordering: what this role must act on first.
          const pri = (p: Program) =>
            role.role_code === 'EXEC'
              ? Number(!!p.gap_flags.length) * 2 + Number(p.pending_approval?.role === 'EXEC')
              : role.role_code === 'DEPLOY'
                ? Number(p.vendor_sla_risk) * 2 + Number(towerOverdue(p)) + Number(p.pending_approval?.role === 'DEPLOY')
                : role.role_code === 'PROC'
                  ? Number(p.pending_approval?.gate === 'PO')
                  : role.role_code === 'PLAN'
                    ? Number(p.pending_approval?.role === 'PLAN')
                    : 0
          return pri(b) - pri(a) || sev[a.health] - sev[b.health] || slipDays(b) - slipDays(a) || a.program_id.localeCompare(b.program_id)
        }
      }
    }
    return [...r].sort((a, b) => Number(!!b.created_in_session) - Number(!!a.created_in_session) || cmp(a, b) * sort.dir)
  }, [base, health, sort, role.role_code])

  const filtered = region !== 'all' || type !== 'all' || vendor !== 'all' || group !== 'all' || gb || health !== 'all'
  const reset = () => {
    setHealth('all')
    setRegion('all')
    setType('all')
    setVendor('all')
    setGroup('all')
    setGb(false)
  }
  const sortBy = (k: SortKey) => setSort((s) => (s.k === k ? { k, dir: s.dir === 1 ? -1 : 1 } : { k, dir: k === 'slip' || k === 'budget' || k === 'burn' ? -1 : 1 }))
  const SortIcon = ({ k }: { k: SortKey }) => (sort.k === k ? sort.dir === 1 ? <ChevronUp size={11} className="inline" /> : <ChevronDown size={11} className="inline" /> : null)

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(400px,470px)] gap-4">
        <Headline role={role.role_code} programs={programs} />
        <Approvals role={role.role_code} />
      </div>
      <KpiRow programs={base} counts={hc} lens={gb ? 'GB Factory lens' : filtered ? 'In view' : 'Portfolio'} />

      <section className="border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <Seg<HealthF>
            value={health}
            onChange={setHealth}
            options={[
              { id: 'all', label: `All ${base.length}` },
              {
                id: 'on_track',
                label: (
                  <span>
                    On track <span className="tnum opacity-70">{hc.on_track}</span>
                  </span>
                ),
              },
              {
                id: 'at_risk',
                label: (
                  <span>
                    At risk <span className="tnum opacity-70">{hc.at_risk}</span>
                  </span>
                ),
              },
              {
                id: 'late',
                label: (
                  <span>
                    Late <span className="tnum opacity-70">{hc.late}</span>
                  </span>
                ),
              },
            ]}
          />
          <Select value={region} onChange={setRegion} label="Region" options={regions.map((r) => ({ id: r, label: r }))} />
          <Select value={type} onChange={setType} label="Type" options={types.map((r) => ({ id: r, label: r }))} />
          <Select
            value={vendor}
            onChange={setVendor}
            label="Vendor"
            options={D.vendors.map((v) => ({
              id: v.vendor_id,
              label: `${v.short} · ${v.name.replace(/^PT /, '')}`,
            }))}
          />
          <Select value={group} onChange={(v) => setGroup(v as 'all' | StageGroup)} label="Stage" options={STAGE_GROUPS.map((g) => ({ id: g.id, label: g.label }))} />
          <button
            onClick={() => setGb(!gb)}
            className={clsx('flex h-7 items-center gap-1.5 border px-2.5 text-xs font-semibold', gb ? 'border-ioh-yellow bg-ioh-yellow/10 text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}
            title="GB Factory lens: capacity programs that keep monetisable traffic flowing"
          >
            <Zap size={12} /> GB Factory
          </button>
          {filtered && (
            <button onClick={reset} className="flex h-7 items-center gap-1 px-2 text-xs text-muted hover:text-ink">
              <RotateCcw size={12} /> Reset
            </button>
          )}
          <div className="ml-auto flex items-center gap-1.5 text-xs text-faint">
            {rows.length} of {programs.length} programs <Fresh f="D-1" />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse">
            <thead>
              <tr>
                <Th onClick={() => sortBy('id')}>
                  Program <SortIcon k="id" />
                </Th>
                <Th>Type · region</Th>
                <Th onClick={() => sortBy('stage')}>
                  Stage (9) <SortIcon k="stage" />
                </Th>
                <Th onClick={() => sortBy('default')}>
                  Health <SortIcon k="default" />
                </Th>
                <Th onClick={() => sortBy('burn')}>
                  Spent / budget <SortIcon k="burn" />
                </Th>
                <Th className="text-right">Sites RFS</Th>
                <Th onClick={() => sortBy('slip')}>
                  Target → forecast RFS <SortIcon k="slip" />
                </Th>
                <Th>Vendor</Th>
                <Th>Flags</Th>
                <Th>Run by</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <Row key={p.program_id} p={p} onClick={() => nav(`/programs/${p.program_id}`)} />
              ))}
            </tbody>
          </table>
          {!rows.length && <Empty>No programs match these filters.</Empty>}
        </div>
      </section>
    </div>
  )
}

function Select({ value, onChange, label, options }: { value: string; onChange: (v: string) => void; label: string; options: { id: string; label: string }[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={clsx('h-7 max-w-[210px] border bg-panel2 px-2 text-xs', value !== 'all' ? 'border-ioh-yellow/70 text-ink' : 'border-line2 text-muted')}
    >
      <option value="all">{label}: all</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

function Row({ p, onClick }: { p: Program; onClick: () => void }) {
  const v = vendorById(p.vendor_id)
  const burn = p.spent_idr / Math.max(1, p.budget_idr)
  const siteShare = p.sites_rfs / Math.max(1, p.sites_planned)
  const burnColor = burn > siteShare + 0.35 && p.health !== 'on_track' ? STATUS.warn : '#A3AAB8'
  return (
    <tr onClick={onClick} className={clsx('cursor-pointer hover:bg-panel2', p.created_in_session && 'bg-ioh-yellow/[0.04]')}>
      <Td className="max-w-[330px]">
        <div className="flex items-center gap-2">
          <Id className={p.created_in_session ? 'text-ioh-yellow' : undefined}>{p.program_id}</Id>
          {p.created_in_session && <Badge tone="yellow">New</Badge>}
          {p.pending_approval && <Badge tone="neutral">Awaiting {p.pending_approval.role}</Badge>}
        </div>
        <div className="truncate text-[13px] font-medium text-ink">{p.name}</div>
      </Td>
      <Td>
        <div className="text-xs text-ink">{p.type}</div>
        <div className="text-xs text-faint">{p.region}</div>
      </Td>
      <Td>
        <StageStrip p={p} />
        <div className="mt-1">
          <StageLabel p={p} />
        </div>
      </Td>
      <Td>
        <HealthBadge h={p.health} />
      </Td>
      <Td className="w-[150px]">
        <div className="tnum mb-1 text-xs">
          <span className="text-ink">{idr(p.spent_idr)}</span> <span className="text-faint">/ {idr(p.budget_idr)}</span>
        </div>
        <Bar value={p.spent_idr} max={p.budget_idr} color={burnColor} />
      </Td>
      <Td className="tnum text-right">
        <span className={p.sites_rfs === p.sites_planned ? 'text-ok' : 'text-ink'}>{p.sites_rfs}</span>
        <span className="text-faint"> / {p.sites_planned}</span>
      </Td>
      <Td>
        <SlipCell p={p} />
      </Td>
      <Td>
        <span className="font-mono text-xs text-muted" title={v?.name}>
          {v?.short ?? p.vendor_id}
        </span>
      </Td>
      <Td>
        <div className="flex items-center gap-1.5">
          {p.gap_flags.length > 0 && (
            <span title={p.gap_flags.map((g) => g.text).join('\n')} className="text-bad">
              <AlertTriangle size={14} />
            </span>
          )}
          {p.tower_company_clock && (
            <span
              title={`Stage 6b · ${p.tower_company_clock.tower_company}: ${p.tower_company_clock.status} (due ${date(p.tower_company_clock.due)})`}
              className={towerOverdue(p) ? 'text-bad' : p.tower_company_clock.status === 'approved' ? 'text-ok' : 'text-warn'}
            >
              <RadioTower size={14} />
            </span>
          )}
          {p.vendor_sla_risk && (
            <span title="Vendor SLA at risk" className="text-warn">
              <Truck size={14} />
            </span>
          )}
          {p.gb_factory && (
            <span title="GB Factory program" className="text-faint">
              <Zap size={12} />
            </span>
          )}
        </div>
      </Td>
      <Td>
        <ManagedChip p={p} />
      </Td>
    </tr>
  )
}

// ---- Headline (insight before data) ---------------------------------------------------
function Headline({ role, programs }: { role: RoleCode; programs: Program[] }) {
  const nav = useNavigate()
  const pos = useApp((s) => s.pos)
  const hc = programHealthCounts(programs)
  const dc = deployCounts(programs)
  const off = programs.filter((p) => p.gap_flags.length)
  const execQ = programs.filter((p) => p.pending_approval?.role === 'EXEC')
  const sess = programs.filter((p) => p.created_in_session)
  let title: ReactNode
  let sub: ReactNode = null
  let cta: ReactNode = null
  const chips = (ps: Program[], tone: 'bad' | 'warn') => (
    <div className="mt-3 flex flex-wrap gap-2">
      {ps.map((p) => (
        <button
          key={p.program_id}
          onClick={() => nav(`/programs/${p.program_id}`)}
          className={clsx('flex h-7 items-center gap-2 border px-2 text-xs hover:bg-panel2', tone === 'bad' ? 'border-bad/40' : 'border-warn/40')}
        >
          <Id>{p.program_id}</Id>
          <span className="max-w-[220px] truncate text-ink">{p.name}</span>
          <ArrowRight size={11} className="text-faint" />
        </button>
      ))}
    </div>
  )
  if (role === 'DEPLOY') {
    const risk = programs.filter((p) => p.vendor_sla_risk)
    title = (
      <>
        <span className="text-ioh-yellow">{dc.pipeline} programs</span> in the pipeline · <span className="text-warn">{dc.vendorRisk} at risk on vendor SLA</span> ·{' '}
        <span className="text-bad">{dc.towerWait} waiting on tower company access</span>
      </>
    )
    sub = `Pipeline = PO, vendor allocation, material dispatch, installation and integration. ${sess.length ? `${sess.length} new program${sess.length > 1 ? 's' : ''} from this session need${sess.length > 1 ? '' : 's'} vendor confirmation.` : ''}`
    cta = (
      <>
        {risk.length > 0 ? chips(risk, 'warn') : <div className="mt-3 text-xs text-ok">No pipeline program is at risk on vendor SLA.</div>}
        <div className="mt-3">
          <Button variant="primary" onClick={() => nav('/programs?tab=vendors')} disabled={!risk.length}>
            <Truck size={14} /> Reallocate vendor capacity on the {risk.length} at-risk program{risk.length === 1 ? '' : 's'}
          </Button>
        </div>
      </>
    )
  } else if (role === 'EXEC') {
    title = (
      <>
        <span className="text-bad">{off.length} programs off track:</span> sites predicted to fail before RFS
      </>
    )
    title = (
      <>
        {title}
        {execQ.length > 0 && (
          <div className="mt-0.5 text-[16px] leading-6">
            <span className="text-ioh-yellow">
              {execQ.length} CapEx program{execQ.length === 1 ? '' : 's'} above threshold
            </span>{' '}
            await{execQ.length === 1 ? 's' : ''} your approval →
          </div>
        )}
      </>
    )
    sub = `${hc.on_track} on track, ${hc.at_risk} at risk, ${hc.late} late across ${programs.length} programs · ${dc.pipeline} in the deployment pipeline`
    cta = (
      <>
        {chips(off, 'bad')}
        <div className="mt-3 flex gap-2">
          <Button onClick={() => nav('/programs?tab=gaps')}>
            <AlertTriangle size={13} /> Open gap flags
          </Button>
        </div>
      </>
    )
  } else if (role === 'PROC') {
    const pp = pendingPos(pos)
    title = (
      <>
        <span className="text-ioh-yellow">{pp.length} POs</span> worth {idr(pp.reduce((s, x) => s + x.amount_idr, 0))} await release
      </>
    )
    sub = `Stage 5 gate: Procurement releases the PO, stock reservations follow. ${dc.pipeline} programs in the deployment pipeline.`
    cta = (
      <div className="mt-3">
        <Button onClick={() => nav('/planner?tab=readiness')}>
          Warehouse readiness <ExternalLink size={12} />
        </Button>
      </div>
    )
  } else {
    const mine = programs.filter((p) => p.pending_approval?.role === role)
    title = (
      <>
        {programs.length} programs · <span className="text-ok">{hc.on_track} on track</span>, <span className="text-warn">{hc.at_risk} at risk</span>, <span className="text-bad">{hc.late} late</span>
      </>
    )
    sub = `${dc.pipeline} in the deployment pipeline · ${off.length} with sites predicted to fail before RFS${mine.length ? ` · ${mine.length} await your decision` : ''}`
    cta = off.length ? chips(off, 'bad') : null
  }
  return (
    <section className="border border-line bg-panel px-5 py-4">
      <div className="mb-1.5 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">
        <Sparkles size={12} /> Program Orchestrator · Monday brief <Fresh f="live" />
      </div>
      <div className="text-[19px] font-semibold leading-7 tracking-tight">{title}</div>
      {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
      {cta}
    </section>
  )
}

// ---- KPI row -----------------------------------------------------------------------------
function KpiRow({ programs, counts, lens }: { programs: Program[]; counts: { on_track: number; at_risk: number; late: number }; lens: string }) {
  const all = useApp((s) => s.programs)
  const budget = programs.reduce((s, p) => s + p.budget_idr, 0)
  const spent = programs.reduce((s, p) => s + p.spent_idr, 0)
  const planned = programs.reduce((s, p) => s + p.sites_planned, 0)
  const rfs = programs.reduce((s, p) => s + p.sites_rfs, 0)
  const cs = cycleStats(all)
  const n = programs.length || 1
  const today = todayIso()
  const dueThisQ = programs
    .filter((p) => p.sites_rfs < p.sites_planned && daysBetween(today, p.forecast_rfs) <= 35 && daysBetween(today, p.forecast_rfs) >= 0)
    .reduce((s, p) => s + p.sites_planned - p.sites_rfs, 0)
  return (
    <div className="grid grid-cols-[180px_repeat(4,minmax(0,1fr))] divide-x divide-line border border-line bg-panel">
      <div className="flex flex-col justify-center px-4 py-2.5">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">{lens}</div>
        <div className="text-xs text-muted">{programs.length} programs</div>
      </div>
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
          Programs by health <Fresh f="D-1" />
        </div>
        <div className="tnum mt-0.5 text-xl font-semibold leading-7">
          <span className="text-ok">{counts.on_track}</span>
          <span className="text-faint"> / </span>
          <span className="text-warn">{counts.at_risk}</span>
          <span className="text-faint"> / </span>
          <span className="text-bad">{counts.late}</span>
        </div>
        <div className="mt-1 flex h-1.5 w-full">
          <div
            style={{
              width: `${(counts.on_track / n) * 100}%`,
              background: STATUS.ok,
            }}
          />
          <div
            style={{
              width: `${(counts.at_risk / n) * 100}%`,
              background: STATUS.warn,
            }}
          />
          <div
            style={{
              width: `${(counts.late / n) * 100}%`,
              background: STATUS.bad,
            }}
          />
        </div>
        <div className="mt-1 text-xs text-muted">on track / at risk / late</div>
      </div>
      <Kpi
        label="Burn vs budget"
        fresh="D-1"
        value={
          <>
            {idr(spent)} <span className="text-sm font-normal text-faint">/ {idr(budget)}</span>
          </>
        }
        sub={
          <>
            <span className="text-ink">{pct((spent / Math.max(1, budget)) * 100)}</span> of approved CapEx and OpEx spent
          </>
        }
      />
      <Kpi
        label="Sites RFS vs planned"
        fresh="D-1"
        value={
          <>
            {num(rfs)} <span className="text-sm font-normal text-faint">/ {num(planned)}</span>
          </>
        }
        sub={
          <>
            {pct((rfs / Math.max(1, planned)) * 100)} RFS · {num(dueThisQ)} more due inside 5 weeks
          </>
        }
      />
      <div className="px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-2xs font-medium uppercase tracking-wider text-faint">
          Decision-to-RFS · median <Fresh f="D-1" />
        </div>
        <div className="tnum mt-0.5 flex items-baseline gap-3 text-xl font-semibold leading-7">
          <span className={cs.nicc <= 5 ? 'text-ok' : 'text-ioh-yellow'}>
            {cs.nicc.toFixed(1)} <span className="text-xs font-medium">wk NICC</span>
          </span>
          <span className="text-base text-muted">
            {cs.legacy.toFixed(1)} <span className="text-xs font-medium">wk legacy</span>
          </span>
        </div>
        <CycleMini nicc={cs.nicc} legacy={cs.legacy} />
        <div className="text-xs text-muted">
          target 4–5 wk · mean {cs.niccMean.toFixed(1)} vs {cs.legacyMean.toFixed(1)}
        </div>
      </div>
    </div>
  )
}

function CycleMini({ nicc, legacy }: { nicc: number; legacy: number }) {
  const max = Math.max(24, legacy)
  return (
    <div className="relative mt-1 h-1.5 w-full bg-line">
      <div className="absolute inset-y-0 left-0 bg-line2" style={{ width: `${(legacy / max) * 100}%` }} />
      <div className="absolute inset-y-0 left-0 bg-ioh-yellow" style={{ width: `${(nicc / max) * 100}%` }} />
      <div className="absolute -inset-y-0.5 border-x border-ok" style={{ left: `${(4 / max) * 100}%`, width: `${(1 / max) * 100}%` }} title="Target 4–5 weeks" />
    </div>
  )
}

// ---- Pending approvals for the current role ----------------------------------------------
function Approvals({ role }: { role: RoleCode }) {
  const programs = useApp((s) => s.programs)
  const pos = useApp((s) => s.pos)
  const policy = usePolicy()
  const nav = useNavigate()
  const [defer, setDefer] = useState<Program | null>(null)
  const today = todayIso()
  const app = useApp.getState
  const gated = programs.filter((p) => p.pending_approval && p.pending_approval.role === role && p.pending_approval.gate !== 'PO')
  const awaitingVendor = role === 'DEPLOY' ? programs.filter((p) => p.created_in_session && !p.stage_history.some((h) => h.stage === 'Vendor allocation')) : []
  const poList = role === 'PROC' ? pendingPos(pos) : []
  const total = gated.length + awaitingVendor.length + poList.length
  const approve = (p: Program) => {
    app().approveProgram(p.program_id, 'approve')
    app().toast(
      p.pending_approval?.gate === 'Decision'
        ? `${p.program_id} approved at the Decision gate${p.pending_approval.cosign ? `; routed to ${p.pending_approval.cosign} for co-sign` : ''}. BOQ Agent started.`
        : `${p.program_id} ${p.pending_approval?.gate ?? ''} approved.`,
    )
  }
  return (
    <section className="flex min-h-0 flex-col border border-line bg-panel">
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-line px-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          Pending approvals <span className="tnum text-ioh-yellow">{total}</span>
        </h3>
        <div className="flex items-center gap-1.5 text-xs text-faint">
          for {role} <Fresh f="live" />
        </div>
      </header>
      <div className="max-h-[230px] min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        {total === 0 && (
          <div className="px-4 py-6 text-sm text-faint">
            {role === 'PROC' || role === 'DEPLOY' || role === 'EXEC' || role === 'PLAN'
              ? 'Queue clear. Nothing awaits your decision in the Program Console.'
              : 'This role approves no program gates. Program decisions sit with Head of Network, Planning, Deployment and Procurement.'}
          </div>
        )}
        {gated.map((p) => {
          const pa = p.pending_approval!
          const age = daysBetween(pa.since, today)
          const variance = p.blockers.find((b) => b.type === 'boq_variance')
          return (
            <div key={p.program_id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Id onClick={() => nav(`/programs/${p.program_id}`)}>{p.program_id}</Id>
                    <Badge tone={pa.gate === 'Decision' ? 'yellow' : 'warn'}>{pa.gate === 'Decision' ? 'Stage 3 · Decision' : `Stage 4 · ${pa.gate}`}</Badge>
                    {pa.cosign && <Badge tone="blue">+ {pa.cosign} co-sign</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium">{p.name}</div>
                  <div className="tnum text-xs text-muted">
                    {variance ? variance.text : `${idr(p.budget_idr)} · ${INTERVENTION_LABEL[p.capex_class]} · ${p.sites_planned} sites · RFS ${date(p.target_rfs)}`}
                  </div>
                  <div className="text-[11px] text-faint">
                    Waiting {age} d{pa.cosign && p.budget_idr > policy.cfo_cosign_above_idr ? ` · above ${idr(policy.cfo_cosign_above_idr)} CFO threshold` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button size="sm" variant="ok" onClick={() => approve(p)}>
                    Approve
                  </Button>
                  <Button size="sm" onClick={() => setDefer(p)}>
                    Defer
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
        {awaitingVendor.map((p) => {
          const v = vendorById(p.vendor_id)
          return (
            <div key={p.program_id} className="px-4 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Id className="text-ioh-yellow" onClick={() => nav(`/programs/${p.program_id}`)}>
                      {p.program_id}
                    </Id>
                    <Badge tone="yellow">New</Badge>
                    <Badge tone="neutral">Stage 6 · Vendor allocation</Badge>
                  </div>
                  <div className="mt-0.5 truncate text-[13px] font-medium">{p.name}</div>
                  <div className="text-xs text-muted">
                    Vendor Allocation Agent proposes <span className="text-ink">{v?.name}</span> · {p.sites_planned} sites
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <Button
                    size="sm"
                    variant="ok"
                    onClick={() => {
                      app().confirmVendor(p.program_id, p.vendor_id)
                      app().toast(`${v?.short} confirmed on ${p.program_id}. Site survey work orders released to the field.`)
                    }}
                  >
                    Confirm {v?.short}
                  </Button>
                  <Button size="sm" onClick={() => nav(`/programs/${p.program_id}`)}>
                    Open
                  </Button>
                </div>
              </div>
            </div>
          )
        })}
        {poList.map((po) => {
          const p = programs.find((x) => x.program_id === po.program_id)
          return (
            <div key={po.po_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Id>{po.po_id}</Id>
                  <Badge tone="yellow">Stage 5 · PO release</Badge>
                </div>
                <div className="truncate text-[13px] font-medium">
                  <Id onClick={() => nav(`/programs/${po.program_id}`)}>{po.program_id}</Id> {p?.name}
                </div>
                <div className="tnum text-xs text-muted">
                  {po.category} · {vendorById(po.vendor)?.short} · <span className="text-ink">{idr(po.amount_idr)}</span> · due {date(po.due)}
                </div>
              </div>
              <Button
                size="sm"
                variant="ok"
                onClick={() => {
                  app().releasePO(po.po_id)
                  app().toast(`${po.po_id} released to ${vendorById(po.vendor)?.short}. Stock reservation confirmed.`)
                }}
              >
                Release
              </Button>
            </div>
          )
        })}
      </div>
      {role === 'PROC' && (
        <div className="border-t border-line px-4 py-2 text-xs">
          <button onClick={() => nav('/planner?tab=readiness')} className="flex items-center gap-1 text-muted hover:text-ioh-yellow">
            Stock and pre-positioning in Warehouse readiness <ExternalLink size={11} />
          </button>
        </div>
      )}
      <ReasonModal
        open={!!defer}
        onClose={() => setDefer(null)}
        title={`Defer ${defer?.program_id ?? ''}`}
        confirmLabel="Defer"
        onSubmit={(reason) => {
          if (!defer) return
          app().approveProgram(defer.program_id, 'defer', reason)
          app().toast(`${defer.program_id} deferred: ${reason}`, 'warn')
        }}
      />
    </section>
  )
}
