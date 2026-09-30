/**
 * components/Panels/LeftPanel.tsx
 * Panel lateral izquierdo con pestañas: Capas | Subir | Análisis
 */
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Layers, Upload, Activity, Eye, EyeOff, Trash2,
  ZoomIn, Download, ChevronDown, ChevronRight,
  MapPin, Minus, Square, AlertTriangle, Palette, Lock, Mountain
} from 'lucide-react';
import { useGeoStore, type RasterLayer } from '../../store/useGeoStore';
import { GRUPOS_RASTER } from '../../data/rasters';
import { layersApi, uploadApi, analysisApi } from '../../services/api';

// ── Panel principal ───────────────────────────────────────────────────────────
export default function LeftPanel() {
  const { leftPanelTab, setLeftPanelTab, user } = useGeoStore();

  const tabs = [
    { id: 'layers' as const, label: 'Capas', icon: Layers },
    { id: 'upload' as const, label: 'Subir', icon: Upload },
    { id: 'analysis' as const, label: 'Análisis', icon: Activity },
  ];

  return (
    <div style={{
      width: 'var(--panel-width)',
      height: '100%',
      background: 'var(--geo-panel)',
      borderRight: '1px solid var(--geo-border)',
      display: 'flex',
      flexDirection: 'column',
      boxShadow: 'var(--shadow-panel)',
      zIndex: 10,
    }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', borderBottom: '1px solid var(--geo-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--geo-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={14} color="#0f1117" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Geovisor Calarcá</div>
            <div style={{ fontSize: 10, color: 'var(--geo-text-muted)' }}>Quindío, Colombia</div>
          </div>

        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2 }}>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setLeftPanelTab(id)}
              style={{
                flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer',
                background: leftPanelTab === id ? 'var(--geo-panel-alt)' : 'transparent',
                color: leftPanelTab === id ? 'var(--geo-accent)' : 'var(--geo-text-muted)',
                borderRadius: '6px 6px 0 0',
                fontSize: 11, fontWeight: 500,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                transition: 'all 0.15s',
                borderBottom: leftPanelTab === id ? '2px solid var(--geo-accent)' : '2px solid transparent',
              }}
            >
              <Icon size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Contenido */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {leftPanelTab === 'layers' && <LayersTab />}
        {leftPanelTab === 'upload' && <UploadTab />}
        {leftPanelTab === 'analysis' && <AnalysisTab />}
      </div>
    </div>
  );
}

