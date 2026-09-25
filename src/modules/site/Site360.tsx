import clsx from 'clsx'
import { ClipboardList, ExternalLink, FilePlus2, FolderPlus, ShieldX, Truck, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import { db, kpiAt, kpiMean, kpiSeries } from '@/data/db'
import type { KpiKey } from '@/data/types'
import { Badge, Button, Dot, Fresh, Id, Label, Modal, ReasonModal, Spark } from '@/components/ui'
import { STATUS, statusOf } from '@/lib/colors'
import { CLASS_LABEL, SEGMENT_LABEL, STATUS_LABEL, countdown, date, dateShort, idr, num } from '@/lib/format'
import { crossingWeek, healthFrom, isOpen, lastDay, siteHealth } from '@/lib/metrics'
import { buildPlan } from '@/lib/plan'
import { nextProgramId, nowIso, todayIso, useApp, usePolicy } from '@/store/app'

type TileKey = 'availability' | 'cnx' | 'bad_session_pct' | 'prb_util' | 'throughput_mbps' | 'alarms' | 'tickets' | 'failure'

const TILES: { key: TileKey; label: string; unit: string; digits: number; good: 'high' | 'low' }[] = [
  { key: 'availability', label: 'Availability', unit: '%', digits: 2, good: 'high' },
  { key: 'cnx', label: 'CNX', unit: '', digits: 1, good: 'high' },
  { key: 'bad_session_pct', label: 'Bad sessions', unit: '%', digits: 1, good: 'low' },
  { key: 'prb_util', label: 'PRB utilisation', unit: '%', digits: 0, good: 'low' },
  { key: 'throughput_mbps', label: 'Throughput', unit: 'Mbps', digits: 1, good: 'high' },
  { key: 'alarms', label: 'Alarms (7 d)', unit: '', digits: 0, good: 'low' },
  { key: 'tickets', label: 'Tickets (7 d)', unit: '', digits: 0, good: 'low' },
  { key: 'failure', label: 'Failure p · 8 wk', unit: '%', digits: 0, good: 'low' },
]

const DEFAULT_IV: Record<string, string> = { capacity: 'sector_add', power: 'power', transport: 'transport', ran_hardware: 'ran_swap', environmental: 'flood' }

function anomalies(v: number[]): number[] {
  const n = v.length
  const mean = v.reduce((s, x) => s + x, 0) / n
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / n) || 1
  return v.map((x, i) => (Math.abs(x - mean) / sd > 2.3 ? i : -1)).filter((i) => i >= 0)
}

