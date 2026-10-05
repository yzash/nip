import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AGENTS, STAGES, type AgentSpec } from '../../content/agents'
import { HANDOFFS } from '../../content/golive'
import { AGENT_BY_ID, READINESS_COLOR, shortName, wrap } from './shared'

// Pipeline: Netra → Sense → Predict → Decide → Plan (draft) → human gate → hand-off,
// with Govern as a band underneath and the override-learning loop back into Netra.
const W = 1200
const H = 492
const COL_W = 184
const COL_X = [124, 334, 544, 754] // Sense, Predict, Decide, Plan
const CHIP_H = 44
const CHIP_GAP = 8
const TOP = 66
const GATE_X = 992
const GATE_Y = 190
const HO_X = 1048
const BAND_Y = 352
const GOV_X = 290
const HO_SHORT: Record<string, string> = { 'HO-ERP': 'PO draft', 'HO-BOQ': 'BOQ', 'HO-VENDOR': 'Allocation proposal', 'HO-TOWERCO': 'Access request', 'HO-WMS': 'Stock reservation' }
const C = { ink: '#F2F3F5', muted: '#A3AAB8', faint: '#6B7280', line: '#2A2F3A', line2: '#353B48', panel: '#171A21', panel2: '#1D212A', yellow: '#FFD100' }

function Chip({ a, x, y, w = COL_W, hover, onHover, onOpen }: { a: AgentSpec; x: number; y: number; w?: number; hover: string | null; onHover: (id: string | null) => void; onOpen: (id: string) => void }) {
  const on = hover === a.id
  return (
    <g className="cursor-pointer" onMouseEnter={() => onHover(a.id)} onMouseLeave={() => onHover(null)} onClick={() => onOpen(a.id)}>
      <title>{`${a.name} · ${a.readiness}\n${a.oneLiner}`}</title>
      <rect x={x} y={y} width={w} height={CHIP_H} fill={on ? '#232834' : C.panel2} stroke={on ? C.yellow : C.line2} strokeWidth={1} />
      <rect x={x} y={y} width={4} height={CHIP_H} fill={READINESS_COLOR[a.readiness]} />
      <text x={x + 13} y={y + 19} fontSize={12.5} fontWeight={600} fill={C.ink}>
        {shortName(a)}
      </text>
      <text x={x + 13} y={y + 35} fontSize={11} fill={C.faint} fontFamily="JetBrains Mono, monospace">
        {a.id}
      </text>
      <text x={x + w - 9} y={y + 35} fontSize={11} fill={READINESS_COLOR[a.readiness]} textAnchor="end">
        {a.readiness}
      </text>
    </g>
  )
}

