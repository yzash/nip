import clsx from 'clsx'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { useState } from 'react'
import type { FailureClass } from '@/data/types'
import { num } from '@/lib/format'
import { CLASSES, CLASS_META, type P1Data } from '../../model'
import { SOURCE_BY_ID, StatusDot, shortSource } from './shared'

const fmt = (v: number) => (Math.abs(v) >= 100 ? num(v, 0) : Math.abs(v) >= 10 ? num(v, 1) : num(v, 2))

/** Feature catalog per failure class: 8 features each, with definition, source and population distribution. */
export function FeatureCatalog({ p1, initial = 'capacity', compact = false }: { p1: P1Data | null; initial?: FailureClass; compact?: boolean }) {
  const [cls, setCls] = useState<FailureClass>(initial)
  const feats = p1?.feature_catalog[cls] ?? []
  const maxImp = Math.max(0.01, ...feats.map((f) => f.importance))
  const meta = CLASS_META[cls]
  return (
    <div>
      <div className="flex h-10 items-stretch gap-1 border-b border-line px-2">
        {CLASSES.map((c) => (
          <button
            key={c}
            onClick={() => setCls(c)}
            className={clsx('relative -mb-px flex items-center gap-2 border-b-2 px-3 text-sm font-semibold', cls === c ? 'text-ink' : 'border-transparent text-muted hover:text-ink')}
            style={cls === c ? { borderColor: CLASS_META[c].color } : undefined}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: CLASS_META[c].color }} />
            {CLASS_META[c].label}
            <span className="tnum text-2xs font-normal text-faint">{p1?.feature_catalog[c]?.length ?? 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center pr-2 text-xs text-faint">
          {meta.label}: horizon {meta.horizon} · base rate {p1 ? `${(p1.base_rate[cls] * 100).toFixed(1)}%` : '–'} of sites per horizon
        </div>
      </div>
      {!p1 ? (
        <div className="px-4 py-8 text-center text-sm text-faint">Loading feature catalog…</div>
      ) : (
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[34px]" />
            <col />
            <col className="w-[84px]" />
            <col className="w-[92px]" />
            <col className="w-[200px]" />
            <col className="w-[104px]" />
            <col className="w-[150px]" />
            <col className="w-[150px]" />
          </colgroup>
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-faint">
              <th className="px-3 py-2 font-semibold">#</th>
              <th className="px-3 py-2 font-semibold">Feature and definition</th>
              <th className="px-3 py-2 font-semibold">Unit</th>
              <th className="px-3 py-2 font-semibold">Window</th>
              <th className="px-3 py-2 font-semibold">Source</th>
              <th className="px-3 py-2 font-semibold">Risk rises when</th>
              <th className="px-3 py-2 font-semibold">Importance</th>
              <th className="px-3 py-2 text-right font-semibold">Population p50 · p90</th>
            </tr>
          </thead>
          <tbody>
            {feats.map((f, i) => {
              const s = SOURCE_BY_ID.get(f.source)
              return (
                <tr key={f.id} className="border-t border-line/70 align-top">
                  <td className="tnum px-3 py-2 text-faint">{i + 1}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold">{f.label}</span>
                      <span className="truncate font-mono text-[11px] text-faint">{f.id}</span>
                    </div>
                    {!compact && <div className="text-xs text-muted">{f.definition}</div>}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted">{f.unit}</td>
                  <td className="px-3 py-2 text-xs text-muted">{f.window}</td>
                  <td className="px-3 py-2 text-xs">
                    {s ? (
                      <span className="flex items-center gap-1.5" title={`${s.name} · ${s.id}`}>
                        <StatusDot s={s.status} />
                        <span className="truncate text-muted">{shortSource(s)}</span>
                      </span>
                    ) : (
                      <span className="font-mono text-faint">{f.source}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {f.direction === 1 ? (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <ArrowUp size={12} className="text-warn" /> higher
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted">
                        <ArrowDown size={12} className="text-warn" /> lower
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 flex-1 bg-line">
                        <div className="h-full" style={{ width: `${(f.importance / maxImp) * 100}%`, background: meta.color }} />
                      </div>
                      <span className="tnum w-8 text-right text-xs">{Math.round(f.importance * 100)}%</span>
                    </div>
                  </td>
                  <td className="tnum px-3 py-2 text-right text-xs">
                    <span className="text-muted">{fmt(f.pop_p50)}</span>
                    <span className="text-faint"> · </span>
                    <span className="text-ink">{fmt(f.pop_p90)}</span>
                    <span className="text-faint"> {f.unit === '0/1' || f.unit === 'count' ? '' : f.unit}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
      <div className="border-t border-line px-4 py-2 text-[11px] text-faint">
        Importance is the share of the model’s total gain (sums to 100% per class). p90 is the riskier tail of the population (high when risk rises with the value, low when it falls). The dot shows the source’s Netra status. Missing values are flagged, never imputed silently.
      </div>
    </div>
  )
}
