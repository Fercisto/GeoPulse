import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Motion } from '@capacitor/motion';
import {
  IonBackButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonNote,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import type { Place } from '../services/api.service';
import { ApiService } from '../services/api.service';
import type { LocationError } from '../services/location.service';
import { LocationService } from '../services/location.service';

import { AngleSmoother, angleDiff, bearing, cardinal, headingFromAlpha, normalize } from './compass';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface OrientationData {
  alpha: number;
  beta: number;
  gamma: number;
  absolute: boolean;
}

/** Margen (grados) para considerar que vas "en la dirección correcta". */
const ON_TARGET = 15;
/** Cada cuánto (ms) se refresca la pantalla; los sensores emiten ~60 eventos/s. */
const UI_REFRESH = 100;

@Component({
  selector: 'app-sensors',
  templateUrl: 'sensors.page.html',
  styleUrls: ['sensors.page.scss'],
  imports: [
    DecimalPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonSelect,
    IonSelectOption,
    IonNote,
  ],
})
export class SensorsPage {
  private readonly api = inject(ApiService);
  private readonly location = inject(LocationService);

  // Datos mostrados en pantalla
  readonly places = signal<Place[]>([]);
  readonly target = signal<Place | null>(null);
  readonly position = signal<{ lat: number; lng: number; accuracy: number } | null>(null);
  readonly orientation = signal<OrientationData | null>(null);
  readonly heading = signal<number | null>(null);
  readonly accel = signal<Vec3 | null>(null);
  readonly accelGravity = signal<Vec3 | null>(null);
  readonly rotationRate = signal<{ alpha: number; beta: number; gamma: number } | null>(null);
  readonly eventsPerSecond = signal(0);
  readonly sensorError = signal<string | null>(null);
  readonly gpsError = signal<string | null>(null);

  /** Rumbo desde mi posición hacia el lugar elegido (grados desde el norte). */
  readonly targetBearing = computed(() => {
    const pos = this.position();
    const t = this.target();
    return pos && t ? bearing(pos.lat, pos.lng, t.lat, t.lng) : null;
  });

  readonly distance = computed(() => {
    const pos = this.position();
    const t = this.target();
    return pos && t ? haversine(pos.lat, pos.lng, t.lat, t.lng) : null;
  });

  /** Cuánto hay que girar (con signo) para quedar de frente al lugar. */
  readonly turn = computed(() => {
    const h = this.heading();
    const b = this.targetBearing();
    return h !== null && b !== null ? angleDiff(h, b) : null;
  });

  readonly onTarget = computed(() => {
    const t = this.turn();
    return t !== null && Math.abs(t) <= ON_TARGET;
  });

  /** Magnitud de la aceleración sin gravedad: ~0 quieto, sube al caminar o agitar. */
  readonly accelMagnitude = computed(() => {
    const a = this.accel();
    return a ? Math.hypot(a.x, a.y, a.z) : null;
  });

  // Rotaciones "continuas" para la animación CSS (evitan el giro de 359° -> 0°)
  readonly dialRotation = signal(0);
  readonly arrowRotation = signal(0);

  readonly cardinal = cardinal;

  private readonly smoother = new AngleSmoother(0.25);
  private latest: {
    orientation?: OrientationData;
    heading?: number;
    accel?: Vec3;
    accelGravity?: Vec3;
    rotationRate?: { alpha: number; beta: number; gamma: number };
  } = {};
  private eventCount = 0;
  private lastRateCheck = 0;
  private wasOnTarget = false;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private noSensorTimer?: ReturnType<typeof setTimeout>;
  private motionHandle?: PluginListenerHandle;
  private gpsWatchId?: string;
  private orientationEvent = 'deviceorientationabsolute';
  private readonly orientationHandler = (e: DeviceOrientationEvent): void => this.onOrientation(e);

  // ---- Ciclo de vida de Ionic: los sensores solo corren mientras la página está visible ----

  async ionViewDidEnter(): Promise<void> {
    this.loadPlaces();
    this.startGps();
    await this.startSensors();
    this.refreshTimer = setInterval(() => this.refresh(), UI_REFRESH);
  }

  async ionViewWillLeave(): Promise<void> {
    clearInterval(this.refreshTimer);
    clearTimeout(this.noSensorTimer);
    window.removeEventListener(this.orientationEvent, this.orientationHandler as EventListener);
    await this.motionHandle?.remove();
    if (this.gpsWatchId) {
      await this.location.stopWatch(this.gpsWatchId);
      this.gpsWatchId = undefined;
    }
  }

  selectTarget(id: number): void {
    this.target.set(this.places().find((p) => p.id === id) ?? null);
    this.wasOnTarget = false;
  }

  formatDistance(m: number | null): string {
    if (m === null) return '—';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  }

  // ---- Sensores ----

  private async startSensors(): Promise<void> {
    this.sensorError.set(null);

    // iOS 13+ exige pedir permiso explícito; Android y escritorio no tienen este método.
    const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
    if (typeof DOE.requestPermission === 'function') {
      try {
        if ((await DOE.requestPermission()) !== 'granted') {
          this.sensorError.set('Permiso de sensores de movimiento denegado.');
          return;
        }
      } catch {
        /* se pide de nuevo al tocar la pantalla */
      }
    }

    // Orientación ABSOLUTA (respecto al norte magnético). En Android el evento normal
    // "deviceorientation" es relativo, por eso @capacitor/motion no sirve como brújula.
    // iOS no tiene el evento absoluto, pero su "deviceorientation" trae webkitCompassHeading.
    this.orientationEvent = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(this.orientationEvent, this.orientationHandler as EventListener);

    // Acelerómetro y giroscopio con @capacitor/motion (evento "devicemotion")
    this.motionHandle = await Motion.addListener('accel', (e) => {
      this.eventCount++;
      this.latest.accel = e.acceleration;
      this.latest.accelGravity = e.accelerationIncludingGravity;
      this.latest.rotationRate = e.rotationRate;
    });

    // Si en 3 s no llegó ningún dato, el dispositivo no tiene esos sensores (ej. una PC).
    this.noSensorTimer = setTimeout(() => {
      if (!this.latest.orientation && !this.latest.accel) {
        this.sensorError.set(
          'No se reciben datos: este dispositivo no tiene sensores de movimiento (prueba en el teléfono).',
        );
      }
    }, 3000);
  }

  private onOrientation(e: DeviceOrientationEvent): void {
    if (e.alpha === null) return;
    this.eventCount++;
    this.latest.orientation = { alpha: e.alpha, beta: e.beta ?? 0, gamma: e.gamma ?? 0, absolute: e.absolute };

    const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
    const raw = ios ?? headingFromAlpha(e.alpha, screen.orientation?.angle ?? 0);
    this.latest.heading = this.smoother.next(raw);
  }

  /** Pasa los últimos valores a la pantalla a 10 Hz (no 60): menos trabajo de render. */
  private refresh(): void {
    const { orientation, heading, accel, accelGravity, rotationRate } = this.latest;
    if (orientation) this.orientation.set(orientation);
    if (accel) this.accel.set(accel);
    if (accelGravity) this.accelGravity.set(accelGravity);
    if (rotationRate) this.rotationRate.set(rotationRate);
    if (orientation || accel) this.sensorError.set(null);

    if (heading !== undefined) {
      this.heading.set(heading);
      // El dial gira al revés que el teléfono para que la "N" siempre apunte al norte.
      this.dialRotation.update((r) => r + angleDiff(normalize(r), -heading));
      const turn = this.turn();
      if (turn !== null) this.arrowRotation.update((r) => r + angleDiff(normalize(r), turn));
    }

    const now = performance.now();
    if (now - this.lastRateCheck >= 1000) {
      this.eventsPerSecond.set(Math.round((this.eventCount * 1000) / (now - this.lastRateCheck || 1)));
      this.eventCount = 0;
      this.lastRateCheck = now;
    }

    this.checkOnTarget();
  }

  /** Vibra una vez cuando quedas de frente al lugar (no en cada lectura). */
  private checkOnTarget(): void {
    const on = this.onTarget();
    if (on && !this.wasOnTarget) {
      Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => undefined);
    }
    this.wasOnTarget = on;
  }

  // ---- GPS y lugares ----

  private async startGps(): Promise<void> {
    this.gpsError.set(null);
    try {
      this.gpsWatchId = await this.location.watch(
        (pos) =>
          this.position.set({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        (err: LocationError) => this.gpsError.set(err.message),
      );
    } catch (e) {
      this.gpsError.set((e as LocationError).message);
    }
  }

  private async loadPlaces(): Promise<void> {
    try {
      const places = await this.api.getPlaces();
      this.places.set(places);
      if (!this.target() && places.length) this.target.set(places[0]);
    } catch (e) {
      this.gpsError.set((e as Error).message);
    }
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const r = (d: number): number => (d * Math.PI) / 180;
  const a =
    Math.sin(r(lat2 - lat1) / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(r(lng2 - lng1) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(a)));
}