export function PipelineDiagram() {
  const nav = useNavigate()
  const [hover, setHover] = useState<string | null>(null)
  const open = (id: string) => nav(`/phase1/agents/${id}`)
  const byStage = (s: string) => AGENTS.filter((a) => a.stage === s)
  const govern = ['AG-LEARN', 'AG-DRIFT', 'AG-NARRATIVE'].map((id) => AGENT_BY_ID.get(id)!)
  const route = AGENT_BY_ID.get('AG-ROUTE')!
  const midY = TOP + (5 * CHIP_H + 4 * CHIP_GAP) / 2
  const chipsBottom = TOP + 5 * CHIP_H + 4 * CHIP_GAP

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="img" aria-label="Predictive Planner agent pipeline">
      <defs>
        <marker id="pp-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.muted} />
        </marker>
        <marker id="pp-arr-y" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.yellow} />
        </marker>
      </defs>

      {/* Netra */}
      <g>
        <rect x={0} y={TOP} width={100} height={chipsBottom - TOP} fill={C.panel} stroke={C.line2} />
        <text x={50} y={TOP + 26} fontSize={14} fontWeight={700} fill={C.ink} textAnchor="middle">
          Netra
        </text>
        {['data lake', 'feature store', 'model registry', 'agent runtime'].map((t, i) => (
          <text key={i} x={50} y={TOP + 56 + i * 24} fontSize={11.5} fill={C.muted} textAnchor="middle">
            {t}
          </text>
        ))}
        <text x={50} y={chipsBottom - 14} fontSize={11} fill={C.faint} textAnchor="middle">
          22 sources
        </text>
        <line x1={102} y1={midY} x2={COL_X[0] - 4} y2={midY} stroke={C.muted} markerEnd="url(#pp-arr)" />
      </g>

      {/* Stage columns 1-4 */}
      {STAGES.slice(0, 4).map((s, k) => {
        const x = COL_X[k]
        const desc = wrap(s.desc, 31, 2)
        return (
          <g key={s.id}>
            <circle cx={x + 9} cy={13} r={9} fill="none" stroke={C.yellow} />
            <text x={x + 9} y={17} fontSize={11} fontWeight={700} fill={C.yellow} textAnchor="middle" fontFamily="JetBrains Mono, monospace">
              {k + 1}
            </text>
            <text x={x + 25} y={18} fontSize={13} fontWeight={700} fill={C.ink} letterSpacing={0.6}>
              {s.label.toUpperCase()}
            </text>
            {desc.map((l, i) => (
              <text key={i} x={x} y={38 + i * 14} fontSize={11.5} fill={C.muted}>
                {l}
              </text>
            ))}
            {byStage(s.id).map((a, i) => (
              <Chip key={a.id} a={a} x={x} y={TOP + i * (CHIP_H + CHIP_GAP)} hover={hover} onHover={setHover} onOpen={open} />
            ))}
            {k < 3 && <line x1={x + COL_W + 3} y1={midY} x2={COL_X[k + 1] - 4} y2={midY} stroke={C.muted} markerEnd="url(#pp-arr)" />}
          </g>
        )
      })}

      {/* Human gate */}
      <g>
        <line x1={COL_X[3] + COL_W + 3} y1={GATE_Y} x2={GATE_X - 38} y2={GATE_Y} stroke={C.yellow} markerEnd="url(#pp-arr-y)" />
        <text x={GATE_X} y={18} fontSize={13} fontWeight={700} fill={C.yellow} textAnchor="middle" letterSpacing={0.6}>
          HUMAN GATE
        </text>
        <text x={GATE_X} y={38} fontSize={11.5} fill={C.muted} textAnchor="middle">
          Named approver
        </text>
        <text x={GATE_X} y={52} fontSize={11.5} fill={C.muted} textAnchor="middle">
          per IOH DoA
        </text>
        <path d={`M${GATE_X},${GATE_Y - 34} L${GATE_X + 34},${GATE_Y} L${GATE_X},${GATE_Y + 34} L${GATE_X - 34},${GATE_Y} Z`} fill="#2A2410" stroke={C.yellow} strokeWidth={1.5} />
        <text x={GATE_X} y={GATE_Y + 4} fontSize={12} fontWeight={700} fill={C.yellow} textAnchor="middle">
          Approve
        </text>
        {['approve', 'reject + reason', 'defer'].map((t, i) => (
          <text key={t} x={GATE_X} y={GATE_Y + 56 + i * 15} fontSize={11.5} fill={i === 0 ? C.ink : C.muted} textAnchor="middle">
            {t}
          </text>
        ))}
        <line x1={GATE_X + 36} y1={GATE_Y} x2={HO_X - 4} y2={GATE_Y} stroke={C.yellow} markerEnd="url(#pp-arr-y)" />
      </g>

      {/* Hand-off */}
      <g>
        <text x={HO_X} y={18} fontSize={13} fontWeight={700} fill={C.ink} letterSpacing={0.6}>
          HAND-OFF
        </text>
        <text x={HO_X} y={38} fontSize={11.5} fill={C.muted}>
          Drafts to systems of
        </text>
        <text x={HO_X} y={52} fontSize={11.5} fill={C.muted}>
          record; execution stays
        </text>
        <rect x={HO_X} y={TOP} width={W - HO_X} height={chipsBottom - TOP} fill={C.panel} stroke={C.line2} />
        {HANDOFFS.map((h, i) => {
          const y = TOP + 10 + i * 46
          return (
            <g key={h.id}>
              <text x={HO_X + 12} y={y + 15} fontSize={12} fontWeight={600} fill={C.ink}>
                {h.target.split(' · ')[0]}
              </text>
              <text x={HO_X + 12} y={y + 31} fontSize={11} fill={C.faint}>
                {HO_SHORT[h.id] ?? h.target.split(' · ')[1]}
              </text>

              {i < HANDOFFS.length - 1 && <line x1={HO_X + 12} y1={y + 40} x2={W - 12} y2={y + 40} stroke={C.line} />}
            </g>
          )
        })}
      </g>

      {/* Govern band */}
      <g>
        <rect x={COL_X[0]} y={BAND_Y} width={W - COL_X[0]} height={CHIP_H + 30} fill="#13161C" stroke={C.line2} strokeDasharray="4 3" />
        <circle cx={COL_X[0] + 21} cy={BAND_Y + 25} r={9} fill="none" stroke={C.yellow} />
        <text x={COL_X[0] + 21} y={BAND_Y + 29} fontSize={11} fontWeight={700} fill={C.yellow} textAnchor="middle" fontFamily="JetBrains Mono, monospace">
          5
        </text>
        <text x={COL_X[0] + 37} y={BAND_Y + 30} fontSize={13} fontWeight={700} fill={C.ink} letterSpacing={0.6}>
          GOVERN
        </text>
        {wrap(STAGES[4].desc, 24, 2).map((l, i) => (
          <text key={i} x={COL_X[0] + 12} y={BAND_Y + 50 + i * 14} fontSize={11.5} fill={C.muted}>
            {l}
          </text>
        ))}
        {govern.map((a, i) => (
          <Chip key={a.id} a={a} x={GOV_X + i * (COL_W + 16)} y={BAND_Y + 15} hover={hover} onHover={setHover} onOpen={open} />
        ))}
        <Chip a={route} x={GATE_X - COL_W / 2} y={BAND_Y + 15} hover={hover} onHover={setHover} onOpen={open} />
        <line x1={GATE_X} y1={BAND_Y + 13} x2={GATE_X} y2={GATE_Y + 104} stroke={C.yellow} strokeDasharray="3 3" markerEnd="url(#pp-arr-y)" />
        <text x={GATE_X + 8} y={BAND_Y - 8} fontSize={11} fill={C.muted}>
          names the approver
        </text>
      </g>

      {/* Feedback loop */}
      <g>
        <path d={`M${GOV_X + 30},${BAND_Y + 15 + CHIP_H} L${GOV_X + 30},${H - 12} L50,${H - 12} L50,${chipsBottom + 4}`} fill="none" stroke={C.yellow} strokeDasharray="5 4" markerEnd="url(#pp-arr-y)" />
        <text x={GOV_X + 44} y={H - 16} fontSize={11.5} fill={C.muted}>
          <tspan fill={C.yellow} fontWeight={600}>
            Feedback loop
          </tspan>{' '}
          · rejections, class moves and false-positive marks become labels in Netra at 23:00 WIB; models retrain monthly
        </text>
      </g>
    </svg>
  )
}
