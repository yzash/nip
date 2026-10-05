import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import { db } from '@/data/db'
import { CLASS_META, type Cluster } from '../../model'
import { STORY_LABEL, pctTxt, type PredSite } from './common'

// Forecast map: predicted sites coloured by probability at the selected week, forecast clusters
// drawn as rings (story clusters labelled), the South Sulawesi trunk drawn as a line.

const ID_BOUNDS: [number, number, number, number] = [94.9, -11.2, 141.1, 6.2]
type FC = GeoJSON.FeatureCollection

function ring(lon: number, lat: number, rKm: number): [number, number][] {
  const k = Math.cos((lat * Math.PI) / 180)
  const out: [number, number][] = []
  for (let a = 0; a <= 360; a += 12) {
    const t = (a * Math.PI) / 180
    out.push([lon + (Math.sin(t) * rKm) / (111 * k), lat + (Math.cos(t) * rKm) / 111])
  }
  return out
}

function clusterGeom(c: Cluster) {
  const D = db()
  const pts = c.site_ids.map((id) => D.sites[D.siteIdx.get(id)!]).filter(Boolean)
  const lon = pts.reduce((s, x) => s + x.lon, 0) / pts.length
  const lat = pts.reduce((s, x) => s + x.lat, 0) / pts.length
  const k = Math.cos((lat * Math.PI) / 180)
  const r = Math.max(...pts.map((p) => Math.hypot((p.lon - lon) * 111 * k, (p.lat - lat) * 111)))
  return { lon, lat, r: Math.max(6, r * 1.25 + 4), pts }
}

interface Props {
  sites: PredSite[]
  week: number
  clusters: Cluster[]
  selected: string | null
  showLink: boolean
  onSite: (id: string) => void
  onCluster: (id: string) => void
}

