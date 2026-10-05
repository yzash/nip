import { ArrowRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AGENTS } from '../../content/agents'
import { SOURCES } from '../../content/sources'
import type { P1Data } from '../../model'
import {
  AGENT_BY_ID,
  READINESS_COLOR,
  SOURCE_BY_ID,
  STAGE_ORDER,
  STATUS_COLOR,
  StatusDot,
  agentDeps,
  directSources,
  downstreamClosure,
  featureSources,
  shortName,
  shortSource,
  upstreamClosure,
} from './shared'

const W = 1200
const TOP = 34
const ROW = 23
const SRC_W = 196
const NODE_W = 168
const NODE_H = 32
const COL_X = [236, 428, 620, 812, 1004]
const C = { ink: '#F2F3F5', muted: '#A3AAB8', faint: '#6B7280', line: '#2A2F3A', line2: '#353B48', panel2: '#1D212A', yellow: '#FFD100', blue: '#5AA9E6' }

// Sources ordered by domain so the left column reads in groups.
// Column order chosen to keep same-stage edges short.
const COL_ORDER: Record<string, string[]> = {
  Sense: ['AG-FEAT', 'AG-TRANS', 'AG-ENERGY'],
  Predict: ['AG-SFP', 'AG-REV', 'AG-CLUSTER', 'AG-CAP'],
  Decide: ['AG-SPECTRUM', 'AG-LADDER', 'AG-MATCH', 'AG-PRIORITY', 'AG-SMARTCAPEX'],
  Plan: ['AG-BOQ', 'AG-WAREHOUSE', 'AG-PROC', 'AG-TOWERCO', 'AG-VENDOR'],
  Govern: ['AG-ROUTE', 'AG-NARRATIVE', 'AG-DRIFT', 'AG-LEARN'],
}
const SRC_ORDER = [...SOURCES].sort((a, b) => a.domain.localeCompare(b.domain) || a.name.localeCompare(b.name))

