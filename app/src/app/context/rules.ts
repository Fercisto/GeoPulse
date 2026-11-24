/**
 * Motor de reglas de contexto.
 *
 * Entrada: las variables de contexto (zona, conexión y batería).
 * Salida: qué funciones de la app se habilitan o cambian.
 *
 * Es una función pura (sin efectos secundarios): con el mismo contexto siempre da la misma
 * decisión, lo que permite probar cada escenario con pruebas unitarias.
 */

export type ConnectionType = 'wifi' | 'cellular' | 'none' | 'unknown';

export interface AppContext {
  /** Variable 1: lugar guardado dentro de cuyo radio estás (null = fuera de toda zona). */
  zone: { id: number; name: string } | null;
  /** Variable 2: conexión a internet. */
  online: boolean;
  connectionType: ConnectionType;
  /** Variable 3: batería, de 0 a 1 (null = desconocida, ej. navegador sin Battery API). */
  batteryLevel: number | null;
  charging: boolean;
}

export interface Decision {
  /** R1: sin internet, las funciones que usan el servidor se desactivan y la ubicación se encola. */
  offlineMode: boolean;
  /** R2: dentro de una zona y con internet, se habilita el check-in. */
  checkInEnabled: boolean;
  /** R3: con batería baja y sin cargar, el seguimiento reduce su frecuencia. */
  powerSaving: boolean;
  /** Metros entre lecturas del seguimiento en segundo plano. */
  trackingDistanceFilter: number;
  /** Ids de las reglas que se cumplieron (para mostrarlas en pantalla). */
  activeRules: RuleId[];
}

export type RuleId = 'R1' | 'R2' | 'R3';

export interface RuleInfo {
  id: RuleId;
  name: string;
  condition: string;
  action: string;
}

/** Umbral de batería baja (20 %). */
export const LOW_BATTERY = 0.2;
export const NORMAL_DISTANCE_FILTER = 10;
export const SAVING_DISTANCE_FILTER = 50;

export const RULES: RuleInfo[] = [
  {
    id: 'R1',
    name: 'Modo sin conexión',
    condition: 'No hay conexión a internet',
    action:
      'Se desactivan guardar y borrar lugares; las ubicaciones se guardan en una cola local y se envían al volver la conexión',
  },
  {
    id: 'R2',
    name: 'Check-in en zona',
    condition: 'Estás dentro del radio de un lugar guardado Y hay conexión a internet',
    action: 'Se habilita el botón "Hacer check-in", que envía una notificación por Gotify',
  },
  {
    id: 'R3',
    name: 'Ahorro de batería',
    condition: `Batería menor a ${LOW_BATTERY * 100} % Y no se está cargando`,
    action: `El seguimiento lee la ubicación cada ${SAVING_DISTANCE_FILTER} m en lugar de cada ${NORMAL_DISTANCE_FILTER} m`,
  },
];

export function evaluate(ctx: AppContext): Decision {
  const r1 = !ctx.online;
  const r2 = ctx.zone !== null && ctx.online;
  const r3 = ctx.batteryLevel !== null && ctx.batteryLevel < LOW_BATTERY && !ctx.charging;

  const activeRules: RuleId[] = [];
  if (r1) activeRules.push('R1');
  if (r2) activeRules.push('R2');
  if (r3) activeRules.push('R3');

  return {
    offlineMode: r1,
    checkInEnabled: r2,
    powerSaving: r3,
    trackingDistanceFilter: r3 ? SAVING_DISTANCE_FILTER : NORMAL_DISTANCE_FILTER,
    activeRules,
  };
}

/** Lugar guardado más cercano dentro de cuyo radio está la posición (o null). */
export function findZone<T extends { id: number; name: string; lat: number; lng: number; radius: number }>(
  position: { lat: number; lng: number } | null,
  places: T[],
): T | null {
  if (!position) return null;
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const place of places) {
    const d = distanceMeters(position.lat, position.lng, place.lat, place.lng);
    if (d <= place.radius && d < bestDistance) {
      best = place;
      bestDistance = d;
    }
  }
  return best;
}

/** Distancia en metros entre dos coordenadas (fórmula de Haversine). */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number): number => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}
