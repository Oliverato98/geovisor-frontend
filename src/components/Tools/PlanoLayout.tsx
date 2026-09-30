/**
 * components/Tools/PlanoLayout.tsx
 * Vista de composición de planos del Geovisor de Calarcá (v3).
 *
 * Layout tipo ArcGIS Pro: hoja en pantalla, marco de mapa vivo, elementos que se
 * arrastran, galerías de flechas de norte y barras de escala, gráficos (línea,
 * flecha, rectángulo, elipse), imágenes (escudo) y campos de texto dinámico.
 * Lo que se ve en pantalla es exactamente lo que se descarga en PDF.
 *
 * Requiere:  npm install jspdf proj4 && npm install -D @types/proj4
 * Necesita el archivo hermano planoPrimitivas.ts
 * Montar una sola vez en App.tsx:  <PlanoLayout />
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import jsPDF from 'jspdf';
import proj4 from 'proj4';
import { useGeoStore, type GeoLayer, type RasterLayer } from '../../store/useGeoStore';
import { sincronizarRasters, idCapaRaster, coloresDe, textoClase } from '../../services/rasterMapa';
import {
  type Prim, type Contexto,
  ESTILOS_NORTE, ESTILOS_ESCALA, CAMPOS_DINAMICOS,
  figuraNorte, figuraEscala, figuraGrafico, resolverTexto,
} from './planoPrimitivas';

proj4.defs(
  'EPSG:9377',
  '+proj=tmerc +lat_0=4 +lon_0=-73 +k=0.9992 +x_0=5000000 +y_0=2000000 ' +
    '+ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs'
);

/* ---------------------------------------------------------------- modelo */

// Medidas en milímetros, siempre en vertical. La orientación se aplica aparte.
const PAPELES = {
  A5:       { ancho: 148, alto: 210, grupo: 'ISO' },
  A4:       { ancho: 210, alto: 297, grupo: 'ISO' },
  A3:       { ancho: 297, alto: 420, grupo: 'ISO' },
  A2:       { ancho: 420, alto: 594, grupo: 'ISO' },
  A1:       { ancho: 594, alto: 841, grupo: 'ISO' },
  A0:       { ancho: 841, alto: 1189, grupo: 'ISO' },
  Carta:    { ancho: 216, alto: 279, grupo: 'Comercial' },
  Oficio:   { ancho: 216, alto: 330, grupo: 'Comercial' },
  Tabloide: { ancho: 279, alto: 432, grupo: 'Comercial' },
  B2:       { ancho: 500, alto: 707, grupo: 'Grandes' },
  B1:       { ancho: 707, alto: 1000, grupo: 'Grandes' },
  'Medio pliego': { ancho: 500, alto: 700, grupo: 'Grandes' },
  Pliego:   { ancho: 700, alto: 1000, grupo: 'Grandes' },
  Personalizado: { ancho: 500, alto: 700, grupo: 'Grandes' },
} as const;
type Papel = keyof typeof PAPELES;

const ESCALAS = [
  100, 200, 250, 500, 750,
  1000, 1500, 2000, 2500, 3000, 4000, 5000, 7500,
  10000, 12500, 15000, 20000, 25000, 50000, 75000,
  100000, 150000, 200000, 250000, 500000,
];
const DPI = 200;
const PT = 0.3528;

type TipoElemento =
  | 'mapa' | 'rotulo' | 'norte' | 'escala' | 'convenciones' | 'titulo' | 'texto' | 'datos' | 'referencia'
  | 'linea' | 'flecha' | 'rect' | 'elipse' | 'imagen';

interface Elemento {
  id: string;
  tipo: TipoElemento;
  x: number; y: number; ancho: number; alto: number;
  visible: boolean;
  texto?: string;
  tamano?: number;
  negrita?: boolean;
  color?: string;
  espaciado?: number;
  columnas?: number;
  largo?: number;
  estilo?: number;       // variante de la galería
  grosor?: number;       // mm
  rellenar?: boolean;
  dataUrl?: string;      // imágenes
}

interface Tick { frac: number; valor: number }
interface Esquinas { si: string; sd: string; ii: string; id: string; centro: string }

const SIN_ESQUINAS: Esquinas = { si: '—', sd: '—', ii: '—', id: '—', centro: '—' };

/* ----------------------------------------------------------- utilidades */

const mppImpresion = (escala: number) => (escala * 25.4) / (DPI * 1000);
const zoomPara = (mpp: number, lat: number) =>
  Math.log2((156543.03392804097 * Math.cos((lat * Math.PI) / 180)) / mpp);

/** Una fila de las convenciones, venga de una capa vectorial o de un ráster. */
interface Convencion {
  clave: string;
  texto: string;
  /** Un color para un vector o una clase; la rampa completa para un continuo. */
  colores: string[];
  forma: 'punto' | 'linea' | 'area' | 'rampa';
  /** Nombre de un ráster de clases: va sin símbolo, con sus clases debajo. */
  encabezado?: boolean;
}

function tipoGeom(l: GeoLayer): 'point' | 'line' | 'polygon' {
  const g = (l.geometry_type ?? '').toLowerCase();
  if (g.includes('point')) return 'point';
  if (g.includes('line')) return 'line';
  return 'polygon';
}

function colorCapa(l: GeoLayer): string {
  const s = (l.style ?? {}) as Record<string, unknown>;
  const t = tipoGeom(l);
  if (t === 'point') return (s.circle_color as string) ?? '#2dd4a0';
  if (t === 'line') return (s.line_color as string) ?? '#f59e0b';
  return (s.fill_color as string) ?? '#3b82f6';
}

function hexARgb(hex: string): [number, number, number] {
  const l = (hex ?? '').replace('#', '');
  const c = l.length === 3 ? l.split('').map((x) => x + x).join('') : l;
  const n = parseInt(c.slice(0, 6), 16);
  return Number.isNaN(n) ? [17, 17, 17] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function largoBarraAuto(escala: number) {
  const ops = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
  let mejor = ops[0], dif = Infinity;
  for (const m of ops) {
    const mm = (m * 1000) / escala;
    if (mm > 60) continue;
    if (Math.abs(mm - 45) < dif) { dif = Math.abs(mm - 45); mejor = m; }
  }
  return mejor;
}

function metrosBarra(escala: number, largoMm?: number) {
  if (!largoMm) return largoBarraAuto(escala);
  const ops = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000];
  return ops.reduce((a, b) =>
    Math.abs((b * 1000) / escala - largoMm) < Math.abs((a * 1000) / escala - largoMm) ? b : a);
}

function espaciadoAuto(escala: number) {
  const ops = [25, 50, 100, 250, 500, 1000, 2000, 5000, 10000, 20000];
  const objetivo = (escala * 40) / 1000;
  return ops.reduce((a, b) => (Math.abs(b - objetivo) < Math.abs(a - objetivo) ? b : a));
}

const fmt = (v: number) => v.toLocaleString('es-CO', { maximumFractionDigits: 0 });
const fechaHoy = () =>
  new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });

const aCTM12 = (lng: number, lat: number) => {
  const c = proj4('EPSG:4326', 'EPSG:9377', [lng, lat]);
  return `E ${fmt(c[0])}  N ${fmt(c[1])}`;
};

function esquinasDe(mapa: maplibregl.Map): Esquinas {
  const b = mapa.getBounds(), c = mapa.getCenter();
  return {
    si: aCTM12(b.getWest(), b.getNorth()),
    sd: aCTM12(b.getEast(), b.getNorth()),
    ii: aCTM12(b.getWest(), b.getSouth()),
    id: aCTM12(b.getEast(), b.getSouth()),
    centro: aCTM12(c.lng, c.lat),
  };
}

function calcularGrilla(
  mapa: maplibregl.Map, espaciado: number, anchoPx: number, altoPx: number
): { vert: Tick[]; horiz: Tick[] } {
  if (!anchoPx || !altoPx) return { vert: [], horiz: [] };
  const b = mapa.getBounds();
  const esq = [
    [b.getWest(), b.getSouth()], [b.getEast(), b.getSouth()],
    [b.getWest(), b.getNorth()], [b.getEast(), b.getNorth()],
  ].map((c) => proj4('EPSG:4326', 'EPSG:9377', c));
  const es = esq.map((c) => c[0]), ns = esq.map((c) => c[1]);
  const minE = Math.min(...es), maxE = Math.max(...es);
  const minN = Math.min(...ns), maxN = Math.max(...ns);

  let paso = espaciado, guarda = 0;
  while (((maxE - minE) / paso > 10 || (maxN - minN) / paso > 10) && guarda++ < 20) paso *= 2;

  const medioN = (minN + maxN) / 2, medioE = (minE + maxE) / 2;
  const vert: Tick[] = [], horiz: Tick[] = [];
  for (let e = Math.ceil(minE / paso) * paso; e <= maxE; e += paso) {
    const ll = proj4('EPSG:9377', 'EPSG:4326', [e, medioN]);
    const frac = mapa.project([ll[0], ll[1]]).x / anchoPx;
    if (frac > 0.02 && frac < 0.98) vert.push({ frac, valor: e });
  }
  for (let n = Math.ceil(minN / paso) * paso; n <= maxN; n += paso) {
    const ll = proj4('EPSG:9377', 'EPSG:4326', [medioE, n]);
    const frac = mapa.project([ll[0], ll[1]]).y / altoPx;
    if (frac > 0.02 && frac < 0.98) horiz.push({ frac, valor: n });
  }
  return { vert, horiz };
}

/* -------------------------------------------- dibujo de primitivas: SVG */

function primASvg(p: Prim, i: number, vista: number, color: string) {
  const k = (v: number) => v * vista;
  const lw = Math.max(0.4, (p.lw ?? 0.3) * vista);
  const fill = p.blanco ? '#fff' : p.relleno ? color : 'none';

  if (p.k === 'poly') {
    return <polygon key={i} points={(p.pts ?? []).map(([x, y]) => `${k(x)},${k(y)}`).join(' ')}
      fill={p.relleno ? color : 'none'} stroke={color} strokeWidth={p.relleno ? 0 : lw} />;
  }
  if (p.k === 'line') {
    return <line key={i} x1={k(p.x ?? 0)} y1={k(p.y ?? 0)} x2={k(p.x2 ?? 0)} y2={k(p.y2 ?? 0)}
      stroke={color} strokeWidth={lw} />;
  }
  if (p.k === 'circle') {
    return <circle key={i} cx={k(p.cx ?? 0)} cy={k(p.cy ?? 0)} r={k(p.r ?? 1)}
      fill={p.relleno ? color : 'none'} stroke={color} strokeWidth={lw} />;
  }
  if (p.k === 'rect') {
    return <rect key={i} x={k(p.x ?? 0)} y={k(p.y ?? 0)} width={k(p.w ?? 0)} height={k(p.h ?? 0)}
      fill={fill} stroke={color} strokeWidth={lw} />;
  }
  return (
    <text key={i} x={k(p.x ?? 0)} y={k(p.y ?? 0)}
      fontSize={Math.max(5, (p.size ?? 6) * PT * vista)}
      textAnchor={p.align === 'center' ? 'middle' : p.align === 'right' ? 'end' : 'start'}
      fontWeight={p.bold ? 700 : 400} fill={color}>
      {p.txt}
    </text>
  );
}

/* -------------------------------------------- dibujo de primitivas: PDF */

function primAPdf(pdf: jsPDF, p: Prim, ox: number, oy: number, color: string) {
  const [r, g, b] = hexARgb(color);
  pdf.setDrawColor(r, g, b);
  pdf.setLineWidth(p.lw ?? 0.3);

  if (p.k === 'poly' && p.pts?.length) {
    const pts = p.pts.map(([x, y]) => [ox + x, oy + y] as [number, number]);
    if (p.relleno) pdf.setFillColor(r, g, b);
    const lineas = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]] as [number, number]);
    lineas.push([pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]]);
    pdf.lines(lineas, pts[0][0], pts[0][1], [1, 1], p.relleno ? 'F' : 'S', true);
    return;
  }
  if (p.k === 'line') {
    pdf.line(ox + (p.x ?? 0), oy + (p.y ?? 0), ox + (p.x2 ?? 0), oy + (p.y2 ?? 0));
    return;
  }
  if (p.k === 'circle') {
    if (p.relleno) pdf.setFillColor(r, g, b);
    pdf.circle(ox + (p.cx ?? 0), oy + (p.cy ?? 0), p.r ?? 1, p.relleno ? 'F' : 'S');
    return;
  }
  if (p.k === 'rect') {
    if (p.blanco) { pdf.setFillColor(255, 255, 255); pdf.rect(ox + (p.x ?? 0), oy + (p.y ?? 0), p.w ?? 0, p.h ?? 0, 'FD'); return; }
    if (p.relleno) { pdf.setFillColor(r, g, b); pdf.rect(ox + (p.x ?? 0), oy + (p.y ?? 0), p.w ?? 0, p.h ?? 0, 'FD'); return; }
    pdf.rect(ox + (p.x ?? 0), oy + (p.y ?? 0), p.w ?? 0, p.h ?? 0, 'S');
    return;
  }
  pdf.setTextColor(r, g, b);
  pdf.setFont('helvetica', p.bold ? 'bold' : 'normal');
  pdf.setFontSize(p.size ?? 6);
  pdf.text(p.txt ?? '', ox + (p.x ?? 0), oy + (p.y ?? 0), { align: p.align ?? 'left' });
}

/* --------------------------------------------------- plantilla inicial */

/**
 * Los parámetros del sistema de coordenadas oficial de Colombia, en el orden
 * y con los nombres con que los imprime ArcGIS, para que el plano se pueda
 * cotejar contra la ficha de la capa sin traducir nada.
 */
