import { TestBed } from '@angular/core/testing';
import { NzModalService } from 'ng-zorro-antd/modal';
import { Subject } from 'rxjs';

import { ConfirmService } from './confirm.service';

function setup() {
  const afterClose = new Subject<void>();
  const confirm = vi.fn().mockReturnValue({ afterClose });
  TestBed.configureTestingModule({ providers: [{ provide: NzModalService, useValue: { confirm } }] });
  return { service: TestBed.inject(ConfirmService), confirm, afterClose };
}

describe('ConfirmService.confirmDelete', () => {
  it('names the task, warns it is permanent, and focuses the safe button', () => {
    const { service, confirm } = setup();

    void service.confirmDelete('Viết báo cáo');

    const options = confirm.mock.calls[0][0];
    expect(options.nzTitle).toBe('Xóa “Viết báo cáo”?');
    expect(options.nzContent).toBe('Công việc sẽ bị xóa vĩnh viễn.');
    expect(options.nzOkText).toBe('Xóa');
    expect(options.nzOkDanger).toBe(true);
    expect(options.nzCancelText).toBe('Giữ lại');
    expect(options.nzAutofocus).toBe('cancel');
  });

  it('resolves true only after the user confirms and the dialog closes', async () => {
    const { service, confirm, afterClose } = setup();

    const result = service.confirmDelete('x');
    confirm.mock.calls[0][0].nzOnOk();
    afterClose.next();

    await expect(result).resolves.toBe(true);
  });

  it('resolves false when the dialog closes without confirming (Esc, close button, "Giữ lại")', async () => {
    const { service, afterClose } = setup();

    const result = service.confirmDelete('x');
    afterClose.next();

    await expect(result).resolves.toBe(false);
  });

  it('does not resolve before the dialog has closed', async () => {
    const { service, confirm } = setup();
    let settled = false;

    void service.confirmDelete('x').then(() => (settled = true));
    confirm.mock.calls[0][0].nzOnOk();
    await Promise.resolve();

    expect(settled).toBe(false);
  });
});
