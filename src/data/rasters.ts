/**
 * data/rasters.ts
 * Catálogo de las capas ráster del estudio de amenaza por remoción en masa.
 *
 * Cada PNG guarda un byte por celda —el índice de clase, o el valor
 * normalizado en los continuos— y el canal alfa marca los nodata. El color no
 * está dentro de la imagen: lo aplica el navegador, así que las rampas y los
 * colores de clase se pueden cambiar sin volver a generar nada.
 *
 * Las imágenes viven en `public/rasters/`.
 */

/** Separación entre clases dentro del byte del PNG. Ver `PASO_CLASE` en el
 *  generador: los valores van de 25 en 25 para que un corrimiento de una
 *  unidad al decodificar la imagen no convierta una clase en su vecina. */
export const PASO_CLASE = 25;

/** Una rampa de color con nueve paradas, de mínimo a máximo. */
export interface Rampa {
  id: string;
  nombre: string;
  paradas: string[];
}

export const RAMPAS: Rampa[] = [
  { id: "elevacion", nombre: "Elevación", paradas: ["#333399", "#0888ee", "#01cc66", "#81e680", "#fefe98", "#beac76", "#815e56", "#c1b0ac", "#ffffff"] },
  { id: "calor", nombre: "Amarillo a rojo", paradas: ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8c3c", "#fc4d2a", "#e2191c", "#bb0026", "#800026"] },
  { id: "azules", nombre: "Azules", paradas: ["#f7fbff", "#deebf7", "#c6dbef", "#9dcae1", "#6aaed6", "#4191c6", "#2070b4", "#08509b", "#08306b"] },
  { id: "azules_inv", nombre: "Azules invertido", paradas: ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6caed6", "#9fcae1", "#c7dbef", "#dfebf7", "#f7fbff"] },
  { id: "divergente", nombre: "Cóncavo y convexo", paradas: ["#053061", "#2a71b2", "#6bacd1", "#c2ddec", "#f7f6f6", "#fbccb4", "#e48066", "#ba2832", "#67001f"] },
  { id: "espectral", nombre: "Espectral", paradas: ["#5e4fa2", "#3f97b7", "#89d0a4", "#d8ef9b", "#fffebe", "#fed27f", "#f88c51", "#dc484c", "#9e0142"] },
  { id: "verde_rojo", nombre: "Verde a rojo", paradas: ["#006837", "#2da155", "#87cb67", "#cdea83", "#fffebe", "#fed27f", "#f88c51", "#dd3d2d", "#a50026"] },
  { id: "viridis", nombre: "Viridis", paradas: ["#440154", "#472d7b", "#3b528b", "#2c728e", "#21918c", "#28ae80", "#5ec962", "#addc30", "#fde725"] },
  { id: "magma", nombre: "Magma", paradas: ["#000004", "#1d1147", "#51127c", "#832681", "#b73779", "#e75263", "#fc8961", "#fec488", "#fcfdbf"] },
  { id: "grises", nombre: "Grises", paradas: ["#000000", "#202020", "#404040", "#606060", "#808080", "#a0a0a0", "#c0c0c0", "#e0e0e0", "#ffffff"] },
];

export const rampaPorId = (id: string): Rampa =>
  RAMPAS.find((r) => r.id === id) ?? RAMPAS[0];

/** Una clase de un ráster discreto. */
export interface ClaseRaster {
  /** Número de clase. En el PNG se guarda como `indice * PASO_CLASE`. */
  indice: number;
  texto: string;
  color: string;
}

interface Comun {
  id: string;
  nombre: string;
  grupo: string;
  /** Ruta servida desde `public/`. */
  archivo: string;
  nota: string;
  ancho: number;
  alto: number;
  /** Esquinas en sentido horario desde la superior izquierda, como las pide MapLibre. */
  esquinas: [[number, number], [number, number], [number, number], [number, number]];
}

export interface RasterClases extends Comun {
  tipo: 'clases';
  clases: ClaseRaster[];
}

export interface RasterContinuo extends Comun {
  tipo: 'continuo';
  /** Id de la rampa con la que nace la capa. */
  rampa: string;
  unidad: string;
  minimo: number;
  maximo: number;
  logaritmico: boolean;
}

export type RasterInfo = RasterClases | RasterContinuo;

export const RASTERS: RasterInfo[] = [
  {
    id: "dem",
    nombre: "Modelo de elevación digital",
    grupo: "Terreno",
    archivo: "rasters/dem.png",
    nota: "Elevación sin recortar, tal como viene del modelo original.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'continuo',
    rampa: "elevacion", unidad: "m s. n. m.",
    minimo: 1046.8, maximo: 3801.7, logaritmico: false,
  },
  {
    id: "dem_calarca",
    nombre: "Elevación de Calarcá",
    grupo: "Terreno",
    archivo: "rasters/dem_calarca.png",
    nota: "El modelo de elevación recortado al municipio.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'continuo',
    rampa: "elevacion", unidad: "m s. n. m.",
    minimo: 1099.8, maximo: 3299.7, logaritmico: false,
  },
  {
    id: "hidrology",
    nombre: "Elevación corregida (hidrología)",
    grupo: "Hidrología",
    archivo: "rasters/hidrology.png",
    nota: "Elevación con las depresiones rellenadas, base del análisis de drenaje.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'continuo',
    rampa: "elevacion", unidad: "m s. n. m.",
    minimo: 1099.9, maximo: 3299.7, logaritmico: false,
  },
  {
    id: "pendiente",
    nombre: "Pendiente",
    grupo: "Terreno",
    archivo: "rasters/pendiente.png",
    nota: "Inclinación del terreno en porcentaje.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'continuo',
    rampa: "calor", unidad: "%",
    minimo: 0.4, maximo: 75.9, logaritmico: false,
  },
  {
    id: "pen_recl",
    nombre: "Pendiente reclasificada",
    grupo: "Terreno",
    archivo: "rasters/pen_recl.png",
    nota: "Cinco clases de pendiente, de menor a mayor.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'clases',
    clases: [
      { indice: 1, texto: "Clase 1 · menor", color: "#1a9850" },
      { indice: 2, texto: "Clase 2", color: "#a6d96a" },
      { indice: 3, texto: "Clase 3", color: "#fee08b" },
      { indice: 4, texto: "Clase 4", color: "#f46d43" },
      { indice: 5, texto: "Clase 5 · mayor", color: "#d73027" },
    ],
  },
  {
    id: "curvatura",
    nombre: "Curvatura",
    grupo: "Terreno",
    archivo: "rasters/curvatura.png",
    nota: "Negativo en laderas cóncavas, positivo en convexas.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'continuo',
    rampa: "divergente", unidad: "1/100 m",
    minimo: -0.45, maximo: 0.45, logaritmico: false,
  },
  {
    id: "curv_recl",
    nombre: "Curvatura reclasificada",
    grupo: "Terreno",
    archivo: "rasters/curv_recl.png",
    nota: "Tres clases de curvatura, de menor a mayor.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'clases',
    clases: [
      { indice: 1, texto: "Clase 1 · menor", color: "#1a9850" },
      { indice: 2, texto: "Clase 2", color: "#fee08b" },
      { indice: 3, texto: "Clase 3 · mayor", color: "#d73027" },
    ],
  },
  {
    id: "flow_acc",
    nombre: "Acumulación de flujo",
    grupo: "Hidrología",
    archivo: "rasters/flow_acc.png",
    nota: "Cuántas celdas drenan hacia cada punto. Escala logarítmica.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'continuo',
    rampa: "azules", unidad: "celdas",
    minimo: 3.8, maximo: 50084.7, logaritmico: true,
  },
  {
    id: "flow_d",
    nombre: "Dirección de flujo",
    grupo: "Hidrología",
    archivo: "rasters/flow_d.png",
    nota: "Rumbo hacia el que drena cada celda, método D8.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'clases',
    clases: [
      { indice: 1, texto: "Este", color: "#e41a1c" },
      { indice: 2, texto: "Sureste", color: "#ff7f00" },
      { indice: 3, texto: "Sur", color: "#ffff33" },
      { indice: 4, texto: "Suroeste", color: "#4daf4a" },
      { indice: 5, texto: "Oeste", color: "#377eb8" },
      { indice: 6, texto: "Noroeste", color: "#984ea3" },
      { indice: 7, texto: "Norte", color: "#a65628" },
      { indice: 8, texto: "Noreste", color: "#f781bf" },
    ],
  },
  {
    id: "distance_eu",
    nombre: "Distancia a ríos",
    grupo: "Hidrología",
    archivo: "rasters/distance_eu.png",
    nota: "Distancia en línea recta hasta el cauce más cercano.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'continuo',
    rampa: "azules_inv", unidad: "m",
    minimo: 0.0, maximo: 11036.8, logaritmico: false,
  },
  {
    id: "distance_rec",
    nombre: "Distancia a ríos reclasificada",
    grupo: "Hidrología",
    archivo: "rasters/distance_rec.png",
    nota: "Cinco clases de distancia, de menor a mayor.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'clases',
    clases: [
      { indice: 1, texto: "Clase 1 · menor", color: "#1a9850" },
      { indice: 2, texto: "Clase 2", color: "#a6d96a" },
      { indice: 3, texto: "Clase 3", color: "#fee08b" },
      { indice: 4, texto: "Clase 4", color: "#f46d43" },
      { indice: 5, texto: "Clase 5 · mayor", color: "#d73027" },
    ],
  },
  {
    id: "rios_prin",
    nombre: "Ríos principales",
    grupo: "Hidrología",
    archivo: "rasters/rios_prin.png",
    nota: "Red de drenaje principal extraída del modelo de elevación.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'clases',
    clases: [
      { indice: 1, texto: "Cauce", color: "#1d70b8" },
    ],
  },
  {
    id: "super_pon",
    nombre: "Amenaza por remoción en masa",
    grupo: "Resultado",
    archivo: "rasters/super_pon.png",
    nota: "Resultado de la superposición ponderada de los factores anteriores.",
    ancho: 920, alto: 861,
    esquinas: [
      [-75.80492106, 4.57043499],
      [-75.55573574, 4.57043499],
      [-75.55573574, 4.33723003],
      [-75.80492106, 4.33723003],
    ],
    tipo: 'clases',
    clases: [
      { indice: 1, texto: "Clase 1 · menor", color: "#1a9850" },
      { indice: 2, texto: "Clase 2", color: "#fee08b" },
      { indice: 3, texto: "Clase 3 · mayor", color: "#d73027" },
    ],
  },
];

/** Los grupos en el orden en que se muestran en el panel. */
export const GRUPOS_RASTER = ["Terreno", "Hidrología", "Resultado"] as const;
