import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { CountComponent } from './count.component';

@Component({ imports: [CountComponent], template: `<tf-count [value]="value()" [duration]="duration()" />` })
class Host {
  readonly value = signal(8);
  readonly duration = signal(800);
}

const motionAllowed = () =>
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });

describe('CountComponent', () => {
  const original = window.matchMedia;
  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: original });
    vi.useRealTimers();
  });

  it('shows the final number at once for people who asked for reduced motion', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('8');
  });

  it('counts up from zero when motion is allowed and ends exactly on the value', async () => {
    motionAllowed();
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('0');

    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('8');
  });

  it('moves from the old value to a new one instead of restarting at zero', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();

    fixture.componentInstance.value.set(12);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('12');
  });
});
