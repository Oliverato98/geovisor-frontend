/**
 * components/Map/MapView.tsx
 * Componente central del geovisor: mapa MapLibre con capas, herramientas y popups.
 */
import { useEffect, useRef, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useGeoStore } from '../../store/useGeoStore';
import { BASEMAPS, MARTIN_URL } from '../../services/api';
import * as turf from '@turf/turf';

// Calarcá, Quindío — centro del mapa por defecto
const CALARCA_CENTER: [number, number] = [-75.6427, 4.5369];
const CALARCA_ZOOM = 13;

export default function MapView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const measurePointsRef = useRef<[number, number][]>([]);
  const drawingRef = useRef<[number, number][]>([]);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const {
    setMap, baseMap, layers, activeTool,
    setMeasureResult, setSelectedFeature, setRightPanelOpen,
    setStreetViewCoords, addNotification, user,
    analysisLayers,
  } = useGeoStore();

  // Los clics de capa se registran una sola vez por capa, así que la herramienta
  // activa se consulta por referencia y no por clausura.
  const activeToolRef = useRef(activeTool);

  // ── Inicializar mapa ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAPS['osm'].style,
      center: CALARCA_CENTER,
      zoom: CALARCA_ZOOM,
      attributionControl: false,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new maplibregl.FullscreenControl(), 'bottom-right');

    map.on('load', () => {
      setMap(map);
      mapRef.current = map;
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [setMap]);

  // ── Cambiar mapa base ─────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const style = BASEMAPS[baseMap].style;
    map.setStyle(style);
    // Re-agregar capas GIS después de cambiar estilo
    map.once('styledata', () => syncLayers(map));
  }, [baseMap]);

  // ── Sincronizar capas GIS ─────────────────────────────────────────────────
  const syncLayers = useCallback((map: maplibregl.Map) => {
    layers.forEach((layer) => {
      const srcId = `src-${layer.id}`;
      const lyrId = `lyr-${layer.id}`;
      const lyrOutlineId = `lyr-${layer.id}-outline`;
      const style: any = layer.style ?? {};

      if (!map.getSource(srcId)) {
        const tileUrl = layer.tile_url
          ?? `${MARTIN_URL}/${layer.postgis_table}/{z}/{x}/{y}`;
        map.addSource(srcId, {
          type: 'vector', tiles: [tileUrl],
          minzoom: 1, maxzoom: 18,
        });
      }

      const geomType = layer.geometry_type?.toLowerCase() ?? '';
      const outlineOnly = style.outline_only === true;

      // ── Polígonos ──
      if (geomType.includes('polygon') || (!geomType.includes('point') && !geomType.includes('line'))) {
        const fillColor   = style.fill_color   ?? '#3b82f6';
        const fillOpacity = (style.fill_opacity ?? 0.5) * layer.opacity;
        const outlineColor = style.fill_outline_color ?? '#1e40af';
        const outlineWidth = style.fill_outline_width ?? 1.5;

        if (!outlineOnly) {
          if (!map.getLayer(lyrId)) {
            map.addLayer({
              id: lyrId, type: 'fill', source: srcId,
              'source-layer': layer.postgis_table,
              paint: { 'fill-color': fillColor, 'fill-opacity': fillOpacity },
            });
            map.on('click', lyrId, (e) => handleFeatureClick(e, map, layer));
            map.on('mouseenter', lyrId, () => { map.getCanvas().style.cursor = 'pointer'; });
            map.on('mouseleave', lyrId, () => { map.getCanvas().style.cursor = ''; });
          } else {
            map.setPaintProperty(lyrId, 'fill-color', fillColor);
            map.setPaintProperty(lyrId, 'fill-opacity', fillOpacity);
          }
          map.setLayoutProperty(lyrId, 'visibility', layer.visible ? 'visible' : 'none');
        } else {
          if (map.getLayer(lyrId)) map.removeLayer(lyrId);
        }

        // Borde del polígono (siempre se dibuja como línea separada)
        if (!map.getLayer(lyrOutlineId)) {
          map.addLayer({
            id: lyrOutlineId, type: 'line', source: srcId,
            'source-layer': layer.postgis_table,
            paint: {
              'line-color': outlineColor,
              'line-width': outlineWidth,
              'line-opacity': layer.opacity,
            },
          });
          if (outlineOnly) {
            map.on('click', lyrOutlineId, (e) => handleFeatureClick(e, map, layer));
          }
        } else {
          map.setPaintProperty(lyrOutlineId, 'line-color', outlineColor);
          map.setPaintProperty(lyrOutlineId, 'line-width', outlineWidth);
          map.setPaintProperty(lyrOutlineId, 'line-opacity', layer.opacity);
        }
        map.setLayoutProperty(lyrOutlineId, 'visibility', layer.visible ? 'visible' : 'none');
      }
      // ── Puntos ──
      else if (geomType.includes('point')) {
        const config: any = {
          id: lyrId, type: 'circle', source: srcId,
          'source-layer': layer.postgis_table,
          paint: {
            'circle-radius': style.circle_radius ?? 6,
            'circle-color': outlineOnly ? 'rgba(0,0,0,0)' : (style.circle_color ?? '#2dd4a0'),
            'circle-stroke-width': style.circle_stroke_width ?? 1.5,
            'circle-stroke-color': style.circle_stroke_color ?? '#ffffff',
            'circle-opacity': layer.opacity,
          },
        };
        if (!map.getLayer(lyrId)) {
          map.addLayer(config);
          map.on('click', lyrId, (e) => handleFeatureClick(e, map, layer));
          map.on('mouseenter', lyrId, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', lyrId, () => { map.getCanvas().style.cursor = ''; });
        } else {
          map.setPaintProperty(lyrId, 'circle-radius', config.paint['circle-radius']);
          map.setPaintProperty(lyrId, 'circle-color', config.paint['circle-color']);
          map.setPaintProperty(lyrId, 'circle-stroke-width', config.paint['circle-stroke-width']);
          map.setPaintProperty(lyrId, 'circle-stroke-color', config.paint['circle-stroke-color']);
          map.setPaintProperty(lyrId, 'circle-opacity', config.paint['circle-opacity']);
        }
        map.setLayoutProperty(lyrId, 'visibility', layer.visible ? 'visible' : 'none');
      }
      // ── Líneas ──
      else if (geomType.includes('line')) {
        const config: any = {
          id: lyrId, type: 'line', source: srcId,
          'source-layer': layer.postgis_table,
          paint: {
            'line-color': style.line_color ?? '#f59e0b',
            'line-width': style.line_width ?? 2,
            'line-opacity': (style.line_opacity ?? 1) * layer.opacity,
          },
        };
        if (!map.getLayer(lyrId)) {
          map.addLayer(config);
          map.on('click', lyrId, (e) => handleFeatureClick(e, map, layer));
          map.on('mouseenter', lyrId, () => { map.getCanvas().style.cursor = 'pointer'; });
          map.on('mouseleave', lyrId, () => { map.getCanvas().style.cursor = ''; });
        } else {
          map.setPaintProperty(lyrId, 'line-color', config.paint['line-color']);
          map.setPaintProperty(lyrId, 'line-width', config.paint['line-width']);
          map.setPaintProperty(lyrId, 'line-opacity', config.paint['line-opacity']);
        }
        map.setLayoutProperty(lyrId, 'visibility', layer.visible ? 'visible' : 'none');
      }
    });
  }, [layers, activeTool]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    syncLayers(map);
  }, [layers, syncLayers]);

  // ── Sincronizar capas de análisis (GeoJSON temporal) ──────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    analysisLayers.forEach((al) => {
      const srcId = `analysis-src-${al.id}`;
      const lyrId = `analysis-lyr-${al.id}`;
      const lyrOutlineId = `analysis-lyr-${al.id}-outline`;
      const style: any = al.style ?? {};

      if (!map.getSource(srcId)) {
        map.addSource(srcId, { type: 'geojson', data: al.geojson });
      } else {
        (map.getSource(srcId) as maplibregl.GeoJSONSource).setData(al.geojson);
      }

      const geomType = al.geometry_type?.toLowerCase() ?? 'polygon';
      const outlineOnly = style.outline_only === true;

      if (geomType.includes('point')) {
        if (!map.getLayer(lyrId)) {
          map.addLayer({
            id: lyrId, type: 'circle', source: srcId,
            paint: {
              'circle-radius': style.circle_radius ?? 7,
              'circle-color': outlineOnly ? 'rgba(0,0,0,0)' : (style.circle_color ?? '#a855f7'),
              'circle-stroke-width': style.circle_stroke_width ?? 2,
              'circle-stroke-color': style.circle_stroke_color ?? '#7e22ce',
              'circle-opacity': al.opacity,
            },
          });
        } else {
          map.setPaintProperty(lyrId, 'circle-color', outlineOnly ? 'rgba(0,0,0,0)' : (style.circle_color ?? '#a855f7'));
          map.setPaintProperty(lyrId, 'circle-radius', style.circle_radius ?? 7);
          map.setPaintProperty(lyrId, 'circle-stroke-color', style.circle_stroke_color ?? '#7e22ce');
          map.setPaintProperty(lyrId, 'circle-stroke-width', style.circle_stroke_width ?? 2);
        }
        map.setLayoutProperty(lyrId, 'visibility', al.visible ? 'visible' : 'none');
      } else if (geomType.includes('line')) {
        if (!map.getLayer(lyrId)) {
          map.addLayer({
            id: lyrId, type: 'line', source: srcId,
            paint: {
              'line-color': style.line_color ?? '#a855f7',
              'line-width': style.line_width ?? 3,
              'line-opacity': (style.line_opacity ?? 1) * al.opacity,
            },
          });
        } else {
          map.setPaintProperty(lyrId, 'line-color', style.line_color ?? '#a855f7');
          map.setPaintProperty(lyrId, 'line-width', style.line_width ?? 3);
          map.setPaintProperty(lyrId, 'line-opacity', (style.line_opacity ?? 1) * al.opacity);
        }
        map.setLayoutProperty(lyrId, 'visibility', al.visible ? 'visible' : 'none');
      } else {
        const fillColor = style.fill_color ?? '#a855f7';
        const fillOpacity = (style.fill_opacity ?? 0.4) * al.opacity;
        const outlineColor = style.fill_outline_color ?? '#7e22ce';
        const outlineWidth = style.fill_outline_width ?? 2;

        if (!outlineOnly) {
          if (!map.getLayer(lyrId)) {
            map.addLayer({
              id: lyrId, type: 'fill', source: srcId,
              paint: { 'fill-color': fillColor, 'fill-opacity': fillOpacity },
            });
          } else {
            map.setPaintProperty(lyrId, 'fill-color', fillColor);
            map.setPaintProperty(lyrId, 'fill-opacity', fillOpacity);
          }
          map.setLayoutProperty(lyrId, 'visibility', al.visible ? 'visible' : 'none');
        } else if (map.getLayer(lyrId)) {
          map.removeLayer(lyrId);
        }

        if (!map.getLayer(lyrOutlineId)) {
          map.addLayer({
            id: lyrOutlineId, type: 'line', source: srcId,
            paint: { 'line-color': outlineColor, 'line-width': outlineWidth, 'line-opacity': al.opacity },
          });
        } else {
          map.setPaintProperty(lyrOutlineId, 'line-color', outlineColor);
          map.setPaintProperty(lyrOutlineId, 'line-width', outlineWidth);
          map.setPaintProperty(lyrOutlineId, 'line-opacity', al.opacity);
        }
        map.setLayoutProperty(lyrOutlineId, 'visibility', al.visible ? 'visible' : 'none');
      }
    });

    // Limpiar capas que ya no existen
    const currentIds = new Set(analysisLayers.map(a => a.id));
    const stylesObj = map.getStyle();
    if (stylesObj?.layers) {
      stylesObj.layers.forEach((l: any) => {
        if (l.id.startsWith('analysis-lyr-')) {
          const id = l.id.replace('analysis-lyr-', '').replace('-outline', '');
          if (!currentIds.has(id)) {
            if (map.getLayer(l.id)) map.removeLayer(l.id);
          }
        }
      });
      stylesObj.layers.forEach((l: any) => {
        if (l.id.startsWith('analysis-src-')) {
          const id = l.id.replace('analysis-src-', '');
          if (!currentIds.has(id) && map.getSource(l.id)) map.removeSource(l.id);
        }
      });
    }
  }, [analysisLayers]);

  /**
   * Pinta los vértices de la figura en curso, numerados, para que se vea
   * exactamente dónde va cada clic.
   */
  const pintarVertices = useCallback((map: maplibregl.Map, pts: [number, number][]) => {
    const datos = {
      type: 'FeatureCollection' as const,
      features: pts.map((p, i) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: p },
        properties: { n: String(i + 1) },
      })),
    };

    if (!map.getSource('vertices')) {
      map.addSource('vertices', { type: 'geojson', data: datos });
      map.addLayer({
        id: 'vertices-punto', type: 'circle', source: 'vertices',
        paint: {
          'circle-radius': 7, 'circle-color': '#ffffff',
          'circle-stroke-width': 2.5, 'circle-stroke-color': '#2dd4a0',
        },
      });
      map.addLayer({
        id: 'vertices-numero', type: 'symbol', source: 'vertices',
        layout: {
          'text-field': ['get', 'n'], 'text-size': 11,
          'text-allow-overlap': true, 'text-ignore-placement': true,
        },
        paint: { 'text-color': '#0f1117' },
      });
    } else {
      (map.getSource('vertices') as maplibregl.GeoJSONSource).setData(datos);
    }
  }, []);

  /** Borra la figura en curso y sus vértices. */
  const limpiarDibujo = useCallback((map: maplibregl.Map) => {
    for (const id of ['vertices-numero', 'vertices-punto', 'dibujo-linea', 'dibujo-relleno', 'dibujo-borde']) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    for (const id of ['vertices', 'dibujo']) {
      if (map.getSource(id)) map.removeSource(id);
    }
  }, []);

  useEffect(() => {
    activeToolRef.current = activeTool;
    // Al tomar una herramienta se cierra la ficha de atributos abierta
    if (activeTool !== 'none') {
      popupRef.current?.remove();
      popupRef.current = null;
    }
    // Cada herramienta empieza con el lienzo limpio
    const map = mapRef.current;
    if (map) {
      measurePointsRef.current = [];
      drawingRef.current = [];
      limpiarDibujo(map);
      setMeasureResult(null);
    }
  }, [activeTool, limpiarDibujo, setMeasureResult]);

  // ── Popup de atributos ────────────────────────────────────────────────────
  const handleFeatureClick = useCallback((
    e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] },
    map: maplibregl.Map,
    layer: { name: string; attributes: Record<string, string> }
  ) => {
    // Con una herramienta activa el clic pertenece a la medición o al dibujo:
    // sin esto la ficha de atributos se lleva todos los clics, porque casi
    // siempre hay una capa bajo el cursor.
    if (activeToolRef.current !== 'none') return;
    if (!e.features?.[0]) return;
    const feature = e.features[0];
    const props = feature.properties ?? {};

    popupRef.current?.remove();

    // Construir HTML del popup
    const rows = Object.entries(props)
      .filter(([k]) => !k.startsWith('_'))
      .slice(0, 15)
      .map(([k, v]) => `
        <tr>
          <td style="color:#7b8299;padding:3px 8px;font-size:11px;white-space:nowrap">${k}</td>
          <td style="padding:3px 8px;font-size:11px;font-family:'DM Mono',monospace;word-break:break-all">${v ?? '—'}</td>
        </tr>
      `).join('');

    const html = `
      <div style="padding:12px 14px 4px;border-bottom:1px solid rgba(255,255,255,0.08)">
        <div style="font-size:11px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;color:#2dd4a0">${layer.name}</div>
      </div>
      <div style="max-height:240px;overflow-y:auto;padding:4px 0">
        <table style="width:100%;border-collapse:collapse">${rows || '<tr><td style="padding:12px;color:#7b8299">Sin atributos</td></tr>'}</table>
      </div>
      <div style="padding:8px 14px;border-top:1px solid rgba(255,255,255,0.08);display:flex;gap:8px">
        <button onclick="window.__openStreetView(${e.lngLat.lat},${e.lngLat.lng})"
          style="font-size:11px;background:rgba(45,212,160,0.15);border:1px solid rgba(45,212,160,0.3);color:#2dd4a0;padding:4px 10px;border-radius:4px;cursor:pointer">
          Street View
        </button>
      </div>
    `;

    popupRef.current = new maplibregl.Popup({ closeButton: true, maxWidth: '320px' })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);

    setSelectedFeature(props);
    setRightPanelOpen(true);
  }, [setSelectedFeature, setRightPanelOpen]);

  // ── Street View desde el mapa ─────────────────────────────────────────────
  useEffect(() => {
    (window as any).__openStreetView = (lat: number, lng: number) => {
      setStreetViewCoords({ lat, lng });
      setRightPanelOpen(true);
      popupRef.current?.remove();
    };
  }, [setStreetViewCoords, setRightPanelOpen]);

  // ── Herramientas de medición y dibujo ─────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.getCanvas().style.cursor = activeTool === 'none' ? '' : 'crosshair';

    if (activeTool === 'none') {
      measurePointsRef.current = [];
      drawingRef.current = [];
      setMeasureResult(null);
      // Limpiar capas de medición
      ['measure-points', 'measure-line', 'draw-preview'].forEach((id) => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
      });
      return;
    }

    const handleClick = (e: maplibregl.MapMouseEvent) => {
      const coords: [number, number] = [e.lngLat.lng, e.lngLat.lat];

      if (activeTool === 'measure-distance') {
        measurePointsRef.current.push(coords);
        const pts = measurePointsRef.current;

        if (pts.length >= 2) {
          const line = turf.lineString(pts);
          const dist = turf.length(line, { units: 'kilometers' });
          const label = dist < 1
            ? `${(dist * 1000).toFixed(0)} m`
            : `${dist.toFixed(3)} km`;
          setMeasureResult(`Distancia: ${label}`);
        }

        // Agregar punto visual
        const src = 'measure-points';
        if (!map.getSource(src)) {
          map.addSource(src, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
          map.addLayer({ id: src, type: 'circle', source: src, paint: { 'circle-radius': 5, 'circle-color': '#f59e0b', 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
        }
        (map.getSource(src) as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: pts.map((p) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: p }, properties: {} })),
        });

        if (pts.length >= 2) {
          const lineSrc = 'measure-line';
          if (!map.getSource(lineSrc)) {
            map.addSource(lineSrc, { type: 'geojson', data: turf.lineString(pts) });
            map.addLayer({ id: lineSrc, type: 'line', source: lineSrc, paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-dasharray': [2, 2] } });
          } else {
            (map.getSource(lineSrc) as maplibregl.GeoJSONSource).setData(turf.lineString(pts));
          }
        }
      }

      if (activeTool === 'measure-area') {
        drawingRef.current.push(coords);
        const pts = drawingRef.current;

        if (pts.length >= 3) {
          const polygon = turf.polygon([[...pts, pts[0]]]);
          const areaSqM = turf.area(polygon);
          const label = areaSqM < 10000
            ? `${areaSqM.toFixed(0)} m²`
            : `${(areaSqM / 10000).toFixed(2)} ha`;
          setMeasureResult(`Área: ${label}`);

          const src = 'draw-preview';
          if (!map.getSource(src)) {
            map.addSource(src, { type: 'geojson', data: polygon });
            map.addLayer({ id: src, type: 'fill', source: src, paint: { 'fill-color': '#2dd4a0', 'fill-opacity': 0.25, 'fill-outline-color': '#2dd4a0' } });
          } else {
            (map.getSource(src) as maplibregl.GeoJSONSource).setData(polygon);
          }
        }
        pintarVertices(map, pts);
      }

      // ── Dibujar punto ──────────────────────────────────────────────────
      if (activeTool === 'draw-point') {
        drawingRef.current.push(coords);
        pintarVertices(map, drawingRef.current);
        const n = drawingRef.current.length;
        setMeasureResult(`${n} punto${n === 1 ? '' : 's'}`);
        addNotification({
          type: 'success',
          message: `Punto ${n}: ${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}`,
        });
      }

      // ── Dibujar línea ──────────────────────────────────────────────────
      if (activeTool === 'draw-line') {
        drawingRef.current.push(coords);
        const pts = drawingRef.current;
        pintarVertices(map, pts);

        if (pts.length >= 2) {
          const linea = turf.lineString(pts);
          if (!map.getSource('dibujo')) {
            map.addSource('dibujo', { type: 'geojson', data: linea });
            map.addLayer({
              id: 'dibujo-linea', type: 'line', source: 'dibujo',
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#2dd4a0', 'line-width': 3 },
            }, 'vertices-punto');
          } else {
            (map.getSource('dibujo') as maplibregl.GeoJSONSource).setData(linea);
          }
          const km = turf.length(linea, { units: 'kilometers' });
          setMeasureResult(
            `Vértice ${pts.length} · ${km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(3)} km`}`
          );
        } else {
          setMeasureResult('Vértice 1 · haz clic para el siguiente');
        }
      }

      // ── Dibujar polígono ───────────────────────────────────────────────
      if (activeTool === 'draw-polygon') {
        drawingRef.current.push(coords);
        const pts = drawingRef.current;
        pintarVertices(map, pts);

        if (pts.length >= 3) {
          const poligono = turf.polygon([[...pts, pts[0]]]);
          if (!map.getSource('dibujo')) {
            map.addSource('dibujo', { type: 'geojson', data: poligono });
            map.addLayer({
              id: 'dibujo-relleno', type: 'fill', source: 'dibujo',
              paint: { 'fill-color': '#2dd4a0', 'fill-opacity': 0.2 },
            }, 'vertices-punto');
            map.addLayer({
              id: 'dibujo-borde', type: 'line', source: 'dibujo',
              paint: { 'line-color': '#2dd4a0', 'line-width': 2.5 },
            }, 'vertices-punto');
          } else {
            (map.getSource('dibujo') as maplibregl.GeoJSONSource).setData(poligono);
          }
          const ha = turf.area(poligono) / 10000;
          setMeasureResult(
            `Vértice ${pts.length} · ${ha < 1 ? `${(ha * 10000).toFixed(0)} m²` : `${ha.toFixed(2)} ha`}`
          );
        } else {
          // Con dos vértices aún no hay superficie: se muestra el avance
          if (pts.length === 2) {
            const linea = turf.lineString(pts);
            if (!map.getSource('dibujo')) {
              map.addSource('dibujo', { type: 'geojson', data: linea });
              map.addLayer({
                id: 'dibujo-linea', type: 'line', source: 'dibujo',
                paint: { 'line-color': '#2dd4a0', 'line-width': 2.5, 'line-dasharray': [2, 1] },
              }, 'vertices-punto');
            } else {
              (map.getSource('dibujo') as maplibregl.GeoJSONSource).setData(linea);
            }
          }
          setMeasureResult(
            pts.length === 1
              ? 'Vértice 1 · haz clic para el vértice 2'
              : 'Vértice 2 · un clic más cierra el polígono'
          );
        }
      }
    };

    // El efecto ya retornó si no hay herramienta activa, así que aquí siempre hay una.
    const handleDblClick = (e: maplibregl.MapMouseEvent) => {
      e.preventDefault();
      measurePointsRef.current = [];
      drawingRef.current = [];
      limpiarDibujo(map);
      setMeasureResult(null);
      addNotification({ type: 'info', message: 'Listo. Haz clic para empezar de nuevo.' });
    };

    map.on('click', handleClick);
    map.on('dblclick', handleDblClick);

    return () => {
      map.off('click', handleClick);
      map.off('dblclick', handleDblClick);
    };
  }, [activeTool, setMeasureResult, addNotification, pintarVertices, limpiarDibujo]);

  // ── Zoom a capa ───────────────────────────────────────────────────────────
  useEffect(() => {
    (window as any).__zoomToLayer = (layer: { bbox_minx: number; bbox_miny: number; bbox_maxx: number; bbox_maxy: number }) => {
      const map = mapRef.current;
      if (!map) return;
      map.fitBounds(
        [[layer.bbox_minx, layer.bbox_miny], [layer.bbox_maxx, layer.bbox_maxy]],
        { padding: 60, duration: 800 }
      );
    };

    (window as any).__zoomToBBox = (bbox: [number, number, number, number]) => {
      const map = mapRef.current;
      if (!map) return;
      map.fitBounds(
        [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
        { padding: 80, duration: 800 }
      );
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: 'absolute', inset: 0 }}
    />
  );
}
