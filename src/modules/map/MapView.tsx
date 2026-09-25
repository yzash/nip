import maplibregl, { type GeoJSONSource, type Map as MLMap } from 'maplibre-gl'
import { useEffect, useRef } from 'react'
import { db } from '@/data/db'
import type { Policy } from '@/data/types'
import { SEQ, STATUS, statusOf } from '@/lib/colors'
import type { LayerId } from '@/store/app'
import { provinceRollup, type LayerResult } from './layers'

export interface HoverInfo {
  kind: 'site' | 'province' | 'link' | 'cdn'
  id: string
  x: number
  y: number
}

interface Props {
  res: LayerResult
  layer: LayerId
  overlays: { backbone: boolean; cdn: boolean; program: boolean }
  policy: Policy
  selectedSite?: string | null
  highlightSites?: string[] | null
  fit?: { bounds: [number, number, number, number]; key: string } | null
  onHover?: (h: HoverInfo | null) => void
  onSiteClick?: (siteId: string) => void
  onProvinceClick?: (provId: string) => void
  onCamera?: (c: { center: [number, number]; zoom: number }) => void
  camera?: { center: [number, number]; zoom: number } | null
  compact?: boolean
  scoped?: boolean
}

const NATIONAL_MAX = 5.8
const SECTOR_MIN = 10.5
const STATUS_EXPR: maplibregl.ExpressionSpecification = [
  'match',
  ['get', 's'],
  0, STATUS.ok,
  1, STATUS.warn,
  2, STATUS.bad,
  3, STATUS.prog,
  10, SEQ[0],
  11, SEQ[1],
  12, SEQ[2],
  13, SEQ[3],
  14, SEQ[4],
  15, SEQ[5],
  STATUS.nodata,
]

function provColor(status: number): string {
  if (status === 0) return '#173226'
  if (status === 1) return '#4A3714'
  if (status === 2) return '#5A1A1A'
  if (status >= 10) return SEQ[status - 10]
  return '#171B23'
}

function sectorPolygon(lon: number, lat: number, az: number, r: number): [number, number][] {
  const pts: [number, number][] = [[lon, lat]]
  const k = Math.cos((lat * Math.PI) / 180)
  for (let a = az - 30; a <= az + 30; a += 10) {
    const rad = (a * Math.PI) / 180
    pts.push([lon + (Math.sin(rad) * r) / k, lat + Math.cos(rad) * r])
  }
  pts.push([lon, lat])
  return pts
}

