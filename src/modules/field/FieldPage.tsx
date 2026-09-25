import clsx from 'clsx'
import { Camera, Check, CheckCircle2, ChevronRight, Eye, ImageIcon, Package, Send, Siren, Trash2, Wrench } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { db, kpiAt, kpiSeries } from '@/data/db'
import type { WorkOrder } from '@/data/types'
import { Badge, Dot, Fresh, Id } from '@/components/ui'
import { addDays, date, dateShort, daysBetween, num, weekday } from '@/lib/format'
import { isOpen, lastDay, siteStatusToday } from '@/lib/metrics'
import { todayIso, useApp, usePolicy, useRole, useScope } from '@/store/app'

const ACTIVE = new Set<WorkOrder['status']>(['open', 'in_progress', 'overdue'])
const DONE = new Set<WorkOrder['status']>(['completed', 'evidence_submitted'])

export function FieldPage() {
  const D = db()
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const workOrders = useApp((s) => s.workOrders)
  const programs = useApp((s) => s.programs)
  const isField = role.role_code === 'FIELD'
  const today = todayIso()
  const weekEnd = addDays(today, 7)

  const engineerId = isField ? role.engineer_id! : params.get('eng') ?? db().roles.find((r) => r.role_code === 'FIELD')!.engineer_id!
  const engineer = D.engineers.find((e) => e.engineer_id === engineerId)
  const mine = useMemo(() => workOrders.filter((w) => w.engineer_id === engineerId), [workOrders, engineerId])

  // District label: the FIELD scope, or the engineer's most common district
  const district = useMemo(() => {
    if (isField) return scope
    const c = new Map<string, number>()
    for (const w of mine) {
      const s = D.sites[D.siteIdx.get(w.site_id)!]
      const n = D.distById[s?.district_id]?.name
      if (n) c.set(n, (c.get(n) ?? 0) + 1)
    }
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? engineer?.province_id ?? ''
  }, [isField, scope, mine, D, engineer])
  const distDef = Object.values(D.distById).find((d) => d.name === district)
  const distLabel = distDef ? `${distDef.type === 'kabupaten' ? 'Kab.' : 'Kota'} ${district}` : district

  const active = useMemo(
    () =>
      mine
        .filter((w) => ACTIVE.has(w.status) && w.due <= weekEnd)
        .sort((a, b) => a.due.localeCompare(b.due) || (a.priority === 'high' ? -1 : 1) - (b.priority === 'high' ? -1 : 1)),
    [mine, weekEnd],
  )
  const done = useMemo(() => mine.filter((w) => DONE.has(w.status) && daysBetween(w.due, today) <= 7).sort((a, b) => b.due.localeCompare(a.due)), [mine, today])
  const groups = useMemo(() => {
    const g = new Map<string, WorkOrder[]>()
    for (const w of active) {
      const k = w.program_id ?? '__maint'
      const a = g.get(k)
      if (a) a.push(w)
      else g.set(k, [w])
    }
    // New programs created this session first (demo step 7), then maintenance and faults, then other programs
    const rank = (k: string) => (k === '__maint' ? 1 : programs.find((p) => p.program_id === k)?.created_in_session ? 0 : 2)
    const keys = [...g.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    return keys.map((k) => ({ key: k, items: g.get(k)! }))
  }, [active, programs])

  const selId = params.get('wo')
  const selected = mine.find((w) => w.wo_id === selId) ?? groups[0]?.items[0] ?? done[0] ?? null
  const select = (id: string) => {
    const p = new URLSearchParams(params)
    p.set('wo', id)
    setParams(p, { replace: true })
  }
  useEffect(() => {
    if (selected && selId && selected.wo_id !== selId && !mine.some((w) => w.wo_id === selId)) select(selected.wo_id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId])

  const dueToday = active.filter((w) => w.due === today).length
  const overdue = active.filter((w) => w.due < today || w.status === 'overdue').length
  const inProg = active.filter((w) => w.status === 'in_progress').length
  const evid = done.filter((w) => w.status === 'evidence_submitted').length

  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      {/* Header */}
      <div className="shrink-0 border-b border-line bg-panel px-5 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-faint">
              <span className="font-mono">WK</span> Field worklist · {engineer?.name} <Id className="normal-case">{engineerId}</Id>
              <Fresh f="live" />
            </div>
            <h1 className="mt-0.5 text-[19px] font-semibold leading-7">This week&apos;s priority sites · {distLabel}</h1>
            <div className="mt-0.5 text-sm text-muted">
              Monday decision:{' '}
              <span className="font-semibold text-ioh-yellow">
                Complete and evidence {active.length} work order{active.length === 1 ? '' : 's'}
              </span>{' '}
              · {dateShort(today)} – {dateShort(addDays(today, 6))}
            </div>
          </div>
          <div className="flex items-stretch gap-0 border border-line">
            <Count k="Open this week" v={active.length} />
            <Count k="Due today" v={dueToday} tone={dueToday ? 'warn' : undefined} />
            <Count k="Overdue" v={overdue} tone={overdue ? 'bad' : undefined} />
            <Count k="In progress" v={inProg} />
            <Count k="Evidenced" v={evid} tone="ok" last />
          </div>
        </div>
        {!isField && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5 text-xs text-muted">
            <Eye size={14} className="text-faint" />
            <span>View only. Viewing any engineer&apos;s week:</span>
            <select
              value={engineerId}
              onChange={(e) => {
                const p = new URLSearchParams()
                p.set('eng', e.target.value)
                setParams(p, { replace: true })
              }}
              className="h-8 border border-line2 bg-panel2 px-2 text-sm text-ink"
            >
              {D.engineers.map((e) => (
                <option key={e.engineer_id} value={e.engineer_id}>
                  {e.name} · {e.engineer_id} · {e.region}
                </option>
              ))}
            </select>
            <span className="text-faint">Switch to the Field Engineer role to execute checklists and submit evidence.</span>
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* List */}
        <div className="w-[400px] shrink-0 overflow-y-auto border-r border-line bg-panel max-[1100px]:w-[360px]">
          {groups.length === 0 && <div className="px-5 py-10 text-center text-sm text-faint">No open work orders due this week.</div>}
          {groups.map((g) => {
            const prog = g.key === '__maint' ? null : programs.find((p) => p.program_id === g.key)
            const isNew = prog?.created_in_session
            return (
              <div key={g.key}>
                <div className="sticky top-0 z-10 flex h-10 items-center justify-between gap-2 border-b border-line bg-panel2 px-4">
                  <div className="min-w-0 truncate text-xs font-semibold">
                    {prog ? (
                      <>
                        <span className="text-faint">From </span>
                        <span className="font-mono text-[11px] text-[#B79CFF]">{prog.program_id}</span> <span>{prog.name}</span>
                      </>
                    ) : (
                      <span>Maintenance and faults</span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isNew && <Badge tone="yellow">New today</Badge>}
                    <span className="tnum text-xs font-semibold text-muted">{g.items.length}</span>
                  </div>
                </div>
                {g.items.map((w) => (
                  <WoRow key={w.wo_id} w={w} selected={selected?.wo_id === w.wo_id} onClick={() => select(w.wo_id)} today={today} health={siteStatusToday(D.siteIdx.get(w.site_id) ?? 0, policy)} />
                ))}
              </div>
            )
          })}
          {done.length > 0 && (
            <div>
              <div className="sticky top-0 z-10 flex h-10 items-center justify-between border-b border-line bg-panel2 px-4">
                <span className="text-xs font-semibold text-muted">Recently completed</span>
                <span className="tnum text-xs font-semibold text-faint">{done.length}</span>
              </div>
              {done.map((w) => (
                <WoRow key={w.wo_id} w={w} selected={selected?.wo_id === w.wo_id} onClick={() => select(w.wo_id)} today={today} health={siteStatusToday(D.siteIdx.get(w.site_id) ?? 0, policy)} />
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1 overflow-y-auto">{selected ? <WoDetail key={selected.wo_id} w={selected} canEdit={isField} onIncident={(id) => nav(`/incidents?incident=${id}`)} /> : <div className="p-10 text-center text-sm text-faint">Select a work order</div>}</div>
      </div>
    </div>
  )
}

function Count({ k, v, tone, last }: { k: string; v: number; tone?: 'ok' | 'warn' | 'bad'; last?: boolean }) {
  return (
    <div className={clsx('min-w-[84px] px-3 py-1.5', !last && 'border-r border-line')}>
      <div className="whitespace-nowrap text-2xs font-semibold uppercase tracking-wider text-faint">{k}</div>
      <div className={clsx('tnum text-xl font-semibold leading-7', tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-ink')}>{v}</div>
    </div>
  )
}

function dueLabel(due: string, today: string): { text: string; tone: string } {
  const d = daysBetween(today, due)
  if (d < 0) return { text: `${-d} d overdue`, tone: 'text-bad' }
  if (d === 0) return { text: 'Due today', tone: 'text-warn' }
  if (d === 1) return { text: `Tomorrow · ${weekday(due)} ${dateShort(due)}`, tone: 'text-ink' }
  return { text: `${weekday(due)} ${dateShort(due)}`, tone: 'text-muted' }
}

function partTone(status: string): 'ok' | 'warn' | 'bad' | 'neutral' {
  const s = status.toLowerCase()
  if (s.startsWith('ready')) return 'ok'
  if (s.includes('transit') || s.includes('transfer')) return 'warn'
  if (s.includes('awaiting') || s.includes('short')) return 'bad'
  return 'neutral'
}

const STATUS_BADGE: Record<WorkOrder['status'], { t: string; tone: 'neutral' | 'blue' | 'bad' | 'ok' | 'yellow' }> = {
  open: { t: 'Open', tone: 'neutral' },
  in_progress: { t: 'In progress', tone: 'blue' },
  overdue: { t: 'Overdue', tone: 'bad' },
  completed: { t: 'Completed', tone: 'ok' },
  evidence_submitted: { t: 'Evidence submitted', tone: 'ok' },
}

function WoRow({ w, selected, onClick, today, health }: { w: WorkOrder; selected: boolean; onClick: () => void; today: string; health: number }) {
  const D = db()
  const s = D.sites[D.siteIdx.get(w.site_id)!]
  const due = dueLabel(w.due, today)
  const doneSteps = w.checklist.filter((c) => c.done).length
  const finished = DONE.has(w.status)
  return (
    <button onClick={onClick} className={clsx('relative flex min-h-[76px] w-full items-start gap-3 border-b border-line/70 px-4 py-3 text-left', selected ? 'bg-ioh-yellow/[0.07]' : 'hover:bg-panel2')}>
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-ioh-yellow" />}
      <div className="pt-1.5">
        <Dot status={finished ? 0 : health} className="h-2.5 w-2.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Id className="shrink-0 whitespace-nowrap text-[12px]">{w.site_id}</Id>
            <span className="truncate text-sm font-semibold">{s?.name}</span>
          </div>
          {w.priority === 'high' && !finished && <Badge tone="red">High</Badge>}
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
          <span className="text-muted">{w.type}</span>
          <span className={clsx('tnum font-semibold', finished ? 'text-faint' : due.tone)}>{finished ? `Done · ${dateShort(w.due)}` : due.text}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {w.status !== 'open' && <Badge tone={STATUS_BADGE[w.status].tone}>{STATUS_BADGE[w.status].t}</Badge>}
          {!finished && (
            <span className="tnum text-2xs text-faint">
              {doneSteps}/{w.checklist.length} steps
            </span>
          )}
          {w.parts.map((p) => (
            <Badge key={p.sku} tone={partTone(p.status)}>
              {p.sku} · {p.status.replace('Ready at ', 'Ready ')}
            </Badge>
          ))}
          {w.evidence.length > 0 && <span className="text-2xs text-faint">· {w.evidence.length} photo{w.evidence.length > 1 ? 's' : ''}</span>}
        </div>
      </div>
      <ChevronRight size={16} className="mt-1 shrink-0 text-faint" />
    </button>
  )
}

function WoDetail({ w, canEdit, onIncident }: { w: WorkOrder; canEdit: boolean; onIncident: (id: string) => void }) {
  const D = db()
  const update = useApp((s) => s.updateWorkOrder)
  const toast = useApp((s) => s.toast)
  const programs = useApp((s) => s.programs)
  const incidents = useApp((s) => s.incidents)
  const policy = usePolicy()
  const today = todayIso()
  const i = D.siteIdx.get(w.site_id)!
  const s = D.sites[i]
  const dist = D.distById[s.district_id]
  const prog = w.program_id ? programs.find((p) => p.program_id === w.program_id) : null
  const alarms7 = kpiSeries('alarms', i, lastDay() - 6, lastDay() + 1).reduce((a, x) => a + x, 0)
  const avail = kpiAt('availability', i, lastDay())
  const prb = kpiAt('prb_util', i, lastDay())
  const health = siteStatusToday(i, policy)
  const siteInc = incidents.filter((x) => isOpen(x) && x.site_ids.includes(w.site_id))
  const cohortSubs = (D.cohortsBySite.get(w.site_id) ?? []).reduce((a, c) => a + c.subs, 0)

  const finished = DONE.has(w.status)
  const editable = canEdit && !finished
  const photos = w.evidence.filter((e) => e.type === 'photo')
  const allDone = w.checklist.every((c) => c.done)
  const canSubmit = editable && allDone && photos.length >= 1
  const due = dueLabel(w.due, today)
  const doneSteps = w.checklist.filter((c) => c.done).length

  const toggle = (k: number) => {
    if (!editable) return
    const checklist = w.checklist.map((c, j) => (j === k ? { ...c, done: !c.done } : c))
    if (w.status === 'open' || w.status === 'overdue') update(w.wo_id, { checklist, status: 'in_progress' })
    else update(w.wo_id, { checklist })
  }
  const addPhoto = () => {
    if (!editable) return
    const n = photos.length + 1
    const hh = String(8 + Math.floor(n / 2)).padStart(2, '0')
    const mm = String((n * 17) % 60).padStart(2, '0')
    const evidence = [...w.evidence, { name: `${w.site_id}_${w.wo_id}_IMG_${String(n).padStart(2, '0')}_${hh}${mm}.jpg`, type: 'photo' }]
    update(w.wo_id, { evidence, ...(w.status === 'open' ? { status: 'in_progress' as const } : {}) })
  }
  const removePhoto = (name: string) => {
    if (!editable) return
    update(w.wo_id, { evidence: w.evidence.filter((e) => e.name !== name) })
  }
  const submit = () => {
    if (!canSubmit) return
    update(w.wo_id, { status: 'evidence_submitted' })
    toast(`Evidence submitted for ${w.wo_id} · ${s.name}. Sent to the NOC for close-out.`)
  }

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-5">
      {/* Site header */}
      <div className="border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Dot status={health} className="h-3 w-3" />
              <Id className="text-[13px]">{w.site_id}</Id>
              <Badge tone={STATUS_BADGE[w.status].tone}>{STATUS_BADGE[w.status].t}</Badge>
              {w.priority === 'high' && <Badge tone="red">High priority</Badge>}
            </div>
            <h2 className="mt-1 text-xl font-semibold">{s.name}</h2>
            <div className="text-sm text-muted">
              {dist?.type === 'kabupaten' ? 'Kab. ' : 'Kota '}
              {dist?.name} · {D.provById[s.province_id]?.name} · {s.site_class.replace('_', ' ')} · {s.technologies.join(' / ')}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xs font-semibold uppercase tracking-wider text-faint">
              <Id>{w.wo_id}</Id> · {w.type}
            </div>
            <div className={clsx('tnum mt-0.5 text-lg font-semibold', finished ? 'text-ok' : due.tone)}>{finished ? 'Done' : due.text}</div>
            <div className="tnum text-xs text-faint">
              due {weekday(w.due)} {date(w.due)} · created {dateShort(w.created)}
            </div>
          </div>
        </div>
        {(prog || w.incident_id || siteInc.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-5 py-2 text-xs">
            {prog && (
              <span className="text-muted">
                Program <span className="font-mono text-[11px] text-[#B79CFF]">{prog.program_id}</span> {prog.name} · stage {prog.stage}
              </span>
            )}
            {(w.incident_id ? [w.incident_id] : siteInc.map((x) => x.incident_id)).slice(0, 2).map((id) => (
              <button key={id} onClick={() => onIncident(id)} className="flex items-center gap-1 text-muted hover:text-ioh-yellow">
                <Siren size={12} /> <span className="font-mono text-[11px]">{id}</span>
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-3 border-t border-line xl:grid-cols-6">
          <Fact k="Tower company" v={s.tower_company} sub={s.structure} />
          <Fact k="Power" v={s.power_type} sub={`battery ${s.energy.battery_health_pct}% · ${s.energy.grid_outages_30d} grid outages 30 d`} />
          <Fact k="Backhaul" v={s.backhaul} sub={s.vendor} />
          <Fact k="Alarms · 7 d" v={num(Math.round(alarms7))} sub={`${s.energy.rectifier_alarms_30d} rectifier alarms 30 d`} tone={alarms7 >= 20 ? 'bad' : alarms7 >= 8 ? 'warn' : undefined} fresh="D-1" />
          <Fact k="Availability" v={`${avail.toFixed(2)}%`} sub={`PRB ${prb.toFixed(0)}% peak`} fresh="D-1" />
          <Fact k="Customers" v={num(cohortSubs)} sub="in catchment" last />
        </div>
      </div>

      {!canEdit && (
        <div className="flex items-center gap-2 border border-line2 bg-panel2 px-4 py-2.5 text-sm text-muted">
          <Eye size={15} className="text-faint" /> View only. Only the assigned field engineer executes the checklist and submits evidence.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        {/* Checklist */}
        <section className="border border-line bg-panel">
          <header className="flex h-11 items-center justify-between border-b border-line px-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Wrench size={15} className="text-faint" /> Site visit checklist
            </h3>
            <span className="tnum text-xs text-muted">
              {doneSteps} of {w.checklist.length} done
            </span>
          </header>
          <div className="h-1 bg-line">
            <div className="h-full bg-ioh-yellow transition-all" style={{ width: `${(doneSteps / Math.max(1, w.checklist.length)) * 100}%` }} />
          </div>
          <ul>
            {w.checklist.map((c, k) => (
              <li key={c.step}>
                <button
                  onClick={() => toggle(k)}
                  disabled={!editable}
                  className={clsx('flex min-h-[56px] w-full items-center gap-4 border-b border-line/70 px-4 text-left disabled:cursor-default', editable && 'hover:bg-panel2')}
                >
                  <span className={clsx('flex h-7 w-7 shrink-0 items-center justify-center border-2', c.done ? 'border-ok bg-ok text-canvas' : 'border-line2')}>{c.done && <Check size={16} strokeWidth={3} />}</span>
                  <span className={clsx('text-[15px]', c.done ? 'text-muted line-through decoration-faint' : 'text-ink')}>{c.step}</span>
                  {c.step.toLowerCase().includes('photo') && <Camera size={15} className="ml-auto shrink-0 text-faint" />}
                </button>
              </li>
            ))}
          </ul>
          <div className="px-4 py-2.5 text-xs text-faint">Checklist written by the Narrative Agent from the same incident the COO reads; evidence spec from the Work Order Agent.</div>
        </section>

        {/* Parts */}
        <section className="self-start border border-line bg-panel">
          <header className="flex h-11 items-center justify-between border-b border-line px-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Package size={15} className="text-faint" /> Parts
            </h3>
            <Fresh f="D-1" />
          </header>
          {w.parts.length === 0 ? (
            <div className="px-4 py-5 text-sm text-faint">No parts needed for this visit.</div>
          ) : (
            <ul>
              {w.parts.map((p) => {
                const sku = D.meta.skus.find((x) => x.sku === p.sku)
                return (
                  <li key={p.sku} className="border-b border-line/70 px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[12px]">{p.sku}</span>
                      <span className="tnum text-sm">× {p.qty}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{sku?.description ?? 'Spare part'}</div>
                    <div className="mt-1.5">
                      <Badge tone={partTone(p.status)}>{p.status}</Badge>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Evidence */}
      <section className="border border-line bg-panel">
        <header className="flex h-11 items-center justify-between border-b border-line px-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <ImageIcon size={15} className="text-faint" /> Evidence capture
          </h3>
          <span className="text-xs text-muted">
            {photos.length} photo{photos.length === 1 ? '' : 's'} · geotagged {s.lat.toFixed(4)}, {s.lon.toFixed(4)}
          </span>
        </header>
        <div className="flex flex-wrap gap-3 p-4">
          {w.evidence.map((e) => (
            <div key={e.name} className="group relative w-[150px] border border-line2 bg-panel2">
              <PhotoThumb seed={e.name} />
              <div className="truncate px-2 py-1.5 font-mono text-[10px] text-muted" title={e.name}>
                {e.name}
              </div>
              {editable && (
                <button onClick={() => removePhoto(e.name)} className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center bg-canvas/80 text-muted hover:text-bad" aria-label="Remove photo">
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
          {editable && (
            <button onClick={addPhoto} className="flex h-[128px] w-[150px] flex-col items-center justify-center gap-2 border-2 border-dashed border-line2 text-muted hover:border-ioh-yellow hover:text-ioh-yellow">
              <Camera size={26} />
              <span className="text-sm font-semibold">Take photo</span>
            </button>
          )}
          {!editable && w.evidence.length === 0 && <div className="text-sm text-faint">No evidence captured yet.</div>}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
          <div className="text-xs text-muted">
            {finished ? (
              <span className="flex items-center gap-1.5 text-ok">
                <CheckCircle2 size={15} /> {w.status === 'evidence_submitted' ? 'Evidence submitted. Awaiting NOC close-out; logged to the audit trail.' : 'Completed and closed.'}
              </span>
            ) : (
              <>
                <Req ok={allDone}>All checklist steps done</Req>
                <Req ok={photos.length >= 1}>At least one photo</Req>
              </>
            )}
          </div>
          {!finished && (
            <button
              onClick={submit}
              disabled={!canSubmit}
              className="flex h-12 items-center gap-2 border border-ioh-yellow bg-ioh-yellow px-6 text-[15px] font-semibold text-canvas hover:bg-[#ffe04d] disabled:cursor-not-allowed disabled:border-line2 disabled:bg-panel2 disabled:text-faint"
            >
              <Send size={16} /> Submit evidence
            </button>
          )}
        </div>
      </section>
    </div>
  )
}

function Req({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <span className={clsx('mr-4 inline-flex items-center gap-1.5', ok ? 'text-ok' : 'text-faint')}>
      {ok ? <CheckCircle2 size={14} /> : <span className="inline-block h-3 w-3 rounded-full border border-line2" />}
      {children}
    </span>
  )
}

function Fact({ k, v, sub, tone, fresh, last }: { k: string; v: string; sub?: string; tone?: 'warn' | 'bad'; fresh?: string; last?: boolean }) {
  return (
    <div className={clsx('min-w-0 border-line px-4 py-2.5 max-xl:border-b', !last && 'border-r')}>
      <div className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
        <span className="truncate">{k}</span>
        {fresh && <Fresh f={fresh} />}
      </div>
      <div className={clsx('truncate text-sm font-semibold capitalize', tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink')}>{v}</div>
      {sub && <div className="truncate text-2xs text-muted">{sub}</div>}
    </div>
  )
}

/** Deterministic placeholder "photo" (tower / cabinet silhouette) so evidence reads as images. */
function PhotoThumb({ seed }: { seed: string }) {
  let h = 0
  for (let k = 0; k < seed.length; k++) h = (h * 31 + seed.charCodeAt(k)) >>> 0
  const kind = h % 3
  const sky = ['#26303F', '#2B2A33', '#1F2B33'][h % 3]
  return (
    <svg viewBox="0 0 150 96" className="block h-24 w-full" aria-hidden>
      <rect width="150" height="96" fill={sky} />
      <rect y="70" width="150" height="26" fill="#1A1D23" />
      {kind === 0 && (
        <g stroke="#8A93A3" strokeWidth="1.5" fill="none">
          <path d="M75 12 L62 70 M75 12 L88 70 M66 50 L84 50 M69 36 L81 36 M64 60 L86 60" />
          <rect x="70" y="16" width="4" height="10" fill="#A3AAB8" />
          <rect x="77" y="16" width="4" height="10" fill="#A3AAB8" />
        </g>
      )}
      {kind === 1 && (
        <g>
          <rect x="45" y="28" width="60" height="44" fill="#3A404C" stroke="#6B7280" />
          <rect x="52" y="36" width="20" height="28" fill="#2A2F3A" />
          <rect x="78" y="36" width="20" height="6" fill="#2ECC71" opacity="0.7" />
          <rect x="78" y="46" width="20" height="6" fill="#F5A623" opacity="0.7" />
        </g>
      )}
      {kind === 2 && (
        <g stroke="#8A93A3" strokeWidth="1.5" fill="#3A404C">
          <rect x="40" y="20" width="12" height="40" />
          <rect x="68" y="20" width="12" height="40" />
          <rect x="96" y="20" width="12" height="40" />
          <line x1="30" y1="64" x2="120" y2="64" />
        </g>
      )}
      <text x="6" y="90" fontSize="8" fill="#6B7280" fontFamily="monospace">
        {`AZ ${(h % 360).toString().padStart(3, "0")}° · ${dateShortStatic()}`}
      </text>
    </svg>
  )
}
function dateShortStatic(): string {
  return dateShort(todayIso())
}
