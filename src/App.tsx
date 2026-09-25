import { Suspense, lazy, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { loadDB } from '@/data/db'
import { useApp } from '@/store/app'
import { Gate } from '@/components/shell/Gate'
import { Shell } from '@/components/shell/Shell'
import { MapPage } from '@/modules/map/MapPage'

// Modules load on demand: each route is its own chunk.
const SitePage = lazy(() => import('@/modules/site/SitePage').then((m) => ({ default: m.SitePage })))
const IncidentsPage = lazy(() => import('@/modules/incidents/IncidentsPage').then((m) => ({ default: m.IncidentsPage })))
const PlannerPage = lazy(() => import('@/modules/planner/PlannerPage').then((m) => ({ default: m.PlannerPage })))
const ProgramsPage = lazy(() => import('@/modules/programs/ProgramsPage').then((m) => ({ default: m.ProgramsPage })))
const ValuePage = lazy(() => import('@/modules/value/ValuePage').then((m) => ({ default: m.ValuePage })))
const AgentsPage = lazy(() => import('@/modules/agents/AgentsPage').then((m) => ({ default: m.AgentsPage })))
const FieldPage = lazy(() => import('@/modules/field/FieldPage').then((m) => ({ default: m.FieldPage })))

export default function App() {
  const [progress, setProgress] = useState({ done: 0, total: 1, label: '' })
  const [error, setError] = useState<string | null>(null)
  const seeded = useApp((s) => s.seeded)
  const seed = useApp((s) => s.seed)

  useEffect(() => {
    loadDB((done, total, label) => setProgress({ done, total, label }))
      .then(() => seed())
      .catch((e) => setError(String(e)))
  }, [seed])

  if (error)
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <div>
          <div className="mb-2 text-lg font-semibold text-bad">Could not load synthetic data</div>
          <div className="text-sm text-muted">{error}</div>
          <div className="mt-4 text-xs text-faint">Run <span className="font-mono">python3 generate.py</span> to create /data, then reload.</div>
        </div>
      </div>
    )

  if (!seeded)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5">
        <Marque big />
        <div className="w-72">
          <div className="h-1 w-full bg-line">
            <div className="h-full bg-ioh-yellow transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-faint">
            <span>Loading Netra snapshot (synthetic)</span>
            <span className="tnum">
              {progress.done}/{progress.total}
            </span>
          </div>
        </div>
      </div>
    )

  return (
    <Gate>
      <Shell>
        <Suspense fallback={<div className="p-6 text-sm text-faint">Loading module…</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/site" element={<SitePage />} />
          <Route path="/site/:id" element={<SitePage />} />
          <Route path="/incidents" element={<IncidentsPage />} />
          <Route path="/planner" element={<PlannerPage />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/programs/:id" element={<ProgramsPage />} />
          <Route path="/value" element={<ValuePage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/field" element={<FieldPage />} />
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
        </Suspense>
      </Shell>
    </Gate>
  )
}

/** IOH marque placeholder: replace with the official asset from IOH brand guidelines. */
export function Marque({ big }: { big?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={big ? 40 : 28} height={big ? 40 : 28} viewBox="0 0 32 32" aria-hidden>
        <circle cx="16" cy="16" r="12" fill="none" stroke="#FFD100" strokeWidth="4" />
        <circle cx="16" cy="16" r="4.5" fill="#E4002B" />
      </svg>
      <div className="leading-tight">
        <div className={big ? 'whitespace-nowrap text-base font-bold tracking-tight' : 'whitespace-nowrap text-[12.5px] font-bold tracking-tight'}>
          Indosat <span className="text-ioh-yellow">Ooredoo</span> Hutchison
        </div>
        {big && <div className="text-xs text-muted">Network Intelligence Command Center · powered by Netra</div>}
      </div>
    </div>
  )
}
