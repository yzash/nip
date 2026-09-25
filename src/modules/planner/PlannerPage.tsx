import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { db } from '@/data/db'
import { Badge, Fresh, Tabs } from '@/components/ui'
import { date } from '@/lib/format'
import { scopeLabel } from '@/lib/metrics'
import { useApp, useRole, useScope } from '@/store/app'
import { Board } from './Board'
import { Split } from './Split'
import { Builder } from './Builder'
import { Readiness } from './Readiness'
import { Scenario } from './Scenario'

export type PlannerTab = 'board' | 'split' | 'builder' | 'readiness' | 'scenario'
const TABS: PlannerTab[] = ['board', 'split', 'builder', 'readiness', 'scenario']

export function PlannerPage() {
  const [params, setParams] = useSearchParams()
  const role = useRole()
  const scope = useScope()
  const plan = useApp((s) => s.plan)
  const pendingPos = useApp((s) => s.pos.filter((p) => p.status === 'pending_release').length)
  const [selected, setSelected] = useState<string[]>([])
  const q = params.get('tab') as PlannerTab | null
  const tab: PlannerTab = q && TABS.includes(q) ? q : role.role_code === 'PROC' ? 'readiness' : 'board'

  const setTab = (t: PlannerTab) => {
    const p = new URLSearchParams(params)
    p.set('tab', t)
    if (t !== 'board') {
      p.delete('class')
      p.delete('cov')
    }
    setParams(p)
  }

  // Scroll to top on tab change
  useEffect(() => {
    document.getElementById('planner-scroll')?.scrollTo({ top: 0 })
  }, [tab])

  const D = db()
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-6 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold">Predictive Planner</h1>
            <Badge tone="yellow">North Star</Badge>
            <span className="text-2xs font-semibold uppercase tracking-wider text-faint">{scopeLabel(role, scope)}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted">
            <span>Which sites will fail or saturate in 8 weeks, and what do we do?</span>
            <span className="text-faint">·</span>
            <span>Forecast as of {date(D.meta.as_of)}</span>
            <Fresh f="D-1" asOf={D.meta.as_of} />
            <span className="text-faint">·</span>
            <span>Smart CapEx as of {date(D.meta.as_of_d5)}</span>
            <Fresh f="D-5" asOf={D.meta.as_of_d5} />
          </div>
        </div>
        <div className="hidden shrink-0 text-right text-xs text-muted xl:block">
          <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{role.title} · decision today</div>
          <div className="max-w-[440px] truncate text-ink">{role.monday_decision}</div>
        </div>
      </div>
      <Tabs
        className="shrink-0 bg-panel px-4"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'board', label: 'Forecast board' },
          { id: 'split', label: 'CapEx vs non-CapEx' },
          {
            id: 'builder',
            label: (
              <>
                Plan builder
                {plan && <span className="h-1.5 w-1.5 rounded-full bg-ioh-yellow" />}
              </>
            ),
          },
          {
            id: 'readiness',
            label: (
              <>
                Readiness
                {pendingPos > 0 && <span className="tnum bg-ioh-yellow px-1 text-[10px] leading-4 text-canvas">{pendingPos}</span>}
              </>
            ),
          },
          { id: 'scenario', label: 'Scenario' },
        ]}
      />
      <div id="planner-scroll" className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'board' && <Board selected={selected} setSelected={setSelected} goBuilder={() => setTab('builder')} />}
        {tab === 'split' && <Split />}
        {tab === 'builder' && <Builder selected={selected} goBoard={() => setTab('board')} />}
        {tab === 'readiness' && <Readiness />}
        {tab === 'scenario' && <Scenario />}
      </div>
    </div>
  )
}
