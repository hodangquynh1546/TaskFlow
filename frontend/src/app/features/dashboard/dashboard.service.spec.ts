import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { DashboardService } from './dashboard.service';

describe('DashboardService.report', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return { service: TestBed.inject(DashboardService), http: TestBed.inject(HttpTestingController) };
  }

  it('sends the period, the day and the UTC offset', () => {
    const { service, http } = setup();

    service.report('month', '2026-11-01', 420).subscribe();

    const req = http.expectOne((r) => r.url.endsWith('/dashboard/report'));
    expect(req.request.params.get('period')).toBe('month');
    expect(req.request.params.get('date')).toBe('2026-11-01');
    expect(req.request.params.get('utcOffsetMinutes')).toBe('420');
  });

  it.each([['Week', 'week'], ['Month', 'month'], ['Year', 'year']])('turns the API\'s "%s" into "%s", so charts pick the right labels', (fromApi, expected) => {
    const { service, http } = setup();
    let period: string | undefined;

    service.report('week', '2026-11-01', 0).subscribe((r) => (period = r.period));
    http.expectOne((r) => r.url.endsWith('/dashboard/report')).flush({ period: fromApi, from: '2026-01-01', to: '2026-12-31', buckets: [], totals: {} });

    expect(period).toBe(expected);
  });
});
