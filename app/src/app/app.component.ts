import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet, NavController } from '@ionic/angular';

import { ApiService } from './services/api.service';
import { TrackingService } from './services/tracking.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent {
  constructor() {
    const nav = inject(NavController);
    const tracker = inject(TrackingService);
    // Si el token vence o es inválido, la API responde 401: detenemos el seguimiento y vamos al login.
    inject(ApiService).onUnauthorized = async () => {
      await tracker.stop();
      await nav.navigateRoot('/login');
    };
  }
}
