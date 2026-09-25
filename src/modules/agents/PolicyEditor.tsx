import clsx from 'clsx'
import { RotateCcw, Save, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { db, kpiAt } from '@/data/db'
import type { ColourThreshold, Policy } from '@/data/types'
import { Badge, Button, Fresh, Id, Label, Panel, Td, Th } from '@/components/ui'
import { STATUS, statusOf } from '@/lib/colors'
import { idr, num } from '@/lib/format'
import { isOpen, lastDay, maxFailureProb, siteHealth } from '@/lib/metrics'
import { priorityScore } from '@/lib/policy'
import { useApp, usePolicy } from '@/store/app'

type LayerKey = keyof Policy['colour_thresholds']
const LAYER_META: Record<LayerKey, { label: string; unit: string; step: number; source: string }> = {
  health: { label: 'Site health', unit: 'score', step: 1, source: 'Composite score, 6,000 sites' },
  cnx: { label: 'CNX', unit: 'score', step: 1, source: 'CNX Agent, 6,000 sites' },
  availability: { label: 'Availability', unit: '%', step: 0.05, source: 'Cell availability D-1' },
  bad_session: { label: 'Bad sessions', unit: '%', step: 0.5, source: 'Bad Session Agent' },
  prb: { label: 'Capacity (PRB)', unit: '%', step: 1, source: 'PRB peak-hour load' },
  failure: { label: 'Predicted failure', unit: '%', step: 1, source: '8-week max probability' },
  link_util: { label: 'Backbone link utilisation', unit: '%', step: 1, source: 'Backbone links' },
  cache_hit: { label: 'CDN cache hit', unit: '%', step: 1, source: 'CDN PoPs' },
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T
}

export function PolicyEditor() {
  const D = db()
  const policy = usePolicy()
  const setPolicy = useApp((s) => s.setPolicy)
  const toast = useApp((s) => s.toast)
  const incidents = useApp((s) => s.incidents)
  const [draft, setDraft] = useState<Policy>(() => clone(policy))
  useEffect(() => setDraft(clone(policy)), [policy])

  const changes = useMemo(() => diffCount(policy, draft), [policy, draft])
  const fromDefault = useMemo(() => diffCount(D.policy, policy), [D.policy, policy])
  const set = <K extends keyof Policy>(k: K, v: Policy[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const setW = (k: keyof Policy['priority_weights'], v: number) => setDraft((d) => ({ ...d, priority_weights: { ...d.priority_weights, [k]: v } }))
  const setT = (k: LayerKey, patch: Partial<ColourThreshold>) => setDraft((d) => ({ ...d, colour_thresholds: { ...d.colour_thresholds, [k]: { ...d.colour_thresholds[k], ...patch } } }))

  const save = () => {
    setPolicy(clone(draft))
    toast(`Policy saved: ${changes} change${changes === 1 ? '' : 's'} applied. Map colours, routing and priority scores updated.`)
  }
  const reset = () => {
    setPolicy(clone(D.policy))
    setDraft(clone(D.policy))
    toast('Policy reset to the default placeholders', 'info')
  }

  // Impact preview
  const open = incidents.filter(isOpen)
  const execVisible = open.filter((i) => i.exposure_idr > draft.exec_incident_min_exposure_idr || i.site_ids.length > draft.exec_incident_min_sites).length
  const execNow = open.filter((i) => i.exposure_idr > policy.exec_incident_min_exposure_idr || i.site_ids.length > policy.exec_incident_min_sites).length
  const cxVisible = open.filter((i) => i.churn_risk_subs > draft.cx_incident_min_churn_subs).length
  const cxNow = open.filter((i) => i.churn_risk_subs > policy.cx_incident_min_churn_subs).length
  const rankNow = [...open].sort((a, b) => priorityScore(b, policy) - priorityScore(a, policy)).map((i) => i.incident_id)
  const top = [...open].map((i) => ({ i, s: priorityScore(i, draft) })).sort((a, b) => b.s - a.s).slice(0, 6)
  const opts = [...D.optionsByIncident.values()].flat()
  const cfo = opts.filter((o) => o.class === 'capex_major' && o.cost_idr > draft.cfo_cosign_above_idr).length
  const autoOpex = opts.filter((o) => o.class === 'noncapex_opex' && o.cost_idr < draft.opex_auto_approve_below_idr).length
  const regional = opts.filter((o) => o.class === 'capex_minor' && o.cost_idr <= draft.decision_threshold_idr).length

  return (
    <div className="mx-auto max-w-[1600px] space-y-4 p-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 border border-line bg-panel px-5 py-4">
        <div className="min-w-0 max-w-[1000px]">
          <Label>Threshold and policy editor</Label>
          <div className="mt-1 text-[19px] font-semibold leading-7">Approval thresholds, auto-approve rules, role filters, priority weights and colour thresholds, in one place</div>
          <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted">
            <TriangleAlert size={14} className="mt-[3px] shrink-0 text-warn" />
            <span>
              Values are <span className="text-warn">placeholders</span> to be replaced by IOH&apos;s delegation-of-authority matrix from the Network PMO. Mirror the current DoA first, tighten later, so
              the approval workflow never conflicts with existing authority (PRD §13 risk). Every save is written to the audit log.
            </span>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="flex gap-2">
            <Button variant="ghost" onClick={reset} disabled={fromDefault === 0 && changes === 0}>
              <RotateCcw size={13} /> Reset to defaults
            </Button>
            <Button variant="default" onClick={() => setDraft(clone(policy))} disabled={changes === 0}>
              Discard
            </Button>
            <Button variant="primary" onClick={save} disabled={changes === 0}>
              <Save size={13} /> Save policy{changes ? ` (${changes})` : ''}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-faint">
            {changes > 0 ? <span className="text-ioh-yellow">{changes} unsaved change{changes > 1 ? 's' : ''}</span> : <span>Saved</span>}
            <span>· {fromDefault ? `${fromDefault} different from defaults` : 'matches defaults'}</span>
            <Fresh f="live" />
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Approval thresholds (IDR)">
          <div className="space-y-3">
            <Idr label="Stage 3 decision threshold" hint="Minor CapEx at or below goes to the Regional Manager; above to Head of Planning" v={draft.decision_threshold_idr} d={D.policy.decision_threshold_idr} onChange={(v) => set('decision_threshold_idr', v)} />
            <Idr label="CFO co-sign above" hint="Major CapEx above this needs the CFO as co-signer" v={draft.cfo_cosign_above_idr} d={D.policy.cfo_cosign_above_idr} onChange={(v) => set('cfo_cosign_above_idr', v)} step={100} />
            <Idr label="OpEx auto-approve below" hint="Non-CapEx OpEx actions auto-approve with post-hoc review" v={draft.opex_auto_approve_below_idr} d={D.policy.opex_auto_approve_below_idr} onChange={(v) => set('opex_auto_approve_below_idr', v)} step={5} />
            <Num label="Customer action auto-approve below" unit="customers" hint="Proactive SMS or credit to fewer customers auto-approves" v={draft.customer_auto_approve_below} d={D.policy.customer_auto_approve_below} step={100} onChange={(v) => set('customer_auto_approve_below', v)} />
            <Num label="BOQ variance needing Head of Planning" unit="%" v={draft.boq_variance_pct} d={D.policy.boq_variance_pct} step={1} onChange={(v) => set('boq_variance_pct', v)} />
          </div>
          <Impact
            items={[
              [`${regional} minor-CapEx options`, 'routed to Regional Managers'],
              [`${cfo} major-CapEx options`, 'need CFO co-sign'],
              [`${autoOpex} OpEx options`, 'auto-approve'],
            ]}
          />
        </Panel>

        <Panel title="Role filters and prediction rules">
          <div className="space-y-3">
            <Idr label="EXEC sees incidents with exposure above" v={draft.exec_incident_min_exposure_idr} d={D.policy.exec_incident_min_exposure_idr} onChange={(v) => set('exec_incident_min_exposure_idr', v)} step={50} />
            <Num label="… or more sites than" unit="sites" v={draft.exec_incident_min_sites} d={D.policy.exec_incident_min_sites} step={1} onChange={(v) => set('exec_incident_min_sites', v)} />
            <Num label="CX sees churn-risk cohorts above" unit="subscribers" v={draft.cx_incident_min_churn_subs} d={D.policy.cx_incident_min_churn_subs} step={500} onChange={(v) => set('cx_incident_min_churn_subs', v)} />
            <Num
              label="Red floor: no site turns red below"
              unit="% probability"
              hint="Site Failure Prediction Agent cold-start rule"
              v={Math.round(draft.red_min_probability * 100)}
              d={Math.round(D.policy.red_min_probability * 100)}
              step={5}
              onChange={(v) => set('red_min_probability', Math.max(0, Math.min(100, v)) / 100)}
            />
            <Num label="Owner assignment SLA" unit="hours" v={draft.owner_assignment_sla_hours} d={D.policy.owner_assignment_sla_hours} step={1} onChange={(v) => set('owner_assignment_sla_hours', v)} />
          </div>
          <Impact
            items={[
              [`EXEC queue ${execVisible}`, execVisible !== execNow ? `open incidents (now ${execNow})` : 'open incidents'],
              [`CX queue ${cxVisible}`, cxVisible !== cxNow ? `open incidents (now ${cxNow})` : 'open incidents'],
            ]}
          />
        </Panel>

        <Panel title="Priority score weights">
          <div className="mb-3 border border-line2 bg-canvas px-3 py-2 text-center font-mono text-[12px]">
            score = exposure<sup>{draft.priority_weights.exposure.toFixed(1)}</sup> × probability<sup>{draft.priority_weights.probability.toFixed(1)}</sup> × urgency<sup>{draft.priority_weights.urgency.toFixed(1)}</sup>
          </div>
          <div className="space-y-2.5">
            {(['exposure', 'probability', 'urgency'] as const).map((k) => (
              <div key={k}>
                <div className="flex items-center justify-between text-xs">
                  <span className="capitalize text-muted">{k}</span>
                  <span className="tnum font-semibold">
                    {draft.priority_weights[k].toFixed(1)}
                    {draft.priority_weights[k] !== D.policy.priority_weights[k] && <span className="ml-1 font-normal text-faint">default {D.policy.priority_weights[k].toFixed(1)}</span>}
                  </span>
                </div>
                <input type="range" min={0} max={2} step={0.1} value={draft.priority_weights[k]} onChange={(e) => setW(k, Number(e.target.value))} className="w-full accent-[#FFD100]" />
              </div>
            ))}
          </div>
          <div className="mt-3 border-t border-line pt-2">
            <Label className="mb-1">Top of the queue with these weights</Label>
            {top.map(({ i, s }, k) => {
              const was = rankNow.indexOf(i.incident_id)
              const move = was - k
              return (
                <div key={i.incident_id} className="flex items-center gap-2 py-0.5 text-xs">
                  <span className="tnum w-4 text-faint">{k + 1}</span>
                  <Id>{i.incident_id}</Id>
                  <span className="min-w-0 flex-1 truncate text-muted">{i.title}</span>
                  {move !== 0 && <span className={clsx('tnum text-2xs', move > 0 ? 'text-ok' : 'text-bad')}>{move > 0 ? `▲${move}` : `▼${-move}`}</span>}
                  <span className="tnum w-12 text-right font-semibold">{s.toFixed(1)}</span>
                </div>
              )
            })}
          </div>
        </Panel>
      </div>

      <ColourPanel draft={draft} saved={policy} setT={setT} />

      <Panel pad={false} title="Intervention classes and approvers" right={<span className="text-xs text-faint">Approval Routing Agent applies these on every recommendation</span>}>
        <table className="w-full">
          <thead>
            <tr>
              <Th>Class</Th>
              <Th>Examples</Th>
              <Th>Approver</Th>
              <Th>Roles</Th>
              <Th>Auto-approve</Th>
              <Th>Rule in force</Th>
            </tr>
          </thead>
          <tbody>
            {D.interventionClasses.map((c) => (
              <tr key={c.id} className="align-top">
                <Td className="py-2 font-semibold">{c.label}</Td>
                <Td className="whitespace-normal py-2 text-xs leading-5 text-muted">{c.examples}</Td>
                <Td className="py-2">{c.approver}</Td>
                <Td className="py-2">
                  <span className="flex gap-1">
                    {c.approver_roles.map((r) => (
                      <Badge key={r}>{r}</Badge>
                    ))}
                  </span>
                </Td>
                <Td className="py-2 text-muted">{c.auto}</Td>
                <Td className="whitespace-normal py-2 text-xs text-ink">{ruleFor(c.id, draft)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}

function ruleFor(id: string, p: Policy): string {
  switch (id) {
    case 'noncapex_zero':
      return 'Auto-approved; NOC shift lead reviews post hoc'
    case 'noncapex_opex':
      return `Auto below ${idr(p.opex_auto_approve_below_idr)}; above, Regional Network Manager`
    case 'capex_minor':
      return `≤ ${idr(p.decision_threshold_idr)} Regional Manager (Stage 3); above, Head of Planning`
    case 'capex_major':
      return `Head of Network; CFO co-sign above ${idr(p.cfo_cosign_above_idr)}`
    case 'customer_action':
      return `Auto below ${num(p.customer_auto_approve_below)} customers; above, Head of CX`
    default:
      return ''
  }
}

function diffCount(a: Policy, b: Policy): number {
  let n = 0
  const walk = (x: unknown, y: unknown) => {
    if (typeof x === 'object' && x && typeof y === 'object' && y) {
      for (const k of Object.keys(x)) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k])
    } else if (x !== y) n++
  }
  walk(a, b)
  return n
}

function Field({ label, hint, changed, children }: { label: string; hint?: string; changed: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{label}</span>
        {changed && <span className="h-1.5 w-1.5 rounded-full bg-ioh-yellow" title="Changed from default" />}
      </div>
      {children}
      {hint && <div className="mt-0.5 text-2xs text-faint">{hint}</div>}
    </div>
  )
}

function Idr({ label, hint, v, d, onChange, step = 10 }: { label: string; hint?: string; v: number; d: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Field label={label} hint={hint} changed={v !== d}>
      <div className="flex items-center border border-line2 bg-panel2 focus-within:border-ioh-yellow">
        <span className="pl-2 text-xs text-faint">IDR</span>
        <input type="number" min={0} step={step} value={v / 1e6} onChange={(e) => onChange(Math.max(0, Number(e.target.value)) * 1e6)} className="tnum h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-right text-sm" />
        <span className="pr-2 text-xs text-faint">m</span>
        <span className="tnum border-l border-line2 px-2 text-xs text-muted">{idr(v)}</span>
      </div>
    </Field>
  )
}

function Num({ label, unit, hint, v, d, step, onChange }: { label: string; unit: string; hint?: string; v: number; d: number; step: number; onChange: (v: number) => void }) {
  return (
    <Field label={label} hint={hint} changed={v !== d}>
      <div className="flex items-center border border-line2 bg-panel2 focus-within:border-ioh-yellow">
        <input type="number" min={0} step={step} value={v} onChange={(e) => onChange(Math.max(0, Number(e.target.value)))} className="tnum h-8 min-w-0 flex-1 border-0 bg-transparent px-2 text-right text-sm" />
        <span className="w-[108px] shrink-0 border-l border-line2 px-2 text-xs text-muted">{unit}</span>
      </div>
    </Field>
  )
}

function Impact({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-3 border-t border-line pt-2">
      <Label className="mb-1">Impact with these values</Label>
      {items.map(([a, b]) => (
        <div key={a + b} className="text-xs">
          <span className="tnum font-semibold text-ink">{a}</span> <span className="text-muted">{b}</span>
        </div>
      ))}
    </div>
  )
}

// ---- Colour thresholds with live distribution preview ---------------------------------------
function useLayerValues(): Record<LayerKey, number[]> {
  return useMemo(() => {
    const D = db()
    const N = D.sites.length
    const day = lastDay()
    const health: number[] = []
    const cnx: number[] = []
    const av: number[] = []
    const bad: number[] = []
    const prb: number[] = []
    const fail: number[] = []
    for (let i = 0; i < N; i++) {
      health.push(siteHealth(i, day))
      cnx.push(kpiAt('cnx', i, day))
      av.push(kpiAt('availability', i, day))
      bad.push(kpiAt('bad_session_pct', i, day))
      prb.push(kpiAt('prb_util', i, day))
      fail.push(maxFailureProb(i) * 100)
    }
    return { health, cnx, availability: av, bad_session: bad, prb, failure: fail, link_util: D.links.map((l) => l.util_pct), cache_hit: D.cdn.map((c) => c.cache_hit_pct) }
  }, [])
}

function ColourPanel({ draft, saved, setT }: { draft: Policy; saved: Policy; setT: (k: LayerKey, p: Partial<ColourThreshold>) => void }) {
  const D = db()
  const vals = useLayerValues()
  const keys = Object.keys(draft.colour_thresholds) as LayerKey[]
  return (
    <Panel
      pad={false}
      title="Colour thresholds per map layer"
      right={
        <span className="flex items-center gap-3 text-xs text-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2" style={{ background: STATUS.ok }} /> within threshold
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2" style={{ background: STATUS.warn }} /> at risk
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2" style={{ background: STATUS.bad }} /> breached
          </span>
          <span>· saving recolours the map live</span>
          <Fresh f="D-1" />
        </span>
      }
    >
      <table className="w-full">
        <thead>
          <tr>
            <Th>Layer</Th>
            <Th>Direction</Th>
            <Th className="w-[130px]">Green from</Th>
            <Th className="w-[130px]">Amber from</Th>
            <Th className="w-[34%]">Distribution today with these thresholds</Th>
            <Th className="text-right">Green</Th>
            <Th className="text-right">Amber</Th>
            <Th className="text-right">Red</Th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const t = draft.colour_thresholds[k]
            const s0 = saved.colour_thresholds[k]
            const m = LAYER_META[k]
            const c = [0, 0, 0]
            for (const v of vals[k]) {
              const st = statusOf(v, t)
              if (st >= 0) c[st]++
            }
            const tot = c[0] + c[1] + c[2] || 1
            const changed = t.green !== s0.green || t.amber !== s0.amber
            const dflt = D.policy.colour_thresholds[k]
            const invalid = t.dir === 'high' ? t.green < t.amber : t.green > t.amber
            return (
              <tr key={k}>
                <Td>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{m.label}</span>
                    {changed && <Badge tone="yellow">unsaved</Badge>}
                  </div>
                  <div className="text-2xs text-faint">{m.source}</div>
                </Td>
                <Td className="text-xs text-muted">{t.dir === 'high' ? 'Higher is better' : 'Lower is better'}</Td>
                <Td>
                  <ThInput v={t.green} step={m.step} unit={m.unit} onChange={(v) => setT(k, { green: v })} dirty={t.green !== dflt.green} op={t.dir === 'high' ? '≥' : '<'} />
                </Td>
                <Td>
                  <ThInput v={t.amber} step={m.step} unit={m.unit} onChange={(v) => setT(k, { amber: v })} dirty={t.amber !== dflt.amber} op={t.dir === 'high' ? '≥' : '<'} />
                </Td>
                <Td>
                  {invalid ? (
                    <span className="text-xs text-bad">Green must be {t.dir === 'high' ? 'above' : 'below'} amber</span>
                  ) : (
                    <div className="flex h-3 w-full">
                      <div style={{ width: `${(c[0] / tot) * 100}%`, background: STATUS.ok }} />
                      <div style={{ width: `${(c[1] / tot) * 100}%`, background: STATUS.warn }} />
                      <div style={{ width: `${(c[2] / tot) * 100}%`, background: STATUS.bad }} />
                    </div>
                  )}
                </Td>
                <Td className="tnum text-right text-ok">{num(c[0])}</Td>
                <Td className="tnum text-right text-warn">{num(c[1])}</Td>
                <Td className="tnum text-right text-bad">{num(c[2])}</Td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="border-t border-line px-4 py-2 text-xs text-faint">
        Counts are sites (links and PoPs for backbone and CDN) at D-1. Predicted-failure red additionally requires the red floor ({Math.round(draft.red_min_probability * 100)}%).
      </div>
    </Panel>
  )
}

function ThInput({ v, step, unit, onChange, dirty, op }: { v: number; step: number; unit: string; onChange: (v: number) => void; dirty: boolean; op: string }) {
  return (
    <div className={clsx('flex h-7 items-center border bg-panel2 focus-within:border-ioh-yellow', dirty ? 'border-ioh-yellow/50' : 'border-line2')}>
      <span className="pl-2 text-xs text-faint">{op}</span>
      <input type="number" step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="tnum h-full min-w-0 flex-1 border-0 bg-transparent px-1.5 text-right text-sm" />
      <span className="pr-2 text-2xs text-faint">{unit}</span>
    </div>
  )
}
