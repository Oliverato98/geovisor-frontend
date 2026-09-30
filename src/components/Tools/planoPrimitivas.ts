/**
 * components/Tools/planoPrimitivas.ts
 * Figuras del compositor de planos, descritas una sola vez.
 *
 * Cada figura se define como una lista de primitivas en milímetros. La misma lista
 * se dibuja en pantalla (SVG) y en el PDF (jsPDF), así que la previsualización y el
 * archivo descargado siempre coinciden.
 */

export interface Prim {
  k: 'poly' | 'line' | 'circle' | 'rect' | 'text';
  pts?: Array<[number, number]>;      // poly
  x?: number; y?: number;             // line (inicio), rect, text
  x2?: number; y2?: number;           // line (fin)
  w?: number; h?: number;             // rect
  cx?: number; cy?: number; r?: number;
  relleno?: boolean;                  // true: relleno con el color; false: solo contorno
  blanco?: boolean;                   // relleno blanco (barras alternas)
  lw?: number;                        // grosor de línea en mm
  txt?: string;
  size?: number;                      // pt
  align?: 'left' | 'center' | 'right';
  bold?: boolean;
}

/* ----------------------------------------------------------- flechas de norte */

export const ESTILOS_NORTE = [
  'Flecha partida', 'Aguja fina', 'Flecha sólida',
  'Rosa de 4 puntas', 'Círculo con N', 'Triángulo simple',
] as const;

/** h = alto total en mm; el origen (0,0) es la punta superior */
export function figuraNorte(estilo: number, h: number): Prim[] {
  const a = h * 0.20;            // semiancho
  const cuerpo = h * 0.62;       // alto de la flecha sin la letra
  const txt: Prim = {
    k: 'text', x: 0, y: h * 0.97, txt: 'N',
    size: Math.max(5, h * 1.2), align: 'center', bold: true,
  };

  switch (estilo) {
    case 1: // aguja fina
      return [
        { k: 'poly', pts: [[0, 0], [-a * 0.45, cuerpo], [0, cuerpo * 0.78]], relleno: true },
        { k: 'poly', pts: [[0, 0], [a * 0.45, cuerpo], [0, cuerpo * 0.78]], relleno: false, lw: 0.25 },
        { k: 'line', x: 0, y: cuerpo * 0.2, x2: 0, y2: cuerpo, lw: 0.25 },
        txt,
      ];
    case 2: // flecha sólida con cola
      return [
        { k: 'poly', pts: [[0, 0], [-a, cuerpo * 0.45], [-a * 0.42, cuerpo * 0.45], [-a * 0.42, cuerpo], [a * 0.42, cuerpo], [a * 0.42, cuerpo * 0.45], [a, cuerpo * 0.45]], relleno: true },
        txt,
      ];
    case 3: // rosa de 4 puntas
      return [
        { k: 'poly', pts: [[0, 0], [a * 0.3, cuerpo * 0.5], [0, cuerpo], [-a * 0.3, cuerpo * 0.5]], relleno: true },
        { k: 'poly', pts: [[-a, cuerpo * 0.5], [0, cuerpo * 0.5 - a * 0.3], [a, cuerpo * 0.5], [0, cuerpo * 0.5 + a * 0.3]], relleno: false, lw: 0.25 },
        txt,
      ];
    case 4: // círculo con N
      return [
        { k: 'circle', cx: 0, cy: cuerpo * 0.5, r: cuerpo * 0.5, relleno: false, lw: 0.3 },
        { k: 'poly', pts: [[0, cuerpo * 0.12], [-a * 0.4, cuerpo * 0.62], [0, cuerpo * 0.48], [a * 0.4, cuerpo * 0.62]], relleno: true },
        txt,
      ];
    case 5: // triángulo simple
      return [
        { k: 'poly', pts: [[0, 0], [-a, cuerpo], [a, cuerpo]], relleno: true },
        txt,
      ];
    default: // 0 - flecha partida (mitad rellena, mitad contorno)
      return [
        { k: 'poly', pts: [[0, 0], [-a, cuerpo], [0, cuerpo * 0.72]], relleno: true },
        { k: 'poly', pts: [[0, 0], [a, cuerpo], [0, cuerpo * 0.72]], relleno: false, lw: 0.3 },
        txt,
      ];
  }
}

/* ----------------------------------------------------------- barras de escala */

export const ESTILOS_ESCALA = [
  'Alternante simple', 'Alternante doble', 'Hueca',
  'Línea de escala', 'Escalonada',
] as const;

/**
 * largo = mm de la barra; metros = valor total representado.
 * El origen (0,0) es la esquina superior izquierda de la barra.
 */
