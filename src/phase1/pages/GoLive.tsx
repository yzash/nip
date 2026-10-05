import clsx from 'clsx'
import { Printer, Square } from 'lucide-react'
import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import type { FailureClass } from '@/data/types'
import { CLASS_GATES, EXIT_CRITERIA, HANDOFFS, MILESTONES, NFRS, OPEN_QUESTIONS, PHASE1, RACI, RISKS, WORKSTREAMS, type GateStatus } from '../content/golive'
import { CLASS_META, useP1 } from '../model'
import { PageHead, SOURCE_BY_ID, Section, Stat, StatusDot } from './howitworks/shared'

const GATE_LABEL: Record<GateStatus, string> = { drives_approvals: 'Drives approvals', advisory: 'Advisory', shadow: 'Shadow mode' }
const GATE_TONE: Record<GateStatus, string> = { drives_approvals: 'text-ok border-ok/40 bg-ok/10', advisory: 'text-warn border-warn/40 bg-warn/10', shadow: 'text-muted border-line2' }
const LABEL_W = 250

// Scoped print styles: a light, paginated handout. Only applies while this page is mounted.
const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 9mm; }
  html, body, #root { height: auto !important; overflow: visible !important; background: #fff !important; }
  *:has(.gl-root) { height: auto !important; overflow: visible !important; display: block !important; position: static !important; }
  .gl-root { position: static !important; overflow: visible !important; inset: auto !important; }
  .gl-root .gl-wrap { max-width: none !important; padding: 0 !important; zoom: 0.8; }
  .gl-root, .gl-root * { color: #14161a !important; border-color: #cfd3da !important; box-shadow: none !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .gl-root .bg-panel, .gl-root .bg-panel2, .gl-root .bg-canvas { background: #fff !important; }
  .gl-root .bg-line { background: #cfd3da !important; }
  .gl-root .gl-bar { background: #eef0f4 !important; border-color: #9aa1ad !important; }
  .gl-root .gl-ms { background: #14161a !important; }
  .gl-root .gl-msline { border-color: #9aa1ad !important; }
  .gl-root .text-ok { color: #11803d !important; }
  .gl-root .text-warn { color: #a66300 !important; }
  .gl-root .text-faint, .gl-root .text-muted { color: #4b5160 !important; }
  .gl-root .gl-accent { color: #8a6d00 !important; }
  .gl-root section, .gl-root .gl-keep { break-inside: avoid; }
  .gl-root .gl-break { break-before: page; }
  .gl-root h1 { font-size: 18px !important; line-height: 23px !important; }
  .gl-root .no-print { display: none !important; }
}
`

export function GoLivePage() {
  const p1 = useP1()
  const nGate = (g: GateStatus) => CLASS_GATES.filter((x) => x.gateAtGoLive === g).length

  return (
    <div className="gl-root absolute inset-0 overflow-y-auto">
      <style>{PRINT_CSS}</style>
      <div className="gl-wrap mx-auto max-w-[1440px] px-6 py-5">
        <PageHead
          kicker={`${PHASE1.name} · Go-live plan`}
          title={`Live on Netra data in ${PHASE1.weeks} weeks, all five failure classes, ending at an approved plan with BOQ and PO drafts handed off.`}
          right={
            <button onClick={() => window.print()} className="no-print inline-flex h-8 items-center gap-1.5 border border-line2 bg-panel2 px-3 text-sm font-semibold hover:border-muted">
              <Printer size={14} /> Print / save PDF
            </button>
          }
        >
          <span className="text-ink">Outcome: </span>
          {PHASE1.outcome}
          <br />
          <span className="text-ink">Boundary: </span>
          {PHASE1.boundary}
        </PageHead>

        <div className="gl-keep mt-5 grid grid-cols-6 divide-x divide-line border border-line bg-panel">
          <Stat label="Duration" value={`${PHASE1.weeks} weeks`} sub="from data contracts to hypercare" />
          <Stat label="Workstreams" value={WORKSTREAMS.length} sub="IOH, Netra and DevX leads" />
          <Stat label="Milestones" value={MILESTONES.length} sub={`first gate in week ${MILESTONES[0].week}`} />
          <Stat label="Exit criteria" value={EXIT_CRITERIA.length} sub="all met before go-live" />
          <Stat label="Classes at go-live" value={`${nGate('drives_approvals')} · ${nGate('advisory')} · ${nGate('shadow')}`} sub="drive approvals · advisory · shadow" />
          <Stat label="Hand-off interfaces" value={HANDOFFS.length} sub="drafts only; execution stays in ERP" />
        </div>

        <Gantt />

        <Section className="mt-5" title="Class gate plan" sub="Every class is in the product at go-live; whether it drives approvals depends on its precision gate">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[170px]" />
              <col className="w-[200px]" />
              <col />
              <col className="w-[150px]" />
              <col />
              <col className="w-[230px]" />
            </colgroup>
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                <th className="px-4 py-2 font-semibold">Class</th>
                <th className="px-3 py-2 font-semibold">Back-test vs 70% gate</th>
                <th className="px-3 py-2 font-semibold">Today</th>
                <th className="px-3 py-2 font-semibold">At go-live</th>
                <th className="px-3 py-2 font-semibold">What clears the gate</th>
                <th className="px-4 py-2 font-semibold">Depends on</th>
              </tr>
            </thead>
            <tbody>
              {CLASS_GATES.map((g) => {
                const meta = CLASS_META[g.cls as FailureClass]
                const prec = p1?.models.find((m) => m.failure_class === g.cls)?.precision_top_decile ?? 0
                return (
                  <tr key={g.cls} className="border-t border-line/70 align-top">
                    <td className="px-4 py-2.5">
                      <Link to={`/phase1/models?class=${g.cls}`} className="flex items-center gap-2 font-semibold hover:text-ioh-yellow">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                        {g.label}
                      </Link>
                      <div className="pl-[18px] text-[11px] text-faint">
                        Wave {meta.wave} · {meta.horizon}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <div className="gl-bar relative h-2 w-28 bg-line">
                          <div className="h-full" style={{ width: `${prec * 100}%`, background: prec >= 0.7 ? '#2ECC71' : prec >= 0.6 ? '#F5A623' : '#FF3B3B' }} />
                          <div className="gl-ms absolute -top-1 h-4 w-px bg-ioh-yellow" style={{ left: '70%' }} />
                        </div>
                        <span className="tnum font-semibold">{Math.round(prec * 100)}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted">{g.today}</td>
                    <td className="px-3 py-2.5">
                      <span className={clsx('inline-flex h-5 items-center whitespace-nowrap border px-1.5 text-2xs font-semibold uppercase tracking-wide', GATE_TONE[g.gateAtGoLive])}>{GATE_LABEL[g.gateAtGoLive]}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{g.toClear}</td>
                    <td className="px-4 py-2.5">
                      <div className="space-y-0.5">
                        {g.blockingSources.map((id) => {
                          const s = SOURCE_BY_ID.get(id)
                          return s ? (
                            <Link key={id} to={`/phase1/data?source=${id}#catalog`} className="flex items-center gap-1.5 text-xs text-muted hover:text-ink">
                              <StatusDot s={s.status} /> {s.name}
                            </Link>
                          ) : null
                        })}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Section>

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
          <Section title="Exit criteria" sub="All must hold in the last 4 weeks of UAT before go-live">
            <ul className="divide-y divide-line/70">
              {EXIT_CRITERIA.map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2">
                  <Square size={14} className="mt-0.5 shrink-0 text-faint" />
                  <span className="w-8 shrink-0 font-mono text-[11.5px] text-faint">{e.id}</span>
                  <span className="flex-1 text-sm">{e.text}</span>
                  <span className="shrink-0 text-[11px] text-faint">{e.metric}</span>
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Non-functional requirements" sub="Phase 1 targets">
            <ul className="divide-y divide-line/70">
              {NFRS.map((n) => (
                <li key={n.area} className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 px-4 py-2">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-faint">{n.area}</span>
                  <span className="text-sm">{n.text}</span>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        <Section className="gl-break mt-5" title="Hand-off interfaces" sub="What leaves the Planner after approval, and who acknowledges it. Drafts only in Phase 1.">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[230px]" />
              <col className="w-[130px]" />
              <col className="w-[230px]" />
              <col className="w-[170px]" />
              <col className="w-[210px]" />
              <col />
            </colgroup>
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                <th className="px-4 py-2 font-semibold">Interface</th>
                <th className="px-3 py-2 font-semibold">Owner</th>
                <th className="px-3 py-2 font-semibold">Method</th>
                <th className="px-3 py-2 font-semibold">Trigger</th>
                <th className="px-3 py-2 font-semibold">Acknowledgement</th>
                <th className="px-4 py-2 font-semibold">Fields</th>
              </tr>
            </thead>
            <tbody>
              {HANDOFFS.map((h) => (
                <tr key={h.id} className="border-t border-line/70 align-top">
                  <td className="px-4 py-2.5">
                    <div className="font-semibold">{h.target}</div>
                    <div className="font-mono text-[11px] text-faint">{h.id}</div>
                  </td>
                  <td className="px-3 py-2.5 text-xs text-muted">{h.owner}</td>
                  <td className="px-3 py-2.5 text-xs">{h.method}</td>
                  <td className="px-3 py-2.5 text-xs text-muted">{h.trigger}</td>
                  <td className="px-3 py-2.5 text-xs text-muted">{h.ack}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-[11px] leading-[17px] text-muted">{h.fields.join(', ')}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section className="mt-5" title="RACI" sub="Responsible · Accountable · Consulted · Informed">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[260px]" />
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                <th className="px-4 py-2 font-semibold">Activity</th>
                {[
                  ['R', 'Responsible'],
                  ['A', 'Accountable'],
                  ['C', 'Consulted'],
                  ['I', 'Informed'],
                ].map(([k, l]) => (
                  <th key={k} className="px-3 py-2 font-semibold">
                    <span className={clsx('mr-1.5 inline-flex h-4 w-4 items-center justify-center border font-mono text-[10px]', k === 'A' ? 'gl-accent border-ioh-yellow text-ioh-yellow' : 'border-line2 text-muted')}>{k}</span>
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {RACI.map((r) => (
                <tr key={r.activity} className="border-t border-line/70 align-top">
                  <td className="px-4 py-2 font-medium">{r.activity}</td>
                  <td className="px-3 py-2 text-xs">{r.R}</td>
                  <td className="gl-accent px-3 py-2 text-xs font-semibold text-ioh-yellow">{r.A}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.C}</td>
                  <td className="px-3 py-2 text-xs text-faint">{r.I}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section className="mt-5" title="Risks and mitigations">
          <table className="w-full table-fixed text-sm">
            <colgroup>
              <col className="w-[300px]" />
              <col className="w-[260px]" />
              <col />
              <col className="w-[190px]" />
            </colgroup>
            <thead>
              <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                <th className="px-4 py-2 font-semibold">Risk</th>
                <th className="px-3 py-2 font-semibold">Impact</th>
                <th className="px-3 py-2 font-semibold">Mitigation</th>
                <th className="px-4 py-2 font-semibold">Owner</th>
              </tr>
            </thead>
            <tbody>
              {RISKS.map((r) => (
                <tr key={r.risk} className="border-t border-line/70 align-top">
                  <td className="px-4 py-2 font-medium">{r.risk}</td>
                  <td className="px-3 py-2 text-xs text-warn">{r.impact}</td>
                  <td className="px-3 py-2 text-xs">{r.mitigation}</td>
                  <td className="px-4 py-2 text-xs text-muted">{r.owner}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section className="mt-5" title="Open questions for IOH" sub="To answer in the validation session; each one changes scope, owners or dates">
          <ol className="grid grid-cols-2 gap-x-8 gap-y-2 px-4 py-3">
            {OPEN_QUESTIONS.map((q, i) => (
              <li key={q} className="flex items-start gap-3 text-sm">
                <span className="gl-accent tnum mt-px w-5 shrink-0 font-mono text-[12px] font-semibold text-ioh-yellow">Q{i + 1}</span>
                <span>{q}</span>
              </li>
            ))}
          </ol>
        </Section>

        <div className="mt-4 text-[11px] text-faint">Durations and owners are DevX’s proposal for agreement with IOH. Prepared for the IOH Head of Network, Head of Planning and the Netra data team.</div>
      </div>
    </div>
  )
}

// ---- Gantt ---------------------------------------------------------------------------------------
function Gantt() {
  const weeks = Array.from({ length: PHASE1.weeks }, (_, i) => i + 1)
  const pos = (w: number) => `calc(${LABEL_W}px + (100% - ${LABEL_W}px) * ${w / PHASE1.weeks})`
  return (
    <Section className="mt-5" title={`Plan · ${PHASE1.weeks} weeks, ${WORKSTREAMS.length} workstreams`} sub="Bars show each workstream’s weeks; diamonds are milestone gates at the end of their week">
      <div className="relative px-4 pb-3 pt-2">
        {/* milestone guide lines */}
        <div className="pointer-events-none absolute inset-y-0 left-4 right-4">
          {MILESTONES.map((m) => (
            <div key={m.week} className="gl-msline absolute bottom-[96px] top-10 border-l border-dashed border-ioh-yellow/20" style={{ left: pos(m.week) }} />
          ))}
        </div>
        <div className="grid" style={{ gridTemplateColumns: `${LABEL_W}px repeat(${PHASE1.weeks}, minmax(0, 1fr))` }}>
          {/* header */}
          <div className="h-8 text-2xs font-semibold uppercase leading-8 tracking-wider text-faint">Workstream · lead</div>
          {weeks.map((w) => (
            <div key={w} className="tnum h-8 border-l border-line/60 text-center font-mono text-[11px] leading-8 text-faint">
              {w}
            </div>
          ))}
          {WORKSTREAMS.map((ws) => (
            <Fragment key={ws.id}>
              <div className="gl-keep border-t border-line/70 py-2 pr-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[11px] text-ioh-yellow">{ws.id}</span>
                  <span className="text-sm font-semibold">{ws.name}</span>
                </div>
                <div className="text-[11px] text-faint">{ws.lead}</div>
              </div>
              <div className="relative border-t border-line/70 py-2" style={{ gridColumn: `2 / span ${PHASE1.weeks}` }}>
                <div className="relative" style={{ marginLeft: `${((ws.start - 1) / PHASE1.weeks) * 100}%`, width: `${((ws.end - ws.start + 1) / PHASE1.weeks) * 100}%` }}>
                  <div className="gl-bar flex h-6 items-center justify-between border border-line2 bg-panel2 px-2">
                    <span className="tnum font-mono text-[11px] text-muted">
                      wk {ws.start}–{ws.end}
                    </span>
                    <span className="tnum text-[11px] text-faint">{ws.end - ws.start + 1} wks</span>
                  </div>
                  <div className="mt-1 text-[11px] leading-[15px] text-muted">{ws.deliverables.join(' · ')}</div>
                </div>
              </div>
            </Fragment>
          ))}
          {/* milestones row */}
          <div className="border-t border-line py-2 text-2xs font-semibold uppercase tracking-wider text-faint">Milestones</div>
          <div className="relative h-[84px] border-t border-line" style={{ gridColumn: `2 / span ${PHASE1.weeks}` }}>
            {MILESTONES.map((m, i) => {
              const last = i === MILESTONES.length - 1
              return (
                <div key={m.week} className="absolute top-2" style={{ left: `${(m.week / PHASE1.weeks) * 100}%` }} title={m.gate}>
                  <div className="gl-ms absolute -left-[6px] top-0 h-3 w-3 rotate-45 bg-ioh-yellow" />
                  {i % 2 === 1 && <div className="gl-msline absolute left-0 top-3 h-[22px] border-l border-line2" />}
                  <div className={clsx('absolute whitespace-nowrap text-[11px] leading-[14px]', i % 2 === 1 ? 'top-[36px]' : 'top-4', last ? 'right-0 text-right' : '-translate-x-1/2 text-center')}>
                    <div className="tnum font-mono text-faint">wk {m.week}</div>
                    <div className="font-semibold">{m.name}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-6 gap-px border-t border-line bg-line">
        {MILESTONES.map((m) => (
          <div key={m.week} className="bg-panel px-3 py-2">
            <div className="flex items-center gap-1.5">
              <span className="gl-ms h-2 w-2 rotate-45 bg-ioh-yellow" />
              <span className="tnum font-mono text-[11px] text-faint">Week {m.week}</span>
            </div>
            <div className="text-xs font-semibold">{m.name}</div>
            <div className="text-[11px] leading-[15px] text-muted">{m.gate}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}
