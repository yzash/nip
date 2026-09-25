import clsx from 'clsx'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { db, kpiAt } from '@/data/db'
import { Badge, Dot, Fresh, Id, Seg, Td, Th } from '@/components/ui'
import { statusOf } from '@/lib/colors'
import { CLASS_LABEL, idr, num } from '@/lib/format'
import { crossingWeek, lastDay, siteHealth, siteInScope } from '@/lib/metrics'
import { usePolicy, useRole, useScope } from '@/store/app'
import { Site360 } from './Site360'

export function SitePage() {
  const { id } = useParams()
  if (id && db().siteIdx.has(id)) return <Site360 key={id} siteId={id} mode="page" />
  return <SitePicker />
}

// M2 landing: the sites that need a look, in the role's scope, one click from Site 360.
function SitePicker() {
  const D = db()
  const nav = useNavigate()
  const role = useRole()
  const scope = useScope()
  const policy = usePolicy()
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'risk' | 'health' | 'revenue'>('risk')
  const rows = useMemo(() => {
    const day = lastDay()
    const out = D.sites
      .map((s, i) => ({ s, i, h: siteHealth(i, day), p: D.forecast[i].failure_prob[7], cw: crossingWeek(i, policy.red_min_probability) }))
      .filter((r) => siteInScope(r.s, role, scope))
      .filter((r) => !q || r.s.site_id.toLowerCase().includes(q.toLowerCase()) || r.s.name.toLowerCase().includes(q.toLowerCase()) || D.distById[r.s.district_id].name.toLowerCase().includes(q.toLowerCase()))
    out.sort((a, b) => (sort === 'risk' ? b.p - a.p : sort === 'health' ? a.h - b.h : D.revenue.latest[b.i] - D.revenue.latest[a.i]))
    return out.slice(0, 200)
  }, [D, role, scope, q, sort, policy])
  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="flex h-14 shrink-0 items-center gap-4 border-b border-line px-5">
        <div>
          <div className="text-base font-semibold">Site 360</div>
          <div className="text-xs text-muted">What is happening at this site, and why? Pick a site, or click any marker on the map.</div>
        </div>
        <div className="relative ml-auto w-80">
          <Search size={14} className="absolute left-2.5 top-2.5 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Site ID, name or district" className="h-9 w-full border border-line2 bg-panel2 pl-8 pr-2 text-sm placeholder:text-faint" />
        </div>
        <Seg options={[{ id: 'risk', label: 'Highest risk' }, { id: 'health', label: 'Worst health' }, { id: 'revenue', label: 'Highest revenue' }]} value={sort} onChange={setSort} />
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Site</Th>
              <Th>Name</Th>
              <Th>District</Th>
              <Th>Health</Th>
              <Th>CNX</Th>
              <Th>Availability</Th>
              <Th>Predicted</Th>
              <Th className="text-right">Revenue / mo</Th>
              <Th>
                <Fresh f="D-1" />
              </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ s, i, h, p, cw }) => (
              <tr key={s.site_id} onClick={() => nav(`/site/${s.site_id}`)} className="cursor-pointer hover:bg-panel2">
                <Td>
                  <Id>{s.site_id}</Id>
                </Td>
                <Td className="max-w-[260px] truncate">{s.name}</Td>
                <Td className="text-muted">{D.distById[s.district_id].name}</Td>
                <Td>
                  <span className="flex items-center gap-1.5">
                    <Dot status={statusOf(h, policy.colour_thresholds.health)} />
                    <span className="tnum">{h.toFixed(0)}</span>
                  </span>
                </Td>
                <Td className="tnum">{kpiAt('cnx', i, lastDay()).toFixed(1)}</Td>
                <Td className="tnum">{kpiAt('availability', i, lastDay()).toFixed(2)}%</Td>
                <Td>
                  {cw > 0 ? (
                    <Badge tone="bad">
                      {CLASS_LABEL[D.forecast[i].failure_class]} W+{cw}
                    </Badge>
                  ) : (
                    <span className={clsx('tnum text-xs', p >= 0.3 ? 'text-warn' : 'text-faint')}>{Math.round(p * 100)}%</span>
                  )}
                </Td>
                <Td className="tnum text-right">{idr(D.revenue.latest[i])}</Td>
                <Td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 py-3 text-xs text-faint">Showing top {num(rows.length)} in scope.</div>
      </div>
    </div>
  )
}
