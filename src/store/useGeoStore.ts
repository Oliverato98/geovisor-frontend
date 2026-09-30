/**
 * store/useGeoStore.ts
 * Estado global del geovisor usando Zustand.
 * Maneja: mapa base, capas activas, herramientas, auth, UI.
 */
import { create } from 'zustand';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { RASTERS, type RasterInfo } from '../data/rasters';

export type BaseMap = 'osm' | 'satellite' | 'topo' | 'dark';
export type ActiveTool = 'none' | 'measure-distance' | 'measure-area' | 'draw-point' | 'draw-line' | 'draw-polygon' | 'identify';

export interface GeoLayer {
  id: number;
  name: string;
  postgis_table: string;
  geometry_type: string;
  source_format: string;
  bbox_minx: number;
  bbox_miny: number;
  bbox_maxx: number;
  bbox_maxy: number;
  feature_count: number;
  attributes: Record<string, string>;
  style: Record<string, unknown>;
  is_public: boolean;
  /** Capa oficial del municipio: se ve y se simboliza, pero no se elimina. */
  protegida?: boolean;
  tile_url?: string;
  // Estado UI local
  visible: boolean;
  opacity: number;
}

/**
 * Una capa ráster del estudio. A diferencia de las vectoriales no vive en la
 * base de datos: es una imagen del propio geovisor, anclada por sus esquinas.
 */
export interface RasterLayer extends RasterInfo {
  visible: boolean;
  opacity: number;
}

export interface User {
  id: number;
  email: string;
  username: string;
  role: 'admin' | 'visitante';
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

interface GeoStore {
  // Mapa
  map: MapLibreMap | null;
  setMap: (map: MapLibreMap) => void;
  baseMap: BaseMap;
  setBaseMap: (bm: BaseMap) => void;

  // Capas
  layers: GeoLayer[];
  setLayers: (layers: GeoLayer[]) => void;
  addLayer: (layer: GeoLayer) => void;
  removeLayer: (id: number) => void;
  toggleLayerVisibility: (id: number) => void;
  setLayerOpacity: (id: number, opacity: number) => void;
  updateLayerStyle: (id: number, style: Record<string, unknown>) => void;

  // Capas ráster
  rasterLayers: RasterLayer[];
  toggleRasterVisibility: (id: string) => void;
  setRasterOpacity: (id: string, opacity: number) => void;
  hideAllRasters: () => void;

  // Herramientas
  activeTool: ActiveTool;
  setActiveTool: (tool: ActiveTool) => void;
  measureResult: string | null;
  setMeasureResult: (r: string | null) => void;

  // Auth
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;

  // UI
  leftPanelTab: 'layers' | 'upload' | 'analysis';
  setLeftPanelTab: (t: 'layers' | 'upload' | 'analysis') => void;
  rightPanelOpen: boolean;
  setRightPanelOpen: (open: boolean) => void;
  streetViewCoords: { lat: number; lng: number } | null;
  setStreetViewCoords: (coords: { lat: number; lng: number } | null) => void;
  selectedFeature: Record<string, unknown> | null;
  setSelectedFeature: (f: Record<string, unknown> | null) => void;

  // Notificaciones
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id'>) => void;
  removeNotification: (id: string) => void;

  // Loading
  isLoading: boolean;
  setLoading: (v: boolean) => void;

