import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Check, ChevronLeft, ChevronRight, CircleDot, LifeBuoy, ShieldCheck, UserCheck, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Id, Seg, Tabs } from '@/components/ui'
import type { FailureClass } from '@/data/types'
import { AGENTS, STAGES, type AgentSpec } from '../content/agents'
import { STATUS_LABEL } from '../content/sources'
import { CLASS_META, useP1 } from '../model'
import { FeatureCatalog } from './howitworks/FeatureCatalog'
import {
  AGENT_BY_ID,
  ClassDots,
  CritTag,
  DOWNSTREAM,
  KV,
  READINESS_COLOR,
  READINESS_TEXT,
  ReadinessTag,
  SOURCE_BY_ID,
  Section,
  StatusDot,
  StatusTag,
  agentDeps,
  agentSourceMap,
  exampleObject,
  fieldType,
  fillEndpoint,
  parseFields,
  shortName,
} from './howitworks/shared'

type Tab = 'business' | 'technical'

export function AgentDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const p1 = useP1()
  const [tab, setTab] = useState<Tab>('business')
  const a = AGENT_BY_ID.get(id)
  const idx = AGENTS.findIndex((x) => x.id === id)

  if (!a)
    return (
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto max-w-[1440px] px-6 py-10 text-sm text-muted">
          No agent <Id>{id}</Id>.{' '}
          <Link to="/phase1/agents" className="text-ioh-yellow">
            Back to the agent architecture
          </Link>
        </div>
      </div>
    )

  const prev = AGENTS[(idx - 1 + AGENTS.length) % AGENTS.length]
  const next = AGENTS[(idx + 1) % AGENTS.length]
  const ups = agentDeps(a)
  const downs = DOWNSTREAM.get(a.id) ?? []
  const stage = STAGES.find((s) => s.id === a.stage)!
  const gated = !/^None/.test(a.humanGate)

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto max-w-[1440px] px-6 py-5">
        {/* nav */}
        <div className="flex items-center justify-between text-xs">
          <button onClick={() => nav('/phase1/agents')} className="inline-flex items-center gap-1.5 text-muted hover:text-ink">
            <ArrowLeft size={13} /> Agent architecture
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => nav(`/phase1/agents/${prev.id}`)} className="inline-flex h-7 items-center gap-1 border border-line2 px-2 text-muted hover:text-ink">
              <ChevronLeft size={13} /> {shortName(prev)}
            </button>
            <span className="tnum px-2 text-faint">
              {idx + 1} / {AGENTS.length}
            </span>
            <button onClick={() => nav(`/phase1/agents/${next.id}`)} className="inline-flex h-7 items-center gap-1 border border-line2 px-2 text-muted hover:text-ink">
              {shortName(next)} <ChevronRight size={13} />
            </button>
          </div>
        </div>

        {/* headline */}
        <div className="mt-3 flex items-start justify-between gap-6">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">
              <span>
                Stage {STAGES.indexOf(stage) + 1} · {stage.label}
              </span>
              <span className="font-mono normal-case tracking-normal text-faint">{a.id}</span>
            </div>
            <h1 className="mt-1 flex items-center gap-3 text-[22px] font-semibold leading-7">
              {a.name} <ReadinessTag r={a.readiness} />
            </h1>
            <p className="mt-1.5 max-w-[920px] text-[15px] leading-6 text-ink">{a.oneLiner}</p>
            <p className="mt-1 max-w-[920px] text-sm text-muted">{a.business}</p>
          </div>
          <div className="grid shrink-0 grid-cols-3 divide-x divide-line border border-line bg-panel">
            <div className="px-4 py-2.5">
              <div className="text-2xs uppercase tracking-wider text-faint">Owner</div>
              <div className="mt-0.5 max-w-[190px] text-sm font-semibold leading-5">{a.owner}</div>
            </div>
            <div className="px-4 py-2.5">
              <div className="text-2xs uppercase tracking-wider text-faint">Build</div>
              <div className="tnum mt-0.5 text-xl font-semibold" style={{ color: READINESS_COLOR[a.readiness] }}>
                {a.buildWeeks} wk{a.buildWeeks > 1 ? 's' : ''}
              </div>
            </div>
            <div className="px-4 py-2.5">
              <div className="text-2xs uppercase tracking-wider text-faint">Runs</div>
              <div className="mt-0.5 max-w-[170px] text-sm font-semibold leading-5">{a.schedule}</div>
            </div>
          </div>
        </div>

        {/* position in the chain */}
        <div className="mt-4 flex items-stretch border border-line bg-panel">
          <FlowCol label={`Upstream · ${ups.length}`} empty={a.inputs.some((i) => i.ref === 'user') ? 'People input (policy, reason codes)' : 'Reads Netra data directly'} ids={ups} />
          <div className="flex items-center px-2 text-faint">
            <ArrowRight size={16} />
          </div>
          <div className="flex min-w-[260px] flex-col justify-center border-x border-line bg-[#2A2410]/60 px-4 py-2.5">
            <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">This agent</div>
            <div className="text-sm font-semibold">{shortName(a)}</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">{a.outputs.map((o) => o.name).join(' · ')}</div>
          </div>
          <div className="flex items-center px-2 text-faint">
            <ArrowRight size={16} />
          </div>
          <FlowCol label={`Downstream · ${downs.length}`} empty={gated ? 'A person decides' : 'Read by people in the Planner'} ids={downs} />
          <div className={clsx('flex min-w-[240px] max-w-[340px] items-start gap-2 border-l border-line px-4 py-2.5', gated ? 'bg-ioh-yellow/5' : '')}>
            <UserCheck size={16} className={clsx('mt-0.5 shrink-0', gated ? 'text-ioh-yellow' : 'text-faint')} />
            <div>
              <div className={clsx('text-2xs font-semibold uppercase tracking-wider', gated ? 'text-ioh-yellow' : 'text-faint')}>{gated ? 'Human gate' : 'Runs automatically'}</div>
              <div className="text-xs leading-4 text-muted">{a.humanGate}</div>
            </div>
          </div>
        </div>

        <Tabs
          className="mt-4"
          tabs={[
            { id: 'business' as Tab, label: 'Business view' },
            { id: 'technical' as Tab, label: 'Technical contract' },
          ]}
          value={tab}
          onChange={setTab}
        />
        {tab === 'business' ? <Business a={a} /> : <Technical a={a} p1={p1} />}
      </div>
    </div>
  )
}

