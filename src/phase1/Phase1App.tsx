import clsx from 'clsx'
import { ArrowUpRight, BookOpen, Bot, CalendarRange, ChevronDown, ClipboardCheck, Database, FlaskConical, Gauge, LayoutDashboard, ListChecks, RotateCcw, Send, Split } from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { Marque } from '@/App'
import { db } from '@/data/db'
import type { RoleCode } from '@/data/types'
import { Toasts } from '@/components/shell/Toasts'
import { date, time, weekday } from '@/lib/format'
import { roleDef, useApp, useRole } from '@/store/app'
import { PHASE1_ROLES } from './model'
import { useP1Store } from './store'
import { OverviewPage } from './pages/Overview'
import { P1GuideButton } from './Guide'

const ForecastPage = lazy(() => import('./pages/Forecast').then((m) => ({ default: m.ForecastPage })))
const SiteExplainPage = lazy(() => import('./pages/SiteExplain').then((m) => ({ default: m.SiteExplainPage })))
const ClassifyPage = lazy(() => import('./pages/Classify').then((m) => ({ default: m.ClassifyPage })))
const PlansPage = lazy(() => import('./pages/Plans').then((m) => ({ default: m.PlansPage })))
const PlanDetailPage = lazy(() => import('./pages/PlanDetail').then((m) => ({ default: m.PlanDetailPage })))
const ApprovalsPage = lazy(() => import('./pages/Approvals').then((m) => ({ default: m.ApprovalsPage })))
const HandoffPage = lazy(() => import('./pages/Handoff').then((m) => ({ default: m.HandoffPage })))
const AgentsPage = lazy(() => import('./pages/Agents').then((m) => ({ default: m.AgentsPage })))
const AgentDetailPage = lazy(() => import('./pages/AgentDetail').then((m) => ({ default: m.AgentDetailPage })))
const DataPage = lazy(() => import('./pages/Data').then((m) => ({ default: m.DataPage })))
const ModelsPage = lazy(() => import('./pages/Models').then((m) => ({ default: m.ModelsPage })))
const GoLivePage = lazy(() => import('./pages/GoLive').then((m) => ({ default: m.GoLivePage })))

let entered = false

