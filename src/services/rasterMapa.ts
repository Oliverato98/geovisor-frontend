/**
 * services/rasterMapa.ts
 * Colorea las capas ráster y las pone sobre un mapa de MapLibre.
 *
 * Los PNG no traen color: guardan un byte por celda con el valor. Aquí se
 * arma una tabla de 256 entradas y se traduce la imagen píxel a píxel, así
 * que cambiar una rampa o el color de una clase no requiere volver a bajar
 * nada del servidor.
 *
 * Vive aparte porque hay dos mapas que lo necesitan: el del geovisor y el de
 * la vista previa del rótulo, que es una instancia independiente.
 */
import type { ImageSource, Map as MapLibreMap } from 'maplibre-gl';
import { PASO_CLASE, rampaPorId, type RasterInfo } from '../data/rasters';

export type RasterEnMapa = RasterInfo & {
  visible: boolean;
  opacity: number;
  /** Rampa elegida por el usuario. Si falta, la del catálogo. */
  rampaElegida?: string;
  invertida?: boolean;
  /** Colores de clase elegidos por el usuario, indexados por número de clase. */
  coloresClase?: Record<number, string>;
  /** Nombres de clase escritos por el usuario, indexados por número de clase. */
  etiquetasClase?: Record<number, string>;
};

/** El nombre de una clase: el que escribió el usuario, o el del catálogo. */
export function textoClase(r: RasterEnMapa, indice: number): string {
  if (r.tipo !== 'clases') return '';
  const propio = r.etiquetasClase?.[indice]?.trim();
  if (propio) return propio;
  return r.clases.find((c) => c.indice === indice)?.texto ?? `Clase ${indice}`;
}

export const idFuenteRaster = (id: string) => `ras-src-${id}`;
export const idCapaRaster = (id: string) => `ras-lyr-${id}`;

/* ---------------------------------------------------------------- colores */

function aRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const largo = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
  return [
    parseInt(largo.slice(0, 2), 16),
    parseInt(largo.slice(2, 4), 16),
    parseInt(largo.slice(4, 6), 16),
  ];
}

