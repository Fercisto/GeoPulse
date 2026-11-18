import { inject } from '@angular/core';
import type { CanActivateFn, Routes } from '@angular/router';
import { Router } from '@angular/router';

import { ApiService } from './services/api.service';

/** Solo deja pasar si hay sesión; si no, manda a /login. */
const requireLogin: CanActivateFn = () =>
  inject(ApiService).isLoggedIn || inject(Router).createUrlTree(['/login']);

/** Si ya hay sesión, /login redirige a /home. */
const requireGuest: CanActivateFn = () =>
  !inject(ApiService).isLoggedIn || inject(Router).createUrlTree(['/home']);

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [requireGuest],
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    canActivate: [requireLogin],
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'sensors',
    canActivate: [requireLogin],
    loadComponent: () => import('./sensors/sensors.page').then((m) => m.SensorsPage),
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full',
  },
];
