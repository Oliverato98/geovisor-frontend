/**
 * services/rasterMapa.ts
 * Pone las capas ráster sobre un mapa de MapLibre.
 *
 * Vive aparte porque hay dos mapas que las necesitan: el del geovisor y el de
 * la vista previa del rótulo, que es una instancia independiente clonada del
 * primero. Si esto viviera dentro de MapView, el compositor no podría usarlo.
 */
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { RasterInfo } from '../data/rasters';

export interface RasterEnMapa extends RasterInfo {
  visible: boolean;
  opacity: number;
}

export const idFuenteRaster = (id: string) => `ras-src-${id}`;
export const idCapaRaster = (id: string) => `ras-lyr-${id}`;

/**
 * Sincroniza las capas ráster con el mapa: crea las que falten, actualiza
 * opacidad y visibilidad de las que ya estén.
 *
 * Las imágenes se descargan solo cuando la capa se enciende por primera vez:
 * las trece juntas son más de dos megabytes que casi nadie llega a mirar.
 */
export function sincronizarRasters(map: MapLibreMap, rasters: RasterEnMapa[]) {
  if (!map.isStyleLoaded()) return;

  // Las vectoriales mandan: todo ráster se inserta antes de la primera de
  // ellas para que ninguna quede tapada por una imagen.
  const tope = map.getStyle()?.layers?.find(
    (l) => l.id.startsWith('lyr-') || l.id.startsWith('analysis-lyr-')
  )?.id;

  rasters.forEach((r) => {
    const fuente = idFuenteRaster(r.id);
    const capa = idCapaRaster(r.id);

    if (!r.visible && !map.getSource(fuente)) return;

    if (!map.getSource(fuente)) {
      map.addSource(fuente, {
        type: 'image',
        url: `${import.meta.env.BASE_URL}${r.archivo}`,
        coordinates: r.esquinas,
      });
    }

    if (!map.getLayer(capa)) {
      map.addLayer({
        id: capa,
        type: 'raster',
        source: fuente,
        paint: {
          'raster-opacity': r.opacity,
          // Sin desvanecido: es una sola textura ya cargada, no tiene por qué
          // parpadear cada vez que el mapa se mueve.
          'raster-fade-duration': 0,
          // Vecino más cercano: en los ráster de clases, suavizar mezclaría
          // colores de categorías distintas e inventaría valores intermedios.
          'raster-resampling': 'nearest',
        },
      }, tope);
    } else {
      map.setPaintProperty(capa, 'raster-opacity', r.opacity);
    }

    map.setLayoutProperty(capa, 'visibility', r.visible ? 'visible' : 'none');
  });
}