export function Site360({ siteId, mode, onClose }: { siteId: string; mode: 'drawer' | 'page'; onClose?: () => void }) {
  const D = db()
  const nav = useNavigate()
  const policy = usePolicy()
  const incidents = useApp((s) => s.incidents)
  const programs = useApp((s) => s.programs)
  const workOrders = useApp((s) => s.workOrders)
  const reservations = useApp((s) => s.reservations)
  const [tile, setTile] = useState<TileKey>(() => focusTileFor(siteId))
  const [modal, setModal] = useState<null | 'fp' | 'dispatch' | 'program'>(null)
  const i = D.siteIdx.get(siteId)!
  const s = D.sites[i]
  const fc = D.forecast[i]
  const day = lastDay()
  const dist = D.distById[s.district_id]
  const prov = D.provById[s.province_id]
  const T = policy.colour_thresholds
  const health = siteHealth(i, day)
  const cw = crossingWeek(i, policy.red_min_probability)

  const siteIncidents = incidents.filter((x) => x.site_ids.includes(siteId))
  const openInc = siteIncidents.filter(isOpen)
  const siteWos = workOrders.filter((w) => w.site_id === siteId && w.status !== 'completed')
  const sitePrograms = programs.filter((p) => p.site_ids.includes(siteId))
  const cohorts = D.cohortsBySite.get(siteId) ?? []
  const revSeries = D.revenue.series[i]
  const totalSubs = cohorts.reduce((a, c) => a + c.subs, 0)
  const churnSubs = cohorts.reduce((a, c) => a + c.churn_risk_subs, 0)


  const tileVal = (k: TileKey): number => {
    if (k === 'failure') return fc.failure_prob[7] * 100
    if (k === 'alarms' || k === 'tickets') return kpiSeries(k, i, day - 6, day + 1).reduce((a, b) => a + b, 0)
    return kpiAt(k as KpiKey, i, day)
  }
  const tileStatus = (k: TileKey): number => {
    const v = tileVal(k)
    switch (k) {
      case 'availability':
        return statusOf(v, T.availability)
      case 'cnx':
        return statusOf(v, T.cnx)
      case 'bad_session_pct':
        return statusOf(v, T.bad_session)
      case 'prb_util':
        return statusOf(v, T.prb)
      case 'failure':
        return v >= policy.red_min_probability * 100 ? 2 : v >= T.failure.green ? 1 : 0
      case 'alarms':
        return v > 20 ? 2 : v > 8 ? 1 : 0
      case 'tickets':
        return v > 6 ? 2 : v > 3 ? 1 : 0
      default:
        return 0
    }
  }
  const series30 = (k: TileKey) => (k === 'failure' ? fc.failure_prob.map((p) => p * 100) : kpiSeries(k as KpiKey, i, day - 29, day + 1))

  const neighbours = useMemo(() => {
    const out: { idx: number; km: number }[] = []
    for (let j = 0; j < D.sites.length; j++) {
      if (j === i) continue
      const o = D.sites[j]
      const dx = (o.lon - s.lon) * 111 * Math.cos((s.lat * Math.PI) / 180)
      const dy = (o.lat - s.lat) * 111
      const km = Math.hypot(dx, dy)
      if (km < 25) out.push({ idx: j, km })
    }
    return out.sort((a, b) => a.km - b.km).slice(0, 8)
  }, [i, s, D])
  const nbBad = neighbours.filter((n) => statusOf(siteHealth(n.idx, day), T.health) >= 1 || crossingWeek(n.idx, policy.red_min_probability) > 0).length
  const areaProblem = neighbours.length >= 4 && nbBad >= Math.ceil(neighbours.length / 2)

  const requestBoq = () => {
    const app = useApp.getState()
    const inc = openInc.find((x) => x.site_ids.length > 1)
    const ids = inc ? inc.site_ids : [siteId]
    const plan = buildPlan({
      siteIds: ids,
      intervention: DEFAULT_IV[fc.failure_class] ?? 'refarm',
      sourceIncident: inc?.incident_id ?? null,
      programs,
      reservations,
      windowDays: cw ? cw * 7 : null,
      today: todayIso(),
      nextProgramId: nextProgramId(programs),
    })
    app.setPlan(plan)
    app.logAudit({ action: 'BOQ requested', object: siteId, detail: `${ids.length} site(s)` })
    nav('/planner?tab=builder')
  }

  const big = (
    <BigChart
      key={tile}
      i={i}
      tile={tile}
      thresholds={{
        availability: T.availability.amber,
        cnx: T.cnx.amber,
        bad_session_pct: T.bad_session.amber,
        prb_util: T.prb.amber,
      }}
      redFloor={policy.red_min_probability * 100}
    />
  )

  const header = (
    <div className="border-b border-line px-4 pb-3 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-ioh-yellow">{s.site_id}</span>
            <Badge tone={statusOf(health, T.health) === 2 ? 'bad' : statusOf(health, T.health) === 1 ? 'warn' : 'ok'}>Health {health.toFixed(0)}</Badge>
            {cw > 0 && <Badge tone="bad">Predicted {CLASS_LABEL[fc.failure_class]} · W+{cw}</Badge>}
            {sitePrograms.some((p) => !p.complete && p.stage !== 'Validation') && <Badge tone="prog">In program</Badge>}
            <Fresh f="D-1" asOf={D.meta.as_of} />
          </div>
          <div className="mt-0.5 truncate text-lg font-semibold">{s.name}</div>
          <div className="text-xs text-muted">
            {dist.type === 'kabupaten' ? 'Kab. ' : ''}
            {dist.name.replace('Kota ', 'Kota ')} · {prov.name} · {s.region} · {prov.tz}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {mode === 'drawer' && (
            <button onClick={() => nav(`/site/${siteId}`)} className="flex h-7 items-center gap-1 px-2 text-xs text-muted hover:text-ink" title="Open full page">
              <ExternalLink size={13} /> Full page
            </button>
          )}
          {onClose && (
            <button onClick={onClose} className="flex h-7 w-7 items-center justify-center text-muted hover:text-ink" aria-label="Close Site 360">
              <X size={16} />
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
        <Fact k="Coordinates" v={`${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}`} />
        <Fact k="Site class" v={{ macro: 'Macro', small_cell: 'Small cell', ibs: 'IBS', das: 'DAS' }[s.site_class]} />
        <Fact k="RAN vendor" v={s.vendor} />
        <Fact k="On air" v={date(s.on_air_date)} />
        <Fact k="Technologies" v={s.technologies.join(' · ')} />
        <Fact k="Backhaul" v={s.backhaul} />
        <Fact k="Power" v={s.power_type} />
        <Fact k="Tower" v={`${s.tower_company} · ${s.structure}`} />
        <Fact k="Cluster" v={s.cluster} mono />
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => nav(`/incidents?incident=${useApp.getState().createIncidentForSite(siteId)}`)}>
          <FilePlus2 size={13} /> Create incident
        </Button>
        <Button size="sm" onClick={() => setModal('program')}>
          <FolderPlus size={13} /> Add to program
        </Button>
        <Button size="sm" onClick={() => setModal('dispatch')}>
          <Truck size={13} /> Dispatch
        </Button>
        <Button size="sm" onClick={requestBoq}>
          <ClipboardList size={13} /> Request BOQ
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setModal('fp')}>
          <ShieldX size={13} /> Mark false positive
        </Button>
      </div>
    </div>
  )

  const tiles = (
    <div className="grid grid-cols-4 border-b border-line">
      {TILES.map((t) => {
        const v = tileVal(t.key)
        const st = tileStatus(t.key)
        const ser = series30(t.key)
        const active = tile === t.key
        return (
          <button key={t.key} onClick={() => setTile(t.key)} className={clsx('border-b border-r border-line px-3 py-2 text-left last:border-r-0 [&:nth-child(4n)]:border-r-0', active ? 'bg-panel2' : 'hover:bg-panel2/60')}>
            <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
              <Dot status={st} />
              <span className="truncate">{t.label}</span>
            </div>
            <div className="tnum mt-0.5 text-base font-semibold">
              {v.toFixed(t.digits)}
              <span className="text-xs font-normal text-muted">{t.unit && ` ${t.unit}`}</span>
            </div>
            <Spark values={ser} width={100} height={20} color={active ? '#FFD100' : '#6B7280'} markers={t.key === 'failure' ? [] : anomalies(ser)} />
          </button>
        )
      })}
    </div>
  )

  const factors = (
    <div className="border-b border-line px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <Label>Predicted failure · top contributing factors</Label>
        <span className="text-[10.5px] text-faint">Site Failure Prediction Agent · gradient-boosted, 90-day window</span>
      </div>
      <div className="mb-2 flex items-center gap-3 text-sm">
        <span className="font-semibold">{CLASS_LABEL[fc.failure_class]}</span>
        <span className="tnum text-muted">
          p(W+8) {Math.round(fc.failure_prob[7] * 100)}%{cw > 0 ? ` · crosses ${Math.round(policy.red_min_probability * 100)}% at W+${cw} (${dateShort(D.weekEndDates[cw - 1])})` : ' · below red floor'}
        </span>
        {fc.failure_class === 'capacity' && <span className="tnum text-muted">· {fc.capacity_weeks_to_saturation >= 26 ? '> 26' : fc.capacity_weeks_to_saturation.toFixed(1)} wks to saturation</span>}
      </div>
      {fc.top_factors.map((f) => (
        <div key={f.factor} className="mb-1 flex items-center gap-3 text-xs">
          <div className="w-44 shrink-0 truncate text-muted" title={f.factor}>
            {f.factor}
          </div>
          <div className="h-1.5 flex-1 bg-line">
            <div className="h-full bg-ioh-yellow" style={{ width: `${f.weight * 100}%` }} />
          </div>
          <div className="tnum w-9 text-right text-faint">{Math.round(f.weight * 100)}%</div>
        </div>
      ))}
    </div>
  )

  const customer = (
    <div className="border-b border-line px-4 py-3">
      <Label className="mb-2">Customer impact</Label>
      <div className="grid grid-cols-3 gap-3 text-sm">
        <Stat k="Subscribers in catchment" v={num(totalSubs)} />
        <Stat k="Postpaid share" v={`${Math.round(D.revenue.postpaid[i] * 100)}%`} />
        <Stat k="Enterprise accounts" v={num(D.revenue.enterprise[i])} />
        <Stat k="Monthly revenue" v={idr(D.revenue.latest[i])} sub={<Spark values={revSeries} width={80} height={16} color="#FFD100" />} />
        <Stat k="Churn-risk cohort" v={num(churnSubs)} tone={churnSubs > 1000 ? 'warn' : undefined} />
        <Stat k="Energy OpEx" v={idr(s.energy.energy_opex_idr_month)} sub={`Genset ${s.energy.genset_hours_day} h/d · battery ${s.energy.battery_health_pct}%`} />
      </div>
      <table className="mt-3 w-full text-xs">
        <thead>
          <tr className="text-left text-2xs uppercase tracking-wider text-faint">
            <th className="py-1 font-semibold">Segment</th>
            <th className="py-1 text-right font-semibold">Subs</th>
            <th className="py-1 text-right font-semibold">CNX</th>
            <th className="py-1 text-right font-semibold">Δ 28 d</th>
            <th className="py-1 text-right font-semibold">Churn risk</th>
            <th className="py-1 pl-3 font-semibold">Top complaint (CX Agent)</th>
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.cohort_id} className="border-t border-line/60">
              <td className="py-1">{SEGMENT_LABEL[c.segment]}</td>
              <td className="tnum py-1 text-right">{num(c.subs)}</td>
              <td className="tnum py-1 text-right">{c.cnx.toFixed(1)}</td>
              <td className={clsx('tnum py-1 text-right', c.cnx_delta_28d <= -2 ? 'text-bad' : c.cnx_delta_28d < 0 ? 'text-warn' : 'text-ok')}>{c.cnx_delta_28d > 0 ? '+' : ''}{c.cnx_delta_28d.toFixed(1)}</td>
              <td className="tnum py-1 text-right">{num(c.churn_risk_subs)}</td>
              <td className="truncate py-1 pl-3 text-muted">{c.top_complaint}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const ops = (
    <div className="border-b border-line px-4 py-3">
      <Label className="mb-2">Open incidents and work orders</Label>
      {openInc.length === 0 && siteWos.length === 0 && <div className="text-xs text-faint">None open for this site.</div>}
      {openInc.map((x) => {
        const cd = countdown(x.sla_due, nowIso())
        return (
          <button key={x.incident_id} onClick={() => nav(`/incidents?incident=${x.incident_id}`)} className="mb-1.5 flex w-full items-center gap-2 border border-line px-2 py-1.5 text-left hover:border-line2">
            <Id>{x.incident_id}</Id>
            <span className="min-w-0 flex-1 truncate text-xs">{x.title}</span>
            <Badge>{STATUS_LABEL[x.status]}</Badge>
            <span className="text-2xs text-faint">{x.owner_role}</span>
            <span className={clsx('tnum text-2xs', cd.overdue ? 'text-bad' : 'text-muted')}>SLA {cd.text}</span>
          </button>
        )
      })}
      {siteWos.map((w) => (
        <div key={w.wo_id} className="mb-1 flex items-center gap-2 px-2 text-xs">
          <Id>{w.wo_id}</Id>
          <span className="flex-1 truncate">{w.type}</span>
          <span className="text-faint">{D.engineers.find((e) => e.engineer_id === w.engineer_id)?.name}</span>
          <Badge tone={w.status === 'overdue' ? 'bad' : 'neutral'}>{w.status.replace('_', ' ')}</Badge>
          <span className="tnum text-faint">due {dateShort(w.due)}</span>
        </div>
      ))}
    </div>
  )

  const progs = (
    <div className="border-b border-line px-4 py-3">
      <Label className="mb-2">Program membership</Label>
      {sitePrograms.length === 0 && <div className="text-xs text-faint">Not in any plan or program.</div>}
      {sitePrograms.map((p) => (
        <button key={p.program_id} onClick={() => nav(`/programs/${p.program_id}`)} className="mb-1 flex w-full items-center gap-2 border border-line px-2 py-1.5 text-left hover:border-line2">
          <Id>{p.program_id}</Id>
          <span className="min-w-0 flex-1 truncate text-xs">{p.name}</span>
          <Badge tone={p.health === 'on_track' ? 'ok' : p.health === 'at_risk' ? 'warn' : 'bad'}>{p.health.replace('_', ' ')}</Badge>
          <span className="text-2xs text-muted">{p.stage}</span>
          <span className="tnum text-2xs text-faint">RFS {dateShort(p.forecast_rfs)}</span>
        </button>
      ))}
    </div>
  )

  const nb = (
    <div className="px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <Label>Neighbour view · 8 nearest within 25 km</Label>
        <Badge tone={areaProblem ? 'bad' : 'ok'}>{areaProblem ? 'Area problem' : 'Local problem'}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-1">
        {neighbours.map((n) => {
          const o = D.sites[n.idx]
          const h = siteHealth(n.idx, day)
          const ncw = crossingWeek(n.idx, policy.red_min_probability)
          return (
            <button key={o.site_id} onClick={() => nav(mode === 'drawer' ? `/map?site=${o.site_id}` : `/site/${o.site_id}`)} className="flex items-center gap-2 border border-line px-2 py-1 text-left text-xs hover:border-line2">
              <Dot status={statusOf(h, T.health)} />
              <span className="font-mono text-[11px] text-muted">{o.site_id}</span>
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              {ncw > 0 && <span className="text-2xs text-bad">W+{ncw}</span>}
              <span className="tnum text-faint">{n.km.toFixed(1)} km</span>
            </button>
          )
        })}
      </div>
    </div>
  )

  const modals = (
    <>
      <ReasonModal
        open={modal === 'fp'}
        onClose={() => setModal(null)}
        title={`Mark ${siteId} prediction as false positive`}
        codes={['Known sensor fault', 'Event ended (festival, holiday)', 'Already mitigated locally', 'Planned maintenance window', 'Data quality issue']}
        onSubmit={(r) => {
          useApp.getState().markFalsePositiveSite(siteId, r)
          useApp.getState().toast('Logged as false positive; sent to Override Learning Agent')
        }}
      />
      <ReasonModal
        open={modal === 'dispatch'}
        onClose={() => setModal(null)}
        title={`Dispatch a field engineer to ${siteId}`}
        confirmLabel="Dispatch"
        codes={['Alarm investigation', 'Preventive check ahead of predicted failure', 'Battery / power check', 'Customer complaint cluster', 'Evidence for RFS']}
        onSubmit={(r) => {
          useApp.getState().dispatchSite(siteId, r)
          useApp.getState().toast('Work order created and assigned by the Dispatch Agent')
        }}
      />
      <AddToProgram open={modal === 'program'} onClose={() => setModal(null)} siteId={siteId} />
    </>
  )

  if (mode === 'drawer')
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tiles}
          <div className="border-b border-line px-2 py-3">{big}</div>
          {factors}
          {customer}
          {ops}
          {progs}
          {nb}
        </div>
        {modals}
      </div>
    )

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto grid max-w-[1500px] grid-cols-[minmax(0,1fr)_480px] gap-0 border-x border-line bg-panel">
        <div className="border-r border-line">
          {header}
          {tiles}
          <div className="border-b border-line px-2 py-3">{big}</div>
          {factors}
          {customer}
        </div>
        <div>
          {ops}
          {progs}
          {nb}
          <HealthMath i={i} />
        </div>
      </div>
      {modals}
    </div>
  )
}

