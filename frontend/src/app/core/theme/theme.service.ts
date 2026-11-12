import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'tf.theme';
const META_COLOR: Record<ResolvedTheme, string> = { light: '#f1f6ff', dark: '#14122e' };

export function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(mode: ThemeMode, systemPrefersDark: boolean): ResolvedTheme {
  return mode === 'system' ? (systemPrefersDark ? 'dark' : 'light') : mode;
}

/** Writes data-theme on <html>. Called from main.ts before the first render so the page never flashes the wrong theme. */
export function applyTheme(doc: Document, theme: ResolvedTheme): void {
  doc.documentElement.dataset['theme'] = theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLOR[theme]);
}

export function applyStoredTheme(doc: Document, win: Window): void {
  applyTheme(doc, resolveTheme(readStoredMode(), win.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false));
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly query = this.document.defaultView?.matchMedia?.('(prefers-color-scheme: dark)') ?? null;

  private readonly modeSignal = signal<ThemeMode>(readStoredMode());
  private readonly systemDark = signal(this.query?.matches ?? false);

  readonly mode = this.modeSignal.asReadonly();
  readonly resolved = computed(() => resolveTheme(this.modeSignal(), this.systemDark()));

  constructor() {
    this.query?.addEventListener('change', (e) => {
      this.systemDark.set(e.matches);
      this.sync();
    });
    this.sync();
  }

  setMode(mode: ThemeMode): void {
    // The class turns on a short colour cross-fade (styles.scss) so the switch is not a flash.
    const root = this.document.documentElement;
    root.classList.add('tf-theme-fade');
    setTimeout(() => root.classList.remove('tf-theme-fade'), 320);
    this.modeSignal.set(mode);
    try {
      if (mode === 'system') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, mode);
      }
    } catch {
      // Private mode: the choice just lasts for this visit.
    }
    this.sync();
  }

  private sync(): void {
    applyTheme(this.document, this.resolved());
  }
}