export function DependencyGraph({ p1, initial = 'AG-SFP' }: { p1: P1Data | null; initial?: string }) {
  const nav = useNavigate()
  const [pinned, setPinned] = useState<string>(initial)
  const [hover, setHover] = useState<string | null>(null)
  const focus = hover ?? pinned
  const H = TOP + SRC_ORDER.length * ROW + 8

  const pos = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>()
    STAGE_ORDER.forEach((st, k) => {
      const order = COL_ORDER[st] ?? []
      const list = AGENTS.filter((a) => a.stage === st).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
      const span = SRC_ORDER.length * ROW
      list.forEach((a, i) => m.set(a.id, { x: COL_X[k], y: TOP + ((i + 0.5) * span) / list.length - NODE_H / 2 }))
    })
    return m
  }, [])
  const srcY = useMemo(() => new Map(SRC_ORDER.map((s, i) => [s.id, TOP + i * ROW + ROW / 2])), [])

  // feature-catalog sources that are not listed as Feature Builder inputs (drawn dashed into AG-FEAT)
  const featOnly = useMemo(() => {
    const direct = new Set(directSources(AGENT_BY_ID.get('AG-FEAT')!))
    return featureSources(p1).filter((s) => !direct.has(s))
  }, [p1])

  const up = useMemo(() => upstreamClosure(focus), [focus])
  const down = useMemo(() => downstreamClosure(focus), [focus])
  const upSet = new Set([focus, ...up])
  const activeSrc = new Set<string>()
  for (const id of upSet) {
    for (const s of directSources(AGENT_BY_ID.get(id)!)) activeSrc.add(s)
    if (id === 'AG-FEAT') for (const s of featOnly) activeSrc.add(s)
  }
  const isActive = (id: string) => id === focus || up.has(id) || down.has(id)

  const edges: { from: string; to: string; kind: 'up' | 'down' | 'idle' }[] = []
  for (const a of AGENTS)
    for (const d of agentDeps(a)) {
      const kind = upSet.has(a.id) && upSet.has(d) ? 'up' : (d === focus || down.has(d)) && down.has(a.id) ? 'down' : 'idle'
      edges.push({ from: d, to: a.id, kind })
    }

  const fa = AGENT_BY_ID.get(focus)!

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label="Agent dependency graph">
        <defs>
          {(['m', 'y', 'b'] as const).map((k) => (
            <marker key={k} id={`dg-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={k === 'm' ? C.line2 : k === 'y' ? C.yellow : C.blue} />
            </marker>
          ))}
        </defs>
        {/* column headers */}
        <text x={0} y={16} fontSize={11.5} fontWeight={700} fill={C.faint} letterSpacing={0.8}>
          DATA SOURCES · NETRA STATUS
        </text>
        {STAGE_ORDER.map((s, k) => (
          <text key={s} x={COL_X[k]} y={16} fontSize={11.5} fontWeight={700} fill={C.faint} letterSpacing={0.8}>
            {s.toUpperCase()}
          </text>
        ))}

        {/* source → agent edges for the upstream set */}
        {[...upSet].flatMap((id) => {
          const p = pos.get(id)!
          const srcs = directSources(AGENT_BY_ID.get(id)!).map((s) => ({ s, dashed: false }))
          if (id === 'AG-FEAT') srcs.push(...featOnly.map((s) => ({ s, dashed: true })))
          return srcs.map(({ s, dashed }) => {
            const y1 = srcY.get(s)!
            const x1 = SRC_W + 4
            const y2 = p.y + NODE_H / 2
            const mx = (x1 + p.x) / 2
            return <path key={`${s}-${id}`} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${p.x - 2},${y2}`} fill="none" stroke={C.blue} strokeOpacity={0.55} strokeDasharray={dashed ? '4 3' : undefined} markerEnd="url(#dg-b)" />
          })
        })}

        {/* agent → agent edges */}
        {edges
          .sort((a, b) => (a.kind === 'idle' ? -1 : 0) - (b.kind === 'idle' ? -1 : 0))
          .map((e) => {
            const a = pos.get(e.from)!
            const b = pos.get(e.to)!
            const col = e.kind === 'up' ? C.blue : e.kind === 'down' ? C.yellow : C.line2
            const mk = e.kind === 'up' ? 'b' : e.kind === 'down' ? 'y' : 'm'
            const op = e.kind === 'idle' ? 0.5 : 0.9
            let d: string
            if (a.x === b.x) {
              const x = a.x + NODE_W
              const y1 = a.y + NODE_H / 2
              const y2 = b.y + NODE_H / 2
              const bulge = 12 + Math.min(10, Math.abs(y2 - y1) / 25)
              d = `M${x},${y1} C${x + bulge},${y1} ${x + bulge},${y2} ${x + 2},${y2}`
            } else {
              const x1 = a.x + NODE_W
              const y1 = a.y + NODE_H / 2
              const x2 = b.x - 2
              const y2 = b.y + NODE_H / 2
              const mx = (x1 + x2) / 2
              d = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`
            }
            return <path key={`${e.from}-${e.to}`} d={d} fill="none" stroke={col} strokeOpacity={op} strokeWidth={e.kind === 'idle' ? 1 : 1.4} markerEnd={`url(#dg-${mk})`} />
          })}

        {/* sources */}
        {SRC_ORDER.map((s, i) => {
          const y = TOP + i * ROW
          const on = activeSrc.has(s.id)
          const newDomain = i === 0 || SRC_ORDER[i - 1].domain !== s.domain
          return (
            <g key={s.id} opacity={on ? 1 : 0.38}>
              <title>{`${s.name} · ${s.domain} · ${s.status.replace(/_/g, ' ')}`}</title>
              {newDomain && i > 0 && <line x1={0} y1={y} x2={SRC_W} y2={y} stroke={C.line} />}
              <circle cx={7} cy={y + ROW / 2} r={4} fill={STATUS_COLOR[s.status]} />
              <text x={18} y={y + ROW / 2 + 4} fontSize={12} fill={on ? C.ink : C.muted}>
                {shortSource(s)}
              </text>
            </g>
          )
        })}

        {/* agent nodes */}
        {AGENTS.map((a) => {
          const p = pos.get(a.id)!
          const active = isActive(a.id)
          const isF = a.id === focus
          const stroke = isF ? C.yellow : up.has(a.id) ? C.blue : down.has(a.id) ? '#FFD10088' : C.line2
          return (
            <g
              key={a.id}
              className="cursor-pointer"
              opacity={active ? 1 : 0.35}
              onMouseEnter={() => setHover(a.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setPinned(a.id)}
              onDoubleClick={() => nav(`/phase1/agents/${a.id}`)}
            >
              <title>{`${a.name}\nClick to trace · double-click to open`}</title>
              <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} fill={isF ? '#2A2410' : C.panel2} stroke={stroke} strokeWidth={isF ? 1.6 : 1} />
              <rect x={p.x} y={p.y} width={4} height={NODE_H} fill={READINESS_COLOR[a.readiness]} />
              <text x={p.x + 12} y={p.y + 20.5} fontSize={12} fontWeight={isF ? 700 : 500} fill={C.ink}>
                {shortName(a)}
              </text>
            </g>
          )
        })}
      </svg>

      {/* focus summary */}
      <div className="mt-3 grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-px border border-line bg-line">
        <div className="bg-panel p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">{hover ? 'Hovering' : 'Selected'}</div>
          <div className="mt-0.5 text-sm font-semibold">{fa.name}</div>
          <div className="mt-0.5 text-xs text-muted">{fa.oneLiner}</div>
          <button onClick={() => nav(`/phase1/agents/${fa.id}`)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-ioh-yellow hover:underline">
            Open agent spec <ArrowRight size={12} />
          </button>
        </div>
        <div className="bg-panel p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-[#8CC4F0]">Upstream agents · {up.size}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...up].map((id) => (
              <button key={id} onClick={() => setPinned(id)} className="border border-line2 px-1.5 py-0.5 text-[11px] text-muted hover:text-ink">
                {shortName(AGENT_BY_ID.get(id)!)}
              </button>
            ))}
            {!up.size && <span className="text-xs text-faint">None: reads data only</span>}
          </div>
        </div>
        <div className="bg-panel p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-ioh-yellow">Downstream agents · {down.size}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {[...down].map((id) => (
              <button key={id} onClick={() => setPinned(id)} className="border border-line2 px-1.5 py-0.5 text-[11px] text-muted hover:text-ink">
                {shortName(AGENT_BY_ID.get(id)!)}
              </button>
            ))}
            {!down.size && <span className="text-xs text-faint">None: its output goes to people</span>}
          </div>
        </div>
        <div className="bg-panel p-3">
          <div className="text-2xs font-semibold uppercase tracking-wider text-faint">Data it depends on · {activeSrc.size} sources</div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {[...activeSrc].map((id) => {
              const s = SOURCE_BY_ID.get(id)!
              return (
                <span key={id} className="inline-flex items-center gap-1 text-[11px] text-muted" title={s.name}>
                  <StatusDot s={s.status} /> {shortSource(s)}
                </span>
              )
            })}
            {!activeSrc.size && <span className="text-xs text-faint">People input only (policy, reason codes)</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
