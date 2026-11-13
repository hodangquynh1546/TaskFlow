import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Plain bars on a 0-based axis with three gridlines. Drawn with CSS instead of a charting library (none is in the
 * stack): it is only ever a bar chart. The numbers are also given to assistive technology by the caller as a table,
 * so the picture itself is hidden from it.
 */
@Component({
  selector: 'tf-bar-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chart" aria-hidden="true" [style.--n]="values().length">
      <div class="axis">
        <span>{{ ticks()[0] }}</span><span>{{ ticks()[1] }}</span><span>{{ ticks()[2] }}</span>
      </div>
      <div class="plot">
        <div class="grid"><span></span><span></span><span></span></div>
        <div class="cols">
          @for (value of values(); track $index) {
            <div class="col" [attr.title]="titles()[$index]">
              <span class="bar" [class.bar--zero]="value === 0" [style.height.%]="percent(value)" [style.--i]="$index"></span>
            </div>
          }
        </div>
        <div class="labels">
          @for (label of labels(); track $index) {
            <span>{{ label }}</span>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; }
    .chart { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: var(--tf-space-3); }
    .axis { display: flex; flex-direction: column; justify-content: space-between; height: 160px; text-align: right; color: var(--tf-ink-soft); font-size: var(--tf-text-caption); font-variant-numeric: tabular-nums; line-height: 1; transform: translateY(-0.4em); padding-bottom: 0.4em; }
    .plot { position: relative; min-width: 0; }
    .grid { position: absolute; inset: 0 0 auto 0; height: 160px; display: flex; flex-direction: column; justify-content: space-between; pointer-events: none; }
    .grid span { border-top: 2px dashed var(--tf-line); }
    .grid span:last-child { border-top-style: solid; }
    .cols { position: relative; display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); align-items: end; height: 160px; gap: clamp(2px, 1.2%, 10px); }
    .col { height: 100%; display: flex; align-items: flex-end; justify-content: center; }
    .bar {
      width: 100%; max-width: 44px; min-height: 0; border: 2px solid var(--tf-edge); border-bottom-width: 0; border-radius: 6px 6px 0 0;
      background: var(--chart-color, var(--tf-tangerine)); transform-origin: bottom; animation: grow 520ms var(--tf-ease-pop) both; animation-delay: calc(var(--i) * 22ms);
    }
    .bar--zero { border: 0; background: transparent; }
    .col:hover .bar { filter: brightness(1.06); }
    .labels { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: clamp(2px, 1.2%, 10px); margin-top: var(--tf-space-2); color: var(--tf-ink-soft); font-size: var(--tf-text-caption); text-align: center; font-variant-numeric: tabular-nums; }
    .labels span { overflow: visible; white-space: nowrap; }
    @keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
  `,
})
export class BarChartComponent {
  readonly values = input.required<readonly number[]>();
  /** Same length as values; an empty string hides that label (a month of 31 labels would not fit). */
  readonly labels = input.required<readonly string[]>();
  /** Hover text for each bar. */
  readonly titles = input<readonly string[]>([]);
  readonly max = input.required<number>();
  /** Top, middle and bottom axis labels. */
  readonly ticks = input.required<readonly [string, string, string]>();

  protected readonly scale = computed(() => (this.max() > 0 ? this.max() : 1));

  protected percent(value: number): number {
    return Math.min(100, (value / this.scale()) * 100);
  }
}
