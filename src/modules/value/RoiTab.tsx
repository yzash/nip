import clsx from 'clsx'
import { useMemo } from 'react'
import { Bar as RBar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Fresh, Id, Label, Panel, Td, Th } from '@/components/ui'
import { STATUS } from '@/lib/colors'
import { date, idr, num, signed } from '@/lib/format'
import { useApp } from '@/store/app'
import { AXIS, GRID, LegendItem, SyntheticNote, TOOLTIP } from './chart'
import { ASSUMPTIONS, programRoi, rollup } from './calc'

export function RoiTab({ onValidation }: { onValidation: (p?: string) => void }) {
  const programs = useApp((s) => s.programs)
  const rows = useMemo(() => programRoi(programs), [programs])
  const R = useMemo(() => rollup(rows), [rows])
  const above = rows.filter((r) => r.roi >= 1.3)
  const chart = rows.map((r) => ({ id: r.program.program_id, name: r.program.name, roi: Number(r.roi.toFixed(2)) }))

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      <div className="grid gap-4 xl:grid-cols-[1fr_520px]">
        <div className="border border-line bg-panel px-5 py-4">
          <Label>Program ROI · national roll-up</Label>
          <div className="mt-1 text-[20px] font-semibold leading-8">
            {idr(R.spent)} CapEx across {rows.length} validated programs is running at <span className={R.roi >= 1.3 ? 'text-ok' : 'text-warn'}>{R.roi.toFixed(2)}x</span> annualised
            return versus the 1.3x target
          </div>
          <div className="mt-1 text-sm text-muted">
            {above.length} of {rows.length} programs already clear 1.3x ({above.map((r) => r.program.program_id).join(', ')}). Capacity programs in dense metros pay back fastest; power and
            transport programs are under-credited here because their value sits in avoided outages and energy OpEx, not revenue uplift.
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3 md:grid-cols-5">
            <Mini label="Revenue protected to date" value={idr(R.revToDate)} />
            <Mini label="Annualised revenue uplift" value={idr(R.revAnnual)} />
            <Mini label="Churn avoided" value={idr(R.churnIdr)} sub={`${num(Math.round(R.churnSubs))} subs/mo`} />
            <Mini label="CLV impact" value={idr(R.clvIdr)} />
            <Mini label="Payback" value={R.paybackMonths ? `${R.paybackMonths.toFixed(1)} mo` : '—'} />
          </div>
        </div>
        <Panel
          title="ROI multiple by program"
          right={
            <span className="flex items-center gap-3">
              <LegendItem color={STATUS.ok} dash label="1.3x target" />
              <Fresh f="D-1" />
            </span>
          }
        >
          <div className="h-[178px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="id" {...AXIS} tickFormatter={(v: string) => v.replace('PRG-', '')} />
                <YAxis {...AXIS} width={40} allowDecimals tickFormatter={(v: number) => `${Number(v.toFixed(1))}x`} />
                <Tooltip {...TOOLTIP} formatter={(v: number) => [`${v.toFixed(2)}x`, 'ROI multiple']} labelFormatter={(l: string) => chart.find((c) => c.id === l)?.name ?? l} />
                <ReferenceLine y={1.3} stroke={STATUS.ok} strokeDasharray="4 3" />
                <RBar dataKey="roi" isAnimationActive={false} maxBarSize={34}>
                  {chart.map((c) => (
                    <Cell key={c.id} fill={c.roi >= 1.3 ? STATUS.ok : c.roi >= 1 ? STATUS.warn : '#A3AAB8'} />
                  ))}
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel pad={false} title="Programs with post-RFS validation (RFS and Validation stages)" right={<span className="flex items-center gap-2 text-xs text-faint">ROI Attribution Agent · weekly Mon <Fresh f="D-1" /></span>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th>Program</Th>
                <Th>Stage</Th>
                <Th className="text-right">Sites</Th>
                <Th className="text-right">CNX DiD</Th>
                <Th className="text-right">CapEx spent</Th>
                <Th className="text-right">Revenue protected</Th>
                <Th className="text-right">Annualised</Th>
                <Th className="text-right">Churn avoided</Th>
                <Th className="text-right">CLV impact</Th>
                <Th className="text-right">Payback</Th>
                <Th className="text-right">ROI</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rfs = r.program.stage_history.find((s) => s.stage === 'RFS')?.start ?? r.program.forecast_rfs
                return (
                  <tr key={r.program.program_id} className="cursor-pointer hover:bg-panel2" onClick={() => onValidation(r.program.program_id)} title="Open post-RFS validation for this program">
                    <Td>
                      <div className="flex items-center gap-2">
                        <Id>{r.program.program_id}</Id>
                        <span className="font-semibold">{r.program.name}</span>
                        {r.program.gb_factory && <Badge tone="yellow">GB Factory</Badge>}
                      </div>
                      <div className="text-xs text-faint">
                        RFS {date(rfs)} · {r.program.managed_by === 'nicc' ? 'NICC-managed' : 'legacy'} · {r.program.intervention.replace('_', ' ')}
                      </div>
                    </Td>
                    <Td>
                      <Badge tone={r.program.stage === 'Validation' ? 'prog' : 'blue'}>{r.program.stage}</Badge>
                    </Td>
                    <Td className="tnum text-right">
                      {r.sitesMeasured < r.sites ? (
                        <span>
                          {r.sitesMeasured}
                          <span className="text-faint">/{r.sites}</span>
                        </span>
                      ) : (
                        r.sites
                      )}
                    </Td>
                    <Td className={clsx('tnum text-right', r.cnxDid > 0.5 ? 'text-ok' : r.cnxDid < -0.5 ? 'text-bad' : 'text-muted')}>{signed(r.cnxDid)}</Td>
                    <Td className="tnum text-right">{idr(r.spent)}</Td>
                    <Td className="tnum text-right">{idr(r.revToDate)}</Td>
                    <Td className="tnum text-right text-muted">{idr(r.revAnnual)}</Td>
                    <Td className="tnum text-right">
                      {idr(r.churnIdr)}
                      <div className="text-xs text-faint">{num(Math.round(r.churnSubs))} subs/mo</div>
                    </Td>
                    <Td className="tnum text-right text-muted">{idr(r.clvIdr)}</Td>
                    <Td className="tnum text-right">{r.paybackMonths ? (r.paybackMonths > 120 ? '> 10 y' : `${r.paybackMonths.toFixed(1)} mo`) : '—'}</Td>
                    <Td className={clsx('tnum text-right font-semibold', r.roi >= 1.3 ? 'text-ok' : r.roi >= 1 ? 'text-warn' : 'text-muted')}>{r.roi.toFixed(2)}x</Td>
                  </tr>
                )
              })}
              <tr className="bg-panel2">
                <Td className="font-semibold">National roll-up</Td>
                <Td />
                <Td className="tnum text-right font-semibold">{R.sites}</Td>
                <Td className="tnum text-right font-semibold text-ok">{signed(R.cnxDid)}</Td>
                <Td className="tnum text-right font-semibold">{idr(R.spent)}</Td>
                <Td className="tnum text-right font-semibold">{idr(R.revToDate)}</Td>
                <Td className="tnum text-right font-semibold">{idr(R.revAnnual)}</Td>
                <Td className="tnum text-right font-semibold">{idr(R.churnIdr)}</Td>
                <Td className="tnum text-right font-semibold">{idr(R.clvIdr)}</Td>
                <Td className="tnum text-right font-semibold">{R.paybackMonths ? `${R.paybackMonths.toFixed(1)} mo` : '—'}</Td>
                <Td className={clsx('tnum text-right font-semibold', R.roi >= 1.3 ? 'text-ok' : 'text-warn')}>{R.roi.toFixed(2)}x</Td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="grid gap-x-8 gap-y-1.5 border-t border-line px-4 py-3 text-xs leading-5 text-muted md:grid-cols-2">
          <Formula k="Revenue protected" v="Σ sites revenue DiD (IDR/month, latest horizon) × months since RFS" />
          <Formula k="Annualised" v="Σ sites revenue DiD × 12" />
          <Formula k="Churn avoided" v={`churn DiD (pts/month) × catchment subs × ARPU × ${ASSUMPTIONS.clvTenureMonths} months`} />
          <Formula k="CLV impact" v={`Σ subs × ARPU × (subscriber-months at actual churn − at counterfactual churn) over ${ASSUMPTIONS.clvHorizonMonths} months`} />
          <Formula k="Payback" v="CapEx spent ÷ monthly revenue DiD" />
          <Formula k="ROI multiple" v="(annualised revenue DiD + churn avoided) ÷ CapEx spent; target 1.3x within 12 months of RFS" />
        </div>
      </Panel>
      <SyntheticNote />
    </div>
  )
}

function Mini({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className="tnum mt-0.5 text-base font-semibold">{value}</div>
      {sub && <div className="tnum text-xs text-muted">{sub}</div>}
    </div>
  )
}

function Formula({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <span className="font-semibold text-ink">{k}</span> = <span className="font-mono text-[11px]">{v}</span>
    </div>
  )
}
