import clsx from 'clsx'
import { ArrowRight, Check, Truck } from 'lucide-react'
import { useState } from 'react'
import type { Program } from '@/data/types'
import { Badge, Button, Modal } from '@/components/ui'
import { dateShort, num } from '@/lib/format'
import { useApp } from '@/store/app'
import { HEALTH_LABEL, HEALTH_TONE, STAGES, STAGE_SHORT, reallocationCandidates, stageIdx, vendorById } from './lib'

export function HealthBadge({ h }: { h: Program['health'] }) {
  return <Badge tone={HEALTH_TONE[h]}>{HEALTH_LABEL[h]}</Badge>
}

export function ManagedChip({ p }: { p: Program }) {
  return p.managed_by === 'nicc' ? (
    <span className="inline-flex h-[18px] items-center border border-ioh-yellow/50 px-1 font-mono text-[10px] font-medium text-ioh-yellow" title="Managed through NICC (parallel stages 4–6)">
      NICC
    </span>
  ) : (
    <span className="inline-flex h-[18px] items-center border border-line2 px-1 font-mono text-[10px] text-faint" title="Legacy sequential process">
      legacy
    </span>
  )
}

/** Compact nine-stage progress: one cell per stage, current stage outlined. */
export function StageStrip({ p, width = 9 * 14 }: { p: Program; width?: number }) {
  const cur = stageIdx(p.stage)
  const color = p.health === 'late' ? '#FF3B3B' : p.health === 'at_risk' ? '#F5A623' : '#FFD100'
  const w = (width - 8 * 2) / 9
  return (
    <div className="flex items-center gap-[2px]" title={`Stage ${cur + 1} of 9 · ${p.stage}`}>
      {STAGES.map((s, i) => (
        <div
          key={s}
          className="h-2.5"
          style={{
            width: w,
            background: i < cur ? '#4B5263' : i === cur ? color : 'transparent',
            border: i >= cur ? `1px solid ${i === cur ? color : '#353B48'}` : undefined,
          }}
        />
      ))}
    </div>
  )
}

export function StageLabel({ p }: { p: Program }) {
  return (
    <span className="text-xs text-muted">
      <span className="tnum text-faint">{stageIdx(p.stage) + 1}/9</span> {STAGE_SHORT[p.stage]}
    </span>
  )
}

/** Reallocate vendor capacity: choose another vendor with free capacity (in region first). */
export function ReallocateModal({ program, onClose }: { program: Program | null; onClose: () => void }) {
  const programs = useApp((s) => s.programs)
  const [pick, setPick] = useState<string | null>(null)
  if (!program) return null
  const cands = reallocationCandidates(program, programs)
  const cur = vendorById(program.vendor_id)
  const chosen = pick ?? cands[0]?.vendor.vendor_id ?? null
  const blocker = program.blockers.find((b) => b.type === 'vendor_sla')
  const remaining = program.sites_planned - program.sites_rfs
  const submit = () => {
    if (!chosen) return
    const app = useApp.getState()
    const v = vendorById(chosen)!
    app.reallocateVendor(program.program_id, chosen)
    app.toast(`${program.program_id}: ${remaining} sites reallocated from ${cur?.short ?? program.vendor_id} to ${v.short}. Vendor SLA risk cleared; work orders re-issued.`)
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={`Reallocate vendor capacity · ${program.program_id}`} width={600}>
      <div className="mb-3 text-sm">
        <div className="font-semibold">{program.name}</div>
        <div className="text-muted">
          {program.region} · {remaining} sites still to build · currently <span className="text-ink">{cur?.name}</span> ({cur?.sla_pct}% SLA)
        </div>
        {blocker && <div className="mt-2 border-l-2 border-warn bg-warn/5 px-2 py-1.5 text-xs text-warn">{blocker.text}</div>}
      </div>
      <div className="mb-1 text-2xs font-semibold uppercase tracking-wider text-faint">Vendors with free capacity · ranked by free capacity × SLA</div>
      <div className="mb-4 divide-y divide-line border border-line">
        {cands.length === 0 && <div className="px-3 py-4 text-sm text-faint">No vendor has free capacity this month.</div>}
        {cands.map((c) => {
          const sel = chosen === c.vendor.vendor_id
          return (
            <button
              key={c.vendor.vendor_id}
              onClick={() => setPick(c.vendor.vendor_id)}
              className={clsx('flex w-full items-center gap-3 px-3 py-2.5 text-left', sel ? 'bg-ioh-yellow/10' : 'hover:bg-panel2')}
            >
              <span className={clsx('flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', sel ? 'border-ioh-yellow bg-ioh-yellow text-canvas' : 'border-line2')}>
                {sel && <Check size={10} strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  {c.vendor.name} <span className="font-mono text-[11px] font-normal text-faint">{c.vendor.short}</span>
                </div>
                <div className="text-xs text-muted">{c.inRegion ? `Covers ${program.region}` : `Cross-region mobilisation from ${c.vendor.regions.join(' / ')} · +${c.mobilisationDays} d`}</div>
              </div>
              <div className="tnum w-24 text-right text-xs">
                <div className={c.free >= c.need ? 'text-ok' : 'text-warn'}>{num(c.free)} free / mo</div>
                <div className="text-faint">need ≈ {c.need}</div>
              </div>
              <div className="tnum w-16 text-right text-xs text-muted">{c.vendor.sla_pct}% SLA</div>
            </button>
          )
        })}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-faint">Logged to the audit trail and fed to the Vendor Allocation Agent.</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!chosen} onClick={submit}>
            <Truck size={13} /> Reallocate {chosen ? `to ${vendorById(chosen)?.short}` : ''}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

export function SlipCell({ p }: { p: Program }) {
  const d = Math.round((new Date(p.forecast_rfs).getTime() - new Date(p.target_rfs).getTime()) / 86400e3)
  return (
    <div className="tnum leading-tight">
      <div className="text-xs text-muted">
        {dateShort(p.target_rfs)} <ArrowRight size={10} className="inline text-faint" /> <span className={d > 0 ? 'text-bad' : 'text-ink'}>{dateShort(p.forecast_rfs)}</span>
      </div>
      <div className={clsx('text-[10.5px]', d > 0 ? 'text-bad' : 'text-faint')}>{d > 0 ? `+${d} d slip` : 'on target'}</div>
    </div>
  )
}
