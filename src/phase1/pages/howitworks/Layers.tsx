import { LAYERS } from '../../content/agents'
import { wrap } from './shared'

// Layered architecture L6 (people) → L1 (systems of record), with the data flow annotated
// between layers and write-back of approved drafts to the systems of record.
const W = 1200
const BAND_H = 80
const GAP = 34
const LABEL_W = 178
const ITEMS_X = 190
const ITEMS_W = 700
const WB_X = 986
const C = { ink: '#F2F3F5', muted: '#A3AAB8', faint: '#6B7280', line: '#2A2F3A', line2: '#353B48', panel: '#171A21', panel2: '#1D212A', yellow: '#FFD100', blue: '#5AA9E6' }

const OWNER: Record<string, { text: string; color: string }> = {
  L6: { text: 'NICC', color: C.yellow },
  L5: { text: 'NICC', color: C.yellow },
  L4: { text: 'Netra runtime · NICC agents', color: C.blue },
  L3: { text: 'Netra', color: C.blue },
  L2: { text: 'Netra', color: C.blue },
  L1: { text: 'IOH systems of record', color: C.muted },
}

// between layer i (upper) and i+1 (lower), index by the upper layer id
const FLOW: Record<string, { up: string; down: string }> = {
  L6: { up: 'Role- and geography-scoped views (IOH SSO)', down: 'Approve · reject with reason · defer · override' },
  L5: { up: 'Recommendations carrying confidence, evidence, as-of', down: 'Triggers: plan build, submit, approval' },
  L4: { up: 'Scores, SHAP factors, features API (05:00 WIB)', down: 'Model scorecards, override labels' },
  L3: { up: 'Point-in-time features, site × day (03:00 WIB)', down: 'Labels: ticket root causes + overrides (23:00)' },
  L2: { up: 'Netra connectors, daily batch 01:00 WIB (alarms hourly)', down: '' },
}

const WRITEBACK = [
  { name: 'ERP', what: 'PO draft (BAPI / IDoc / CSV)', id: 'HO-ERP' },
  { name: 'Deployment PMO', what: 'BOQ (XLSX + API)', id: 'HO-BOQ' },
  { name: 'WMS', what: 'Stock reservation, transfers', id: 'HO-WMS' },
  { name: 'Vendor portal', what: 'Allocation proposal', id: 'HO-VENDOR' },
  { name: 'Tower company', what: 'Access and loading request', id: 'HO-TOWERCO' },
]

