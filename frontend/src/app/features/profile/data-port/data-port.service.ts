import { HttpClient, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { API_BASE_URL } from '../../../core/config/api.config';

export type DataFormat = 'json' | 'csv';

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  failed: number;
  errors: ImportError[];
}

export interface DownloadedFile {
  filename: string;
  blob: Blob;
}

/** The file name the server suggests, falling back to a sensible one. */
export function filenameFrom(disposition: string | null, format: DataFormat): string {
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition ?? '');
  return match ? decodeURIComponent(match[1]) : `taskflow.${format}`;
}

/** Which format a chosen file is, by its extension; null for anything the importer does not read. */
export function formatOfFile(name: string): DataFormat | null {
  const dot = name.lastIndexOf('.');
  const extension = dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
  return extension === 'json' || extension === 'csv' ? extension : null;
}

@Injectable({ providedIn: 'root' })
export class DataPortService {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(API_BASE_URL)}/data`;

  export(format: DataFormat): Observable<DownloadedFile> {
    return this.http.get(`${this.base}/export`, { params: { format }, observe: 'response', responseType: 'blob' }).pipe(
      map((response: HttpResponse<Blob>) => ({
        filename: filenameFrom(response.headers.get('Content-Disposition'), format),
        blob: response.body as Blob,
      })),
    );
  }

  import(format: DataFormat, content: string): Observable<ImportResult> {
    return this.http.post<ImportResult>(`${this.base}/import`, { format, content });
  }
}
