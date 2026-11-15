import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DataPortService, filenameFrom, formatOfFile } from './data-port.service';

describe('filenameFrom', () => {
  it.each([
    ['attachment; filename=taskflow-20261115-1030.json; filename*=UTF-8\'\'taskflow-20261115-1030.json', 'json', 'taskflow-20261115-1030.json'],
    ['attachment; filename="my file.csv"', 'csv', 'my file.csv'],
    [null, 'csv', 'taskflow.csv'],
    ['inline', 'json', 'taskflow.json'],
  ] as const)('%s gives %s', (header, format, expected) => {
    expect(filenameFrom(header, format)).toBe(expected);
  });
});

describe('formatOfFile', () => {
  it.each([['a.json', 'json'], ['Báo cáo.CSV', 'csv'], ['x.tar.json', 'json']])('%s is %s', (name, expected) => {
    expect(formatOfFile(name)).toBe(expected);
  });

  it.each([['a.txt'], ['json'], ['a.xlsx'], ['']])('%j is not read', (name) => {
    expect(formatOfFile(name)).toBeNull();
  });
});

describe('DataPortService', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { service: TestBed.inject(DataPortService), http: TestBed.inject(HttpTestingController) };
  }

  it('asks for the file in the chosen format and keeps the name the server gave it', () => {
    const { service, http } = setup();
    let got: { filename: string; blob: Blob } | undefined;

    service.export('csv').subscribe((f) => (got = f));
    const req = http.expectOne((r) => r.url.endsWith('/data/export'));
    req.flush(new Blob(['a']), { headers: new HttpHeaders({ 'Content-Disposition': 'attachment; filename=taskflow-1.csv' }) });

    expect(req.request.params.get('format')).toBe('csv');
    expect(req.request.responseType).toBe('blob');
    expect(got!.filename).toBe('taskflow-1.csv');
    expect(got!.blob.size).toBe(1);
  });

  it('sends the format and the file text to import', () => {
    const { service, http } = setup();
    let result: unknown;

    service.import('json', '{"tasks":[]}').subscribe((r) => (result = r));
    const req = http.expectOne((r) => r.url.endsWith('/data/import'));
    req.flush({ imported: 2, duplicates: 0, failed: 0, errors: [] });

    expect(req.request.body).toEqual({ format: 'json', content: '{"tasks":[]}' });
    expect(result).toEqual({ imported: 2, duplicates: 0, failed: 0, errors: [] });
  });
});