export function LayerDiagram() {
  const H = LAYERS.length * BAND_H + (LAYERS.length - 1) * GAP + 4
  const yOf = (i: number) => i * (BAND_H + GAP)
  const l5y = yOf(1)
  const wbTop = l5y
  const wbBottom = yOf(5) + BAND_H
  const boxH = (wbBottom - wbTop - 30 - (WRITEBACK.length - 1) * 8) / WRITEBACK.length

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Layered architecture">
      <defs>
        <marker id="ly-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.muted} />
        </marker>
        <marker id="ly-arr-y" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={C.yellow} />
        </marker>
      </defs>

      {LAYERS.map((L, i) => {
        const y = yOf(i)
        const n = L.items.length
        const bw = (ITEMS_W - (n - 1) * 8) / n
        const chars = Math.floor((bw - 20) / 6.4)
        const highlight = L.id === 'L4'
        const own = OWNER[L.id]
        return (
          <g key={L.id}>
            <rect x={0} y={y} width={ITEMS_X + ITEMS_W + 10} height={BAND_H} fill={highlight ? '#1A1D16' : C.panel} stroke={highlight ? '#FFD10066' : C.line2} />
            <text x={14} y={y + 22} fontSize={12} fontWeight={700} fill={C.yellow} fontFamily="JetBrains Mono, monospace">
              {L.id}
            </text>
            {wrap(L.name, 18, 2).map((t, k) => (
              <text key={k} x={44} y={y + 22 + k * 15} fontSize={12.5} fontWeight={600} fill={C.ink}>
                {t}
              </text>
            ))}
            <text x={14} y={y + BAND_H - 12} fontSize={11} fill={own.color}>
              {own.text}
            </text>
            <line x1={LABEL_W} y1={y + 8} x2={LABEL_W} y2={y + BAND_H - 8} stroke={C.line2} />
            {L.items.map((it, k) => {
              const x = ITEMS_X + k * (bw + 8)
              const lines = wrap(it, chars, 4)
              const top = y + BAND_H / 2 - ((lines.length - 1) * 14) / 2 + 4
              return (
                <g key={k}>
                  <rect x={x} y={y + 8} width={bw} height={BAND_H - 16} fill={C.panel2} stroke={C.line} />
                  {lines.map((t, j) => (
                    <text key={j} x={x + 10} y={top + j * 14} fontSize={12} fill={j === 0 && it.includes(':') ? C.ink : C.muted}>
                      {t}
                    </text>
                  ))}
                </g>
              )
            })}
            {i < LAYERS.length - 1 && FLOW[L.id] && (
              <g>
                <line x1={206} y1={y + BAND_H + GAP - 3} x2={206} y2={y + BAND_H + 3} stroke={C.muted} markerEnd="url(#ly-arr)" />
                <text x={218} y={y + BAND_H + GAP / 2 + 4} fontSize={11.5} fill={C.muted}>
                  {FLOW[L.id].up}
                </text>
                {FLOW[L.id].down && (
                  <>
                    <line x1={596} y1={y + BAND_H + 3} x2={596} y2={y + BAND_H + GAP - 3} stroke={C.yellow} strokeOpacity={0.7} markerEnd="url(#ly-arr-y)" />
                    <text x={608} y={y + BAND_H + GAP / 2 + 4} fontSize={11.5} fill={C.muted}>
                      {FLOW[L.id].down}
                    </text>
                  </>
                )}
              </g>
            )}
          </g>
        )
      })}

      {/* write-back column */}
      <g>
        <rect x={WB_X} y={wbTop} width={W - WB_X} height={wbBottom - wbTop} fill="#13161C" stroke={C.line2} strokeDasharray="4 3" />
        <text x={WB_X + 12} y={wbTop + 20} fontSize={12} fontWeight={700} fill={C.ink}>
          Write-back · drafts only
        </text>
        {WRITEBACK.map((w, k) => {
          const y = wbTop + 30 + k * (boxH + 8)
          return (
            <g key={w.id}>
              <rect x={WB_X + 10} y={y} width={W - WB_X - 20} height={boxH} fill={C.panel2} stroke={C.line} />
              <text x={WB_X + 22} y={y + boxH / 2 - 3} fontSize={12} fontWeight={600} fill={C.ink}>
                {w.name}
              </text>
              <text x={WB_X + 22} y={y + boxH / 2 + 13} fontSize={11} fill={C.faint}>
                {w.what}
              </text>
              <text x={W - 20} y={y + boxH / 2 - 3} fontSize={11} fill={C.faint} textAnchor="end" fontFamily="JetBrains Mono, monospace">
                {w.id}
              </text>
            </g>
          )
        })}
        <line x1={ITEMS_X + ITEMS_W + 12} y1={l5y + 24} x2={WB_X - 3} y2={l5y + 24} stroke={C.yellow} markerEnd="url(#ly-arr-y)" />
        <text x={ITEMS_X + ITEMS_W + 14} y={l5y + 16} fontSize={11} fill={C.yellow}>
          after approval
        </text>
        <line x1={WB_X - 3} y1={yOf(5) + BAND_H / 2} x2={ITEMS_X + ITEMS_W + 12} y2={yOf(5) + BAND_H / 2} stroke={C.muted} markerEnd="url(#ly-arr)" />
        <text x={ITEMS_X + ITEMS_W + 14} y={yOf(5) + BAND_H / 2 - 7} fontSize={11} fill={C.muted}>
          acks read back
        </text>
      </g>
    </svg>
  )
}
