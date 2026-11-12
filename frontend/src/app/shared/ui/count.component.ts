import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';

import { I18nService } from '../../core/i18n/i18n.service';
import { easeOutCubic, prefersReducedMotion } from '../../core/motion/motion';

/** A number that counts up to its value. It is ordinary text (not a live region), so assistive technology reads the final value. */
@Component({
  selector: 'tf-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `{{ i18n.formatNumber(shown()) }}`,
  styles: `:host { font-variant-numeric: tabular-nums; }`,
})
export class CountComponent {
  protected readonly i18n = inject(I18nService);

  readonly value = input.required<number>();
  readonly duration = input(800);

  protected readonly shown = signal(0);
  private frame = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(this.frame));

    effect(() => {
      const target = this.value();
      const duration = this.duration();
      untracked(() => {
        cancelAnimationFrame(this.frame);
        const from = this.shown();
        if (from === target || duration <= 0 || prefersReducedMotion() || typeof requestAnimationFrame === 'undefined') {
          this.shown.set(target);
          return;
        }
        const start = performance.now();
        const step = (now: number): void => {
          const progress = Math.min(1, (now - start) / duration);
          this.shown.set(Math.round(from + (target - from) * easeOutCubic(progress)));
          if (progress < 1) {
            this.frame = requestAnimationFrame(step);
          }
        };
        this.frame = requestAnimationFrame(step);
      });
    });
  }
}