function FlowCol({ label, ids, empty }: { label: string; ids: string[]; empty: string }) {
  const nav = useNavigate()
  return (
    <div className="min-w-0 flex-1 px-4 py-2.5">
      <div className="text-2xs font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-1 flex flex-wrap gap-1">
        {ids.map((id) => {
          const x = AGENT_BY_ID.get(id)!
          return (
            <button key={id} onClick={() => nav(`/phase1/agents/${id}`)} className="flex items-center gap-1.5 border border-line2 bg-panel2 px-1.5 py-0.5 text-xs hover:border-ioh-yellow">
              <span className="h-3 w-[3px]" style={{ background: READINESS_COLOR[x.readiness] }} />
              {shortName(x)}
            </button>
          )
        })}
        {!ids.length && <span className="text-xs text-faint">{empty}</span>}
      </div>
    </div>
  )
}

// ---- Business view ------------------------------------------------------------------------------
function Business({ a }: { a: AgentSpec }) {
  const p1 = useP1()
  const srcs = [...agentSourceMap(a, p1).entries()].map(([id, how]) => ({ s: SOURCE_BY_ID.get(id)!, how }))
  const people = a.inputs.filter((i) => i.ref === 'user')
  const ups = a.inputs.filter((i) => i.ref.startsWith('AG-'))
  const gaps = srcs.filter((x) => x.s.status !== 'on_netra').length
  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_440px] gap-5">
      <div className="space-y-5">
        <Section title="Decision it supports" pad>
          <p className="text-sm leading-6">
            {/^None/.test(a.humanGate)
              ? `No decision of its own: it runs automatically and feeds ${(DOWNSTREAM.get(a.id) ?? []).map((d) => shortName(AGENT_BY_ID.get(d)!)).join(', ') || 'the people using the Planner'}. ${a.humanGate.replace(/^None[^.]*\.?\s*/, '')}`
              : a.humanGate}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-4">
            <div>
              <div className="text-2xs font-semibold uppercase tracking-wider text-faint">It produces</div>
              <ul className="mt-1 space-y-1">
                {a.outputs.map((o) => (
                  <li key={o.name} className="text-sm">
                    <span className="font-mono text-[12px] text-ioh-yellow">{o.name}</span>
                    <div className="text-xs text-muted">{parseFields(o.fields).length} fields, each with confidence, evidence and as-of date</div>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="text-2xs font-semibold uppercase tracking-wider text-faint">For failure classes</div>
              <div className="mt-1.5">
                <ClassDots classes={a.classes} labels />
              </div>
            </div>
          </div>
        </Section>

        <Section title="How we will know it works" sub="KPIs reported on the model and agent scorecard" pad>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-2">
            {a.kpis.map((k) => (
              <li key={k} className="flex items-start gap-2 text-sm">
                <Check size={14} className="mt-0.5 shrink-0 text-ok" /> {k}
              </li>
            ))}
          </ul>
        </Section>

        <div className="grid grid-cols-2 gap-5">
          <Section title="Safeguards" pad>
            <ul className="space-y-1.5">
              {a.guardrails.map((g) => (
                <li key={g} className="flex items-start gap-2 text-sm">
                  <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ioh-yellow" /> {g}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="If it fails" pad>
            <div className="flex items-start gap-2 text-sm">
              <LifeBuoy size={14} className="mt-0.5 shrink-0 text-muted" /> {a.fallback === '—' ? 'No fallback needed: it reports, it does not feed a decision.' : a.fallback}
            </div>
            <div className="mt-2 text-xs text-faint">Fallbacks never extrapolate silently: the planner shows the age of the last good run.</div>
          </Section>
        </div>
      </div>

      <div className="space-y-5">
        <Section title="Readiness and effort" pad>
          <div className="flex items-center gap-3">
            <ReadinessTag r={a.readiness} />
            <span className="text-sm text-muted">{READINESS_TEXT[a.readiness]}</span>
          </div>
          <div className="mt-3">
            <KV k="Owner">{a.owner}</KV>
            <KV k="Build effort">
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className="h-2.5 w-3" style={{ background: i < a.buildWeeks ? READINESS_COLOR[a.readiness] : '#2A2F3A' }} />
                  ))}
                </div>
                <span className="tnum">{a.buildWeeks} weeks</span>
              </div>
            </KV>
            <KV k="Runs">{a.schedule}</KV>
            <KV k="Ready by">{a.sla}</KV>
          </div>
        </Section>

        <Section title="What IOH must supply" sub={srcs.length ? `${srcs.length} data source${srcs.length === 1 ? '' : 's'} · ${gaps} not fully on Netra yet` : 'No direct data feeds'}>
          <div className="divide-y divide-line/70">
            {srcs.map(({ s, how }) => (
              <Link key={s.id} to={`/phase1/data?source=${s.id}#catalog`} className="block px-4 py-2 hover:bg-panel2">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <StatusDot s={s.status} />
                    <span className="truncate text-sm font-medium">{s.name}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-faint">{how === 'via' ? 'via features' : STATUS_LABEL[s.status]}</span>
                </div>
                <div className="pl-4 text-xs text-faint">
                  {s.owner} · {s.refresh}
                </div>
                {s.gap && s.status !== 'on_netra' && <div className="pl-4 text-xs text-warn/90">{s.gap}</div>}
              </Link>
            ))}
            {ups.map((i) => (
              <div key={i.ref} className="flex items-center gap-2 px-4 py-2 text-sm">
                <CircleDot size={12} className="text-muted" />
                <span>{AGENT_BY_ID.get(i.ref)?.name}</span>
                <span className="text-xs text-faint">· {i.what}</span>
              </div>
            ))}
            {people.map((i) => (
              <div key={i.what} className="flex items-center gap-2 px-4 py-2 text-sm">
                <Users size={12} className="text-ioh-yellow" />
                <span>{i.what}</span>
                <span className="text-xs text-faint">· from people</span>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}

// ---- Technical view -----------------------------------------------------------------------------
function Technical({ a, p1 }: { a: AgentSpec; p1: ReturnType<typeof useP1> }) {
  const endpoints = a.api.split(' · ').map((e) => e.trim())
  const [ep, setEp] = useState(0)
  const via = [...agentSourceMap(a, p1).entries()].filter(([, how]) => how === 'via').map(([id]) => id)

  const example = useMemo(() => {
    const raw = endpoints[ep] ?? endpoints[0]
    const [main, note] = raw.split(' → ')
    const m = main.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/)
    const method = m?.[1] ?? 'GET'
    const path = fillEndpoint(m?.[2] ?? main)
    const out = a.outputs[endpoints.length === a.outputs.length ? ep : 0]
    const obj = exampleObject(out.fields)
    const list = method === 'GET' && !/\{[^}]+\}/.test(m?.[2] ?? '') && !/\/explain$|\/scorecard$/.test(path)
    const draft = a.guardrails.some((g) => /draft only|proposal only/i.test(g))
    const meta: Record<string, unknown> = {
      agent: a.id,
      output: out.name,
      as_of: a.id === 'AG-SMARTCAPEX' ? '2026-09-23' : '2026-09-27',
      freshness: a.id === 'AG-SMARTCAPEX' ? 'D-5' : 'D-1',
      run_id: `${a.id.toLowerCase()}-2026-09-28`,
      confidence: 0.82,
      evidence: [`netra://gold/${out.name.split('.').pop()}?run=2026-09-28`],
    }
    if (a.id === 'AG-SFP' || a.id === 'AG-DRIFT') meta.model_version = 'capacity-1.2.1'
    if (draft) meta.state = 'draft'
    if (list) meta.next_cursor = 'eyJvZmZzZXQiOjUwfQ'
    const body = method === 'POST' ? JSON.stringify({ requested_by: 'PLAN · Head of Planning', idempotency_key: 'PL-0031-v3' }, null, 2) : null
    const res = JSON.stringify({ data: list ? [obj] : obj, meta }, null, 2)
    return { method, path, note, body, res, status: method === 'POST' ? '201 Created' : '200 OK' }
  }, [a, ep, endpoints])

  return (
    <div className="mt-4 space-y-5">
      {/* inputs */}
      <Section title="Inputs · data contract" sub="What the agent reads, from where, how fresh, and the fields it relies on">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[132px]" />
            <col className="w-[230px]" />
            <col className="w-[220px]" />
            <col className="w-[120px]" />
            <col className="w-[150px]" />
            <col />
          </colgroup>
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-faint">
              <th className="px-4 py-2 font-semibold">Ref</th>
              <th className="px-3 py-2 font-semibold">Source or agent</th>
              <th className="px-3 py-2 font-semibold">Used for</th>
              <th className="px-3 py-2 font-semibold">Netra status</th>
              <th className="px-3 py-2 font-semibold">Refresh · latency</th>
              <th className="px-3 py-2 font-semibold">Fields</th>
            </tr>
          </thead>
          <tbody>
            {a.inputs.map((i) => {
              const s = SOURCE_BY_ID.get(i.ref)
              const up = AGENT_BY_ID.get(i.ref)
              return (
                <tr key={i.ref + i.what} className="border-t border-line/70 align-top">
                  <td className="px-4 py-2">
                    {s ? (
                      <Link to={`/phase1/data?source=${s.id}#catalog`}>
                        <Id className="hover:text-ioh-yellow">{s.id}</Id>
                      </Link>
                    ) : up ? (
                      <Link to={`/phase1/agents/${up.id}`}>
                        <Id className="hover:text-ioh-yellow">{up.id}</Id>
                      </Link>
                    ) : (
                      <span className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">People</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{s?.name ?? up?.name ?? 'Policy input'}</div>
                    <div className="text-xs text-faint">{s ? `${s.systems}` : up ? `Agent · ${up.owner}` : 'Editable, versioned in NICC policy'}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{i.what}</td>
                  <td className="px-3 py-2">{s ? <StatusTag s={s.status} /> : up ? <span className="text-xs text-muted">Agent output</span> : <span className="text-xs text-muted">Human</span>}</td>
                  <td className="px-3 py-2 text-xs text-muted">{s ? `${s.refresh} · ${s.latency}` : up ? up.schedule : 'On change'}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {s?.fields.map((f) => (
                        <span key={f.name} title={`${f.type} · ${f.description}`} className="border border-line2 px-1 font-mono text-[11px] text-muted">
                          {f.name}
                        </span>
                      ))}
                      {up?.outputs.map((o) => (
                        <span key={o.name} title={o.fields} className="border border-line2 px-1 font-mono text-[11px] text-muted">
                          {o.name} <span className="text-faint">({parseFields(o.fields).length})</span>
                        </span>
                      ))}
                      {!s && !up && <span className="text-xs text-faint">DoA matrix: role, IDR threshold, intervention class, co-sign</span>}
                    </div>
                    {s && s.criticality && (
                      <div className="mt-1 flex items-center gap-3 text-[11px] text-faint">
                        <CritTag c={s.criticality} />
                        <span>quality {s.quality}/100</span>
                        {s.pii && <span className="text-warn">PII · aggregated in Netra</span>}
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {via.length > 0 && (
          <div className="border-t border-line px-4 py-2.5 text-xs text-muted">
            <span className="font-semibold text-ink">Through its features</span> the model also depends on{' '}
            {via.map((id, k) => {
              const s = SOURCE_BY_ID.get(id)!
              return (
                <span key={id}>
                  {k > 0 && ', '}
                  <Link to={`/phase1/data?source=${id}#catalog`} className="inline-flex items-center gap-1 hover:text-ioh-yellow">
                    <StatusDot s={s.status} /> {s.name}
                  </Link>
                </span>
              )
            })}
            . See the feature catalog below.
          </div>
        )}
      </Section>

      {/* outputs */}
      <div className={clsx('grid gap-5', a.outputs.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
        {a.outputs.map((o) => {
          const toks = parseFields(o.fields)
          return (
            <Section key={o.name} title={<span className="font-mono text-[13px] text-ioh-yellow">{o.name}</span>} sub={`Output · ${toks.length} fields + meta (confidence, evidence, as_of)`}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-2xs uppercase tracking-wider text-faint">
                    <th className="px-4 py-2 font-semibold">Field</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {toks.map((t) => (
                    <tr key={t.name} className="border-t border-line/70 align-top">
                      <td className="px-4 py-1.5 font-mono text-[12px]">{t.name}</td>
                      <td className="px-3 py-1.5 font-mono text-[11.5px] text-muted">{fieldType(t)}</td>
                      <td className="px-3 py-1.5 text-xs text-faint">
                        {t.kind === 'objarray' ? t.children!.map((c) => c.name).join(', ') : t.note ?? ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )
        })}
      </div>

      {/* runtime */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5">
        <Section title="Method and runtime" pad>
          <p className="text-sm leading-6">{a.method}</p>
          <div className="mt-3">
            <KV k="Runtime">{a.runtime}</KV>
            <KV k="Schedule">{a.schedule}</KV>
            <KV k="SLA">{a.sla}</KV>
            <KV k="Fallback">{a.fallback}</KV>
            <KV k="Classes">
              <ClassDots classes={a.classes} labels />
            </KV>
          </div>
        </Section>
        <Section title="Guardrails" sub="Enforced in code and logged to the audit trail" pad>
          <ul className="space-y-2">
            {a.guardrails.map((g) => (
              <li key={g} className="flex items-start gap-2 text-sm">
                <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ioh-yellow" /> {g}
              </li>
            ))}
          </ul>
          <div className="mt-4 text-2xs font-semibold uppercase tracking-wider text-faint">Platform rules that apply to every agent</div>
          <ul className="mt-1 space-y-1 text-xs text-muted">
            <li>· Output carries confidence, evidence links and data as-of date</li>
            <li>· No agent both recommends and approves</li>
            <li>· Every override needs a reason code and becomes a training label</li>
          </ul>
        </Section>
      </div>

      {/* API */}
      <Section
        title="API"
        sub="NICC service contract (example payload built from the output schema; values illustrative)"
        right={endpoints.length > 1 ? <Seg options={endpoints.map((e, i) => ({ id: i, label: e.split(/\s+/)[0] + ' ' + (e.split(/\s+/)[1] ?? '').split('?')[0].replace('/nicc/v1', '') }))} value={ep} onChange={setEp} /> : undefined}
      >
        <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] divide-x divide-line">
          <div className="p-4">
            <div className="text-2xs font-semibold uppercase tracking-wider text-faint">Endpoints</div>
            <ul className="mt-1 space-y-1">
              {endpoints.map((e, i) => (
                <li key={e} className={clsx('font-mono text-[12px]', i === ep ? 'text-ink' : 'text-muted')}>
                  {e}
                </li>
              ))}
            </ul>
            <div className="mt-4 text-2xs font-semibold uppercase tracking-wider text-faint">Request</div>
            <pre className="mt-1 overflow-x-auto border border-line bg-canvas p-3 font-mono text-[12px] leading-5 text-muted">
              <span className="text-ioh-yellow">{example.method}</span> {example.path}
              {'\n'}Authorization: Bearer {'<IOH SSO token>'}
              {'\n'}X-NICC-Role: PLAN
              {example.body ? `\nContent-Type: application/json\n\n${example.body}` : ''}
            </pre>
            {example.note && <div className="mt-2 text-xs text-muted">Then: {example.note}</div>}
            <div className="mt-3 text-xs text-faint">Scope (role and geography) is enforced at query level; every call is written to the audit log.</div>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xs font-semibold uppercase tracking-wider text-faint">Response</div>
              <span className="font-mono text-[11px] text-ok">{example.status}</span>
            </div>
            <pre className="mt-1 max-h-[420px] overflow-auto border border-line bg-canvas p-3 font-mono text-[12px] leading-5 text-ink">{example.res}</pre>
          </div>
        </div>
      </Section>

      {(a.id === 'AG-SFP' || a.id === 'AG-FEAT') && (
        <Section title={a.id === 'AG-FEAT' ? 'Features it builds · 8 per class' : 'Features the models use · 8 per class'} sub="From the feature store (site × day). Point-in-time joins, so back-tests never see the future.">
          <FeatureCatalog p1={p1} initial={'capacity' as FailureClass} />
        </Section>
      )}

      {a.id === 'AG-SFP' && p1 && (
        <Section title="Model cards" sub="Back-test precision against the 70% gate" right={<Link to="/phase1/models" className="text-xs text-muted hover:text-ink">All model cards →</Link>}>
          <div className="grid grid-cols-5 divide-x divide-line">
            {p1.models.map((m) => (
              <Link key={m.failure_class} to={`/phase1/models?class=${m.failure_class}`} className="px-4 py-3 hover:bg-panel2">
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[m.failure_class].color }} />
                  {CLASS_META[m.failure_class].label}
                </div>
                <div className={clsx('tnum mt-1 text-xl font-semibold', m.precision_top_decile >= 0.7 ? 'text-ok' : m.precision_top_decile >= 0.6 ? 'text-warn' : 'text-bad')}>{Math.round(m.precision_top_decile * 100)}%</div>
                <div className="text-[11px] text-faint">
                  v{m.current_version} · {m.status}
                </div>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
