import clsx from 'clsx'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo } from 'react'
import { db } from '@/data/db'
import { Badge, Fresh, Id, Kpi, Panel, Td, Th } from '@/components/ui'
import { idr, num, signed } from '@/lib/format'
import { useApp } from '@/store/app'
import { SyntheticNote } from './chart'
import { ledgerSummary, type Ranked } from './summary'

type TabId = 'home' | 'validation' | 'roi' | 'models' | 'avoided' | 'export'

export function HomeTab({ onValidation, onTab }: { onValidation: (p?: string) => void; onTab: (t: TabId) => void }) {
  const programs = useApp((s) => s.programs)
  const S = useMemo(() => ledgerSummary(programs), [programs])
  const D = db()
  const roiTone = S.roll.roi >= 1.3 ? 'ok' : S.roll.roi >= 0.8 ? 'warn' : 'bad'
  const roiAbove = S.roi.filter((r) => r.roi >= 1.3).length
  const surabaya = S.roi.find((r) => r.program.program_id === D.meta.surabaya_comparable_program)

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      {/* Insight before data */}
      <div className="border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0 max-w-[980px]">
            <Label2>What the ledger says this month</Label2>
            <p className="mt-1 text-[17px] font-semibold leading-7">
              Treated sites beat their matched controls on <span className="text-ok">{S.split.uplift} of {S.roll.sites}</span> interventions: CNX{' '}
              <span className="text-ioh-yellow">{signed(S.roll.cnxDid)} pts</span> on average versus control, and{' '}
              <span className="text-ioh-yellow">{idr(S.protectedYtd)}</span> protected year to date. Run-rate CapEx ROI is{' '}
              <span className={roiTone === 'ok' ? 'text-ok' : 'text-warn'}>{S.roll.roi.toFixed(2)}x</span> against the 1.3x target.
            </p>
            <p className="mt-1.5 text-sm text-muted">
              Do more of: capacity relief in dense metros ({surabaya ? `${surabaya.program.name.split(' — ')[0]} ${signed(surabaya.cnxDid)} pts CNX, ${surabaya.roi.toFixed(2)}x` : 'Surabaya'}). Stop or rethink: the{' '}
              {S.split.worse} sites that got worse than control, concentrated in {worstProgramsLabel(S.worst)}.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => onValidation(D.meta.surabaya_comparable_program)} className="flex h-8 items-center gap-1.5 border border-ioh-yellow bg-ioh-yellow/10 px-3 text-xs font-semibold text-ioh-yellow hover:bg-ioh-yellow/20">
              Surabaya comparable <ArrowRight size={13} />
            </button>
            <button onClick={() => onTab('export')} className="flex h-8 items-center gap-1.5 border border-line2 px-3 text-xs font-semibold text-muted hover:text-ink">
              Monthly one-pager
            </button>
          </div>
        </div>
      </div>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 border border-line bg-panel md:grid-cols-3 xl:grid-cols-6">
        <Kpi className="border-b border-r xl:border-b-0" label="IDR protected YTD" fresh="D-1" value={idr(S.protectedYtd)} sub={`${idr(S.revYtd).replace('IDR ', '')} revenue DiD + ${idr(S.avYtd).replace('IDR ', '')} outages`} tone="yellow" />
        <Kpi className="border-b border-r xl:border-b-0" label="Churn avoided" fresh="D-1" value={`${num(Math.round(S.roll.churnSubs))} subs/mo`} sub={`${idr(S.roll.churnIdr)} at ARPU × 18 months`} />
        <Kpi className="border-b md:border-r xl:border-b-0" label="CapEx ROI (run-rate)" fresh="D-1" value={`${S.roll.roi.toFixed(2)}x`} sub={`target 1.3x · ${roiAbove} of ${S.roi.length} programs above`} tone={roiTone} />
        <Kpi className="border-r max-xl:border-b" label="Median decision → RFS" fresh="live" value={<span>{S.nicc.toFixed(1)} wk <span className="text-sm font-medium text-faint">vs {S.legacy.toFixed(1)} legacy</span></span>} sub={`NICC ${S.nNicc} programs · legacy ${S.nLegacy}`} tone="ok" />
        <Kpi className="border-r" label="Prediction precision" fresh="D-1" value={`${Math.round(S.capP * 100)}% · ${Math.round(S.powP * 100)}%`} sub="capacity · power, top decile" tone="ok" />
        <Kpi label="Validated at 90 days" fresh="D-1" value={`${S.at90} of ${S.roll.sites}`} sub={`${S.roll.sites - S.at90} still inside the 90-day window`} />
      </div>

      <SyntheticNote />

      {/* Best and worst */}
      <div className="grid gap-4 xl:grid-cols-2">
        <RankPanel title="Ten best interventions" icon={<TrendingUp size={14} className="text-ok" />} rows={S.best} tone="ok" onOpen={onValidation} />
        <RankPanel title="Ten worst interventions" icon={<TrendingDown size={14} className="text-bad" />} rows={S.worst} tone="bad" onOpen={onValidation} />
      </div>

      {/* Value pools */}
      <Panel
        pad={false}
        title="Value pools and how each is measured"
        right={
          <span className="flex items-center gap-2 text-xs text-faint">
            PRD §9 formulas · pools overlap and are not additive <Fresh f="D-1" />
          </span>
        }
      >
        <table className="w-full table-fixed">
          <thead>
            <tr>
              <Th className="w-[150px]">Value pool</Th>
              <Th className="w-[20%]">Metric</Th>
              <Th className="w-[22%]">Formula (simplified)</Th>
              <Th className="w-[230px] text-right">Value to date</Th>
              <Th>Basis</Th>
              <Th className="w-14">Age</Th>
            </tr>
          </thead>
          <tbody>
            {S.pools.map((p) => (
              <tr key={p.pool} className="align-top">
                <Td className="whitespace-normal py-2 font-semibold">{p.pool}</Td>
                <Td className="whitespace-normal py-2 text-muted">{p.metric}</Td>
                <Td className="whitespace-normal py-2">
                  <span className="font-mono text-[11.5px] text-ink/90">{p.formula}</span>
                </Td>
                <Td className="whitespace-normal py-2 text-right">
                  {p.value === null ? (
                    <Badge>Method only</Badge>
                  ) : (
                    <div>
                      <div className="tnum font-semibold text-ioh-yellow">{idr(p.value)}</div>
                      <div className="tnum text-xs text-faint">{p.valueNote}</div>
                    </div>
                  )}
                </Td>
                <Td className="whitespace-normal py-2 text-xs leading-5 text-muted">{p.basis}</Td>
                <Td className="py-2">
                  <Fresh f={p.fresh} />
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {/* Cadence */}
      <div className="border border-line bg-panel">
        <div className="flex h-10 items-center border-b border-line px-4 text-sm font-semibold">Reporting cadence</div>
        <div className="grid grid-cols-2 xl:grid-cols-4">
          {CADENCE.map((c, i) => (
            <div key={c.when} className={clsx('px-4 py-3', i < CADENCE.length - 1 && 'border-r border-line', i < 2 && 'max-xl:border-b')}>
              <div className="flex items-center gap-2">
                <span className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">{c.when}</span>
                <span className="text-2xs text-faint">{c.next}</span>
              </div>
              <div className="mt-1 text-sm font-semibold">{c.what}</div>
              <div className="text-xs text-muted">{c.who}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const CADENCE = [
  { when: 'Daily', next: 'next 07:00 WIB', what: 'Incident-level predicted value', who: 'Visible to incident owners in M3' },
  { when: 'Weekly', next: 'Mon network review', what: 'Program realised versus predicted', who: 'Heads of Planning and Deployment' },
  { when: 'Monthly', next: 'Oct review', what: 'National ROI, model scorecard, cycle-time trend', who: 'COO and CFO · executive one-pager' },
  { when: 'Quarterly', next: 'Q4 2026', what: 'Smart CapEx envelope recalibration', who: 'Realised ROI by intervention class' },
]

function worstProgramsLabel(rows: Ranked[]): string {
  const c = new Map<string, number>()
  for (const r of rows) c.set(r.program_id, (c.get(r.program_id) ?? 0) + 1)
  const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2)
  return top.map(([p, n]) => `${p} (${n} of the bottom ten)`).join(' and ')
}

function Label2({ children }: { children: React.ReactNode }) {
  return <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{children}</div>
}

function RankPanel({ title, icon, rows, tone, onOpen }: { title: string; icon: React.ReactNode; rows: Ranked[]; tone: 'ok' | 'bad'; onOpen: (p?: string) => void }) {
  const programs = useApp((s) => s.programs)
  const max = Math.max(...rows.map((r) => Math.abs(r.v)), 1)
  return (
    <Panel
      pad={false}
      title={
        <span className="flex items-center gap-2">
          {icon}
          {title}
          <span className="font-normal text-faint">by realised CNX uplift vs control</span>
        </span>
      }
      right={<Fresh f="D-1" />}
    >
      <table className="w-full table-fixed">
        <thead>
          <tr>
            <Th className="w-8">#</Th>
            <Th className="w-[92px]">Site</Th>
            <Th>Name · program</Th>
            <Th className="w-[70px] text-right">Horizon</Th>
            <Th className="w-[84px] text-right">Predicted</Th>
            <Th className="w-[170px]">Realised DiD</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const pname = programs.find((p) => p.program_id === r.program_id)?.name ?? ''
            return (
              <tr key={r.site_id} className="cursor-pointer hover:bg-panel2" onClick={() => onOpen(r.program_id)}>
                <Td className="text-faint">{i + 1}</Td>
                <Td>
                  <Id>{r.site_id}</Id>
                </Td>
                <Td className="truncate">
                  <span>{r.name}</span> <span className="text-xs text-faint">· {r.program_id} {pname.split(' — ')[0]}</span>
                </Td>
                <Td className="tnum text-right text-muted">{r.h} d</Td>
                <Td className="tnum text-right text-muted">{signed(r.predicted)}</Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <div className="relative h-2 flex-1 bg-line">
                      <div className={clsx('absolute inset-y-0 left-0', tone === 'ok' ? 'bg-ok' : r.v < 0 ? 'bg-bad' : 'bg-nodata')} style={{ width: `${(Math.abs(r.v) / max) * 100}%` }} />
                    </div>
                    <span className={clsx('tnum w-14 text-right font-semibold', r.v > 0 ? 'text-ok' : 'text-bad')}>{signed(r.v)} pts</span>
                  </div>
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </Panel>
  )
}
