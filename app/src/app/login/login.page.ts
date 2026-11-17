import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  imports: [
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonInput,
    IonButton,
    IonNote,
    IonSpinner,
  ],
})
export class LoginPage {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  name = '';
  email = '';
  password = '';
  passwordConfirm = '';

  setMode(value: unknown): void {
    this.mode.set(value === 'register' ? 'register' : 'login');
    this.error.set(null);
    this.passwordConfirm = '';
  }

  async submit(): Promise<void> {
    this.error.set(null);
    if (this.mode() === 'register') {
      if (this.password.length < 8) {
        this.error.set('La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (this.password !== this.passwordConfirm) {
        this.error.set('Las contraseñas no coinciden.');
        return;
      }
    }

    this.loading.set(true);
    try {
      if (this.mode() === 'register') {
        await this.api.register(this.name.trim(), this.email.trim(), this.password);
      } else {
        await this.api.login(this.email.trim(), this.password);
      }
      this.password = '';
      this.passwordConfirm = '';
      await this.router.navigateByUrl('/home', { replaceUrl: true });
    } catch (e) {
      this.error.set((e as Error).message);
    } finally {
      this.loading.set(false);
    }
  }
}
