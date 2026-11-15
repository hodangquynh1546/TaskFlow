import { TestBed } from '@angular/core/testing';

import { I18nService } from '../../core/i18n/i18n.service';
import { Recurrence } from '../models/task.models';
import { RepeatLabelComponent } from './repeat-label.component';

function render(recurrence: Recurrence | null | undefined) {
  const fixture = TestBed.createComponent(RepeatLabelComponent);
  fixture.componentRef.setInput('recurrence', recurrence);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const rule = (frequency: Recurrence['frequency'], interval: number): Recurrence => ({ frequency, interval, weekdays: 0, until: null, utcOffsetMinutes: 0 });

describe('RepeatLabelComponent', () => {
  it.each([
    ['Daily', 1, 'Hằng ngày'], ['Weekly', 1, 'Hằng tuần'], ['Monthly', 1, 'Hằng tháng'], ['Yearly', 1, 'Hằng năm'],
    ['Daily', 3, 'Mỗi 3 ngày'], ['Weekly', 2, 'Mỗi 2 tuần'], ['Monthly', 6, 'Mỗi 6 tháng'], ['Yearly', 2, 'Mỗi 2 năm'],
  ] as const)('%s every %i reads "%s"', (frequency, interval, expected) => {
    expect(render(rule(frequency, interval)).textContent!.trim()).toBe(expected);
  });

  it('renders nothing for a task that does not repeat', () => {
    expect(render(null).querySelector('.repeat')).toBeNull();
    expect(render(undefined).querySelector('.repeat')).toBeNull();
  });

  it('follows the interface language and hides its icon from screen readers', () => {
    const i18n = TestBed.inject(I18nService);
    i18n.setLang('en');
    const el = render(rule('Weekly', 2));

    expect(el.textContent).toContain('Every 2 week(s)');
    expect(el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    i18n.setLang('vi');
  });
});
