import { AlertTriangle, BarChart3, Briefcase, Truck } from 'lucide-react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Fresh, Tabs } from '@/components/ui'
import { db } from '@/data/db'
import { date } from '@/lib/format'
import { useApp } from '@/store/app'
import { CycleTab } from './CycleTab'
import { GapsTab } from './GapsTab'
import { PortfolioTab } from './PortfolioTab'
import { ProgramDetail } from './ProgramDetail'
import { VendorsTab } from './VendorsTab'
import { deployCounts } from './lib'

type TabId = 'portfolio' | 'gaps' | 'vendors' | 'cycle'
const TAB_IDS: TabId[] = ['portfolio', 'gaps', 'vendors', 'cycle']

// M5 Program Console (PRD §6): portfolio, program page, gap flags, vendor lane, cycle time.
export function ProgramsPage() {
  const { id } = useParams()
  if (id) return <ProgramDetail id={id} />
  return <ProgramsTabs />
}

function ProgramsTabs() {
  const [params, setParams] = useSearchParams()
  const programs = useApp((s) => s.programs)
  const raw = params.get('tab') as TabId | null
  const tab: TabId = raw && TAB_IDS.includes(raw) ? raw : 'portfolio'
  const gapCount = programs.filter((p) => p.gap_flags.length).length
  const dc = deployCounts(programs)
  const setTab = (t: TabId) => {
    const p = new URLSearchParams(params)
    if (t === 'portfolio') p.delete('tab')
    else p.set('tab', t)
    setParams(p)
  }
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-panel px-5 pt-3">
        <div className="min-w-0 pb-2">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold">Program Console</h1>
            <span className="text-xs text-faint">Layer 3 · decision to RFS</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted">
            {programs.length} programs · nine-stage chain with approval gates · programs as of {date(db().meta.as_of)} <Fresh f="D-1" /> · session actions <Fresh f="live" />
          </div>
        </div>
      </div>
      <Tabs<TabId>
        className="shrink-0 bg-panel px-3"
        value={tab}
        onChange={setTab}
        tabs={[
          {
            id: 'portfolio',
            label: (
              <>
                <Briefcase size={14} /> Portfolio
              </>
            ),
          },
          {
            id: 'gaps',
            label: (
              <>
                <AlertTriangle size={14} /> Gap flags <Count n={gapCount} tone="bad" />
              </>
            ),
          },
          {
            id: 'vendors',
            label: (
              <>
                <Truck size={14} /> Vendor and partner lane <Count n={dc.vendorRisk} tone="warn" />
              </>
            ),
          },
          {
            id: 'cycle',
            label: (
              <>
                <BarChart3 size={14} /> Cycle-time analytics
              </>
            ),
          },
        ]}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'portfolio' && <PortfolioTab />}
        {tab === 'gaps' && <GapsTab />}
        {tab === 'vendors' && <VendorsTab />}
        {tab === 'cycle' && <CycleTab />}
      </div>
    </div>
  )
}

function Count({ n, tone }: { n: number; tone: 'bad' | 'warn' }) {
  if (!n) return null
  return <span className={`tnum inline-flex h-4 min-w-4 items-center justify-center px-1 text-[10px] font-bold text-canvas ${tone === 'bad' ? 'bg-bad' : 'bg-warn'}`}>{n}</span>
}
