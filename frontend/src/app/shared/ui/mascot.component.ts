import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type MascotMood = 'happy' | 'wave' | 'cheer' | 'worried' | 'sleepy';

/**
 * Tí, the app's one character. Pure SVG so it follows the theme and costs no download. Used in only four places
 * (dashboard greeting, empty states, completion cheers, 404) so it stays special.
 */
@Component({
  selector: 'tf-mascot',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg class="ti" [class]="'ti--' + mood()" [class.ti--float]="animated()" viewBox="0 0 130 140" [attr.width]="size()" [attr.height]="size() * 140 / 130"
         [attr.role]="label() ? 'img' : null" [attr.aria-label]="label() || null" [attr.aria-hidden]="label() ? null : 'true'" focusable="false">
      <ellipse class="shadow" cx="65" cy="130" rx="30" ry="5" />

      <!-- arms sit behind the body -->
      <g class="arms" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round">
        @if (mood() === 'cheer') {
          <path d="M28 88 Q10 72 12 54" />
          <path d="M102 88 Q120 72 118 54" />
        } @else {
          <path d="M26 92 Q12 98 10 108" />
          @if (mood() === 'wave') {
            <path class="arm-wave" d="M104 90 Q118 76 116 58" />
          } @else {
            <path d="M104 92 Q118 98 120 108" />
          }
        }
      </g>

      <path class="body" d="M65 10 C84 38 106 58 106 86 C106 110 88 124 65 124 C42 124 24 110 24 86 C24 58 46 38 65 10 Z" />
      <path class="shine" d="M45 70 Q47 56 56 46" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity="0.55" />

      <!-- eyes -->
      @if (mood() === 'sleepy') {
        <path d="M44 86 Q51 92 58 86 M72 86 Q79 92 86 86" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
      } @else {
        <g class="eyes">
          <g class="eye"><circle cx="51" cy="84" r="9" fill="#fff" stroke="currentColor" stroke-width="3" /><circle cx="53" cy="85" r="4.5" fill="currentColor" /></g>
          <g class="eye"><circle cx="79" cy="84" r="9" fill="#fff" stroke="currentColor" stroke-width="3" /><circle cx="81" cy="85" r="4.5" fill="currentColor" /></g>
        </g>
      }
      @if (mood() === 'worried') {
        <path d="M40 76 L58 68 M90 76 L72 68" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" />
      }

      <!-- cheeks and mouth -->
      <ellipse cx="38" cy="98" rx="6" ry="4" fill="#ff7aae" opacity="0.7" />
      <ellipse cx="92" cy="98" rx="6" ry="4" fill="#ff7aae" opacity="0.7" />
      @switch (mood()) {
        @case ('cheer') { <path d="M52 98 Q65 118 78 98 Z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round" /> }
        @case ('worried') { <path d="M55 106 Q65 98 75 106" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" /> }
        @case ('sleepy') { <ellipse cx="65" cy="104" rx="4" ry="3" fill="currentColor" /> }
        @default { <path d="M54 100 Q65 112 76 100" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" /> }
      }

      @if (mood() === 'worried') {
        <path class="sweat" d="M100 52 C104 58 107 62 107 66 A7 7 0 0 1 93 66 C93 62 96 58 100 52 Z" fill="#7db8ff" stroke="currentColor" stroke-width="2.5" />
      }
      @if (mood() === 'sleepy') {
        <text class="zzz" x="94" y="48" font-size="20" font-weight="800" fill="currentColor" font-family="Baloo 2, sans-serif">z</text>
        <text class="zzz zzz--2" x="106" y="32" font-size="14" font-weight="800" fill="currentColor" font-family="Baloo 2, sans-serif">z</text>
      }
    </svg>
  `,
  styles: `
    :host { display: inline-block; line-height: 0; color: var(--tf-on-color); }
    .ti { overflow: visible; }
    .body { fill: var(--tf-tangerine); stroke: currentColor; stroke-width: 4; stroke-linejoin: round; }
    .shadow { fill: var(--tf-shadow-color); opacity: 0.18; transform-origin: 65px 130px; }
    .ti--float { animation: ti-float 3.2s ease-in-out infinite; }
    .ti--float .shadow { animation: ti-shadow 3.2s ease-in-out infinite; }
    .ti--cheer { animation: ti-jump 0.7s var(--tf-ease-pop) 2; }
    .eye { transform-box: fill-box; transform-origin: center; animation: ti-blink 5s infinite; }
    .eye:nth-child(2) { animation-delay: 0.02s; }
    .arm-wave { transform-box: view-box; transform-origin: 104px 90px; animation: ti-wave 0.8s ease-in-out 3; }
    .sweat { animation: ti-sweat 1.6s ease-in infinite; }
    .zzz { animation: ti-zzz 2.4s ease-in-out infinite; }
    .zzz--2 { animation-delay: 0.8s; }

    @keyframes ti-float { 50% { transform: translateY(-6px); } }
    @keyframes ti-shadow { 50% { transform: scale(0.85); opacity: 0.12; } }
    @keyframes ti-jump { 0%, 100% { transform: translateY(0); } 40% { transform: translateY(-18px) rotate(-3deg); } 70% { transform: translateY(0) rotate(2deg); } }
    @keyframes ti-blink { 0%, 94%, 100% { transform: scaleY(1); } 97% { transform: scaleY(0.1); } }
    @keyframes ti-wave { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-22deg); } }
    @keyframes ti-sweat { 0% { transform: translateY(-3px); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(8px); opacity: 0; } }
    @keyframes ti-zzz { 0% { transform: translate(0, 6px); opacity: 0; } 40% { opacity: 1; } 100% { transform: translate(4px, -8px); opacity: 0; } }
  `,
})
export class MascotComponent {
  readonly mood = input<MascotMood>('happy');
  readonly size = input(96);
  /** Idle bobbing. Off by default so lists of mascots never move at once. */
  readonly animated = input(false);
  /** Set when the mascot says something; leave empty when it is decoration. */
  readonly label = input<string>('');
}
