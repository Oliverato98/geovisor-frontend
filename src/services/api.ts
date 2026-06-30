/**
 * services/api.ts
 * Cliente HTTP centralizado para el backend FastAPI.
 */
import axios from 'axios';
import { useGeoStore } from '../store/useGeoStore';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const MARTIN_URL = import.meta.env.VITE_MARTIN_URL ?? 'http://localhost:3000';

export const api = axios.create({ baseURL: API_URL });

// Inyectar token automáticamente
api.interceptors.request.use((config) => {
  const token = useGeoStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Manejo global de errores
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      useGeoStore.getState().logout();
    }
    return Promise.reject(err);
  }
);

// ── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  register: (data: { email: string; username: string; password: string; role?: string }) =>
    api.post('/auth/register', data).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ── Layers ───────────────────────────────────────────────────────────────────
export const layersApi = {
  list: (params?: { format?: string; geom_type?: string }) =>
    api.get('/layers/', { params }).then((r) => r.data),

  get: (id: number) => api.get(`/layers/${id}`).then((r) => r.data),

  getTileUrl: (id: number) => api.get(`/layers/${id}/tile-url`).then((r) => r.data),

  update: (id: number, data: { name?: string; description?: string; style?: object; is_public?: boolean }) =>
    api.patch(`/layers/${id}`, data).then((r) => r.data),

  delete: (id: number) => api.delete(`/layers/${id}`),

  exportGeoJSON: (id: number) =>
    api.get(`/layers/${id}/export/geojson`, { responseType: 'blob' }),
};

// ── Upload ───────────────────────────────────────────────────────────────────
export const uploadApi = {
  shapefile: (file: File, name: string, description = '') => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('description', description);
    return api.post('/upload/shapefile', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        const pct = Math.round((e.loaded * 100) / (e.total ?? 1));
        console.debug(`Upload: ${pct}%`);
      },
    }).then((r) => r.data);
  },

  geojson: (file: File, name: string, description = '') => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('description', description);
    return api.post('/upload/geojson', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },

  kml: (file: File, name: string, description = '') => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    form.append('description', description);
    return api.post('/upload/kml', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then((r) => r.data);
  },
};

// ── Analysis ─────────────────────────────────────────────────────────────────
export const analysisApi = {
  buffer: (layer_id: number, distance_meters: number, filter_ids?: number[]) =>
    api.post('/analysis/buffer', { layer_id, distance_meters, filter_ids }).then((r) => r.data),

  intersection: (layer_a_id: number, layer_b_id: number) =>
    api.post('/analysis/intersection', { layer_a_id, layer_b_id }).then((r) => r.data),

  dissolve: (layer_id: number, attribute: string) =>
    api.post('/analysis/dissolve', { layer_id, attribute }).then((r) => r.data),

  spatialQuery: (layer_id: number, lat: number, lon: number, radius_m = 100) =>
    api.get(`/analysis/spatial-query/${layer_id}`, { params: { lat, lon, radius_m } }).then((r) => r.data),
};

// ── Basemaps ─────────────────────────────────────────────────────────────────
import type { StyleSpecification } from 'maplibre-gl';

function makeRasterStyle(id: string, tiles: string[], attribution: string, maxzoom: number): StyleSpecification {
  return {
    version: 8,
    sources: {
      [id]: {
        type: 'raster',
        tiles,
        tileSize: 256,
        attribution,
        maxzoom,
      },
    },
    layers: [{ id, type: 'raster', source: id }],
  };
}

export const BASEMAPS = {
  osm: {
    label: 'OpenStreetMap',
    style: makeRasterStyle(
      'osm',
      ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      '© OpenStreetMap contributors',
      19
    ),
  },
  satellite: {
    label: 'Satelital',
    style: makeRasterStyle(
      'satellite',
      ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      'Esri, Maxar, GeoEye, i-cubed, USDA FSA, USGS',
      19
    ),
  },
  topo: {
    label: 'Topográfico',
    style: makeRasterStyle(
      'topo',
      ['https://a.tile.opentopomap.org/{z}/{x}/{y}.png'],
      '© OpenTopoMap',
      17
    ),
  },
  dark: {
    label: 'Oscuro',
    style: makeRasterStyle(
      'dark',
      ['https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'],
      '© Stadia Maps © OpenMapTiles © OpenStreetMap',
      20
    ),
  },
} as const;

export { MARTIN_URL };
