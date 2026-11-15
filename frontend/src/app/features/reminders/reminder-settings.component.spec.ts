import { TestBed } from '@angular/core/testing';

import { SystemNotifier } from '../../core/notify/system-notifier';
import { ReminderSettingsComponent } from './reminder-settings.component';

function setup(permission: string, after = 'granted') {
  const notifier = { permission: vi.fn().mockReturnValue(permission), request: vi.fn().mockResolvedValue(after) };
  TestBed.configureTestingModule({ providers: [{ provide: SystemNotifier, useValue: notifier }] });
  const fixture = TestBed.createComponent(ReminderSettingsComponent);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, notifier };
}

describe('ReminderSettingsComponent', () => {
  it('always says what is announced and when, by priority', () => {
    const { el } = setup('granted');

    expect(el.textContent).toContain('cao trước 15 phút');
    expect(el.textContent).toContain('trung bình trước 5 phút');
    expect(el.textContent).toContain('thấp thì không nhắc');
  });

  it('says notifications are on, with nothing to press', () => {
    const { el } = setup('granted');

    expect(el.textContent).toContain('Thông báo đang bật.');
    expect(el.querySelector('button')).toBeNull();
  });

  it('offers a button when the browser has not been asked yet, and shows the answer', async () => {
    const { el, fixture, notifier } = setup('default', 'granted');

    el.querySelector('button')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(notifier.request).toHaveBeenCalledTimes(1);
    expect(el.textContent).toContain('Thông báo đang bật.');
  });

  it('explains how to unblock notifications when they were refused', () => {
    const { el } = setup('denied');

    expect(el.textContent).toContain('đang bị chặn');
    expect(el.querySelector('button')).toBeNull();
  });

  it('says so on a device that cannot show notifications', () => {
    expect(setup('unsupported').el.textContent).toContain('không hỗ trợ thông báo');
  });

  it('mentions the menu bar only inside the Mac app', () => {
    expect(setup('granted').el.textContent).not.toContain('thanh menu');

    TestBed.resetTestingModule();
    vi.stubGlobal('taskflowDesktop', { showWindow: () => undefined });
    expect(setup('granted').el.textContent).toContain('thanh menu');
    vi.unstubAllGlobals();
  });
});
