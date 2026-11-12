import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideNzIconsTesting } from 'ng-zorro-antd/icon/testing';

import { DueLabelComponent } from './due-label.component';
import { EmptyStateComponent } from './empty-state.component';
import { ErrorStateComponent } from './error-state.component';
import { PriorityMarkerComponent } from './priority-marker.component';
import { StatusIndicatorComponent } from './status-indicator.component';

function render<T>(type: new () => T, inputs: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({ providers: [provideNzIconsTesting()] });
  const fixture = TestBed.createComponent(type);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

/** The innermost span holding the text; outer wrappers also report the same textContent. */
const leafSpanWithText = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('span')].find((s) => s.children.length === 0 && s.textContent?.trim() === text);

describe('StatusIndicatorComponent', () => {
  it.each([
    ['Todo', 'Chưa làm'],
    ['InProgress', 'Đang làm'],
    ['Completed', 'Hoàn thành'],
  ] as const)('%s reads "%s" and has its own shape', (status, label) => {
    const { el } = render(StatusIndicatorComponent, { status });

    expect(el.textContent).toContain(label);
    expect(el.querySelector('svg')).not.toBeNull();
    expect(el.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('draws a different icon for each status so colour is never the only cue', () => {
    const shapes = (['Todo', 'InProgress', 'Completed'] as const).map((status) => {
      TestBed.resetTestingModule();
      return render(StatusIndicatorComponent, { status }).el.querySelector('svg')!.innerHTML.replace(/\s+/g, '');
    });

    expect(new Set(shapes).size).toBe(3);
  });

  it('compact hides the text visually but keeps it for screen readers', () => {
    const { el } = render(StatusIndicatorComponent, { status: 'Completed', compact: true });
    const label = leafSpanWithText(el, 'Hoàn thành');

    expect(label?.classList.contains('tf-visually-hidden')).toBe(true);
  });

  it('shows the text normally when not compact', () => {
    const { el } = render(StatusIndicatorComponent, { status: 'Todo' });
    const label = leafSpanWithText(el, 'Chưa làm');

    expect(label).toBeDefined();
    expect(label?.classList.contains('tf-visually-hidden')).toBe(false);
  });
});

describe('PriorityMarkerComponent', () => {
  it.each([
    ['Low', 1],
    ['Medium', 2],
    ['High', 3],
  ] as const)('%s lights %i bar(s)', (priority, bars) => {
    const { el } = render(PriorityMarkerComponent, { priority });

    expect(el.querySelectorAll('.bar').length).toBe(3);
    expect(el.querySelectorAll('.bar--on').length).toBe(bars);
  });

  it('only High is tinted', () => {
    expect(render(PriorityMarkerComponent, { priority: 'High' }).el.querySelector('.priority--high')).not.toBeNull();
    TestBed.resetTestingModule();
    expect(render(PriorityMarkerComponent, { priority: 'Medium' }).el.querySelector('.priority--high')).toBeNull();
  });

  it('gives screen readers a full sentence while the label is visually hidden', () => {
    const { el } = render(PriorityMarkerComponent, { priority: 'High' });
    const text = el.querySelector('.tf-visually-hidden');

    expect(text?.textContent).toBe('Ưu tiên cao');
    expect(el.querySelector('.priority')!.getAttribute('title')).toBe('Ưu tiên cao');
  });

  it('shows just the label when showLabel is on', () => {
    const { el } = render(PriorityMarkerComponent, { priority: 'Medium', showLabel: true });

    expect(el.querySelector('.tf-visually-hidden')).toBeNull();
    expect(el.textContent).toContain('Trung bình');
  });
});

describe('DueLabelComponent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 12, 10, 0, 0));
  });
  afterEach(() => vi.useRealTimers());

  const due = (offsetMs: number) => new Date(new Date(2026, 10, 12, 10, 0, 0).getTime() + offsetMs).toISOString();

  it('flags an overdue task with text, an icon and the overdue style', () => {
    const { el } = render(DueLabelComponent, { dueDate: due(-2 * 86_400_000), status: 'Todo' });

    expect(el.textContent).toContain('Quá hạn 2 ngày');
    expect(el.querySelector('.due--overdue')).not.toBeNull();
    expect(el.querySelector('svg')).not.toBeNull();
  });

  it('flags a task due soon', () => {
    const { el } = render(DueLabelComponent, { dueDate: due(5 * 3_600_000), status: 'InProgress' });

    expect(el.textContent).toContain('Còn 5 giờ');
    expect(el.querySelector('.due--soon')).not.toBeNull();
  });

  it('does not flag a completed task and shows no warning icon', () => {
    const { el } = render(DueLabelComponent, { dueDate: due(-5 * 86_400_000), status: 'Completed' });

    expect(el.querySelector('.due--overdue')).toBeNull();
    expect(el.querySelector('svg')).toBeNull();
  });

  it('says when there is no due date', () => {
    const { el } = render(DueLabelComponent, { dueDate: null, status: 'Todo' });

    expect(el.textContent).toContain('Chưa đặt hạn');
  });

  it('exposes the full date as a tooltip', () => {
    const { el } = render(DueLabelComponent, { dueDate: due(10 * 86_400_000), status: 'Todo' });

    expect(el.querySelector('.due')!.getAttribute('title')).toMatch(/^Hạn hoàn thành: \d{2}\/\d{2}\/\d{4}/);
  });

  it('updates when the inputs change', () => {
    @Component({ imports: [DueLabelComponent], template: '<tf-due [dueDate]="due()" [status]="status()" />' })
    class Host {
      readonly due = signal<string | null>(due(-86_400_000));
      readonly status = signal<'Todo' | 'Completed'>('Todo');
    }
    TestBed.configureTestingModule({ providers: [provideNzIconsTesting()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Quá hạn');

    fixture.componentInstance.status.set('Completed');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Quá hạn');
  });
});

describe('EmptyStateComponent', () => {
  it('shows the title and description', () => {
    const { el } = render(EmptyStateComponent, { title: 'Chưa có công việc nào.', description: 'Tạo công việc đầu tiên.' });

    expect(el.textContent).toContain('Chưa có công việc nào.');
    expect(el.textContent).toContain('Tạo công việc đầu tiên.');
  });

  it('offers no button unless an action is named', () => {
    expect(render(EmptyStateComponent, { title: 'x' }).el.querySelector('button')).toBeNull();
  });

  it('emits when the action is chosen', () => {
    const { fixture, el } = render(EmptyStateComponent, { title: 'x', actionLabel: 'Tạo công việc' });
    const spy = vi.fn();
    fixture.componentInstance.action.subscribe(spy);

    el.querySelector('button')!.click();

    expect(el.querySelector('button')!.textContent).toContain('Tạo công việc');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorStateComponent', () => {
  it('is announced to assistive technology and shows the message', () => {
    const { el } = render(ErrorStateComponent, { message: 'Không tải được danh sách công việc.' });

    expect(el.querySelector('[role="alert"]')).not.toBeNull();
    expect(el.textContent).toContain('Không tải được danh sách công việc.');
  });

  it('offers a retry that emits', () => {
    const { fixture, el } = render(ErrorStateComponent, { message: 'x' });
    const spy = vi.fn();
    fixture.componentInstance.retry.subscribe(spy);

    el.querySelector('button')!.click();

    expect(el.querySelector('button')!.textContent).toContain('Thử lại');
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('can hide the retry button', () => {
    expect(render(ErrorStateComponent, { message: 'x', retryLabel: '' }).el.querySelector('button')).toBeNull();
  });
});
