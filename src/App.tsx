import { useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { loadDB } from '@/data/db'
import { useApp } from '@/store/app'
import { Gate } from '@/components/shell/Gate'
import { Shell } from '@/components/shell/Shell'
import { MapPage } from '@/modules/map/MapPage'
import { SitePage } from '@/modules/site/SitePage'
import { IncidentsPage } from '@/modules/incidents/IncidentsPage'
import { PlannerPage } from '@/modules/planner/PlannerPage'
import { ProgramsPage } from '@/modules/programs/ProgramsPage'
import { ValuePage } from '@/modules/value/ValuePage'
import { AgentsPage } from '@/modules/agents/AgentsPage'
import { FieldPage } from '@/modules/field/FieldPage'

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
        <div className={big ? 'text-base font-bold tracking-tight' : 'text-[12.5px] font-bold tracking-tight'}>
          Indosat <span className="text-ioh-yellow">Ooredoo</span> Hutchison
        </div>
        {big && <div className="text-xs text-muted">Network Intelligence Command Center · powered by Netra</div>}
      </div>
    </div>
  )
}
