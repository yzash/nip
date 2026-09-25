import clsx from 'clsx'
import { ArrowLeftRight, BrainCircuit } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { db } from '@/data/db'
import type { FailureClass } from '@/data/types'
import { Badge, Button, Empty, Fresh, Id, Label, ReasonModal, Seg, Td, Th } from '@/components/ui'
import { CLASS_LABEL, date, idr, num } from '@/lib/format'
import { useApp, useRole } from '@/store/app'
import { CLASS_CHIP_ORDER, classify, useForecast, type Bucket, type SplitRow } from './model'

const OVERRIDE_CODES = [
  'Local knowledge: cheaper fix available',
  'Window too short for CapEx lead time',
  'Recurring fault: needs structural fix',
  'Budget envelope exhausted',
  'Covered by upcoming program',
  'Tower company constraint',
]

export function Split() {
  const { rows } = useForecast()
  const classMoves = useApp((s) => s.classMoves)
  const moveClass = useApp((s) => s.moveClass)
  const toast = useApp((s) => s.toast)
  const role = useRole()
  const [cls, setCls] = useState<FailureClass | 'all'>('all')
  const [moving, setMoving] = useState<SplitRow | null>(null)
  const D = db()

  const all = useMemo<SplitRow[]>(
    () =>
      rows.map((r) => {
        const c = classify(r)
        const mv = classMoves[r.site_id]
        const final: Bucket = mv ? mv.to : c.rec
        return { ...c, final, moved: !!mv && mv.to !== c.rec, reason: mv?.reason }
      }),
    [rows, classMoves],
  )
  const view = cls === 'all' ? all : all.filter((r) => r.row.cls === cls)
  const capex = view.filter((r) => r.final === 'capex').sort((a, b) => a.row.cw - b.row.cw || b.cost - a.cost)
  const non = view.filter((r) => r.final === 'noncapex').sort((a, b) => a.row.cw - b.row.cw || b.cost - a.cost)
  const tot = (xs: SplitRow[]) => xs.reduce((s, r) => s + r.cost, 0)
  const movedN = all.filter((r) => r.moved).length
  const agentCapex = view.filter((r) => r.rec === 'capex').length

  return (
    <div className="space-y-4 p-6">
      <section className="border border-line bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BrainCircuit size={14} className="text-ioh-yellow" />
              <Label>Smart CapEx Agent · batch as of {date(D.meta.as_of_d5)}</Label>
              <Fresh f="D-5" asOf={D.meta.as_of_d5} />
            </div>
            <div className="tnum mt-1.5 text-[22px] font-semibold leading-8 tracking-tight">
              <span className="text-ioh-yellow">{capex.length}</span> of {view.length} predicted sites need CapEx ({idr(tot(capex))})
              <span className="mx-2 text-faint">·</span>
              <span className="text-ok">{non.length}</span> can be fixed without it ({idr(tot(non))})
            </div>
            <div className="mt-1 text-sm text-muted">
              The agent recommended {agentCapex} CapEx / {view.length - agentCapex} non-CapEx. Every move carries a reason code and is fed back to Netra through the Agent Studio feedback loop
              {movedN > 0 && (
                <>
                  {' '}
                  · <span className="text-ioh-yellow">{movedN} moved by planner this session</span>
                </>
              )}
              .
            </div>
          </div>
          <Seg<FailureClass | 'all'>
            value={cls}
            onChange={setCls}
            options={[{ id: 'all', label: 'All' }, ...CLASS_CHIP_ORDER.map((c) => ({ id: c, label: CLASS_LABEL[c] }))]}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Column title="CapEx" tone="yellow" rows={capex} total={tot(capex)} target="noncapex" onMove={setMoving} canApprove={role.role_code === 'PLAN'} />
        <Column title="Non-CapEx" tone="ok" rows={non} total={tot(non)} target="capex" onMove={setMoving} canApprove={role.role_code === 'PLAN'} />
      </div>

      <div className="text-xs text-faint">
        Rules (prototype stand-in for the agent): capacity crossing ≤ W+5 → sector / carrier add, else refarm · power battery health &lt; 55% → Li-ion / solar retrofit, else battery swap · transport in a chain or link &gt; 90% → MW upgrade, else reroute · RAN unit age ≥ 21 yrs (past end-of-support) → modernisation swap, else spares · environmental → pre-emptive visit. Unit costs from the price book; thresholds editable in Agent Studio.
      </div>

      <ReasonModal
        key={moving?.row.site_id ?? 'none'}
        open={!!moving}
        onClose={() => setMoving(null)}
        title={moving ? `Move ${moving.row.site_id} to ${moving.final === 'capex' ? 'non-CapEx' : 'CapEx'}` : ''}
        confirmLabel="Move and log override"
        codes={OVERRIDE_CODES}
        onSubmit={(reason) => {
          if (!moving) return
          const to: Bucket = moving.final === 'capex' ? 'noncapex' : 'capex'
          moveClass(moving.row.site_id, to, reason, moving.recLabel)
          toast(`${moving.row.site_id} moved to ${to === 'capex' ? 'CapEx' : 'non-CapEx'} · override sent to Netra`, 'info')
        }}
      />
    </div>
  )
}

