import { DecimalPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import {
  IonBackButton,
  IonBadge,
  IonButton,
  IonButtons,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonContent,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { ApiService } from '../services/api.service';

import type { ContextOverrides } from './context.service';
import { ContextService } from './context.service';
import { RULES } from './rules';

type Choice = 'real' | 'yes' | 'no';

@Component({
  selector: 'app-rules',
  templateUrl: 'rules.page.html',
  styleUrls: ['rules.page.scss'],
  imports: [
    DecimalPipe,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonBackButton,
    IonButton,
    IonContent,
    IonCard,
    IonCardHeader,
    IonCardTitle,
    IonCardContent,
    IonList,
    IonItem,
    IonLabel,
    IonNote,
    IonBadge,
    IonSegment,
    IonSegmentButton,
  ],
})
export class RulesPage {
  readonly ctx = inject(ContextService);
  private readonly api = inject(ApiService);

  readonly rules = RULES;
  readonly context = this.ctx.context;
  readonly decision = this.ctx.decision;
  readonly queued = computed(() => {
    this.decision(); // se recalcula cuando cambia el contexto
    return this.api.queuedLocations;
  });

  isActive(id: string): boolean {
    return this.decision().activeRules.includes(id as 'R1' | 'R2' | 'R3');
  }

  choiceOf(key: keyof ContextOverrides): Choice {
    const v = this.ctx.overrides()[key];
    if (v === null) return 'real';
    if (key === 'batteryLevel') return (v as number) < 0.2 ? 'yes' : 'no';
    return v ? 'yes' : 'no';
  }

  /** Para la batería, "sí" = batería baja (15 %) y "no" = batería alta (80 %). */
  setChoice(key: keyof ContextOverrides, value: unknown): void {
    const choice = value as Choice;
    if (choice === 'real') {
      this.ctx.setOverride(key, null);
    } else if (key === 'batteryLevel') {
      this.ctx.setOverride('batteryLevel', choice === 'yes' ? 0.15 : 0.8);
    } else {
      this.ctx.setOverride(key, choice === 'yes');
    }
  }

  connectionLabel(): string {
    const c = this.context();
    if (!c.online) return 'Sin conexión';
    return c.connectionType === 'wifi' ? 'Wi-Fi' : c.connectionType === 'cellular' ? 'Datos móviles' : 'Conectado';
  }
}