  // Capas de análisis (GeoJSON temporal en memoria)
  analysisLayers: AnalysisLayer[];
  addAnalysisLayer: (layer: AnalysisLayer) => void;
  removeAnalysisLayer: (id: string) => void;
  toggleAnalysisLayerVisibility: (id: string) => void;
  setAnalysisLayerStyle: (id: string, style: LayerStyle) => void;
}

export interface LayerStyle {
  // Para puntos
  circle_color?: string;
  circle_radius?: number;
  circle_stroke_color?: string;
  circle_stroke_width?: number;
  // Para líneas
  line_color?: string;
  line_width?: number;
  line_opacity?: number;
  // Para polígonos
  fill_color?: string;
  fill_opacity?: number;
  fill_outline_color?: string;
  fill_outline_width?: number;
  // Modo: relleno o solo contorno
  outline_only?: boolean;
}

export interface AnalysisLayer {
  id: string;          // ID único generado en frontend
  name: string;        // Nombre legible
  operation: 'buffer' | 'intersection' | 'dissolve';
  geojson: any;        // FeatureCollection completo
  geometry_type: string;
  feature_count: number;
  metadata: any;
  visible: boolean;
  opacity: number;
  style: LayerStyle;
  created_at: string;
}

export const useGeoStore = create<GeoStore>((set, get) => ({
  // Mapa
  map: null,
  setMap: (map) => set({ map }),
  baseMap: 'osm',
  setBaseMap: (baseMap) => set({ baseMap }),

  // Capas
  layers: [],
  setLayers: (layers) => set({
    layers: layers.map((l) => ({ ...l, visible: true, opacity: 1 })),
  }),
  addLayer: (layer) => set((s) => ({
    layers: [{ ...layer, visible: true, opacity: 1 }, ...s.layers],
  })),
  removeLayer: (id) => set((s) => ({ layers: s.layers.filter((l) => l.id !== id) })),
  toggleLayerVisibility: (id) =>
    set((s) => ({
      layers: s.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })),
  setLayerOpacity: (id, opacity) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, opacity } : l)),
    })),
  updateLayerStyle: (id, style) =>
    set((s) => ({
      layers: s.layers.map((l) => (l.id === id ? { ...l, style } : l)),
    })),

  // Capas ráster. Nacen apagadas: son trece y encendidas de entrada taparían
  // el mapa entero. Al 80 % de opacidad se sigue leyendo el fondo debajo.
  rasterLayers: RASTERS.map((r) => ({ ...r, visible: false, opacity: 0.8 })),
  toggleRasterVisibility: (id) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.map((r) =>
        r.id === id ? { ...r, visible: !r.visible } : r
      ),
    })),
  setRasterOpacity: (id, opacity) =>
    set((s) => ({
      rasterLayers: s.rasterLayers.map((r) => (r.id === id ? { ...r, opacity } : r)),
    })),
  hideAllRasters: () =>
    set((s) => ({
      rasterLayers: s.rasterLayers.map((r) => ({ ...r, visible: false })),
    })),

  // Herramientas
  activeTool: 'none',
  setActiveTool: (activeTool) => set({ activeTool }),
  measureResult: null,
  setMeasureResult: (measureResult) => set({ measureResult }),

  // Auth
  user: (() => {
    try { return JSON.parse(localStorage.getItem('geo_user') || 'null'); } catch { return null; }
  })(),
  token: localStorage.getItem('geo_token'),
  setAuth: (user, token) => {
    localStorage.setItem('geo_token', token);
    localStorage.setItem('geo_user', JSON.stringify(user));
    set({ user, token });
  },
  logout: () => {
    localStorage.removeItem('geo_token');
    localStorage.removeItem('geo_user');
    set({ user: null, token: null });
  },

  // UI
  leftPanelTab: 'layers',
  setLeftPanelTab: (leftPanelTab) => set({ leftPanelTab }),
  rightPanelOpen: false,
  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  streetViewCoords: null,
  setStreetViewCoords: (streetViewCoords) => set({ streetViewCoords }),
  selectedFeature: null,
  setSelectedFeature: (selectedFeature) => set({ selectedFeature }),

  // Notificaciones
  notifications: [],
  addNotification: (n) => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ notifications: [...s.notifications, { ...n, id }] }));
    setTimeout(() => get().removeNotification(id), 4000);
  },
  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),

  // Capas de análisis
  analysisLayers: [],
  addAnalysisLayer: (layer) => set((s) => ({
    analysisLayers: [layer, ...s.analysisLayers],
  })),
  removeAnalysisLayer: (id) => set((s) => ({
    analysisLayers: s.analysisLayers.filter((l) => l.id !== id),
  })),
  toggleAnalysisLayerVisibility: (id) => set((s) => ({
    analysisLayers: s.analysisLayers.map((l) =>
      l.id === id ? { ...l, visible: !l.visible } : l
    ),
  })),
  setAnalysisLayerStyle: (id, style) => set((s) => ({
    analysisLayers: s.analysisLayers.map((l) =>
      l.id === id ? { ...l, style: { ...l.style, ...style } } : l
    ),
  })),
}));
