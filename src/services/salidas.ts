/**
 * services/salidas.ts
 * Guarda los planos generados dentro del navegador.
 *
 * Un plano en A3 a 200 ppp pesa varios megabytes, muy por encima de lo que
 * admite `localStorage`, así que van a IndexedDB, que sí guarda archivos
 * grandes. Viven en el equipo de quien los generó: no viajan al servidor ni
 * los ve nadie más.
 */

const BASE = 'geovisor-salidas';
const ALMACEN = 'planos';
const VERSION = 1;

export interface Salida {
  id: string;
  nombre: string;
  /** Fecha de creación en ISO, para ordenar y mostrar. */
  creado: string;
  escala: number;
  papel: string;
  /** Nombres de las capas que llevaba el plano. */
  capas: string[];
  pesoBytes: number;
  pdf: Blob;
}

/** Lo mismo pero sin el archivo: basta para pintar la lista. */
export type SalidaResumen = Omit<Salida, 'pdf'>;

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, fallo) => {
    const req = indexedDB.open(BASE, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ALMACEN)) {
        db.createObjectStore(ALMACEN, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fallo(req.error ?? new Error('No se pudo abrir el almacén de planos.'));
  });
}

function enTransaccion<T>(
  modo: IDBTransactionMode,
  trabajo: (almacen: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return abrir().then((db) => new Promise<T>((ok, fallo) => {
    const tx = db.transaction(ALMACEN, modo);
    const req = trabajo(tx.objectStore(ALMACEN));
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fallo(req.error ?? new Error('Falló la operación sobre el almacén.'));
    tx.oncomplete = () => db.close();
  }));
}

export async function guardarSalida(
  datos: Omit<Salida, 'id' | 'creado' | 'pesoBytes'>
): Promise<Salida> {
  const salida: Salida = {
    ...datos,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    creado: new Date().toISOString(),
    pesoBytes: datos.pdf.size,
  };
  await enTransaccion('readwrite', (a) => a.put(salida));
  return salida;
}

/** Las salidas de la más reciente a la más antigua, sin cargar los archivos. */
export async function listarSalidas(): Promise<SalidaResumen[]> {
  const todas = await enTransaccion<Salida[]>('readonly', (a) => a.getAll());
  return todas
    .map(({ pdf, ...resto }) => resto)
    .sort((x, y) => y.creado.localeCompare(x.creado));
}

export async function obtenerSalida(id: string): Promise<Salida | undefined> {
  return enTransaccion<Salida | undefined>('readonly', (a) => a.get(id));
}

export async function borrarSalida(id: string): Promise<void> {
  await enTransaccion('readwrite', (a) => a.delete(id));
}

export async function renombrarSalida(id: string, nombre: string): Promise<void> {
  const salida = await obtenerSalida(id);
  if (!salida) return;
  await enTransaccion('readwrite', (a) => a.put({ ...salida, nombre }));
}

/** Cuánto ocupan todas las salidas juntas. */
export async function pesoTotal(): Promise<number> {
  const lista = await listarSalidas();
  return lista.reduce((suma, s) => suma + s.pesoBytes, 0);
}

export function formatearPeso(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** Descarga un archivo ya guardado, o uno recién generado. */
export function descargar(pdf: Blob, nombre: string) {
  const url = URL.createObjectURL(pdf);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre.toLowerCase().endsWith('.pdf') ? nombre : `${nombre}.pdf`;
  a.click();
  // El objeto se libera después de que el navegador tomó el archivo.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
