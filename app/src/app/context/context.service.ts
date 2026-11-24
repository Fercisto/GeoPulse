import { computed, Injectable, signal } from '@angular/core';
import { Device } from '@capacitor/device';
import type { ConnectionStatus } from '@capacitor/network';
import { Network } from '@capacitor/network';

import type { Place } from '../services/api.service';

import type { AppContext, ConnectionType, Decision } from './rules';
import { evaluate, findZone } from './rules';

/** Valores forzados desde la pantalla "Reglas" para probar escenarios (null = usar el real). */
export interface ContextOverrides {
  inZone: boolean | null;
  online: boolean | null;
  batteryLevel: number | null;
  charging: boolean | null;
}

const NO_OVERRIDES: ContextOverrides = { inZone: null, online: null, batteryLevel: null, charging: null };
/** La batería no tiene evento de cambio en Capacitor: se consulta cada 30 s. */
const BATTERY_POLL_MS = 30000;

/**
 * Reúne las variables de contexto y expone la decisión del motor de reglas.
 *
 * - Zona: la pantalla principal informa la posición y los lugares (setPosition / setPlaces).
 * - Conexión: @capacitor/network (evento networkStatusChange).
 * - Batería: @capacitor/device (getBatteryInfo).
 */
@Injectable({ providedIn: 'root' })
export class ContextService {
  // Valores reales leídos de los sensores
  readonly position = signal<{ lat: number; lng: number } | null>(null);
  readonly places = signal<Place[]>([]);
  readonly realOnline = signal(true);
  readonly realConnectionType = signal<ConnectionType>('unknown');
  readonly realBatteryLevel = signal<number | null>(null);
  readonly realCharging = signal(false);

  /** Simulación para los escenarios de prueba. */
  readonly overrides = signal<ContextOverrides>(NO_OVERRIDES);
  readonly simulating = computed(() => Object.values(this.overrides()).some((v) => v !== null));

  readonly realZone = computed(() => findZone(this.position(), this.places()));

  /** Contexto efectivo: el real, salvo lo que se esté simulando. */
  readonly context = computed<AppContext>(() => {
    const o = this.overrides();
    const real = this.realZone();
    const fakeZone = this.places()[0] ?? { id: 0, name: 'Zona simulada' };
    const online = o.online ?? this.realOnline();
    return {
      zone: o.inZone === null ? real : o.inZone ? (real ?? fakeZone) : null,
      online,
      connectionType: o.online === null ? this.realConnectionType() : online ? 'wifi' : 'none',
      batteryLevel: o.batteryLevel ?? this.realBatteryLevel(),
      charging: o.charging ?? this.realCharging(),
    };
  });

  readonly decision = computed<Decision>(() => evaluate(this.context()));

  private started = false;

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    this.applyNetwork(await Network.getStatus());
    await Network.addListener('networkStatusChange', (status) => this.applyNetwork(status));

    await this.readBattery();
    setInterval(() => this.readBattery(), BATTERY_POLL_MS);
  }

  setPosition(lat: number, lng: number): void {
    this.position.set({ lat, lng });
  }

  setPlaces(places: Place[]): void {
    this.places.set(places);
  }

  setOverride<K extends keyof ContextOverrides>(key: K, value: ContextOverrides[K]): void {
    this.overrides.update((o) => ({ ...o, [key]: value }));
  }

  clearOverrides(): void {
    this.overrides.set(NO_OVERRIDES);
  }

  private applyNetwork(status: ConnectionStatus): void {
    this.realOnline.set(status.connected);
    this.realConnectionType.set(status.connectionType);
  }

  private async readBattery(): Promise<void> {
    try {
      const info = await Device.getBatteryInfo();
      this.realBatteryLevel.set(info.batteryLevel ?? null);
      this.realCharging.set(info.isCharging ?? false);
    } catch {
      this.realBatteryLevel.set(null); // navegador sin Battery API
    }
  }
}
