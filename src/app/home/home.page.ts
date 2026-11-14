import { DecimalPipe } from '@angular/common';
import type { ElementRef } from '@angular/core';
import { Component, computed, inject, NgZone, signal, viewChild } from '@angular/core';
import type { Position } from '@capacitor/geolocation';
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
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, locate, refreshOutline, trashOutline } from 'ionicons/icons';
import * as L from 'leaflet';

import type { LocationError } from '../services/location.service';
import { LocationService } from '../services/location.service';

interface Place {
  id: number;
  name: string;
  lat: number;
  lng: number;
}

const PLACES_KEY = 'geopulse.places';
/** Radio (m) para considerar que "llegaste" a un lugar guardado. */
const ARRIVAL_RADIUS = 50;

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
  private readonly location = inject(LocationService);
  private readonly zone = inject(NgZone);
  private readonly toastCtrl = inject(ToastController);
  private readonly alertCtrl = inject(AlertController);

  private readonly mapEl = viewChild.required<ElementRef<HTMLDivElement>>('map');

  // Estado de la UI
  readonly position = signal<Position | null>(null);
  readonly error = signal<LocationError | null>(null);
  readonly loading = signal(false);
  readonly tracking = signal(false);
  readonly places = signal<Place[]>(this.loadPlaces());

  /** Lugares guardados ordenados por distancia a mi ubicación actual. */
  readonly placesWithDistance = computed(() => {
    const pos = this.position();
    return this.places()
      .map((p) => ({
        ...p,
        distance: pos ? L.latLng(pos.coords.latitude, pos.coords.longitude).distanceTo([p.lat, p.lng]) : null,
      }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
  });

  // Leaflet
  private map?: L.Map;
  private userMarker?: L.Marker;
  private accuracyCircle?: L.Circle;
  private readonly placeMarkers = new Map<number, L.Marker>();
  private watchId?: string;
  /** Lugares en los que ya notificamos la llegada (para no repetir el aviso). */
  private readonly arrived = new Set<number>();

  constructor() {
    addIcons({ locate, refreshOutline, trashOutline, alertCircleOutline });
  }

  // ---- Ciclo de vida de Ionic ----

  ionViewDidEnter(): void {
    if (!this.map) {
      this.initMap();
      this.locateMe();
    }
    // Ionic anima la página; hay que recalcular el tamaño del mapa al entrar.
    this.map?.invalidateSize();
  }

  ionViewWillLeave(): void {
    this.stopTracking();
  }

  // ---- Acciones ----

  async locateMe(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const pos = await this.location.getCurrentPosition();
      this.updatePosition(pos, true);
    } catch (e) {
      this.handleError(e as LocationError);
    } finally {
      this.loading.set(false);
    }
  }

  async toggleTracking(enabled: boolean): Promise<void> {
    if (!enabled) {
      await this.stopTracking();
      return;
    }
    this.error.set(null);
    try {
      this.watchId = await this.location.watch(
        // El callback nativo corre fuera de Angular; volvemos a la zona para refrescar la UI.
        (pos) => this.zone.run(() => this.updatePosition(pos, false)),
        (err) => this.zone.run(() => this.handleError(err)),
      );
      this.tracking.set(true);
    } catch (e) {
      this.tracking.set(false);
      this.handleError(e as LocationError);
    }
  }

  async stopTracking(): Promise<void> {
    if (this.watchId) {
      await this.location.stopWatch(this.watchId);
      this.watchId = undefined;
    }
    this.tracking.set(false);
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
            const place: Place = { id: Date.now(), name: data.name?.trim() || 'Sin nombre', lat, lng };
            this.places.update((list) => [...list, place]);
            this.addPlaceMarker(place);
            this.persistPlaces();
          },
        },
      ],
    });
    await alert.present();
  }

  saveCurrentPlace(): void {
    const pos = this.position();
    if (pos) this.savePlaceAt(pos.coords.latitude, pos.coords.longitude);
  }

  deletePlace(id: number): void {
    this.places.update((list) => list.filter((p) => p.id !== id));
    this.placeMarkers.get(id)?.remove();
    this.placeMarkers.delete(id);
    this.arrived.delete(id);
    this.persistPlaces();
  }

  focusPlace(place: Place): void {
    this.map?.flyTo([place.lat, place.lng], 17);
    this.placeMarkers.get(place.id)?.openPopup();
  }

  formatDistance(m: number | null): string {
    if (m === null) return '—';
    return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  }

  // ---- Mapa ----

  private initMap(): void {
    // Centro inicial (CDMX) mientras llega la ubicación real
    this.map = L.map(this.mapEl().nativeElement, { zoomControl: true }).setView([19.4326, -99.1332], 13);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(this.map);

    // Mantener presionado (o clic derecho) sobre el mapa para guardar un lugar
    this.map.on('contextmenu', (e: L.LeafletMouseEvent) =>
      this.zone.run(() => this.savePlaceAt(e.latlng.lat, e.latlng.lng)),
    );

    this.places().forEach((p) => this.addPlaceMarker(p));
  }

  private addPlaceMarker(place: Place): void {
    if (!this.map) return;
    const marker = L.marker([place.lat, place.lng])
      .addTo(this.map)
      .bindPopup(`<b>${escapeHtml(place.name)}</b>`);
    this.placeMarkers.set(place.id, marker);
  }

  private updatePosition(pos: Position, center: boolean): void {
    this.position.set(pos);
    this.error.set(null);
    const { latitude, longitude, accuracy } = pos.coords;
    const latLng = L.latLng(latitude, longitude);

    if (!this.map) return;
    if (!this.userMarker) {
      this.userMarker = L.marker(latLng, { icon: userIcon, zIndexOffset: 1000 })
        .addTo(this.map)
        .bindPopup('Estás aquí');
      this.accuracyCircle = L.circle(latLng, { radius: accuracy, weight: 1, fillOpacity: 0.15 }).addTo(this.map);
    } else {
      this.userMarker.setLatLng(latLng);
      this.accuracyCircle?.setLatLng(latLng).setRadius(accuracy);
    }

    if (center || this.tracking()) {
      this.map.setView(latLng, Math.max(this.map.getZoom(), 16));
    }

    this.checkArrivals(latLng);
  }

  /** Funcionalidad basada en ubicación: avisar al llegar cerca de un lugar guardado. */
  private checkArrivals(here: L.LatLng): void {
    for (const place of this.places()) {
      const near = here.distanceTo([place.lat, place.lng]) <= ARRIVAL_RADIUS;
      if (near && !this.arrived.has(place.id)) {
        this.arrived.add(place.id);
        this.toast(`📍 Llegaste a "${place.name}"`, 'success');
      } else if (!near) {
        this.arrived.delete(place.id);
      }
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

  // ---- Persistencia ----

  private loadPlaces(): Place[] {
    try {
      return JSON.parse(localStorage.getItem(PLACES_KEY) ?? '[]') as Place[];
    } catch {
      return [];
    }
  }

  private persistPlaces(): void {
    try {
      localStorage.setItem(PLACES_KEY, JSON.stringify(this.places()));
    } catch {
      /* almacenamiento no disponible */
    }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
