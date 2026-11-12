import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

import { MascotComponent } from '../../shared/ui/mascot.component';
import { PrefsMenuComponent } from '../../shared/ui/prefs-menu.component';

/** Frame for pages shown to signed-out visitors: one centred sticker with Tí peeking over its edge. */
@Component({
  selector: 'tf-auth-layout',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, MascotComponent, PrefsMenuComponent],
  template: `
    <main class="auth">
      <div class="auth__prefs"><tf-prefs /></div>
      <div class="auth__column">
        <a class="auth__brand" routerLink="/login" aria-label="TaskFlow">TaskFlow</a>
        <div class="auth__stage">
          <tf-mascot class="auth__ti" mood="wave" [size]="92" [animated]="true" />
          <div class="auth__surface tf-panel tf-pop">
            <router-outlet />
          </div>
        </div>
      </div>
    </main>
  `,
  styles: `
    .auth { position: relative; min-height: 100vh; display: grid; place-items: start center; padding: var(--tf-space-12) var(--tf-space-4); }
    .auth__prefs { position: absolute; top: var(--tf-space-4); right: var(--tf-space-4); }
    .auth__column { width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: var(--tf-space-6); margin-top: var(--tf-space-6); }
    .auth__brand { font-family: var(--tf-font-display); font-size: 2rem; font-weight: 800; color: var(--tf-ink); text-decoration: none; }
    .auth__stage { position: relative; padding-top: 64px; }
    .auth__ti { position: absolute; top: 0; right: var(--tf-space-8); z-index: 1; }
    .auth__surface { position: relative; padding: var(--tf-space-8); box-shadow: var(--tf-shadow-panel); }
    @media (max-width: 479.98px) {
      .auth { padding-top: var(--tf-space-8); }
      .auth__surface { padding: var(--tf-space-6) var(--tf-space-4); }
    }
  `,
})
export class AuthLayoutComponent {}
