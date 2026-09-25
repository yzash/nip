import clsx from 'clsx'
import { Bell, BookOpen, ChevronDown, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Marque } from '@/App'
import { db } from '@/data/db'
import type { RoleCode } from '@/data/types'
import { date, time, weekday } from '@/lib/format'
import { inboxFor } from '@/lib/inbox'
import { scopeLabel } from '@/lib/metrics'
import { roleDef, todayIso, useApp, usePolicy, useRole, useScope } from '@/store/app'

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, close])
  return ref
}

export function TopBar() {
  const D = db()
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <div className="flex items-center gap-3 pr-2">
        <Marque />
        <div className="hidden h-7 w-px bg-line xl:block" />
        <div className="hidden leading-tight xl:block">
          <div className="text-[12.5px] font-semibold">Network Intelligence Command Center</div>
          <div className="text-[10.5px] text-faint">
            powered by <span className="font-semibold text-muted">Netra</span>
          </div>
        </div>
      </div>
      <RoleSwitcher />
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        <AsOf now={D.meta.now} asOf={D.meta.as_of} />
        <Inbox />
        <LangToggle />
        <GuideButton />
        <ResetButton />
      </div>
    </header>
  )
}

function AsOf({ now, asOf }: { now: string; asOf: string }) {
  return (
    <div className="hidden items-center gap-2 border border-line px-2.5 py-1 lg:flex" title="Prototype clock and Netra data freshness">
      <div className="leading-tight">
        <div className="tnum text-[11.5px] font-semibold">
          {weekday(now)} {date(now)} · {time(now)}
        </div>
        <div className="tnum text-[10.5px] text-faint">
          Data as of {date(asOf)} · <span className="font-mono">D-1</span>
        </div>
      </div>
    </div>
  )
}

