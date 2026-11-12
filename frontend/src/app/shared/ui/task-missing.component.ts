import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NzButtonModule } from 'ng-zorro-antd/button';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { MascotComponent } from './mascot.component';

/** A 404 for a task: it was deleted, or it never belonged to this user (the server treats both the same). */
@Component({
  selector: 'tf-task-missing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NzButtonModule, MascotComponent, TranslatePipe],
  template: `
    <section class="missing" role="alert">
      <tf-mascot mood="worried" [size]="120" [animated]="true" />
      <div class="missing__body">
        <h1>{{ 'missing.title' | t }}</h1>
        <p>{{ 'missing.body' | t }}</p>
        <a nz-button nzType="primary" nzSize="large" routerLink="/tasks">{{ 'missing.cta' | t }}</a>
      </div>
    </section>
  `,
  styles: `
    .missing { display: flex; align-items: center; gap: var(--tf-space-6); max-width: 38rem; padding: var(--tf-space-8) 0; }
    .missing__body { display: flex; flex-direction: column; align-items: flex-start; gap: var(--tf-space-2); }
    p { color: var(--tf-ink-soft); margin-bottom: var(--tf-space-3); }
    @media (max-width: 479.98px) { .missing { flex-direction: column; text-align: center; } .missing__body { align-items: center; } }
  `,
})
export class TaskMissingComponent {}
