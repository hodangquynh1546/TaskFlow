import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NzButtonModule } from 'ng-zorro-antd/button';

import { ApiError } from '../../../core/http/api-error';
import { I18nService } from '../../../core/i18n/i18n.service';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { NotifyService } from '../../../core/notify/notify.service';
import { DataFormat, DataPortService, ImportResult, formatOfFile } from './data-port.service';

/** Download everything as a file, or bring a file in. Used on the profile page. */
@Component({
  selector: 'tf-data-port',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NzButtonModule, TranslatePipe],
  template: `
    <h2 id="data-title" class="title">{{ 'data.title' | t }}</h2>

    <p class="hint">{{ 'data.exportHint' | t }}</p>
    <div class="actions">
      <button type="button" nz-button [nzLoading]="exporting() === 'json'" [disabled]="exporting() !== null" (click)="download('json')">{{ 'data.exportJson' | t }}</button>
      <button type="button" nz-button [nzLoading]="exporting() === 'csv'" [disabled]="exporting() !== null" (click)="download('csv')">{{ 'data.exportCsv' | t }}</button>
    </div>

    <h3 class="subtitle">{{ 'data.importTitle' | t }}</h3>
    <p class="hint">{{ 'data.importHint' | t }}</p>
    <input #file class="file" type="file" accept=".json,.csv,application/json,text/csv" [attr.aria-label]="'data.chooseFile' | t" (change)="chosen($event)" />
    <button type="button" nz-button nzType="primary" [nzLoading]="importing()" [disabled]="importing()" (click)="file.click()">{{ 'data.chooseFile' | t }}</button>

    @if (problem()) {
      <p class="problem" role="alert">{{ problem() }}</p>
    }

    @if (result(); as r) {
      <div class="result" role="status">
        <p class="result__line">{{ 'data.imported' | t: { n: r.imported } }}</p>
        @if (r.duplicates > 0) {
          <p class="result__line">{{ 'data.duplicates' | t: { n: r.duplicates } }}</p>
        }
        @if (r.failed > 0) {
          <p class="result__line result__line--bad">{{ 'data.failed' | t: { n: r.failed } }}</p>
          <ul class="errors">
            @for (error of r.errors; track $index) {
              <li>{{ 'data.errorRow' | t: { row: error.row, field: error.field, message: error.message } }}</li>
            }
          </ul>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .title { font-size: var(--tf-text-h3); margin-bottom: var(--tf-space-3); }
    .subtitle { font-size: var(--tf-text-body); margin: var(--tf-space-6) 0 var(--tf-space-2); }
    .hint { color: var(--tf-ink-soft); font-size: var(--tf-text-small); margin-bottom: var(--tf-space-3); }
    .actions { display: flex; flex-wrap: wrap; gap: var(--tf-space-2); }
    .file { display: none; }
    .problem { margin-top: var(--tf-space-4); padding: var(--tf-space-3) var(--tf-space-4); border: 2px solid var(--tf-edge); border-radius: var(--tf-radius-sticker); background: var(--tf-bubblegum-tint); font-weight: 500; }
    .result { margin-top: var(--tf-space-4); }
    .result__line { font-weight: 600; margin-bottom: var(--tf-space-1); }
    .result__line--bad { color: var(--tf-alarm); }
    .errors { margin: var(--tf-space-2) 0 0; padding-left: var(--tf-space-5, 1.25rem); font-size: var(--tf-text-small); max-height: 12rem; overflow-y: auto; }
  `,
})
export class DataPortComponent {
  private readonly data = inject(DataPortService);
  private readonly notify = inject(NotifyService);
  private readonly i18n = inject(I18nService);

  protected readonly exporting = signal<DataFormat | null>(null);
  protected readonly importing = signal(false);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly problem = signal('');

  protected download(format: DataFormat): void {
    this.exporting.set(format);
    this.problem.set('');
    this.data.export(format).subscribe({
      next: ({ filename, blob }) => {
        this.exporting.set(null);
        saveBlob(blob, filename);
        this.notify.success(this.i18n.t('toast.exported'));
      },
      error: (error: ApiError) => {
        this.exporting.set(null);
        this.problem.set(error.message);
      },
    });
  }

  protected async chosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still counts as a change
    if (!file) {
      return;
    }

    this.result.set(null);
    this.problem.set('');
    const format = formatOfFile(file.name);
    if (format === null) {
      this.problem.set(this.i18n.t('data.unknownFile'));
      return;
    }

    this.importing.set(true);
    let content: string;
    try {
      content = await file.text();
    } catch {
      this.importing.set(false);
      this.problem.set(this.i18n.t('data.unreadable'));
      return;
    }

    this.data.import(format, content).subscribe({
      next: (result) => {
        this.importing.set(false);
        this.result.set(result);
        if (result.imported > 0) {
          this.notify.success(this.i18n.t('data.imported', { n: result.imported }));
        }
      },
      error: (error: ApiError) => {
        this.importing.set(false);
        this.problem.set(error.fieldErrors['content']?.[0] ?? error.fieldErrors['format']?.[0] ?? error.message);
      },
    });
  }
}

/** Hands the browser a file to save. The link is created and clicked in place, never added to the page. */
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
