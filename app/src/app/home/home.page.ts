import { DecimalPipe } from '@angular/common';
import type { ElementRef } from '@angular/core';
import { Component, computed, inject, NgZone, signal, viewChild } from '@angular/core';
import type { ToggleCustomEvent } from '@ionic/angular';
import {
  AlertController,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSpinner,
  IonTitle,
  IonToggle,
  IonToolbar,
  NavController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  locate,
  logOutOutline,
  notificationsOutline,
  refreshOutline,
  trashOutline,
} from 'ionicons/icons';
import * as L from 'leaflet';

import { environment } from '../../environments/environment';
import type { Place } from '../services/api.service';
import { ApiService } from '../services/api.service';
import type { LocationError } from '../services/location.service';
import { LocationService } from '../services/location.service';
import type { TrackedPosition } from '../services/tracking.service';
import { TrackingService } from '../services/tracking.service';

// Íconos de Leaflet: los copiamos a /assets/leaflet desde angular.json
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
  iconUrl: 'assets/leaflet/marker-icon.png',
  shadowUrl: 'assets/leaflet/marker-shadow.png',
});

const userIcon = L.divIcon({ className: 'user-dot', iconSize: [18, 18] });

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  imports: [
    DecimalPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonCard,
    IonCardContent,
    IonFab,
    IonFabButton,
    IonIcon,
    IonList,
    IonListHeader,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonLabel,
    IonNote,
    IonBadge,
    IonToggle,
    IonSpinner,
  ],
})
export class HomePage {
  private readonly api = inject(ApiService);
  private readonly location = inject(LocationService);
  private readonly tracker = inject(TrackingService);
  private readonly zone = inject(NgZone);
  private readonly nav = inject(NavController);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');

  readonly user = this.api.user;
  readonly gotifyUrl = environment.gotifyUrl;

  // Estado de la UI
  readonly position = signal<TrackedPosition | null>(null);
  readonly error = signal<LocationError | null>(null);
  readonly loading = signal(false);
  readonly tracking = signal(false);
  readonly places = signal<Place[]>([]);
  readonly placesLoading = signal(false);

