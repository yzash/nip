import { useMemo } from 'react'
import { db } from '@/data/db'
import { statusColor } from '@/lib/colors'

// Lightweight SVG map of the affected sites over district outlines (no WebGL needed in a drawer).
export function MiniMap({ siteIds, status, linkId, height = 190, onSite }: { siteIds: string[]; status: (siteId: string) => number; linkId?: string; height?: number; onSite?: (id: string) => void }) {
  const D = db()
  const W = 520
  const H = height
  const geo = useMemo(() => {
    const pts = siteIds.map((id) => D.sites[D.siteIdx.get(id)!])
    const links = linkId ? chainLinks(linkId, siteIds) : []
    const all = [...pts.map((s) => [s.lon, s.lat]), ...links.flatMap((l) => [l.a, l.b])]
    let [x0, y0, x1, y1] = [180, 90, -180, -90]
    for (const [x, y] of all) {
      x0 = Math.min(x0, x)
      y0 = Math.min(y0, y)
      x1 = Math.max(x1, x)
      y1 = Math.max(y1, y)
    }
    const pad = Math.max(0.06, (x1 - x0) * 0.25, (y1 - y0) * 0.25)
    x0 -= pad
    x1 += pad
    y0 -= pad
    y1 += pad
    const k = Math.cos((((y0 + y1) / 2) * Math.PI) / 180)
    const sx = (x1 - x0) * k
    const sy = y1 - y0
    const scale = Math.min(W / sx, H / sy)
    const ox = (W - sx * scale) / 2
    const oy = (H - sy * scale) / 2
    const proj = (lon: number, lat: number): [number, number] => [ox + (lon - x0) * k * scale, oy + (y1 - lat) * scale]
    const paths: { d: string; name: string; c: [number, number] }[] = []
    for (const f of D.districtsGeo.features) {
      const [cx, cy] = f.properties.center
      if (cx < x0 - 1.5 || cx > x1 + 1.5 || cy < y0 - 1.5 || cy > y1 + 1.5) continue
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : []
      let d = ''
      for (const poly of polys as number[][][][]) {
        for (const ring of poly) {
          d += ring.map(([x, y], i) => `${i ? 'L' : 'M'}${proj(x, y)[0].toFixed(1)},${proj(x, y)[1].toFixed(1)}`).join('') + 'Z'
        }
      }
      paths.push({ d, name: f.properties.name, c: proj(cx, cy) })
    }
    return { pts: pts.map((s) => ({ id: s.site_id, name: s.name, p: proj(s.lon, s.lat) })), paths, links: links.map((l) => ({ a: proj(l.a[0], l.a[1]), b: proj(l.b[0], l.b[1]), hot: l.hot })) }
  }, [siteIds, linkId, D, H])
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block w-full bg-[#0A0C10]" style={{ height: H }}>
      <defs>
        <clipPath id="mm-clip">
          <rect width={W} height={H} />
        </clipPath>
      </defs>
      <g clipPath="url(#mm-clip)">
        {geo.paths.map((p) => (
          <path key={p.name + p.d.length} d={p.d} fill="#161A22" stroke="#353B48" strokeWidth={0.7} />
        ))}
        {geo.paths.map((p) =>
          p.c[0] > 0 && p.c[0] < W && p.c[1] > 0 && p.c[1] < H ? (
            <text key={'t' + p.name} x={p.c[0]} y={p.c[1]} fill="#5B6373" fontSize={9} textAnchor="middle" style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              {p.name.replace('Kota ', '')}
            </text>
          ) : null,
        )}
        {geo.links.map((l, i) => (
          <line key={i} x1={l.a[0]} y1={l.a[1]} x2={l.b[0]} y2={l.b[1]} stroke={l.hot ? '#FF3B3B' : '#A3AAB8'} strokeWidth={l.hot ? 2.4 : 1.2} strokeDasharray="4 3" />
        ))}
        {geo.pts.map((s) => (
          <g key={s.id} onClick={() => onSite?.(s.id)} className={onSite ? 'cursor-pointer' : ''}>
            <circle cx={s.p[0]} cy={s.p[1]} r={9} fill={statusColor(status(s.id))} opacity={0.18} />
            <circle cx={s.p[0]} cy={s.p[1]} r={4.2} fill={statusColor(status(s.id))} stroke="#0A0C10" strokeWidth={1} />
            <title>
              {s.id} · {s.name}
            </title>
          </g>
        ))}
      </g>
    </svg>
  )
}

function chainLinks(linkId: string, siteIds: string[]) {
  const D = db()
  const set = new Set(siteIds)
  const first = D.links.find((l) => l.link_id === linkId)
  const out: { a: [number, number]; b: [number, number]; hot: boolean }[] = []
  for (const l of D.links) {
    if (l.link_id === linkId || (set.has(l.from_site) && set.has(l.to_site))) {
      const a = D.sites[D.siteIdx.get(l.from_site)!]
      const b = D.sites[D.siteIdx.get(l.to_site)!]
      out.push({ a: [a.lon, a.lat], b: [b.lon, b.lat], hot: l.link_id === first?.link_id })
    }
  }
  return out
}
