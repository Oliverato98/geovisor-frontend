/**
 * data/rasters.ts
 * Catálogo de las capas ráster del estudio de amenaza por remoción en masa.
 *
 * Cada grid de ArcInfo se reproyectó a WGS84 y se exportó como PNG con los
 * nodata transparentes, así que MapLibre puede anclarlo por sus cuatro esquinas
 * sin deformarlo. Las imágenes viven en `public/rasters/`.
 */

/** Una entrada de leyenda para un ráster de clases discretas. */
export interface ClaseRaster {
  color: string;
  texto: string;
}

export interface RasterInfo {
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
  /** Presente solo en los ráster de clases. */
  leyenda?: ClaseRaster[];
  /** Los siguientes solo en los ráster continuos. */
  muestras?: string[];
  unidad?: string;
  minimo?: number;
  maximo?: number;
  logaritmico?: boolean;
}

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
    muestras: ["#333399", "#0888ee", "#01cc66", "#81e680", "#fefe98", "#beac76", "#815e56", "#c1b0ac", "#ffffff"],
    unidad: "m s. n. m.",
    minimo: 1046.76, maximo: 3801.74, logaritmico: false,
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
    muestras: ["#333399", "#0888ee", "#01cc66", "#81e680", "#fefe98", "#beac76", "#815e56", "#c1b0ac", "#ffffff"],
    unidad: "m s. n. m.",
    minimo: 1099.79, maximo: 3299.68, logaritmico: false,
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
    muestras: ["#333399", "#0888ee", "#01cc66", "#81e680", "#fefe98", "#beac76", "#815e56", "#c1b0ac", "#ffffff"],
    unidad: "m s. n. m.",
    minimo: 1099.86, maximo: 3299.68, logaritmico: false,
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
    muestras: ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8c3c", "#fc4d2a", "#e2191c", "#bb0026", "#800026"],
    unidad: "%",
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
    leyenda: [
      { color: "#1a9850", texto: "Clase 1 · menor" },
      { color: "#a6d96a", texto: "Clase 2" },
      { color: "#fee08b", texto: "Clase 3" },
      { color: "#f46d43", texto: "Clase 4" },
      { color: "#d73027", texto: "Clase 5 · mayor" },
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
    muestras: ["#053061", "#2a71b2", "#6bacd1", "#c2ddec", "#f7f6f6", "#fbccb4", "#e48066", "#ba2832", "#67001f"],
    unidad: "1/100 m",
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
    leyenda: [
      { color: "#1a9850", texto: "Clase 1 · menor" },
      { color: "#fee08b", texto: "Clase 2" },
      { color: "#d73027", texto: "Clase 3 · mayor" },
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
    muestras: ["#f7fbff", "#deebf7", "#c6dbef", "#9dcae1", "#6aaed6", "#4191c6", "#2070b4", "#08509b", "#08306b"],
    unidad: "celdas",
    minimo: 0.68, maximo: 4.7, logaritmico: true,
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
    leyenda: [
      { color: "#e41a1c", texto: "Este" },
      { color: "#ff7f00", texto: "Sureste" },
      { color: "#ffff33", texto: "Sur" },
      { color: "#4daf4a", texto: "Suroeste" },
      { color: "#377eb8", texto: "Oeste" },
      { color: "#984ea3", texto: "Noroeste" },
      { color: "#a65628", texto: "Norte" },
      { color: "#f781bf", texto: "Noreste" },
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
    muestras: ["#08306b", "#08519c", "#2171b5", "#4292c6", "#6caed6", "#9fcae1", "#c7dbef", "#dfebf7", "#f7fbff"],
    unidad: "m",
    minimo: 0.0, maximo: 11036.79, logaritmico: false,
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
    leyenda: [
      { color: "#1a9850", texto: "Clase 1 · menor" },
      { color: "#a6d96a", texto: "Clase 2" },
      { color: "#fee08b", texto: "Clase 3" },
      { color: "#f46d43", texto: "Clase 4" },
      { color: "#d73027", texto: "Clase 5 · mayor" },
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
    leyenda: [
      { color: "#1d70b8", texto: "Cauce" },
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
    leyenda: [
      { color: "#1a9850", texto: "Clase 1 · menor" },
      { color: "#fee08b", texto: "Clase 2" },
      { color: "#d73027", texto: "Clase 3 · mayor" },
    ],
  },
];

/** Los grupos en el orden en que se muestran en el panel. */
export const GRUPOS_RASTER = ["Terreno", "Hidrología", "Resultado"] as const;
