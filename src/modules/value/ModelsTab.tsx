import clsx from 'clsx'
import { Bar as RBar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { db } from '@/data/db'
import { Badge, Fresh, Label, Panel, Td, Th } from '@/components/ui'
import { STATUS } from '@/lib/colors'
import { CLASS_LABEL, date } from '@/lib/format'
import { usePolicy } from '@/store/app'
import { AXIS, GRID, LegendItem, TOOLTIP } from './chart'

const WAVE_TONE: Record<number, 'yellow' | 'blue' | 'neutral'> = { 1: 'yellow', 2: 'blue', 3: 'neutral' }

export function ModelsTab() {
  const D = db()
  const policy = usePolicy()
  const sc = D.scorecard
  const chart = sc.map((s) => ({ cls: CLASS_LABEL[s.failure_class], p: Math.round(s.precision_top_decile * 100), r: Math.round(s.recall * 100), status: s.status }))
  const driving = sc.filter((s) => s.precision_top_decile >= 0.7)
  const drift = sc.filter((s) => s.drift_psi >= 0.1)

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      <div className="border border-line bg-panel px-5 py-4">
        <Label>Site Failure Prediction Agent · operational truth for model owners</Label>
        <div className="mt-1 text-[20px] font-semibold leading-8">
          {driving.map((s) => CLASS_LABEL[s.failure_class]).join(' and ')} clear the 70% top-decile precision bar and drive approvals; {sc.length - driving.length} classes stay advisory or in shadow mode
        </div>
        <div className="mt-1 text-sm text-muted">
          Drift watch: {drift.map((s) => `${CLASS_LABEL[s.failure_class]} PSI ${s.drift_psi.toFixed(2)}`).join(', ')} (above 0.10 triggers a monthly recalibration review by the Model Drift Agent).
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Panel
          title="Precision at the top decile by failure class"
          right={
            <span className="flex items-center gap-3">
              <LegendItem square color={STATUS.ok} label="≥ 70% drives approvals" />
              <LegendItem square color={STATUS.warn} label="Advisory" />
              <LegendItem square color="#6B7280" label="Shadow" />
              <Fresh f="D-1" />
            </span>
          }
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart} margin={{ top: 20, right: 12, bottom: 0, left: 0 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="cls" {...AXIS} />
                <YAxis {...AXIS} width={36} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
                <Tooltip {...TOOLTIP} formatter={(v: number, n: string) => [`${v}%`, n === 'p' ? 'Precision (top decile)' : 'Recall']} />
                <ReferenceLine y={70} stroke={STATUS.ok} strokeDasharray="4 3" label={{ value: '70% acceptance', position: 'insideTopRight', fill: STATUS.ok, fontSize: 11 }} />
                <RBar dataKey="p" isAnimationActive={false} maxBarSize={56}>
                  {chart.map((c) => (
                    <Cell key={c.cls} fill={c.p >= 70 ? STATUS.ok : c.status.startsWith('Shadow') ? '#6B7280' : STATUS.warn} />
                  ))}
                  <LabelList dataKey="p" position="top" formatter={(v: number) => `${v}%`} style={{ fill: '#F2F3F5', fontSize: 11, fontWeight: 600 }} />
                </RBar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Cold start and acceptance rule">
          <div className="space-y-3 text-sm leading-6 text-muted">
            <p>
              <span className="font-semibold text-ink">Back-tested, not projected.</span> Wave 1 launched on <span className="text-ink">24 months</span> of historical KPIs and alarms, so the first
              precision number shown to the Head of Network is real. Environmental runs on 12 months while the BMKG weather feed is connected.
            </p>
            <p>
              <span className="font-semibold text-ink">Acceptance.</span> Precision at the top decile above <span className="text-ok">70%</span> for a class on the back-test before any prediction
              drives an approval. Below that, predictions are shown as advisory with a confidence band.
            </p>
            <p>
              <span className="font-semibold text-ink">No false alarms on the map.</span> No site turns red below <span className="text-ink">{Math.round(policy.red_min_probability * 100)}%</span>{' '}
              probability (red floor, editable in Agent Studio).
            </p>
            <p>
              <span className="font-semibold text-ink">Method.</span> One gradient-boosted classifier per class on a rolling 90-day feature window; label = failure or breach inside the horizon;
              top contributing factors per site shown in Site 360; calibration reviewed monthly against realised outcomes.
            </p>
          </div>
        </Panel>
      </div>

      <Panel pad={false} title="Scorecard by failure class" right={<span className="flex items-center gap-2 text-xs text-faint">Model Drift Agent · weekly Mon · as of {date(D.meta.as_of)} <Fresh f="D-1" /></span>}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Failure class</Th>
              <Th>Wave</Th>
              <Th>Horizon</Th>
              <Th className="text-right">Precision (top decile)</Th>
              <Th className="text-right">Recall</Th>
              <Th className="text-right">False-positive rate</Th>
              <Th className="text-right">Override rate</Th>
              <Th className="text-right">Drift (PSI)</Th>
              <Th className="text-right">Back-test</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {sc.map((s) => (
              <tr key={s.failure_class}>
                <Td className="font-semibold">{CLASS_LABEL[s.failure_class]}</Td>
                <Td>
                  <Badge tone={WAVE_TONE[s.wave]}>Wave {s.wave}</Badge>
                </Td>
                <Td className="text-muted">{s.horizon}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="relative h-1.5 w-24 bg-line">
                      <div className="absolute inset-y-0 left-0" style={{ width: `${s.precision_top_decile * 100}%`, background: s.precision_top_decile >= 0.7 ? STATUS.ok : STATUS.warn }} />
                      <div className="absolute -inset-y-1 w-px bg-ink/70" style={{ left: '70%' }} />
                    </div>
                    <span className={clsx('tnum w-10 font-semibold', s.precision_top_decile >= 0.7 ? 'text-ok' : 'text-warn')}>{Math.round(s.precision_top_decile * 100)}%</span>
                  </div>
                </Td>
                <Td className="tnum text-right">{Math.round(s.recall * 100)}%</Td>
                <Td className="tnum text-right">{(s.false_positive_rate * 100).toFixed(1)}%</Td>
                <Td className="tnum text-right">{Math.round(s.override_rate * 100)}%</Td>
                <Td className={clsx('tnum text-right', s.drift_psi >= 0.1 ? 'text-warn' : 'text-muted')}>{s.drift_psi.toFixed(2)}</Td>
                <Td className="tnum text-right text-muted">{s.backtest_months} mo</Td>
                <Td>
                  <Badge tone={s.status.startsWith('Driving') ? 'ok' : s.status.startsWith('Advisory') ? 'warn' : 'neutral'}>{s.status}</Badge>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="border-t border-line px-4 py-2 text-xs text-faint">
          PSI under 0.10 stable · 0.10 to 0.25 watch · above 0.25 retrain. Override rate is the share of the class&apos;s predictions a human rejected with a reason code; those overrides flow to Netra
          through the feedback loop in Agent Studio.
        </div>
      </Panel>
    </div>
  )
}
