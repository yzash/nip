import clsx from 'clsx'
import { Bot, CalendarClock, ChevronLeft, ChevronRight, Coins, GanttChart, HardHat, Map, RadioTower, Siren } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { useApp, useRole } from '@/store/app'

const MODULES = [
  { to: '/map', code: 'M1', label: 'Network Map', icon: Map },
  { to: '/site', code: 'M2', label: 'Site 360', icon: RadioTower },
  { to: '/incidents', code: 'M3', label: 'Insights & Incidents', icon: Siren },
  { to: '/planner', code: 'M4', label: 'Predictive Planner', icon: CalendarClock },
  { to: '/programs', code: 'M5', label: 'Program Console', icon: GanttChart },
  { to: '/value', code: 'M6', label: 'Value Ledger', icon: Coins },
  { to: '/agents', code: 'M7', label: 'Agent Studio', icon: Bot },
]

export function LeftRail() {
  const expanded = useApp((s) => s.railExpanded)
  const setRail = useApp((s) => s.setRail)
  const role = useRole()
  const items = role.role_code === 'FIELD' ? [{ to: '/field', code: 'WK', label: 'My week', icon: HardHat }, ...MODULES] : [...MODULES, { to: '/field', code: 'WK', label: 'Field worklist', icon: HardHat }]
  return (
    <nav className={clsx('no-print flex shrink-0 flex-col border-r border-line bg-panel transition-[width]', expanded ? 'w-[220px]' : 'w-16')}>
      <div className="flex-1 py-2">
        {items.map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            title={`${m.code} · ${m.label}`}
            className={({ isActive }) =>
              clsx(
                'group relative flex h-11 items-center gap-3 px-[22px] text-muted transition-colors hover:bg-panel2 hover:text-ink',
                isActive && 'bg-panel2 text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:bg-ioh-yellow',
                m.code === 'WK' && role.role_code !== 'FIELD' && 'mt-2 border-t border-line pt-0',
              )
            }
          >
            <m.icon size={19} strokeWidth={1.7} className="shrink-0" />
            {expanded && (
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-mono text-[10px] text-faint">{m.code}</span>
                <span className="truncate text-sm font-semibold">{m.label}</span>
              </span>
            )}
          </NavLink>
        ))}
      </div>
      <button onClick={() => setRail(!expanded)} className="flex h-10 items-center justify-center border-t border-line text-faint hover:text-ink" aria-label="Toggle navigation">
        {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
      </button>
    </nav>
  )
}
