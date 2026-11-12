import { TestBed } from '@angular/core/testing';

import { TimeBlockComponent } from './time-block.component';

function render(startDate: string | null, durationMinutes: number | null) {
  const fixture = TestBed.createComponent(TimeBlockComponent);
  fixture.componentRef.setInput('task', { startDate, durationMinutes });
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('TimeBlockComponent', () => {
  const start = (h: number, m = 0) => new Date(new Date().getFullYear(), 10, 12, h, m).toISOString();

  it('shows the range and the length for a scheduled task', () => {
    const el = render(start(9), 90);

    expect(el.textContent).toContain('12/11, 09:00–10:30');
    expect(el.querySelector('.block__duration')!.textContent).toBe('1 giờ 30 phút');
  });

  it('shows only the start time when no length is set', () => {
    const el = render(start(14, 15), null);

    expect(el.textContent).toContain('12/11, 14:15');
    expect(el.querySelector('.block__duration')).toBeNull();
  });

  it('marks a length without a start as an estimate', () => {
    const el = render(null, 45);

    expect(el.textContent).toContain('Dự kiến');
    expect(el.textContent).toContain('45 phút');
  });

  it('renders nothing for a task with no planning', () => {
    expect(render(null, null).querySelector('.block')).toBeNull();
  });

  it('gives a tooltip with everything in one sentence, and hides its icon from screen readers', () => {
    const el = render(start(9), 30);

    expect(el.querySelector('.block')!.getAttribute('title')).toBe('12/11, 09:00–09:30 (30 phút)');
    expect(el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });
});
