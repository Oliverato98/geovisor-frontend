import { useEffect, useState } from 'react';
import MapView from './components/Map/MapView';
import LeftPanel from './components/Panels/LeftPanel';
import RightPanel from './components/Panels/RightPanel';
import Toolbar from './components/Tools/Toolbar';
import PlanoLayout from './components/Tools/PlanoLayout';
import Notifications from './components/UI/Notifications';
import { useGeoStore } from './store/useGeoStore';
import { layersApi } from './services/api';
import './styles/globals.css';

export default function App() {
  const { setLayers, setLoading, addNotification } = useGeoStore();

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const data = await layersApi.list();
        const withTiles = await Promise.all(
          data.map(async (l: any) => {
            try {
              const info = await layersApi.getTileUrl(l.id);
              return { ...l, tile_url: info.tile_url };
            } catch { return l; }
          })
        );
        setLayers(withTiles);
        if (withTiles.length > 0) {
          addNotification({ type: 'info', message: `${withTiles.length} capa(s) cargadas` });
        }
      } catch {
        console.warn('Backend no disponible, modo offline');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [setLayers, setLoading, addNotification]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Toolbar />
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', position: 'relative' }}>
        <LeftPanel />
        <div style={{ flex: 1, position: 'relative' }}>
          <MapView />
          <CursorCoords />
          <ActiveToolIndicator />
          <PlanoLayout />
        </div>
        <RightPanel />
      </div>
      <Notifications />
    </div>
  );
}

function CursorCoords() {
  const { map } = useGeoStore();
  const [coords, setCoords] = useState({ lat: 4.5369, lng: -75.6427 });

  useEffect(() => {
    if (!map) return;
    const handler = (e: any) => {
      setCoords({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };
    map.on('mousemove', handler);
    return () => { map.off('mousemove', handler); };
  }, [map]);

  return (
    <div style={{
      position: 'absolute', bottom: 32, left: 12,
      background: 'rgba(15,17,23,0.85)',
      backdropFilter: 'blur(4px)',
      border: '1px solid var(--geo-border)',
      borderRadius: 6, padding: '4px 10px',
      fontSize: 11, fontFamily: 'DM Mono, monospace',
      color: 'var(--geo-text-muted)',
      pointerEvents: 'none', zIndex: 5,
    }}>
      {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)} | EPSG:4326
    </div>
  );
}

function ActiveToolIndicator() {
  const { activeTool, measureResult } = useGeoStore();
  if (activeTool === 'none') return null;

  const messages: Record<string, string> = {
    'measure-distance': 'Haz clic para agregar puntos · Doble clic para reiniciar',
    'measure-area': 'Haz clic para trazar el polígono · Doble clic para reiniciar',
    'draw-point': 'Haz clic en el mapa para colocar un punto',
    'draw-line': 'Haz clic para agregar vértices de la línea',
    'draw-polygon': 'Haz clic para trazar el polígono',
  };

  return (
    <div style={{
      position: 'absolute', top: 12, left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(15,17,23,0.92)',
      backdropFilter: 'blur(4px)',
      border: '1px solid var(--geo-accent)',
      borderRadius: 8, padding: '8px 16px',
      fontSize: 11, color: 'var(--geo-accent)',
      pointerEvents: 'none', zIndex: 5,
      display: 'flex', alignItems: 'center', gap: 8,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--geo-accent)' }} />
      {messages[activeTool] ?? activeTool}
      {measureResult && (
        <strong style={{ marginLeft: 8, borderLeft: '1px solid rgba(45,212,160,0.3)', paddingLeft: 8 }}>
          {measureResult}
        </strong>
      )}
    </div>
  );
}

declare global {
  interface Window {
    __zoomToLayer: any;
    __openStreetView: any;
    __zoomToBBox: any;
  }
}