// Phase 1 · Predictive Planner: its own URL family (/phase1) and shell, sharing the data layer
// and session store with the full NICC prototype.
export function Phase1App() {
  const seed = useP1Store((s) => s.seed)
  const role = useApp((s) => s.role)
  const setRole = useApp((s) => s.setRole)
  useEffect(() => {
    seed()
  }, [seed])
  useEffect(() => {
    // The Head of Planning owns Phase 1: land there on first entry, keep later switches.
    if (!entered || !(PHASE1_ROLES as readonly string[]).includes(role)) setRole('PLAN')
    entered = true
  }, [role, setRole])
  return (
    <div className="flex h-full flex-col">
      <P1TopBar />
      <div className="flex min-h-0 flex-1">
        <P1Nav />
        <main className="relative min-w-0 flex-1 overflow-hidden">
          <Suspense fallback={<div className="p-6 text-sm text-faint">Loading…</div>}>
            <Routes>
              <Route index element={<OverviewPage />} />
              <Route path="forecast" element={<ForecastPage />} />
              <Route path="site/:id" element={<SiteExplainPage />} />
              <Route path="classify" element={<ClassifyPage />} />
              <Route path="plans" element={<PlansPage />} />
              <Route path="plans/:id" element={<PlanDetailPage />} />
              <Route path="approvals" element={<ApprovalsPage />} />
              <Route path="handoff" element={<HandoffPage />} />
              <Route path="agents" element={<AgentsPage />} />
              <Route path="agents/:id" element={<AgentDetailPage />} />
              <Route path="data" element={<DataPage />} />
              <Route path="models" element={<ModelsPage />} />
              <Route path="golive" element={<GoLivePage />} />
              <Route path="*" element={<Navigate to="/phase1" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      <Toasts />
    </div>
  )
}

const NAV = [
  { group: 'Workflow', items: [
    { to: '/phase1', end: true, label: 'Overview', icon: LayoutDashboard },
    { to: '/phase1/forecast', label: 'Forecast', icon: Gauge, step: '1' },
    { to: '/phase1/classify', label: 'Classify', icon: Split, step: '2' },
    { to: '/phase1/plans', label: 'Plans', icon: ListChecks, step: '3' },
    { to: '/phase1/approvals', label: 'Approvals', icon: ClipboardCheck, step: '4' },
    { to: '/phase1/handoff', label: 'Hand-off', icon: Send, step: '5' },
  ] },
  { group: 'How it works', items: [
    { to: '/phase1/agents', label: 'Agent architecture', icon: Bot },
    { to: '/phase1/data', label: 'Data needed', icon: Database },
    { to: '/phase1/models', label: 'Models', icon: FlaskConical },
    { to: '/phase1/golive', label: 'Go-live plan', icon: CalendarRange },
  ] },
]

function P1Nav() {
  const plans = useP1Store((s) => s.plans)
  const role = useApp((s) => s.role)
  const pending = plans.filter((p) => p.status === 'pending_approval' && p.route.role === role).length
  const toSend = plans.filter((p) => p.status === 'approved').length
  return (
    <nav className="no-print flex w-[208px] shrink-0 flex-col border-r border-line bg-panel">
      <div className="flex-1 overflow-y-auto py-3">
        {NAV.map((g) => (
          <div key={g.group} className="mb-4">
            <div className="px-4 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">{g.group}</div>
            {g.items.map((m) => (
              <NavLink
                key={m.to}
                to={m.to}
                end={'end' in m ? m.end : false}
                className={({ isActive }) =>
                  clsx('relative flex h-9 items-center gap-2.5 px-4 text-sm', isActive ? 'bg-panel2 font-semibold text-ink before:absolute before:inset-y-1 before:left-0 before:w-[3px] before:bg-ioh-yellow' : 'text-muted hover:bg-panel2 hover:text-ink')
                }
              >
                <m.icon size={16} strokeWidth={1.8} className="shrink-0" />
                <span className="flex-1 truncate">{m.label}</span>
                {'step' in m && <span className="font-mono text-[10px] text-faint">{m.step}</span>}
                {m.label === 'Approvals' && pending > 0 && <span className="tnum bg-ioh-red px-1 text-[10px] font-bold text-white">{pending}</span>}
                {m.label === 'Hand-off' && toSend > 0 && <span className="tnum bg-ioh-yellow px-1 text-[10px] font-bold text-canvas">{toSend}</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </div>
      <a href="/map" className="flex items-center gap-1.5 border-t border-line px-4 py-3 text-xs text-faint hover:text-ink">
        <BookOpen size={13} /> Full NICC prototype <ArrowUpRight size={12} />
      </a>
    </nav>
  )
}

function P1TopBar() {
  const D = db()
  const nav = useNavigate()
  const reset = useP1Store((s) => s.reset)
  const toast = useApp((s) => s.toast)
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-line bg-panel px-3">
      <Marque />
      <div className="h-7 w-px bg-line" />
      <div className="whitespace-nowrap leading-tight">
        <div className="flex items-center gap-2 text-[13px] font-semibold">
          Predictive Planner <span className="border border-ioh-yellow/60 px-1.5 text-[10px] font-bold uppercase tracking-wider text-ioh-yellow">Phase 1</span>
        </div>
        <div className="text-[10.5px] text-faint">
          Network Intelligence Command Center · powered by <span className="font-semibold text-muted">Netra</span>
        </div>
      </div>
      <div className="ml-4">
        <P1RoleSwitcher />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden whitespace-nowrap border border-line px-2.5 py-1 lg:block">
          <div className="tnum text-[11.5px] font-semibold">
            {weekday(D.meta.now)} {date(D.meta.now)} · {time(D.meta.now)}
          </div>
          <div className="tnum text-[10.5px] text-faint">
            Forecast run {date(D.meta.now)} 05:00 · data <span className="font-mono">D-1</span>
          </div>
        </div>
        <P1GuideButton />
        <button
          title="Reset Phase 1 demo state"
          onClick={() => {
            reset()
            toast('Phase 1 state reset to Monday 08:00 WIB', 'info')
            nav('/phase1')
          }}
          className="flex h-9 w-9 items-center justify-center border border-line2 text-muted hover:text-ink"
        >
          <RotateCcw size={14} />
        </button>
      </div>
    </header>
  )
}

function P1RoleSwitcher() {
  const [open, setOpen] = useState(false)
  const role = useRole()
  const setRole = useApp((s) => s.setRole)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  const BLURB: Record<string, string> = useMemo(
    () => ({
      PLAN: 'Owns the forecast and the plans; approves minor CapEx above IDR 200m',
      PROC: 'Stock, pre-positioning and PO drafts to ERP',
      EXEC: 'Approves major CapEx (CFO co-sign above IDR 2bn)',
      DEPLOY: 'Confirms vendor allocation, receives BOQ hand-off',
      OPS: 'Owns power, transport, RAN and environmental classes',
      REGION: 'Approves regional non-CapEx and small CapEx',
    }),
    [],
  )
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="flex h-9 items-center gap-2 border border-line2 bg-panel2 pl-1.5 pr-2 hover:border-muted">
        <span className="flex h-6 min-w-[52px] items-center justify-center bg-ioh-yellow px-1.5 font-mono text-[11px] font-bold text-canvas">{role.role_code}</span>
        <span className="hidden max-w-[220px] text-left leading-tight md:block">
          <span className="block truncate text-[12px] font-semibold">{role.title}</span>
          <span className="block truncate text-[10.5px] text-faint">{role.user}</span>
        </span>
        <ChevronDown size={14} className="text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 top-10 z-50 w-[380px] border border-line2 bg-panel">
          <div className="border-b border-line px-3 py-2 text-2xs font-semibold uppercase tracking-wider text-faint">Phase 1 roles</div>
          {PHASE1_ROLES.map((r) => (
            <button
              key={r}
              onClick={() => {
                setRole(r as RoleCode)
                setOpen(false)
              }}
              className={clsx('flex w-full items-start gap-3 border-b border-line/60 px-3 py-2 text-left hover:bg-panel2', r === role.role_code && 'bg-panel2')}
            >
              <span className={clsx('mt-0.5 flex h-5 w-14 shrink-0 items-center justify-center font-mono text-[10.5px] font-bold', r === role.role_code ? 'bg-ioh-yellow text-canvas' : 'border border-line2 text-muted')}>{r}</span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{roleDef(r as RoleCode).title}</span>
                <span className="block text-xs text-faint">{BLURB[r]}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