// The chart opens on the metric that matters for this site's predicted failure class.
function focusTileFor(siteId: string): TileKey {
  const D = db()
  const fc = D.forecast[D.siteIdx.get(siteId)!]
  const story = D.sites[D.siteIdx.get(siteId)!].story
  if (story === 'surabaya_cnx') return 'cnx'
  return fc.failure_class === 'capacity' ? 'prb_util' : fc.failure_class === 'transport' ? 'availability' : fc.failure_class === 'power' || fc.failure_class === 'ran_hardware' ? 'alarms' : 'cnx'
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <span className="text-faint">{k} </span>
      <span className={clsx('capitalize text-ink', mono && 'font-mono normal-case text-[11px]')}>{v}</span>
    </div>
  )
}
function Stat({ k, v, sub, tone }: { k: string; v: string; sub?: React.ReactNode; tone?: 'warn' }) {
  return (
    <div>
      <div className="text-2xs text-faint">{k}</div>
      <div className={clsx('tnum font-semibold', tone === 'warn' && 'text-warn')}>{v}</div>
      {sub && <div className="text-[10.5px] text-faint">{sub}</div>}
    </div>
  )
}

function BigChart({ i, tile, thresholds, redFloor }: { i: number; tile: TileKey; thresholds: Partial<Record<TileKey, number>>; redFloor: number }) {
  const D = db()
  const day = lastDay()
  const fc = D.forecast[i]
  if (tile === 'failure') {
    const data = [{ w: 'Today', p: 0 }, ...fc.failure_prob.map((p, k) => ({ w: `W+${k + 1}`, p: Math.round(p * 1000) / 10 }))]
    return (
      <div>
        <div className="mb-1 flex items-center justify-between px-2">
          <Label>Forward 8-week predicted trajectory · failure probability</Label>
          <Fresh f="D-1" />
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="#2A2F3A" vertical={false} />
            <XAxis dataKey="w" tick={{ fill: '#6B7280', fontSize: 11 }} stroke="#2A2F3A" />
            <YAxis domain={[0, 100]} tick={{ fill: '#6B7280', fontSize: 11 }} stroke="#2A2F3A" unit="%" />
            <Tooltip contentStyle={{ background: '#171A21', border: '1px solid #353B48', fontSize: 12 }} />
            <ReferenceLine y={redFloor} stroke={STATUS.bad} strokeDasharray="4 3" label={{ value: `red floor ${redFloor}%`, fill: STATUS.bad, fontSize: 10, position: 'insideTopLeft' }} />
            <Area dataKey="p" stroke="#FFD100" fill="#FFD100" fillOpacity={0.12} strokeWidth={2} name="Failure probability" isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }
  const key = tile as KpiKey
  const hist = kpiSeries(key, i, day - 29, day + 1)
  const an = new Set(anomalies(hist))
  const dates = D.kpi.dates.slice(day - 29, day + 1)
  // Forward trajectory: linear trend from the last 30 days, bent by the predicted failure curve.
  const n = hist.length
  const xm = (n - 1) / 2
  const ym = hist.reduce((a, b) => a + b, 0) / n
  let num_ = 0
  let den = 0
  hist.forEach((y, x) => {
    num_ += (x - xm) * (y - ym)
    den += (x - xm) ** 2
  })
  const slope = den ? num_ / den : 0
  const showForward = key === 'prb_util' || key === 'cnx' || key === 'availability' || key === 'bad_session_pct' || key === 'throughput_mbps'
  const clampV = (v: number) => (key === 'availability' ? Math.min(100, v) : key === 'prb_util' ? Math.min(100, Math.max(0, v)) : Math.max(0, v))
  const data: { d: string; v?: number; a?: number; f?: number; lo?: number; hi?: number; band?: [number, number] }[] = hist.map((v, k) => ({ d: dateShort(dates[k]), v: Math.round(v * 100) / 100, a: an.has(k) ? v : undefined }))
  if (showForward) {
    const last = hist[n - 1]
    data[n - 1].f = last
    for (let w = 1; w <= 8; w++) {
      const f = clampV(last + slope * 7 * w)
      const spread = Math.abs(slope) * 7 * w * 0.35 + (key === 'availability' ? 0.05 : 1) * w * 0.4
      data.push({ d: `W+${w}`, f: Math.round(f * 100) / 100, band: [clampV(f - spread), clampV(f + spread)] })
    }
  }
  const thr = thresholds[tile]
  const label = TILES.find((t) => t.key === tile)!.label
  return (
    <div>
      <div className="mb-1 flex items-center justify-between px-2">
        <Label>
          {label} · 30-day trend{showForward ? ' + 8-week projection' : ''} <span className="normal-case text-faint">(red dots: anomalies)</span>
        </Label>
        <Fresh f="D-1" />
      </div>
      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="#2A2F3A" vertical={false} />
          <XAxis dataKey="d" tick={{ fill: '#6B7280', fontSize: 10.5 }} stroke="#2A2F3A" interval={4} />
          <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} stroke="#2A2F3A" domain={key === 'prb_util' || key === 'availability' ? [(m: number) => Math.floor(m - 2), (m: number) => Math.min(100, Math.ceil(m + 1))] : ['auto', 'auto']} allowDecimals={false} />
          <Tooltip contentStyle={{ background: '#171A21', border: '1px solid #353B48', fontSize: 12 }} labelStyle={{ color: '#A3AAB8' }} />
          {thr !== undefined && <ReferenceLine y={thr} stroke={STATUS.bad} strokeDasharray="4 3" label={{ value: 'breach', fill: STATUS.bad, fontSize: 10, position: 'insideTopLeft' }} />}
          {showForward && <ReferenceLine x={data[n - 1].d} stroke="#6B7280" strokeDasharray="2 3" label={{ value: 'today', fill: '#A3AAB8', fontSize: 10, position: 'insideTopRight' }} />}
          {showForward && <Area dataKey="band" stroke="none" fill="#FFD100" fillOpacity={0.08} isAnimationActive={false} name="Projection band" />}
          <Line dataKey="v" stroke="#E5E7EB" dot={false} strokeWidth={1.6} isAnimationActive={false} name="Actual" />
          {showForward && <Line dataKey="f" stroke="#FFD100" strokeDasharray="5 4" dot={false} strokeWidth={2} isAnimationActive={false} name="Projected" />}
          <Scatter dataKey="a" fill={STATUS.bad} isAnimationActive={false} name="Anomaly" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

function HealthMath({ i }: { i: number }) {
  const day = lastDay()
  const av = kpiAt('availability', i, day)
  const cx = kpiAt('cnx', i, day)
  const bd = kpiAt('bad_session_pct', i, day)
  const pr = kpiAt('prb_util', i, day)
  const al = kpiMean('alarms', i, day, 7)
  return (
    <div className="border-t border-line px-4 py-3">
      <Label className="mb-2">Evidence · how the health score is built</Label>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted">
        <span>Availability {av.toFixed(2)}% × 30%</span>
        <span>CNX {cx.toFixed(1)} × 25%</span>
        <span>Bad sessions {bd.toFixed(1)}% × 15%</span>
        <span>PRB {pr.toFixed(0)}% × 15%</span>
        <span>Alarms {al.toFixed(1)}/day × 15%</span>
        <span className="font-semibold text-ink">Composite {healthFrom(av, cx, bd, pr, al).toFixed(0)} / 100</span>
      </div>
      <div className="mt-1 text-[10.5px] text-faint">Site Health Agent · D-1 · weights editable with IOH model owners</div>
    </div>
  )
}

function AddToProgram({ open, onClose, siteId }: { open: boolean; onClose: () => void; siteId: string }) {
  const D = db()
  const programs = useApp((s) => s.programs)
  const s = D.sites[D.siteIdx.get(siteId)!]
  const cands = programs.filter((p) => p.region === s.region && !p.complete && ['Decision', 'BOQ', 'PO', 'Vendor allocation'].includes(p.stage))
  const [pid, setPid] = useState(cands[0]?.program_id ?? '')
  return (
    <Modal open={open} onClose={onClose} title={`Add ${siteId} to a program`}>
      {cands.length === 0 ? (
        <div className="text-sm text-muted">No program in {s.region} is early enough to take new sites. Use Request BOQ to draft a new plan.</div>
      ) : (
        <>
          <div className="mb-2 text-xs text-muted">Programs in {s.region} still before material dispatch</div>
          <select value={pid} onChange={(e) => setPid(e.target.value)} className="mb-4 h-8 w-full border border-line2 bg-panel2 px-2 text-sm">
            {cands.map((p) => (
              <option key={p.program_id} value={p.program_id}>
                {p.program_id} · {p.name} ({p.stage})
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const st = useApp.getState()
                useApp.setState({
                  programs: st.programs.map((p) => (p.program_id === pid && !p.site_ids.includes(siteId) ? { ...p, site_ids: [...p.site_ids, siteId], sites_planned: p.sites_planned + 1 } : p)),
                })
                st.logAudit({ action: 'Site added to program', object: siteId, detail: pid })
                st.toast(`${siteId} added to ${pid}; BOQ Agent will re-draft the BOQ`)
                onClose()
              }}
            >
              Add to program
            </Button>
          </div>
        </>
      )}
    </Modal>
  )
}
