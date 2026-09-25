import { useSearchParams } from 'react-router-dom'
import { db } from '@/data/db'
import { Fresh, Tabs } from '@/components/ui'
import { date } from '@/lib/format'
import { HomeTab } from './HomeTab'
import { ValidationTab } from './ValidationTab'
import { RoiTab } from './RoiTab'
import { ModelsTab } from './ModelsTab'
import { AvoidedTab } from './AvoidedTab'
import { ExportTab } from './ExportTab'

type TabId = 'home' | 'validation' | 'roi' | 'models' | 'avoided' | 'export'
const TABS: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Ledger home' },
  { id: 'validation', label: 'Post-RFS validation' },
  { id: 'roi', label: 'Program ROI' },
  { id: 'models', label: 'Model scorecard' },
  { id: 'avoided', label: 'Avoided cost' },
  { id: 'export', label: 'Executive one-pager' },
]

export function ValuePage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab') as TabId | null
  const tab: TabId = raw && TABS.some((t) => t.id === raw) ? raw : 'home'
  const D = db()

  const setTab = (t: TabId) => {
    const p = new URLSearchParams(params)
    p.set('tab', t)
    if (t !== 'validation') p.delete('program')
    setParams(p)
  }
  const openValidation = (programId?: string) => {
    const p = new URLSearchParams()
    p.set('tab', 'validation')
    if (programId) p.set('program', programId)
    setParams(p)
  }

  return (
    <div className="print-page absolute inset-0 flex flex-col bg-canvas">
      <div className="no-print flex shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-5 py-2.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-faint">M6</span>
            <h1 className="text-base font-semibold">Value Ledger</h1>
            <span className="text-sm text-muted">· did it work? Predicted versus realised, per intervention</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs text-faint">
          <span>Post-RFS Validation and ROI Attribution agents</span>
          <Fresh f="D-1" asOf={D.meta.as_of} />
          <span className="tnum">as of {date(D.meta.as_of)}</span>
        </div>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} className="no-print shrink-0 bg-panel px-3" />
      <div className="print-page min-h-0 flex-1 overflow-y-auto">
        {tab === 'home' && <HomeTab onValidation={openValidation} onTab={setTab} />}
        {tab === 'validation' && <ValidationTab />}
        {tab === 'roi' && <RoiTab onValidation={openValidation} />}
        {tab === 'models' && <ModelsTab />}
        {tab === 'avoided' && <AvoidedTab />}
        {tab === 'export' && <ExportTab />}
      </div>
    </div>
  )
}
