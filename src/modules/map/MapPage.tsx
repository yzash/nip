import clsx from 'clsx'
import { Columns2, Layers, Pause, Play, SlidersHorizontal, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db, kpiAt } from '@/data/db'
import { Dot, Fresh, Kpi, Seg } from '@/components/ui'
import { RoleBrief } from '@/components/RoleBrief'
import { SEQ, STATUS, statusOf } from '@/lib/colors'
import { date, idr, num, pct } from '@/lib/format'
import { crossingWeek, isOpen, lastDay, scopeBounds, scopeLabel, siteHealth } from '@/lib/metrics'
import { DEFAULT_FILTERS, useApp, useFilters, usePolicy, useRole, useScope, type LayerId } from '@/store/app'
import { Site360 } from '@/modules/site/Site360'
import { LAYERS, computeLayer, provinceRollup, revenueBreaks, type LayerResult } from './layers'
import { MapView, type HoverInfo } from './MapView'

export function MapPage() {
  const [params, setParams] = useSearchParams()
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const filters = useFilters()
  const layer = useApp((s) => s.layer)
  const setLayer = useApp((s) => s.setLayer)
  const scrub = useApp((s) => s.scrub)
  const overlays = useApp((s) => s.overlays)
  const programs = useApp((s) => s.programs)
  const incidents = useApp((s) => s.incidents)
  const compare = useApp((s) => s.compare)
  const setCompare = useApp((s) => s.setCompare)
  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const selected = params.get('site')

  useEffect(() => {
    const l = params.get('layer') as LayerId | null
    if (l && LAYERS.some((x) => x.id === l)) setLayer(l)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const res = useMemo(
    () => computeLayer({ layer, scrub, filters, policy, role, scope, programs, incidents }),
    [layer, scrub, filters, policy, role, scope, programs, incidents],
  )

  // Fit: role scope on role change, then explicit focus (district / story) or selected site.
  const focus = params.get('focus')
  const fit = useMemo(() => {
    const D = db()
    if (focus === 'bekasi') {
      const pts = D.sites.filter((s) => s.story === 'bekasi_capacity')
      return { key: `f-bekasi-${selected}`, bounds: bbox(pts.map((s) => [s.lon, s.lat])) }
    }
    if (focus && D.distById[focus]) {
      const pts = D.sites.filter((s) => s.district_id === focus)
      return { key: `f-${focus}`, bounds: bbox(pts.map((s) => [s.lon, s.lat])) }
    }
    if (selected && D.siteIdx.has(selected)) {
      const s = D.sites[D.siteIdx.get(selected)!]
      return { key: `s-${selected}`, bounds: [s.lon - 0.12, s.lat - 0.1, s.lon + 0.12, s.lat + 0.1] as [number, number, number, number] }
    }
    const b = scopeBounds(role, scope)
    return b ? { key: `r-${role.role_code}-${scope}`, bounds: b } : null
  }, [focus, selected, role, scope])

  const highlight = useMemo(() => {
    if (!selected) return null
    const inc = incidents.find((x) => isOpen(x) && x.site_ids.includes(selected) && x.site_ids.length > 1)
    return inc ? inc.site_ids : null
  }, [selected, incidents])

  const openSite = (id: string) => {
    const p = new URLSearchParams(params)
    p.set('site', id)
    p.delete('focus')
    setParams(p)
  }
  const closeSite = () => {
    const p = new URLSearchParams(params)
    p.delete('site')
    setParams(p)
  }

  return (
    <div className="absolute inset-0 flex">
      <div className="relative min-w-0 flex-1">
        {compare ? (
          <CompareView res={res} onClose={() => setCompare(false)} />
        ) : (
          <MapView res={res} layer={layer} overlays={overlays} policy={policy} selectedSite={selected} highlightSites={highlight} fit={fit} onHover={setHover} onSiteClick={openSite} />
        )}
        <KpiStrip res={res} />
        {!compare && <LayerPanel />}
        {!compare && <Legend res={res} />}
        <Scrubber res={res} />
        {!compare && !selected && <RoleBrief />}
        <div className="absolute right-3 top-[84px] z-20 flex flex-col gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={clsx('flex h-8 items-center gap-1.5 border bg-panel px-2.5 text-xs font-semibold', showFilters ? 'border-ioh-yellow text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}
          >
            <SlidersHorizontal size={13} /> Slice and dice
            <FilterCount />
          </button>
          <button
            onClick={() => setCompare(!compare)}
            className={clsx('flex h-8 items-center gap-1.5 border bg-panel px-2.5 text-xs font-semibold', compare ? 'border-ioh-yellow text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}
          >
            <Columns2 size={13} /> Compare
          </button>
        </div>
        {showFilters && <FilterPanel onClose={() => setShowFilters(false)} />}
        {hover && !compare && <HoverCard h={hover} res={res} />}
      </div>
      {selected && db().siteIdx.has(selected) && (
        <aside className="relative z-30 w-[560px] shrink-0 border-l border-line bg-panel">
          <Site360 siteId={selected} mode="drawer" onClose={closeSite} />
        </aside>
      )}
    </div>
  )
}

function bbox(pts: number[][]): [number, number, number, number] {
  let [x0, y0, x1, y1] = [180, 90, -180, -90]
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x)
    y0 = Math.min(y0, y)
    x1 = Math.max(x1, x)
    y1 = Math.max(y1, y)
  }
  const pad = 0.03
  return [x0 - pad, y0 - pad, x1 + pad, y1 + pad]
}

function FilterCount() {
  const f = useFilters()
  const n = f.regions.length + f.provinces.length + f.technologies.length + f.vendors.length + f.siteClasses.length + (f.segment !== 'all' ? 1 : 0) + (f.program !== 'all' ? 1 : 0) + (f.incident !== 'all' ? 1 : 0)
  return n ? <span className="tnum bg-ioh-yellow px-1 text-[10px] text-canvas">{n}</span> : null
}

// ---- KPI strip (scope-aware) ---------------------------------------------------------
function KpiStrip({ res }: { res: LayerResult }) {
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const incidents = useApp((s) => s.incidents)
  const scrub = useApp((s) => s.scrub)
  const D = db()
  const k = useMemo(() => {
    const day = lastDay() + Math.min(0, scrub)
    let n = 0
    let red = 0
    let amber = 0
    let av = 0
    let cx = 0
    let pred = 0
    const week = scrub > 0 ? Math.min(8, Math.ceil(scrub / 7)) : 8
    const thr = policy.red_min_probability
    for (let i = 0; i < D.sites.length; i++) {
      if (!res.inScope[i] || !res.visible[i]) continue
      n++
      const h = statusOf(siteHealth(i, day), policy.colour_thresholds.health)
      if (h === 2) red++
      else if (h === 1) amber++
      av += kpiAt('availability', i, day)
      cx += kpiAt('cnx', i, day)
      if (D.forecast[i].failure_prob[week - 1] >= thr) pred++
    }
    const scoped = incidents.filter((x) => isOpen(x) && x.site_ids.some((sid) => res.inScope[D.siteIdx.get(sid)!]))
    const atRisk = scoped.reduce((s, x) => s + x.exposure_idr, 0)
    return { n, red, amber, av: av / Math.max(1, n), cx: cx / Math.max(1, n), pred, week, open: scoped.length, atRisk }
  }, [res, incidents, scrub, policy, D])
  return (
    <div className="absolute left-3 right-3 top-3 z-20 flex divide-x divide-line overflow-x-auto border border-line bg-panel/95">
      <div className="flex min-w-[150px] flex-col justify-center px-4">
        <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">{scopeLabel(role, scope)}</div>
        <div className="truncate text-xs text-muted">{role.title}</div>
      </div>
      <Kpi label="Sites in scope" value={num(k.n)} sub={D.meta.sample_note.includes('6,000') ? 'sample of ~60,000' : undefined} fresh="D-1" />
      <Kpi label="Red / amber" value={<><span className="text-bad">{num(k.red)}</span><span className="text-faint"> / </span><span className="text-warn">{num(k.amber)}</span></>} sub="Site health" fresh="D-1" />
      <Kpi label="Availability" value={pct(k.av, 2)} sub="Mean, cell level" fresh="D-1" tone={k.av >= policy.colour_thresholds.availability.green ? 'ok' : 'warn'} />
      <Kpi label="Average CNX" value={k.cx.toFixed(1)} sub="All segments" fresh="D-1" />
      <Kpi label="Revenue at risk" value={idr(k.atRisk)} sub={`per month · ${idr((k.atRisk * 7) / 30)} this week`} tone="yellow" fresh="D-1" />
      <Kpi label="Open incidents" value={num(k.open)} sub="In scope" fresh="live" />
      <Kpi label={`Predicted failures${scrub > 0 ? ` by W+${k.week}` : ' · 8 wks'}`} value={num(k.pred)} sub={`p ≥ ${Math.round(policy.red_min_probability * 100)}%`} tone="bad" fresh="D-1" />
    </div>
  )
}

// ---- Layer selector -----------------------------------------------------------------
function LayerPanel() {
  const layer = useApp((s) => s.layer)
  const setLayer = useApp((s) => s.setLayer)
  const overlays = useApp((s) => s.overlays)
  const toggle = useApp((s) => s.toggleOverlay)
  const filters = useFilters()
  const setFilters = useApp((s) => s.setFilters)
  const [open, setOpen] = useState(true)
  return (
    <div className="absolute left-3 top-[84px] z-20 w-[228px] border border-line bg-panel/95">
      <button onClick={() => setOpen(!open)} className="flex h-9 w-full items-center gap-2 border-b border-line px-3 text-xs font-semibold uppercase tracking-wider text-muted">
        <Layers size={13} /> Layers
        <span className="ml-auto normal-case tracking-normal text-faint">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="py-1">
          {LAYERS.map((l) => (
            <div key={l.id}>
              <button
                onClick={() => setLayer(l.id)}
                title={l.desc}
                className={clsx('flex h-8 w-full items-center gap-2 px-3 text-left text-sm', layer === l.id ? 'bg-panel2 font-semibold text-ink' : 'text-muted hover:text-ink')}
              >
                <span className={clsx('h-3 w-3 shrink-0 rounded-full border', layer === l.id ? 'border-ioh-yellow bg-ioh-yellow' : 'border-line2')} />
                {l.label}
                {l.id === 'failure' && <span className="ml-auto text-2xs font-semibold text-ioh-yellow">W+8</span>}
              </button>
              {layer === 'cnx' && l.id === 'cnx' && (
                <div className="px-3 pb-2 pt-1">
                  <select value={filters.segment} onChange={(e) => setFilters({ segment: e.target.value as typeof filters.segment })} className="h-7 w-full border border-line2 bg-panel2 px-1 text-xs">
                    <option value="all">All segments</option>
                    <option value="consumer_4g">Consumer 4G</option>
                    <option value="consumer_5g">Consumer 5G</option>
                    <option value="postpaid">Postpaid</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
              )}
              {layer === 'availability' && l.id === 'availability' && (
                <div className="px-3 pb-2 pt-1">
                  <Seg options={[{ id: 1, label: '24 h' }, { id: 7, label: '7 d' }, { id: 30, label: '30 d' }]} value={filters.availabilityWindow} onChange={(v) => setFilters({ availabilityWindow: v as 1 | 7 | 30 })} />
                </div>
              )}
            </div>
          ))}
          <div className="mt-1 border-t border-line px-3 pb-2 pt-2">
            <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-faint">Stack overlays</div>
            {([['backbone', 'Backbone links'], ['cdn', 'CDN PoPs'], ['program', 'Program outline']] as const).map(([k, label]) => (
              <label key={k} className="flex h-7 cursor-pointer items-center gap-2 text-sm text-muted hover:text-ink">
                <input type="checkbox" checked={overlays[k]} onChange={() => toggle(k)} className="accent-[#FFD100]" />
                {label}
                {k === 'program' && <span className="ml-auto h-3 w-3 rounded-full border-2 border-prog" />}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Legend({ res }: { res: LayerResult }) {
  const layer = useApp((s) => s.layer)
  const policy = usePolicy()
  const T = policy.colour_thresholds
  const rows: [string, string][] = (() => {
    const t = (k: keyof typeof T, unit = '') => {
      const x = T[k]
      return x.dir === 'high'
        ? ([
            [STATUS.ok, `≥ ${x.green}${unit}`],
            [STATUS.warn, `${x.amber}–${x.green}${unit}`],
            [STATUS.bad, `< ${x.amber}${unit}`],
          ] as [string, string][])
        : ([
            [STATUS.ok, `< ${x.green}${unit}`],
            [STATUS.warn, `${x.green}–${x.amber}${unit}`],
            [STATUS.bad, `≥ ${x.amber}${unit}`],
          ] as [string, string][])
    }
    switch (layer) {
      case 'cnx':
        return t('cnx')
      case 'availability':
        return t('availability', '%')
      case 'bad_session':
        return t('bad_session', '%')
      case 'prb':
        return t('prb', '%')
      case 'backbone':
        return t('link_util', '% util')
      case 'cdn':
        return t('cache_hit', '% cache hit')
      case 'failure':
        return res.mode === 'predicted'
          ? [
              [STATUS.ok, `< ${T.failure.green}%`],
              [STATUS.warn, `${T.failure.green}–${Math.round(policy.red_min_probability * 100)}%`],
              [STATUS.bad, `≥ ${Math.round(policy.red_min_probability * 100)}% (red floor)`],
            ]
          : t('health')
      case 'revenue': {
        const b = revenueBreaks()
        return [
          [SEQ[0], `< ${idr(b[0])}`],
          [SEQ[2], `${idr(b[1])}–${idr(b[2])}`],
          [SEQ[4], `${idr(b[3])}–${idr(b[4])}`],
          [SEQ[5], `> ${idr(b[4])} / month`],
        ]
      }
      case 'program':
        return [[STATUS.prog, 'Inside an active program']]
      default:
        return t('health')
    }
  })()
  return (
    <div className="absolute bottom-[92px] right-14 z-20 border border-line bg-panel/95 px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-faint">
        {LAYERS.find((l) => l.id === layer)?.label}
        <Fresh f="D-1" />
      </div>
      {rows.map(([c, l]) => (
        <div key={l} className="flex items-center gap-2 text-xs text-muted">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: c }} />
          {l}
        </div>
      ))}
      {layer !== 'program' && layer !== 'revenue' && (
        <>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS.nodata }} />
            No data / planned
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: STATUS.prog }} />
            In active program
          </div>
        </>
      )}
      <div className="mt-1 text-[10px] text-faint">Thresholds editable in Agent Studio</div>
    </div>
  )
}

// ---- Time scrubber ------------------------------------------------------------------
function Scrubber({ res }: { res: LayerResult }) {
  const layer = useApp((s) => s.layer)
  const scrub = useApp((s) => s.scrub)
  const setScrub = useApp((s) => s.setScrub)
  const [playing, setPlaying] = useState(false)
  const future = layer === 'failure'
  const min = -30
  const max = future ? 56 : 0
  const timer = useRef<number | null>(null)
  useEffect(() => {
    if (!playing) return
    timer.current = window.setInterval(() => {
      const s = useApp.getState().scrub
      const next = s >= max ? min : s + (s >= 0 ? 7 : 3)
      useApp.getState().setScrub(Math.min(max, next))
      if (next >= max) setPlaying(false)
    }, 650)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [playing, max])
  const D = db()
  const span = max - min
  const pos = (d: number) => `${((d - min) / span) * 100}%`
  const ticks = future ? [-30, -14, 0, 7, 14, 21, 28, 35, 42, 49, 56] : [-30, -21, -14, -7, 0]
  const tickLabel = (d: number) => (d === 0 ? 'Today' : d < 0 ? `D${d}` : `W+${d / 7}`)
  const dateLabel = scrub > 0 ? D.weekEndDates[Math.ceil(scrub / 7) - 1] : D.kpi.dates[lastDay() + scrub]
  return (
    <div className="absolute bottom-3 left-3 right-3 z-20 flex h-[68px] items-center gap-4 border border-line bg-panel/95 px-4">
      <button onClick={() => setPlaying(!playing)} className="flex h-8 w-8 shrink-0 items-center justify-center border border-line2 hover:border-ioh-yellow" aria-label="Play">
        {playing ? <Pause size={14} /> : <Play size={14} />}
      </button>
      <div className="w-[200px] shrink-0">
        <div className={clsx('text-2xs font-semibold uppercase tracking-wider', res.mode === 'predicted' ? 'text-ioh-yellow' : 'text-faint')}>{res.mode === 'predicted' ? `Predicted · W+${Math.ceil(scrub / 7)}` : scrub === 0 ? 'Actual · latest (D-1)' : 'Actual · history'}</div>
        <div className="tnum text-sm font-semibold">{date(dateLabel)}</div>
        {!future && <div className="text-[10.5px] text-faint">Switch to Predicted Failure to see W+8</div>}
      </div>
      <div className="relative flex-1">
        <div className="absolute left-0 right-0 top-[9px] h-1 bg-line" />
        {future && <div className="absolute top-[9px] h-1 bg-ioh-yellow/35" style={{ left: pos(0), right: 0 }} />}
        <div className="absolute top-[9px] h-1 bg-ioh-yellow" style={{ left: pos(Math.min(0, scrub)), width: `${(Math.abs(scrub) / span) * 100}%` }} />
        <input type="range" className="scrub relative z-10 w-full" min={min} max={max} step={1} value={scrub} onChange={(e) => setScrub(Number(e.target.value))} aria-label="Time scrubber" />
        <div className="relative mt-0.5 h-4">
          {ticks.map((t) => (
            <button key={t} onClick={() => setScrub(t)} className={clsx('absolute -translate-x-1/2 text-[10.5px]', t === 0 ? 'font-bold text-ink' : t > 0 ? 'text-ioh-yellow/80' : 'text-faint')} style={{ left: pos(t) }}>
              {tickLabel(t)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---- Filters ------------------------------------------------------------------------
function FilterPanel({ onClose }: { onClose: () => void }) {
  const f = useFilters()
  const set = useApp((s) => s.setFilters)
  const reset = useApp((s) => s.resetFilters)
  const D = db()
  const toggle = (key: 'regions' | 'provinces' | 'technologies' | 'vendors' | 'siteClasses', v: string) => {
    const cur = f[key]
    set({ [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] } as Partial<typeof DEFAULT_FILTERS>)
  }
  const Chip = ({ k, v, label }: { k: 'regions' | 'provinces' | 'technologies' | 'vendors' | 'siteClasses'; v: string; label?: string }) => (
    <button onClick={() => toggle(k, v)} className={clsx('h-6 border px-2 text-xs', f[k].includes(v) ? 'border-ioh-yellow bg-ioh-yellow/15 text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}>
      {label ?? v}
    </button>
  )
  return (
    <div className="absolute bottom-[92px] right-3 top-[160px] z-30 flex w-[300px] flex-col border border-line bg-panel">
      <div className="flex h-9 items-center justify-between border-b border-line px-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Slice and dice</span>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="text-xs text-faint hover:text-ink">
            Reset
          </button>
          <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Close filters">
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
        <Group label="Region">
          {['Jabodetabek', 'Java', 'Sumatra', 'Kalimantan', 'Sulawesi', 'Bali Nusra', 'Papua Maluku'].map((r) => (
            <Chip key={r} k="regions" v={r} />
          ))}
        </Group>
        <Group label="Province">
          <select
            value=""
            onChange={(e) => e.target.value && toggle('provinces', e.target.value)}
            className="h-7 w-full border border-line2 bg-panel2 px-1 text-xs"
          >
            <option value="">Add province…</option>
            {D.provinces.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {f.provinces.map((p) => (
            <Chip key={p} k="provinces" v={p} label={`${D.provById[p].name} ×`} />
          ))}
        </Group>
        <Group label="Technology">
          {['2G', '4G', '5G', 'FTTH'].map((t) => (
            <Chip key={t} k="technologies" v={t} />
          ))}
        </Group>
        <Group label="RAN vendor">
          {['Ericsson', 'Nokia', 'Huawei', 'ZTE'].map((t) => (
            <Chip key={t} k="vendors" v={t} />
          ))}
        </Group>
        <Group label="Site class">
          {[['macro', 'Macro'], ['small_cell', 'Small cell'], ['ibs', 'IBS'], ['das', 'DAS']].map(([v, l]) => (
            <Chip key={v} k="siteClasses" v={v} label={l} />
          ))}
        </Group>
        <Group label="Customer segment (CNX)">
          <select value={f.segment} onChange={(e) => set({ segment: e.target.value as typeof f.segment })} className="h-7 w-full border border-line2 bg-panel2 px-1 text-xs">
            <option value="all">All segments</option>
            <option value="consumer_4g">Consumer 4G</option>
            <option value="consumer_5g">Consumer 5G</option>
            <option value="postpaid">Postpaid</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </Group>
        <Group label="Program membership">
          <Seg options={[{ id: 'all', label: 'All' }, { id: 'in', label: 'In program' }, { id: 'out', label: 'Not in program' }]} value={f.program} onChange={(v) => set({ program: v })} />
        </Group>
        <Group label="Incident status">
          <Seg options={[{ id: 'all', label: 'All' }, { id: 'open', label: 'Open incident' }, { id: 'none', label: 'None' }]} value={f.incident} onChange={(v) => set({ incident: v })} />
        </Group>
        <div className="text-[10.5px] text-faint">Filters compose and persist per role.</div>
      </div>
    </div>
  )
}
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  )
}

// ---- Hover card ---------------------------------------------------------------------
function HoverCard({ h, res }: { h: HoverInfo; res: LayerResult }) {
  const D = db()
  const layer = useApp((s) => s.layer)
  const policy = usePolicy()
  const style = { left: Math.min(h.x + 16, window.innerWidth - 600), top: h.y + 12 }
  let body: React.ReactNode = null
  if (h.kind === 'site') {
    const i = D.siteIdx.get(h.id)!
    const s = D.sites[i]
    const day = lastDay()
    const hl = siteHealth(i, day)
    const cw = crossingWeek(i, policy.red_min_probability)
    body = (
      <>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-ioh-yellow">{s.site_id}</span>
          <span className="text-2xs text-faint">{D.distById[s.district_id].name}</span>
        </div>
        <div className="mb-1.5 text-sm font-semibold">{s.name}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-faint">Health</span>
          <span className="tnum flex items-center gap-1.5">
            <Dot status={statusOf(hl, policy.colour_thresholds.health)} />
            {hl.toFixed(0)}
          </span>
          <span className="text-faint">CNX</span>
          <span className="tnum">{kpiAt('cnx', i, day).toFixed(1)}</span>
          <span className="text-faint">Availability</span>
          <span className="tnum">{kpiAt('availability', i, day).toFixed(2)}%</span>
          <span className="text-faint">Revenue</span>
          <span className="tnum">{idr(D.revenue.latest[i])}/mo</span>
          {layer === 'failure' && res.mode === 'predicted' && (
            <>
              <span className="text-faint">Failure p</span>
              <span className="tnum text-ioh-yellow">{res.value[i].toFixed(0)}%</span>
            </>
          )}
          {cw > 0 && (
            <>
              <span className="text-faint">Predicted</span>
              <span className="text-bad">W+{cw} · {D.forecast[i].failure_class.replace('_', ' ')}</span>
            </>
          )}
        </div>
        <div className="mt-1.5 text-[10.5px] text-faint">Click for Site 360 · data D-1</div>
      </>
    )
  } else if (h.kind === 'province') {
    const pr = D.provById[h.id]
    const r = provinceRollup(res, layer).get(h.id)
    body = (
      <>
        <div className="text-sm font-semibold">{pr.name}</div>
        <div className="mb-1 text-xs text-faint">
          {pr.region} · {pr.tz} · {pr.districts} kabupaten/kota
        </div>
        {r && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <span className="text-faint">Sites</span>
            <span className="tnum">{num(r.n)}</span>
            <span className="text-faint">Red / amber</span>
            <span className="tnum">
              <span className="text-bad">{r.red}</span> / <span className="text-warn">{r.amber}</span>
            </span>
            <span className="text-faint">Revenue</span>
            <span className="tnum">{idr(r.revenue)}/mo</span>
          </div>
        )}
        <div className="mt-1.5 text-[10.5px] text-faint">Click to zoom to province</div>
      </>
    )
  } else if (h.kind === 'link') {
    const l = D.links.find((x) => x.link_id === h.id)!
    body = (
      <>
        <div className="font-mono text-[11px] text-ioh-yellow">{l.link_id}</div>
        <div className="mb-1 text-sm font-semibold">{l.name}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-faint">Type</span>
          <span className="capitalize">{l.type}{l.protected ? '' : ' · unprotected'}</span>
          <span className="text-faint">Utilisation</span>
          <span className="tnum">{l.util_pct.toFixed(0)}% of {l.capacity_gbps} Gbps</span>
          <span className="text-faint">State</span>
          <span className={clsx('capitalize', l.fault_state !== 'ok' && 'text-bad')}>{l.fault_state}</span>
          <span className="text-faint">Dependent sites</span>
          <span className="tnum">{l.dependent_sites}</span>
        </div>
      </>
    )
  } else {
    const c = D.cdn.find((x) => x.pop_id === h.id)!
    body = (
      <>
        <div className="font-mono text-[11px] text-ioh-yellow">{c.pop_id}</div>
        <div className="mb-1 text-sm font-semibold">
          {c.partner} · {c.city}
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
          <span className="text-faint">Cache hit</span>
          <span className="tnum">
            {c.cache_hit_pct}% ({c.cache_hit_delta_7d > 0 ? '+' : ''}
            {c.cache_hit_delta_7d} 7 d)
          </span>
          <span className="text-faint">Egress</span>
          <span className="tnum">{c.egress_gbps} Gbps</span>
          <span className="text-faint">Latency</span>
          <span className="tnum">{c.latency_ms} ms</span>
          <span className="text-faint">Egress cost</span>
          <span className="tnum">{idr(c.egress_cost_idr_month)}/mo</span>
        </div>
      </>
    )
  }
  return (
    <div className="pointer-events-none absolute z-40 w-[230px] border border-line2 bg-panel px-3 py-2" style={style}>
      {body}
    </div>
  )
}

// ---- Compare mode -------------------------------------------------------------------
function CompareView({ res, onClose }: { res: LayerResult; onClose: () => void }) {
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const filters = useFilters()
  const layer = useApp((s) => s.layer)
  const overlays = useApp((s) => s.overlays)
  const programs = useApp((s) => s.programs)
  const incidents = useApp((s) => s.incidents)
  const [mode, setMode] = useState<'dates' | 'provinces'>('dates')
  const [scrubA, setScrubA] = useState(-28)
  const [scrubB, setScrubB] = useState(layer === 'failure' ? 28 : 0)
  const [provA, setProvA] = useState('JBR')
  const [provB, setProvB] = useState('SLS')
  const [cam, setCam] = useState<{ center: [number, number]; zoom: number } | null>(null)
  const D = db()
  const resA = useMemo(() => (mode === 'dates' ? computeLayer({ layer, scrub: scrubA, filters, policy, role, scope, programs, incidents }) : res), [mode, layer, scrubA, filters, policy, role, scope, programs, incidents, res])
  const resB = useMemo(() => (mode === 'dates' ? computeLayer({ layer, scrub: scrubB, filters, policy, role, scope, programs, incidents }) : res), [mode, layer, scrubB, filters, policy, role, scope, programs, incidents, res])
  const opts = layer === 'failure' ? [-28, -14, 0, 14, 28, 42, 56] : [-30, -21, -14, -7, 0]
  const optLabel = (d: number) => (d === 0 ? 'Today (D-1)' : d < 0 ? `D${d}` : `W+${d / 7}`)
  const summary = (r: LayerResult, prov?: string) => {
    let n = 0
    let red = 0
    let amber = 0
    for (let i = 0; i < D.sites.length; i++) {
      if (!r.visible[i]) continue
      if (prov && D.sites[i].province_id !== prov) continue
      n++
      if (r.status[i] === 2) red++
      else if (r.status[i] === 1) amber++
    }
    return { n, red, amber }
  }
  const Side = ({ which }: { which: 'A' | 'B' }) => {
    const r = which === 'A' ? resA : resB
    const prov = mode === 'provinces' ? (which === 'A' ? provA : provB) : undefined
    const s = summary(r, prov)
    const fit = prov ? { key: `${which}-${prov}`, bounds: D.provById[prov].bbox } : null
    return (
      <div className="relative min-w-0 flex-1 border-r border-line last:border-r-0">
        <MapView
          res={r}
          layer={layer}
          overlays={overlays}
          policy={policy}
          compact
          fit={fit}
          camera={mode === 'dates' ? cam : null}
          onCamera={mode === 'dates' ? setCam : undefined}
        />
        <div className="absolute left-3 top-[84px] z-20 border border-line bg-panel/95 px-3 py-2">
          <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Side {which}</div>
          {mode === 'dates' ? (
            <select value={which === 'A' ? scrubA : scrubB} onChange={(e) => (which === 'A' ? setScrubA : setScrubB)(Number(e.target.value))} className="h-7 border border-line2 bg-panel2 px-1 text-xs">
              {opts.map((o) => (
                <option key={o} value={o}>
                  {optLabel(o)}
                </option>
              ))}
            </select>
          ) : (
            <select value={prov} onChange={(e) => (which === 'A' ? setProvA : setProvB)(e.target.value)} className="h-7 border border-line2 bg-panel2 px-1 text-xs">
              {D.provinces.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <div className="tnum mt-1.5 text-xs text-muted">
            {num(s.n)} sites · <span className="text-bad">{s.red} red</span> · <span className="text-warn">{s.amber} amber</span>
          </div>
          <div className="text-[10.5px] text-faint">{r.label}</div>
        </div>
      </div>
    )
  }
  return (
    <div className="absolute inset-0 flex">
      <Side which="A" />
      <Side which="B" />
      <div className="absolute left-1/2 top-[84px] z-30 flex -translate-x-1/2 items-center gap-2 border border-line bg-panel px-2 py-1.5">
        <Seg options={[{ id: 'dates', label: 'Two dates' }, { id: 'provinces', label: 'Two provinces' }]} value={mode} onChange={setMode} />
        <button onClick={onClose} className="flex h-7 items-center gap-1 px-2 text-xs text-muted hover:text-ink">
          <X size={13} /> Exit compare
        </button>
      </div>
    </div>
  )
}