function Column({ title, tone, rows, total, target, onMove, canApprove }: { title: string; tone: 'yellow' | 'ok'; rows: SplitRow[]; total: number; target: Bucket; onMove: (r: SplitRow) => void; canApprove: boolean }) {
  const nav = useNavigate()
  const moved = rows.filter((r) => r.moved).length
  return (
    <section className="flex min-w-0 flex-col border border-line bg-panel">
      <header className={clsx('flex items-center justify-between gap-3 border-b border-line px-4 py-2.5', tone === 'yellow' ? 'border-t-2 border-t-ioh-yellow' : 'border-t-2 border-t-ok')}>
        <div className="flex items-baseline gap-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className={clsx('tnum text-xl font-semibold', tone === 'yellow' ? 'text-ioh-yellow' : 'text-ok')}>{num(rows.length)}</span>
          <span className="text-xs text-muted">sites</span>
          <span className="tnum text-sm font-semibold">{idr(total)}</span>
          {moved > 0 && <Badge tone="yellow">{moved} moved in</Badge>}
        </div>
        <span className="text-xs text-faint">{tone === 'yellow' ? (canApprove ? 'You approve minor CapEx above IDR 200m' : 'Head of Planning approves') : 'Regional / NOC approval, auto below IDR 20m'}</span>
      </header>
      {rows.length === 0 ? (
        <Empty>No sites in this column.</Empty>
      ) : (
        <div className="max-h-[calc(100vh-330px)] min-h-[320px] overflow-y-auto">
          <table className="w-full table-fixed border-collapse">
            <thead>
              <tr>
                <Th className="w-[150px]">Site</Th>
                <Th className="w-[60px]">Cross</Th>
                <Th>Agent classification · rationale</Th>
                <Th className="w-[84px] text-right">Cost</Th>
                <Th className="w-[128px]" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.row.site_id} className={clsx('align-top hover:bg-panel2', r.moved && 'bg-ioh-yellow/[0.05]')}>
                  <Td className="h-auto py-2">
                    <Id onClick={() => nav(`/site/${r.row.site_id}`)} className="text-ink">
                      {r.row.site_id}
                    </Id>
                    <div className="truncate text-xs text-faint">
                      {CLASS_LABEL[r.row.cls]} · {r.row.district}
                    </div>
                  </Td>
                  <Td className="h-auto py-2 font-semibold">W+{r.row.cw}</Td>
                  <Td className="h-auto !whitespace-normal py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={clsx('text-sm', r.moved && 'text-faint line-through')}>{r.recLabel}</span>
                      {r.moved && <Badge tone="yellow">Moved by planner</Badge>}
                    </div>
                    <div className="text-xs text-muted">{r.rationale}</div>
                    {r.moved && r.reason && <div className="text-xs text-ioh-yellow/80">Reason: {r.reason}</div>}
                  </Td>
                  <Td className="tnum h-auto py-2 text-right">{idr(r.cost)}</Td>
                  <Td className="h-auto py-2 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onMove(r)} title={`Move to ${target === 'capex' ? 'CapEx' : 'non-CapEx'}`}>
                      <ArrowLeftRight size={12} /> {target === 'capex' ? 'To CapEx' : 'To non-CapEx'}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
