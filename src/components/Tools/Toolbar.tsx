/**
 * components/Tools/Toolbar.tsx
 * Barra de herramientas superior: mapa base, medición, dibujo, Street View, auth
 */
import { useState } from 'react';
import {
  Ruler, Maximize2, Pencil, MapPin, Navigation,
  Satellite, Map, Mountain, Moon, LogIn, LogOut,
  User, Loader2, X,
} from 'lucide-react';
import { useGeoStore, type BaseMap, type ActiveTool } from '../../store/useGeoStore';
import { authApi, layersApi } from '../../services/api';

export default function Toolbar() {
  const {
    baseMap, setBaseMap, activeTool, setActiveTool,
    measureResult, user, setAuth, logout, addNotification,
    setLayers, layers, setLoading,
  } = useGeoStore();

  const [showLogin, setShowLogin] = useState(false);

  const baseMaps: { id: BaseMap; label: string; icon: typeof Map }[] = [
    { id: 'osm', label: 'OSM', icon: Map },
    { id: 'satellite', label: 'Satélite', icon: Satellite },
    { id: 'topo', label: 'Topo', icon: Mountain },
    { id: 'dark', label: 'Oscuro', icon: Moon },
  ];

  const tools: { id: ActiveTool; label: string; icon: typeof Ruler }[] = [
    { id: 'measure-distance', label: 'Medir distancia', icon: Ruler },
    { id: 'measure-area', label: 'Medir área', icon: Maximize2 },
    { id: 'draw-point', label: 'Dibujar punto', icon: MapPin },
    { id: 'draw-line', label: 'Dibujar línea', icon: Navigation },
    { id: 'draw-polygon', label: 'Dibujar polígono', icon: Pencil },
  ];

  const handleToolClick = (toolId: ActiveTool) => {
    setActiveTool(activeTool === toolId ? 'none' : toolId);
  };

  const loadLayers = async () => {
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
    } catch {
      addNotification({ type: 'error', message: 'Error cargando capas del servidor' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      height: 'var(--toolbar-h)',
      background: 'var(--geo-panel)',
      borderBottom: '1px solid var(--geo-border)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 12px',
      zIndex: 20,
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    }}>
      {/* Mapas base */}
      <div style={{ display: 'flex', gap: 4, padding: '0 8px 0 0', borderRight: '1px solid var(--geo-border)' }}>
        {baseMaps.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            className={`geo-btn ${baseMap === id ? 'active' : ''}`}
            style={{ padding: '5px 10px', fontSize: 11 }}
            onClick={() => setBaseMap(id)}
            title={label}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Separador */}
      <div style={{ width: 1, height: 24, background: 'var(--geo-border)', margin: '0 4px' }} />

      {/* Herramientas */}
      {tools.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          className={`geo-btn ${activeTool === id ? 'active' : ''}`}
          style={{ padding: '5px 10px', fontSize: 11 }}
          onClick={() => handleToolClick(id)}
          title={label}
        >
          <Icon size={12} />
          <span style={{ display: 'none' }}>{label}</span>
        </button>
      ))}

      {activeTool !== 'none' && (
        <button className="geo-btn danger" style={{ padding: '5px 8px', fontSize: 11 }}
          onClick={() => setActiveTool('none')} title="Cancelar herramienta">
          <X size={12} />
        </button>
      )}

      {/* Resultado de medición */}
      {measureResult && (
        <div style={{
          fontSize: 11, padding: '4px 10px',
          background: 'var(--geo-accent-dim)',
          border: '1px solid rgba(45,212,160,0.3)',
          borderRadius: 6, color: 'var(--geo-accent)',
          fontFamily: 'DM Mono, monospace', fontWeight: 500,
        }}>
          {measureResult}
        </div>
      )}

      {/* Espaciador */}
      <div style={{ flex: 1 }} />

      {/* Cargar capas */}
      <button className="geo-btn" style={{ padding: '5px 12px', fontSize: 11 }}
        onClick={loadLayers} title="Recargar capas desde servidor">
        <Loader2 size={12} />
        Cargar capas
      </button>

      {/* Separador */}
      <div style={{ width: 1, height: 24, background: 'var(--geo-border)', margin: '0 4px' }} />

      {/* Auth */}
      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 26, height: 26, borderRadius: '50%',
              background: 'var(--geo-accent-dim)',
              border: '1px solid rgba(45,212,160,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <User size={12} color="var(--geo-accent)" />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, lineHeight: 1 }}>{user.username}</div>
              <div style={{ fontSize: 9, color: 'var(--geo-text-hint)', lineHeight: 1, marginTop: 2 }}>{user.role}</div>
            </div>
          </div>
          <button className="geo-btn danger" style={{ padding: '5px 8px' }}
            onClick={() => { logout(); addNotification({ type: 'info', message: 'Sesión cerrada' }); }}>
            <LogOut size={12} />
          </button>
        </div>
      ) : (
        <span style={{ fontSize: 10.5, color: 'var(--geo-text-hint)' }}>
          Geovisor de acceso libre
        </span>
      )}

      {/* Modal Login */}
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}

// ── Modal de login ────────────────────────────────────────────────────────────
function LoginModal({ onClose }: { onClose: () => void }) {
  const { setAuth, addNotification } = useGeoStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const data = await authApi.login(email, password);
      setAuth(data.user, data.access_token);
      addNotification({ type: 'success', message: `Bienvenido, ${data.user.username}` });
      onClose();
    } catch {
      setError('Email o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    }} onClick={onClose}>
      <div style={{
        background: 'var(--geo-panel)', border: '1px solid var(--geo-border-hi)',
        borderRadius: 14, padding: 28, width: 360,
        boxShadow: 'var(--shadow-panel)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Iniciar sesión</div>
        <div style={{ fontSize: 12, color: 'var(--geo-text-muted)', marginBottom: 20 }}>
          Geovisor Calarcá — Panel de administración
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>Email</label>
            <input className="geo-input" type="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@calarca.gov.co" />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>Contraseña</label>
            <input className="geo-input" type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          </div>

          {error && (
            <div style={{ fontSize: 11, color: 'var(--geo-danger)', marginBottom: 12, padding: '8px 10px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="geo-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="geo-btn primary" style={{ flex: 1, justifyContent: 'center' }} disabled={loading}>
              {loading ? <Loader2 size={13} className="spin" /> : <LogIn size={13} />}
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
