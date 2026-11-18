/** Funciones puras de brújula: rumbo entre coordenadas y orientación del teléfono. */

const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

/** Lleva cualquier ángulo al rango [0, 360). */
export function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Diferencia con signo para ir del ángulo `from` al ángulo `to`, en el rango [-180, 180).
 * Ej.: de 350° a 10° son +20° (no -340°).
 */
export function angleDiff(from: number, to: number): number {
  return normalize(to - from + 180) - 180;
}

/**
 * Rumbo inicial (azimut) desde el punto 1 hacia el punto 2, en grados desde el norte
 * geográfico, en sentido horario. 0 = norte, 90 = este, 180 = sur, 270 = oeste.
 */
export function bearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lng2 - lng1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalize(toDeg(Math.atan2(y, x)));
}

/**
 * Hacia dónde apunta la parte superior del teléfono (grados desde el norte, horario),
 * a partir de `alpha` del evento `deviceorientationabsolute`.
 *
 * `alpha` crece en sentido ANTIhorario (regla de la mano derecha sobre el eje Z), por eso
 * el rumbo es 360 - alpha. `screenAngle` corrige si la pantalla está girada (horizontal).
 * Es exacto con el teléfono horizontal (boca arriba), como una brújula de mano.
 */
export function headingFromAlpha(alpha: number, screenAngle = 0): number {
  return normalize(360 - alpha + screenAngle);
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];

/** Punto cardinal más cercano: 0 -> N, 45 -> NE, 225 -> SO... */
export function cardinal(deg: number): string {
  return CARDINALS[Math.round(normalize(deg) / 45) % 8];
}

/**
 * Filtro paso-bajo para ángulos. El magnetómetro es ruidoso; esto suaviza la aguja.
 * Promedia por el camino corto (no salta de 359° a 0° dando la vuelta completa).
 */
export class AngleSmoother {
  private current?: number;

  constructor(private readonly factor = 0.2) {}

  next(deg: number): number {
    this.current =
      this.current === undefined
        ? normalize(deg)
        : normalize(this.current + angleDiff(this.current, deg) * this.factor);
    return this.current;
  }
}
