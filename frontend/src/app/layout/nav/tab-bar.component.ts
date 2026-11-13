import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { NzIconModule } from 'ng-zorro-antd/icon';

import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { NAV_ITEMS } from './nav-items';

/** Phone navigation: four destinations and a raised button to create a task, all within thumb reach. */
@Component({
  selector: 'tf-tab-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, RouterLinkActive, NzIconModule, TranslatePipe],
  template: `
    <nav class="bar" [attr.aria-label]="'nav.main' | t">
      <ul>
        @for (item of first; track item.path) {
          <li><ng-container *ngTemplateOutlet="tab; context: { $implicit: item }" /></li>
        }
        <li class="fab-slot">
          <a class="fab" routerLink="/tasks/new" [attr.aria-label]="'common.create' | t">
            <span nz-icon nzType="plus" nzTheme="outline" aria-hidden="true"></span>
          </a>
        </li>
        @for (item of second; track item.path) {
          <li><ng-container *ngTemplateOutlet="tab; context: { $implicit: item }" /></li>
        }
      </ul>
    </nav>

    <ng-template #tab let-item>
      <a class="tab" [routerLink]="item.path" routerLinkActive="active" ariaCurrentWhenActive="page">
        <span class="tab__icon"><span nz-icon [nzType]="item.icon" nzTheme="outline" aria-hidden="true"></span></span>
        <span class="tab__label">{{ item.labelKey | t }}</span>
      </a>
    </ng-template>
  `,
  styles: `
    :host { display: none; }
    @media (max-width: 767.98px) {
      /* Its own transition layer, so a page change draws it above the sliding page instead of behind it. */
      :host { display: block; position: fixed; inset: auto 0 0 0; z-index: 900; view-transition-name: tf-tabbar; }
    }
    .bar { background: var(--tf-paper); border-top: 2px solid var(--tf-edge); padding-bottom: env(safe-area-inset-bottom); }
    ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, 1fr); align-items: end; height: var(--tf-tabbar-height); }
    li { display: flex; justify-content: center; }
    .tab { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 4px; min-width: 56px; color: var(--tf-ink); text-decoration: none; font-size: 0.6875rem; font-weight: 600; }
    .tab__icon { display: grid; place-items: center; width: 44px; height: 28px; border: 2px solid transparent; border-radius: var(--tf-radius-pill); font-size: 18px; transition: background-color 160ms ease, transform 200ms var(--tf-ease-pop); }
    .tab.active .tab__icon { background: var(--tf-tangerine); border-color: var(--tf-edge); color: var(--tf-on-color); transform: translateY(-2px); }
    .tab.active { font-weight: 800; }
    .fab-slot { position: relative; }
    .fab {
      position: absolute; bottom: 18px; display: grid; place-items: center; width: 58px; height: 58px; font-size: 24px;
      border: 2px solid var(--tf-edge); border-radius: 50%; background: var(--tf-tangerine); color: var(--tf-on-color); box-shadow: var(--tf-shadow-sticker);
      transition: transform 160ms var(--tf-ease-pop), box-shadow 160ms ease;
    }
    .fab:active { transform: translate(2px, 2px); box-shadow: none; }
  `,
})
export class TabBarComponent {
  protected readonly first = NAV_ITEMS.slice(0, 2);
  protected readonly second = NAV_ITEMS.slice(2);
}
