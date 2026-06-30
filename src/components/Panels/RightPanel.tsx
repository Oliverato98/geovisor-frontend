/**
 * components/Panels/RightPanel.tsx
 * Panel derecho: Street View y atributos del feature seleccionado.
 */
import { useState } from 'react';
import { X, Eye, MapPin, Navigation } from 'lucide-react';
import { useGeoStore } from '../../store/useGeoStore';

const GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY ?? '';

export default function RightPanel() {
  const { rightPanelOpen, setRightPanelOpen, streetViewCoords, selectedFeature } = useGeoStore();
  const [activeTab, setActiveTab] = useState<'streetview' | 'attributes'>('streetview');

  if (!rightPanelOpen) return null;

  return (
    <div style={{
      width: 'var(--panel-width)',
      height: '100%',
      background: 'var(--geo-panel)',
      borderLeft: '1px solid var(--geo-border)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: 'var(--shadow-panel)',
      zIndex: 10,
      animation: 'fadeSlideIn 0.2s ease',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--geo-border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          <button
            className={`geo-btn ${activeTab === 'streetview' ? 'active' : ''}`}
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => setActiveTab('streetview')}
          >
            <Navigation size={11} /> Street View
          </button>
          <button
            className={`geo-btn ${activeTab === 'attributes' ? 'active' : ''}`}
            style={{ fontSize: 11, padding: '4px 10px' }}
            onClick={() => setActiveTab('attributes')}
          >
            <Eye size={11} /> Atributos
          </button>
        </div>
        <button
          onClick={() => setRightPanelOpen(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--geo-text-hint)', padding: 4 }}
        >
          <X size={14} />
        </button>
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {activeTab === 'streetview' && <StreetViewPanel />}
        {activeTab === 'attributes' && <AttributesPanel />}
      </div>
    </div>
  );
}

// ── Street View ───────────────────────────────────────────────────────────────
function StreetViewPanel() {
  const { streetViewCoords } = useGeoStore();
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [viewCoords, setViewCoords] = useState(streetViewCoords);

  const coords = viewCoords ?? streetViewCoords;

  const handleManualLoad = () => {
    const lat = parseFloat(manualLat);
    const lng = parseFloat(manualLng);
    if (!isNaN(lat) && !isNaN(lng)) {
      setViewCoords({ lat, lng });
    }
  };

  // URL del iframe de Street View
  const streetViewUrl = coords && GOOGLE_MAPS_KEY
    ? `https://www.google.com/maps/embed/v1/streetview?key=${GOOGLE_MAPS_KEY}&location=${coords.lat},${coords.lng}&heading=0&pitch=0&fov=90`
    : null;

  // Alternativa sin API key: Mapillary embed
  const mapillaryUrl = coords
    ? `https://www.mapillary.com/embed?map_style=Mapillary+Dark&image_key=&x=0.5&y=0.5&client_id=&style=photo&lat=${coords.lat}&lng=${coords.lng}&zoom=17`
    : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Vista de Street View */}
      <div style={{ flex: 1, background: 'var(--geo-bg)', position: 'relative' }}>
        {coords ? (
          streetViewUrl ? (
            <iframe
              src={streetViewUrl}
              style={{ width: '100%', height: '100%', border: 'none' }}
              allowFullScreen
              loading="lazy"
            />
          ) : (
            // Sin API key: mostrar alternativa con link a Google Maps
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 }}>
              <MapPin size={32} color="var(--geo-accent)" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
                  {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--geo-text-muted)', marginBottom: 16 }}>
                  Calarcá, Quindío, Colombia
                </div>
                <a
                  href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${coords.lat},${coords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="geo-btn primary"
                  style={{ display: 'inline-flex', textDecoration: 'none', fontSize: 11 }}
                >
                  <Navigation size={12} /> Abrir en Google Maps
                </a>
                <div style={{ marginTop: 12 }}>
                  <a
                    href={`https://www.mapillary.com/app/?lat=${coords.lat}&lng=${coords.lng}&z=17`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="geo-btn"
                    style={{ display: 'inline-flex', textDecoration: 'none', fontSize: 11 }}
                  >
                    Ver en Mapillary
                  </a>
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'var(--geo-text-hint)', textAlign: 'center' }}>
                Agrega VITE_GOOGLE_MAPS_KEY en .env<br />para ver Street View embebido
              </div>
            </div>
          )
        ) : (
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--geo-text-hint)' }}>
            <Navigation size={28} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 12 }}>Haz clic en el mapa para ver Street View</div>
            <div style={{ fontSize: 11, color: 'var(--geo-text-hint)' }}>O ingresa coordenadas manualmente</div>
          </div>
        )}
      </div>

      {/* Coordenadas manuales */}
      <div style={{ padding: 12, borderTop: '1px solid var(--geo-border)' }}>
        <div className="geo-section-title" style={{ marginBottom: 8 }}>Ir a coordenadas</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <input className="geo-input" placeholder="Latitud" type="number"
            value={manualLat} onChange={(e) => setManualLat(e.target.value)} style={{ flex: 1 }} />
          <input className="geo-input" placeholder="Longitud" type="number"
            value={manualLng} onChange={(e) => setManualLng(e.target.value)} style={{ flex: 1 }} />
        </div>
        <button className="geo-btn" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }}
          onClick={handleManualLoad}>
          <MapPin size={11} /> Ir a ubicación
        </button>
      </div>
    </div>
  );
}

// ── Atributos del feature ─────────────────────────────────────────────────────
function AttributesPanel() {
  const { selectedFeature } = useGeoStore();

  if (!selectedFeature) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--geo-text-hint)' }}>
        <Eye size={28} style={{ opacity: 0.3 }} />
        <div style={{ fontSize: 12 }}>Haz clic en un feature del mapa para ver sus atributos</div>
      </div>
    );
  }

  const entries = Object.entries(selectedFeature).filter(([k]) => !k.startsWith('_'));

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 14 }}>
      <div className="geo-section-title">Atributos del feature</div>
      {entries.map(([key, value]) => (
        <div key={key} style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '7px 0', borderBottom: '1px solid var(--geo-border)',
          gap: 8,
        }}>
          <span style={{ fontSize: 11, color: 'var(--geo-text-muted)', flexShrink: 0 }}>{key}</span>
          <span style={{
            fontSize: 11, fontFamily: 'DM Mono, monospace',
            color: 'var(--geo-text)', textAlign: 'right',
            wordBreak: 'break-all',
          }}>
            {value === null || value === undefined ? '—' : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}