/** Interpola una rampa de paradas en un color intermedio. `t` va de 0 a 1. */
function enRampa(paradas: string[], t: number): [number, number, number] {
  const pos = Math.max(0, Math.min(1, t)) * (paradas.length - 1);
  const i = Math.min(Math.floor(pos), paradas.length - 2);
  const f = pos - i;
  const a = aRgb(paradas[i]);
  const b = aRgb(paradas[i + 1]);
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/** Devuelve los colores de la leyenda tal como se están viendo en el mapa. */
export function coloresDe(r: RasterEnMapa): string[] {
  if (r.tipo === 'clases') {
    return r.clases.map((c) => r.coloresClase?.[c.indice] ?? c.color);
  }
  const paradas = rampaPorId(r.rampaElegida ?? r.rampa).paradas;
  return r.invertida ? [...paradas].reverse() : paradas;
}

/**
 * Tabla de 256 entradas RGBA: dado el byte de una celda, el color que le toca.
 * El byte 0 siempre es transparente, porque ahí es donde quedó el «sin dato».
 */
function tablaDeColor(r: RasterEnMapa): Uint8ClampedArray {
  const tabla = new Uint8ClampedArray(256 * 4);

  if (r.tipo === 'clases') {
    for (const clase of r.clases) {
      const [cr, cg, cb] = aRgb(r.coloresClase?.[clase.indice] ?? clase.color);
      // Cada clase ocupa una franja de bytes alrededor de su valor, así que
      // un corrimiento al decodificar la imagen sigue cayendo en su color.
      const centro = clase.indice * PASO_CLASE;
      const desde = centro - PASO_CLASE / 2;
      const hasta = centro + PASO_CLASE / 2;
      for (let b = Math.ceil(desde); b < hasta && b < 256; b++) {
        if (b <= 0) continue;
        tabla[b * 4] = cr;
        tabla[b * 4 + 1] = cg;
        tabla[b * 4 + 2] = cb;
        tabla[b * 4 + 3] = 255;
      }
    }
    return tabla;
  }

  const paradas = rampaPorId(r.rampaElegida ?? r.rampa).paradas;
  for (let b = 1; b < 256; b++) {
    const t = (b - 1) / 254;
    const [cr, cg, cb] = enRampa(paradas, r.invertida ? 1 - t : t);
    tabla[b * 4] = cr;
    tabla[b * 4 + 1] = cg;
    tabla[b * 4 + 2] = cb;
    tabla[b * 4 + 3] = 255;
  }
  return tabla;
}

/** Identifica una combinación de capa y colores, para no repintar de más. */
function firma(r: RasterEnMapa): string {
  if (r.tipo === 'clases') {
    return `${r.id}|${r.clases.map((c) => r.coloresClase?.[c.indice] ?? c.color).join(',')}`;
  }
  return `${r.id}|${r.rampaElegida ?? r.rampa}|${r.invertida ? 'inv' : 'dir'}`;
}

/* ---------------------------------------------------------------- pintado */

// La imagen de valores se baja y se decodifica una sola vez por capa.
const crudos = new Map<string, Promise<ImageData>>();
// Y cada combinación de colores se guarda ya pintada.
const pintados = new Map<string, string>();

function cargarCrudo(archivo: string): Promise<ImageData> {
  const yaEsta = crudos.get(archivo);
  if (yaEsta) return yaEsta;

  const tarea = new Promise<ImageData>((ok, fallo) => {
    const img = new Image();
    img.onload = () => {
      const lienzo = document.createElement('canvas');
      lienzo.width = img.naturalWidth;
      lienzo.height = img.naturalHeight;
      const ctx = lienzo.getContext('2d', { willReadFrequently: true });
      if (!ctx) return fallo(new Error('El navegador no entregó un lienzo 2D.'));
      ctx.drawImage(img, 0, 0);
      ok(ctx.getImageData(0, 0, lienzo.width, lienzo.height));
    };
    img.onerror = () => fallo(new Error(`No se pudo cargar ${archivo}`));
    img.src = `${import.meta.env.BASE_URL}${archivo}`;
  });

  crudos.set(archivo, tarea);
  return tarea;
}

/** Aplica la tabla de color y devuelve la imagen lista para MapLibre. */
async function urlColoreada(r: RasterEnMapa): Promise<string> {
  const clave = firma(r);
  const guardada = pintados.get(clave);
  if (guardada) return guardada;

  const crudo = await cargarCrudo(r.archivo);
  const tabla = tablaDeColor(r);

  const salida = new ImageData(crudo.width, crudo.height);
  const origen = crudo.data;
  const destino = salida.data;

  for (let i = 0; i < origen.length; i += 4) {
    // El PNG es escala de grises con alfa, así que el canal rojo ya trae el
    // valor de la celda y el alfa distingue el dato del hueco.
    if (origen[i + 3] === 0) continue;
    const b = origen[i] * 4;
    destino[i] = tabla[b];
    destino[i + 1] = tabla[b + 1];
    destino[i + 2] = tabla[b + 2];
    destino[i + 3] = tabla[b + 3];
  }

  const lienzo = document.createElement('canvas');
  lienzo.width = crudo.width;
  lienzo.height = crudo.height;
  lienzo.getContext('2d')!.putImageData(salida, 0, 0);
  const url = lienzo.toDataURL('image/png');

  // Diez combinaciones bastan para ir y volver entre rampas sin repintar; más
  // que eso ocupa memoria en imágenes de casi un megapíxel.
  if (pintados.size > 10) pintados.delete(pintados.keys().next().value as string);
  pintados.set(clave, url);
  return url;
}

/* ------------------------------------------------------------ el mapa */

/**
 * Sincroniza las capas ráster con el mapa: crea las que falten, repinta las
 * que cambiaron de color y actualiza opacidad y visibilidad.
 *
 * La imagen se descarga solo cuando la capa se enciende por primera vez.
 */
export async function sincronizarRasters(map: MapLibreMap, rasters: RasterEnMapa[]) {
  if (!map.isStyleLoaded()) return;

  // Las vectoriales mandan: todo ráster se inserta antes de la primera de
  // ellas para que ninguna quede tapada por una imagen.
  const tope = map.getStyle()?.layers?.find(
    (l) => l.id.startsWith('lyr-') || l.id.startsWith('analysis-lyr-')
  )?.id;

  for (const r of rasters) {
    const fuente = idFuenteRaster(r.id);
    const capa = idCapaRaster(r.id);
    const existe = !!map.getSource(fuente);

    if (!r.visible && !existe) continue;

    const marca = firma(r);

    if (!existe) {
      const url = await urlColoreada(r);
      // Entre el await y esta línea el estilo pudo cambiar o la capa pudo
      // volver a apagarse, así que se comprueba de nuevo antes de tocar nada.
      if (!map.getStyle() || map.getSource(fuente)) continue;
      map.addSource(fuente, { type: 'image', url, coordinates: r.esquinas });
      map.addLayer({
        id: capa,
        type: 'raster',
        source: fuente,
        metadata: { firma: marca },
        paint: {
          'raster-opacity': r.opacity,
          // Sin desvanecido: es una sola textura ya cargada, no tiene por qué
          // parpadear cada vez que el mapa se mueve.
          'raster-fade-duration': 0,
          // Vecino más cercano: suavizar mezclaría colores de clases distintas
          // e inventaría valores intermedios que no existen en el dato.
          'raster-resampling': 'nearest',
        },
      }, tope);
    } else {
      const lienzoCapa = map.getLayer(capa);
      const anterior = (lienzoCapa?.metadata as { firma?: string } | undefined)?.firma;
      if (anterior !== marca) {
        const url = await urlColoreada(r);
        const src = map.getSource(fuente) as ImageSource | undefined;
        if (!src) continue;
        src.updateImage({ url, coordinates: r.esquinas });
        if (map.getLayer(capa)) {
          (map.getLayer(capa) as { metadata?: unknown }).metadata = { firma: marca };
        }
      }
      if (map.getLayer(capa)) {
        map.setPaintProperty(capa, 'raster-opacity', r.opacity);
      }
    }

    if (map.getLayer(capa)) {
      map.setLayoutProperty(capa, 'visibility', r.visible ? 'visible' : 'none');
    }
  }
}
