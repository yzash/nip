import clsx from 'clsx'
import { BadgeCheck, FileSignature, Fingerprint, UserCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Id, Seg, Th } from '@/components/ui'
import { AGENTS, STAGES, type Readiness, type Stage } from '../content/agents'
import { PHASE1, WORKSTREAMS } from '../content/golive'
import { CLASSES, CLASS_META, useP1 } from '../model'
import { DependencyGraph } from './howitworks/DepGraph'
import { LayerDiagram } from './howitworks/Layers'
import { PipelineDiagram } from './howitworks/Pipeline'
import { DailyTimeline } from './howitworks/Timeline'
import { AGENT_BY_ID, CRITICAL_PATH, ClassDots, PageHead, READINESS_COLOR, READINESS_TEXT, ReadinessTag, Section, Stat, shortName } from './howitworks/shared'

const count = (r: Readiness) => AGENTS.filter((a) => a.readiness === r).length
const DRAFT_ONLY = AGENTS.filter((a) => a.guardrails.some((g) => /draft only|proposal only|soft until/i.test(g)))
const GATED = AGENTS.filter((a) => !/^None/.test(a.humanGate))

export function AgentsPage() {
  const nav = useNavigate()
  const p1 = useP1()
  const [stage, setStage] = useState<Stage | 'all'>('all')
  const [ready, setReady] = useState<Readiness | 'all'>('all')
  const [cls, setCls] = useState<string>('all')
  const totalWeeks = AGENTS.reduce((s, a) => s + a.buildWeeks, 0)
  const ws2 = WORKSTREAMS.find((w) => w.id === 'WS2')!
  const ws3 = WORKSTREAMS.find((w) => w.id === 'WS3')!

  const rows = useMemo(
    () =>
      AGENTS.filter((a) => (stage === 'all' || a.stage === stage) && (ready === 'all' || a.readiness === ready) && (cls === 'all' || a.classes.includes(cls) || a.classes.includes('all'))),
    [stage, ready, cls],
  )
  const rowWeeks = rows.reduce((s, a) => s + a.buildWeeks, 0)

  const rules = [
    {
      icon: Fingerprint,
      title: 'One agent, one job, one owner',
      text: `${AGENTS.length} agents, each with a single output and a named owning team. When a number looks wrong, everyone knows whose it is.`,
    },
    {
      icon: UserCheck,
      title: 'No agent both recommends and approves',
      text: 'The Action Ladder recommends; the Approval Routing Agent only names the approver from the IOH DoA matrix. The decision is always a person’s.',
    },
    {
      icon: FileSignature,
      title: 'Agents that touch money draft, never execute',
      text: `${DRAFT_ONLY.map((a) => shortName(a)).join(', ')}: draft or propose only. PO release, vendor commitment and tower company requests stay with people.`,
    },
    {
      icon: BadgeCheck,
      title: 'Every output carries confidence, evidence and as-of date',
      text: 'Each API response has meta.confidence, meta.evidence[] and meta.as_of; the planner shows the data age next to every number (D-1, D-5).',
    },
  ]

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        <PageHead
          kicker={`${PHASE1.name} · How it works · Agent architecture`}
          title={`${AGENTS.length} agents run the Predictive Planner: ${count('Exists')} exists today, ${count('Extend')} extended, ${count('Build')} built on Netra. Agents recommend and draft; people approve.`}
          right={
            <div className="border border-line bg-panel px-4 py-2.5 text-right">
              <div className="text-2xs uppercase tracking-wider text-faint">Build effort</div>
              <div className="tnum text-xl font-semibold text-ioh-yellow">{totalWeeks} agent-weeks</div>
              <div className="text-[10.5px] text-faint">inside the {PHASE1.weeks}-week go-live</div>
            </div>
          }
        >
          Sense and Predict agents run on the nightly Netra batch and have the forecast ready by 06:00 WIB. Decide and Plan agents run when a planner builds a plan, and they produce drafts. A named approver decides. Only then are the BOQ and PO drafts handed to ERP, the PMO, the warehouse, vendors and tower companies, and every override goes back to Netra as training data.
        </PageHead>

        {/* summary strip */}
        <div className="mt-5 grid grid-cols-6 divide-x divide-line border border-line bg-panel">
          <Stat label="Agents" value={AGENTS.length} sub={`${STAGES.length} stages · ${STAGES.map((s) => AGENTS.filter((a) => a.stage === s.id).length).join(' · ')}`} />
          <Stat label="Exist today" value={<span style={{ color: READINESS_COLOR.Exists }}>{count('Exists')}</span>} sub="Smart CapEx, consumed as-is" />
          <Stat label="Extended" value={<span style={{ color: READINESS_COLOR.Extend }}>{count('Extend')}</span>} sub="Capacity Exhaustion" />
          <Stat label="Built on Netra" value={<span style={{ color: READINESS_COLOR.Build }}>{count('Build')}</span>} sub="no external model vendor" />
          <Stat label="With a human gate" value={GATED.length} sub={`${AGENTS.length - GATED.length} run automatically (signals only)`} />
          <Stat label="Draft or propose only" value={DRAFT_ONLY.length} sub="every agent that touches money" />
        </div>

        {/* pipeline */}
        <Section
          className="mt-5"
          title="From prediction to approved plan"
          sub="Click any agent to open its specification. Colour shows readiness."
          right={
            <div className="flex items-center gap-4 text-[11px] text-muted">
              {(['Exists', 'Extend', 'Build'] as Readiness[]).map((r) => (
                <span key={r} className="flex items-center gap-1.5" title={READINESS_TEXT[r]}>
                  <span className="h-3 w-1" style={{ background: READINESS_COLOR[r] }} /> {r}
                </span>
              ))}
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rotate-45 border border-ioh-yellow" /> Human gate
              </span>
            </div>
          }
        >
          <div className="px-4 py-4">
            <PipelineDiagram />
          </div>
        </Section>

        {/* design rules */}
        <div className="mt-5 grid grid-cols-4 gap-px border border-line bg-line">
          {rules.map((r) => (
            <div key={r.title} className="bg-panel p-4">
              <div className="flex items-center gap-2">
                <r.icon size={16} className="shrink-0 text-ioh-yellow" />
                <div className="text-sm font-semibold">{r.title}</div>
              </div>
              <div className="mt-1.5 text-xs leading-[17px] text-muted">{r.text}</div>
            </div>
          ))}
        </div>
        <div className="mt-1 text-right text-[10.5px] text-faint">Design rules from PRD §7, enforced as guardrails in each agent specification</div>

        {/* layers */}
        <Section
          className="mt-4"
          title="Layered architecture"
          sub="NICC sits above Netra and below the people. Netra owns data, models and agent runtime; NICC owns workflow, approvals, audit and the interface. Systems of record stay where they are."
        >
          <div className="px-4 py-4">
            <LayerDiagram />
          </div>
        </Section>

        {/* daily run */}
        <Section className="mt-5" title="Daily run · 01:00 → 23:00 WIB" sub="The forecast is rebuilt every night on D-1 data, so planners start every day on fresh numbers.">
          <DailyTimeline />
        </Section>

        {/* dependency graph */}
        <Section
          className="mt-5"
          title="Dependencies · trace any agent"
          sub="Hover to preview, click to pin, double-click to open. Upstream agents and the data they read are blue; downstream agents are yellow."
          right={
            <div className="flex items-center gap-4 text-[11px] text-muted">
              <span className="flex items-center gap-1.5">
                <span className="h-px w-5 bg-[#5AA9E6]" /> upstream
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-px w-5 bg-ioh-yellow" /> downstream
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-5 border-t border-dashed border-[#5AA9E6]" /> via feature catalog
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-ok" />
                <span className="h-2 w-2 rounded-full bg-warn" />
                <span className="h-2 w-2 rounded-full bg-bad" /> on / partial / not on Netra
              </span>
            </div>
          }
        >
          <div className="px-4 py-4">
            <DependencyGraph p1={p1} />
          </div>
        </Section>

        {/* catalogue */}
        <Section
          className="mt-5"
          title="Agent catalogue"
          sub="Click a row for the business view and the technical contract."
          right={
            <>
              <Seg options={[{ id: 'all' as const, label: 'All stages' }, ...STAGES.map((s) => ({ id: s.id, label: s.id }))]} value={stage} onChange={setStage} />
              <Seg options={[{ id: 'all' as const, label: 'All' }, { id: 'Exists' as const, label: 'Exists' }, { id: 'Extend' as const, label: 'Extend' }, { id: 'Build' as const, label: 'Build' }]} value={ready} onChange={setReady} />
              <Seg options={[{ id: 'all', label: 'All classes' }, ...CLASSES.map((c) => ({ id: c as string, label: CLASS_META[c].short }))]} value={cls} onChange={setCls} />
            </>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1180px] table-fixed">
              <colgroup>
                <col className="w-[210px]" />
                <col className="w-[78px]" />
                <col className="w-[86px]" />
                <col className="w-[150px]" />
                <col />
                <col className="w-[210px]" />
                <col className="w-[170px]" />
                <col className="w-[56px]" />
                <col className="w-[108px]" />
              </colgroup>
              <thead>
                <tr>
                  <Th>Agent</Th>
                  <Th>Stage</Th>
                  <Th>Readiness</Th>
                  <Th>Owner</Th>
                  <Th>What it does</Th>
                  <Th>Human gate</Th>
                  <Th>Schedule · SLA</Th>
                  <Th className="text-right">Wks</Th>
                  <Th>Classes</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id} onClick={() => nav(`/phase1/agents/${a.id}`)} className="cursor-pointer align-top hover:bg-panel2">
                    <td className="border-b border-line/70 px-3 align-top text-sm py-2">
                      <div className="font-semibold leading-4">{a.name}</div>
                      <Id className="text-[11px]">{a.id}</Id>
                    </td>
                    <td className="border-b border-line/70 px-3 align-top text-sm py-2 text-muted">{a.stage}</td>
                    <td className="border-b border-line/70 px-3 align-top text-sm py-2">
                      <ReadinessTag r={a.readiness} />
                    </td>
                    <td className="border-b border-line/70 px-3 align-top text-sm py-2 text-xs text-muted">{a.owner}</td>
                    <td className="border-b border-line/70 px-3 align-top text-sm py-2 text-xs leading-4">{a.oneLiner}</td>
                    <td className={clsx('border-b border-line/70 px-3 py-2 align-top text-xs leading-4', /^None/.test(a.humanGate) ? 'text-faint' : 'text-muted')}>{a.humanGate}</td>
                    <td className="border-b border-line/70 px-3 align-top text-sm py-2 text-xs leading-4 text-muted">
                      <div className="text-ink">{a.schedule}</div>
                      <div className="text-faint">{a.sla}</div>
                    </td>
                    <td className="border-b border-line/70 px-3 align-top text-sm tnum py-2 text-right font-semibold">{a.buildWeeks}</td>
                    <td className="border-b border-line/70 px-3 align-top text-sm py-2">
                      <ClassDots classes={a.classes} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] gap-6 border-t border-line px-4 py-3 text-xs">
            <div>
              <span className="text-faint">Showing</span> <span className="tnum font-semibold">{rows.length}</span> <span className="text-faint">of {AGENTS.length} agents ·</span> <span className="tnum font-semibold">{rowWeeks}</span>{' '}
              <span className="text-faint">of {totalWeeks} agent-weeks of build effort</span>
            </div>
            <div className="text-muted">
              <span className="font-semibold text-ink">Critical path.</span>{' '}
              {CRITICAL_PATH.path.map((id, i) => (
                <span key={id}>
                  {i > 0 && <span className="text-faint"> → </span>}
                  <button onClick={() => nav(`/phase1/agents/${id}`)} className="hover:text-ioh-yellow">
                    {shortName(AGENT_BY_ID.get(id)!)}
                  </button>
                </span>
              ))}{' '}
              is the longest dependency chain: <span className="tnum font-semibold text-ink">{CRITICAL_PATH.weeks} build-weeks</span> if built one after another. The plan overlaps it inside {PHASE1.weeks} weeks ({ws2.id} weeks {ws2.start}–{ws2.end}, {ws3.id} weeks {ws3.start}–{ws3.end}) by building each agent against the data contracts signed in week 2, with Feature Builder and the Site Failure Prediction Agent as the true gating items.
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}
