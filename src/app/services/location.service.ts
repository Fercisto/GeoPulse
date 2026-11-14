import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import type { Position, PositionOptions } from '@capacitor/geolocation';
import { Geolocation } from '@capacitor/geolocation';

export type LocationErrorKind = 'denied' | 'disabled' | 'unavailable' | 'timeout' | 'unsupported' | 'unknown';

export class LocationError extends Error {
  constructor(
    public readonly kind: LocationErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 0,
};

/**
 * Envuelve @capacitor/geolocation: pide permisos de forma adecuada
 * (nativo y web) y traduce los errores a algo que la UI pueda mostrar.
 */
@Injectable({ providedIn: 'root' })
export class LocationService {
  private readonly isNative = Capacitor.isNativePlatform();

  /** Revisa el permiso y, si aún no se ha decidido, lo solicita. */
  async ensurePermission(): Promise<void> {
    if (!this.isNative) {
      // En web no existe requestPermissions(): el navegador muestra su propio
      // diálogo al llamar getCurrentPosition(). Solo verificamos soporte y si ya
      // fue rechazado para dar un mensaje claro.
      if (!('geolocation' in navigator)) {
        throw new LocationError('unsupported', 'Este navegador no soporta geolocalización.');
      }
      try {
        const status = await Geolocation.checkPermissions();
        if (status.location === 'denied') throw this.deniedError();
      } catch (e) {
        if (e instanceof LocationError) throw e;
        // Algunos navegadores no tienen Permissions API: seguimos y que el navegador pregunte.
      }
      return;
    }

    try {
      let status = await Geolocation.checkPermissions();
      if (status.location === 'prompt' || status.location === 'prompt-with-rationale') {
        status = await Geolocation.requestPermissions({ permissions: ['location', 'coarseLocation'] });
      }
      if (status.location !== 'granted' && status.coarseLocation !== 'granted') {
        throw this.deniedError();
      }
    } catch (e) {
      throw this.toLocationError(e);
    }
  }

  async getCurrentPosition(): Promise<Position> {
    await this.ensurePermission();
    try {
      return await Geolocation.getCurrentPosition(OPTIONS);
    } catch (e) {
      throw this.toLocationError(e);
    }
  }

  /** Inicia seguimiento continuo. Devuelve el id para detenerlo con stopWatch(). */
  async watch(onPosition: (pos: Position) => void, onError: (err: LocationError) => void): Promise<string> {
    await this.ensurePermission();
    return Geolocation.watchPosition(OPTIONS, (pos, err) => {
      if (err) onError(this.toLocationError(err));
      else if (pos) onPosition(pos);
    });
  }

  async stopWatch(id: string): Promise<void> {
    await Geolocation.clearWatch({ id });
  }

  private deniedError(): LocationError {
    return new LocationError(
      'denied',
      this.isNative
        ? 'Permiso de ubicación denegado. Actívalo en Ajustes > Apps > GeoPulse > Permisos.'
        : 'Permiso de ubicación denegado. Actívalo desde el ícono de candado en la barra de direcciones.',
    );
  }

  private toLocationError(e: unknown): LocationError {
    if (e instanceof LocationError) return e;

    const err = e as { code?: number | string; message?: string };

    // Errores web (GeolocationPositionError): 1 = denegado, 2 = no disponible, 3 = timeout
    if (typeof err?.code === 'number') {
      switch (err.code) {
        case 1:
          return this.deniedError();
        case 2:
          return new LocationError('unavailable', 'No se pudo determinar tu ubicación. Revisa tu conexión o GPS.');
        case 3:
          return new LocationError('timeout', 'Se agotó el tiempo para obtener la ubicación. Intenta de nuevo.');
      }
    }

    // Errores nativos de @capacitor/geolocation (OS-PLUG-GLOC-XXXX)
    const code = String(err?.code ?? '');
    const msg = String(err?.message ?? '');
    if (code.endsWith('0003') || code.endsWith('0008') || /denied/i.test(msg)) return this.deniedError();
    if (code.endsWith('0007') || code.endsWith('0009') || code.endsWith('0017') || /disabled|not enabled/i.test(msg)) {
      return new LocationError(
        'disabled',
        'Los servicios de ubicación (GPS) están apagados. Actívalos e intenta de nuevo.',
      );
    }
    if (code.endsWith('0010') || /timeout/i.test(msg)) {
      return new LocationError('timeout', 'Se agotó el tiempo para obtener la ubicación. Intenta de nuevo.');
    }
    return new LocationError('unknown', msg || 'Ocurrió un error desconocido al obtener la ubicación.');
  }
}