export function MapView(p: Props) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const loaded = useRef(false)
  const propsRef = useRef(p)
  propsRef.current = p
  const clusterMarkers = useRef(new Map<number, maplibregl.Marker>())
  const provLabels = useRef<maplibregl.Marker[]>([])
  const syncing = useRef(false)

  // ---- create -------------------------------------------------------------------
  useEffect(() => {
    const D = db()
    const map = new maplibregl.Map({
      container: el.current!,
      style: { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#0A0C10' } }] },
      bounds: [94.9, -11.2, 141.1, 6.2],
      fitBoundsOptions: { padding: p.compact ? { top: 150, bottom: 90, left: 20, right: 20 } : { top: 150, bottom: 90, left: 250, right: 40 } },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      maxZoom: 15,
      minZoom: 3.2,
    })
    map.touchZoomRotate.disableRotation()
    if (!p.compact) map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right')
    map.addControl(new maplibregl.AttributionControl({ compact: true, customAttribution: 'Boundaries: BPS / OCHA (CC BY 3.0 IGO) · synthetic network data' }), 'bottom-left')
    mapRef.current = map
    map.on('error', (e) => console.warn('maplibre:', e.error?.message ?? e, (e as unknown as { sourceId?: string }).sourceId ?? ''))
    if (import.meta.env.DEV) (window as unknown as { __map: MLMap }).__map = map

    map.on('load', () => {
      map.addSource('provinces', { type: 'geojson', data: D.provincesGeo, promoteId: 'id' })
      map.addSource('districts', { type: 'geojson', data: D.districtsGeo, promoteId: 'id' })
      map.addLayer({
        id: 'prov-fill',
        type: 'fill',
        source: 'provinces',
        paint: {
          'fill-color': ['coalesce', ['feature-state', 'c'], '#171B23'],
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 4, 0.95, NATIONAL_MAX, 0.55, 7, 0.16, 9, 0.06],
        },
      })
      map.addLayer({ id: 'dist-line', type: 'line', source: 'districts', minzoom: 5.2, paint: { 'line-color': '#2C3240', 'line-width': ['interpolate', ['linear'], ['zoom'], 5.2, 0.3, 9, 0.9] } })
      map.addLayer({ id: 'prov-line', type: 'line', source: 'provinces', paint: { 'line-color': '#475064', 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 8, 1.4] } })
      map.addLayer({ id: 'prov-hover', type: 'line', source: 'provinces', paint: { 'line-color': '#FFD100', 'line-width': 1.6, 'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 1, 0] } })

      // backbone links
      const linkFeats = D.links.map((l) => {
        const a = D.sites[D.siteIdx.get(l.from_site)!]
        const b = D.sites[D.siteIdx.get(l.to_site)!]
        const T = propsRef.current.policy.colour_thresholds.link_util
        const st = l.fault_state === 'down' ? 2 : l.fault_state === 'degraded' ? Math.max(1, statusOf(l.util_pct, T)) : statusOf(l.util_pct, T)
        return {
          type: 'Feature' as const,
          properties: { id: l.link_id, s: st, t: l.type, u: l.util_pct },
          geometry: { type: 'LineString' as const, coordinates: [[a.lon, a.lat], [b.lon, b.lat]] },
        }
      })
      map.addSource('links', { type: 'geojson', data: { type: 'FeatureCollection', features: linkFeats } })
      map.addLayer({
        id: 'links',
        type: 'line',
        source: 'links',
        filter: ['in', ['get', 't'], ['literal', ['fibre', 'submarine']]],
        layout: { visibility: 'none', 'line-cap': 'round' },
        paint: { 'line-color': STATUS_EXPR, 'line-width': ['match', ['get', 't'], 'submarine', 2.2, 1.8], 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'links-dash',
        type: 'line',
        source: 'links',
        filter: ['in', ['get', 't'], ['literal', ['microwave', 'satellite']]],
        layout: { visibility: 'none' },
        paint: { 'line-color': STATUS_EXPR, 'line-width': ['case', ['>=', ['get', 's'], 2], 2.4, 1.2], 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 },
      })
      map.addLayer({
        id: 'links-hit',
        type: 'line',
        source: 'links',
        layout: { visibility: 'none' },
        paint: { 'line-color': '#000', 'line-opacity': 0, 'line-width': 8 },
      })

      map.addSource('hot', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'hot-glow', type: 'circle', source: 'hot', maxzoom: NATIONAL_MAX, paint: { 'circle-radius': 10, 'circle-color': ['match', ['get', 's'], 2, STATUS.bad, 3, STATUS.prog, STATUS.warn], 'circle-opacity': 0.22, 'circle-blur': 0.6 } })
      map.addLayer({ id: 'hot', type: 'circle', source: 'hot', maxzoom: NATIONAL_MAX, paint: { 'circle-radius': 3, 'circle-color': ['match', ['get', 's'], 2, STATUS.bad, 3, STATUS.prog, STATUS.warn], 'circle-stroke-color': '#0A0C10', 'circle-stroke-width': 0.6 } })

      map.addSource('sites', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
        cluster: true,
        clusterMaxZoom: 8,
        clusterRadius: 42,
        clusterProperties: {
          red: ['+', ['case', ['==', ['get', 's'], 2], 1, 0]],
          amber: ['+', ['case', ['==', ['get', 's'], 1], 1, 0]],
          prog: ['+', ['get', 'p']],
        },
      })
      map.addLayer({
        id: 'clusters',
        type: 'circle',
        source: 'sites',
        minzoom: NATIONAL_MAX,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1B1F28',
          'circle-radius': ['step', ['get', 'point_count'], 11, 20, 14, 60, 18, 150, 22],
          'circle-stroke-width': 2.4,
          'circle-stroke-color': ['case', ['>', ['get', 'red'], 0], STATUS.bad, ['>', ['get', 'amber'], 0], STATUS.warn, STATUS.ok],
        },
      })
      map.addLayer({
        id: 'site-points',
        type: 'circle',
        source: 'sites',
        minzoom: NATIONAL_MAX,
        filter: ['!', ['has', 'point_count']],
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 3.2, 9, 5, 12, 7, 14, 9],
          'circle-color': STATUS_EXPR,
          'circle-opacity': ['case', ['==', ['get', 'd'], 1], 0.22, 1],
          'circle-stroke-width': ['case', ['==', ['get', 'po'], 1], 2.2, 0.6],
          'circle-stroke-color': ['case', ['==', ['get', 'po'], 1], STATUS.prog, '#0A0C10'],
        },
      })
      map.addSource('sectors', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer(
        { id: 'sectors', type: 'fill', source: 'sectors', minzoom: SECTOR_MIN, paint: { 'fill-color': STATUS_EXPR, 'fill-opacity': 0.42, 'fill-outline-color': '#0A0C10' } },
        'site-points',
      )
      map.addSource('highlight', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'highlight', type: 'circle', source: 'highlight', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 7, 10, 11], 'circle-color': 'transparent', 'circle-stroke-color': '#FFD100', 'circle-stroke-width': 1.4 } })
      map.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
      map.addLayer({ id: 'selected', type: 'circle', source: 'selected', paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 9, 10, 15], 'circle-color': 'transparent', 'circle-stroke-color': '#FFD100', 'circle-stroke-width': 2.5 } })

      map.addSource('cdn', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: D.cdn.map((c) => ({
            type: 'Feature' as const,
            properties: { id: c.pop_id, s: statusOf(c.cache_hit_pct, propsRef.current.policy.colour_thresholds.cache_hit), e: c.egress_gbps },
            geometry: { type: 'Point' as const, coordinates: [c.lon + (c.city === 'Jakarta' ? (Number(c.pop_id.slice(-1)) - 2.5) * 0.12 : 0), c.lat] },
          })),
        },
      })
      map.addLayer({
        id: 'cdn',
        type: 'circle',
        source: 'cdn',
        layout: { visibility: 'none' },
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'e'], 20, 6, 400, 16],
          'circle-color': '#0A0C10',
          'circle-stroke-color': STATUS_EXPR,
          'circle-stroke-width': 3,
        },
      })

      // province labels (HTML markers keep the prototype free of external glyph servers)
      for (const pr of D.provinces) {
        const div = document.createElement('div')
        div.className = 'nicc-prov-label pointer-events-none select-none text-[10px] font-semibold uppercase tracking-wider text-[#8A92A3]'
        div.textContent = pr.name
        provLabels.current.push(new maplibregl.Marker({ element: div }).setLngLat(pr.center).addTo(map))
      }
      const toggleLabels = () => {
        const z = map.getZoom()
        for (const m of provLabels.current) m.getElement().style.display = z < 4.9 || z > 6.8 || propsRef.current.compact ? 'none' : 'block'
      }
      map.on('zoom', toggleLabels)
      toggleLabels()

      loaded.current = true
      if (propsRef.current.scoped) {
        for (const l of ['clusters', 'site-points']) map.setLayerZoomRange(l, 4.6, 24)
        for (const l of ['hot', 'hot-glow']) map.setLayerZoomRange(l, 0, 4.6)
      }
      applyData()
      applyVisibility()
      applySelected()
      applyHighlight()
      if (propsRef.current.fit) map.fitBounds(propsRef.current.fit.bounds, { padding: propsRef.current.compact ? { top: 150, bottom: 90, left: 20, right: 20 } : { top: 150, bottom: 100, left: 260, right: 60 }, duration: 0, maxZoom: 11 })
    })

    // interactions
    let hoverProv: string | null = null
    map.on('mousemove', (e) => {
      const P = propsRef.current
      const feats = map.queryRenderedFeatures(e.point, { layers: ['site-points', 'hot', 'cdn', 'links-hit', 'clusters'].filter((l) => map.getLayer(l)) })
      const f = feats[0]
      const setProvHover = (id: string | null) => {
        if (hoverProv) map.setFeatureState({ source: 'provinces', id: hoverProv }, { hover: false })
        hoverProv = id
        if (id) map.setFeatureState({ source: 'provinces', id }, { hover: true })
      }
      if (f && f.layer.id !== 'clusters') {
        map.getCanvas().style.cursor = 'pointer'
        setProvHover(null)
        const kind = f.layer.id === 'cdn' ? 'cdn' : f.layer.id === 'links-hit' ? 'link' : 'site'
        P.onHover?.({ kind, id: String(f.properties!.id), x: e.point.x, y: e.point.y })
        return
      }
      if (f && f.layer.id === 'clusters') {
        map.getCanvas().style.cursor = 'zoom-in'
        P.onHover?.(null)
        return
      }
      if (map.getZoom() < NATIONAL_MAX + 0.6) {
        const pf = map.queryRenderedFeatures(e.point, { layers: ['prov-fill'] })[0]
        if (pf) {
          map.getCanvas().style.cursor = 'pointer'
          setProvHover(String(pf.id))
          P.onHover?.({ kind: 'province', id: String(pf.id), x: e.point.x, y: e.point.y })
          return
        }
      }
      setProvHover(null)
      map.getCanvas().style.cursor = ''
      P.onHover?.(null)
    })
    map.on('mouseout', () => propsRef.current.onHover?.(null))
    map.on('click', (e) => {
      const P = propsRef.current
      const feats = map.queryRenderedFeatures(e.point, { layers: ['site-points', 'hot', 'clusters', 'cdn'].filter((l) => map.getLayer(l)) })
      const f = feats[0]
      if (f?.layer.id === 'clusters') {
        const src = map.getSource('sites') as GeoJSONSource
        src.getClusterExpansionZoom(f.properties!.cluster_id).then((z) => {
          map.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom: Math.min(z + 0.3, 13), duration: 600 })
        })
        return
      }
      if (f && (f.layer.id === 'site-points' || f.layer.id === 'hot')) {
        P.onSiteClick?.(String(f.properties!.id))
        return
      }
      if (map.getZoom() < NATIONAL_MAX + 0.6) {
        const pf = map.queryRenderedFeatures(e.point, { layers: ['prov-fill'] })[0]
        if (pf) {
          const pr = db().provById[String(pf.id)]
          map.fitBounds(pr.bbox as [number, number, number, number], { padding: 60, duration: 800 })
          P.onProvinceClick?.(pr.id)
        }
      }
    })

    // cluster count labels
    let raf = 0
    const updateClusterLabels = () => {
      raf = 0
      if (!map.getSource('sites') || !map.isSourceLoaded('sites')) return
      const seen = new Set<number>()
      if (map.getZoom() >= NATIONAL_MAX) {
        for (const f of map.querySourceFeatures('sites', { filter: ['has', 'point_count'] })) {
          const id = f.properties!.cluster_id as number
          if (seen.has(id)) continue
          seen.add(id)
          let m = clusterMarkers.current.get(id)
          if (!m) {
            const d = document.createElement('div')
            d.className = 'pointer-events-none tnum text-[10.5px] font-bold text-white'
            m = new maplibregl.Marker({ element: d }).setLngLat((f.geometry as GeoJSON.Point).coordinates as [number, number]).addTo(map)
            clusterMarkers.current.set(id, m)
          }
          m.getElement().textContent = String(f.properties!.point_count)
        }
      }
      for (const [id, m] of clusterMarkers.current) {
        if (!seen.has(id)) {
          m.remove()
          clusterMarkers.current.delete(id)
        }
      }
    }
    map.on('render', () => {
      if (!raf) raf = requestAnimationFrame(updateClusterLabels)
    })
    map.on('moveend', () => {
      applySectors()
      const P = propsRef.current
      if (P.onCamera && !syncing.current) {
        const c = map.getCenter()
        P.onCamera({ center: [c.lng, c.lat], zoom: map.getZoom() })
      }
      syncing.current = false
    })

    return () => {
      map.remove()
      mapRef.current = null
      loaded.current = false
      clusterMarkers.current.clear()
      provLabels.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- data -----------------------------------------------------------------------
  function applyData() {
    const map = mapRef.current
    if (!map || !loaded.current) return
    const D = db()
    const P = propsRef.current
    const { res } = P
    const showProg = P.overlays.program || P.layer === 'program'
    const feats: GeoJSON.Feature[] = []
    const hot: GeoJSON.Feature[] = []
    for (let i = 0; i < D.sites.length; i++) {
      if (!res.visible[i]) continue
      const s = D.sites[i]
      const st = res.status[i]
      const props = { id: s.site_id, s: st, d: res.inScope[i] ? 0 : 1, p: res.inProgram[i], po: showProg && res.inProgram[i] ? 1 : 0 }
      const g = { type: 'Point' as const, coordinates: [s.lon, s.lat] }
      feats.push({ type: 'Feature', properties: props, geometry: g })
      if ((st === 2 && P.layer !== 'revenue') || (P.layer === 'program' && st === 3)) hot.push({ type: 'Feature', properties: props, geometry: g })
    }
    ;(map.getSource('sites') as GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
    ;(map.getSource('hot') as GeoJSONSource).setData({ type: 'FeatureCollection', features: hot })
    const roll = provinceRollup(res, P.layer)
    const scopedProv = new Set<string>()
    if (P.scoped) for (let i = 0; i < D.sites.length; i++) if (res.inScope[i]) scopedProv.add(D.sites[i].province_id)
    for (const pr of D.provinces) {
      const r = roll.get(pr.id)
      const out = P.scoped && !scopedProv.has(pr.id)
      map.setFeatureState({ source: 'provinces', id: pr.id }, { c: out ? '#111318' : r ? provColor(r.status) : '#14171D' })
    }
    applySectors()
  }

  function applySectors() {
    const map = mapRef.current
    if (!map || !loaded.current) return
    const src = map.getSource('sectors') as GeoJSONSource | undefined
    if (!src) return
    if (map.getZoom() < SECTOR_MIN - 0.3) {
      src.setData({ type: 'FeatureCollection', features: [] })
      return
    }
    const D = db()
    const b = map.getBounds()
    const res = propsRef.current.res
    const feats: GeoJSON.Feature[] = []
    for (let i = 0; i < D.sites.length; i++) {
      const s = D.sites[i]
      if (!res.visible[i] || s.lon < b.getWest() || s.lon > b.getEast() || s.lat < b.getSouth() || s.lat > b.getNorth()) continue
      for (const c of D.cellsBySite.get(s.site_id) ?? []) {
        const r = c.band.startsWith('N') ? 0.0042 : c.band === 'L900' ? 0.0075 : 0.0058
        feats.push({ type: 'Feature', properties: { id: s.site_id, s: res.status[i] }, geometry: { type: 'Polygon', coordinates: [sectorPolygon(s.lon, s.lat, c.azimuth, r)] } })
      }
    }
    src.setData({ type: 'FeatureCollection', features: feats })
  }

  function applyVisibility() {
    const map = mapRef.current
    if (!map || !loaded.current) return
    const P = propsRef.current
    const linksOn = P.layer === 'backbone' || P.overlays.backbone
    const cdnOn = P.layer === 'cdn' || P.overlays.cdn
    map.setLayoutProperty('links', 'visibility', linksOn ? 'visible' : 'none')
    map.setLayoutProperty('links-hit', 'visibility', linksOn ? 'visible' : 'none')
    map.setLayoutProperty('links-dash', 'visibility', linksOn ? 'visible' : 'none')
    map.setLayoutProperty('cdn', 'visibility', cdnOn ? 'visible' : 'none')
    const dimSites = P.layer === 'backbone' || P.layer === 'cdn'
    map.setPaintProperty('site-points', 'circle-opacity', dimSites ? 0.18 : ['case', ['==', ['get', 'd'], 1], 0.22, 1])
    map.setPaintProperty('hot', 'circle-opacity', dimSites ? 0 : 1)
    map.setPaintProperty('hot-glow', 'circle-opacity', dimSites ? 0 : 0.22)
  }

  function applySelected() {
    const map = mapRef.current
    if (!map || !loaded.current) return
    const D = db()
    const id = propsRef.current.selectedSite
    const s = id ? D.sites[D.siteIdx.get(id) ?? -1] : null
    ;(map.getSource('selected') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: s ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [s.lon, s.lat] } }] : [],
    })
  }

  function applyHighlight() {
    const map = mapRef.current
    if (!map || !loaded.current) return
    const D = db()
    const ids = propsRef.current.highlightSites ?? []
    ;(map.getSource('highlight') as GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: ids.map((id) => {
        const s = D.sites[D.siteIdx.get(id)!]
        return { type: 'Feature' as const, properties: {}, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] } }
      }),
    })
  }

  useEffect(applyData, [p.res, p.overlays.program, p.layer, p.scoped])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current) return
    const z = p.scoped ? 4.6 : NATIONAL_MAX
    map.setLayerZoomRange('clusters', z, 24)
    map.setLayerZoomRange('site-points', z, 24)
    map.setLayerZoomRange('hot', 0, z)
    map.setLayerZoomRange('hot-glow', 0, z)
  }, [p.scoped])
  useEffect(applyVisibility, [p.layer, p.overlays])
  useEffect(applySelected, [p.selectedSite])
  useEffect(applyHighlight, [p.highlightSites])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded.current || !p.fit) return
    map.fitBounds(p.fit.bounds, { padding: p.compact ? { top: 150, bottom: 90, left: 20, right: 20 } : { top: 150, bottom: 100, left: 260, right: 60 }, duration: 900, maxZoom: 11.5 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.fit?.key])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !p.camera) return
    const c = map.getCenter()
    if (Math.abs(c.lng - p.camera.center[0]) < 1e-6 && Math.abs(map.getZoom() - p.camera.zoom) < 1e-6) return
    syncing.current = true
    map.jumpTo({ center: p.camera.center, zoom: p.camera.zoom })
  }, [p.camera])

  return <div ref={el} className="absolute inset-0" />
}
