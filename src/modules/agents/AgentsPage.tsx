import { useSearchParams } from 'react-router-dom'
import { db } from '@/data/db'
import { Fresh, Tabs } from '@/components/ui'
import { dateTime } from '@/lib/format'
import { useApp } from '@/store/app'
import { Registry } from './Registry'
import { RunLog } from './RunLog'
import { PolicyEditor } from './PolicyEditor'
import { Feedback } from './Feedback'

type TabId = 'registry' | 'runs' | 'policy' | 'feedback'

export function AgentsPage() {
  const [params, setParams] = useSearchParams()
  const audit = useApp((s) => s.audit)
  const overrides = useApp((s) => s.overrides)
  const raw = params.get('tab') as TabId | null
  const TABS: { id: TabId; label: React.ReactNode }[] = [
    { id: 'registry', label: 'Agent registry' },
    {
      id: 'runs',
      label: (
        <span className="flex items-center gap-1.5">
          Run log and audit
          {audit.length > 0 && <span className="tnum bg-ioh-yellow px-1 text-[10px] text-canvas">{audit.length}</span>}
        </span>
      ),
    },
    { id: 'policy', label: 'Thresholds and policy' },
    {
      id: 'feedback',
      label: (
        <span className="flex items-center gap-1.5">
          Feedback loop to Netra
          {overrides.length > 0 && <span className="tnum bg-ioh-yellow px-1 text-[10px] text-canvas">{overrides.length}</span>}
        </span>
      ),
    },
  ]
  const tab: TabId = raw && ['registry', 'runs', 'policy', 'feedback'].includes(raw) ? raw : 'registry'
  const D = db()
  const setTab = (t: TabId) => {
    const p = new URLSearchParams(params)
    p.set('tab', t)
    p.delete('agent')
    setParams(p)
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-canvas">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="font-mono text-[11px] text-faint">M7</span>
          <h1 className="text-base font-semibold">Agent Studio and Control</h1>
          <span className="truncate text-sm text-muted">· agents recommend, people approve, every override teaches the model</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-faint">
          <span>Netra agent runtime</span>
          <Fresh f="live" />
          <span className="tnum">{dateTime(D.meta.now)}</span>
        </div>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="shrink-0 bg-panel px-3" />
      <div className="relative min-h-0 flex-1 overflow-y-auto">
        {tab === 'registry' && <Registry />}
        {tab === 'runs' && <RunLog />}
        {tab === 'policy' && <PolicyEditor />}
        {tab === 'feedback' && <Feedback />}
      </div>
    </div>
  )
}
