import type { AppContext } from './rules';
import { evaluate, findZone, NORMAL_DISTANCE_FILTER, SAVING_DISTANCE_FILTER } from './rules';

const universidad = { id: 1, name: 'Universidad', lat: 24.0277, lng: -104.6532, radius: 50 };
const casa = { id: 2, name: 'Casa', lat: 24.04, lng: -104.66, radius: 50 };

function ctx(overrides: Partial<AppContext>): AppContext {
  return { zone: null, online: true, connectionType: 'wifi', batteryLevel: 0.8, charging: false, ...overrides };
}

describe('reglas de contexto', () => {
  it('Escenario 1: en la universidad con internet y buena batería -> solo R2 (check-in)', () => {
    const d = evaluate(ctx({ zone: universidad }));
    expect(d.activeRules).toEqual(['R2']);
    expect(d.checkInEnabled).toBe(true);
    expect(d.offlineMode).toBe(false);
    expect(d.trackingDistanceFilter).toBe(NORMAL_DISTANCE_FILTER);
  });

  it('Escenario 2: en la universidad SIN internet -> R1, y el check-in se bloquea', () => {
    const d = evaluate(ctx({ zone: universidad, online: false, connectionType: 'none' }));
    expect(d.activeRules).toEqual(['R1']);
    expect(d.offlineMode).toBe(true);
    expect(d.checkInEnabled).toBe(false);
  });

  it('Escenario 3: fuera de zona con batería al 15 % sin cargar -> R3 (ahorro)', () => {
    const d = evaluate(ctx({ batteryLevel: 0.15 }));
    expect(d.activeRules).toEqual(['R3']);
    expect(d.powerSaving).toBe(true);
    expect(d.trackingDistanceFilter).toBe(SAVING_DISTANCE_FILTER);
  });

  it('Escenario 4: batería al 15 % pero cargando -> no hay ahorro', () => {
    const d = evaluate(ctx({ batteryLevel: 0.15, charging: true }));
    expect(d.powerSaving).toBe(false);
    expect(d.activeRules).toEqual([]);
  });

  it('Escenario 5: en zona, con internet y batería baja -> R2 y R3 a la vez', () => {
    const d = evaluate(ctx({ zone: universidad, batteryLevel: 0.1 }));
    expect(d.activeRules).toEqual(['R2', 'R3']);
  });

  it('Escenario 6: sin internet y batería baja -> R1 y R3 a la vez', () => {
    const d = evaluate(ctx({ online: false, connectionType: 'none', batteryLevel: 0.1 }));
    expect(d.activeRules).toEqual(['R1', 'R3']);
  });

  it('batería desconocida (navegador sin Battery API) no activa el ahorro', () => {
    expect(evaluate(ctx({ batteryLevel: null })).powerSaving).toBe(false);
  });

  it('justo en el límite del 20 % no activa el ahorro (debe ser menor)', () => {
    expect(evaluate(ctx({ batteryLevel: 0.2 })).powerSaving).toBe(false);
  });

  it('detecta la zona solo dentro del radio', () => {
    expect(findZone({ lat: 24.0278, lng: -104.6532 }, [universidad, casa])?.name).toBe('Universidad'); // ~11 m
    expect(findZone({ lat: 24.0285, lng: -104.6532 }, [universidad, casa])).toBeNull(); // ~89 m
    expect(findZone(null, [universidad])).toBeNull();
  });
});
