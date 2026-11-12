import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, signal } from '@angular/core';

import { I18nService, LANGUAGES } from '../../core/i18n/i18n.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';

/** Language and light/dark choice in one small popover; used in the shell header and on the sign-in pages. */
@Component({
  selector: 'tf-prefs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  template: `
    <button class="trigger" type="button" [attr.aria-expanded]="open()" aria-controls="tf-prefs-panel" [attr.aria-label]="'prefs.open' | t" (click)="toggle()">
      @if (theme.resolved() === 'dark') {
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M16.5 12.2A7 7 0 0 1 7.8 3.5a7 7 0 1 0 8.7 8.7z" fill="currentColor" /></svg>
      } @else {
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><circle cx="10" cy="10" r="3.6" fill="currentColor" /><path d="M10 2v2.2M10 15.8V18M2 10h2.2M15.8 10H18M4.3 4.3l1.5 1.5M14.2 14.2l1.5 1.5M15.7 4.3l-1.5 1.5M5.8 14.2l-1.5 1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      }
      <span class="trigger__lang">{{ shortLang() }}</span>
    </button>

    @if (open()) {
      <div class="panel tf-panel" id="tf-prefs-panel" role="group" [attr.aria-label]="'prefs.open' | t">
        <p class="panel__title" id="tf-prefs-theme">{{ 'prefs.theme' | t }}</p>
        <div class="choices" role="group" aria-labelledby="tf-prefs-theme">
          @for (option of themeOptions; track option.mode) {
            <button type="button" class="choice" [attr.aria-pressed]="theme.mode() === option.mode" (click)="theme.setMode(option.mode)">
              {{ option.key | t }}
            </button>
          }
        </div>

        <p class="panel__title" id="tf-prefs-lang">{{ 'prefs.language' | t }}</p>
        <div class="choices" role="group" aria-labelledby="tf-prefs-lang">
          @for (language of languages; track language.code) {
            <button type="button" class="choice" [attr.lang]="language.code" [attr.aria-pressed]="i18n.lang() === language.code" (click)="i18n.setLang(language.code)">
              {{ language.label }}
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: `
    :host { position: relative; display: inline-block; }
    .trigger {
      display: inline-flex; align-items: center; gap: var(--tf-space-2); min-height: 44px; padding: 0 var(--tf-space-3);
      border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-pill); background: var(--tf-paper); color: var(--tf-ink);
      font: 700 var(--tf-text-caption) var(--tf-font-body); cursor: pointer; box-shadow: var(--tf-shadow-small);
      transition: transform 140ms var(--tf-ease-pop), box-shadow 140ms ease;
    }
    .trigger:hover { transform: translate(-1px, -1px); box-shadow: 3px 3px 0 var(--tf-shadow-color); }
    .trigger:active { transform: translate(2px, 2px); box-shadow: none; }
    .panel {
      position: absolute; right: 0; top: calc(100% + 10px); z-index: 1050; width: 17rem; padding: var(--tf-space-4);
      box-shadow: var(--tf-shadow-panel); animation: tf-pop 260ms var(--tf-ease-pop) both;
    }
    .panel__title { font-weight: 700; font-size: var(--tf-text-caption); color: var(--tf-ink-soft); margin: 0 0 var(--tf-space-2); }
    .choices { display: flex; flex-wrap: wrap; gap: var(--tf-space-2); margin-bottom: var(--tf-space-4); }
    .choices:last-child { margin-bottom: 0; }
    .choice {
      min-height: 40px; padding: 0 var(--tf-space-4); border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-pill);
      background: var(--tf-paper); color: var(--tf-ink); font: 600 var(--tf-text-small) var(--tf-font-body); cursor: pointer;
      transition: transform 140ms var(--tf-ease-pop), background-color 160ms ease;
    }
    .choice:hover { transform: translateY(-1px); }
    .choice[aria-pressed='true'] { background: var(--tf-tangerine); color: var(--tf-on-color); box-shadow: var(--tf-shadow-small); }
  `,
})
export class PrefsMenuComponent {
  protected readonly i18n = inject(I18nService);
  protected readonly theme = inject(ThemeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly open = signal(false);
  protected readonly languages = LANGUAGES;
  protected readonly themeOptions: readonly { mode: ThemeMode; key: 'theme.light' | 'theme.dark' | 'theme.system' }[] = [
    { mode: 'light', key: 'theme.light' },
    { mode: 'dark', key: 'theme.dark' },
    { mode: 'system', key: 'theme.system' },
  ];

  protected shortLang(): string {
    return LANGUAGES.find((l) => l.code === this.i18n.lang())?.short ?? '';
  }

  protected toggle(): void {
    this.open.update((v) => !v);
  }

  @HostListener('document:click', ['$event'])
  protected closeOnOutsideClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('keydown.escape')
  protected closeOnEscape(): void {
    this.open.set(false);
  }
}
