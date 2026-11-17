import { inject, Injectable } from '@angular/core';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { BackgroundGeolocationPlugin } from '@capacitor-community/background-geolocation';

import { LocationError, LocationService } from './location.service';

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

const TRACKING_KEY = 'geopulse.tracking';

export interface TrackedPosition {
  lat: number;
  lng: number;
  accuracy: number;
}

/**
 * Seguimiento continuo de la ubicación.
 *
 * - Android/iOS: @capacitor-community/background-geolocation. Corre como servicio en
 *   primer plano (con un aviso fijo), así sigue funcionando con la app en segundo plano
 *   o la pantalla bloqueada.
 * - Web: watchPosition del navegador (solo con la pestaña abierta).
 */
@Injectable({ providedIn: 'root' })
export class TrackingService {
  private readonly location = inject(LocationService);
  private readonly isNative = Capacitor.isNativePlatform();
  private watcherId?: string;

  get active(): boolean {
    return this.watcherId !== undefined;
  }

  /** Si el usuario dejó el seguimiento encendido la última vez. */
  get wasEnabled(): boolean {
    try {
      return localStorage.getItem(TRACKING_KEY) === '1';
    } catch {
      return false;
    }
  }

  async start(onPosition: (p: TrackedPosition) => void, onError: (e: LocationError) => void): Promise<void> {
    if (this.active) return;

    if (this.isNative) {
      await this.requestNotificationPermission();
      this.watcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundTitle: 'GeoPulse está activo',
          backgroundMessage: 'Te avisaremos al llegar a tus lugares guardados.',
          requestPermissions: true,
          stale: false,
          distanceFilter: 10, // metros entre lecturas
        },
        (loc, err) => {
          if (err) {
            onError(
              err.code === 'NOT_AUTHORIZED'
                ? new LocationError('denied', 'Permiso de ubicación denegado. Actívalo en Ajustes > Apps > GeoPulse.')
                : new LocationError('unknown', err.message),
            );
          } else if (loc) {
            onPosition({ lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy });
          }
        },
      );
    } else {
      this.watcherId = await this.location.watch(
        (pos) => onPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
        onError,
      );
    }
    this.remember(true);
  }

  async stop(): Promise<void> {
    if (this.watcherId !== undefined) {
      const id = this.watcherId;
      this.watcherId = undefined;
      if (this.isNative) await BackgroundGeolocation.removeWatcher({ id });
      else await this.location.stopWatch(id);
    }
    this.remember(false);
  }

  openSettings(): Promise<void> {
    return BackgroundGeolocation.openSettings();
  }

  /** Android 13+: sin este permiso no se ve el aviso fijo del servicio en segundo plano. */
  private async requestNotificationPermission(): Promise<void> {
    try {
      const { display } = await LocalNotifications.checkPermissions();
      if (display !== 'granted') await LocalNotifications.requestPermissions();
    } catch {
      /* no es crítico: el seguimiento funciona aunque no se muestre el aviso */
    }
  }

  private remember(enabled: boolean): void {
    try {
      localStorage.setItem(TRACKING_KEY, enabled ? '1' : '0');
    } catch {
      /* almacenamiento no disponible */
    }
  }
}
