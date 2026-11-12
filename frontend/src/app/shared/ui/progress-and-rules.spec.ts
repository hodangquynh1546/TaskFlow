import { TestBed } from '@angular/core/testing';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';

import { DashboardSummary } from '../models/task.models';
import { PasswordRulesComponent } from './password-rules.component';
import { ProgressStripComponent } from './progress-strip.component';

function render<T>(type: new () => T, inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ providers: [provideNzIconsTesting()] });
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) {
    fixture.componentRef.setInput(k, v);
  }
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const summary = (patch: Partial<DashboardSummary> = {}): DashboardSummary => ({ total: 12, todo: 2, inProgress: 2, completed: 8, overdue: 1, ...patch });

describe('ProgressStripComponent', () => {
  it('draws one segment per non-empty status, in the order done, doing, to do, sized by count', () => {
    const { el } = render(ProgressStripComponent, { summary: summary() });
    const segments = [...el.querySelectorAll<HTMLElement>('.segment')];

    expect(segments.map((s) => s.className.replace('segment ', ''))).toEqual(['segment--Completed', 'segment--InProgress', 'segment--Todo']);
    expect(segments.map((s) => s.style.flexGrow)).toEqual(['8', '2', '2']);
  });

  it('leaves out a status with no tasks instead of drawing an empty sliver', () => {
    const { el } = render(ProgressStripComponent, { summary: summary({ todo: 0, inProgress: 0, completed: 12 }) });

    expect(el.querySelectorAll('.segment')).toHaveLength(1);
  });

  it('describes the bar in words for assistive technology', () => {
    const { el } = render(ProgressStripComponent, { summary: summary() });

    expect(el.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('8 trên 12 việc đã hoàn thành: 2 chưa làm, 2 đang làm, 8 hoàn thành');
  });

  it('repeats every count as visible text, so the bar is never the only carrier', () => {
    const { el } = render(ProgressStripComponent, { summary: summary() });
    const legend = [...el.querySelectorAll('.legend li')].map((li) => [li.querySelector('tf-status')!.textContent!.trim(), li.querySelector('.count')!.textContent!.trim()]);

    expect(legend).toEqual([['Hoàn thành', '8'], ['Đang làm', '2'], ['Chưa làm', '2']]);
  });

  it('shows an empty track and says so when there are no tasks', () => {
    const { el } = render(ProgressStripComponent, { summary: summary({ total: 0, todo: 0, inProgress: 0, completed: 0, overdue: 0 }) });

    expect(el.querySelectorAll('.segment')).toHaveLength(0);
    expect(el.querySelector('[role="img"]')!.getAttribute('aria-label')).toBe('Chưa có công việc nào');
  });

  it('updates when the numbers change', () => {
    const { fixture, el } = render(ProgressStripComponent, { summary: summary() });

    fixture.componentRef.setInput('summary', summary({ completed: 10, todo: 0, inProgress: 2 }));
    fixture.detectChanges();

    expect(el.querySelector('.segment--Completed')!.getAttribute('style')).toContain('10');
    expect(el.querySelector('.segment--Todo')).toBeNull();
  });
});

describe('PasswordRulesComponent', () => {
  const met = (el: HTMLElement) => [...el.querySelectorAll('li')].filter((li) => li.classList.contains('met')).map((li) => li.textContent!.trim().split(',')[0].trim());

  it('lists all four requirements, none met for an empty password', () => {
    const { el } = render(PasswordRulesComponent, { password: '' });

    expect(el.querySelectorAll('li')).toHaveLength(4);
    expect(met(el)).toEqual([]);
  });

  it('marks requirements as they are satisfied', () => {
    const { fixture, el } = render(PasswordRulesComponent, { password: 'abc' });
    expect(met(el)).toEqual(['Một chữ thường']);

    fixture.componentRef.setInput('password', 'Passw0rd');
    fixture.detectChanges();

    expect(met(el)).toHaveLength(4);
  });

  it('tells screen readers whether each requirement is met, not just by colour', () => {
    const { el } = render(PasswordRulesComponent, { password: 'abc' });
    const hidden = [...el.querySelectorAll('.tf-visually-hidden')].map((s) => s.textContent!.trim());

    expect(hidden).toEqual([', chưa đạt', ', chưa đạt', ', đã đạt', ', chưa đạt']);
  });

  it('is a labelled list', () => {
    expect(render(PasswordRulesComponent, { password: '' }).el.querySelector('ul')!.getAttribute('aria-label')).toBe('Yêu cầu mật khẩu');
  });
});
