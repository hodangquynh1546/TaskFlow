import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MascotComponent } from '../../shared/ui/mascot.component';

@Component({
  selector: 'tf-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NzButtonModule, MascotComponent, TranslatePipe],
  template: `
    <section class="not-found">
      <tf-mascot mood="sleepy" [size]="150" [animated]="true" />
      <p class="not-found__code" aria-hidden="true">404</p>
      <h1>{{ 'notFound.title' | t }}</h1>
      <p class="not-found__body">{{ 'notFound.body' | t }}</p>
      <a nz-button nzType="primary" nzSize="large" routerLink="/">{{ 'notFound.cta' | t }}</a>
    </section>
  `,
  styles: `
    .not-found { display: flex; flex-direction: column; align-items: center; gap: var(--tf-space-2); text-align: center; padding: var(--tf-space-8) 0; }
    .not-found__code { font-family: var(--tf-font-display); font-weight: 800; font-size: 5rem; line-height: 1; margin-top: var(--tf-space-2); }
    .not-found__body { color: var(--tf-ink-soft); margin-bottom: var(--tf-space-3); max-width: 28rem; }
  `,
})
export class NotFoundComponent {}