const REFERENCIA_ESPACIAL: Array<[string, string]> = [
  ['Name', 'MAGNA-SIRGAS 2018 Origen-Nacional'],
  ['PCS', 'MAGNA-SIRGAS 2018 Origen-Nacional'],
  ['GCS', 'MAGNA-SIRGAS 2018'],
  ['Datum', 'Marco Geocéntrico Nacional de Referencia 2018'],
  ['Projection', 'Transverse Mercator'],
  ['Central Meridian', '-73,0000'],
  ['Latitude of Origin', '4,0000'],
  ['Longitude of Origin', '0,0000'],
  ['Latitude of Center', '0,0000'],
  ['Longitude of Center', '0,0000'],
  ['Latitude of 1st', '0,0000'],
  ['Longitude of 1st', '0,0000'],
  ['Latitude of 2nd', '0,0000'],
  ['Longitude of 2nd', '0,0000'],
  ['False Easting', '5.000.000,0000'],
  ['False Northing', '2.000.000,0000'],
  ['Central Parallel', '0,0000'],
  ['Standard Parallel', '0,0000'],
  ['Standard Parallel 2', '0,0000'],
  ['Scale Factor', '0,9992'],
  ['Azimuth', '0,0000'],
  ['Map Units', 'Meter'],
];

/**
 * Arma la distribución del rótulo.
 *
 * `nCapas` son las filas de las convenciones y `nElaboro` los nombres de quien
 * elaboró: los dos bloques crecen con su contenido, y si no se cuentan, lo que
 * va debajo termina encima de ellos.
 */
function plantilla(
  dim: { ancho: number; alto: number }, horizontal: boolean,
  nCapas: number, nElaboro = 1
): Elemento[] {
  const w = horizontal ? dim.alto : dim.ancho;
  const h = horizontal ? dim.ancho : dim.alto;
  const m = 12, rot = 76, pad = 5;
  const rotX = w - m - rot, colX = rotX + pad, colW = rot - pad * 2;

  const columnas = nCapas > 14 ? 2 : 1;
  const filas = Math.ceil(Math.max(nCapas, 1) / columnas);
  const altoCon = 6 + filas * 4;

  // El marco del mapa, que sirve de referencia para el norte y la escala.
  const mapaX = m, mapaY = m;
  const mapaW = rotX - m - 6, mapaH = h - m * 2;

  // Los datos técnicos tienen siete entradas; «Elaboró» aporta un renglón
  // más por cada nombre a partir del primero.
  const altoDatos = 52 + Math.max(0, nElaboro - 1) * 3.2;

  let y = m + pad + 3;
  const yTitulo = y; y += 22;
  const yCon = y;    y += altoCon + 8;
  const yDatos = y;  y += altoDatos + 4;
  const yRef = Math.min(y, h - m - pad - 62);

  return [
    { id: 'mapa', tipo: 'mapa', x: mapaX, y: mapaY, ancho: mapaW, alto: mapaH, visible: true },
    { id: 'rotulo', tipo: 'rotulo', x: rotX, y: m, ancho: rot, alto: h - m * 2, visible: true },
    { id: 'titulo', tipo: 'titulo', x: colX, y: yTitulo, ancho: colW, alto: 22,
      texto: 'Plano temático municipal', tamano: 11, negrita: true, color: '#111111', visible: true },
    { id: 'convenciones', tipo: 'convenciones', x: colX, y: yCon, ancho: colW, alto: altoCon,
      tamano: 6.5, espaciado: 4, columnas, color: '#111111', visible: true },
    // El norte y la escala van dentro del mapa, como en un plano de ArcGIS:
    // el norte arriba a la derecha y la barra de escala abajo a la izquierda.
    { id: 'norte', tipo: 'norte', x: mapaX + mapaW - 18, y: mapaY + 5, ancho: 12, alto: 18,
      estilo: 0, color: '#111111', visible: true },
    { id: 'escala', tipo: 'escala', x: mapaX + 6, y: mapaY + mapaH - 10, ancho: 46, alto: 8,
      tamano: 6, largo: 45, estilo: 0, color: '#111111', visible: true },
    { id: 'datos', tipo: 'datos', x: colX, y: yDatos, ancho: colW, alto: altoDatos,
      tamano: 6.5, espaciado: 4, color: '#111111', visible: true },
    { id: 'referencia', tipo: 'referencia', x: colX, y: yRef, ancho: colW, alto: 62,
      tamano: 5, espaciado: 2.3, color: '#111111', visible: true },
  ];
}

/* ------------------------------------------------------------ componente */