export function ForecastMap(p: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)
  const markers = useRef<maplibregl.Marker[]>([])
  const cb = useRef(p)
  cb.current = p
  const [hover, setHover] = useState<{ x: number; y: number; html: { t: string; s: string; p: string; c: string } } | null>(null)

  useEffect(() => {
    const D = db()
    const map = new maplibregl.Map({
      container: el.current!,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0A0C10' } }] },
      bounds: ID_BOUNDS,
      fitBoundsOptions: { padding: { top: 30, bottom: 60, left: 20, right: 20 } },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 13,
      minZoom: 3,
    })
    map.touchZoomRotate.disableRotation()
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Boundaries: BPS / OCHA · synthetic network data' }), 'top-right')
    mapRef.current = map
    map.on('load', () => {
      map.addSource('prov', { type: 'geojson', data: D.provincesGeo })
      map.addLayer({ id: 'prov-fill', type: 'fill', source: 'prov', paint: { 'fill-color': '#151922', 'fill-opacity': 1 } })
      map.addLayer({ id: 'prov-line', type: 'line', source: 'prov', paint: { 'line-color': '#353B48', 'line-width': 0.7 } })
      map.addSource('clusters', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'cl-fill', type: 'fill', source: 'clusters', paint: { 'fill-color': ['get', 'color'], 'fill-opacity': ['case', ['get', 'sel'], 0.18, ['get', 'story'], 0.12, 0.06] } })
      map.addLayer({
        id: 'cl-line',
        type: 'line',
        source: 'clusters',
        paint: {
          'line-color': ['case', ['get', 'sel'], '#FFD100', ['get', 'story'], '#FFD100', ['get', 'color']],
          'line-width': ['case', ['get', 'sel'], 2, ['get', 'story'], 1.4, 0.8],
          'line-opacity': ['case', ['get', 'sel'], 1, ['get', 'story'], 0.85, 0.55],
          'line-dasharray': ['literal', [3, 2]],
        },
      })
      map.addSource('link', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'link', type: 'line', source: 'link', paint: { 'line-color': '#8B5CF6', 'line-width': 2.2, 'line-opacity': 0.9 } })
      map.addSource('sites', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({
        id: 'site-dot',
        type: 'circle',
        source: 'sites',
        layout: { 'circle-sort-key': ['get', 'p'] },
        paint: {
          'circle-color': ['step', ['get', 'p'], '#4B5563', 0.3, '#F5A623', 0.6, '#FF3B3B'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 3.5, ['step', ['get', 'p'], 1.6, 0.3, 2.3, 0.6, 3.4], 8, ['step', ['get', 'p'], 3.5, 0.3, 5, 0.6, 7]],
          'circle-opacity': ['step', ['get', 'p'], 0.55, 0.3, 0.9, 0.6, 1],
          'circle-stroke-color': '#0A0C10',
          'circle-stroke-width': 0.6,
        },
      })
      map.on('mousemove', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['site-dot'] })[0]
        if (f) {
          map.getCanvas().style.cursor = 'pointer'
          const pr = f.properties as { id: string; name: string; p: number; cl: string; cls: string }
          setHover({ x: e.point.x, y: e.point.y, html: { t: pr.id, s: pr.name, p: pctTxt(pr.p), c: pr.cl ? `${pr.cl} · ${CLASS_META[pr.cls as keyof typeof CLASS_META]?.label}` : CLASS_META[pr.cls as keyof typeof CLASS_META]?.label } })
          return
        }
        const c = map.queryRenderedFeatures(e.point, { layers: ['cl-fill'] })[0]
        map.getCanvas().style.cursor = c ? 'pointer' : ''
        setHover(null)
      })
      map.on('mouseout', () => setHover(null))
      map.on('click', (e) => {
        const f = map.queryRenderedFeatures(e.point, { layers: ['site-dot'] })[0]
        if (f) return cb.current.onSite(String(f.properties!.id))
        const c = map.queryRenderedFeatures(e.point, { layers: ['cl-fill'] })[0]
        if (c) cb.current.onCluster(String(c.properties!.id))
      })
      setReady(true)
    })
    const ro = new ResizeObserver(() => map.resize())
    ro.observe(el.current!)
    return () => {
      ro.disconnect()
      markers.current.forEach((m) => m.remove())
      map.remove()
      mapRef.current = null
    }
  }, [])

  // sites
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const fc: FC = {
      type: 'FeatureCollection',
      features: p.sites.map((s) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [s.site.lon, s.site.lat] },
        properties: { id: s.id, name: s.site.name, p: s.probs[p.week - 1], cl: s.cluster?.id ?? '', cls: s.cls },
      })),
    }
    ;(map.getSource('sites') as GeoJSONSource).setData(fc)
  }, [p.sites, p.week, ready])

  // clusters + story labels
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    markers.current.forEach((m) => m.remove())
    markers.current = []
    const feats: GeoJSON.Feature[] = []
    for (const c of p.clusters) {
      const g = clusterGeom(c)
      feats.push({
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: [ring(g.lon, g.lat, g.r)] },
        properties: { id: c.id, color: CLASS_META[c.cls].color, story: !!(c.story && STORY_LABEL[c.story]), sel: c.id === p.selected },
      })
      if ((c.story && STORY_LABEL[c.story]) || c.id === p.selected) {
        const div = document.createElement('div')
        div.className = 'pointer-events-auto cursor-pointer whitespace-nowrap border border-ioh-yellow/70 bg-[#0F1115]/90 px-1.5 py-0.5 text-[10.5px] leading-tight text-ink'
        div.innerHTML = `<span style="color:${CLASS_META[c.cls].color}">●</span> <b>${c.story ? STORY_LABEL[c.story] : c.title}</b><br/><span style="color:#A3AAB8">${c.id} · ${c.site_ids.length} sites · W+${c.crossing_week}</span>`
        div.onclick = (ev) => {
          ev.stopPropagation()
          cb.current.onCluster(c.id)
        }
        // story labels sit on different sides of their ring so Bekasi and Central Java never collide
        const k = Math.cos((g.lat * Math.PI) / 180)
        const side = c.story === 'bekasi_capacity' ? 'left' : c.story === 'cjava_power' ? 'below' : 'above'
        const at: [number, number] = side === 'left' ? [g.lon - g.r / (111 * k), g.lat] : side === 'below' ? [g.lon, g.lat - g.r / 111] : [g.lon, g.lat + g.r / 111]
        const anchor = side === 'left' ? 'right' : side === 'below' ? 'top' : 'bottom'
        const offset: [number, number] = side === 'left' ? [-6, 0] : side === 'below' ? [0, 6] : [0, -4]
        markers.current.push(new maplibregl.Marker({ element: div, anchor, offset }).setLngLat(at).addTo(map))
      }
    }
    ;(map.getSource('clusters') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
  }, [p.clusters, p.selected, ready])

  // trunk link
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const D = db()
    const l = D.links.find((x) => x.link_id === D.meta.story_link_id)
    const feats: GeoJSON.Feature[] = []
    if (l && p.showLink) {
      const a = D.sites[D.siteIdx.get(l.from_site)!]
      const b = D.sites[D.siteIdx.get(l.to_site)!]
      if (a && b) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[a.lon, a.lat], [b.lon, b.lat]] }, properties: {} })
    }
    ;(map.getSource('link') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
  }, [p.showLink, ready])

  // camera
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const c = p.selected ? p.clusters.find((x) => x.id === p.selected) : null
    if (c) {
      const g = clusterGeom(c)
      const d = (g.r * 3) / 111
      map.fitBounds([g.lon - d * 1.6, g.lat - d, g.lon + d * 1.6, g.lat + d], { padding: 30, maxZoom: 10, duration: 700 })
    } else map.fitBounds(ID_BOUNDS, { padding: { top: 30, bottom: 60, left: 20, right: 20 }, duration: 500 })
  }, [p.selected, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="absolute inset-0" />
      {hover && (
        <div className="pointer-events-none absolute z-10 border border-line2 bg-panel px-2 py-1 text-[11px] leading-tight" style={{ left: hover.x + 12, top: hover.y + 12 }}>
          <div>
            <span className="font-mono text-muted">{hover.html.t}</span> <span className="font-semibold">{hover.html.s}</span>
          </div>
          <div className="tnum text-faint">
            p = <span className="text-ink">{hover.html.p}</span> · {hover.html.c}
          </div>
        </div>
      )}
    </div>
  )
}