function RoleSwitcher() {
  const [open, setOpen] = useState(false)
  const role = useRole()
  const scope = useScope()
  const setRole = useApp((s) => s.setRole)
  const setScope = useApp((s) => s.setScope)
  const ref = useClickOutside(open, () => setOpen(false))
  const roles = db().roles
  const districts = useMemo(() => [...new Set(Object.values(db().distById).map((d) => d.name))].sort(), [])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex h-9 items-center gap-2 border border-line2 bg-panel2 pl-1.5 pr-2 hover:border-muted">
        <span className="flex h-6 min-w-[52px] items-center justify-center bg-ioh-yellow px-1.5 font-mono text-[11px] font-bold text-canvas">{role.role_code}</span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-[12px] font-semibold">{role.title}</span>
          <span className="block text-[10.5px] text-faint">
            {role.user} · {scopeLabel(role, scope)}
          </span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-[440px] border border-line2 bg-panel">
          <div className="border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-faint">Switch role · one platform, eight lenses</div>
          {roles.map((r) => (
            <button
              key={r.role_code}
              onClick={() => {
                setRole(r.role_code as RoleCode)
                setOpen(false)
              }}
              className={clsx('flex w-full items-start gap-3 border-b border-line/60 px-3 py-2 text-left hover:bg-panel2', r.role_code === role.role_code && 'bg-panel2')}
            >
              <span className={clsx('mt-0.5 flex h-5 w-14 shrink-0 items-center justify-center font-mono text-[10.5px] font-bold', r.role_code === role.role_code ? 'bg-ioh-yellow text-canvas' : 'border border-line2 text-muted')}>{r.role_code}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{r.title}</span>
                <span className="block truncate text-xs text-faint">
                  {r.user} · {r.scope_type === 'national' ? 'National' : r.scope_ids[0]}
                </span>
                <span className="mt-0.5 block text-xs text-muted">Today: {r.monday_decision}</span>
              </span>
            </button>
          ))}
          {(role.role_code === 'REGION' || role.role_code === 'FIELD') && (
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="text-xs text-muted">{role.role_code === 'REGION' ? 'Region' : 'District'} scope</span>
              <select value={scope} onChange={(e) => setScope(role.role_code, e.target.value)} className="h-7 flex-1 border border-line2 bg-panel2 px-1 text-xs">
                {(role.role_code === 'REGION' ? role.scope_options ?? [] : districts).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const nav = useNavigate()
  const incidents = useApp((s) => s.incidents)
  const programs = useApp((s) => s.programs)
  const ref = useClickOutside(open, () => setOpen(false))
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (t.length < 2) return []
    const D = db()
    const out: { kind: string; id: string; label: string; sub: string; to: string }[] = []
    for (const s of D.sites) {
      if (s.site_id.toLowerCase().includes(t) || s.name.toLowerCase().includes(t)) {
        out.push({ kind: 'Site', id: s.site_id, label: s.name, sub: D.distById[s.district_id].name, to: `/map?site=${s.site_id}` })
        if (out.length > 5) break
      }
    }
    for (const x of incidents) {
      if (x.incident_id.toLowerCase().includes(t) || x.title.toLowerCase().includes(t)) out.push({ kind: 'Incident', id: x.incident_id, label: x.title, sub: x.status.replace('_', ' '), to: `/incidents?incident=${x.incident_id}` })
      if (out.length > 10) break
    }
    for (const p of programs) {
      if (p.program_id.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)) out.push({ kind: 'Program', id: p.program_id, label: p.name, sub: p.stage, to: `/programs/${p.program_id}` })
      if (out.length > 14) break
    }
    for (const d of Object.values(D.distById)) {
      if (d.name.toLowerCase().includes(t) && out.length < 18) out.push({ kind: 'District', id: d.id, label: d.name, sub: D.provById[d.province_id].name, to: `/map?focus=${d.id}` })
    }
    return out
  }, [q, incidents, programs])
  return (
    <div className="relative hidden w-72 md:block 2xl:w-96" ref={ref}>
      <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
      <input
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value)
          setOpen(true)
        }}
        placeholder="Search site, incident, program, district"
        className="h-9 w-full border border-line2 bg-panel2 pl-8 pr-2 text-sm placeholder:text-faint"
      />
      {open && results.length > 0 && (
        <div className="absolute left-0 right-0 top-10 z-50 max-h-96 overflow-y-auto border border-line2 bg-panel">
          {results.map((r) => (
            <button
              key={r.kind + r.id}
              onClick={() => {
                nav(r.to)
                setOpen(false)
                setQ('')
              }}
              className="flex w-full items-center gap-3 border-b border-line/60 px-3 py-2 text-left hover:bg-panel2"
            >
              <span className="w-14 shrink-0 text-2xs uppercase tracking-wide text-faint">{r.kind}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{r.label}</span>
                <span className="block truncate text-xs text-faint">
                  <span className="font-mono">{r.id}</span> · {r.sub}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function Inbox() {
  const [open, setOpen] = useState(false)
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const incidents = useApp((s) => s.incidents)
  const programs = useApp((s) => s.programs)
  const pos = useApp((s) => s.pos)
  const workOrders = useApp((s) => s.workOrders)
  const nav = useNavigate()
  const ref = useClickOutside(open, () => setOpen(false))
  const items = useMemo(() => inboxFor(role, scope, { incidents, programs, pos, workOrders, policy }, todayIso()), [role, scope, incidents, programs, pos, workOrders, policy])
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative flex h-9 w-9 items-center justify-center border border-line2 hover:border-muted" aria-label="Decisions waiting">
        <Bell size={15} />
        {items.length > 0 && <span className="tnum absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center bg-ioh-red px-1 text-[10px] font-bold">{items.length}</span>}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-[400px] border border-line2 bg-panel">
          <div className="border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-faint">Waiting on {roleDef(role.role_code).title}</div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <div className="px-3 py-6 text-center text-sm text-faint">Nothing waiting on you</div>}
            {items.map((i) => (
              <button
                key={i.id}
                onClick={() => {
                  nav(i.to)
                  setOpen(false)
                }}
                className="block w-full border-b border-line/60 px-3 py-2 text-left hover:bg-panel2"
              >
                <div className="truncate text-sm font-medium">{i.title}</div>
                <div className="truncate text-xs text-faint">{i.sub}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function LangToggle() {
  const toast = useApp((s) => s.toast)
  return (
    <div className="hidden border border-line2 text-[11px] font-semibold sm:flex" title="Bahasa Indonesia UI is planned for a later phase">
      <span className="bg-panel2 px-1.5 py-1.5 text-ink">EN</span>
      <button onClick={() => toast('Bahasa Indonesia UI is a placeholder for a later phase; place names are already in Bahasa', 'info')} className="px-1.5 py-1.5 text-faint">
        ID
      </button>
    </div>
  )
}

function GuideButton() {
  const setGuide = useApp((s) => s.setGuide)
  const open = useApp((s) => s.guideOpen)
  return (
    <button onClick={() => setGuide(!open)} className={clsx('flex h-9 items-center gap-1.5 border px-2.5 text-xs font-semibold', open ? 'border-ioh-yellow text-ioh-yellow' : 'border-line2 text-muted hover:text-ink')}>
      <BookOpen size={14} /> <span className="hidden sm:inline">Walkthrough</span>
    </button>
  )
}

function ResetButton() {
  const reset = useApp((s) => s.resetDemo)
  const nav = useNavigate()
  return (
    <button
      title="Reset demo state"
      onClick={() => {
        reset()
        nav('/map')
      }}
      className="flex h-9 w-9 items-center justify-center border border-line2 text-muted hover:text-ink"
    >
      <RotateCcw size={14} />
    </button>
  )
}
