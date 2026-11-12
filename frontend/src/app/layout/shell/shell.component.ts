import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { NzDropDownModule } from 'ng-zorro-antd/dropdown';
import { NzIconModule } from 'ng-zorro-antd/icon';
import { NzMenuModule } from 'ng-zorro-antd/menu';

import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { I18nService } from '../../core/i18n/i18n.service';
import { PrefsMenuComponent } from '../../shared/ui/prefs-menu.component';
import { NavListComponent } from '../nav/nav-list.component';
import { TabBarComponent } from '../nav/tab-bar.component';
import { initialsOf } from './initials';

@Component({
  selector: 'tf-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, NavListComponent, TabBarComponent, PrefsMenuComponent, NzDropDownModule, NzIconModule, NzMenuModule, TranslatePipe],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);

  protected readonly user = this.auth.user;
  protected readonly initials = computed(() => initialsOf(this.user()?.fullName));

  protected signOut(): void {
    this.auth.signOut();
  }
}
