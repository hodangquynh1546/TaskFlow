import { TestBed } from '@angular/core/testing';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';
import { Subject, of, throwError } from 'rxjs';

import { ApiError } from '../../../core/http/api-error';
import { DashboardService, Report, ReportPeriod } from '../dashboard.service';
import { ReportComponent } from './report.component';

const bucket = (start: string, minutes = 0, completedTasks = 0) => ({ start, minutes, completedTasks });

const week = (patch: Partial<Report['totals']> = {}): Report => ({
  period: 'week', from: '2026-11-09', to: '2026-11-15',
  buckets: [bucket('2026-11-09', 150, 2), bucket('2026-11-10', 0, 0), bucket('2026-11-11', 90, 1), bucket('2026-11-12'), bucket('2026-11-13'), bucket('2026-11-14'), bucket('2026-11-15')],
  totals: { completedTasks: 3, minutes: 240, elapsedDays: 5, averagePerDayMinutes: 48, averagePerWeekMinutes: null, averagePerMonthMinutes: null, ...patch },
});

const year: Report = {
  period: 'year', from: '2026-01-01', to: '2026-12-31',
  buckets: Array.from({ length: 12 }, (_, i) => bucket(`2026-${String(i + 1).padStart(2, '0')}-01`, i === 10 ? 600 : 0, i === 10 ? 4 : 0)),
  totals: { completedTasks: 4, minutes: 600, elapsedDays: 317, averagePerDayMinutes: 2, averagePerWeekMinutes: 13, averagePerMonthMinutes: 58 },
};

function setup(first: unknown = of(week())) {
  const report = vi.fn().mockReturnValue(first);
  TestBed.configureTestingModule({ providers: [provideNzIconsTesting(), { provide: DashboardService, useValue: { report } }] });
  const fixture = TestBed.createComponent(ReportComponent);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const press = async (button: HTMLElement | null | undefined) => {
    button!.click();
    await settle();
  };
  const seg = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('.seg__btn')].find((b) => b.textContent!.trim() === label);
  const tile = (label: string) => [...el.querySelectorAll('.tile')].find((t) => t.querySelector('.tile__label')!.textContent === label)?.querySelector('.tile__value')?.textContent;
  return { fixture, el, report, settle, press, seg, tile };
}