  /** Lugares guardados ordenados por distancia a mi ubicación actual. */
  readonly placesWithDistance = computed(() => {
    const pos = this.position();
    return this.places()
      .map((p) => ({
        ...p,
        distance: pos ? L.latLng(pos.lat, pos.lng).distanceTo([p.lat, p.lng]) : null,
      }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  });

  // Leaflet
  private map?: L.Map;
  private userMarker?: L.Marker;
  private accuracyCircle?: L.Circle;
  private readonly placeMarkers = new Map<number, L.Marker>();
  /** Marcador + círculo de radio de cada lugar (para quitarlos juntos). */
  private readonly placeLayers = new Map<number, L.LayerGroup>();

  // Envío de ubicación al servidor: una petición a la vez, para no duplicar avisos.
  private reporting = false;
  private pendingReport?: TrackedPosition;

  constructor() {
    addIcons({ locate, refreshOutline, trashOutline, alertCircleOutline, logOutOutline, notificationsOutline });
  }

  // ---- Ciclo de vida de Ionic ----

  ionViewDidEnter(): void {
    if (!this.map) {
      this.initMap();
      this.loadPlaces();
      this.locateMe();
      // Si el seguimiento estaba encendido la última vez, lo reanudamos.
      if (this.tracker.wasEnabled) this.startTracking();
    }
    // Ionic anima la página; hay que recalcular el tamaño del mapa al entrar.
    this.map?.invalidateSize();
  }

  // ---- Acciones ----

  async locateMe(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const pos = await this.location.getCurrentPosition();
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      this.updatePosition(p, true);
      this.report(p);
    } catch (e) {
      this.handleError(e as LocationError);
    } finally {
      this.loading.set(false);
    }
  }

  async onTrackingToggle(ev: ToggleCustomEvent): Promise<void> {
    if (!ev.detail.checked) {
      await this.stopTracking();
      return;
    }
    const ok = await this.startTracking();
    // Si falló (p. ej. permiso denegado), regresamos el toggle a "apagado".
    if (!ok) ev.target.checked = false;
  }

  async savePlaceAt(lat: number, lng: number): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Guardar lugar',
      message: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      inputs: [{ name: 'name', type: 'text', placeholder: 'Ej. Casa, Escuela…' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Guardar',
          handler: (data: { name: string }) => {
            this.createPlace(data.name?.trim() || 'Sin nombre', lat, lng);
          },
        },
      ],
    });
    await alert.present();
  }

  saveCurrentPlace(): void {
    const pos = this.position();
    if (pos) this.savePlaceAt(pos.lat, pos.lng);
  }

  async deletePlace(id: number): Promise<void> {
    try {
      await this.api.deletePlace(id);
      this.places.update((list) => list.filter((p) => p.id !== id));
      this.placeLayers.get(id)?.remove();
      this.placeLayers.delete(id);
      this.placeMarkers.delete(id);
    } catch (e) {
      this.toast((e as Error).message, 'danger');
    }
  }

  focusPlace(place: Place): void {
    this.map?.flyTo([place.lat, place.lng], 17);
    this.placeMarkers.get(place.id)?.openPopup();
  }

  async logout(): Promise<void> {
    await this.stopTracking();
    this.api.logout();
    await this.nav.navigateRoot('/login');
  }

  formatDistance(m: number | null): string {
    if (m === null) return '—';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  }

  // ---- Seguimiento ----

  private async startTracking(): Promise<boolean> {
    this.error.set(null);
    try {
      await this.tracker.start(
        // Los callbacks nativos corren fuera de Angular; volvemos a la zona para refrescar la UI.
        (pos) =>
          this.zone.run(() => {
            this.updatePosition(pos, false);
            this.report(pos);
          }),
        (err) => this.zone.run(() => this.handleError(err)),
      );
      this.tracking.set(true);
      return true;
    } catch (e) {
      this.tracking.set(false);
      this.handleError(e as LocationError);
      return false;
    }
  }

  private async stopTracking(): Promise<void> {
    await this.tracker.stop();
    this.tracking.set(false);
  }

  /**
   * Envía la ubicación al servidor. El servidor decide si llegaste a un lugar y manda
   * la notificación push por Gotify (llega aunque la app esté cerrada).
   */
  private async report(pos: TrackedPosition): Promise<void> {
    if (this.reporting) {
      this.pendingReport = pos; // solo nos importa la más reciente
      return;
    }
    this.reporting = true;
    try {
      const { arrived } = await this.api.reportLocation(pos.lat, pos.lng, pos.accuracy);
      for (const place of arrived) this.toast(`Llegaste a "${place.name}"`, 'success');
    } catch {
      // Sin conexión momentánea: se reintentará con la siguiente ubicación.
    } finally {
      this.reporting = false;
      const next = this.pendingReport;
      this.pendingReport = undefined;
      if (next) this.report(next);
    }
  }

  // ---- Lugares ----

  private async loadPlaces(): Promise<void> {
    this.placesLoading.set(true);
    try {
      const places = await this.api.getPlaces();
      this.places.set(places);
      this.placeLayers.forEach((layer) => layer.remove());
      this.placeLayers.clear();
      this.placeMarkers.clear();
      places.forEach((p) => this.addPlaceMarker(p));
    } catch (e) {
      this.toast((e as Error).message, 'danger');
    } finally {
      this.placesLoading.set(false);
    }
  }

  private async createPlace(name: string, lat: number, lng: number): Promise<void> {
    try {
      const place = await this.api.createPlace(name, lat, lng);
      this.places.update((list) => [...list, place]);
      this.addPlaceMarker(place);
      // Por si ya estás dentro del lugar recién creado.
      const pos = this.position();
      if (pos) this.report(pos);
    } catch (e) {
      this.toast((e as Error).message, 'danger');
    }
  }

  // ---- Mapa ----

  private initMap(): void {
    // Centro inicial mientras llega la ubicación real
    this.map = L.map(this.mapEl().nativeElement, { zoomControl: true }).setView([19.4326, -99.1332], 13);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    // Mantener presionado (o clic derecho) sobre el mapa para guardar un lugar
    this.map.on('contextmenu', (e: L.LeafletMouseEvent) =>
      this.zone.run(() => this.savePlaceAt(e.latlng.lat, e.latlng.lng)),
    );
  }

  private addPlaceMarker(place: Place): void {
    if (!this.map) return;
    const marker = L.marker([place.lat, place.lng]).bindPopup(`<b>${escapeHtml(place.name)}</b>`);
    // Círculo verde = radio en el que se dispara el aviso de llegada.
    const radius = L.circle([place.lat, place.lng], {
      radius: place.radius,
      weight: 1,
      color: '#2dd36f',
      fillOpacity: 0.1,
    });
    const group = L.layerGroup([radius, marker]).addTo(this.map);
    this.placeMarkers.set(place.id, marker);
    this.placeLayers.set(place.id, group);
  }

  private updatePosition(pos: TrackedPosition, center: boolean): void {
    this.position.set(pos);
    this.error.set(null);
    const latLng = L.latLng(pos.lat, pos.lng);

    if (!this.map) return;
    if (!this.userMarker) {
      this.userMarker = L.marker(latLng, { icon: userIcon, zIndexOffset: 1000 })
        .addTo(this.map)
        .bindPopup('Estás aquí');
      this.accuracyCircle = L.circle(latLng, { radius: pos.accuracy, weight: 1, fillOpacity: 0.15 }).addTo(this.map);
    } else {
      this.userMarker.setLatLng(latLng);
      this.accuracyCircle?.setLatLng(latLng).setRadius(pos.accuracy);
    }

    if (center) {
      this.map.setView(latLng, Math.max(this.map.getZoom(), 16));
    }
  }

  // ---- Errores ----

  private handleError(err: LocationError): void {
    this.error.set(err);
    if (err.kind === 'denied' || err.kind === 'disabled') {
      this.stopTracking();
    }
    this.toast(err.message, 'danger');
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const t = await this.toastCtrl.create({ message, color, duration: 3000, position: 'top' });
    await t.present();
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
