import clsx from 'clsx'

// PRD §7 orchestration pattern, drawn inline:
// Sense → Predict → Incident Orchestrator → Decide → Human approval → Execute → Program Orchestrator → Validate → Sense
// with Rejected → Override Learning → labelled data back to Netra.

export interface OrchNode {
  id: string
  label: string
  sub: string
  family: string | null // registry family this node filters to
  count?: number
}

const W = 124
const H = 58
const GAP = 34
const X0 = 16
const Y = 56

export function Orchestration({ counts, active, onPick }: { counts: Record<string, number>; active: string | null; onPick: (family: string | null) => void }) {
  const nodes: (OrchNode & { kind?: 'decision' | 'orch' })[] = [
    { id: 'sense', label: 'Sense agents', sub: `${counts.Sense ?? 0} agents · daily`, family: 'Sense' },
    { id: 'predict', label: 'Predict agents', sub: `${counts.Predict ?? 0} agents · daily`, family: 'Predict' },
    { id: 'io', label: 'Incident Orchestrator', sub: 'after every batch', family: 'Orchestrate', kind: 'orch' },
    { id: 'decide', label: 'Decide agents', sub: `${counts.Decide ?? 0} agents · enrich`, family: 'Decide' },
    { id: 'human', label: 'Human approval', sub: 'named approver', family: null, kind: 'decision' },
    { id: 'execute', label: 'Execute agents', sub: `${counts.Execute ?? 0} agents · draft`, family: 'Execute' },
    { id: 'po', label: 'Program Orchestrator', sub: 'on state change', family: 'Orchestrate', kind: 'orch' },
    { id: 'validate', label: 'Validate agents', sub: `${counts.Validate ?? 0} agents · 30/60/90 d`, family: 'Validate' },
  ]
  const x = (i: number) => X0 + i * (W + GAP)
  const total = x(nodes.length - 1) + W + X0
  const humanX = x(4)
  const olX = humanX
  const olY = Y + H + 58

  return (
    <svg viewBox={`0 0 ${total} 232`} className="block h-auto w-full" role="img" aria-label="Agent orchestration pattern">
      <defs>
        <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#6B7280" />
        </marker>
        <marker id="arrY" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#FFD100" />
        </marker>
        <marker id="arrR" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#FF3B3B" />
        </marker>
      </defs>

      {/* Loop back: Validate → Sense */}
      <path d={`M ${x(7) + W / 2} ${Y} V 22 H ${x(0) + W / 2} V ${Y - 2}`} fill="none" stroke="#6B7280" strokeWidth={1.2} strokeDasharray="4 3" markerEnd="url(#arr)" />
      <rect x={total / 2 - 150} y={13} width={300} height={18} fill="#171A21" />
      <text x={total / 2} y={26} textAnchor="middle" fontSize={11} fill="#A3AAB8">
        Realised outcomes feed the next Sense and Predict run
      </text>

      {/* Main chain arrows */}
      {nodes.slice(0, -1).map((n, i) => {
        const x1 = x(i) + W
        const x2 = x(i + 1)
        const approved = n.id === 'human'
        return (
          <g key={`a-${n.id}`}>
            <line x1={x1 + 2} y1={Y + H / 2} x2={x2 - 3} y2={Y + H / 2} stroke={approved ? '#2ECC71' : '#6B7280'} strokeWidth={1.3} markerEnd="url(#arr)" />
            {approved && (
              <text x={(x1 + x2) / 2} y={Y - 6} textAnchor="middle" fontSize={10} fill="#2ECC71">
                approved
              </text>
            )}
          </g>
        )
      })}

      {/* Rejected → Override Learning */}
      <line x1={humanX + W / 2} y1={Y + H / 2 + 38} x2={olX + W / 2} y2={olY - 3} stroke="#FF3B3B" strokeWidth={1.3} markerEnd="url(#arrR)" />
      <text x={humanX + W / 2 + 7} y={Y + H + 30} fontSize={10} fill="#FF3B3B">
        rejected / overridden
      </text>
      <g className="cursor-pointer" onClick={() => onPick('Validate')}>
        <rect x={olX} y={olY} width={W} height={44} fill="#1D212A" stroke="#FF3B3B" strokeOpacity={0.6} />
        <text x={olX + W / 2} y={olY + 19} textAnchor="middle" fontSize={11.5} fontWeight={600} fill="#F2F3F5">
          Override Learning
        </text>
        <text x={olX + W / 2} y={olY + 34} textAnchor="middle" fontSize={10} fill="#A3AAB8">
          reason codes → labels
        </text>
      </g>
      {/* Override Learning → Netra → Predict */}
      <path d={`M ${olX} ${olY + 22} H ${x(1) + W / 2} V ${Y + H + 3}`} fill="none" stroke="#FFD100" strokeWidth={1.2} strokeDasharray="4 3" markerEnd="url(#arrY)" />
      <rect x={x(1) + W / 2 + 14} y={olY + 13} width={196} height={18} fill="#171A21" />
      <text x={x(1) + W / 2 + 20} y={olY + 26} fontSize={10.5} fill="#FFD100">
        labelled data to Netra model owners
      </text>

      {/* Execute money rule */}
      <text x={x(5) + W / 2} y={Y + H + 18} textAnchor="middle" fontSize={10} fill="#6B7280">
        money-touching agents draft only
      </text>
      <text x={x(0) + W / 2} y={Y + H + 18} textAnchor="middle" fontSize={10} fill="#6B7280">
        Netra daily schedule
      </text>
      <text x={x(7) + W / 2} y={Y + H + 18} textAnchor="middle" fontSize={10} fill="#6B7280">
        vs matched control
      </text>

      {/* Nodes */}
      {nodes.map((n, i) => {
        const nx = x(i)
        const isActive = n.family !== null && active === n.family
        if (n.kind === 'decision') {
          const cx = nx + W / 2
          const cy = Y + H / 2
          return (
            <g key={n.id}>
              <polygon points={`${cx},${cy - 36} ${cx + W / 2},${cy} ${cx},${cy + 36} ${cx - W / 2},${cy}`} fill="#1D212A" stroke="#FFD100" strokeWidth={1.5} />
              <text x={cx} y={cy - 2} textAnchor="middle" fontSize={11} fontWeight={700} fill="#FFD100">
                Human approval
              </text>
              <text x={cx} y={cy + 13} textAnchor="middle" fontSize={10} fill="#A3AAB8">
                {n.sub}
              </text>
            </g>
          )
        }
        return (
          <g key={n.id} className="cursor-pointer" onClick={() => onPick(isActive ? null : n.family)}>
            <rect x={nx} y={Y} width={W} height={H} fill={isActive ? '#2A2716' : '#1D212A'} stroke={isActive ? '#FFD100' : n.kind === 'orch' ? '#8B5CF6' : '#353B48'} strokeWidth={isActive ? 1.5 : 1} />
            <rect x={nx} y={Y} width={3} height={H} fill={n.kind === 'orch' ? '#8B5CF6' : '#5AA9E6'} />
            <text x={nx + W / 2 + 1} y={Y + 24} textAnchor="middle" fontSize={n.label.length > 18 ? 10.5 : 11.5} fontWeight={600} fill="#F2F3F5">
              {n.label}
            </text>
            <text x={nx + W / 2 + 1} y={Y + 41} textAnchor="middle" fontSize={10} fill="#A3AAB8">
              {n.sub}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function FamilyChip({ family, className }: { family: string; className?: string }) {
  return <span className={clsx('font-mono text-[10.5px] uppercase text-faint', className)}>{family}</span>
}
