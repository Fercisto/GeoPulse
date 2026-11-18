import { AngleSmoother, angleDiff, bearing, cardinal, headingFromAlpha, normalize } from './compass';

describe('compass', () => {
  it('normaliza ángulos a [0, 360)', () => {
    expect(normalize(370)).toBe(10);
    expect(normalize(-90)).toBe(270);
    expect(normalize(360)).toBe(0);
  });

  it('calcula la diferencia por el camino corto', () => {
    expect(angleDiff(350, 10)).toBe(20);
    expect(angleDiff(10, 350)).toBe(-20);
    expect(angleDiff(0, 90)).toBe(90);
  });

  it('calcula el rumbo hacia los puntos cardinales', () => {
    expect(bearing(0, 0, 1, 0)).toBeCloseTo(0, 5); // norte
    expect(bearing(0, 0, 0, 1)).toBeCloseTo(90, 5); // este
    expect(bearing(0, 0, -1, 0)).toBeCloseTo(180, 5); // sur
    expect(bearing(0, 0, 0, -1)).toBeCloseTo(270, 5); // oeste
  });

  it('calcula un rumbo real (CDMX -> Durango, hacia el noroeste)', () => {
    const b = bearing(19.4326, -99.1332, 24.0277, -104.6532);
    expect(b).toBeGreaterThan(300);
    expect(b).toBeLessThan(320);
    expect(cardinal(b)).toBe('NO');
  });

  it('convierte alpha (antihorario) en rumbo (horario)', () => {
    expect(headingFromAlpha(0)).toBe(0); // apunta al norte
    expect(headingFromAlpha(90)).toBe(270); // girado 90° a la izquierda -> oeste
    expect(headingFromAlpha(270)).toBe(90); // girado 90° a la derecha -> este
    expect(headingFromAlpha(0, 90)).toBe(90); // pantalla horizontal
  });

  it('nombra los puntos cardinales', () => {
    expect(cardinal(0)).toBe('N');
    expect(cardinal(44)).toBe('NE');
    expect(cardinal(180)).toBe('S');
    expect(cardinal(359)).toBe('N');
  });

  it('suaviza sin dar la vuelta completa entre 359° y 0°', () => {
    const s = new AngleSmoother(0.5);
    s.next(350);
    expect(s.next(10)).toBe(0); // a medio camino por el lado corto
  });
});
