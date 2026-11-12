import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { NAV_ITEMS } from './nav-items';

/** The sidebar menu (desktop and tablet). Phones use the bottom tab bar instead. */
@Component({
  selector: 'tf-nav-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, NzIconModule, TranslatePipe],
  template: `
    <nav [attr.aria-label]="'nav.main' | t">
      <ul>
        @for (item of items; track item.path) {
          <li>
            <a [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page">
              <span class="icon"><span nz-icon [nzType]="item.icon" nzTheme="outline" aria-hidden="true"></span></span>
              <span class="label">{{ item.labelKey | t }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--tf-space-2); }
    a {
      display: flex; align-items: center; gap: var(--tf-space-3); min-height: 48px; padding: 0 var(--tf-space-3);
      border: 2px solid transparent; border-radius: var(--tf-radius-pill);
      color: var(--tf-ink); text-decoration: none; font-weight: 600;
      transition: background-color 160ms ease, transform 160ms var(--tf-ease-pop), box-shadow 160ms ease;
    }
    a:hover { background: var(--tf-paper); border-color: var(--tf-line); transform: translateX(3px); }
    // The current page is a filled sticker: colour, outline and weight all change, so it never depends on colour alone.
    a.active { background: var(--tf-tangerine); color: var(--tf-on-color); border-color: var(--tf-edge); box-shadow: var(--tf-shadow-small); transform: none; font-weight: 700; }
    .icon { display: inline-grid; place-items: center; width: 28px; height: 28px; font-size: 18px; }
    a.active .icon { animation: icon-pop 420ms var(--tf-ease-pop); }
    @keyframes icon-pop { 0% { transform: scale(0.6) rotate(-12deg); } 100% { transform: none; } }
    // Tablet: icon-only column. The text stays available to assistive technology.
    @media (min-width: 768px) and (max-width: 1023.98px) {
      a { justify-content: center; padding: 0; }
      .label { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    }
  `,
})
export class NavListComponent {
  protected readonly items = NAV_ITEMS;
}