export default function PlanoLayout() {
  const {
    map, layers, addNotification, toggleLayerVisibility,
    rasterLayers, toggleRasterVisibility,
  } = useGeoStore();

  const [abierto, setAbierto] = useState(false);
  const [papel, setPapel] = useState<Papel>('A3');
  const [propio, setPropio] = useState({ ancho: 500, alto: 700 });   // papel a medida
  const [horizontal, setHorizontal] = useState(true);
  const [escala, setEscala] = useState(5000);
  const [marco, setMarco] = useState(true);
  const [grilla, setGrilla] = useState(true);
  const [espaciado, setEspaciado] = useState<number | 'auto'>('auto');
  const [grillaTam, setGrillaTam] = useState(5.5);
  const [elementos, setElementos] = useState<Elemento[]>(() => plantilla(PAPELES.A3, true, 0));
  const [selId, setSelId] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);   // galería desplegable abierta

  const [entidad, setEntidad] = useState('Alcaldía Municipal de Calarcá — Quindío');
  const [elaboro, setElaboro] = useState('');
  const [fuente, setFuente] = useState('IGAC, CRQ, Alcaldía de Calarcá');

  const hojaRef = useRef<HTMLDivElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<maplibregl.Map | null>(null);
  const archivoRef = useRef<HTMLInputElement>(null);
  const arrastre = useRef<
    { id: string; dx: number; dy: number; nodo: HTMLElement | null; x: number; y: number }
    | null>(null);
  const [ticks, setTicks] = useState<{ vert: Tick[]; horiz: Tick[] }>({ vert: [], horiz: [] });
  const [esquinas, setEsquinas] = useState<Esquinas>(SIN_ESQUINAS);

  const dim = papel === 'Personalizado'
    ? { ancho: propio.ancho, alto: propio.alto }
    : PAPELES[papel];
  const hojaAncho = horizontal ? dim.alto : dim.ancho;
  const hojaAlto = horizontal ? dim.ancho : dim.alto;

  const [vista, setVista] = useState(2);
  useEffect(() => {
    const ajustar = () => setVista(Math.min(
      (window.innerWidth - 390) / hojaAncho,
      (window.innerHeight - 110) / hojaAlto
    ));
    ajustar();
    window.addEventListener('resize', ajustar);
    return () => window.removeEventListener('resize', ajustar);
  }, [hojaAncho, hojaAlto]);

  const visibles = useMemo(() => layers.filter((l) => l.visible), [layers]);
  const visiblesRaster = useMemo(
    () => rasterLayers.filter((r) => r.visible),
    [rasterLayers]
  );

  // Las convenciones mezclan capas vectoriales y ráster. Un vector aporta un
  // solo color; un ráster aporta su rampa entera, que se dibuja como una tira
  // de colores igual que la muestra ArcGIS cuando la capa está plegada.
  const convenciones = useMemo<Convencion[]>(() => [
    ...visibles.map((c) => ({
      clave: `v${c.id}`,
      texto: c.name.replace(/_/g, ' '),
      colores: [colorCapa(c)],
      forma: ({ point: 'punto', line: 'linea', polygon: 'area' } as const)[tipoGeom(c)],
    })),
    ...visiblesRaster.flatMap((r): Convencion[] => {
      const colores = coloresDe(r);

      if (r.tipo === 'continuo') {
        const n = (v: number) => v.toLocaleString('es-CO', { maximumFractionDigits: 1 });
        return [{
          clave: `r${r.id}`,
          texto: `${r.nombre} (${n(r.minimo)} – ${n(r.maximo)} ${r.unidad})`,
          colores,
          forma: 'rampa',
        }];
      }

      // Una sola clase no necesita encabezado: el nombre de la capa basta.
      if (r.clases.length === 1) {
        return [{
          clave: `r${r.id}`, texto: r.nombre, colores: [colores[0]], forma: 'area',
        }];
      }

      return [
        { clave: `r${r.id}`, texto: r.nombre, colores: [], forma: 'area', encabezado: true },
        ...r.clases.map((c, i): Convencion => ({
          clave: `r${r.id}-${c.indice}`,
          texto: textoClase(r, c.indice),
          colores: [colores[i]],
          forma: 'area',
        })),
      ];
    }),
  ], [visibles, visiblesRaster]);

  const elMapa = elementos.find((e) => e.id === 'mapa')!;
  const elNorte = elementos.find((e) => e.tipo === 'norte');
  const elEscala = elementos.find((e) => e.tipo === 'escala');
  const espActual = espaciado === 'auto' ? espaciadoAuto(escala) : espaciado;

  const ctx: Contexto = {
    escala, fecha: fechaHoy(), entidad, elaboro, fuente,
    capas: convenciones.map((c) => c.texto),
    grilla: grilla ? `cada ${fmt(espActual)} m` : 'sin grilla',
    esquinas,
  };

  const datosTecnicos = (): Array<[string, string]> => ([
    ['Escala', `1:${escala.toLocaleString('es-CO')}`],
    ['Sistema de referencia', 'MAGNA-SIRGAS / Origen Nacional'],
    ['Proyección', 'CTM12 — EPSG:9377'],
    ['Grilla', ctx.grilla],
    ['Fecha', ctx.fecha],
    ['Elaboró', elaboro || '—'],
    ['Fuente', fuente],
  ]);

  /* ------------------------------------------ mapa de previsualización */

  const refrescar = useCallback(() => {
    const prev = previewRef.current, cont = marcoRef.current;
    if (!prev || !cont) return;
    setTicks(calcularGrilla(prev, espActual, cont.clientWidth, cont.clientHeight));
    setEsquinas(esquinasDe(prev));
  }, [espActual]);

  const ajustarZoom = useCallback(() => {
    const prev = previewRef.current, cont = marcoRef.current;
    if (!prev || !cont || !cont.clientWidth) return;
    const anchoTerreno = (elMapa.ancho / 1000) * escala;
    prev.setZoom(zoomPara(anchoTerreno / cont.clientWidth, prev.getCenter().lat));
  }, [escala, elMapa.ancho]);

  useEffect(() => {
    if (!abierto || !map || !marcoRef.current || previewRef.current) return;

    const prev = new maplibregl.Map({
      container: marcoRef.current,
      style: map.getStyle(),
      center: map.getCenter(),
      zoom: map.getZoom(),
      attributionControl: false,
      preserveDrawingBuffer: true,
      dragRotate: false,
      scrollZoom: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
    });
    previewRef.current = prev;
    prev.on('move', refrescar);
    prev.on('moveend', refrescar);
    prev.on('idle', refrescar);

    const obs = new ResizeObserver(() => { prev.resize(); ajustarZoom(); refrescar(); });
    obs.observe(marcoRef.current);
    return () => { obs.disconnect(); prev.remove(); previewRef.current = null; };
  }, [abierto, map]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ajustarZoom();
    const t = setTimeout(refrescar, 300);
    return () => clearTimeout(t);
  }, [ajustarZoom, refrescar, vista, elMapa.alto]);

  // El plano se dibuja sobre un mapa propio, clonado del principal al abrir el
  // compositor. Los interruptores de capas cambian el mapa del geovisor, no
  // este, así que hay que reflejar aquí cada encendido y apagado o la vista
  // previa se queda mostrando lo que había cuando se abrió.
  useEffect(() => {
    const prev = previewRef.current;
    if (!abierto || !prev || !prev.isStyleLoaded()) return;

    layers.forEach((c) => {
      for (const id of [`lyr-${c.id}`, `lyr-${c.id}-outline`]) {
        if (prev.getLayer(id)) {
          prev.setLayoutProperty(id, 'visibility', c.visible ? 'visible' : 'none');
        }
      }
    });

    // Un ráster encendido después de abrir el compositor todavía no existe en
    // este mapa, así que aquí se crea igual que en el principal. Colorear la
    // imagen toma un momento, por eso el refresco espera a que termine.
    let vigente = true;
    sincronizarRasters(prev, rasterLayers)
      .then(() => {
        if (!vigente) return;
        rasterLayers.forEach((r) => {
          const id = idCapaRaster(r.id);
          if (prev.getLayer(id)) {
            prev.setLayoutProperty(id, 'visibility', r.visible ? 'visible' : 'none');
            prev.setPaintProperty(id, 'raster-opacity', r.opacity);
          }
        });
        refrescar();
      })
      .catch(() => {
        // El error ya se le informó al usuario desde el mapa principal.
      });

    const t = setTimeout(refrescar, 220);
    return () => { vigente = false; clearTimeout(t); };
  }, [abierto, layers, rasterLayers, refrescar]);

  /* ------------------------------------------------------- arrastrar */

  const alBajar = (e: React.MouseEvent, el: Elemento) => {
    e.stopPropagation();
    setSelId(el.id);
    if (el.tipo === 'mapa') return;
    const hoja = hojaRef.current!.getBoundingClientRect();
    arrastre.current = {
      id: el.id,
      dx: (e.clientX - hoja.left) / vista - el.x,
      dy: (e.clientY - hoja.top) / vista - el.y,
      nodo: e.currentTarget as HTMLElement,
      x: el.x, y: el.y,
    };
  };

  useEffect(() => {
    // Mientras se arrastra se mueve el nodo directamente. Antes esto
    // reconstruía el árbol de React en cada pixel, y el canvas del mapa
    // quedaba en negro; ahora el estado se confirma una sola vez al soltar.
    const mover = (e: MouseEvent) => {
      const a = arrastre.current;
      if (!a || !hojaRef.current) return;
      const hoja = hojaRef.current.getBoundingClientRect();
      a.x = Math.max(-5, Math.min(hojaAncho - 3, (e.clientX - hoja.left) / vista - a.dx));
      a.y = Math.max(-5, Math.min(hojaAlto - 3, (e.clientY - hoja.top) / vista - a.dy));
      if (a.nodo) {
        a.nodo.style.left = `${a.x * vista}px`;
        a.nodo.style.top = `${a.y * vista}px`;
      }
    };
    const soltar = () => {
      const a = arrastre.current;
      arrastre.current = null;
      if (!a) return;
      setElementos((els) => els.map((el) =>
        el.id === a.id ? { ...el, x: a.x, y: a.y } : el));
    };
    window.addEventListener('mousemove', mover);
    window.addEventListener('mouseup', soltar);
    return () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('mouseup', soltar);
    };
  }, [vista, hojaAncho, hojaAlto]);

  const actualizar = (id: string, c: Partial<Elemento>) =>
    setElementos((els) => els.map((el) => (el.id === id ? { ...el, ...c } : el)));

  const nuevoId = (t: string) => `${t}-${Date.now()}`;

  const agregar = (el: Omit<Elemento, 'id' | 'visible'>) => {
    const id = nuevoId(el.tipo);
    setElementos((els) => [...els, { ...el, id, visible: true } as Elemento]);
    setSelId(id);
  };

  /**
   * Dónde nace un elemento nuevo. Sobre el mapa se perdería entre las capas,
   * así que aparece sobre la franja blanca del rótulo, donde se ve y se puede
   * agarrar; de ahí se arrastra a donde haga falta.
   */
  const puntoDeEntrada = (ancho: number, alto: number) => {
    const rot = elementos.find((e) => e.id === 'rotulo');
    if (!rot) return { x: hojaAncho / 2 - ancho / 2, y: 20 };

    // Justo debajo del elemento más bajo del rótulo, si queda espacio.
    const dentro = elementos.filter(
      (e) => e.id !== 'rotulo' && e.x >= rot.x - 1 && e.x < rot.x + rot.ancho
    );
    const fondo = dentro.length
      ? Math.max(...dentro.map((e) => e.y + e.alto))
      : rot.y + 6;

    const x = rot.x + 5;
    const margen = rot.y + rot.alto - 6;
    const y = fondo + 6 + alto <= margen ? fondo + 6 : Math.max(rot.y + 6, margen - alto);
    return { x, y };
  };

  const agregarTexto = (txt = 'Texto nuevo') =>
    agregar({ ...puntoDeEntrada(60, 8), tipo: 'texto', ancho: 60, alto: 8, texto: txt, tamano: 10, color: '#111111' });

  const agregarGrafico = (tipo: 'linea' | 'flecha' | 'rect' | 'elipse') =>
    agregar({ ...puntoDeEntrada(40, 20), tipo, ancho: 40, alto: 20, grosor: 0.4, rellenar: false, color: '#111111' });

  const cargarImagen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => {
      const img = new Image();
      img.onload = () => {
        const prop = img.height / img.width;
        agregar({
          ...puntoDeEntrada(25, 25 * prop),
          tipo: 'imagen', ancho: 25, alto: 25 * prop, dataUrl: String(lector.result),
        });
      };
      img.src = String(lector.result);
    };
    lector.readAsDataURL(f);
    e.target.value = '';
  };

  // El molde se rehace con el número de filas de la leyenda, no con el de
  // capas: un ráster de clases ocupa una fila por clase, y si no se cuentan
  // todas, la flecha de norte y la escala terminan encima de las convenciones.
  const lineasElaboro = Math.max(1, elaboro.split('\n').length);

  const acomodar = () => {
    setElementos(plantilla(dim, horizontal, convenciones.length, lineasElaboro));
    setSelId(null);
  };

  useEffect(() => {
    setElementos(plantilla(dim, horizontal, convenciones.length, lineasElaboro));
    setSelId(null);
  }, [dim.ancho, dim.alto, horizontal, convenciones.length, lineasElaboro]);

  const insertarCampo = (token: string) => {
    if (!selId) return;
    const el = elementos.find((e) => e.id === selId);
    if (!el || (el.tipo !== 'texto' && el.tipo !== 'titulo')) return;
    actualizar(selId, { texto: `${el.texto ?? ''}${token}` });
  };

  const nombreEl = (el: Elemento) => ({
    mapa: 'Marco del mapa', rotulo: 'Caja del rótulo', titulo: 'Encabezado y título',
    datos: 'Datos técnicos', referencia: 'Referencia espacial',
    norte: 'Flecha de norte', escala: 'Escala gráfica',
    convenciones: 'Convenciones', imagen: 'Imagen', linea: 'Línea', flecha: 'Flecha',
    rect: 'Rectángulo', elipse: 'Elipse',
    texto: resolverTexto(el.texto ?? 'Texto', ctx).slice(0, 24) || 'Texto',
  } as Record<string, string>)[el.tipo] ?? el.tipo;

  /** Encuadra una capa en el marco: la centra y sube a la escala más
   *  cercana que la contenga completa. */
  const encuadrar = (
    oeste: number, sur: number, este: number, norte: number, titulo: string
  ) => {
    const prev = previewRef.current;
    if (!prev || oeste == null) return;

    const cx = (oeste + este) / 2;
    const cy = (sur + norte) / 2;

    // Grados a metros en esta latitud
    const anchoM = (este - oeste) * 111320 * Math.cos((cy * Math.PI) / 180);
    const altoM = (norte - sur) * 110540;

    // Escala mínima que hace caber la capa en el marco, con 8% de margen
    const necesaria = Math.max(anchoM / (elMapa.ancho / 1000), altoM / (elMapa.alto / 1000)) * 1.08;
    const nueva = ESCALAS.find((e) => e >= necesaria) ?? ESCALAS[ESCALAS.length - 1];

    setEscala(nueva);
    prev.setCenter([cx, cy]);
    setTimeout(refrescar, 320);
    addNotification({
      type: 'info',
      message: `${titulo} · escala 1:${nueva.toLocaleString('es-CO')}`,
    });
  };

  const irACapa = (c: GeoLayer) =>
    encuadrar(c.bbox_minx, c.bbox_miny, c.bbox_maxx, c.bbox_maxy, c.name.replace(/_/g, ' '));

  const irARaster = (r: RasterLayer) =>
    encuadrar(r.esquinas[0][0], r.esquinas[2][1], r.esquinas[1][0], r.esquinas[0][1], r.nombre);

  /* ---------------------------------------------------- exportar PDF */

  const exportar = async () => {
    const prev = previewRef.current;
    if (!map || !prev) return;
    setGenerando(true);

    try {
      const anchoPx = Math.round((elMapa.ancho / 25.4) * DPI);
      const altoPx = Math.round((elMapa.alto / 25.4) * DPI);
      if (anchoPx > 9000 || altoPx > 9000) throw new Error('Marco demasiado grande. Usa un papel más pequeño.');

      const centro = prev.getCenter();
      const zoom = zoomPara(mppImpresion(escala), centro.lat);

      const cont = document.createElement('div');
      cont.style.cssText = `position:absolute;left:-20000px;top:0;width:${anchoPx}px;height:${altoPx}px;`;
      document.body.appendChild(cont);

      const alta = new maplibregl.Map({
        container: cont, style: map.getStyle(), center: centro, zoom,
        interactive: false, attributionControl: false,
        preserveDrawingBuffer: true, fadeDuration: 0, pixelRatio: 1,
      });

      let imagen = '';
      let ticksPdf: { vert: Tick[]; horiz: Tick[] } = { vert: [], horiz: [] };
      let esqPdf = esquinas;
      try {
        await new Promise<void>((ok, fallo) => {
          const reloj = setTimeout(() => fallo(new Error('El mapa tardó demasiado en cargar los tiles.')), 120000);
          alta.once('idle', () => { clearTimeout(reloj); ok(); });
          alta.once('error', (e) => { clearTimeout(reloj); fallo(e.error ?? new Error('Error de mapa')); });
        });
        imagen = alta.getCanvas().toDataURL('image/png');
        ticksPdf = calcularGrilla(alta, espActual, anchoPx, altoPx);
        esqPdf = esquinasDe(alta);
      } finally { alta.remove(); cont.remove(); }

      const ctxPdf: Contexto = { ...ctx, esquinas: esqPdf };
      const pdf = new jsPDF({
        orientation: horizontal ? 'landscape' : 'portrait',
        unit: 'mm',
        // Medidas explícitas: cubre los formatos que jsPDF no conoce por nombre.
        format: [dim.ancho, dim.alto],
      });

      const conFuente = (el: Elemento) => pdf.setFont('helvetica', el.negrita ? 'bold' : 'normal');
      const conColor = (el: Elemento) => { const [r, g, b] = hexARgb(el.color ?? '#111111'); pdf.setTextColor(r, g, b); };

      /** Placa blanca bajo el norte y la escala, para que se lean sobre el mapa. */
      const placa = (x: number, y: number, ancho: number, alto: number) => {
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(150, 150, 150);
        pdf.setLineWidth(0.15);
        pdf.rect(x - 1.2, y - 1.2, ancho + 2.4, alto + 2.4, 'FD');
      };

      for (const el of elementos) {
        if (!el.visible) continue;
        const col = el.color ?? '#111111';

        switch (el.tipo) {
          case 'mapa': {
            pdf.addImage(imagen, 'PNG', el.x, el.y, el.ancho, el.alto);
            if (grilla) {
              pdf.setDrawColor(90, 90, 90); pdf.setLineWidth(0.15);
              pdf.setFontSize(grillaTam); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30, 30, 30);
              const altoTxt = grillaTam * PT;

              /** Rotula una coordenada sobre un recorte de papel, para que se
               *  lea completa aunque caiga sobre el mapa o sobre el rótulo.
               *  Girada, jsPDF aplica el alineado en el eje horizontal sin
               *  rotarlo, así que el centrado se calcula aquí: con angle 90 el
               *  texto crece hacia arriba desde el punto y las letras quedan a
               *  su izquierda. */
              const rotular = (
                txt: string, borde: number, centro: number,
                lado: 'arriba' | 'abajo' | 'izq' | 'der'
              ) => {
                const w = pdf.getTextWidth(txt);
                pdf.setFillColor(255, 255, 255);
                pdf.setTextColor(30, 30, 30);

                if (lado === 'arriba' || lado === 'abajo') {
                  const y = lado === 'arriba' ? borde - 1.2 : borde + 1.2 + altoTxt;
                  pdf.rect(centro - w / 2 - 0.4, y - altoTxt, w + 0.8, altoTxt + 0.5, 'F');
                  pdf.text(txt, centro, y, { align: 'center' });
                  return;
                }

                // Ambos costados se leen de abajo hacia arriba, como en la
                // cartografía oficial. El punto de inserción va a la derecha
                // de las letras y por encima del tick.
                const x = lado === 'izq' ? borde - 1.2 : borde + 1.2 + altoTxt;
                pdf.rect(x - altoTxt, centro - w / 2 - 0.4, altoTxt + 0.5, w + 0.8, 'F');
                pdf.text(txt, x, centro + w / 2, { align: 'left', angle: 90 });
              };

              // Este: arriba y abajo del marco, en horizontal.
              for (const t of ticksPdf.vert) {
                const x = el.x + t.frac * el.ancho;
                pdf.line(x, el.y, x, el.y + el.alto);
                rotular(fmt(t.valor), el.y, x, 'arriba');
                rotular(fmt(t.valor), el.y + el.alto, x, 'abajo');
              }
              // Norte: a los dos costados, girado para ocupar el mínimo margen.
              for (const t of ticksPdf.horiz) {
                const y = el.y + t.frac * el.alto;
                pdf.line(el.x, y, el.x + el.ancho, y);
                rotular(fmt(t.valor), el.x, y, 'izq');
                rotular(fmt(t.valor), el.x + el.ancho, y, 'der');
              }
            }
            pdf.setDrawColor(20, 20, 20); pdf.setLineWidth(0.5);
            pdf.rect(el.x, el.y, el.ancho, el.alto);
            break;
          }
          case 'rotulo':
            pdf.setDrawColor(20, 20, 20); pdf.setLineWidth(0.5);
            pdf.rect(el.x, el.y, el.ancho, el.alto);
            break;

          case 'titulo': {
            conColor(el);
            let y = el.y;
            const tEnt = Math.max(5, (el.tamano ?? 11) * 0.68);
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(tEnt);
            for (const l of pdf.splitTextToSize(entidad, el.ancho) as string[]) { pdf.text(l, el.x, y); y += tEnt * PT * 1.35; }
            y += 2;
            conFuente(el); pdf.setFontSize(el.tamano ?? 11);
            for (const l of pdf.splitTextToSize(resolverTexto(el.texto ?? '', ctxPdf), el.ancho) as string[]) {
              pdf.text(l, el.x, y); y += (el.tamano ?? 11) * PT * 1.3;
            }
            break;
          }
          case 'texto': {
            conColor(el); conFuente(el); pdf.setFontSize(el.tamano ?? 10);
            let y = el.y;
            for (const l of pdf.splitTextToSize(resolverTexto(el.texto ?? '', ctxPdf), el.ancho) as string[]) {
              pdf.text(l, el.x, y); y += (el.tamano ?? 10) * PT * 1.3;
            }
            break;
          }
          case 'convenciones': {
            const cols = el.columnas ?? 1, esp = el.espaciado ?? 4;
            const anchoCol = el.ancho / cols;
            const filas = Math.ceil(Math.max(convenciones.length, 1) / cols);
            conColor(el); pdf.setFont('helvetica', 'bold'); pdf.setFontSize((el.tamano ?? 6.5) + 1);
            pdf.text('Convenciones', el.x, el.y);
            pdf.setFontSize(el.tamano ?? 6.5);
            convenciones.forEach((conv, i) => {
              const c = Math.floor(i / filas), fila = i % filas;
              const cx = el.x + c * anchoCol, cy = el.y + 4.5 + fila * esp;
              pdf.setDrawColor(60, 60, 60); pdf.setLineWidth(0.2);

              if (conv.encabezado) {
                // Solo el nombre, en negrita y sin sangrar; las clases van
                // debajo con su cuadro de color.
                pdf.setFont('helvetica', 'bold');
                const enc = pdf.splitTextToSize(conv.texto, anchoCol) as string[];
                pdf.text(enc[0], cx, cy);
                conFuente(el);
                return;
              }

              if (conv.forma === 'rampa') {
                // jsPDF no dibuja degradados: la rampa va como una tira de
                // rectángulos contiguos, que además es más honesta cuando los
                // colores son clases y no un continuo.
                const n = conv.colores.length;
                const paso = 4.5 / n;
                conv.colores.forEach((hex, k) => {
                  const [r, g, b] = hexARgb(hex);
                  pdf.setFillColor(r, g, b);
                  pdf.rect(cx + k * paso, cy - 2.2, paso + 0.02, 2.8, 'F');
                });
                pdf.rect(cx, cy - 2.2, 4.5, 2.8, 'D');
              } else {
                const [r, g, b] = hexARgb(conv.colores[0]);
                pdf.setFillColor(r, g, b);
                if (conv.forma === 'area') pdf.rect(cx, cy - 2.2, 4.5, 2.8, 'FD');
                else if (conv.forma === 'linea') {
                  pdf.setDrawColor(r, g, b); pdf.setLineWidth(0.7);
                  pdf.line(cx, cy - 1, cx + 4.5, cy - 1);
                } else pdf.circle(cx + 2.2, cy - 1, 1.1, 'FD');
              }

              conColor(el); conFuente(el);
              const txt = pdf.splitTextToSize(conv.texto, anchoCol - 6.5) as string[];
              pdf.text(txt[0], cx + 6, cy);
            });
            break;
          }
          case 'norte':
            placa(el.x, el.y, el.alto * 0.6, el.alto * 1.15);
            for (const p of figuraNorte(el.estilo ?? 0, el.alto)) primAPdf(pdf, p, el.x, el.y, col);
            break;

          case 'escala': {
            const metros = metrosBarra(escala, el.largo);
            const largo = (metros * 1000) / escala;
            placa(el.x, el.y, largo + 8, 9);
            for (const p of figuraEscala(el.estilo ?? 0, largo, metros, el.tamano ?? 6, fmt)) {
              primAPdf(pdf, p, el.x, el.y, col);
            }
            break;
          }
          case 'datos': {
            const esp = el.espaciado ?? 4, t = el.tamano ?? 6.5;
            conColor(el);
            let y = el.y;
            for (const [k, v] of datosTecnicos()) {
              pdf.setFont('helvetica', 'bold'); pdf.setFontSize(Math.max(4, t - 0.5));
              pdf.text(k, el.x, y);
              conFuente(el); pdf.setFontSize(t);
              // Los saltos de línea se respetan antes de partir por ancho: así
              // cada integrante de «Elaboró» conserva su propio renglón.
              for (const parrafo of v.split('\n')) {
                for (const l of pdf.splitTextToSize(parrafo, el.ancho) as string[]) {
                  y += t * PT * 1.35;
                  pdf.text(l, el.x, y);
                }
              }
              y += esp;
            }
            break;
          }
          case 'referencia': {
            const esp = el.espaciado ?? 2.3, t = el.tamano ?? 5;
            conColor(el);
            let y = el.y;
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(t + 0.8);
            pdf.text('REFERENCIA ESPACIAL', el.x, y);
            y += esp + 1.4;
            for (const [k, v] of REFERENCIA_ESPACIAL) {
              pdf.setFont('helvetica', 'bold'); pdf.setFontSize(t);
              const clave = `${k}: `;
              pdf.text(clave, el.x, y);
              const sangria = pdf.getTextWidth(clave);
              conFuente(el); pdf.setFontSize(t);
              const lineas = pdf.splitTextToSize(v, el.ancho - sangria) as string[];
              pdf.text(lineas[0] ?? '', el.x + sangria, y);
              // Un valor que no cabe sigue debajo, alineado con el margen.
              for (const l of lineas.slice(1)) { y += esp; pdf.text(l, el.x, y); }
              y += esp;
            }
            break;
          }
          case 'imagen':
            if (el.dataUrl) pdf.addImage(el.dataUrl, el.x, el.y, el.ancho, el.alto);
            break;

          default:
            for (const p of figuraGrafico(el.tipo as 'linea' | 'flecha' | 'rect' | 'elipse',
              el.ancho, el.alto, el.grosor ?? 0.4, el.rellenar ?? false)) {
              primAPdf(pdf, p, el.x, el.y, col);
            }
        }
      }

      if (marco) {
        pdf.setDrawColor(20, 20, 20); pdf.setLineWidth(0.6);
        pdf.rect(6, 6, hojaAncho - 12, hojaAlto - 12);
      }

      const tEl = elementos.find((e) => e.tipo === 'titulo');
      const nombre = resolverTexto(tEl?.texto ?? 'plano', ctxPdf).trim()
        .replace(/[^\w\sáéíóúñÁÉÍÓÚÑ-]/g, '').replace(/\s+/g, '_');
      pdf.save(`${nombre || 'plano'}_1-${escala}.pdf`);
      addNotification({ type: 'success', message: 'Plano generado.' });
    } catch (e) {
      addNotification({ type: 'error', message: e instanceof Error ? e.message : 'No se pudo generar el plano.' });
    } finally {
      setGenerando(false);
    }
  };

  /* --------------------------------------------------------- interfaz */

  if (!abierto) {
    return (
      <>
        <EstilosPlano />
        <button type="button" onClick={() => setAbierto(true)} className="pl-lanzador">
          <Icono nombre="hoja" tam={15} />
          Diseño de página
        </button>
      </>
    );
  }

  const sel = elementos.find((e) => e.id === selId) ?? null;
  const esGrafico = !!sel && ['linea', 'flecha', 'rect', 'elipse'].includes(sel.tipo);
  const conTexto = !!sel && ['titulo', 'texto', 'datos', 'referencia', 'convenciones', 'escala'].includes(sel.tipo);
  const fijo = (t: TipoElemento) =>
    ['mapa', 'rotulo', 'titulo', 'convenciones', 'norte', 'escala', 'datos', 'referencia'].includes(t);
  const cerrarMenus = () => setMenu(null);
  const tituloDoc = elementos.find((e) => e.tipo === 'titulo')?.texto ?? 'Plano sin título';

  return (
    <div className="pl-raiz" onClick={cerrarMenus}>
      <EstilosPlano />

      {/* ─────────────────────────── encabezado ─────────────────────────── */}
      <header className="pl-encabezado">
        <button type="button" className="pl-volver" onClick={() => setAbierto(false)}>
          <Icono nombre="flechaAtras" tam={15} />
          Mapa
        </button>

        <div className="pl-doc">
          <span className="pl-doc-nombre">{resolverTexto(tituloDoc, ctx)}</span>
          <span className="pl-doc-meta">
            {papel} · {horizontal ? 'horizontal' : 'vertical'} · 1:{escala.toLocaleString('es-CO')}
          </span>
        </div>

        <button type="button" className="pl-exportar" disabled={generando} onClick={exportar}>
          {generando ? <span className="pl-girando"><Icono nombre="progreso" tam={15} /></span>
                     : <Icono nombre="descargar" tam={15} />}
          {generando ? 'Componiendo…' : 'Exportar PDF'}
        </button>
      </header>

      {/* ───────────────────────────── cinta ───────────────────────────── */}
      <div className="pl-cinta">
        <Grupo titulo="Página">
          <Selector valor={papel} onChange={(v) => setPapel(v as Papel)} ancho={92}
            grupos={['ISO', 'Comercial', 'Grandes']}
            opciones={(Object.keys(PAPELES) as Papel[]).map((p) => ({
              v: p, g: PAPELES[p].grupo,
              t: p === 'Personalizado' ? 'A medida…' : `${p} · ${PAPELES[p].ancho}×${PAPELES[p].alto}`,
            }))} />
          {papel === 'Personalizado' && (
            <span className="pl-medida">
              <input type="number" min={50} max={2000} value={propio.ancho}
                onChange={(e) => setPropio((v) => ({ ...v, ancho: Number(e.target.value) || 50 }))} />
              <i>×</i>
              <input type="number" min={50} max={2000} value={propio.alto}
                onChange={(e) => setPropio((v) => ({ ...v, alto: Number(e.target.value) || 50 }))} />
              <em>mm</em>
            </span>
          )}
          <Segmentado
            valor={horizontal ? 'h' : 'v'}
            onChange={(v) => setHorizontal(v === 'h')}
            opciones={[
              { v: 'h', icono: 'horizontal', titulo: 'Horizontal' },
              { v: 'v', icono: 'vertical', titulo: 'Vertical' },
            ]} />
          <BotonCinta icono="marco" texto="Marco" activo={marco} onClick={() => setMarco(!marco)} />
        </Grupo>

        <Grupo titulo="Mapa">
          <Selector valor={String(escala)} onChange={(v) => setEscala(Number(v))} ancho={92}
            opciones={ESCALAS.map((e) => ({ v: String(e), t: `1:${e.toLocaleString('es-CO')}` }))} />
          <BotonCinta icono="grilla" texto="Grilla" activo={grilla} onClick={() => setGrilla(!grilla)} />
          <MenuCinta icono="opciones" texto="Ajustes" abierto={menu === 'grilla'}
            onAbrir={() => setMenu(menu === 'grilla' ? null : 'grilla')}>
            <div className="pl-menu-cuerpo" style={{ width: 236 }}>
              <Propiedad etiqueta="Espaciado de la grilla">
                <Selector ancho="100%" valor={String(espaciado)}
                  onChange={(v) => setEspaciado(v === 'auto' ? 'auto' : Number(v))}
                  opciones={[
                    { v: 'auto', t: `Automático · ${fmt(espaciadoAuto(escala))} m` },
                    ...[25, 50, 100, 250, 500, 1000, 2000, 5000, 10000].map((m) => ({ v: String(m), t: `Cada ${fmt(m)} m` })),
                  ]} />
              </Propiedad>
              <Deslizador etiqueta="Texto de coordenadas" valor={grillaTam} unidad="pt"
                min={4} max={10} paso={0.5} onChange={setGrillaTam} />
            </div>
          </MenuCinta>
        </Grupo>

        <Grupo titulo="Insertar">
          <MenuCinta icono="norte" texto="Norte" alto abierto={menu === 'norte'}
            onAbrir={() => setMenu(menu === 'norte' ? null : 'norte')}>
            <Galeria titulo="Flechas de norte" columnas={3} ancho={288}>
              {ESTILOS_NORTE.map((n, i) => (
                <Muestra key={n} nombre={n} activa={(elNorte?.estilo ?? 0) === i} alto={52}
                  onClick={() => {
                    if (elNorte) { actualizar(elNorte.id, { estilo: i, visible: true }); setSelId(elNorte.id); }
                    cerrarMenus();
                  }}>
                  <svg width="100%" height={40} viewBox="-15 -2 30 34">
                    {figuraNorte(i, 24).map((p, j) => primASvg(p, j, 1, 'currentColor'))}
                  </svg>
                </Muestra>
              ))}
            </Galeria>
          </MenuCinta>

          <MenuCinta icono="escala" texto="Escala" alto abierto={menu === 'escala'}
            onAbrir={() => setMenu(menu === 'escala' ? null : 'escala')}>
            <Galeria titulo="Barras de escala" columnas={1} ancho={228}>
              {ESTILOS_ESCALA.map((n, i) => (
                <Muestra key={n} nombre={n} activa={(elEscala?.estilo ?? 0) === i} alto={28} fila
                  onClick={() => {
                    if (elEscala) { actualizar(elEscala.id, { estilo: i, visible: true }); setSelId(elEscala.id); }
                    cerrarMenus();
                  }}>
                  <svg width="100%" height={24} viewBox="-2 -1 50 11">
                    {figuraEscala(i, 42, 500, 5, fmt).map((p, j) => primASvg(p, j, 1, 'currentColor'))}
                  </svg>
                </Muestra>
              ))}
            </Galeria>
          </MenuCinta>

          <MenuCinta icono="texto" texto="Texto" alto abierto={menu === 'texto'}
            onAbrir={() => setMenu(menu === 'texto' ? null : 'texto')}>
            <div style={{ width: 268 }}>
              <button type="button" className="pl-item" onClick={() => { agregarTexto(); cerrarMenus(); }}>
                <Icono nombre="texto" tam={15} />
                <span>Cuadro de texto</span>
              </button>
              <div className="pl-menu-titulo">
                Campos dinámicos
                <span>se actualizan solos</span>
              </div>
              <div className="pl-menu-lista">
                {CAMPOS_DINAMICOS.map((c) => (
                  <button key={c.token} type="button" className="pl-item"
                    onClick={() => {
                      if (sel && (sel.tipo === 'texto' || sel.tipo === 'titulo')) insertarCampo(c.token);
                      else agregarTexto(c.token);
                      cerrarMenus();
                    }}>
                    <Icono nombre="variable" tam={15} />
                    <span>{c.nombre}</span>
                    <code>{c.token}</code>
                  </button>
                ))}
              </div>
            </div>
          </MenuCinta>

          <MenuCinta icono="formas" texto="Gráficos" alto abierto={menu === 'grafico'}
            onAbrir={() => setMenu(menu === 'grafico' ? null : 'grafico')}>
            <Galeria titulo="Formas" columnas={4} ancho={302}>
              {([['linea', 'Línea'], ['flecha', 'Flecha'], ['rect', 'Rectángulo'], ['elipse', 'Elipse']] as const)
                .map(([t, n]) => (
                  <Muestra key={t} nombre={n} activa={false} alto={38}
                    onClick={() => { agregarGrafico(t); cerrarMenus(); }}>
                    <svg width="100%" height={30} viewBox="-2 -2 28 24">
                      {figuraGrafico(t, 24, 20, 0.9, false).map((p, j) => primASvg(p, j, 1, 'currentColor'))}
                    </svg>
                  </Muestra>
                ))}
            </Galeria>
          </MenuCinta>

          <BotonCinta icono="imagen" texto="Imagen" alto onClick={() => archivoRef.current?.click()} />
          <input ref={archivoRef} type="file" accept="image/png,image/jpeg"
            onChange={cargarImagen} style={{ display: 'none' }} />
        </Grupo>

        <Grupo titulo="Organizar" ultimo>
          <BotonCinta icono="acomodar" texto="Acomodar" alto onClick={acomodar} />
        </Grupo>
      </div>

      {/* ─────────────────────────── área central ────────────────────────── */}
      <div className="pl-centro">

        {/* contenido */}
        <aside className="pl-panel pl-panel-izq">
          <div className="pl-panel-cabeza">
            Contenido
            <span className="pl-conteo">{elementos.filter((e) => e.visible).length}/{elementos.length}</span>
          </div>
          <div className="pl-panel-scroll">
            {elementos.map((el) => (
              <div key={el.id}
                className={`pl-fila${selId === el.id ? ' es-sel' : ''}${el.visible ? '' : ' es-oculto'}`}
                onClick={(e) => { e.stopPropagation(); setSelId(el.id); }}>
                <button type="button" className="pl-ojo"
                  title={el.visible ? 'Ocultar' : 'Mostrar'}
                  onClick={(e) => { e.stopPropagation(); actualizar(el.id, { visible: !el.visible }); }}>
                  <Icono nombre={el.visible ? 'ojo' : 'ojoCerrado'} tam={14} />
                </button>
                <Icono nombre={iconoDe(el.tipo)} tam={14} />
                <span className="pl-fila-nombre">{nombreEl(el)}</span>
                {!fijo(el.tipo) && (
                  <button type="button" className="pl-borrar" title="Eliminar"
                    onClick={(e) => {
                      e.stopPropagation();
                      setElementos((els) => els.filter((x) => x.id !== el.id));
                      setSelId(null);
                    }}>
                    <Icono nombre="equis" tam={12} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="pl-panel-cabeza pl-cabeza-2">
            Capas del mapa
            <span className="pl-conteo">{convenciones.length}/{layers.length + rasterLayers.length}</span>
          </div>
          <div className="pl-panel-scroll pl-capas">
            {layers.length === 0 && (
              <p className="pl-sin-capas">No hay capas cargadas en el geovisor.</p>
            )}
            {layers.map((c) => (
              <div key={c.id} className={`pl-fila${c.visible ? '' : ' es-oculto'}`}>
                <button type="button" className="pl-ojo"
                  title={c.visible ? 'Quitar del plano' : 'Poner en el plano'}
                  onClick={(e) => { e.stopPropagation(); toggleLayerVisibility(c.id); }}>
                  <Icono nombre={c.visible ? 'ojo' : 'ojoCerrado'} tam={14} />
                </button>
                <span className="pl-punto" style={{
                  background: colorCapa(c),
                  borderRadius: tipoGeom(c) === 'point' ? '50%' : 2,
                  height: tipoGeom(c) === 'line' ? 2 : 8,
                }} />
                <span className="pl-fila-nombre">{c.name.replace(/_/g, ' ')}</span>
                <button type="button" className="pl-zoom" title="Encuadrar esta capa"
                  onClick={(e) => { e.stopPropagation(); irACapa(c); }}>
                  <Icono nombre="encuadrar" tam={13} />
                </button>
              </div>
            ))}

            <div className="pl-subcabeza">Ráster del estudio</div>
            {rasterLayers.map((r) => (
              <div key={r.id} className={`pl-fila${r.visible ? '' : ' es-oculto'}`}>
                <button type="button" className="pl-ojo"
                  title={r.visible ? 'Quitar del plano' : 'Poner en el plano'}
                  onClick={(e) => { e.stopPropagation(); toggleRasterVisibility(r.id); }}>
                  <Icono nombre={r.visible ? 'ojo' : 'ojoCerrado'} tam={14} />
                </button>
                <span className="pl-punto" style={{
                  borderRadius: 2, height: 8,
                  background: `linear-gradient(135deg, ${coloresDe(r).join(', ')})`,
                }} />
                <span className="pl-fila-nombre">{r.nombre}</span>
                <button type="button" className="pl-zoom" title="Encuadrar este ráster"
                  onClick={(e) => { e.stopPropagation(); irARaster(r); }}>
                  <Icono nombre="encuadrar" tam={13} />
                </button>
              </div>
            ))}
          </div>
        </aside>

        {/* hoja */}
        <div className="pl-lienzo">
          <div ref={hojaRef} className="pl-hoja" onMouseDown={() => setSelId(null)}
            style={{ width: hojaAncho * vista, height: hojaAlto * vista }}>

            {marco && (
              <div className="pl-marco-hoja" style={{
                left: 6 * vista, top: 6 * vista,
                width: (hojaAncho - 12) * vista, height: (hojaAlto - 12) * vista,
              }} />
            )}

            {/* El marco del mapa va fuera de la lista: así React nunca recrea
                el nodo que contiene el canvas de MapLibre, que es lo que dejaba
                el mapa en negro al arrastrar cualquier otro elemento. */}
            {elMapa.visible && (
              <div
                className={`pl-el es-mapa${selId === elMapa.id ? ' es-sel' : ''}`}
                style={{
                  left: elMapa.x * vista, top: elMapa.y * vista,
                  width: elMapa.ancho * vista, height: elMapa.alto * vista,
                }}
                onMouseDown={(e) => { e.stopPropagation(); setSelId(elMapa.id); }}>
                <div ref={marcoRef} className="pl-mapa-lienzo" />
                {grilla && (
                  <svg className="pl-grilla">
                    {(() => {
                      const W = elMapa.ancho * vista, H = elMapa.alto * vista;
                      const tam = Math.max(5.5, grillaTam * PT * vista);
                      return (
                        <>
                          {/* Este: arriba y abajo, en horizontal */}
                          {ticks.vert.map((t) => {
                            const x = t.frac * W;
                            return (
                              <g key={`v${t.valor}`}>
                                <line x1={x} y1={0} x2={x} y2={H} />
                                <text x={x} y={-3} fontSize={tam} textAnchor="middle">{fmt(t.valor)}</text>
                                <text x={x} y={H + tam + 1} fontSize={tam} textAnchor="middle">{fmt(t.valor)}</text>
                              </g>
                            );
                          })}
                          {/* Norte: a los costados, girado para no invadir el rótulo */}
                          {ticks.horiz.map((t) => {
                            const y = t.frac * H;
                            return (
                              <g key={`h${t.valor}`}>
                                <line x1={0} y1={y} x2={W} y2={y} />
                                <text fontSize={tam} textAnchor="middle"
                                  transform={`translate(-2.5,${y}) rotate(-90)`}>{fmt(t.valor)}</text>
                                <text fontSize={tam} textAnchor="middle"
                                  transform={`translate(${W + 2.5 + tam},${y}) rotate(-90)`}>{fmt(t.valor)}</text>
                              </g>
                            );
                          })}
                        </>
                      );
                    })()}
                  </svg>
                )}
                <span className="pl-etiqueta-marco">Arrastra para encuadrar</span>
              </div>
            )}

            {elementos.filter((e) => e.visible && e.tipo !== 'mapa').map((el) => {
              const col = el.color ?? '#111111';
              const base: React.CSSProperties = {
                left: el.x * vista, top: el.y * vista, width: el.ancho * vista,
                color: col, fontWeight: el.negrita ? 700 : 400,
              };
              const clase = `pl-el${selId === el.id ? ' es-sel' : ''}`;
              const comun = {
                key: el.id, className: clase, style: base,
                onMouseDown: (e: React.MouseEvent) => alBajar(e, el),
              };

              if (el.tipo === 'rotulo') {
                return (
                  <div key={el.id} className={`pl-rotulo${selId === el.id ? ' es-sel' : ''}`}
                    style={{ left: el.x * vista, top: el.y * vista, width: el.ancho * vista, height: el.alto * vista }}
                    onMouseDown={(e) => { e.stopPropagation(); setSelId(el.id); }} />
                );
              }

              if (el.tipo === 'titulo') {
                return (
                  <div {...comun}>
                    <div style={{ fontSize: (el.tamano ?? 11) * 0.68 * PT * vista, fontWeight: 700, lineHeight: 1.35 }}>
                      {entidad}
                    </div>
                    <div style={{ fontSize: (el.tamano ?? 11) * PT * vista, marginTop: 2 * vista, lineHeight: 1.28 }}>
                      {resolverTexto(el.texto ?? '', ctx)}
                    </div>
                  </div>
                );
              }

              if (el.tipo === 'texto') {
                return (
                  <div {...comun} style={{ ...base, fontSize: (el.tamano ?? 10) * PT * vista, lineHeight: 1.3, whiteSpace: 'pre-wrap' }}>
                    {resolverTexto(el.texto ?? '', ctx)}
                  </div>
                );
              }

              if (el.tipo === 'imagen') {
                return (
                  <img {...comun} src={el.dataUrl} alt=""
                    style={{ ...base, height: el.alto * vista, objectFit: 'contain' }} draggable={false} />
                );
              }

              if (el.tipo === 'convenciones') {
                const cols = el.columnas ?? 1, esp = el.espaciado ?? 4;
                const filas = Math.ceil(Math.max(convenciones.length, 1) / cols);
                const anchoCol = (el.ancho / cols) * vista;
                return (
                  <div {...comun}>
                    <div style={{ fontSize: ((el.tamano ?? 6.5) + 1) * PT * vista, fontWeight: 700 }}>Convenciones</div>
                    <div style={{ position: 'relative', height: (4.5 + filas * esp) * vista }}>
                      {convenciones.map((c, i) => {
                        const cc = Math.floor(i / filas), fila = i % filas;
                        const relleno = c.forma === 'rampa'
                          ? `linear-gradient(to right, ${c.colores.join(', ')})`
                          : c.colores[0];
                        return (
                          <div key={c.clave} style={{
                            position: 'absolute', left: cc * anchoCol, top: (1 + fila * esp) * vista,
                            width: anchoCol, display: 'flex', alignItems: 'center', gap: 1.6 * vista,
                          }}>
                            {/* El encabezado de un ráster de clases no lleva símbolo:
                                el símbolo lo llevan sus clases, sangradas debajo. */}
                            {!c.encabezado && (
                              <span style={{
                                flexShrink: 0, width: 4.5 * vista,
                                height: c.forma === 'linea' ? 0.8 * vista : 2.8 * vista,
                                background: relleno,
                                borderRadius: c.forma === 'punto' ? '50%' : 0,
                                border: c.forma === 'linea' ? 'none' : '0.5px solid rgba(0,0,0,.45)',
                              }} />
                            )}
                            <span style={{
                              fontSize: (el.tamano ?? 6.5) * PT * vista, whiteSpace: 'nowrap',
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              fontWeight: c.encabezado ? 700 : undefined,
                            }}>{c.texto}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              }

              if (el.tipo === 'datos') {
                const t = el.tamano ?? 6.5;
                return (
                  <div {...comun}>
                    {datosTecnicos().map(([k, v]) => (
                      <div key={k} style={{ marginBottom: (el.espaciado ?? 4) * vista * 0.35 }}>
                        <div style={{ fontSize: Math.max(5, (t - 0.5) * PT * vista), fontWeight: 700 }}>{k}</div>
                        {/* «Elaboró» puede traer varios nombres, uno por línea */}
                        {v.split('\n').map((linea, i) => (
                          <div key={i} style={{ fontSize: Math.max(5, t * PT * vista), lineHeight: 1.32 }}>
                            {linea}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              }

              if (el.tipo === 'referencia') {
                const t = el.tamano ?? 5;
                return (
                  <div {...comun}>
                    <div style={{
                      fontSize: Math.max(5, (t + 0.8) * PT * vista), fontWeight: 700,
                      letterSpacing: '0.04em', marginBottom: 1.6 * vista,
                    }}>
                      REFERENCIA ESPACIAL
                    </div>
                    {REFERENCIA_ESPACIAL.map(([k, v]) => (
                      <div key={k} style={{
                        display: 'flex', gap: 1.2 * vista,
                        fontSize: Math.max(4.5, t * PT * vista),
                        lineHeight: (el.espaciado ?? 2.3) * vista / Math.max(4.5, t * PT * vista),
                      }}>
                        <span style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{k}:</span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</span>
                      </div>
                    ))}
                  </div>
                );
              }

              const prims: Prim[] =
                el.tipo === 'norte' ? figuraNorte(el.estilo ?? 0, el.alto)
                  : el.tipo === 'escala'
                    ? figuraEscala(el.estilo ?? 0, (metrosBarra(escala, el.largo) * 1000) / escala,
                        metrosBarra(escala, el.largo), el.tamano ?? 6, fmt)
                    : figuraGrafico(el.tipo as 'linea' | 'flecha' | 'rect' | 'elipse',
                        el.ancho, el.alto, el.grosor ?? 0.4, el.rellenar ?? false);

              const anchoSvg = el.tipo === 'norte' ? el.alto * 0.6
                : el.tipo === 'escala' ? (metrosBarra(escala, el.largo) * 1000) / escala + 8
                : el.ancho + 2;
              const altoSvg = el.tipo === 'norte' ? el.alto * 1.15
                : el.tipo === 'escala' ? 9 : el.alto + 2;

              // El norte y la escala ahora viven sobre el mapa, y ahí un trazo
              // negro sobre una capa oscura no se lee. Una placa blanca los
              // despega del fondo; sobre el rótulo, que ya es blanco, no se nota.
              const conPlaca = el.tipo === 'norte' || el.tipo === 'escala';

              return (
                <div {...comun} style={{
                  ...base, width: anchoSvg * vista, height: altoSvg * vista,
                  ...(conPlaca ? {
                    background: '#ffffff',
                    border: '0.5px solid rgba(0,0,0,0.25)',
                    padding: 1 * vista,
                    boxSizing: 'content-box' as const,
                  } : {}),
                }}>
                  <svg width={anchoSvg * vista} height={altoSvg * vista} style={{ overflow: 'visible' }}>
                    <g transform={el.tipo === 'norte' ? `translate(${(anchoSvg / 2) * vista},0)` : undefined}>
                      {prims.map((p, j) => primASvg(p, j, vista, col))}
                    </g>
                  </svg>
                </div>
              );
            })}
          </div>
        </div>

        {/* propiedades */}
        <aside className="pl-panel pl-panel-der">
          <div className="pl-panel-cabeza">
            {sel ? nombreEl(sel) : 'Propiedades'}
            {sel && <span className="pl-conteo pl-mono">{sel.x.toFixed(0)} · {sel.y.toFixed(0)} mm</span>}
          </div>

          <div className="pl-panel-scroll pl-panel-pad">
            {!sel && (
              <div className="pl-vacio">
                <Icono nombre="cursor" tam={22} />
                <p>Selecciona un elemento de la hoja para ajustarlo.</p>
                <p className="pl-vacio-sec">Arrastra dentro del marco para encuadrar el mapa.</p>
              </div>
            )}

            {sel && (
              <>
                {(sel.tipo === 'titulo' || sel.tipo === 'texto') && (
                  <Propiedad etiqueta="Texto">
                    <textarea className="pl-campo pl-area" rows={3} value={sel.texto ?? ''}
                      onChange={(e) => actualizar(sel.id, { texto: e.target.value })} />
                  </Propiedad>
                )}

                {sel.tipo === 'norte' && (
                  <Deslizador etiqueta="Tamaño" valor={sel.alto} unidad="mm" min={8} max={45} paso={1}
                    onChange={(v) => actualizar(sel.id, { alto: v })} />
                )}

                {sel.tipo === 'escala' && (
                  <Deslizador etiqueta="Largo de la barra" valor={sel.largo ?? 45} unidad="mm"
                    min={15} max={60} paso={1} nota={`representa ${fmt(metrosBarra(escala, sel.largo))} m`}
                    onChange={(v) => actualizar(sel.id, { largo: v })} />
                )}

                {conTexto && (
                  <>
                    <Deslizador etiqueta="Tamaño de letra" valor={sel.tamano ?? 10} unidad="pt"
                      min={4} max={28} paso={0.5} onChange={(v) => actualizar(sel.id, { tamano: v })} />
                    <Interruptor etiqueta="Negrilla" valor={sel.negrita ?? false}
                      onChange={(v) => actualizar(sel.id, { negrita: v })} />
                  </>
                )}

                {(sel.tipo === 'convenciones' || sel.tipo === 'datos' || sel.tipo === 'referencia') && (
                  <Deslizador etiqueta="Separación de renglones" valor={sel.espaciado ?? 4} unidad="mm"
                    min={2.5} max={8} paso={0.1} onChange={(v) => actualizar(sel.id, { espaciado: v })} />
                )}

                {sel.tipo === 'convenciones' && (
                  <Propiedad etiqueta="Distribución">
                    <Segmentado ancho valor={String(sel.columnas ?? 1)}
                      onChange={(v) => actualizar(sel.id, { columnas: Number(v) })}
                      opciones={[
                        { v: '1', texto: 'Una columna' },
                        { v: '2', texto: 'Dos columnas' },
                      ]} />
                  </Propiedad>
                )}

                {esGrafico && (
                  <>
                    <Deslizador etiqueta="Grosor" valor={sel.grosor ?? 0.4} unidad="mm"
                      min={0.1} max={3} paso={0.1} onChange={(v) => actualizar(sel.id, { grosor: v })} />
                    {(sel.tipo === 'rect' || sel.tipo === 'elipse') && (
                      <Interruptor etiqueta="Relleno sólido" valor={sel.rellenar ?? false}
                        onChange={(v) => actualizar(sel.id, { rellenar: v })} />
                    )}
                  </>
                )}

                {(esGrafico || sel.tipo === 'imagen' || sel.tipo === 'mapa' || sel.tipo === 'rotulo') && (
                  <>
                    <Deslizador etiqueta="Ancho" valor={sel.ancho} unidad="mm"
                      min={5} max={hojaAncho - 10} paso={1} onChange={(v) => actualizar(sel.id, { ancho: v })} />
                    <Deslizador etiqueta="Alto" valor={sel.alto} unidad="mm"
                      min={5} max={hojaAlto - 10} paso={1} onChange={(v) => actualizar(sel.id, { alto: v })} />
                  </>
                )}

                {['titulo', 'texto', 'convenciones', 'datos'].includes(sel.tipo) && (
                  <Deslizador etiqueta="Ancho del bloque" valor={sel.ancho} unidad="mm"
                    min={20} max={hojaAncho - 20} paso={1} onChange={(v) => actualizar(sel.id, { ancho: v })} />
                )}

                {sel.tipo !== 'mapa' && sel.tipo !== 'rotulo' && sel.tipo !== 'imagen' && (
                  <Propiedad etiqueta="Color de impresión">
                    <div className="pl-color">
                      <input type="color" value={sel.color ?? '#111111'}
                        onChange={(e) => actualizar(sel.id, { color: e.target.value })} />
                      <span className="pl-mono">{(sel.color ?? '#111111').toUpperCase()}</span>
                    </div>
                  </Propiedad>
                )}
              </>
            )}

            <div className="pl-seccion">
              <div className="pl-seccion-titulo">Datos del rótulo</div>
              <Propiedad etiqueta="Entidad">
                <input className="pl-campo" value={entidad} onChange={(e) => setEntidad(e.target.value)} />
              </Propiedad>
              <Propiedad etiqueta="Elaboró">
                {/* Varias líneas: los trabajos suelen ser de un grupo, y cada
                    integrante debe quedar en su propio renglón del rótulo. */}
                <textarea className="pl-campo" value={elaboro} rows={3}
                  placeholder={'Un nombre por línea\n1. Juan Diego\n2. Mateo'}
                  style={{ resize: 'vertical', minHeight: 54, lineHeight: 1.5 }}
                  onChange={(e) => setElaboro(e.target.value)} />
              </Propiedad>
              <Propiedad etiqueta="Fuente de los datos">
                <input className="pl-campo" value={fuente} onChange={(e) => setFuente(e.target.value)} />
              </Propiedad>
            </div>
          </div>
        </aside>
      </div>

      {/* ───────────────────────── barra de estado ───────────────────────── */}
      <footer className="pl-estado">
        <span>{hojaAncho} × {hojaAlto} <em>mm</em></span>
        <span className="pl-sep" />
        <span>Centro <b className="pl-mono">{esquinas.centro}</b></span>
        <span className="pl-sep" />
        <span>CTM12 · EPSG:9377</span>
        <div style={{ flex: 1 }} />
        <span>{convenciones.length} capa{convenciones.length === 1 ? '' : 's'} en convenciones</span>
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*                      piezas de interfaz del compositor                  */
/* ═══════════════════════════════════════════════════════════════════════ */

function Grupo({ titulo, children, ultimo }: {
  titulo: string; children: React.ReactNode; ultimo?: boolean;
}) {
  return (
    <div className={`pl-grupo${ultimo ? ' es-ultimo' : ''}`}>
      <div className="pl-grupo-fila">{children}</div>
      <div className="pl-grupo-titulo">{titulo}</div>
    </div>
  );
}

function BotonCinta({ icono, texto, activo, alto, onClick }: {
  icono: string; texto: string; activo?: boolean; alto?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" title={texto}
      className={`pl-cinta-boton${alto ? ' es-alto' : ''}${activo ? ' es-activo' : ''}`}
      onClick={(e) => { e.stopPropagation(); onClick(); }}>
      <Icono nombre={icono} tam={alto ? 20 : 17} />
      <span>{texto}</span>
    </button>
  );
}

function MenuCinta({ icono, texto, abierto, alto, onAbrir, children }: {
  icono: string; texto: string; abierto: boolean; alto?: boolean;
  onAbrir: () => void; children: React.ReactNode;
}) {
  return (
    <div className="pl-menu-ancla">
      <button type="button" title={texto}
        className={`pl-cinta-boton${alto ? ' es-alto' : ''}${abierto ? ' es-abierto' : ''}`}
        onClick={(e) => { e.stopPropagation(); onAbrir(); }}>
        <Icono nombre={icono} tam={alto ? 20 : 17} />
        <span>{texto}<Icono nombre="caret" tam={9} /></span>
      </button>
      {abierto && (
        <div className="pl-menu" onClick={(e) => e.stopPropagation()}>{children}</div>
      )}
    </div>
  );
}

function Galeria({ titulo, columnas, ancho, children }: {
  titulo: string; columnas: number; ancho: number; children: React.ReactNode;
}) {
  return (
    <div style={{ width: ancho }}>
      <div className="pl-menu-titulo">{titulo}</div>
      <div className="pl-galeria" style={{ gridTemplateColumns: `repeat(${columnas},1fr)` }}>
        {children}
      </div>
    </div>
  );
}

function Muestra({ nombre, activa, alto, fila, onClick, children }: {
  nombre: string; activa: boolean; alto: number; fila?: boolean;
  onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" title={nombre} onClick={onClick}
      className={`pl-muestra${activa ? ' es-activa' : ''}${fila ? ' es-fila' : ''}`}>
      <span className="pl-muestra-lienzo" style={{ height: alto }}>{children}</span>
      <span className="pl-muestra-nombre">{nombre}</span>
    </button>
  );
}

function Propiedad({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label className="pl-prop">
      <span className="pl-prop-et">{etiqueta}</span>
      {children}
    </label>
  );
}

function Selector({ valor, onChange, opciones, ancho, grupos }: {
  valor: string; onChange: (v: string) => void; ancho: number | string;
  opciones: Array<{ v: string; t: string; g?: string }>; grupos?: string[];
}) {
  return (
    <span className="pl-selector" style={{ width: ancho }}>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        {grupos
          ? grupos.map((g) => (
              <optgroup key={g} label={g}>
                {opciones.filter((o) => o.g === g).map((o) => (
                  <option key={o.v} value={o.v}>{o.t}</option>
                ))}
              </optgroup>
            ))
          : opciones.map((o) => <option key={o.v} value={o.v}>{o.t}</option>)}
      </select>
      <Icono nombre="caret" tam={9} />
    </span>
  );
}

function Segmentado({ valor, onChange, opciones, ancho }: {
  valor: string; onChange: (v: string) => void; ancho?: boolean;
  opciones: Array<{ v: string; icono?: string; texto?: string; titulo?: string }>;
}) {
  return (
    <div className={`pl-segmentado${ancho ? ' es-ancho' : ''}`}>
      {opciones.map((o) => (
        <button key={o.v} type="button" title={o.titulo ?? o.texto}
          className={valor === o.v ? 'es-activo' : ''}
          onClick={(e) => { e.stopPropagation(); onChange(o.v); }}>
          {o.icono && <Icono nombre={o.icono} tam={15} />}
          {o.texto}
        </button>
      ))}
    </div>
  );
}

function Deslizador({ etiqueta, valor, unidad, min, max, paso, nota, onChange }: {
  etiqueta: string; valor: number; unidad: string; min: number; max: number;
  paso: number; nota?: string; onChange: (v: number) => void;
}) {
  const pct = ((valor - min) / (max - min)) * 100;
  return (
    <div className="pl-desl">
      <div className="pl-desl-cabeza">
        <span>{etiqueta}</span>
        <span className="pl-mono">{valor.toFixed(paso < 1 ? 1 : 0)}<em>{unidad}</em></span>
      </div>
      <input type="range" min={min} max={max} step={paso} value={valor}
        style={{ ['--pl-pct' as string]: `${pct}%` }}
        onChange={(e) => onChange(Number(e.target.value))} />
      {nota && <div className="pl-desl-nota">{nota}</div>}
    </div>
  );
}

function Interruptor({ etiqueta, valor, onChange }: {
  etiqueta: string; valor: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="pl-switch">
      <span>{etiqueta}</span>
      <button type="button" role="switch" aria-checked={valor}
        className={valor ? 'es-on' : ''} onClick={() => onChange(!valor)}>
        <span />
      </button>
    </label>
  );
}

function iconoDe(t: TipoElemento): string {
  return ({
    mapa: 'mapa', rotulo: 'marco', titulo: 'titulo', datos: 'lista',
    norte: 'norte', escala: 'escala', convenciones: 'convenciones', texto: 'texto',
    referencia: 'datos',
    imagen: 'imagen', linea: 'linea', flecha: 'flechaDiag', rect: 'rectangulo', elipse: 'elipse',
  } as Record<string, string>)[t] ?? 'texto';
}

function Icono({ nombre, tam = 16 }: { nombre: string; tam?: number }) {
  const t = {
    fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  };
  const d: Record<string, React.ReactNode> = {
    hoja: <><rect x="4" y="2.5" width="16" height="19" rx="1.5" {...t} /><path d="M7.5 7.5h9M7.5 11.5h9M7.5 15.5h5" {...t} /></>,
    flechaAtras: <path d="M14.5 5.5L8 12l6.5 6.5" {...t} />,
    descargar: <><path d="M12 3.5v11" {...t} /><path d="M7.5 10.5L12 15l4.5-4.5" {...t} /><path d="M4.5 18.5h15" {...t} /></>,
    progreso: <><circle cx="12" cy="12" r="8" {...t} opacity=".25" /><path d="M20 12a8 8 0 00-8-8" {...t} /></>,
    horizontal: <rect x="2.5" y="6.5" width="19" height="11" rx="1.5" {...t} />,
    vertical: <rect x="6.5" y="2.5" width="11" height="19" rx="1.5" {...t} />,
    marco: <><rect x="3" y="4" width="18" height="16" rx="1.5" {...t} /><rect x="6.5" y="7.5" width="11" height="9" {...t} strokeDasharray="2.5 2.5" /></>,
    grilla: <><rect x="3" y="3" width="18" height="18" rx="1.5" {...t} /><path d="M9 3.5v17M15 3.5v17M3.5 9h17M3.5 15h17" {...t} /></>,
    opciones: <><path d="M4 8h10M18 8h2M4 16h3M11 16h9" {...t} /><circle cx="16" cy="8" r="2" {...t} /><circle cx="9" cy="16" r="2" {...t} /></>,
    norte: <><path d="M12 3.5l-3 11.5 3-2.4 3 2.4z" {...t} /><path d="M9.5 21h5" {...t} /></>,
    escala: <><rect x="2.5" y="9" width="19" height="6" rx="1" {...t} /><path d="M7.25 9v6M12 9v6M16.75 9v6" {...t} /></>,
    texto: <><path d="M5 5.5h14M12 5.5v13M9 18.5h6" {...t} /></>,
    titulo: <><path d="M4 6h16M4 11h10M4 16h13" {...t} /></>,
    variable: <><path d="M8 4.5C5.5 8 5.5 16 8 19.5M16 4.5c2.5 3.5 2.5 11.5 0 15" {...t} /><path d="M9.5 12h5" {...t} /></>,
    formas: <><rect x="3" y="3.5" width="8" height="8" rx="1" {...t} /><circle cx="17" cy="7.5" r="4" {...t} /><path d="M4 20.5L11 14M11 20.5H4v-6.5" {...t} /></>,
    imagen: <><rect x="3" y="5" width="18" height="14" rx="1.5" {...t} /><circle cx="8.5" cy="10" r="1.7" {...t} /><path d="M4 18l5-5 3.5 3 3-2.5L20 18" {...t} /></>,
    acomodar: <><rect x="3" y="3" width="7.5" height="7.5" rx="1" {...t} /><rect x="13.5" y="3" width="7.5" height="4.5" rx="1" {...t} /><rect x="13.5" y="10.5" width="7.5" height="10.5" rx="1" {...t} /><rect x="3" y="13.5" width="7.5" height="7.5" rx="1" {...t} /></>,
    mapa: <><path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z" {...t} /><path d="M9 4.2v13.4M15 6.6V20" {...t} /></>,
    lista: <><circle cx="5" cy="7" r="1.4" {...t} /><circle cx="5" cy="12" r="1.4" {...t} /><circle cx="5" cy="17" r="1.4" {...t} /><path d="M9.5 7H20M9.5 12H20M9.5 17H20" {...t} /></>,
    convenciones: <><rect x="3.5" y="5" width="4" height="4" rx=".5" {...t} /><rect x="3.5" y="15" width="4" height="4" rx=".5" {...t} /><path d="M11 7h9.5M11 17h9.5" {...t} /></>,
    ojo: <><path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" {...t} /><circle cx="12" cy="12" r="2.7" {...t} /></>,
    ojoCerrado: <><path d="M4 7.5c2 2.7 4.7 4.3 8 4.3s6-1.6 8-4.3" {...t} /><path d="M5 13l-1.5 2M19 13l1.5 2M9.5 14.6L9 17M14.5 14.6L15 17" {...t} /></>,
    equis: <path d="M6 6l12 12M18 6L6 18" {...t} />,
    caret: <path d="M5 8.5l7 7 7-7" {...t} strokeWidth={2.4} />,
    cursor: <><path d="M6 3.5l12.5 7.8-5.6 1.3-2.4 5.4z" {...t} /><path d="M13.5 14.5L19 20" {...t} /></>,
    encuadrar: <><path d="M3.5 8.5v-5h5M20.5 8.5v-5h-5M3.5 15.5v5h5M20.5 15.5v5h-5" {...t} /><circle cx="12" cy="12" r="3" {...t} /></>,
    linea: <path d="M4 20L20 4" {...t} />,
    flechaDiag: <><path d="M4.5 19.5L18 6" {...t} /><path d="M11 5.5h7.5V13" {...t} /></>,
    rectangulo: <rect x="3.5" y="6" width="17" height="12" rx="1" {...t} />,
    elipse: <ellipse cx="12" cy="12" rx="8.5" ry="6" {...t} />,
  };
  return <svg width={tam} height={tam} viewBox="0 0 24 24" aria-hidden="true">{d[nombre] ?? d.texto}</svg>;
}

/* ═══════════════════════════════════════════════════════════════════════ */
/*   Hoja de estilo del compositor                                          */
/*   Se inyecta una sola vez; incluye las superficies que el navegador      */
/*   trae por defecto (selección, cursor, barras de scroll, foco).          */
/* ═══════════════════════════════════════════════════════════════════════ */

const CSS_PLANO = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=DM+Mono:wght@400;500&display=swap');

.pl-raiz, .pl-lanzador {
  --pl-fondo:      #0A0C11;
  --pl-chrome:     #11141B;
  --pl-elevado:    #171C25;
  --pl-linea:      #232936;
  --pl-linea-soft: #1A1F29;
  --pl-tinta:      #E8ECF3;
  --pl-tinta-2:    #A2AABB;
  --pl-tinta-3:    #7D8698;
  --pl-acento:     #2DD4A0;
  --pl-acento-12:  rgba(45,212,160,.12);
  --pl-acento-24:  rgba(45,212,160,.24);
  --pl-expo:       cubic-bezier(.16,1,.3,1);
  font-family: 'DM Sans', ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-feature-settings: 'ss01';
}

/* ── lanzador sobre el mapa ─────────────────────────────────────────── */
.pl-lanzador {
  position: absolute; top: 12px; right: 12px; z-index: 20;
  display: flex; align-items: center; gap: 8px;
  padding: 8px 14px 8px 12px; border-radius: 9px;
  background: rgba(17,20,27,.86); backdrop-filter: blur(10px);
  border: 1px solid var(--pl-linea); color: var(--pl-tinta);
  font-size: 13px; font-weight: 500; letter-spacing: -.01em; cursor: pointer;
  box-shadow: 0 6px 18px -6px rgba(0,0,0,.6);
  transition: background .18s var(--pl-expo), border-color .18s var(--pl-expo), transform .18s var(--pl-expo);
}
.pl-lanzador:hover { background: rgba(23,28,37,.94); border-color: #2C3444; transform: translateY(-1px); }
.pl-lanzador:active { transform: translateY(0); }
.pl-lanzador svg { color: var(--pl-acento); }

/* ── armazón ────────────────────────────────────────────────────────── */
.pl-raiz {
  position: fixed; inset: 0; z-index: 100;
  display: flex; flex-direction: column;
  background: var(--pl-fondo); color: var(--pl-tinta);
  font-size: 13px; line-height: 1.45;
  animation: pl-entra .34s var(--pl-expo) both;
}
@keyframes pl-entra { from { opacity: 0 } to { opacity: 1 } }

.pl-raiz ::selection { background: var(--pl-acento-24); color: #fff; }
.pl-raiz input, .pl-raiz textarea { caret-color: var(--pl-acento); }
.pl-raiz :focus-visible {
  outline: 2px solid var(--pl-acento); outline-offset: 2px; border-radius: 4px;
}
.pl-raiz *::-webkit-scrollbar { width: 10px; height: 10px; }
.pl-raiz *::-webkit-scrollbar-track { background: transparent; }
.pl-raiz *::-webkit-scrollbar-thumb {
  background: #262D3B; border-radius: 6px; border: 3px solid transparent; background-clip: content-box;
}
.pl-raiz *::-webkit-scrollbar-thumb:hover { background: #333C4D; background-clip: content-box; }
.pl-mono {
  font-family: 'DM Mono', ui-monospace, monospace;
  font-variant-numeric: tabular-nums; letter-spacing: -.01em;
}

/* ── encabezado ─────────────────────────────────────────────────────── */
.pl-encabezado {
  position: relative; z-index: 31;
  display: flex; align-items: center; gap: 14px; flex-shrink: 0;
  height: 46px; padding: 0 12px 0 8px;
  border-bottom: 1px solid var(--pl-linea-soft);
  animation: pl-baja .44s .04s var(--pl-expo) both;
}
@keyframes pl-baja { from { opacity: 0; transform: translateY(-8px) } to { opacity: 1; transform: none } }

.pl-volver {
  display: flex; align-items: center; gap: 5px; padding: 6px 10px 6px 7px;
  background: none; border: 0; border-radius: 7px; cursor: pointer;
  color: var(--pl-tinta-2); font: inherit; font-size: 12.5px;
  transition: color .16s, background .16s;
}
.pl-volver:hover { color: var(--pl-tinta); background: var(--pl-chrome); }

.pl-doc { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.pl-doc-nombre {
  font-size: 13.5px; font-weight: 500; letter-spacing: -.012em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pl-doc-meta { font-size: 11px; color: var(--pl-tinta-3); letter-spacing: -.005em; }

.pl-exportar {
  margin-left: auto; display: flex; align-items: center; gap: 7px;
  padding: 8px 15px 8px 12px; border: 0; border-radius: 8px; cursor: pointer;
  background: var(--pl-acento); color: #06251B;
  font: inherit; font-size: 12.5px; font-weight: 700; letter-spacing: -.01em;
  transition: filter .16s var(--pl-expo), transform .16s var(--pl-expo);
}
.pl-exportar:hover:not(:disabled) { filter: brightness(1.08); }
.pl-exportar:active:not(:disabled) { transform: scale(.975); }
.pl-exportar:disabled { background: var(--pl-elevado); color: var(--pl-tinta-3); cursor: progress; }
.pl-girando { display: flex; animation: pl-gira 1s linear infinite; }
@keyframes pl-gira { to { transform: rotate(360deg) } }

/* ── cinta ──────────────────────────────────────────────────────────── */
.pl-cinta {
  /* Sin overflow: un contenedor recortado corta los menús desplegables.
     En pantallas angostas la cinta se envuelve en vez de desplazarse. */
  position: relative; z-index: 30;
  display: flex; align-items: stretch; flex-wrap: wrap; flex-shrink: 0;
  row-gap: 4px; padding: 7px 10px 4px; background: var(--pl-chrome);
  border-bottom: 1px solid var(--pl-linea-soft);
  animation: pl-baja .44s .08s var(--pl-expo) both;
}

.pl-grupo {
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 0 12px; position: relative; flex-shrink: 0;
}
.pl-grupo:not(.es-ultimo)::after {
  content: ''; position: absolute; right: 0; top: 6px; bottom: 20px;
  width: 1px; background: var(--pl-linea-soft);
}
.pl-grupo-fila { display: flex; align-items: flex-start; gap: 3px; min-height: 50px; }
.pl-grupo-titulo {
  font-size: 10px; color: var(--pl-tinta-3);
  letter-spacing: .01em;
}

.pl-cinta-boton {
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-width: 54px; padding: 7px 6px 6px; border: 0; border-radius: 7px;
  background: none; color: var(--pl-tinta-2); cursor: pointer;
  font: inherit; font-size: 11px; letter-spacing: -.005em;
  transition: background .15s var(--pl-expo), color .15s var(--pl-expo);
}
.pl-cinta-boton.es-alto { min-width: 60px; }
.pl-cinta-boton span { display: flex; align-items: center; gap: 2px; }
.pl-cinta-boton:hover { background: var(--pl-elevado); color: var(--pl-tinta); }
.pl-cinta-boton.es-activo, .pl-cinta-boton.es-abierto {
  background: var(--pl-acento-12); color: var(--pl-acento);
}

.pl-menu-ancla { position: relative; }
.pl-menu {
  position: absolute; top: calc(100% + 5px); left: 0; z-index: 50;
  max-height: calc(100vh - 190px); overflow-y: auto;
  background: var(--pl-elevado); border: 1px solid var(--pl-linea);
  border-radius: 11px; overflow: hidden;
  box-shadow: 0 18px 40px -10px rgba(0,0,0,.72), 0 3px 10px rgba(0,0,0,.4);
  animation: pl-abre .26s var(--pl-expo) both;
  transform-origin: top left;
}
@keyframes pl-abre {
  from { opacity: 0; transform: scale(.96) translateY(-5px) }
  to   { opacity: 1; transform: none }
}
.pl-menu-cuerpo { padding: 12px 13px 4px; }
.pl-menu-titulo {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 11px 13px 7px; font-size: 11px; color: var(--pl-tinta-3);
}
.pl-menu-titulo span { font-size: 10.5px; color: #5E6676; }
.pl-menu-lista { max-height: 264px; overflow-y: auto; padding-bottom: 5px; }

.pl-item {
  display: flex; align-items: center; gap: 9px; width: 100%;
  padding: 7px 13px; border: 0; background: none; cursor: pointer;
  color: var(--pl-tinta-2); font: inherit; font-size: 12.5px; text-align: left;
  transition: background .13s, color .13s;
}
.pl-item svg { color: var(--pl-tinta-3); flex-shrink: 0; }
.pl-item span { flex: 1; }
.pl-item code {
  font-family: 'DM Mono', monospace; font-size: 10.5px; color: #5E6676;
}
.pl-item:hover { background: var(--pl-acento-12); color: var(--pl-tinta); }
.pl-item:hover svg, .pl-item:hover code { color: var(--pl-acento); }

.pl-galeria { display: grid; gap: 6px; padding: 0 10px 11px; }
.pl-muestra {
  display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 8px 5px 6px; border-radius: 8px; cursor: pointer;
  background: #0E1218; border: 1px solid var(--pl-linea-soft);
  color: var(--pl-tinta-2); font: inherit;
  transition: border-color .16s var(--pl-expo), background .16s var(--pl-expo), color .16s var(--pl-expo);
}
.pl-muestra.es-fila { flex-direction: row; align-items: center; gap: 10px; padding: 7px 10px; }
.pl-muestra.es-fila .pl-muestra-lienzo { flex: 1; }
.pl-muestra.es-fila .pl-muestra-nombre { text-align: right; min-width: 66px; }
.pl-muestra-lienzo { display: flex; align-items: center; justify-content: center; width: 100%; }
.pl-muestra-nombre { font-size: 10px; color: var(--pl-tinta-3); line-height: 1.25; }
.pl-muestra:hover { background: #121720; border-color: #2C3444; color: var(--pl-tinta); }
.pl-muestra.es-activa {
  border-color: var(--pl-acento); background: var(--pl-acento-12); color: var(--pl-acento);
}
.pl-muestra.es-activa .pl-muestra-nombre { color: var(--pl-acento); }

/* ── selectores y segmentados ───────────────────────────────────────── */
.pl-selector { position: relative; display: inline-flex; align-items: center; }
.pl-selector select {
  width: 100%; height: 30px; padding: 0 24px 0 9px;
  background: #0E1218; border: 1px solid var(--pl-linea); border-radius: 7px;
  color: var(--pl-tinta); font: inherit; font-size: 12px; cursor: pointer;
  appearance: none; transition: border-color .15s;
}
.pl-selector select:hover { border-color: #2C3444; }
.pl-selector > svg {
  position: absolute; right: 8px; pointer-events: none; color: var(--pl-tinta-3);
}

.pl-segmentado {
  display: inline-flex; padding: 2px; gap: 2px;
  background: #0E1218; border: 1px solid var(--pl-linea); border-radius: 8px;
}
.pl-segmentado.es-ancho { display: flex; width: 100%; }
.pl-segmentado.es-ancho button { flex: 1; }
.pl-segmentado button {
  display: flex; align-items: center; justify-content: center; gap: 5px;
  min-width: 32px; height: 24px; padding: 0 9px; border: 0; border-radius: 6px;
  background: none; color: var(--pl-tinta-3); cursor: pointer;
  font: inherit; font-size: 11.5px;
  transition: background .15s var(--pl-expo), color .15s var(--pl-expo);
}
.pl-segmentado button:hover { color: var(--pl-tinta); }
.pl-segmentado button.es-activo { background: #232A38; color: var(--pl-tinta); }

/* ── paneles laterales ──────────────────────────────────────────────── */
.pl-centro { position: relative; z-index: 1; flex: 1; display: flex; min-height: 0; }

.pl-panel {
  display: flex; flex-direction: column; flex-shrink: 0;
  background: var(--pl-chrome);
}
.pl-panel-izq {
  width: 238px; border-right: 1px solid var(--pl-linea-soft);
  animation: pl-izq .5s .1s var(--pl-expo) both;
}
.pl-panel-der {
  width: 262px; border-left: 1px solid var(--pl-linea-soft);
  animation: pl-der .5s .1s var(--pl-expo) both;
}
@keyframes pl-izq { from { opacity: 0; transform: translateX(-14px) } to { opacity: 1; transform: none } }
@keyframes pl-der { from { opacity: 0; transform: translateX(14px) } to { opacity: 1; transform: none } }

.pl-panel-cabeza {
  display: flex; align-items: center; justify-content: space-between;
  height: 34px; padding: 0 13px; flex-shrink: 0;
  font-size: 11.5px; font-weight: 500; letter-spacing: -.005em; color: var(--pl-tinta-2);
  border-bottom: 1px solid var(--pl-linea-soft);
}
.pl-conteo { font-size: 10.5px; color: var(--pl-tinta-3); font-weight: 400; }
.pl-panel-scroll { flex: 1; overflow-y: auto; padding: 5px 0; }
.pl-panel-pad { padding: 14px 13px 20px; }

.pl-fila {
  display: flex; align-items: center; gap: 7px;
  padding: 5px 9px 5px 7px; margin: 0 5px; border-radius: 7px;
  cursor: pointer; color: var(--pl-tinta-2); font-size: 12.5px;
  transition: background .13s, color .13s;
}
.pl-fila > svg { color: var(--pl-tinta-3); flex-shrink: 0; }
.pl-fila:hover { background: #161B24; color: var(--pl-tinta); }
.pl-fila.es-sel { background: var(--pl-acento-12); color: var(--pl-acento); }
.pl-fila.es-sel > svg { color: var(--pl-acento); }
.pl-fila.es-oculto { opacity: .42; }
.pl-fila-nombre {
  flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  letter-spacing: -.008em;
}
.pl-ojo, .pl-borrar {
  display: flex; padding: 2px; border: 0; background: none; cursor: pointer;
  color: var(--pl-tinta-3); border-radius: 4px; transition: color .13s;
}
.pl-ojo:hover { color: var(--pl-acento); }
.pl-borrar { opacity: 0; transition: opacity .13s, color .13s; }
.pl-fila:hover .pl-borrar { opacity: 1; }
.pl-borrar:hover { color: #F87171; }

/* ── propiedades ────────────────────────────────────────────────────── */
/* Segunda sección del panel izquierdo: capas del geovisor */
.pl-cabeza-2 { border-top: 1px solid var(--pl-linea-soft); margin-top: 2px; }
.pl-capas { flex: 0 0 auto; max-height: 42%; }
.pl-subcabeza {
  font-size: 9.5px; letter-spacing: .07em; text-transform: uppercase;
  color: var(--pl-tinta-3); padding: 9px 2px 4px; margin-top: 4px;
  border-top: 1px solid var(--pl-linea-soft);
}
.pl-sin-capas {
  margin: 10px 13px; font-size: 11.5px; color: var(--pl-tinta-3); line-height: 1.5;
}
.pl-punto { flex-shrink: 0; width: 9px; border: .5px solid rgba(0,0,0,.35); }
.pl-zoom {
  display: flex; padding: 2px; border: 0; background: none; cursor: pointer;
  color: var(--pl-tinta-3); border-radius: 4px; opacity: 0;
  transition: opacity .13s, color .13s;
}
.pl-fila:hover .pl-zoom { opacity: 1; }
.pl-zoom:hover { color: var(--pl-acento); }

/* Papel a medida */
.pl-medida { display: inline-flex; align-items: center; gap: 4px; }
.pl-medida input {
  width: 52px; height: 30px; padding: 0 6px; text-align: center;
  background: #0E1218; border: 1px solid var(--pl-linea); border-radius: 7px;
  color: var(--pl-tinta); font: inherit; font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.pl-medida input:focus { border-color: var(--pl-acento); outline: none; }
.pl-medida i { font-style: normal; color: var(--pl-tinta-3); font-size: 11px; }
.pl-medida em { font-style: normal; color: var(--pl-tinta-3); font-size: 10.5px; }

.pl-vacio {
  display: flex; flex-direction: column; gap: 9px; padding: 22px 4px;
  color: var(--pl-tinta-3);
}
.pl-vacio svg { color: #3A4353; }
.pl-vacio p { margin: 0; font-size: 12.5px; line-height: 1.55; color: var(--pl-tinta-2); }
.pl-vacio-sec { color: var(--pl-tinta-3) !important; font-size: 11.5px !important; }

.pl-prop { display: block; margin-bottom: 15px; }
.pl-prop-et {
  display: block; margin-bottom: 6px;
  font-size: 11.5px; color: var(--pl-tinta-3); letter-spacing: -.005em;
}
.pl-campo {
  width: 100%; padding: 7px 9px; box-sizing: border-box;
  background: #0E1218; border: 1px solid var(--pl-linea); border-radius: 7px;
  color: var(--pl-tinta); font: inherit; font-size: 12.5px;
  transition: border-color .15s;
}
.pl-campo::placeholder { color: #5E6676; }
.pl-campo:hover { border-color: #2C3444; }
.pl-campo:focus { border-color: var(--pl-acento); outline: none; }
.pl-area { resize: vertical; min-height: 56px; line-height: 1.5; }

.pl-color { display: flex; align-items: center; gap: 9px; }
.pl-color input {
  width: 34px; height: 28px; padding: 0; cursor: pointer;
  background: none; border: 1px solid var(--pl-linea); border-radius: 6px;
}
.pl-color span { font-size: 11.5px; color: var(--pl-tinta-3); }

.pl-desl { margin-bottom: 15px; }
.pl-desl-cabeza {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 7px; font-size: 11.5px; color: var(--pl-tinta-3);
}
.pl-desl-cabeza .pl-mono { color: var(--pl-tinta-2); font-size: 11.5px; }
.pl-desl-cabeza em { font-style: normal; color: #5E6676; margin-left: 2px; }
.pl-desl-nota { margin-top: 5px; font-size: 10.5px; color: #5E6676; }

.pl-desl input[type=range] {
  width: 100%; height: 4px; margin: 0; appearance: none; border-radius: 3px; cursor: pointer;
  background: linear-gradient(to right,
    var(--pl-acento) 0%, var(--pl-acento) var(--pl-pct, 50%),
    #232A38 var(--pl-pct, 50%), #232A38 100%);
}
.pl-desl input[type=range]::-webkit-slider-thumb {
  appearance: none; width: 13px; height: 13px; border-radius: 50%;
  background: #E8ECF3; border: 0; cursor: grab;
  box-shadow: 0 1px 4px rgba(0,0,0,.5);
  transition: transform .15s var(--pl-expo);
}
.pl-desl input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.18); }
.pl-desl input[type=range]::-webkit-slider-thumb:active { cursor: grabbing; transform: scale(1.05); }
.pl-desl input[type=range]::-moz-range-thumb {
  width: 13px; height: 13px; border-radius: 50%; background: #E8ECF3; border: 0; cursor: grab;
}

.pl-switch {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 15px; font-size: 12.5px; color: var(--pl-tinta-2); cursor: pointer;
}
.pl-switch button {
  position: relative; width: 34px; height: 19px; padding: 0; flex-shrink: 0;
  background: #232A38; border: 0; border-radius: 10px; cursor: pointer;
  transition: background .2s var(--pl-expo);
}
.pl-switch button span {
  position: absolute; top: 2.5px; left: 2.5px; width: 14px; height: 14px;
  background: #8A93A6; border-radius: 50%;
  transition: transform .24s var(--pl-expo), background .2s;
}
.pl-switch button.es-on { background: var(--pl-acento); }
.pl-switch button.es-on span { transform: translateX(15px); background: #06251B; }

.pl-seccion { margin-top: 22px; padding-top: 16px; border-top: 1px solid var(--pl-linea-soft); }
.pl-seccion-titulo {
  margin-bottom: 13px; font-size: 11.5px; font-weight: 500; color: var(--pl-tinta-2);
}

/* ── lienzo y hoja ──────────────────────────────────────────────────── */
.pl-lienzo {
  flex: 1; overflow: auto; display: flex;
  align-items: center; justify-content: center; padding: 22px;
  background:
    radial-gradient(ellipse 80% 60% at 50% 42%, #10141C 0%, var(--pl-fondo) 72%);
}
.pl-hoja {
  position: relative; flex-shrink: 0; background: #fff;
  box-shadow: 0 26px 64px -14px rgba(0,0,0,.78), 0 5px 14px rgba(0,0,0,.42);
  animation: pl-hoja-entra .62s .12s var(--pl-expo) both;
}
@keyframes pl-hoja-entra {
  from { opacity: 0; transform: translateY(12px) scale(.985); filter: blur(4px) }
  to   { opacity: 1; transform: none; filter: none }
}
.pl-marco-hoja { position: absolute; border: 1px solid #111; pointer-events: none; }

.pl-el { position: absolute; cursor: move; outline-offset: 1px; }
.pl-el.es-mapa { cursor: grab; border: 1px solid #111; }
.pl-el.es-mapa:active { cursor: grabbing; }
.pl-el:hover { outline: 1px solid var(--pl-acento-24); }
.pl-el.es-sel, .pl-el.es-sel:hover { outline: 1.5px solid var(--pl-acento); }
.pl-rotulo { position: absolute; border: 1px solid #111; }
.pl-rotulo.es-sel { outline: 1.5px solid var(--pl-acento); outline-offset: 1px; }
.pl-mapa-lienzo { position: absolute; inset: 0; }

.pl-grilla { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.pl-grilla line { stroke: rgba(0,0,0,.42); stroke-width: .6; }
.pl-grilla text {
  fill: #111; font-family: 'DM Mono', monospace; font-variant-numeric: tabular-nums;
  /* Halo de papel: la coordenada se lee aunque caiga sobre el mapa */
  paint-order: stroke; stroke: #fff; stroke-width: 2.6px; stroke-linejoin: round;
}

.pl-etiqueta-marco {
  position: absolute; left: 50%; bottom: 7px; transform: translateX(-50%);
  padding: 3px 9px; border-radius: 20px; pointer-events: none;
  background: rgba(10,12,17,.82); backdrop-filter: blur(6px);
  color: #C6CDDA; font-size: 10.5px; white-space: nowrap;
  opacity: 0; transition: opacity .22s var(--pl-expo);
}
.pl-el.es-mapa:hover .pl-etiqueta-marco { opacity: 1; }

/* ── barra de estado ────────────────────────────────────────────────── */
.pl-estado {
  display: flex; align-items: center; gap: 12px; flex-shrink: 0;
  height: 28px; padding: 0 14px;
  background: var(--pl-chrome); border-top: 1px solid var(--pl-linea-soft);
  font-size: 11px; color: var(--pl-tinta-3);
}
.pl-estado b { font-weight: 400; color: var(--pl-tinta-2); }
.pl-estado em { font-style: normal; color: #5E6676; }
.pl-sep { width: 1px; height: 11px; background: var(--pl-linea); }

@media (prefers-reduced-motion: reduce) {
  .pl-raiz, .pl-raiz *, .pl-lanzador { animation: none !important; transition-duration: .01ms !important; }
}
`;

function EstilosPlano() {
  return <style dangerouslySetInnerHTML={{ __html: CSS_PLANO }} />;
}