// ── Tab: Capas ────────────────────────────────────────────────────────────────
function LayersTab() {
  const { layers, toggleLayerVisibility, setLayerOpacity, removeLayer, addNotification, user } = useGeoStore();
  const [expanded, setExpanded] = useState<number | null>(null);

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`¿Eliminar la capa "${name}"? Esta acción no se puede deshacer.`)) return;
    try {
      await layersApi.delete(id);
      removeLayer(id);
      addNotification({ type: 'success', message: `Capa "${name}" eliminada` });
    } catch (e: any) {
      // El backend responde 403 y explica por qué cuando la capa es oficial
      addNotification({
        type: 'error',
        message: e?.response?.data?.detail ?? 'No se pudo eliminar la capa',
      });
    }
  };

  const handleExport = async (id: number, name: string) => {
    try {
      const blob = await layersApi.exportGeoJSON(id);
      const url = URL.createObjectURL(blob.data);
      const a = document.createElement('a');
      a.href = url; a.download = `${name}.geojson`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      addNotification({ type: 'error', message: 'Error al exportar' });
    }
  };

  const geomIcon = (type: string) => {
    const t = type?.toLowerCase() ?? '';
    if (t.includes('point')) return <MapPin size={11} />;
    if (t.includes('line')) return <Minus size={11} />;
    return <Square size={11} />;
  };

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: 12 }}>
      <RasterSection />

      {layers.length > 0 && (
        <div className="geo-section-title" style={{ marginTop: 4 }}>
          Capas vectoriales
        </div>
      )}

      {layers.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--geo-text-hint)', marginTop: 48 }}>
          <Layers size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
          <div style={{ fontSize: 12 }}>No hay capas cargadas</div>
          <div style={{ fontSize: 11, marginTop: 4 }}>Usa la pestaña "Subir" para agregar datos</div>
        </div>
      ) : (
        layers.map((layer) => (
          <div key={layer.id} style={{
            background: 'var(--geo-panel-alt)',
            border: `1px solid ${expanded === layer.id ? 'var(--geo-accent)' : 'var(--geo-border)'}`,
            borderRadius: 8, marginBottom: 8, overflow: 'hidden',
            transition: 'border-color 0.15s',
          }}>
            {/* Header de capa */}
            <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* Visibilidad */}
              <button
                onClick={() => toggleLayerVisibility(layer.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: layer.visible ? 'var(--geo-accent)' : 'var(--geo-text-hint)', padding: 2 }}
              >
                {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>

              {/* Ícono de geometría */}
              <span style={{ color: 'var(--geo-text-muted)' }}>{geomIcon(layer.geometry_type)}</span>

              {/* Nombre */}
              <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {layer.name}
              </span>

              {/* Expandir */}
              <button
                onClick={() => setExpanded(expanded === layer.id ? null : layer.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--geo-text-hint)', padding: 2 }}
              >
                {expanded === layer.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              </button>
            </div>

            {/* Detalles expandidos */}
            {expanded === layer.id && (
              <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--geo-border)' }}>
                {/* Info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, margin: '8px 0' }}>
                  {[
                    ['Formato', layer.source_format.toUpperCase()],
                    ['Tipo', layer.geometry_type],
                    ['Features', layer.feature_count.toLocaleString()],
                    ['Atributos', Object.keys(layer.attributes ?? {}).length],
                  ].map(([k, v]) => (
                    <div key={k} style={{ fontSize: 10 }}>
                      <span style={{ color: 'var(--geo-text-hint)' }}>{k}: </span>
                      <span style={{ color: 'var(--geo-text-muted)', fontFamily: 'DM Mono, monospace' }}>{v}</span>
                    </div>
                  ))}
                </div>

                {/* Opacidad */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 10, color: 'var(--geo-text-hint)' }}>Opacidad</span>
                    <span style={{ fontSize: 10, color: 'var(--geo-text-muted)', fontFamily: 'DM Mono, monospace' }}>
                      {Math.round(layer.opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range" className="geo-slider"
                    min={0} max={1} step={0.05}
                    value={layer.opacity}
                    onChange={(e) => setLayerOpacity(layer.id, parseFloat(e.target.value))}
                  />
                </div>

                {/* Editor de estilos */}
                <StyleEditor layer={layer} />

                {/* Acciones */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button className="geo-btn" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => (window as any).__zoomToLayer?.(layer)}>
                    <ZoomIn size={11} /> Zoom
                  </button>
                  <button className="geo-btn" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => handleExport(layer.id, layer.name)}>
                    <Download size={11} /> Export
                  </button>
                  {layer.protegida ? (
                    <span className="geo-btn" title="Capa oficial del municipio: no se puede eliminar"
                      style={{ flex: 1, justifyContent: 'center', opacity: .45, cursor: 'default' }}>
                      <Lock size={11} />
                    </span>
                  ) : (
                    <button className="geo-btn danger" style={{ flex: 1, justifyContent: 'center' }}
                      onClick={() => handleDelete(layer.id, layer.name)}>
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Sección: capas ráster ─────────────────────────────────────────────────────
/**
 * Los ráster del estudio de amenaza. No viven en la base de datos: son
 * imágenes del propio geovisor, así que aquí no hay borrar ni exportar,
 * solo encender, graduar y leer la leyenda.
 */
function RasterSection() {
  const { rasterLayers, toggleRasterVisibility, setRasterOpacity, hideAllRasters } = useGeoStore();
  const [abierta, setAbierta] = useState<string | null>(null);
  const [plegada, setPlegada] = useState(false);

  const encendidas = rasterLayers.filter((r) => r.visible).length;

  return (
    <div style={{ marginBottom: 14 }}>
      <div
        onClick={() => setPlegada(!plegada)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
          padding: '2px 0 8px',
        }}
      >
        {plegada ? <ChevronRight size={12} color="var(--geo-text-hint)" />
                 : <ChevronDown size={12} color="var(--geo-text-hint)" />}
        <Mountain size={12} color="var(--geo-text-muted)" />
        <span style={{
          flex: 1, fontSize: 10, fontWeight: 600, letterSpacing: '0.06em',
          textTransform: 'uppercase', color: 'var(--geo-text-muted)',
        }}>
          Ráster del estudio
        </span>
        <span style={{
          fontSize: 10, fontFamily: 'DM Mono, monospace',
          color: encendidas ? 'var(--geo-accent)' : 'var(--geo-text-hint)',
        }}>
          {encendidas}/{rasterLayers.length}
        </span>
        {encendidas > 0 && (
          <button
            title="Apagar todos los ráster"
            onClick={(e) => { e.stopPropagation(); hideAllRasters(); }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--geo-text-hint)', padding: 2, display: 'flex',
            }}
          >
            <EyeOff size={12} />
          </button>
        )}
      </div>

      {!plegada && GRUPOS_RASTER.map((grupo) => {
        const delGrupo = rasterLayers.filter((r) => r.grupo === grupo);
        if (delGrupo.length === 0) return null;

        return (
          <div key={grupo} style={{ marginBottom: 6 }}>
            <div style={{
              fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--geo-text-hint)', padding: '4px 2px 5px',
            }}>
              {grupo}
            </div>

            {delGrupo.map((r) => (
              <div key={r.id} style={{
                background: 'var(--geo-panel-alt)',
                border: `1px solid ${abierta === r.id ? 'var(--geo-accent)' : 'var(--geo-border)'}`,
                borderRadius: 7, marginBottom: 5, overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}>
                <div style={{ padding: '7px 9px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => toggleRasterVisibility(r.id)}
                    title={r.visible ? 'Quitar del mapa' : 'Poner en el mapa'}
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                      color: r.visible ? 'var(--geo-accent)' : 'var(--geo-text-hint)',
                      display: 'flex',
                    }}
                  >
                    {r.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>

                  <MuestraRaster raster={r} />

                  <span style={{
                    flex: 1, fontSize: 11.5, fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: r.visible ? 'var(--geo-text)' : 'var(--geo-text-muted)',
                  }}>
                    {r.nombre}
                  </span>

                  <button
                    onClick={() => setAbierta(abierta === r.id ? null : r.id)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--geo-text-hint)', padding: 2, display: 'flex' }}
                  >
                    {abierta === r.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  </button>
                </div>

                {abierta === r.id && (
                  <div style={{ padding: '0 9px 9px', borderTop: '1px solid var(--geo-border)' }}>
                    <p style={{ fontSize: 11, lineHeight: 1.5, color: '#a8aec0', margin: '8px 0 10px' }}>
                      {r.nota}
                    </p>

                    <LeyendaRaster raster={r} />

                    <div style={{ display: 'flex', justifyContent: 'space-between', margin: '10px 0 5px' }}>
                      <span style={{ fontSize: 10, color: 'var(--geo-text-hint)' }}>Opacidad</span>
                      <span style={{ fontSize: 10, color: 'var(--geo-text-muted)', fontFamily: 'DM Mono, monospace' }}>
                        {Math.round(r.opacity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range" className="geo-slider"
                      min={0.1} max={1} step={0.05}
                      value={r.opacity}
                      onChange={(e) => setRasterOpacity(r.id, parseFloat(e.target.value))}
                    />

                    <button
                      className="geo-btn"
                      style={{ width: '100%', justifyContent: 'center', marginTop: 9 }}
                      onClick={() => (window as any).__zoomToBBox?.([
                        r.esquinas[0][0], r.esquinas[2][1],
                        r.esquinas[1][0], r.esquinas[0][1],
                      ])}
                    >
                      <ZoomIn size={11} /> Encuadrar
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Cuadrito de color junto al nombre: la rampa completa en miniatura. */
function MuestraRaster({ raster }: { raster: RasterLayer }) {
  const colores = raster.leyenda
    ? raster.leyenda.map((c) => c.color)
    : raster.muestras ?? ['#666'];

  return (
    <span style={{
      width: 12, height: 12, borderRadius: 3, flexShrink: 0,
      border: '1px solid var(--geo-border-hi)',
      background: colores.length === 1
        ? colores[0]
        : `linear-gradient(135deg, ${colores.join(', ')})`,
      opacity: raster.visible ? 1 : 0.45,
    }} />
  );
}

/** Leyenda: lista de clases si el ráster es discreto, barra continua si no. */
function LeyendaRaster({ raster }: { raster: RasterLayer }) {
  if (raster.leyenda) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {raster.leyenda.map((c) => (
          <div key={c.texto} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{
              width: 14, height: 10, borderRadius: 2, background: c.color,
              border: '1px solid var(--geo-border-hi)', flexShrink: 0,
            }} />
            <span style={{ fontSize: 11, color: '#c2c7d4' }}>{c.texto}</span>
          </div>
        ))}
      </div>
    );
  }

  const muestras = raster.muestras ?? [];
  const numero = (v?: number) =>
    v == null ? '' : v.toLocaleString('es-CO', { maximumFractionDigits: 1 });

  return (
    <div>
      <div style={{
        height: 9, borderRadius: 3, border: '1px solid var(--geo-border-hi)',
        background: `linear-gradient(to right, ${muestras.join(', ')})`,
      }} />
      {/* Los extremos de la rampa son el dato, no una decoración: van en un
          tono aclarado del gris del panel para que se lean de verdad. */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', marginTop: 4,
        fontSize: 10, fontFamily: 'DM Mono, monospace', color: '#8f95a9',
      }}>
        <span>{numero(raster.minimo)}</span>
        <span>{raster.unidad}{raster.logaritmico ? ' · log' : ''}</span>
        <span>{numero(raster.maximo)}</span>
      </div>
    </div>
  );
}

// ── Tab: Subir archivos ───────────────────────────────────────────────────────
function UploadTab() {
  const { addLayer, addNotification, user } = useGeoStore();
  const [layerName, setLayerName] = useState('');
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const onDrop = useCallback(async (files: File[]) => {
    if (!files[0]) return;
    const file = files[0];
    const name = layerName || file.name.replace(/\.[^.]+$/, '');
    const ext = file.name.toLowerCase();

    setUploading(true);
    setUploadPct(0);

    try {
      if (ext.endsWith('.zip')) {
        // ZIP puede tener uno o múltiples shapefiles
        const result = await uploadApi.shapefile(file, name, description);

        // Cargar cada capa creada con su tile_url
        for (const layerSummary of result.layers) {
          try {
            const fullLayer = await layersApi.get(layerSummary.id);
            const tileInfo = await layersApi.getTileUrl(layerSummary.id);
            addLayer({ ...fullLayer, tile_url: tileInfo.tile_url });
          } catch (e) {
            console.warn('Error cargando capa', layerSummary.name, e);
          }
        }

        const msg = result.created_count === 1
          ? `Capa "${result.layers[0].name}" cargada`
          : `${result.created_count} capas cargadas desde el ZIP`;
        addNotification({ type: 'success', message: msg });

        if (result.error_count > 0) {
          addNotification({
            type: 'warning',
            message: `${result.error_count} capa(s) no se pudieron procesar`
          });
        }
      } else if (ext.endsWith('.geojson') || ext.endsWith('.json')) {
        const result = await uploadApi.geojson(file, name, description);
        const tileInfo = await layersApi.getTileUrl(result.id);
        addLayer({ ...result, tile_url: tileInfo.tile_url });
        addNotification({ type: 'success', message: `Capa "${name}" cargada con ${result.feature_count} features` });
      } else if (ext.endsWith('.kml') || ext.endsWith('.kmz')) {
        const result = await uploadApi.kml(file, name, description);
        const tileInfo = await layersApi.getTileUrl(result.id);
        addLayer({ ...result, tile_url: tileInfo.tile_url });
        addNotification({ type: 'success', message: `Capa "${name}" cargada con ${result.feature_count} features` });
      } else {
        addNotification({ type: 'error', message: 'Formato no soportado. Use .zip, .geojson, .kml o .kmz' });
        setUploading(false);
        return;
      }

      setLayerName('');
      setDescription('');
    } catch (err: any) {
      const msg = err.response?.data?.detail ?? 'Error al subir el archivo';
      addNotification({ type: 'error', message: msg });
    } finally {
      setUploading(false);
      setUploadPct(0);
    }
  }, [layerName, description, addLayer, addNotification]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/zip': ['.zip'],
      'application/x-zip-compressed': ['.zip'],
      'application/x-zip': ['.zip'],
      'application/octet-stream': ['.zip', '.kmz'],
      'application/json': ['.geojson', '.json'],
      'application/geo+json': ['.geojson'],
      'text/plain': ['.geojson', '.json', '.kml'],
      'application/vnd.google-earth.kml+xml': ['.kml'],
      'application/vnd.google-earth.kmz': ['.kmz'],
    },
    multiple: false,
    disabled: uploading,
  });

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div className="geo-section-title">Subir capa geoespacial</div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>
          Nombre de la capa
        </label>
        <input className="geo-input" placeholder="Ej: Predios Calarcá 2024"
          value={layerName} onChange={(e) => setLayerName(e.target.value)} />
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>
          Descripción (opcional)
        </label>
        <input className="geo-input" placeholder="Descripción breve"
          value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>

      {/* Dropzone */}
      <div {...getRootProps()} style={{
        border: `2px dashed ${isDragActive ? 'var(--geo-accent)' : 'var(--geo-border-hi)'}`,
        borderRadius: 10,
        padding: '28px 16px',
        textAlign: 'center',
        cursor: uploading ? 'wait' : 'pointer',
        background: isDragActive ? 'var(--geo-accent-dim)' : 'var(--geo-bg)',
        transition: 'all 0.2s',
      }}>
        <input {...getInputProps()} />
        <Upload size={24} style={{ color: isDragActive ? 'var(--geo-accent)' : 'var(--geo-text-hint)', marginBottom: 8 }} />
        <div style={{ fontSize: 12, color: isDragActive ? 'var(--geo-accent)' : 'var(--geo-text-muted)', marginBottom: 4 }}>
          {uploading ? 'Procesando...' : isDragActive ? 'Suelta el archivo aquí' : 'Arrastra o haz clic para seleccionar'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--geo-text-hint)' }}>
          .zip (SHP) · .geojson · .kml · .kmz · Max 200MB
        </div>
      </div>

      {uploading && (
        <div style={{ marginTop: 12 }}>
          <div style={{ height: 3, background: 'var(--geo-border)', borderRadius: 2 }}>
            <div style={{
              height: '100%', background: 'var(--geo-accent)',
              borderRadius: 2, width: `${uploadPct}%`, transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: 'var(--geo-text-hint)', marginTop: 4 }}>
            Procesando en PostGIS...
          </div>
        </div>
      )}

      <div className="geo-divider" />
      <div className="geo-section-title">Formatos soportados</div>
      {[
        ['ZIP + Shapefile', 'Comprime .shp .dbf .shx .prj en un ZIP'],
        ['GeoJSON', 'Archivo .geojson estándar'],
        ['KML / KMZ', 'Exportado desde Google Earth'],
      ].map(([f, d]) => (
        <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start' }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--geo-accent)', marginTop: 5, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 11, fontWeight: 500 }}>{f}</div>
            <div style={{ fontSize: 10, color: 'var(--geo-text-hint)' }}>{d}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Tab: Análisis espacial ────────────────────────────────────────────────────
function AnalysisTab() {
  const { layers, addNotification, user, addAnalysisLayer, analysisLayers, removeAnalysisLayer, toggleAnalysisLayerVisibility, setAnalysisLayerStyle } = useGeoStore();
  const [tool, setTool] = useState<'buffer' | 'intersection' | 'dissolve'>('buffer');
  const [layerA, setLayerA] = useState('');
  const [layerB, setLayerB] = useState('');
  const [bufferDist, setBufferDist] = useState('500');
  const [dissolveAttr, setDissolveAttr] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleRun = async () => {
    if (!layerA) { addNotification({ type: 'error', message: 'Selecciona una capa' }); return; }
    setRunning(true);
    setResult(null);
    try {
      let geojson;
      if (tool === 'buffer') geojson = await analysisApi.buffer(parseInt(layerA), parseFloat(bufferDist));
      else if (tool === 'intersection') geojson = await analysisApi.intersection(parseInt(layerA), parseInt(layerB));
      else geojson = await analysisApi.dissolve(parseInt(layerA), dissolveAttr);

      setResult(geojson);

      // Agregar como capa visible al mapa
      const sourceLayer = layers.find((l) => l.id === parseInt(layerA));
      const geomType = (geojson.features?.[0]?.geometry?.type) ?? sourceLayer?.geometry_type ?? 'Polygon';
      const opLabel = tool === 'buffer' ? `Buffer ${bufferDist}m` : tool === 'intersection' ? 'Intersección' : `Disolver por ${dissolveAttr}`;
      const sourceName = sourceLayer?.name ?? `capa ${layerA}`;

      const analysisLayer = {
        id: `${tool}-${Date.now()}`,
        name: `${opLabel} · ${sourceName}`,
        operation: tool as 'buffer' | 'intersection' | 'dissolve',
        geojson,
        geometry_type: geomType,
        feature_count: geojson.features?.length ?? 0,
        metadata: geojson.metadata ?? {},
        visible: true,
        opacity: 0.7,
        style: tool === 'buffer'
          ? { fill_color: '#a855f7', fill_opacity: 0.35, fill_outline_color: '#7e22ce', fill_outline_width: 2 }
          : tool === 'intersection'
          ? { fill_color: '#ef4444', fill_opacity: 0.5, fill_outline_color: '#991b1b', fill_outline_width: 2 }
          : { fill_color: '#f59e0b', fill_opacity: 0.45, fill_outline_color: '#b45309', fill_outline_width: 2 },
        created_at: new Date().toISOString(),
      };

      addAnalysisLayer(analysisLayer);

      addNotification({
        type: 'success',
        message: `Análisis "${opLabel}" agregado al mapa con ${geojson.features?.length ?? 0} features`,
      });

      // Zoom al resultado si tiene features
      if (geojson.features?.length > 0) {
        try {
          const turf = await import('@turf/turf');
          const bbox = turf.bbox(geojson);
          (window as any).__zoomToBBox?.(bbox);
        } catch {}
      }
    } catch (err: any) {
      addNotification({ type: 'error', message: err.response?.data?.detail ?? 'Error en el análisis' });
    } finally {
      setRunning(false);
    }
  };

  const downloadResult = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `analisis_${tool}.geojson`;
    a.click();
  };

  const layerOptions = layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>);
  const selectedLayer = layers.find((l) => l.id === parseInt(layerA));

  return (
    <div style={{ padding: 14, overflowY: 'auto', height: '100%' }}>
      <div className="geo-section-title">Herramienta de análisis</div>

      {/* Selector de herramienta */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 14 }}>
        {(['buffer', 'intersection', 'dissolve'] as const).map((t) => (
          <button key={t} className={`geo-btn ${tool === t ? 'active' : ''}`}
            style={{ justifyContent: 'center', fontSize: 10, padding: '6px 4px' }}
            onClick={() => setTool(t)}>
            {t === 'buffer' ? 'Buffer' : t === 'intersection' ? 'Intersect' : 'Dissolve'}
          </button>
        ))}
      </div>

      {/* Capa A */}
      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>
          {tool === 'intersection' ? 'Capa A' : 'Capa'}
        </label>
        <select className="geo-input" value={layerA} onChange={(e) => { setLayerA(e.target.value); setDissolveAttr(''); }}>
          <option value="">-- Seleccionar --</option>
          {layerOptions}
        </select>
      </div>

      {/* Opciones específicas por herramienta */}
      {tool === 'buffer' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>
            Distancia (metros)
          </label>
          <input className="geo-input" type="number" min="1" max="50000"
            value={bufferDist} onChange={(e) => setBufferDist(e.target.value)} />
        </div>
      )}

      {tool === 'intersection' && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>Capa B</label>
          <select className="geo-input" value={layerB} onChange={(e) => setLayerB(e.target.value)}>
            <option value="">-- Seleccionar --</option>
            {layerOptions}
          </select>
        </div>
      )}

      {tool === 'dissolve' && selectedLayer && (
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, color: 'var(--geo-text-muted)', display: 'block', marginBottom: 4 }}>
            Atributo para disolver
          </label>
          <select className="geo-input" value={dissolveAttr} onChange={(e) => setDissolveAttr(e.target.value)}>
            <option value="">-- Seleccionar atributo --</option>
            {Object.keys(selectedLayer.attributes ?? {}).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      )}

      <button className="geo-btn primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
        onClick={handleRun} disabled={running}>
        {running ? <span className="spin">⟳</span> : <Activity size={13} />}
        {running ? ' Ejecutando...' : ' Ejecutar análisis'}
      </button>

      {result && (
        <div style={{ marginTop: 14, padding: 10, background: 'var(--geo-accent-dim)', border: '1px solid rgba(45,212,160,0.3)', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--geo-accent)', fontWeight: 500, marginBottom: 6 }}>
            ✓ Resultado: {result.features?.length ?? 0} features
          </div>
          <div style={{ fontSize: 10, color: 'var(--geo-text-muted)', marginBottom: 8 }}>
            Visible en el mapa · Puedes editar estilo abajo
          </div>
          <button className="geo-btn" style={{ width: '100%', justifyContent: 'center', fontSize: 11 }} onClick={downloadResult}>
            <Download size={11} /> Descargar GeoJSON
          </button>
        </div>
      )}

      {/* Lista de capas de análisis activas en el mapa */}
      {analysisLayers.length > 0 && (
        <>
          <div className="geo-divider" />
          <div className="geo-section-title" style={{ marginBottom: 8 }}>
            Resultados en el mapa ({analysisLayers.length})
          </div>
          {analysisLayers.map((al) => (
            <AnalysisLayerCard
              key={al.id}
              layer={al}
              onToggle={() => toggleAnalysisLayerVisibility(al.id)}
              onRemove={() => removeAnalysisLayer(al.id)}
              onStyleChange={(s) => setAnalysisLayerStyle(al.id, s)}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ── Card de capa de análisis con editor de estilos ───────────────────────────
function AnalysisLayerCard({ layer, onToggle, onRemove, onStyleChange }: any) {
  const [open, setOpen] = useState(false);
  const operationColors: any = {
    buffer: '#a855f7',
    intersection: '#ef4444',
    dissolve: '#f59e0b',
  };
  const accent = operationColors[layer.operation] ?? '#a855f7';

  const downloadGeoJSON = () => {
    const blob = new Blob([JSON.stringify(layer.geojson)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${layer.name.replace(/[^a-z0-9]/gi, '_')}.geojson`;
    a.click();
  };

  return (
    <div style={{
      background: 'var(--geo-panel-alt)',
      border: `1px solid ${open ? accent : 'var(--geo-border)'}`,
      borderRadius: 8, marginBottom: 8, overflow: 'hidden',
    }}>
      <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onToggle}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: layer.visible ? accent : 'var(--geo-text-hint)' }}>
          {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
        </button>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: accent, flexShrink: 0 }} />
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <div style={{ fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
            {layer.name}
          </div>
          <div style={{ fontSize: 9, color: 'var(--geo-text-hint)' }}>
            {layer.feature_count} features
          </div>
        </div>
        <button onClick={() => setOpen(!open)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--geo-text-hint)' }}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </button>
      </div>

      {open && (
        <div style={{ padding: '0 10px 10px', borderTop: '1px solid var(--geo-border)' }}>
          <StyleEditorGeneric
            style={layer.style}
            geomType={layer.geometry_type}
            onChange={onStyleChange}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <button className="geo-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={downloadGeoJSON}>
              <Download size={11} /> Descargar
            </button>
            <button className="geo-btn danger" style={{ flex: 1, justifyContent: 'center' }} onClick={onRemove}>
              <Trash2 size={11} /> Quitar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Editor de estilo para capas regulares ────────────────────────────────────
function StyleEditor({ layer }: any) {
  const { updateLayerStyle } = useGeoStore();
  const style = layer.style ?? {};

  return (
    <div style={{ paddingTop: 8, borderTop: '1px solid var(--geo-border)' }}>
      <div className="geo-section-title" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        <Palette size={10} /> Estilo
      </div>
      <StyleEditorGeneric
        style={style}
        geomType={layer.geometry_type}
        onChange={(s: any) => updateLayerStyle(layer.id, { ...style, ...s })}
      />
    </div>
  );
}

// ── Editor genérico (reutilizable) ───────────────────────────────────────────
function StyleEditorGeneric({ style, geomType, onChange }: any) {
  const gt = (geomType ?? '').toLowerCase();
  const isPoint = gt.includes('point');
  const isLine = gt.includes('line');
  const isPolygon = !isPoint && !isLine;

  const Row = ({ label, children }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 10, color: 'var(--geo-text-muted)', minWidth: 75 }}>{label}</span>
      {children}
    </div>
  );

  const ColorInput = ({ value, onChange: oc }: any) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
      <input type="color" value={value ?? '#3b82f6'} onChange={(e) => oc(e.target.value)}
        style={{ width: 28, height: 22, border: '1px solid var(--geo-border)', borderRadius: 4, cursor: 'pointer', background: 'transparent' }} />
      <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--geo-text-muted)' }}>{value ?? '#3b82f6'}</span>
    </div>
  );

  return (
    <div>
      {isPolygon && (
        <>
          <Row label="Modo">
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => onChange({ ...style, outline_only: false })}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid ' + (!style.outline_only ? 'var(--geo-accent)' : 'var(--geo-border)'),
                  background: !style.outline_only ? 'var(--geo-accent-dim)' : 'var(--geo-panel)',
                  color: !style.outline_only ? 'var(--geo-accent)' : 'var(--geo-text-muted)',
                }}>Relleno</button>
              <button
                onClick={() => onChange({ ...style, outline_only: true })}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid ' + (style.outline_only ? 'var(--geo-accent)' : 'var(--geo-border)'),
                  background: style.outline_only ? 'var(--geo-accent-dim)' : 'var(--geo-panel)',
                  color: style.outline_only ? 'var(--geo-accent)' : 'var(--geo-text-muted)',
                }}>Contorno</button>
            </div>
          </Row>
          {!style.outline_only && (
            <>
              <Row label="Relleno">
                <ColorInput value={style.fill_color} onChange={(v: string) => onChange({ ...style, fill_color: v })} />
              </Row>
              <Row label="Opacidad">
                <input type="range" min={0} max={1} step={0.05} className="geo-slider"
                  value={style.fill_opacity ?? 0.5}
                  onChange={(e) => onChange({ ...style, fill_opacity: parseFloat(e.target.value) })} />
                <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--geo-text-muted)', minWidth: 28 }}>
                  {Math.round((style.fill_opacity ?? 0.5) * 100)}%
                </span>
              </Row>
            </>
          )}
          <Row label="Contorno">
            <ColorInput value={style.fill_outline_color} onChange={(v: string) => onChange({ ...style, fill_outline_color: v })} />
          </Row>
          <Row label="Grosor">
            <input type="range" min={0.5} max={6} step={0.5} className="geo-slider"
              value={style.fill_outline_width ?? 1.5}
              onChange={(e) => onChange({ ...style, fill_outline_width: parseFloat(e.target.value) })} />
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--geo-text-muted)', minWidth: 28 }}>
              {style.fill_outline_width ?? 1.5}px
            </span>
          </Row>
        </>
      )}

      {isLine && (
        <>
          <Row label="Color">
            <ColorInput value={style.line_color} onChange={(v: string) => onChange({ ...style, line_color: v })} />
          </Row>
          <Row label="Grosor">
            <input type="range" min={0.5} max={10} step={0.5} className="geo-slider"
              value={style.line_width ?? 2}
              onChange={(e) => onChange({ ...style, line_width: parseFloat(e.target.value) })} />
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--geo-text-muted)', minWidth: 28 }}>
              {style.line_width ?? 2}px
            </span>
          </Row>
        </>
      )}

      {isPoint && (
        <>
          <Row label="Modo">
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => onChange({ ...style, outline_only: false })}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid ' + (!style.outline_only ? 'var(--geo-accent)' : 'var(--geo-border)'),
                  background: !style.outline_only ? 'var(--geo-accent-dim)' : 'var(--geo-panel)',
                  color: !style.outline_only ? 'var(--geo-accent)' : 'var(--geo-text-muted)',
                }}>Lleno</button>
              <button
                onClick={() => onChange({ ...style, outline_only: true })}
                style={{
                  fontSize: 10, padding: '3px 8px', borderRadius: 4, cursor: 'pointer',
                  border: '1px solid ' + (style.outline_only ? 'var(--geo-accent)' : 'var(--geo-border)'),
                  background: style.outline_only ? 'var(--geo-accent-dim)' : 'var(--geo-panel)',
                  color: style.outline_only ? 'var(--geo-accent)' : 'var(--geo-text-muted)',
                }}>Hueco</button>
            </div>
          </Row>
          {!style.outline_only && (
            <Row label="Relleno">
              <ColorInput value={style.circle_color} onChange={(v: string) => onChange({ ...style, circle_color: v })} />
            </Row>
          )}
          <Row label="Borde">
            <ColorInput value={style.circle_stroke_color} onChange={(v: string) => onChange({ ...style, circle_stroke_color: v })} />
          </Row>
          <Row label="Tamaño">
            <input type="range" min={2} max={20} step={1} className="geo-slider"
              value={style.circle_radius ?? 6}
              onChange={(e) => onChange({ ...style, circle_radius: parseFloat(e.target.value) })} />
            <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', color: 'var(--geo-text-muted)', minWidth: 28 }}>
              {style.circle_radius ?? 6}px
            </span>
          </Row>
        </>
      )}
    </div>
  );
}