describe('ReportComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 13, 12, 0)); // a Friday
  });
  afterEach(() => vi.useRealTimers());

  it('opens on the current week and asks the server for it in the user\'s own time zone', () => {
    const { report } = setup();

    const [period, date, offset] = report.mock.calls[0];
    expect([period, date]).toEqual(['week', '2026-11-13']);
    expect(offset).toBe(-new Date().getTimezoneOffset());
  });

  it('shows total, daily average and tasks done for a week, but no weekly or monthly average', () => {
    const { tile } = setup();

    expect(tile('Tổng thời gian')).toBe('4 giờ');
    expect(tile('Trung bình mỗi ngày')).toBe('48 phút');
    expect(tile('Việc đã hoàn thành')).toBe('3');
    expect(tile('Trung bình mỗi tuần')).toBeUndefined();
    expect(tile('Trung bình mỗi tháng')).toBeUndefined();
  });

  it('draws one bar per day in each of the two charts, with the date and amount as the hover text', () => {
    const { el } = setup();

    const charts = [...el.querySelectorAll('tf-bar-chart')];
    expect(charts).toHaveLength(2);
    expect(charts.map((c) => c.querySelectorAll('.col').length)).toEqual([7, 7]);
    const first = charts[0].querySelector('.col')!.getAttribute('title')!;
    expect(first).toContain('2 giờ 30 phút');
    expect(first).toContain('9 tháng 11');
    expect(charts[0].querySelector<HTMLElement>('.bar')!.style.height).toBe('62.5%'); // 2.5 h on a 4 h axis
  });

  it('gives assistive technology the same numbers as a table, and hides the picture from it', () => {
    const { el } = setup();

    expect(el.querySelector('tf-bar-chart .chart')!.getAttribute('aria-hidden')).toBe('true');
    const rows = [...el.querySelectorAll('table tbody tr')].map((r) => [...r.querySelectorAll('th, td')].map((c) => c.textContent!.trim()));
    expect(rows).toHaveLength(7);
    expect(rows[0].slice(1)).toEqual(['2 giờ 30 phút', '2']);
    expect(rows[1].slice(1)).toEqual(['0 phút', '0']);
  });

  it('a month adds the weekly average and a year adds the monthly one', async () => {
    const { report, seg, press, tile } = setup();

    report.mockReturnValue(of({ ...week({ averagePerWeekMinutes: 336 }), period: 'month' }));
    await press(seg('Tháng'));
    expect(report.mock.calls.at(-1)![0]).toBe('month');
    expect(tile('Trung bình mỗi tuần')).toBe('5 giờ 36 phút');
    expect(tile('Trung bình mỗi tháng')).toBeUndefined();

    report.mockReturnValue(of(year));
    await press(seg('Năm'));
    expect(report.mock.calls.at(-1)![0]).toBe('year');
    expect(tile('Trung bình mỗi tuần')).toBe('13 phút');
    expect(tile('Trung bình mỗi tháng')).toBe('58 phút');
  });

  it('a year labels its bars with short month names that fit, not whole phrases', async () => {
    const { el, report, seg, press } = setup();
    report.mockReturnValue(of(year));

    await press(seg('Năm'));

    const labels = [...el.querySelector('tf-bar-chart')!.querySelectorAll('.labels span')].map((s) => s.textContent!.trim());
    expect(labels).toEqual(['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12']);
  });

  it('marks the chosen period for assistive technology', async () => {
    const { seg, press } = setup();

    expect(seg('Tuần')!.getAttribute('aria-pressed')).toBe('true');
    await press(seg('Năm'));
    expect(seg('Tuần')!.getAttribute('aria-pressed')).toBe('false');
    expect(seg('Năm')!.getAttribute('aria-pressed')).toBe('true');
  });

  it('steps back to earlier periods, cannot go past the current one, and can jump back to it', async () => {
    const { el, report, press } = setup();
    const [prev, next, current] = [...el.querySelectorAll<HTMLButtonElement>('.stepper button')];

    expect(next.disabled).toBe(true);
    expect(current.disabled).toBe(true);

    await press(prev);
    expect(report.mock.calls.at(-1)!.slice(0, 2)).toEqual(['week', '2026-11-06']);
    expect(next.disabled).toBe(false);
    expect(current.disabled).toBe(false);

    await press(prev);
    expect(report.mock.calls.at(-1)![1]).toBe('2026-10-30');

    await press(next);
    expect(report.mock.calls.at(-1)![1]).toBe('2026-11-06');

    await press(current);
    expect(report.mock.calls.at(-1)![1]).toBe('2026-11-13');
  });

  it('changing the period returns to the current one', async () => {
    const { el, report, seg, press } = setup();
    await press(el.querySelector<HTMLButtonElement>('.stepper button'));

    await press(seg('Tháng'));

    expect(report.mock.calls.at(-1)!.slice(0, 2)).toEqual(['month', '2026-11-01']);
  });

  it('before a period has started there is nothing to average, so the average shows a dash', () => {
    const { tile } = setup(of(week({ elapsedDays: 0, averagePerDayMinutes: 0, completedTasks: 0, minutes: 0 })));

    expect(tile('Trung bình mỗi ngày')).toBe('—');
  });

  it('a period with no finished tasks explains why instead of drawing empty charts', () => {
    const empty: Report = { ...week(), buckets: week().buckets.map((b) => bucket(b.start)), totals: { ...week().totals, completedTasks: 0, minutes: 0, averagePerDayMinutes: 0 } };
    const { el } = setup(of(empty));

    expect(el.querySelector('tf-bar-chart')).toBeNull();
    expect(el.querySelector('.empty')!.textContent).toContain('Chưa có việc nào hoàn thành');
  });

  it('shows a skeleton while the first report loads', () => {
    const { el } = setup(new Subject());

    expect(el.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('.tiles')).toBeNull();
  });

  it('keeps the previous report on screen, dimmed, while the next one loads', async () => {
    const { el, report, press } = setup();
    report.mockReturnValue(new Subject());

    await press(el.querySelector<HTMLButtonElement>('.stepper button'));

    expect(el.querySelector('.tiles')).not.toBeNull();
    expect(el.querySelector('.report__body')!.classList.contains('report__body--busy')).toBe(true);
  });

  it('a failure shows the server message with a retry that asks again', async () => {
    const { el, report, press } = setup(throwError(() => new ApiError(500, 'Máy chủ gặp sự cố.')));

    expect(el.textContent).toContain('Máy chủ gặp sự cố.');
    report.mockReturnValue(of(week()));
    await press(el.querySelector<HTMLButtonElement>('tf-error-state button'));

    expect(report).toHaveBeenCalledTimes(2);
    expect(el.querySelector('.tiles')).not.toBeNull();
  });
});

describe('ReportComponent in another language', () => {
  it('follows the interface language for labels and numbers', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 13, 12, 0));
    const { I18nService } = await import('../../../core/i18n/i18n.service');
    const { el, fixture, tile } = setup();
    const i18n = TestBed.inject(I18nService);

    i18n.setLang('ja');
    fixture.detectChanges();

    expect(el.querySelector('.report__title')!.textContent).toBe('作業時間レポート');
    expect(tile('合計時間')).toBe('4時間');
    expect(tile('1日あたりの平均')).toBe('48分');
    i18n.setLang('vi');
    vi.useRealTimers();
  });
});

export type { ReportPeriod };