export function figuraEscala(
  estilo: number, largo: number, metros: number, tam: number, fmt: (n: number) => string
): Prim[] {
  const alto = 2;
  const t = largo / 4;
  const prims: Prim[] = [];
  const etiquetas = (y: number, divisiones: number) => {
    for (let i = 0; i <= divisiones; i++) {
      prims.push({
        k: 'text', x: (largo / divisiones) * i, y,
        txt: i === divisiones ? `${fmt(metros)} m` : fmt((metros / divisiones) * i),
        size: tam, align: i === 0 ? 'left' : i === divisiones ? 'center' : 'center',
      });
    }
  };

  switch (estilo) {
    case 1: // alternante doble (dos filas)
      for (let i = 0; i < 4; i++) {
        prims.push({ k: 'rect', x: i * t, y: 0, w: t, h: alto / 2, relleno: i % 2 === 0, blanco: i % 2 !== 0, lw: 0.2 });
        prims.push({ k: 'rect', x: i * t, y: alto / 2, w: t, h: alto / 2, relleno: i % 2 !== 0, blanco: i % 2 === 0, lw: 0.2 });
      }
      etiquetas(alto + tam * 0.36 * 1.4, 4);
      return prims;

    case 2: // hueca
      prims.push({ k: 'rect', x: 0, y: 0, w: largo, h: alto, relleno: false, lw: 0.3 });
      for (let i = 0; i < 4; i += 2) prims.push({ k: 'rect', x: i * t, y: 0, w: t, h: alto, relleno: true });
      etiquetas(alto + tam * 0.36 * 1.4, 4);
      return prims;

    case 3: // línea de escala con marcas
      prims.push({ k: 'line', x: 0, y: alto, x2: largo, y2: alto, lw: 0.35 });
      for (let i = 0; i <= 4; i++) prims.push({ k: 'line', x: i * t, y: alto - 1.4, x2: i * t, y2: alto, lw: 0.3 });
      etiquetas(alto + tam * 0.36 * 1.4, 4);
      return prims;

    case 4: // escalonada
      for (let i = 0; i < 4; i++) {
        const h = alto * (i % 2 === 0 ? 1 : 0.55);
        prims.push({ k: 'rect', x: i * t, y: alto - h, w: t, h, relleno: i % 2 === 0, blanco: i % 2 !== 0, lw: 0.2 });
      }
      etiquetas(alto + tam * 0.36 * 1.4, 4);
      return prims;

    default: // 0 - alternante simple
      for (let i = 0; i < 4; i++) {
        prims.push({ k: 'rect', x: i * t, y: 0, w: t, h: alto, relleno: i % 2 === 0, blanco: i % 2 !== 0, lw: 0.2 });
      }
      etiquetas(alto + tam * 0.36 * 1.4, 4);
      return prims;
  }
}

/* --------------------------------------------------------------- gráficos */

export function figuraGrafico(
  tipo: 'linea' | 'flecha' | 'rect' | 'elipse', w: number, h: number, grosor: number, relleno: boolean
): Prim[] {
  switch (tipo) {
    case 'linea':
      return [{ k: 'line', x: 0, y: 0, x2: w, y2: h, lw: grosor }];
    case 'flecha': {
      const ang = Math.atan2(h, w);
      const cab = Math.max(2, grosor * 4);
      return [
        { k: 'line', x: 0, y: 0, x2: w, y2: h, lw: grosor },
        { k: 'poly', relleno: true, pts: [
          [w, h],
          [w - cab * Math.cos(ang - 0.4), h - cab * Math.sin(ang - 0.4)],
          [w - cab * Math.cos(ang + 0.4), h - cab * Math.sin(ang + 0.4)],
        ] },
      ];
    }
    case 'rect':
      return [{ k: 'rect', x: 0, y: 0, w, h, relleno, lw: grosor }];
    default:
      return [{ k: 'circle', cx: w / 2, cy: h / 2, r: Math.min(w, h) / 2, relleno, lw: grosor }];
  }
}

/* --------------------------------------------------------- texto dinámico */

export const CAMPOS_DINAMICOS: Array<{ token: string; nombre: string }> = [
  { token: '{escala}', nombre: 'Escala numérica' },
  { token: '{fecha}', nombre: 'Fecha de hoy' },
  { token: '{sistema}', nombre: 'Sistema de referencia' },
  { token: '{proyeccion}', nombre: 'Proyección' },
  { token: '{entidad}', nombre: 'Entidad' },
  { token: '{elaboro}', nombre: 'Elaboró' },
  { token: '{fuente}', nombre: 'Fuente' },
  { token: '{capas}', nombre: 'Capas visibles' },
  { token: '{n_capas}', nombre: 'Número de capas' },
  { token: '{grilla}', nombre: 'Espaciado de grilla' },
  { token: '{sup_izq}', nombre: 'Coordenada superior izquierda' },
  { token: '{sup_der}', nombre: 'Coordenada superior derecha' },
  { token: '{inf_izq}', nombre: 'Coordenada inferior izquierda' },
  { token: '{inf_der}', nombre: 'Coordenada inferior derecha' },
  { token: '{centro}', nombre: 'Coordenada del centro' },
];

export interface Contexto {
  escala: number;
  fecha: string;
  entidad: string;
  elaboro: string;
  fuente: string;
  capas: string[];
  grilla: string;
  esquinas: { si: string; sd: string; ii: string; id: string; centro: string };
}

export function resolverTexto(txt: string, c: Contexto): string {
  return (txt ?? '')
    .replace(/\{escala\}/g, `1:${c.escala.toLocaleString('es-CO')}`)
    .replace(/\{fecha\}/g, c.fecha)
    .replace(/\{sistema\}/g, 'MAGNA-SIRGAS / Origen Nacional')
    .replace(/\{proyeccion\}/g, 'CTM12 — EPSG:9377')
    .replace(/\{entidad\}/g, c.entidad)
    .replace(/\{elaboro\}/g, c.elaboro || '—')
    .replace(/\{fuente\}/g, c.fuente)
    .replace(/\{capas\}/g, c.capas.join(', ') || '—')
    .replace(/\{n_capas\}/g, String(c.capas.length))
    .replace(/\{grilla\}/g, c.grilla)
    .replace(/\{sup_izq\}/g, c.esquinas.si)
    .replace(/\{sup_der\}/g, c.esquinas.sd)
    .replace(/\{inf_izq\}/g, c.esquinas.ii)
    .replace(/\{inf_der\}/g, c.esquinas.id)
    .replace(/\{centro\}/g, c.esquinas.centro);
}
