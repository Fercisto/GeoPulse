import { Injectable } from '@angular/core';

import { environment } from '../../environments/environment';

export interface User {
  id: number;
  name: string;
  email: string;
}

export interface Session {
  token: string;
  user: User;
}

export interface Place {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

export interface LocationReport {
  arrived: { id: number; name: string; distance: number }[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const SESSION_KEY = 'geopulse.session';

/**
 * Cliente de la API PHP. Guarda la sesión (JWT) en localStorage.
 * Con CapacitorHttp activado, en el teléfono fetch() usa HTTP nativo.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private session: Session | null = this.loadSession();
  /** Se invoca cuando el servidor responde 401 (token vencido o inválido). */
  onUnauthorized?: () => void;

  get user(): User | null {
    return this.session?.user ?? null;
  }

  get isLoggedIn(): boolean {
    return this.session !== null;
  }

  // ---- Autenticación ----

  async login(email: string, password: string): Promise<User> {
    return this.startSession(await this.request<Session>('POST', '/auth/login', { email, password }, false));
  }

  async register(name: string, email: string, password: string): Promise<User> {
    return this.startSession(await this.request<Session>('POST', '/auth/register', { name, email, password }, false));
  }

  logout(): void {
    this.session = null;
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* almacenamiento no disponible */
    }
  }

  // ---- Lugares ----

  getPlaces(): Promise<Place[]> {
    return this.request<Place[]>('GET', '/places');
  }

  createPlace(name: string, lat: number, lng: number): Promise<Place> {
    return this.request<Place>('POST', '/places', { name, lat, lng });
  }

  deletePlace(id: number): Promise<void> {
    return this.request<void>('DELETE', `/places/${id}`);
  }

  // ---- Ubicación ----

  /** Reporta la ubicación; el servidor decide si llegaste a un lugar y envía la notificación. */
  reportLocation(lat: number, lng: number, accuracy: number): Promise<LocationReport> {
    return this.request<LocationReport>('POST', '/location', { lat, lng, accuracy });
  }

  // ---- Interno ----

  private async request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (auth && this.session) headers['Authorization'] = `Bearer ${this.session.token}`;

    let res: Response;
    try {
      res = await fetch(environment.apiUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'No se pudo conectar con el servidor. ¿Estás en la misma red Wi-Fi que la PC?');
    }

    if (res.status === 204) return undefined as T;

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && auth) {
        this.logout();
        this.onUnauthorized?.();
      }
      throw new ApiError(res.status, data?.error ?? `Error ${res.status}`);
    }
    return data as T;
  }

  private startSession(session: Session): User {
    this.session = session;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      /* almacenamiento no disponible */
    }
    return session.user;
  }

  private loadSession(): Session | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  }
}
